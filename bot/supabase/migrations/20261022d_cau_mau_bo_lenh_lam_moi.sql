-- 20261022d — Bỏ câu mẫu `lenh_lam_moi` (SRS-5.1zzzzzzz130; Lê Quang 22/10/2026: gõ $$$$$ "xóa hết data cũ, không cần thông báo"): lệnh $$$$$
-- nay im lặng, không còn câu trả lời nào để sửa ở CRM. Xoá dòng để /admin/cau-chuan không hiện câu không ai dùng.
delete from public.cau_mau where khoa = 'lenh_lam_moi';
