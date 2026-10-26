-- 20261026f_cau_mau_hoi_mo — Câu mẫu bỏ câu hỏi dẫn dắt / gộp nhiều câu (SRS-5.1zzzzzzz212, chủ dự án 26/10/2026 sau bài "UX Qualitative
-- Interview": "soi lại cách bot hỏi khách theo mấy lỗi đó" → "sửa hết đi"). `hoi_ban_nhap` "… thấy bản tin này hấp dẫn chưa ạ?" là câu Có/Không
-- kèm tính từ cảm xúc (dẫn dắt) → "… muốn sửa chỗ nào, hay em đăng luôn ạ?"; lời chào ba số bỏ kể loại nhà / khu vực trong cùng một câu hỏi;
-- số tư vấn hỏi MỞ. Cùng cách 20261025c: dòng chưa ai sửa (cau = mac_dinh) chuyển sang câu mới; dòng chủ dự án đã sửa tay giữ nguyên.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('chao_lan_dau', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
{Goi} đang cần gửi bán, cho thuê nhà, hay đang tìm mua ạ?', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
{Goi} đang cần gửi bán, cho thuê nhà, hay đang tìm mua ạ?', 'Khách chào (hello / hi / alo / 👋) lần đầu. {ten} = tên trợ lý', 'Lời chào cũ (quyết định 20/10); 25/10 thêm "tìm mua" (SRS-174); 26/10 bỏ kể loại nhà — một câu hỏi (SRS-5.1zzzzzzz212)', 11),
  ('chao_lam_moi', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
Em đã làm mới cuộc trò chuyện rồi ạ. {Goi} đang cần gửi bán, cho thuê nhà, hay đang tìm mua ạ?', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
Em đã làm mới cuộc trò chuyện rồi ạ. {Goi} đang cần gửi bán, cho thuê nhà, hay đang tìm mua ạ?', 'Khách chào khi đã có chuyện cũ — làm mới phiên. {ten} = tên trợ lý', 'Quyết định 20/10: hello làm mới phiên; 25/10 thêm "tìm mua" (SRS-174); 26/10 bỏ kể loại nhà (SRS-5.1zzzzzzz212)', 12),
  ('hoi_ban_nhap', '{Goi} muốn sửa chỗ nào, hay em đăng luôn ạ?', '{Goi} muốn sửa chỗ nào, hay em đăng luôn ạ?', 'Câu hỏi cuối bản nháp (bot được dặn kết bản nháp bằng câu này)', 'Kịch bản người bán; 26/10 bỏ câu dẫn dắt "hấp dẫn chưa" (SRS-5.1zzzzzzz212)', 14),
  ('hoi_ban_nhap_em', 'Em muốn sửa chỗ nào, hay mình đăng luôn nhé?', 'Em muốn sửa chỗ nào, hay mình đăng luôn nhé?', 'Như trên, khi khách xưng "em"', 'Kịch bản người bán; 26/10 bỏ câu dẫn dắt (SRS-5.1zzzzzzz212)', 15),
  ('chao_tu_van', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
{Goi} đang tìm căn như thế nào, kể em nghe với ạ?', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
{Goi} đang tìm căn như thế nào, kể em nghe với ạ?', 'Khách chào lần đầu ở số Zalo TƯ VẤN người mua. {ten} = tên trợ lý', 'SRS-5.1zzzzzzz210 · chủ dự án 26/10: một số nhận ký gửi, một số tư vấn người mua; câu hỏi mở (SRS-5.1zzzzzzz212)', 40)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
