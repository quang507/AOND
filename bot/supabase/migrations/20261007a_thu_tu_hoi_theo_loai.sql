-- 20261007a — thứ tự hỏi người bán theo cách môi giới hỏi, mỗi lượt một ý, ≤ 6 câu trước bản nháp (SRS-5.1zzz).
--
-- Chủ dự án 07/10/2026 sau khi chat thử: "thứ tự hỏi vẫn ngu ko có tự nhiên… tao muốn bot phải hiểu bds này thì nên hỏi câu gì
-- tự nhiên hơn"; chọn GIỮ một ý một lượt (kịch bản sếp, FR-177) nhưng sửa thứ tự, TỐI ĐA 6 lượt trước bản nháp, phần còn lại hỏi
-- bù sau khi tin lên kệ. Trước bản này nhà phố hỏi 9–10 câu trước bản nháp (vị trí, diện tích, kết cấu, hẻm, giá, sổ, phường,
-- gấp, phòng ngủ, ảnh), căn hộ 9, đất 10 — vừa dài vừa lạc thứ tự (hướng / hạ tầng trước thổ cư).
--
-- Thứ tự mới (nhóm co_ban), theo trình tự một môi giới nắm căn: Ở ĐÂU → TO CỠ NÀO → ĐẶC ĐIỂM QUYẾT ĐỊNH GIÁ CỦA LOẠI ĐÓ → GIÁ →
-- GIẤY TỜ; phường đi cuối và thường chỉ là câu XÁC NHẬN (code tự tra từ tên đường + quận):
--   nhà phố      vị trí · ngang × dài · kết cấu · hẻm · giá · (cọc nếu thuê) · sổ (chỉ tin bán) · phường
--   nhà cấp 4    vị trí · diện tích · hẻm · hiện trạng · giá · (cọc) · sổ · phường
--   biệt thự     vị trí · diện tích · kết cấu · đường vào · giá · (cọc) · sổ · phường
--   căn hộ       dự án / toà · diện tích · phòng ngủ · tầng · giá · (cọc) · sổ · phường
--   đất          vị trí · diện tích · giá (giữ "đất hỏi giá sớm", 20260928c) · đường vào · thổ cư · sổ · phường
--   đất NN       vị trí · diện tích · giá · đường vào · quy hoạch · sổ · phường
--   đất SKC      vị trí · diện tích · giá · mục đích · thời hạn sử dụng · sổ · phường
--   kho xưởng    vị trí · diện tích · đường container · giá · (cọc) · sổ · phường
--   toà nhà      vị trí · diện tích · kết cấu · doanh thu · giá · sổ · phường
--   phòng trọ    vị trí · diện tích · nội thất · giá · cọc · phường
--   mặt bằng     vị trí · diện tích · mặt tiền · giá · cọc · phường
-- Dời sang `sau_dang` (hỏi bù sau khi lên kệ, `ask-seller`): gấp, phòng ngủ (nhà), ảnh (lời chào đã mời gửi ảnh), hướng, hạ
-- tầng, xây dựng, nội thất / thời hạn / trượt giá tin thuê, các câu kỹ thuật kho xưởng / toà nhà. Câu sổ của nhà / căn hộ chỉ hỏi
-- tin BÁN (deal = 'ban'): tin thuê không cần sổ để lên tin. Loại "chưa rõ" giữ nguyên (hỏi loại trước).
-- Số ưu tiên GIỮ DẢI cũ mà `chonCauKe` dựa vào để không cho câu liên quan vượt dải (vật lý < 12 · tiền 12–15 · pháp lý 16–21 ·
-- phường 22+): chỉ đổi thứ tự TRONG dải và dời câu phụ sang sau_dang (40+). Lượt nháp đầu đánh số lại 2…9 làm giá / sổ rơi vào dải
-- vật lý và câu liên quan nhảy thẳng sang sổ — 14 ca e2e đỏ.
-- Mock e2e (`bot/tests/e2e/mock-supabase.mjs` `missingFacts`) chép đúng bảng này trong cùng commit.

update public.required_facts r
   set priority = v.priority, nhom = v.nhom
  from (values
    ('nha_pho', 'vi_tri', 2, 'co_ban'),
    ('nha_pho', 'dien_tich_dat', 3, 'co_ban'),
    ('nha_pho', 'ket_cau', 4, 'co_ban'),
    ('nha_pho', 'do_rong_hem', 5, 'co_ban'),
    ('nha_pho', 'gia', 12, 'co_ban'),
    ('nha_pho', 'tien_coc', 13, 'co_ban'),
    ('nha_pho', 'phap_ly', 16, 'co_ban'),
    ('nha_pho', 'phuong', 22, 'co_ban'),
    ('nha_pho', 'noi_that', 40, 'sau_dang'),
    ('nha_pho', 'thoi_han_thue', 41, 'sau_dang'),
    ('nha_pho', 'truot_gia', 42, 'sau_dang'),
    ('nha_pho', 'gap', 43, 'sau_dang'),
    ('nha_pho', 'so_phong_ngu', 44, 'sau_dang'),
    ('nha_pho', 'hinh_anh', 45, 'sau_dang'),
    ('nha_cap4', 'vi_tri', 2, 'co_ban'),
    ('nha_cap4', 'dien_tich_dat', 3, 'co_ban'),
    ('nha_cap4', 'do_rong_hem', 4, 'co_ban'),
    ('nha_cap4', 'hien_trang', 5, 'co_ban'),
    ('nha_cap4', 'gia', 12, 'co_ban'),
    ('nha_cap4', 'tien_coc', 13, 'co_ban'),
    ('nha_cap4', 'phap_ly', 16, 'co_ban'),
    ('nha_cap4', 'phuong', 22, 'co_ban'),
    ('nha_cap4', 'noi_that', 40, 'sau_dang'),
    ('nha_cap4', 'thoi_han_thue', 41, 'sau_dang'),
    ('nha_cap4', 'gap', 43, 'sau_dang'),
    ('nha_cap4', 'so_phong_ngu', 44, 'sau_dang'),
    ('nha_cap4', 'hinh_anh', 45, 'sau_dang'),
    ('biet_thu', 'vi_tri', 2, 'co_ban'),
    ('biet_thu', 'dien_tich_dat', 3, 'co_ban'),
    ('biet_thu', 'ket_cau', 4, 'co_ban'),
    ('biet_thu', 'do_rong_hem', 5, 'co_ban'),
    ('biet_thu', 'gia', 12, 'co_ban'),
    ('biet_thu', 'tien_coc', 13, 'co_ban'),
    ('biet_thu', 'phap_ly', 16, 'co_ban'),
    ('biet_thu', 'phuong', 22, 'co_ban'),
    ('biet_thu', 'san_vuon', 40, 'sau_dang'),
    ('biet_thu', 'noi_that', 41, 'sau_dang'),
    ('biet_thu', 'khu_compound', 42, 'sau_dang'),
    ('biet_thu', 'gap', 43, 'sau_dang'),
    ('biet_thu', 'so_phong_ngu', 44, 'sau_dang'),
    ('biet_thu', 'hinh_anh', 45, 'sau_dang'),
    ('biet_thu', 'thoi_han_thue', 46, 'sau_dang'),
    ('chung_cu', 'vi_tri', 2, 'co_ban'),
    ('chung_cu', 'dien_tich_tim_tuong', 3, 'co_ban'),
    ('chung_cu', 'so_phong_ngu', 4, 'co_ban'),
    ('chung_cu', 'tang', 5, 'co_ban'),
    ('chung_cu', 'gia', 12, 'co_ban'),
    ('chung_cu', 'tien_coc', 13, 'co_ban'),
    ('chung_cu', 'phap_ly', 16, 'co_ban'),
    ('chung_cu', 'phuong', 22, 'co_ban'),
    ('chung_cu', 'huong', 40, 'sau_dang'),
    ('chung_cu', 'noi_that', 41, 'sau_dang'),
    ('chung_cu', 'phi_quan_ly', 42, 'sau_dang'),
    ('chung_cu', 'gap', 43, 'sau_dang'),
    ('chung_cu', 'hinh_anh', 45, 'sau_dang'),
    ('chung_cu', 'thoi_han_thue', 46, 'sau_dang'),
    ('dat', 'vi_tri', 2, 'co_ban'),
    ('dat', 'dien_tich', 3, 'co_ban'),
    ('dat', 'gia', 4, 'co_ban'),
    ('dat', 'do_rong_duong', 5, 'co_ban'),
    ('dat', 'tho_cu', 6, 'co_ban'),
    ('dat', 'phap_ly', 16, 'co_ban'),
    ('dat', 'phuong', 22, 'co_ban'),
    ('dat', 'huong', 40, 'sau_dang'),
    ('dat', 'ha_tang', 41, 'sau_dang'),
    ('dat', 'xay_dung', 42, 'sau_dang'),
    ('dat', 'gap', 43, 'sau_dang'),
    ('dat', 'hinh_anh', 45, 'sau_dang'),
    ('dat_nong_nghiep', 'vi_tri', 2, 'co_ban'),
    ('dat_nong_nghiep', 'dien_tich', 3, 'co_ban'),
    ('dat_nong_nghiep', 'gia', 4, 'co_ban'),
    ('dat_nong_nghiep', 'duong_vao', 5, 'co_ban'),
    ('dat_nong_nghiep', 'quy_hoach', 14, 'co_ban'),
    ('dat_nong_nghiep', 'phap_ly', 16, 'co_ban'),
    ('dat_nong_nghiep', 'phuong', 22, 'co_ban'),
    ('dat_nong_nghiep', 'nguon_nuoc', 40, 'sau_dang'),
    ('dat_nong_nghiep', 'ranh_gioi', 41, 'sau_dang'),
    ('dat_nong_nghiep', 'len_tho_cu', 42, 'sau_dang'),
    ('dat_nong_nghiep', 'gap', 43, 'sau_dang'),
    ('dat_nong_nghiep', 'hinh_anh', 45, 'sau_dang'),
    ('dat_kinh_doanh', 'vi_tri', 2, 'co_ban'),
    ('dat_kinh_doanh', 'dien_tich', 3, 'co_ban'),
    ('dat_kinh_doanh', 'gia', 4, 'co_ban'),
    ('dat_kinh_doanh', 'muc_dich', 5, 'co_ban'),
    ('dat_kinh_doanh', 'thoi_han_su_dung', 15, 'co_ban'),
    ('dat_kinh_doanh', 'phap_ly', 16, 'co_ban'),
    ('dat_kinh_doanh', 'phuong', 22, 'co_ban'),
    ('dat_kinh_doanh', 'do_rong_duong', 40, 'sau_dang'),
    ('dat_kinh_doanh', 'hinh_thuc_thue_dat', 41, 'sau_dang'),
    ('dat_kinh_doanh', 'gap', 43, 'sau_dang'),
    ('dat_kinh_doanh', 'hinh_anh', 45, 'sau_dang'),
    ('kho_xuong', 'vi_tri', 2, 'co_ban'),
    ('kho_xuong', 'dien_tich', 3, 'co_ban'),
    ('kho_xuong', 'duong_container', 4, 'co_ban'),
    ('kho_xuong', 'gia', 12, 'co_ban'),
    ('kho_xuong', 'tien_coc', 13, 'co_ban'),
    ('kho_xuong', 'phap_ly', 16, 'co_ban'),
    ('kho_xuong', 'phuong', 22, 'co_ban'),
    ('kho_xuong', 'chieu_cao', 40, 'sau_dang'),
    ('kho_xuong', 'tai_trong_san', 41, 'sau_dang'),
    ('kho_xuong', 'tram_bien_ap', 42, 'sau_dang'),
    ('kho_xuong', 'gap', 43, 'sau_dang'),
    ('kho_xuong', 'hinh_anh', 45, 'sau_dang'),
    ('kho_xuong', 'thoi_han_thue', 46, 'sau_dang'),
    ('kho_xuong', 'xu_ly_nuoc_thai', 47, 'sau_dang'),
    ('kho_xuong', 'thoi_han_su_dung', 48, 'sau_dang'),
    ('toa_nha', 'vi_tri', 2, 'co_ban'),
    ('toa_nha', 'dien_tich_dat', 3, 'co_ban'),
    ('toa_nha', 'ket_cau', 4, 'co_ban'),
    ('toa_nha', 'doanh_thu', 5, 'co_ban'),
    ('toa_nha', 'gia', 12, 'co_ban'),
    ('toa_nha', 'phap_ly', 16, 'co_ban'),
    ('toa_nha', 'phuong', 22, 'co_ban'),
    ('toa_nha', 'so_phong', 40, 'sau_dang'),
    ('toa_nha', 'thang_may', 41, 'sau_dang'),
    ('toa_nha', 'do_rong_hem', 42, 'sau_dang'),
    ('toa_nha', 'gap', 43, 'sau_dang'),
    ('toa_nha', 'hinh_anh', 45, 'sau_dang'),
    ('toa_nha', 'ty_le_lap_day', 47, 'sau_dang'),
    ('toa_nha', 'pccc', 48, 'sau_dang'),
    ('phong_tro', 'vi_tri', 2, 'co_ban'),
    ('phong_tro', 'dien_tich', 3, 'co_ban'),
    ('phong_tro', 'noi_that', 4, 'co_ban'),
    ('phong_tro', 'gia', 12, 'co_ban'),
    ('phong_tro', 'tien_coc', 14, 'co_ban'),
    ('phong_tro', 'phuong', 22, 'co_ban'),
    ('phong_tro', 'gio_giac', 40, 'sau_dang'),
    ('phong_tro', 'gia_dien_nuoc', 41, 'sau_dang'),
    ('phong_tro', 'gap', 43, 'sau_dang'),
    ('phong_tro', 'hinh_anh', 45, 'sau_dang'),
    ('mat_bang', 'vi_tri', 2, 'co_ban'),
    ('mat_bang', 'dien_tich', 3, 'co_ban'),
    ('mat_bang', 'mat_tien', 4, 'co_ban'),
    ('mat_bang', 'gia', 12, 'co_ban'),
    ('mat_bang', 'tien_coc', 13, 'co_ban'),
    ('mat_bang', 'phuong', 22, 'co_ban'),
    ('mat_bang', 'nganh_hang_phu_hop', 40, 'sau_dang'),
    ('mat_bang', 'thoi_han_thue', 41, 'sau_dang'),
    ('mat_bang', 'truot_gia', 42, 'sau_dang'),
    ('mat_bang', 'gap', 43, 'sau_dang'),
    ('mat_bang', 'hinh_anh', 45, 'sau_dang')

  ) as v(loai, fact_key, priority, nhom)
 where r.property_type = v.loai::public.property_type
   and r.fact_key = v.fact_key;

-- Câu sổ nhà / căn hộ: chỉ tin bán. (Trigger `required_facts_khong_trung` cấm có cùng lúc dòng deal NULL và dòng deal cụ thể —
-- đổi tại chỗ, không chèn dòng mới.)
update public.required_facts
   set deal = 'ban'
 where property_type in ('nha_pho', 'nha_cap4', 'biet_thu', 'chung_cu')
   and fact_key = 'phap_ly'
   and deal is null;
