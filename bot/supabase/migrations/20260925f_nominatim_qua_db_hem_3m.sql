-- 20260925f — Nominatim gọi QUA DB (edge function bị chặn "Access denied"); hẻm từ 3m là hẻm xe hơi (FR-227).
--
-- (a) Sổ lỗi 24–25/09: mọi câu tra `geocode-listings` → "Unexpected token 'A', "Access den"… is not valid JSON" — Nominatim
-- chặn dải IP của Supabase Edge. Cùng câu tra gọi từ DB (pg_net) và từ máy khác thì 200 bình thường (đo 25/09). Chủ dự án
-- 25/09/2026: "Tra toạ độ OSM (Nominatim)". Edge function nay nhờ DB gọi: RPC `tra_nominatim` dùng extension `http` (đồng
-- bộ), URL khoá cứng về nominatim.openstreetmap.org, chỉ `service_role` gọi được; nhịp 1,1 s/lần vẫn do edge function giữ
-- (chính sách Nominatim: ≤ 1 req/s, có User-Agent).
create extension if not exists http with schema extensions;

create or replace function public.tra_nominatim(p_q text, p_viewbox text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $f$
declare res extensions.http_response; u text;
begin
  if coalesce(btrim(p_q), '') = '' or length(p_q) > 200 then return null; end if;
  if p_viewbox is not null and p_viewbox !~ '^[0-9.,-]+$' then raise exception 'viewbox không hợp lệ'; end if;
  u := 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn'
       || case when p_viewbox is not null then '&viewbox=' || p_viewbox || '&bounded=1' else '' end
       || '&q=' || extensions.urlencode(p_q);
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '15');
  res := extensions.http(('GET', u, array[extensions.http_header('User-Agent', 'nhadatcc-geocoder/1.0 (admin.buyerside@nhadat.cc)')], null, null)::extensions.http_request);
  if res.status <> 200 then raise exception 'nominatim HTTP %: %', res.status, left(res.content, 120); end if;
  return res.content::jsonb;
end $f$;
revoke all on function public.tra_nominatim(text, text) from public, anon, authenticated;
grant execute on function public.tra_nominatim(text, text) to service_role;
comment on function public.tra_nominatim(text, text) is
  '[HỆ THỐNG] FR-227: tra toạ độ Nominatim/OSM thay cho geocode-listings (IP edge bị chặn). Chỉ service_role; URL khoá cứng; ≤ 1 req/s do nơi gọi giữ.';

-- (b) Chủ dự án 25/09/2026: "hẻm 3m bạn muốn xếp là hẻm xe hơi đi, đó là khi khách ko nói rõ, còn nếu khách nói hxh, hxm thì
-- nhận luôn". Ngưỡng số mét → loại đường vào: 3m trở lên là hẻm xe hơi (trước 3,5m). Chữ khách nói rõ (hxh / hxm / xe hơi
-- không vào) vẫn xét TRƯỚC số mét như cũ. Thay chữ trong định nghĩa đang chạy; chữ không thấy thì dừng.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.boc_thong_so(text, text)'::regprocedure);
  if strpos(d, 'when m[1]::numeric >= 3.5 then ''hem_xe_hoi''') = 0 then raise exception 'boc_thong_so: không thấy ngưỡng 3.5'; end if;
  execute replace(d, 'when m[1]::numeric >= 3.5 then ''hem_xe_hoi''', 'when m[1]::numeric >= 3 then ''hem_xe_hoi''');

  d := pg_get_functiondef('public.listing_facts_sync_cols()'::regprocedure);
  if strpos(d, 'when v_num >= 3.5 then ''hem_xe_hoi''') = 0 then raise exception 'listing_facts_sync_cols: không thấy ngưỡng 3.5'; end if;
  execute replace(d, 'when v_num >= 3.5 then ''hem_xe_hoi''', 'when v_num >= 3 then ''hem_xe_hoi''');
end $$;
