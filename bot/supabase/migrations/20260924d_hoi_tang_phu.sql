-- 20260924d — FR-220: hỏi bù SAU khi lên kệ "nhà có tầng lửng, sân thượng hay tầng hầm không".
--
-- Chủ dự án 24/09/2026 ("1 có"): hỏi bot có phân biệt được khi rao "tầng lửng" với khi không nhắc tới không — có (kết
-- cấu lưu "trệt + lửng + 2 lầu + sân thượng", nhãn gác lửng / sân thượng), nhưng KHÔNG nhắc thì không phân biệt được
-- "không có" với "quên nói". Nay hỏi bù một câu cho nhà phố, nhà cấp 4, biệt thự, toà nhà — nhóm sau_dang (sau khi
-- lên kệ, cron hỏi bù), không chặn đăng tin. Kết cấu đã nói lửng / sân thượng / hầm / áp mái thì không hỏi. Câu trả lời
-- chen vào kết cấu chữ (`floors_text`) ở chat-reply (`themTangPhu`); "không có" chỉ ghi fact.

insert into public.required_facts (property_type, fact_key, priority, nhom)
select v.loai::public.property_type, 'tang_phu', 30, 'sau_dang'
  from (values ('nha_pho'), ('nha_cap4'), ('biet_thu'), ('toa_nha')) v(loai)
 where not exists (select 1 from public.required_facts r
                    where r.property_type::text = v.loai and r.fact_key = 'tang_phu' and r.deal is null);

create or replace view public.listing_missing_facts as
 SELECT l.id AS listing_id,
    rf.fact_key,
    rf.priority,
    rf.nhom
   FROM listings l
     JOIN required_facts rf ON rf.property_type = COALESCE(l.property_type, 'chua_ro'::property_type) AND (rf.deal IS NULL OR rf.deal = l.deal)
     LEFT JOIN listing_facts lf ON lf.listing_id = l.id AND lf.question = rf.fact_key
  WHERE lf.id IS NULL AND rf.nhom <> 'phu'::text AND NOT (rf.fact_key = 'ket_cau'::text AND l.floors IS NOT NULL OR (rf.fact_key = ANY (ARRAY['do_rong_hem'::text, 'do_rong_duong'::text])) AND (l.alley_width_m IS NOT NULL OR l.access_type = 'mat_tien'::text) OR rf.fact_key = 'phap_ly'::text AND l.legal_status IS NOT NULL OR rf.fact_key = 'huong'::text AND l.direction IS NOT NULL OR rf.fact_key = 'so_phong_ngu'::text AND l.bedrooms IS NOT NULL OR rf.fact_key = 'so_wc'::text AND l.bathrooms IS NOT NULL OR rf.fact_key = 'tang'::text AND l.floor IS NOT NULL OR (rf.fact_key = ANY (ARRAY['dien_tich'::text, 'dien_tich_dat'::text, 'dien_tich_tim_tuong'::text])) AND l.area_m2 IS NOT NULL OR rf.fact_key = 'nam_xay'::text AND l.year_built IS NOT NULL OR rf.fact_key = 'noi_that'::text AND l.furnishing IS NOT NULL OR rf.fact_key = 'mat_tien'::text AND l.frontage_m IS NOT NULL OR rf.fact_key = 'no_hau'::text AND l.rear_width_m IS NOT NULL OR rf.fact_key = 'cach_mat_tien'::text AND l.distance_to_street_m IS NOT NULL OR rf.fact_key = 'can_goc'::text AND l.corner_lot IS NOT NULL OR rf.fact_key = 'thang_may'::text AND l.has_elevator IS NOT NULL OR rf.fact_key = 'thuong_luong'::text AND l.negotiable IS NOT NULL OR rf.fact_key = 'doanh_thu'::text AND l.rent_income_vnd IS NOT NULL OR rf.fact_key = 'quy_hoach'::text AND l.planning_status IS NOT NULL OR rf.fact_key = 'gia'::text AND l.price_vnd IS NOT NULL OR rf.fact_key = 'gap'::text AND l.gap IS NOT NULL OR rf.fact_key = 'phuong'::text AND l.ward IS NOT NULL OR rf.fact_key = 'vi_tri'::text AND (COALESCE(btrim(l.location_raw), ''::text) <> ''::text OR COALESCE(btrim(l.street), ''::text) <> ''::text OR l.project_id IS NOT NULL) OR rf.fact_key = 'tang_phu'::text AND COALESCE(l.floors_text, ''::text) ~ '(lửng|sân thượng|hầm|áp mái)'::text OR rf.fact_key = 'hinh_anh'::text AND (EXISTS ( SELECT 1
           FROM listing_media m
          WHERE m.listing_id = l.id)))
  ORDER BY l.id, rf.priority, rf.fact_key;

CREATE OR REPLACE FUNCTION public.nhan_fact(p_key text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_key
    when 'gap' then 'cần bán/cho thuê gấp hay không'
    when 'tang_phu' then 'tầng lửng, sân thượng, tầng hầm'
    else public.nhan_fact_cu(p_key) end;
$function$;
