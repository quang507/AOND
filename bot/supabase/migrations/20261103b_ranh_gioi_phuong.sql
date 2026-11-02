-- 20261103b_ranh_gioi_phuong — ranh giới phường / xã MỚI để gắn toạ độ vào phường (SRS-5.1zzzzzzz360).
-- Quyết định chủ dự án 02/11/2026: "tên phường mới, tên phường cũ được tự động chuyển thành phường mới bằng cách gắn lên bản đồ để biết
-- chứ không hỏi khách". DB không có PostGIS; `wards` / `phuong_cu` / `duong` chỉ có lat/lng điểm → chưa biết toạ độ rơi vào phường nào.
--
-- Chọn tự viết điểm-trong-đa-giác (ray casting, PL/pgSQL) thay vì bật PostGIS: (1) bật PostGIS thêm hàng trăm đối tượng vào DB, `xuat_schema()`
-- / cổng soát `schema.sql` phải dạy lại; (2) bật extension là đổi hạ tầng cần chủ dự án duyệt riêng; (3) vài trăm đa giác, lọc trước bằng
-- khung bao (bbox) thì mỗi lượt chỉ thử vài đa giác — đủ nhanh. Đa giác lưu GeoJSON geometry (Polygon / MultiPolygon, toạ độ [lng, lat]).
--
-- RPC cho bot (SRS-359 gọi): `phuong_tai_diem(p_lat double precision, p_lng double precision) returns text` = `wards.ten_day_du` của phường có
-- đa giác chứa điểm; không có (chưa nạp đa giác / ngoài vùng) → null. Bảng còn RỖNG sau migration này: nạp đa giác là bước riêng, chờ nguồn
-- dữ liệu (xem mục SRS) — RPC trả null cho tới khi có, bot giữ cách cũ.
begin;

create table if not exists public.ranh_gioi_phuong (
  ten        text primary key references public.wards (ten) on delete cascade,
  vong       jsonb not null,                         -- GeoJSON geometry: {"type":"Polygon"|"MultiPolygon","coordinates":[...]} — [lng, lat]
  min_lat    double precision not null,
  max_lat    double precision not null,
  min_lng    double precision not null,
  max_lng    double precision not null,
  nguon      text not null,                          -- nơi lấy đa giác (vd "OSM relation 123456, tải 2026-11-03")
  giay_phep  text not null,                          -- vd "ODbL 1.0 — © OpenStreetMap contributors"
  nap_luc    timestamptz not null default now(),
  constraint ranh_gioi_phuong_kieu check (vong ->> 'type' in ('Polygon', 'MultiPolygon')),
  constraint ranh_gioi_phuong_khung check (min_lat <= max_lat and min_lng <= max_lng)
);
comment on table public.ranh_gioi_phuong is 'Đa giác ranh giới phường / xã MỚI (sau 2025) cho `phuong_tai_diem`. SRS-5.1zzzzzzz360. Khung bao lọc trước, ray casting thử sau.';
create index if not exists ranh_gioi_phuong_khung_idx on public.ranh_gioi_phuong (min_lat, max_lat, min_lng, max_lng);
alter table public.ranh_gioi_phuong enable row level security;
revoke all on public.ranh_gioi_phuong from anon, authenticated;
grant select, insert, update, delete on public.ranh_gioi_phuong to service_role;

-- Một vành (ring) GeoJSON: mảng [lng, lat]. Ray casting theo trục lng; điểm đúng trên cạnh có thể ra trong hoặc ngoài (chấp nhận được:
-- ranh giới phường là đường mảnh, căn nhà không nằm đúng trên vạch).
CREATE OR REPLACE FUNCTION public.diem_trong_vanh(p_lat double precision, p_lng double precision, p_vanh jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  n int := jsonb_array_length(p_vanh);
  i int; j int;
  xi double precision; yi double precision; xj double precision; yj double precision;
  trong boolean := false;
begin
  if n < 3 then return false; end if;
  j := n - 1;
  for i in 0 .. n - 1 loop
    xi := (p_vanh -> i ->> 0)::double precision; yi := (p_vanh -> i ->> 1)::double precision;
    xj := (p_vanh -> j ->> 0)::double precision; yj := (p_vanh -> j ->> 1)::double precision;
    if ((yi > p_lat) <> (yj > p_lat)) and (p_lng < (xj - xi) * (p_lat - yi) / (yj - yi) + xi) then
      trong := not trong;
    end if;
    j := i;
  end loop;
  return trong;
end $function$
;

-- Polygon: trong vành ngoài và không trong lỗ nào. MultiPolygon: trong ít nhất một Polygon.
CREATE OR REPLACE FUNCTION public.diem_trong_vong(p_lat double precision, p_lng double precision, p_vong jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select coalesce(bool_or(
           public.diem_trong_vanh(p_lat, p_lng, da -> 0)
           and not exists (select 1 from jsonb_array_elements(da) with ordinality l(vanh, k)
                            where k > 1 and public.diem_trong_vanh(p_lat, p_lng, l.vanh))), false)
    from jsonb_array_elements(case p_vong ->> 'type'
                                when 'Polygon' then jsonb_build_array(p_vong -> 'coordinates')
                                else p_vong -> 'coordinates' end) da
$function$
;

CREATE OR REPLACE FUNCTION public.phuong_tai_diem(p_lat double precision, p_lng double precision)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select w.ten_day_du
    from public.ranh_gioi_phuong r
    join public.wards w on w.ten = r.ten
   where p_lat is not null and p_lng is not null
     and p_lat between r.min_lat and r.max_lat
     and p_lng between r.min_lng and r.max_lng
     and public.diem_trong_vong(p_lat, p_lng, r.vong)
   order by (r.max_lat - r.min_lat) * (r.max_lng - r.min_lng)   -- hai đa giác chồng (dữ liệu lệch) → lấy phường nhỏ hơn
   limit 1
$function$
;

revoke all on function public.diem_trong_vanh(double precision, double precision, jsonb) from public, anon, authenticated;
revoke all on function public.diem_trong_vong(double precision, double precision, jsonb) from public, anon, authenticated;
revoke all on function public.phuong_tai_diem(double precision, double precision) from public, anon, authenticated;
grant execute on function public.diem_trong_vanh(double precision, double precision, jsonb) to service_role;
grant execute on function public.diem_trong_vong(double precision, double precision, jsonb) to service_role;
grant execute on function public.phuong_tai_diem(double precision, double precision) to service_role;

commit;
