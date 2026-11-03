-- 20261103e_phuong_tai_diem_tra_ten_p_lat — RPC `phuong_tai_diem` trả tên tham số về `p_lat` / `p_lng` (SRS-5.1zzzzzzz360).
-- 20261103d đổi sang `lat` / `lng` cho khớp lõi #277; nhưng #280 (đã gộp, đã cài VPS) sửa lõi gọi `{"p_lat", "p_lng"}` và khoá chữ ký đó bằng
-- `test_phuong_he_thong_tu_tra_359.py`. PostgREST khớp RPC THEO TÊN tham số → sau 20261103d mọi lượt gọi của lõi lỗi (bot rơi về đường cũ).
-- Trả về chữ ký gốc của 20261103b; cùng thân, cùng quyền.
begin;

drop function if exists public.phuong_tai_diem(double precision, double precision);

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

revoke all on function public.phuong_tai_diem(double precision, double precision) from public, anon, authenticated;
grant execute on function public.phuong_tai_diem(double precision, double precision) to service_role;

commit;
