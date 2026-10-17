-- 20260925h — `tra_nominatim` dùng chung cho ba chỗ gọi Nominatim từ edge (FR-227 a).
--
-- 20260925f chỉ phục vụ `geocode-listings` (limit 1, không chi tiết địa chỉ). Hai chỗ khác cũng gọi thẳng từ edge — cùng
-- dải IP bị chặn: tra PHƯỜNG từ tên đường (FR-209, cần `addressdetails=1&limit=10` và chờ ≤ 4 s để không trễ câu trả lời)
-- và tìm MỐC khách muốn ở gần (`_shared/tim-moc.ts`). Thêm tham số thay vì thêm hàm; bỏ chữ ký cũ để PostgREST không gặp
-- hai hàm cùng tên (PGRST203 — soát ở `soat_db_cong_khai`).
drop function if exists public.tra_nominatim(text, text);

create or replace function public.tra_nominatim(
  p_q text, p_viewbox text default null, p_limit integer default 1, p_chi_tiet boolean default false, p_cho_giay integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $f$
declare res extensions.http_response; u text;
begin
  if coalesce(btrim(p_q), '') = '' or length(p_q) > 200 then return null; end if;
  if p_viewbox is not null and p_viewbox !~ '^[0-9.,-]+$' then raise exception 'viewbox không hợp lệ'; end if;
  u := 'https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=vn'
       || '&limit=' || greatest(1, least(coalesce(p_limit, 1), 10))
       || case when p_chi_tiet then '&addressdetails=1' else '' end
       || case when p_viewbox is not null then '&viewbox=' || p_viewbox || '&bounded=1' else '' end
       || '&q=' || extensions.urlencode(p_q);
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', greatest(1, least(coalesce(p_cho_giay, 15), 20))::text);
  res := extensions.http(('GET', u, array[extensions.http_header('User-Agent', 'nhadatcc-geocoder/1.0 (admin.buyerside@nhadat.cc)')], null, null)::extensions.http_request);
  if res.status <> 200 then raise exception 'nominatim HTTP %: %', res.status, left(res.content, 120); end if;
  return res.content::jsonb;
end $f$;
revoke all on function public.tra_nominatim(text, text, integer, boolean, integer) from public, anon, authenticated;
grant execute on function public.tra_nominatim(text, text, integer, boolean, integer) to service_role;
comment on function public.tra_nominatim(text, text, integer, boolean, integer) is
  '[HỆ THỐNG] FR-227: tra Nominatim/OSM thay cho edge function (IP edge bị chặn) — geocode-listings, tra phường (FR-209), tìm mốc. Chỉ service_role; URL khoá cứng; limit 1..10; chờ 1..20 s; ≤ 1 req/s do nơi gọi giữ.';
