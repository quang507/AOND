-- 20261022e — Bỏ câu mẫu `ghi_nhan_mau` (SRS-5.1zzzzzzz131; Lê Quang 22/10/2026: "xóa hết mấy cái em ghi nhận em bla bla đi"): bot không mở
-- lượt bằng câu ghi nhận nữa (mở bằng lời khen — LUAT_MO_LUOT / LUAT_KHEN), nên các câu ví dụ này không còn chỗ dùng. Xoá dòng để CRM không hiện.
delete from public.cau_mau where khoa = 'ghi_nhan_mau';
