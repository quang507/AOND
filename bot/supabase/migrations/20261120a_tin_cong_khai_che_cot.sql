-- 20/11/2026 (audit P0-1, SRS-5.1zzzzzzz529): anon đọc được MỌI cột của `listings` bằng khoá công khai (description nguyên bản còn SĐT,
-- location_raw có số nhà, lat/lng chính xác tới căn, seller_id, boc_tach có trích nguyên văn lời chủ). sanitizeDescription() chỉ chạy lúc
-- dựng trang nên gọi thẳng /rest/v1/listings là lấy được hết. Sửa: web đọc view `tin_cong_khai` (đã che), anon thôi đọc bảng gốc.

-- 1. Bỏ số nhà đầu chuỗi địa chỉ + che SĐT lọt trong địa chỉ. Đã thử: "12 Hoàng Hoa Thám"→"Hoàng Hoa Thám", "Số 100/9 Lê Lợi"→"Lê Lợi",
--    "HXH 123 TBT"→"HXH TBT", "Nhà số 7 THĐ"→"THĐ", "Căn 12B Sunrise"→"Sunrise"; "Hẻm 45 PXL" giữ (số hẻm, không phải số nhà).
create or replace function public.an_so_nha(p text) returns text
language sql immutable set search_path to 'public' as $$
  select nullif(btrim(public.che_sdt(regexp_replace(coalesce(p, ''),
    '^\s*(hxh|mtkd|mt)?\s*((s[ốo]|nh[àa]|c[ăa]n)\s*)*\d+[0-9A-Za-z]*(/[0-9A-Za-z]+)*\s*[,\-]?\s*', '\1 ', 'i'))), '')
$$;

-- 2. View công khai: chỉ tin đang hiện (khớp policy anon_read_listings), cột an toàn; mô tả che SĐT; toạ độ làm tròn 3 số lẻ (~110 m);
--    boc_tach chỉ giữ ô của khối "Đã xác minh" (danh sách trắng lib/thong-tin-xac-minh.ts O_XAC_MINH). Không có seller_id, nhung, cột nội bộ.
create or replace view public.tin_cong_khai as
select l.id, l.code, l.legacy_code, l.deal, l.district, l.ward, l.street,
       public.an_so_nha(l.location_raw) as location_raw,
       l.area_m2, l.price_vnd, l.price_raw,
       public.che_sdt(l.description) as description,
       l.status, l.created_at, l.updated_at, l.project_id, l.unit_code, l.floor, l.direction, l.property_type,
       round(l.lat, 3) as lat, round(l.lng, 3) as lng,
       l.bedrooms, l.last_interest_at, l.access_type, l.alley_width_m, l.distance_to_street_m, l.frontage_m, l.length_m,
       l.rear_width_m, l.legal_area_m2, l.built_area_m2, l.floors, l.floors_text, l.bathrooms, l.legal_status, l.has_completion,
       l.planning_status, l.has_elevator, l.car_in_house, l.corner_lot, l.furnishing, l.year_built, l.negotiable, l.rent_income_vnd,
       l.price_per_m2_vnd, l.nhan, l.cung_can_id, l.can_kiem_chung,
       (select jsonb_object_agg(k, v) from jsonb_each(coalesce(l.boc_tach, '{}'::jsonb)) as e(k, v)
         where k = any (array['tinh_trang_ban_giao','hien_trang_su_dung','the_chap','thuong_luong','quy_hoach','chi_tieu_xay_dung',
           'yeu_to_ha_tang','tho_cu','lo_gioi_duong','thoi_han_su_dung','tang_toa','ban_cong_view','noi_that','phi_quan_ly','can_goc',
           'phi_gui_xe','chu_dau_tu_phan_khu','tien_do_xay_dung','chinh_sach_thanh_toan','phap_ly_du_an','thoi_gian_ban_giao','chiet_khau',
           'phi_chuyen_nhuong','chieu_cao_tran','tai_trong_san','tram_bien_ap','tieu_chuan_container','pccc','mat_tien','loi_di','vi_he_xe',
           'nganh_nghe','dien_tich_trang_thiet_bi','dien_nuoc_kd','so_phong','thang_may','gia_dien_nuoc','gio_giac','tien_ich_phong',
           'thoi_han_hd','muc_coc','truot_gia','thoi_gian_fitout','thue_phi','thanh_toan','hd_thue_con'])) as boc_tach
from public.listings l
where l.status in ('dang_ban', 'dang_quan_tam', 'da_coc', 'da_chot');

revoke all on public.tin_cong_khai from public, anon, authenticated;
grant select on public.tin_cong_khai to anon, authenticated;

-- 3. Hai RPC công khai trả địa chỉ gốc + toạ độ chính xác: che như view.
do $$
declare d text; m text;
begin
  d := pg_get_functiondef('public.ban_do_khung(double precision,double precision,double precision,double precision,text[])'::regprocedure);
  m := regexp_replace(d, 'l\.location_raw,', 'public.an_so_nha(l.location_raw) as location_raw,');
  m := regexp_replace(m, 'l\.lat,(\s*)l\.lng(\s+)from public\.listings l', 'round(l.lat, 3) as lat,\1round(l.lng, 3) as lng\2from public.listings l');
  if position('an_so_nha' in m) = 0 or position('round(l.lat, 3)' in m) = 0 then
    raise exception 'ban_do_khung: không thay được chuỗi (định nghĩa đã đổi?)';
  end if;
  execute m;

  d := pg_get_functiondef('public.doc_danh_sach(text)'::regprocedure);
  m := regexp_replace(d, '''location_raw'',(\s*)l\.location_raw', '''location_raw'',\1public.an_so_nha(l.location_raw)');
  if position('an_so_nha' in m) = 0 then raise exception 'doc_danh_sach: không thay được chuỗi'; end if;
  execute m;
end $$;

-- 4. Anon thôi đọc bảng gốc (web công khai đọc tin_cong_khai). authenticated giữ quyền: admin + "tin của tôi" vẫn đọc listings qua RLS.
revoke select on public.listings from anon;
