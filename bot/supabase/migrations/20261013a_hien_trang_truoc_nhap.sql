-- 20261013a — câu "nhà đang ở, cho thuê hay để trống" (hien_trang_su_dung) hỏi TRƯỚC bản nháp với các loại nhà (SRS-5.1zzzzzm).
--
-- Chủ dự án 13/10/2026 (sau test Zalo tin Hương Lộ 3): "mấy căn nhà thì thêm câu hỏi về hiện trạng đi". Câu này nằm ở nhóm `sau_dang`
-- (34) từ 20260909i — chỉ hỏi bù SAU khi tin lên kệ, nên trước bản nháp bot không bao giờ hỏi, còn nhánh "đang cho thuê" lại đoán bằng
-- chữ bài rao (SRS-5.1zzzzzl). Ô `hien_trang_su_dung` nay là CHỦ của câu "nhà có đang cho thuê không" (re-nhanh.ts `dangChoThue`), nên hỏi
-- nó sớm là cách lấy câu trả lời thật thay cho đoán.
-- Ưu tiên 17: ngay sau câu sổ (16), trước phường (22) — giữ dải pháp lý 16–21 mà `chonCauKe` dựa vào (20261007a). Áp cho nhà phố, nhà
-- cấp 4, căn hộ, biệt thự (dòng deal null = cả bán lẫn thuê: tin thuê hỏi "đang trống hay có khách thuê"). Mock e2e
-- (`bot/tests/e2e/mock-supabase.mjs` `missingFacts`) chép cùng commit.

update public.required_facts
   set nhom = 'co_ban', priority = 17
 where fact_key = 'hien_trang_su_dung'
   and property_type in ('nha_pho', 'nha_cap4', 'chung_cu', 'biet_thu');
