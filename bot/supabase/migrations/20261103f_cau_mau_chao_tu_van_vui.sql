-- 20261103f_cau_mau_chao_tu_van_vui — SRS-5.1zzzzzzz375 (chủ dự án 03/11/2026: "câu chào nên đổi sao hay hơn", giọng "tự nhiên vui vẻ nhanh nhẹn").
-- Lời chào số tư vấn ngắn, vui, hỏi gộp mua / thuê + khu + tầm giá để lọc căn được ngay. Cùng cách 20261028o: dòng chưa ai sửa (cau = mac_dinh)
-- chuyển sang câu mới; dòng chủ dự án đã sửa tay ở CRM giữ nguyên.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('chao_tu_van', 'Chào {goi}! Em là {ten} bên AI Ơi Nhà Đất nè 🏡
{Goi} đang tìm mua hay thuê, khu nào, tầm giá bao nhiêu để em lọc căn hợp liền ạ?', 'Chào {goi}! Em là {ten} bên AI Ơi Nhà Đất nè 🏡
{Goi} đang tìm mua hay thuê, khu nào, tầm giá bao nhiêu để em lọc căn hợp liền ạ?', 'Khách chào lần đầu ở số Zalo TƯ VẤN người mua. {ten} = tên trợ lý', 'SRS-5.1zzzzzzz210 · 261 · 03/11 giọng vui, hỏi gộp mua / thuê + khu + tầm giá (SRS-5.1zzzzzzz375)', 40)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
