-- 20261014b — căn hộ phải hỏi TÊN CHUNG CƯ / DỰ ÁN dù khách đã nói địa chỉ đường (SRS-5.1zzzzzzz3).
--
-- Người test thật 14/10/2026 07:55–07:59 (Zalo …4980): "Chung cư đường Phạm Thế Hiển quận 8", "địa chỉ 2225 Phạm Thế Hiển" → bot ghi vị trí
-- rồi hỏi phường, diện tích, tầng, giá, pháp lý — KHÔNG BAO GIỜ hỏi căn hộ thuộc chung cư / dự án nào. Chủ dự án: "sửa luôn, tất cả các thứ
-- sửa từ gốc".
--
-- Gốc: căn hộ chỉ có MỘT ô vị trí (`vi_tri`, câu "Căn hộ mình thuộc dự án nào, toà nào"), và view coi ô đó là có ngay khi có MỘT fact
-- `vi_tri` hoặc `location_raw` / `street` — địa chỉ đường làm đầy ô, tên chung cư không còn chỗ nào bắt buộc. Với căn hộ, tên chung cư là
-- thứ người mua tìm (cùng một đường có nhiều chung cư); địa chỉ đường không thay được.
-- Sửa: ô bắt buộc riêng `du_an_ten` cho `chung_cu` (nhóm co_ban, ưu tiên 2 như vị trí — `order by priority, fact_key` xếp nó ngay trước `vi_tri`, trước diện tích; khách nói tên thì trigger điền location_raw nên câu vị trí không hỏi lặp), coi là CÓ khi có fact `du_an_ten` (khách nói
-- tên; trigger `trg_vi_tri_vao_cot` vẫn điền location_raw) HOẶC tin đã gắn `project_id`. Khách nói không biết / không có tên → cơ chế
-- `khong_biet` sẵn có, không hỏi lại.
insert into public.required_facts (property_type, fact_key, priority, nhom)
select 'chung_cu'::public.property_type, 'du_an_ten', 2, 'co_ban'
 where not exists (select 1 from public.required_facts r where r.property_type = 'chung_cu' and r.fact_key = 'du_an_ten');

create or replace view public.listing_missing_facts as
 SELECT l.id AS listing_id,
    rf.fact_key,
    rf.priority,
    rf.nhom
   FROM listings l
     JOIN required_facts rf ON rf.property_type = COALESCE(l.property_type, 'chua_ro'::property_type) AND (rf.deal IS NULL OR rf.deal = l.deal)
     LEFT JOIN listing_facts lf ON lf.listing_id = l.id AND lf.question = rf.fact_key
  WHERE lf.id IS NULL AND rf.nhom <> 'phu'::text AND NOT (rf.fact_key = 'ket_cau'::text AND l.floors IS NOT NULL OR (rf.fact_key = ANY (ARRAY['do_rong_hem'::text, 'do_rong_duong'::text])) AND (l.alley_width_m IS NOT NULL OR l.access_type IS NOT NULL) OR rf.fact_key = 'phap_ly'::text AND l.legal_status IS NOT NULL OR rf.fact_key = 'huong'::text AND l.direction IS NOT NULL OR rf.fact_key = 'so_phong_ngu'::text AND l.bedrooms IS NOT NULL OR rf.fact_key = 'so_wc'::text AND l.bathrooms IS NOT NULL OR rf.fact_key = 'tang'::text AND l.floor IS NOT NULL OR (rf.fact_key = ANY (ARRAY['dien_tich'::text, 'dien_tich_dat'::text, 'dien_tich_tim_tuong'::text])) AND l.area_m2 IS NOT NULL OR rf.fact_key = 'nam_xay'::text AND l.year_built IS NOT NULL OR rf.fact_key = 'noi_that'::text AND l.furnishing IS NOT NULL OR rf.fact_key = 'mat_tien'::text AND l.frontage_m IS NOT NULL OR rf.fact_key = 'no_hau'::text AND l.rear_width_m IS NOT NULL OR rf.fact_key = 'cach_mat_tien'::text AND l.distance_to_street_m IS NOT NULL OR rf.fact_key = 'can_goc'::text AND l.corner_lot IS NOT NULL OR rf.fact_key = 'thang_may'::text AND l.has_elevator IS NOT NULL OR rf.fact_key = 'thuong_luong'::text AND l.negotiable IS NOT NULL OR rf.fact_key = 'doanh_thu'::text AND l.rent_income_vnd IS NOT NULL OR rf.fact_key = 'quy_hoach'::text AND l.planning_status IS NOT NULL OR rf.fact_key = 'gia'::text AND l.price_vnd IS NOT NULL OR rf.fact_key = 'gap'::text AND l.gap IS NOT NULL OR rf.fact_key = 'phuong'::text AND l.ward IS NOT NULL OR rf.fact_key = 'du_an_ten'::text AND l.project_id IS NOT NULL OR rf.fact_key = 'vi_tri'::text AND (COALESCE(btrim(l.location_raw), ''::text) <> ''::text OR COALESCE(btrim(l.street), ''::text) <> ''::text OR l.project_id IS NOT NULL) OR rf.fact_key = 'tang_phu'::text AND COALESCE(l.floors_text, ''::text) ~ '(lửng|sân thượng|hầm|áp mái)'::text OR rf.fact_key = 'hinh_anh'::text AND (EXISTS ( SELECT 1
           FROM listing_media m
          WHERE m.listing_id = l.id)))
  ORDER BY l.id, rf.priority, rf.fact_key;
