-- 20260909m — chạy kịch bản lần 2 (09/09 tối): câu "địa chỉ cụ thể" bị hỏi cả với tin đã
-- có tên đường trong câu rao ("hẻm 8m Trần Hưng Đạo phường 7" → cột street có, location_raw
-- trống) và với căn thuộc DỰ ÁN trong kho (Ny'ah Phú Định — vị trí là dự án). Nay view coi
-- vi_tri "đã có" khi có location_raw HOẶC street HOẶC project_id; hỏi bù vẫn xin số nhà sau.
create or replace view public.listing_missing_facts as
 select l.id as listing_id, rf.fact_key, rf.priority, rf.nhom
   from public.listings l
   join public.required_facts rf
     on rf.property_type = coalesce(l.property_type, 'chua_ro'::public.property_type)
    and (rf.deal is null or rf.deal = l.deal)
   left join public.listing_facts lf on lf.listing_id = l.id and lf.question = rf.fact_key
  where lf.id is null and rf.nhom <> 'phu'
    and not (
         (rf.fact_key = 'ket_cau' and l.floors is not null)
      or (rf.fact_key in ('do_rong_hem', 'do_rong_duong') and (l.alley_width_m is not null or l.access_type = 'mat_tien'))
      or (rf.fact_key = 'phap_ly' and l.legal_status is not null)
      or (rf.fact_key = 'huong' and l.direction is not null)
      or (rf.fact_key = 'so_phong_ngu' and l.bedrooms is not null)
      or (rf.fact_key = 'so_wc' and l.bathrooms is not null)
      or (rf.fact_key = 'tang' and l.floor is not null)
      or (rf.fact_key in ('dien_tich', 'dien_tich_dat', 'dien_tich_tim_tuong') and l.area_m2 is not null)
      or (rf.fact_key = 'nam_xay' and l.year_built is not null)
      or (rf.fact_key = 'noi_that' and l.furnishing is not null)
      or (rf.fact_key = 'mat_tien' and l.frontage_m is not null)
      or (rf.fact_key = 'no_hau' and l.rear_width_m is not null)
      or (rf.fact_key = 'cach_mat_tien' and l.distance_to_street_m is not null)
      or (rf.fact_key = 'can_goc' and l.corner_lot is not null)
      or (rf.fact_key = 'thang_may' and l.has_elevator is not null)
      or (rf.fact_key = 'thuong_luong' and l.negotiable is not null)
      or (rf.fact_key = 'doanh_thu' and l.rent_income_vnd is not null)
      or (rf.fact_key = 'quy_hoach' and l.planning_status is not null)
      or (rf.fact_key = 'gia' and l.price_vnd is not null)
      or (rf.fact_key = 'phuong' and l.ward is not null)
      or (rf.fact_key = 'vi_tri' and (coalesce(btrim(l.location_raw), '') <> '' or coalesce(btrim(l.street), '') <> '' or l.project_id is not null))
      or (rf.fact_key = 'hinh_anh' and exists (select 1 from public.listing_media m where m.listing_id = l.id))
    )
  order by l.id, rf.priority, rf.fact_key;
comment on view public.listing_missing_facts is
  '[BOT & HÀNG ĐỢI] Fact còn thiếu của tin = required_facts theo loại + deal − listing_facts − cột đã có (kể cả street/project_id cho vi_tri, 20260909m) − nhóm phu.';
