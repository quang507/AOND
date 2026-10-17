-- 20260909c — MẪU CÂU CHUẨN: tài sản huấn luyện giọng bot (FR-180, 09/09/2026)
--
-- Chủ dự án 09/09/2026: "log mọi lượt chat thật, mỗi ngày anh hoặc sếp sửa tay
-- câu bot thành câu mong muốn. Lưu thành cặp ngữ cảnh → câu chuẩn. Đây là tài
-- sản dùng cho cả ví dụ mẫu trong prompt lẫn fine-tune sau. Đủ 300 mẫu thì thử
-- Qwen2.5-3B/7B bằng Unsloth trên 4060, ưng thì Gemini Flash tuning hoặc VPS GPU."
--
-- Log chat thật ĐÃ CÓ (messages + so.hoi_thoai). Thiếu là chỗ để người sửa và
-- chỗ lưu cặp. Thiết kế:
--   · `mau_cau`: mỗi dòng = một câu bot THẬT (message_id) + ngữ cảnh 8 lượt
--     trước đó (jsonb, chụp lúc sửa — vì reset_nguoi_test / dọn dữ liệu có thể
--     xoá messages, FK để `set null` cho mẫu sống lâu hơn hội thoại) + câu bot
--     gốc + câu chuẩn do người sửa + dùng làm gì (vi_du / fine_tune / ca_hai / bo).
--   · Admin (bảng `admins`) đọc/ghi qua RLS `la_admin()`; anon không thấy;
--     service_role (bot, script xuất) toàn quyền.
--   · `mau_cau_fewshot(phia, n)`: bot lấy N mẫu chuẩn mới nhất dán vào system
--     prompt (cache 60 s trong chat-reply) — mẫu vừa sửa hôm nay, mai bot đã bắt
--     chước. Đây là đường "ví dụ mẫu trong prompt".
--   · `ngu_canh_tin(message_id)`: trang /admin/mau-cau và script xuất dùng để
--     dựng ngữ cảnh đúng một cách.
--   · `so.mau_cau`: đọc bằng mắt người trong Table Editor (schema `so`).
-- Đường fine-tune: `scripts/xuat-mau-cau.mjs` → JSONL ShareGPT (Unsloth) và
-- Gemini; `train/` có script Qwen2.5 cho 4060.

create table if not exists public.mau_cau (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid references public.messages(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  phia            text not null check (phia in ('ban', 'mua')),
  ngu_canh        jsonb not null default '[]'::jsonb,
  cau_bot         text not null,
  cau_chuan       text not null,
  ghi_chu         text,
  dung_lam        text not null default 'ca_hai'
                  check (dung_lam in ('vi_du', 'fine_tune', 'ca_hai', 'bo')),
  nguoi_sua       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (message_id)
);

comment on table public.mau_cau is
  '[BOT & HÀNG ĐỢI] FR-180: MẪU CÂU CHUẨN — câu bot thật (message_id) mà anh/sếp đã sửa tay thành câu mong muốn, kèm ngữ cảnh 8 lượt trước. Tài sản huấn luyện: bot lấy làm ví dụ mẫu trong prompt (mau_cau_fewshot) và xuất JSONL để fine-tune (scripts/xuat-mau-cau.mjs). Mục tiêu đầu: 300 mẫu.';
comment on column public.mau_cau.message_id is 'Tin nhắn bot gốc trong messages; set null khi tin bị xoá (reset test) — mẫu vẫn giữ.';
comment on column public.mau_cau.phia is 'ban = hội thoại người bán, mua = người mua.';
comment on column public.mau_cau.ngu_canh is 'Mảng [{ai, noi_dung, luc}] tối đa 8 lượt TRƯỚC câu bot, chụp lúc sửa (ngu_canh_tin).';
comment on column public.mau_cau.cau_bot is 'Câu bot đã nói thật (để so trước/sau).';
comment on column public.mau_cau.cau_chuan is 'Câu mong muốn do người sửa — đây là nhãn huấn luyện.';
comment on column public.mau_cau.dung_lam is 'vi_du = chỉ dán vào prompt · fine_tune = chỉ xuất JSONL · ca_hai (mặc định) · bo = loại.';
comment on column public.mau_cau.nguoi_sua is 'Email admin đã sửa (auth.jwt).';

create index if not exists mau_cau_phia_moi_idx on public.mau_cau (phia, updated_at desc)
  where dung_lam in ('vi_du', 'ca_hai');

create or replace function public.mau_cau_cham_moc()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_mau_cau_cham_moc on public.mau_cau;
create trigger trg_mau_cau_cham_moc before update on public.mau_cau
  for each row execute function public.mau_cau_cham_moc();

-- Quyền: default privileges của project cấp sẵn cho anon/authenticated → thu hồi
-- TRƯỚC (CLAUDE.md §6), rồi RLS + la_admin() quyết.
alter table public.mau_cau enable row level security;
revoke all on public.mau_cau from anon, authenticated;
grant select, insert, update, delete on public.mau_cau to authenticated;
grant all on public.mau_cau to service_role;
drop policy if exists mau_cau_admin_all on public.mau_cau;
create policy mau_cau_admin_all on public.mau_cau
  for all to authenticated using (public.la_admin()) with check (public.la_admin());

-- ── Ngữ cảnh của một câu bot: 8 lượt trước trong cùng hội thoại ──────────────
create or replace function public.ngu_canh_tin(p_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'ai', x.sender, 'noi_dung', x.body,
           'luc', to_char(x.created_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')
         ) order by x.seq), '[]'::jsonb)
    from (
      select m2.sender, m2.body, m2.created_at, m2.seq
        from public.messages m
        join public.messages m2 on m2.conversation_id = m.conversation_id and m2.seq < m.seq
       where m.id = p_message_id
       order by m2.seq desc
       limit 8
    ) x
$$;
revoke all on function public.ngu_canh_tin(uuid) from public, anon;
grant execute on function public.ngu_canh_tin(uuid) to authenticated, service_role;
comment on function public.ngu_canh_tin(uuid) is
  'FR-180: 8 lượt trước một câu bot, [{ai, noi_dung, luc}] theo thứ tự thời gian. Trang /admin/mau-cau chụp vào mau_cau.ngu_canh lúc sửa. Chỉ đọc; authenticated gọi được nhưng chỉ có id tin nhắn đã thấy qua RLS admin mới có nghĩa.';

-- ── Ví dụ mẫu cho prompt: N câu chuẩn mới nhất theo phía ─────────────────────
create or replace function public.mau_cau_fewshot(p_phia text, p_n int default 12)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select string_agg(
           format('- Khách: "%s" → Thái: "%s"',
             left(regexp_replace(coalesce((
               select y->>'noi_dung' from jsonb_array_elements(x.ngu_canh) with ordinality as t(y, i)
                where y->>'ai' <> 'bot' order by i desc limit 1), '(không có câu khách)'), '\s+', ' ', 'g'), 200),
             regexp_replace(x.cau_chuan, '\s+', ' ', 'g')),
           E'\n' order by x.updated_at desc)
    from (
      select ngu_canh, cau_chuan, updated_at
        from public.mau_cau
       where phia = p_phia and dung_lam in ('vi_du', 'ca_hai')
       order by updated_at desc
       limit greatest(1, least(p_n, 40))
    ) x
$$;
revoke all on function public.mau_cau_fewshot(text, int) from public, anon, authenticated;
grant execute on function public.mau_cau_fewshot(text, int) to service_role;
comment on function public.mau_cau_fewshot(text, int) is
  'FR-180: N mẫu chuẩn mới nhất của một phía (ban/mua) dạng "- Khách: … → Thái: …" để chat-reply dán vào system prompt (cache 60 s). Rỗng khi chưa có mẫu.';

-- ── so.mau_cau: đọc bằng mắt người ──────────────────────────────────────────
create or replace view so.mau_cau with (security_invoker = true) as
select
  to_char(m.updated_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') as luc,
  case m.phia when 'ban' then 'bán' else 'mua' end                      as phia,
  (select y->>'noi_dung' from jsonb_array_elements(m.ngu_canh) with ordinality as t(y, i)
    where y->>'ai' <> 'bot' order by i desc limit 1)                       as khach_noi,
  m.cau_bot                                                               as bot_da_noi,
  m.cau_chuan                                                             as cau_chuan,
  m.dung_lam                                                              as dung_lam,
  m.nguoi_sua                                                             as nguoi_sua,
  m.ghi_chu                                                               as ghi_chu,
  m.id
from public.mau_cau m
order by m.updated_at desc;
revoke all on so.mau_cau from anon, authenticated;
comment on view so.mau_cau is 'FR-180: mẫu câu chuẩn đọc một dòng — khách nói gì, bot đã nói gì, câu chuẩn là gì. Ruột ở public.mau_cau.';
