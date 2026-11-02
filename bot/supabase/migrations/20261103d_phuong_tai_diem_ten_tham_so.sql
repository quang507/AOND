-- 20261103d_phuong_tai_diem_ten_tham_so — RPC `phuong_tai_diem` đổi tên tham số `p_lat` / `p_lng` → `lat` / `lng` (SRS-5.1zzzzzzz360).
-- Lõi (#277, `dia_danh.py`) gọi `rpc/phuong_tai_diem` với `{"lat": …, "lng": …}`; PostgREST khớp RPC THEO TÊN tham số nên mọi lượt
-- gọi lỗi "không tìm thấy hàm" và bot rơi về đường cũ — ranh giới đã nạp (167 / 168) không được dùng. Postgres không cho đổi tên tham số
-- bằng CREATE OR REPLACE → bỏ rồi tạo lại, cùng thân, cùng quyền.
begin;

drop function if exists public.phuong_tai_diem(double precision, double precision);

CREATE OR REPLACE FUNCTION public.phuong_tai_diem(lat double precision, lng double precision)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select w.ten_day_du
    from public.ranh_gioi_phuong r
    join public.wards w on w.ten = r.ten
   where phuong_tai_diem.lat is not null and phuong_tai_diem.lng is not null
     and phuong_tai_diem.lat between r.min_lat and r.max_lat
     and phuong_tai_diem.lng between r.min_lng and r.max_lng
     and public.diem_trong_vong(phuong_tai_diem.lat, phuong_tai_diem.lng, r.vong)
   order by (r.max_lat - r.min_lat) * (r.max_lng - r.min_lng)   -- hai đa giác chồng (dữ liệu lệch) → lấy phường nhỏ hơn
   limit 1
$function$
;

revoke all on function public.phuong_tai_diem(double precision, double precision) from public, anon, authenticated;
grant execute on function public.phuong_tai_diem(double precision, double precision) to service_role;

commit;
