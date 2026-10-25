-- 20261025c — Lời chào mẫu hỏi cả "tìm mua" (SRS-5.1zzzzzzz174, soát UX 25/10/2026): câu mẫu `chao_lan_dau` / `chao_lam_moi` chỉ hỏi "gửi bán hoặc cho
-- thuê" trong khi khối dặn model (`khoi_chao_lan_dau`) bảo hỏi cả "đang tìm mua" và "giữ ý" mẫu — hai bên lệch, khách mua chào "hi" dễ bị hỏi có căn
-- cần bán. Cùng cách 20261023e: dòng chưa ai sửa (cau = mac_dinh) chuyển sang câu mới; dòng chủ dự án đã sửa tay giữ nguyên.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('chao_lan_dau', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
{Goi} đang có căn chung cư, nhà phố hay đất cần gửi bán, cho thuê, hay đang tìm mua vậy ạ?', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
{Goi} đang có căn chung cư, nhà phố hay đất cần gửi bán, cho thuê, hay đang tìm mua vậy ạ?', 'Khách chào (hello / hi / alo / 👋) lần đầu. {ten} = tên trợ lý', 'Lời chào cũ, giữ (quyết định 20/10); 25/10 thêm "tìm mua" (SRS-5.1zzzzzzz174)', 11),
  ('chao_lam_moi', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
Em đã làm mới cuộc trò chuyện rồi ạ. {Goi} đang có căn chung cư, nhà phố hay đất cần gửi bán, cho thuê, hay đang tìm mua vậy ạ?', 'Chào {goi} ạ! Em là {ten}, trợ lý bất động sản của AI Ơi Nhà Đất. 🏡✨
Em đã làm mới cuộc trò chuyện rồi ạ. {Goi} đang có căn chung cư, nhà phố hay đất cần gửi bán, cho thuê, hay đang tìm mua vậy ạ?', 'Khách chào khi đã có chuyện cũ — làm mới phiên. {ten} = tên trợ lý', 'Quyết định 20/10: hello làm mới phiên; 25/10 thêm "tìm mua" (SRS-5.1zzzzzzz174)', 12)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
