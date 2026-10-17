-- 04/10/2026 (chủ dự án: "sửa /admin trước đi"; docs/07 SRS-5.1zv). /admin quy chữ-máy ra đô bằng MỘT bảng giá (Opus, 5/25)
-- cho cả sổ `bot_usage`, trong khi sổ đó gộp token của mọi model: Sonnet 4.6, Haiku 4.5 (đổi 03/10), và cả Groq/Gemini
-- (đường dự phòng ghi qua cùng `cong_token`). Số đô trên /admin cao hơn thật 1,7× với Sonnet, 5× với Haiku, và tính tiền
-- cho cả lượt Groq/Gemini vốn không đụng credit Anthropic.
--
-- Sửa gốc: sổ token ghi theo (ngày, model). `bot_usage` GIỮ NGUYÊN (trần lượt `bump_model_quota`, `quota_tieu_hao`,
-- `token_hom_nay` vẫn đọc ở đó); thêm bảng `bot_usage_model` và `cong_token` nhận thêm `p_model` (null → 'khac').
-- Dòng cũ không có model: không đoán — /admin hiện "chưa rõ model", không quy ra đô.

create table if not exists public.bot_usage_model (
  day date not null default ((now() at time zone 'Asia/Ho_Chi_Minh'))::date,
  model text not null,
  in_tokens bigint not null default 0,
  out_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  constraint bot_usage_model_pkey primary key (day, model)
);
comment on table public.bot_usage_model is
  '[HỆ THỐNG] Chữ-máy (token) theo NGÀY (giờ VN) × MODEL — /admin quy ra đô bằng bảng giá theo model (lib/gia-model.ts). '
  'Ghi qua cong_token(p_model); đường dự phòng Groq/Gemini ghi model dạng "Groq:…"/"Gemini:…" (không tốn credit Anthropic). '
  '`khac` = lượt không rõ model (bản cũ). Sổ gộp theo ngày vẫn là bot_usage (trần lượt, quota_tieu_hao).';
comment on column public.bot_usage_model.model is 'ID model thật trả về (vd claude-haiku-4-5-20251001), hoặc "Groq:<model>" / "Gemini:<model>", hoặc "khac".';

-- View MỚI/bảng MỚI ở project này mặc định LỘ (alter default privileges cấp sẵn cho anon/authenticated) → revoke trước.
alter table public.bot_usage_model enable row level security;
revoke all on public.bot_usage_model from public, anon, authenticated;
grant select on public.bot_usage_model to authenticated;
grant all on public.bot_usage_model to service_role;
drop policy if exists bot_usage_model_admin_read on public.bot_usage_model;
create policy bot_usage_model_admin_read on public.bot_usage_model
  for select to authenticated
  using (exists (select 1 from public.admins a where a.email = ((select auth.jwt()) ->> 'email')));

-- Đổi chữ ký: DROP bản 4 tham số trước, kẻo thành hai hàm trùng tên (PostgREST PGRST203; cổng soat-db đỏ).
-- Gọi với 4 tham số cũ vẫn chạy (p_model mặc định null → 'khac').
drop function if exists public.cong_token(bigint, bigint, bigint, bigint);
create or replace function public.cong_token(
  p_in bigint default 0, p_out bigint default 0, p_cache_write bigint default 0, p_cache_read bigint default 0,
  p_model text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_model text := coalesce(nullif(left(trim(p_model), 80), ''), 'khac');
begin
  insert into bot_usage (day, model_calls, in_tokens, out_tokens, cache_write_tokens, cache_read_tokens)
  values (v_day, 0, coalesce(p_in,0), coalesce(p_out,0), coalesce(p_cache_write,0), coalesce(p_cache_read,0))
  on conflict (day) do update set
    in_tokens          = bot_usage.in_tokens          + coalesce(p_in,0),
    out_tokens         = bot_usage.out_tokens         + coalesce(p_out,0),
    cache_write_tokens = bot_usage.cache_write_tokens + coalesce(p_cache_write,0),
    cache_read_tokens  = bot_usage.cache_read_tokens  + coalesce(p_cache_read,0);
  insert into bot_usage_model (day, model, in_tokens, out_tokens, cache_write_tokens, cache_read_tokens)
  values (v_day, v_model, coalesce(p_in,0), coalesce(p_out,0), coalesce(p_cache_write,0), coalesce(p_cache_read,0))
  on conflict (day, model) do update set
    in_tokens          = bot_usage_model.in_tokens          + coalesce(p_in,0),
    out_tokens         = bot_usage_model.out_tokens         + coalesce(p_out,0),
    cache_write_tokens = bot_usage_model.cache_write_tokens + coalesce(p_cache_write,0),
    cache_read_tokens  = bot_usage_model.cache_read_tokens  + coalesce(p_cache_read,0);
exception when others then
  return;
end $$;
comment on function public.cong_token(bigint, bigint, bigint, bigint, text) is
  'Cộng chữ-máy một lượt gọi model vào bot_usage (theo ngày) VÀ bot_usage_model (theo ngày × model). p_model null → ''khac''. Nuốt lỗi: đồng hồ hỏng không được làm hỏng lượt trả lời khách.';
revoke all on function public.cong_token(bigint, bigint, bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.cong_token(bigint, bigint, bigint, bigint, text) to service_role;
