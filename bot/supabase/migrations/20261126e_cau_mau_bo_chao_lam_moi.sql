-- 20261126e_cau_mau_bo_chao_lam_moi — SRS-5.1zzzzzzz547 (chủ dự án 26/11/2026: "tôi muốn code bỏ mấy cái ko xài đi cho gọn").
-- Câu mẫu `chao_lam_moi` (lời chào "làm mới cuộc trò chuyện") không còn đường nào trong lõi gọi `cau_mau.cau("chao_lam_moi")`; khoá đã gỡ
-- khỏi `src/aioi/cau_mau.py`. Xoá dòng để trang câu chuẩn ở CRM không còn câu sửa mà bot không bao giờ gửi.
begin;

delete from public.cau_mau where khoa = 'chao_lam_moi';

commit;
