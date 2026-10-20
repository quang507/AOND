-- 20261020d — Câu chuẩn: chủ dự án / tester chấm điểm và sửa tay từng câu bot trả lời, kèm ngữ cảnh (SRS-5.1zzzzzzz88).
-- Chủ dự án 20/10/2026: "bắn lên chỗ câu chuẩn cách bot đã ghi để tôi sửa tay từ từ, và chấm điểm nữa phải có trong ngữ cảnh".
-- Mỗi dòng CHÉP ngữ cảnh (8 tin trước câu bot) lúc đưa vào — xoá khách / dọn dữ liệu thử thì câu chuẩn vẫn còn đủ để đọc.
-- Lõi Python đọc các câu đã sửa / đã chấm làm ví dụ trong prompt (bảng `mau_cau` cũ gỡ 18/10 vì lõi không đọc — bảng này lõi đọc).

create table if not exists public.cau_chuan (
  id uuid primary key default gen_random_uuid(),
  message_id uuid unique references public.messages(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  ngu_canh jsonb not null default '[]'::jsonb,
  cau_bot text not null,
  cau_chuan text,
  diem smallint check (diem between 1 and 5),
  ghi_chu text,
  nguon text not null default 'that' check (nguon in ('that', 'ban_thu')),
  dung_lam_mau boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cau_chuan is '[BOT & HÀNG ĐỢI] Câu chuẩn: câu bot đã trả lời + ngữ cảnh chép lúc đưa vào; người chấm điểm 1–5, sửa tay câu chuẩn, ghi chú. Lõi Python đọc dòng đã sửa / đã chấm (dung_lam_mau) làm ví dụ trong prompt. Chỉ admin.';
comment on column public.cau_chuan.ngu_canh is 'Tối đa 8 tin TRƯỚC câu bot, cũ → mới: [{ai: buyer|seller|bot|human, noi_dung}]. Chép, không tham chiếu.';
comment on column public.cau_chuan.cau_bot is 'Nguyên văn câu bot đã gửi.';
comment on column public.cau_chuan.cau_chuan is 'Câu người chấm sửa tay — câu bot NÊN nói trong ngữ cảnh đó. Trống = chưa sửa.';
comment on column public.cau_chuan.diem is 'Điểm người chấm cho câu bot: 1 (sai / hại) … 5 (chuẩn).';
comment on column public.cau_chuan.nguon is 'that = khách thật; ban_thu = Zalo ID thử (la_id_thu).';
comment on column public.cau_chuan.dung_lam_mau is 'Bỏ chọn thì lõi không dùng dòng này làm ví dụ.';

create index if not exists cau_chuan_mau_idx on public.cau_chuan (updated_at desc) where dung_lam_mau;

create or replace function public.cau_chuan_cap_nhat_luc() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists cau_chuan_cap_nhat_luc on public.cau_chuan;
create trigger cau_chuan_cap_nhat_luc before update on public.cau_chuan for each row execute function public.cau_chuan_cap_nhat_luc();

alter table public.cau_chuan enable row level security;
revoke all on public.cau_chuan from anon, authenticated;
grant select, insert, update, delete on public.cau_chuan to authenticated;
drop policy if exists cau_chuan_admin on public.cau_chuan;
create policy cau_chuan_admin on public.cau_chuan for all to authenticated using (public.la_admin()) with check (public.la_admin());

-- Đưa các câu bot vào bảng kèm ngữ cảnh. Chạy với quyền người gọi (RLS admin trên messages / cau_chuan); service_role của script bắn thử
-- cũng gọi được. Câu đã có thì chỉ làm mới ngữ cảnh, không đụng điểm / câu sửa.
create or replace function public.cau_chuan_tu_tin(p_message_ids uuid[]) returns integer
language sql set search_path = public as $$
  with vao as (
    insert into public.cau_chuan (message_id, conversation_id, ngu_canh, cau_bot, nguon)
    select m.id, m.conversation_id,
           coalesce((select jsonb_agg(jsonb_build_object('ai', t.sender, 'noi_dung', t.body) order by t.seq)
                     from (select p.sender, p.body, p.seq from public.messages p
                           where p.conversation_id = m.conversation_id and p.seq < m.seq
                           order by p.seq desc limit 8) t), '[]'::jsonb),
           m.body,
           case when public.la_id_thu(coalesce(s.zalo_user_id, b.zalo_user_id)) then 'ban_thu' else 'that' end
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    left join public.sellers s on s.id = c.seller_id
    left join public.buyers b on b.id = c.buyer_id
    where m.id = any(p_message_ids) and m.sender = 'bot' and coalesce(m.body, '') <> ''
    on conflict (message_id) do update set ngu_canh = excluded.ngu_canh
    returning 1
  )
  select count(*)::integer from vao
$$;
comment on function public.cau_chuan_tu_tin(uuid[]) is 'Đưa câu bot (theo id tin) vào cau_chuan kèm 8 tin ngữ cảnh trước nó. Trả số dòng.';

create or replace function public.cau_chuan_tu_zalo(p_zalo text) returns integer
language sql set search_path = public as $$
  select public.cau_chuan_tu_tin(coalesce(array_agg(m.id), '{}'))
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.sellers s on s.id = c.seller_id
  left join public.buyers b on b.id = c.buyer_id
  where m.sender = 'bot' and p_zalo in (s.zalo_user_id, b.zalo_user_id)
$$;
comment on function public.cau_chuan_tu_zalo(text) is 'Đưa MỌI câu bot của một Zalo ID vào cau_chuan (script bắn thử gọi trước khi dọn).';

revoke all on function public.cau_chuan_tu_tin(uuid[]) from public, anon;
revoke all on function public.cau_chuan_tu_zalo(text) from public, anon;
grant execute on function public.cau_chuan_tu_tin(uuid[]) to authenticated;
grant execute on function public.cau_chuan_tu_zalo(text) to authenticated;
