-- 20261028k_cau_mau_chao_ky_gui — SRS-5.1zzzzzzz251 (chủ dự án 28/10/2026: "giờ có 2 số rồi đó, 1 số chuyên gửi bán 1 số chuyên mua nhé, sửa câu
-- chào"): câu chào số ký gửi chỉ hỏi gửi bán / cho thuê, một câu. Câu đã sửa tay ở CRM thì giữ.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('chao_lan_dau', 'Chào {goi} ạ! Em là {ten}, trợ lý ký gửi nhà đất của AI Ơi Nhà Đất. 🏡✨
{Goi} đang có căn nào muốn gửi bán hay cho thuê ạ?', 'Chào {goi} ạ! Em là {ten}, trợ lý ký gửi nhà đất của AI Ơi Nhà Đất. 🏡✨
{Goi} đang có căn nào muốn gửi bán hay cho thuê ạ?', 'Khách chào (hello / hi / alo / 👋) lần đầu ở số KÝ GỬI. {ten} = tên trợ lý', 'Lời chào cũ (20/10); 26/10 một câu hỏi (SRS-212); 28/10 số ký gửi chỉ hỏi gửi bán / cho thuê — số tư vấn lo người mua (SRS-5.1zzzzzzz251)', 11),
  ('chao_lam_moi', 'Chào {goi} ạ! Em là {ten}, trợ lý ký gửi nhà đất của AI Ơi Nhà Đất. 🏡✨
Em đã làm mới cuộc trò chuyện rồi ạ. {Goi} đang có căn nào muốn gửi bán hay cho thuê ạ?', 'Chào {goi} ạ! Em là {ten}, trợ lý ký gửi nhà đất của AI Ơi Nhà Đất. 🏡✨
Em đã làm mới cuộc trò chuyện rồi ạ. {Goi} đang có căn nào muốn gửi bán hay cho thuê ạ?', 'Khách chào khi đã có chuyện cũ — làm mới phiên (số ký gửi). {ten} = tên trợ lý', 'Quyết định 20/10: hello làm mới phiên; 26/10 bỏ kể loại nhà (SRS-212); 28/10 chỉ gửi bán / cho thuê (SRS-5.1zzzzzzz251)', 12)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
