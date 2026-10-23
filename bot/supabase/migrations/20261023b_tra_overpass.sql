-- 20261023b — tra_overpass: gọi Overpass TỪ DB (extension http), như tra_nominatim (20260925f).
-- Ca gốc 23/10/2026: sổ lỗi `geocode-listings` lặp mỗi tick 10 phút "overpass: N tin không nạp được tiện ích, mọi máy hỏng —
-- openstreetmap.fr → HTTP 403; overpass-api.de → HTTP 406; maps.mail.ru → 504; private.coffee → quá giờ". Máy công cộng chặn dải IP
-- của edge function (cùng nguyên nhân Nominatim 25/09, FR-227). Đo 23/10 từ chính DB: overpass.openstreetmap.fr trả 200 kèm dữ liệu
-- (1,3 KB quanh Q.8) trong khi từ edge cùng máy đó trả 403. Hàm chỉ nhận đúng bốn máy trong danh sách (không thành cổng gọi URL tuỳ ý
-- từ DB), chỉ service_role gọi được (edge function dùng service client).
create or replace function public.tra_overpass(p_q text, p_may text, p_cho_giay integer default 25)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare res extensions.http_response;
begin
  if coalesce(btrim(p_q), '') = '' or length(p_q) > 4000 then return null; end if;
  if p_may is null or p_may not in (
       'https://overpass.openstreetmap.fr/api/interpreter',
       'https://overpass-api.de/api/interpreter',
       'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
       'https://overpass.private.coffee/api/interpreter') then
    raise exception 'máy Overpass không nằm trong danh sách';
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', greatest(1, least(coalesce(p_cho_giay, 25), 35))::text);
  res := extensions.http(('POST', p_may,
           array[extensions.http_header('User-Agent', 'nhadatcc-geocoder/1.0 (admin.buyerside@nhadat.cc)'),
                 extensions.http_header('Accept', 'application/json')],
           'application/x-www-form-urlencoded', 'data=' || extensions.urlencode(p_q))::extensions.http_request);
  if res.status <> 200 then raise exception 'overpass HTTP %: %', res.status, left(res.content, 120); end if;
  return res.content::jsonb;
end $function$;

revoke all on function public.tra_overpass(text, text, integer) from public, anon, authenticated;
grant execute on function public.tra_overpass(text, text, integer) to service_role;

comment on function public.tra_overpass(text, text, integer) is
  '[HỆ THỐNG] Gọi một máy Overpass (danh sách cố định) từ DB, trả JSON; geocode-listings dùng vì máy công cộng chặn IP edge. SRS-5.1zzzzzzz152.';
