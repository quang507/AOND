-- 04/10/2026 (chủ dự án: "làm 1 2 với 4 đi" — đo trước khi cắt; docs/07 SRS-5.1zw). Sổ theo model (20261004a) có chữ-máy
-- nhưng chưa có SỐ LƯỢT gọi, nên /admin không tính được đô/lượt theo model (bot_usage.model_calls là lượt gộp cả ngày).
-- Thêm `calls`: mỗi lần cong_token = một lượt gọi model đã trả về. Chữ ký cong_token GIỮ NGUYÊN (5 tham số) → create or replace.
alter table public.bot_usage_model add column if not exists calls integer not null default 0;
comment on column public.bot_usage_model.calls is 'Số lượt gọi model đã trả về trong ngày (mỗi cong_token = 1). /admin: đô/lượt và tỷ lệ đọc cache THEO MODEL.';

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
  insert into bot_usage_model (day, model, calls, in_tokens, out_tokens, cache_write_tokens, cache_read_tokens)
  values (v_day, v_model, 1, coalesce(p_in,0), coalesce(p_out,0), coalesce(p_cache_write,0), coalesce(p_cache_read,0))
  on conflict (day, model) do update set
    calls              = bot_usage_model.calls + 1,
    in_tokens          = bot_usage_model.in_tokens          + coalesce(p_in,0),
    out_tokens         = bot_usage_model.out_tokens         + coalesce(p_out,0),
    cache_write_tokens = bot_usage_model.cache_write_tokens + coalesce(p_cache_write,0),
    cache_read_tokens  = bot_usage_model.cache_read_tokens  + coalesce(p_cache_read,0);
exception when others then
  return;
end $$;
