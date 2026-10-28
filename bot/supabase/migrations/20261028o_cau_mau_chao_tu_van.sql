-- 20261028o_cau_mau_chao_tu_van — SRS-5.1zzzzzzz261 (chủ dự án 28/10/2026: "bên mua thì … tư vấn mua nhà đất hay sao ạ" → "bạn quyết").
-- Lời chào số tư vấn nói rõ vai "trợ lý tư vấn mua / thuê nhà đất" và hỏi mua hay thuê, vẫn MỘT câu hỏi mở (SRS-5.1zzzzzzz212).
-- Cùng cách 20261026f: dòng chưa ai sửa (cau = mac_dinh) chuyển sang câu mới; dòng chủ dự án đã sửa tay ở CRM giữ nguyên.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('chao_tu_van', 'Chào {goi} ạ! Em là {ten}, trợ lý tư vấn mua / thuê nhà đất của AI Ơi Nhà Đất. 🏡✨
{Goi} đang tìm mua hay thuê căn như thế nào, kể em nghe với ạ?', 'Chào {goi} ạ! Em là {ten}, trợ lý tư vấn mua / thuê nhà đất của AI Ơi Nhà Đất. 🏡✨
{Goi} đang tìm mua hay thuê căn như thế nào, kể em nghe với ạ?', 'Khách chào lần đầu ở số Zalo TƯ VẤN người mua. {ten} = tên trợ lý', 'SRS-5.1zzzzzzz210 · chủ dự án 26/10: một số nhận ký gửi, một số tư vấn người mua; câu hỏi mở (SRS-5.1zzzzzzz212); 28/10 nói rõ vai tư vấn mua / thuê (SRS-5.1zzzzzzz261)', 40)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
