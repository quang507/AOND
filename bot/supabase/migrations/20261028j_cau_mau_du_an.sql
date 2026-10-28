-- 20261028j_cau_mau_du_an — SRS-5.1zzzzzzz249 / 250 (chủ dự án 28/10/2026, mục 11: câu viết cứng "anh/chị" / "Em" trong luồng dự án đưa
-- sang câu mẫu có {goi} / {toi} — gọi đúng cách khách xưng, sửa được ở /admin/cau-chuan). Câu đã sửa tay ở CRM thì giữ.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('du_an_hoi_mau_nha', '‘{ten}’ nghe giống MẪU NHÀ trong dự án “{du_an}” — đây là mẫu nhà của “{du_an}”, hay là một dự án riêng ạ? {Toi} hỏi cho chắc kẻo nhầm.', '‘{ten}’ nghe giống MẪU NHÀ trong dự án “{du_an}” — đây là mẫu nhà của “{du_an}”, hay là một dự án riêng ạ? {Toi} hỏi cho chắc kẻo nhầm.', 'Tên khách nói giống mẫu nhà của một dự án trong kho. {ten} = tên khách nói, {du_an} = dự án trong kho', 'SRS-5.1zzzzzzz250', 47),
  ('du_an_hoi_trung_ten', 'Dự án “{ten}” có phải cũng là “{du_an}” bên {toi} đang có không, hay là một dự án khác ạ? {Toi} hỏi cho chắc để khỏi tách nhầm thành 2 dự án.', 'Dự án “{ten}” có phải cũng là “{du_an}” bên {toi} đang có không, hay là một dự án khác ạ? {Toi} hỏi cho chắc để khỏi tách nhầm thành 2 dự án.', 'Tên dự án khách nói gần giống một dự án trong kho. {ten} = tên khách nói, {du_an} = dự án trong kho', 'SRS-5.1zzzzzzz250', 48),
  ('web_da_luu', '{Toi} đọc trang **{host}** rồi ạ:

{tom_tat}

{Toi} đã ghi lại (nguồn: {url}) — lần sau {goi} hỏi là có ngay ạ 😊', '{Toi} đọc trang **{host}** rồi ạ:

{tom_tat}

{Toi} đã ghi lại (nguồn: {url}) — lần sau {goi} hỏi là có ngay ạ 😊', 'Khách gửi link trang web về dự án đang rao — bot tóm tắt và ghi vào kiến thức dự án. {tom_tat} {url} {host} code điền', 'SRS-5.1zzzzzzz250', 49),
  ('web_hoi_du_an', '{Toi} đọc trang **{host}** rồi ạ:

{tom_tat}

{Goi} đang rao dự án nào để {toi} gắn thông tin này vào cho đúng ạ?', '{Toi} đọc trang **{host}** rồi ạ:

{tom_tat}

{Goi} đang rao dự án nào để {toi} gắn thông tin này vào cho đúng ạ?', 'Khách gửi link trang web mà chưa biết căn thuộc dự án nào. {tom_tat} {host} code điền', 'SRS-5.1zzzzzzz250', 50),
  ('ban_ve_gui_kem', 'Bản vẽ / mặt bằng mẫu {mau_nha} {toi} gửi kèm đây ạ 📐', 'Bản vẽ / mặt bằng mẫu {mau_nha} {toi} gửi kèm đây ạ 📐', 'Khách xin bản vẽ — ảnh bản vẽ mẫu nhà gửi kèm sau câu này. {mau_nha} = tên mẫu nhà', 'SRS-5.1zzzzzzz249', 51),
  ('ban_ve_pdf', 'Bản vẽ / mặt bằng mẫu {mau_nha} đây ạ 📐: {link}', 'Bản vẽ / mặt bằng mẫu {mau_nha} đây ạ 📐: {link}', 'Khách xin bản vẽ — mẫu nhà chỉ có bản PDF. {link} = đường dẫn PDF (bắt buộc)', 'SRS-5.1zzzzzzz249', 52),
  ('hoi_ro_can', '{Goi} nói rõ thêm giúp {toi} căn nào ạ?', '{Goi} nói rõ thêm giúp {toi} căn nào ạ?', 'Lượt tra rổ hàng không ra lời — hỏi lại khách căn nào', 'SRS-5.1zzzzzzz250', 53)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
