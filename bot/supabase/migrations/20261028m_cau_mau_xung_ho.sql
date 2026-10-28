-- 20261028m_cau_mau_xung_ho — SRS-5.1zzzzzzz254 (chủ dự án 28/10/2026: câu mẫu viết cứng "anh/chị", "Em" sai khi khách xưng em — "xóa luôn").
-- (1) Bỏ câu mẫu `nhan_anh` ("📎 Em đã nhận {n} ảnh của nhà mình…") — lõi không còn dòng nhận tệp. (2) `file_qua_lon`, `nhap_bang_tinh` bỏ "của mình"
-- (bot không gọi khách là "mình", SRS-5.1zzzzzzz230). (3) Hai câu mới: `bao_them_anh` (chủ nhà gửi thêm ảnh khách mua xin) và `bao_tin_len_web`
-- (tin chủ nhà đã duyệt nay hiển thị — nhắc `len_web`). Câu đã sửa tay ở CRM thì giữ.
delete from public.cau_mau where khoa = 'nhan_anh';
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('file_qua_lon', 'File to quá ạ (>20MB), xin lỗi em chưa xử lý được 😔. Em đã báo admin rồi ạ — {goi} không cần làm gì thêm đâu. Admin của em sẽ vào chat này đọc file / link rồi xử lý sau nhé!', 'File to quá ạ (>20MB), xin lỗi em chưa xử lý được 😔. Em đã báo admin rồi ạ — {goi} không cần làm gì thêm đâu. Admin của em sẽ vào chat này đọc file / link rồi xử lý sau nhé!', 'Khách gửi file / ảnh quá 20 MB — đã báo admin', 'Nhận tệp', 22),
  ('nhap_bang_tinh', 'Em nhận được bảng tính rồi, đã nhập {n} căn vào rổ hàng ạ! 🎉 {Goi} xem lại giúp em nhé.', 'Em nhận được bảng tính rồi, đã nhập {n} căn vào rổ hàng ạ! 🎉 {Goi} xem lại giúp em nhé.', 'Khách gửi link bảng tính (rổ hàng). {n} = số căn đã nhập', 'Nhận tệp', 26),
  ('bao_them_anh', 'Chủ nhà căn {ma} vừa gửi thêm ảnh rồi {goi} ạ 📸 {Goi} xem ở đây nhé: {url}', 'Chủ nhà căn {ma} vừa gửi thêm ảnh rồi {goi} ạ 📸 {Goi} xem ở đây nhé: {url}', 'Chủ nhà gửi thêm ảnh sau khi khách mua xin (nhắc `followup`). {ma} = mã căn, {url} = link trang tin — câu sửa phải giữ {url}', 'SRS-5.1zzzzzzz254', 53),
  ('bao_tin_len_web', 'Tin của {goi} đã hiển thị trên web rồi ạ 🎉 {Goi} xem ở đây nhé: {url}', 'Tin của {goi} đã hiển thị trên web rồi ạ 🎉 {Goi} xem ở đây nhé: {url}', 'Tin chủ nhà đã duyệt mà lúc đó chưa hiển thị, nay đã lên web (nhắc `len_web`). {url} = link trang tin — câu sửa phải giữ {url}', 'SRS-5.1zzzzzzz254', 54)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
