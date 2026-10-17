-- 20260927c — tin bán hỏi ÍT câu pháp lý trước bản nháp (FR-232).
--
-- Chủ dự án 27/09/2026 sau lượt test Zalo: "Tao thấy hỏi hơi nhiều", chọn "Cả 3": gộp pháp lý còn 2 câu, trước bản nháp chỉ
-- hỏi câu sổ, câu còn lại hỏi sau khi lên tin. FR-229 a (20260925i) để 6 câu pháp lý nối nhau trước bản nháp (sổ → đứng tên →
-- thế chấp → quy hoạch → tranh chấp → khớp sổ), mỗi câu một lượt.
--
-- Nay: câu sổ (`phap_ly`, câu mẫu `phap_ly@ban`) hỏi luôn ai đứng tên + cầm tay / thế chấp — câu trả lời tách thành từng ô.
-- Năm câu FR-229 chuyển sang nhóm `sau_dang` (hỏi bù sau khi lên tin, `ask-seller`): đứng tên / thế chấp chỉ hỏi lại khi câu
-- sổ chưa có; quy hoạch / tranh chấp / khớp sổ đi chung một tin (`quy_hoach@ban`). Chỉ các dòng FR-229 (ưu tiên 17–21):
-- quy hoạch đất nông nghiệp (14) là câu cơ bản từ trước FR-229, giữ trước bản nháp. Tin cho thuê không đổi.
update public.required_facts
   set nhom = 'sau_dang'
 where deal = 'ban'
   and nhom = 'co_ban'
   and fact_key in ('nguoi_dung_ten', 'the_chap', 'quy_hoach', 'tranh_chap', 'dien_tich_khop_so')
   and priority between 17 and 21;
