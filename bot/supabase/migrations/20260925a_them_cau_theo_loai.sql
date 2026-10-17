-- 20260925a — thêm ~3 câu cần làm rõ cho mỗi loại BĐS bán (FR-223 m), nhóm `sau_dang` (hỏi bù SAU khi lên kệ, không chặn
-- bản nháp).
--
-- Chủ dự án 25/09/2026: "Loại bds khác nhau sẽ có những thứ khác nhau cần làm rõ" → "chốt thêm được vài 3 cái cần làm rõ
-- nữa cũng dc". Chọn ý nào cho loại nào là [giả định BA] — chỉ dùng khoá bot đã có câu hỏi + chỗ ghi; sửa bằng cách thêm /
-- xoá dòng `required_facts` (Table Editor), không cần deploy.
-- Khoá đã có bản riêng cho tin CHO THUÊ (noi_that của nhà phố / biệt thự) thì thêm bản riêng cho tin BÁN — trigger
-- `required_facts_khong_trung` cấm thêm bản chung nằm chồng lên bản theo deal.
insert into public.required_facts (property_type, fact_key, priority, nhom, deal)
select v.loai::public.property_type, v.khoa, v.uu_tien, 'sau_dang',
       case when exists (select 1 from public.required_facts r where r.property_type::text = v.loai and r.fact_key = v.khoa and r.deal is not null)
            then 'ban'::public.listing_deal end
  from (values
    ('nha_pho', 'huong', 40), ('nha_pho', 'nam_xay', 41), ('nha_pho', 'noi_that', 42),
    ('nha_cap4', 'huong', 40), ('nha_cap4', 'quy_hoach', 41), ('nha_cap4', 'no_hau', 42),
    ('biet_thu', 'huong', 40), ('biet_thu', 'nam_xay', 41), ('biet_thu', 'noi_that', 42),
    ('chung_cu', 'so_wc', 40), ('chung_cu', 'toa_thap', 41), ('chung_cu', 'nam_xay', 42),
    ('dat', 'quy_hoach', 40), ('dat', 'no_hau', 41), ('dat', 'cach_mat_tien', 42),
    ('dat_nong_nghiep', 'tho_cu', 40), ('dat_nong_nghiep', 'hinh_dang', 41), ('dat_nong_nghiep', 'the_chap', 42),
    ('dat_kinh_doanh', 'quy_hoach', 40), ('dat_kinh_doanh', 'tram_bien_ap', 41), ('dat_kinh_doanh', 'duong_container', 42),
    ('kho_xuong', 'pccc', 40), ('kho_xuong', 'the_chap', 41), ('kho_xuong', 'thuong_luong', 42),
    ('toa_nha', 'huong', 40), ('toa_nha', 'nam_xay', 41), ('toa_nha', 'noi_that', 42)
  ) v(loai, khoa, uu_tien)
 where not exists (select 1 from public.required_facts r
                    where r.property_type::text = v.loai and r.fact_key = v.khoa and (r.deal is null or r.deal::text = 'ban'));
