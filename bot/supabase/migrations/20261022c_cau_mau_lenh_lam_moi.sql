-- 20261022c — Câu mẫu `lenh_lam_moi` (trả lời lệnh $$$$$): bỏ câu "Em đã làm mới phiên chat và xóa toàn bộ thông tin nháp trước đó rồi ạ"
-- (SRS-5.1zzzzzzz130; Lê Quang 22/10/2026: "bỏ câu này luôn"). Chỉ đổi câu đang dùng (cột cau) khi CHƯA bị chủ dự án sửa (cau = mac_dinh);
-- dòng đã sửa ở /admin/cau-chuan giữ nguyên câu của chủ dự án.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('lenh_lam_moi', 'Em chào {goi}! Em là {ten} từ AI Ơi Nhà Đất.
{Goi} có thể bắt đầu gửi thông tin nhà đất cần rao bán hoặc cho thuê nhé! 🏡✨', 'Em chào {goi}! Em là {ten} từ AI Ơi Nhà Đất.
{Goi} có thể bắt đầu gửi thông tin nhà đất cần rao bán hoặc cho thuê nhé! 🏡✨', 'Lệnh $$$$$ (làm mới phiên). {ten} = tên trợ lý', 'Lệnh thử của chủ dự án; 22/10 bỏ câu "đã làm mới phiên chat và xóa toàn bộ thông tin nháp"', 13)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon;
