-- 20261014f — vá NULL ba trị trong `listing_missing_facts` của 20261014e (bắt bởi bot/tests/null-ba-tri.mjs, CI PR #520).
--
-- 20261014e thêm vế `rf.fact_key = 'phap_ly' AND l.property_type = 'chung_cu' AND du_an_co_phap_ly(l.project_id)` vào khối
-- NOT (…). Tin chưa rõ loại (property_type NULL) mà dự án đã có pháp lý → vế đó ra NULL → NOT NULL vẫn NULL → WHERE loại MỌI
-- dòng còn thiếu của tin đó (cùng lớp lỗi 20260925b). Đổi sang IS NOT DISTINCT FROM; phần còn lại của view giữ nguyên.

create or replace view public.listing_missing_facts as
 SELECT l.id AS listing_id,
    rf.fact_key,
    rf.priority,
    rf.nhom
   FROM listings l
     JOIN required_facts rf ON rf.property_type = COALESCE(l.property_type, 'chua_ro'::property_type) AND (rf.deal IS NULL OR rf.deal = l.deal)
     LEFT JOIN listing_facts lf ON lf.listing_id = l.id AND lf.question = rf.fact_key
  WHERE lf.id IS NULL AND rf.nhom <> 'phu'::text AND NOT (rf.fact_key = 'ket_cau'::text AND l.floors IS NOT NULL OR (rf.fact_key = ANY (ARRAY['do_rong_hem'::text, 'do_rong_duong'::text])) AND (l.alley_width_m IS NOT NULL OR l.access_type IS NOT NULL) OR rf.fact_key = 'phap_ly'::text AND l.legal_status IS NOT NULL OR rf.fact_key = 'phap_ly'::text AND l.property_type IS NOT DISTINCT FROM 'chung_cu'::property_type AND du_an_co_phap_ly(l.project_id) OR rf.fact_key = 'huong'::text AND l.direction IS NOT NULL OR rf.fact_key = 'so_phong_ngu'::text AND l.bedrooms IS NOT NULL OR rf.fact_key = 'so_wc'::text AND l.bathrooms IS NOT NULL OR rf.fact_key = 'tang'::text AND l.floor IS NOT NULL OR (rf.fact_key = ANY (ARRAY['dien_tich'::text, 'dien_tich_dat'::text, 'dien_tich_tim_tuong'::text])) AND l.area_m2 IS NOT NULL OR rf.fact_key = 'nam_xay'::text AND l.year_built IS NOT NULL OR rf.fact_key = 'noi_that'::text AND l.furnishing IS NOT NULL OR rf.fact_key = 'mat_tien'::text AND l.frontage_m IS NOT NULL OR rf.fact_key = 'no_hau'::text AND l.rear_width_m IS NOT NULL OR rf.fact_key = 'cach_mat_tien'::text AND l.distance_to_street_m IS NOT NULL OR rf.fact_key = 'can_goc'::text AND l.corner_lot IS NOT NULL OR rf.fact_key = 'thang_may'::text AND l.has_elevator IS NOT NULL OR rf.fact_key = 'thuong_luong'::text AND l.negotiable IS NOT NULL OR rf.fact_key = 'doanh_thu'::text AND l.rent_income_vnd IS NOT NULL OR rf.fact_key = 'quy_hoach'::text AND l.planning_status IS NOT NULL OR rf.fact_key = 'gia'::text AND l.price_vnd IS NOT NULL OR rf.fact_key = 'gap'::text AND l.gap IS NOT NULL OR rf.fact_key = 'phuong'::text AND l.ward IS NOT NULL OR rf.fact_key = 'du_an_ten'::text AND l.project_id IS NOT NULL OR rf.fact_key = 'vi_tri'::text AND (COALESCE(btrim(l.location_raw), ''::text) <> ''::text OR COALESCE(btrim(l.street), ''::text) <> ''::text OR l.project_id IS NOT NULL) OR rf.fact_key = 'tang_phu'::text AND COALESCE(l.floors_text, ''::text) ~ '(lửng|sân thượng|hầm|áp mái)'::text OR rf.fact_key = 'hinh_anh'::text AND (EXISTS ( SELECT 1
           FROM listing_media m
          WHERE m.listing_id = l.id)))
  ORDER BY l.id, rf.priority, rf.fact_key;
