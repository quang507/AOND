-- 20261027h_cau_mau_bo_goi_minh — ba câu mẫu gọi KHÁCH là "mình" (SRS-5.1zzzzzzz226, chủ dự án 27/10/2026: "sửa luôn đi, sửa từ gốc nha").
-- `bao_phi` "Mình cần biết thêm thông tin…", `nhac_ban_nhap` "mình cần chỉnh sửa thêm…", `xac_nhan_lich` "… mình đến xem căn…" trái luật bot
-- không xưng "mình" với ai (SRS-171 / 214) và bị chính lưới `_goi_khach_la_minh` gọi lại model. Nay gọi theo cách xưng ({goi} / {Goi}, lõi
-- điền). Cùng cách 20261027e: dòng chưa ai sửa (cau = mac_dinh) chuyển sang câu mới; dòng đã sửa tay giữ nguyên (lõi tự dùng câu mặc định
-- nếu câu sửa tay còn gọi khách "mình").
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('bao_phi', 'Em xin phép báo phí bên em: phí môi giới bên em là {phi}. Chỉ thu khi giao dịch thành công. {Goi} cần biết thêm thông tin, nhắn em hỗ trợ ạ.', 'Em xin phép báo phí bên em: phí môi giới bên em là {phi}. Chỉ thu khi giao dịch thành công. {Goi} cần biết thêm thông tin, nhắn em hỗ trợ ạ.', 'Báo con số phí (khách chưa biết phí / hỏi phí). {phi} = mức phí theo vai + bán hay thuê, code điền (vd "0.75 tháng tiền thuê") — câu sửa phải giữ {phi}', 'SRS-5.1zzzzzzz111 · câu tester sửa ở Câu chuẩn 21/10; 27/10 bỏ gọi khách "mình" (SRS-5.1zzzzzzz226)', 3),
  ('nhac_ban_nhap', 'Em gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn em hỗ trợ ạ!', 'Em gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn em hỗ trợ ạ!', 'Tin nhắc sau 5 phút khách chưa trả lời bản nháp', 'SRS-5.1zzzzzzz99 / 101 · câu tester 21/10; 27/10 bỏ gọi khách "mình" (SRS-5.1zzzzzzz226)', 4),
  ('xac_nhan_lich', '{Goi} xác nhận giúp {toi}, {gio} {goi} đến xem căn {can} đúng không ạ?', '{Goi} xác nhận giúp {toi}, {gio} {goi} đến xem căn {can} đúng không ạ?', 'Khách mua đã nói đủ ngày và giờ xem nhà — bot hỏi xác nhận MỘT lần (model chép câu này, chỉ điền chỗ giữ chữ). {toi} = cách bot xưng, {gio} = ngày giờ khách đã nói (vd "4 giờ chiều nay"), {can} = đường hoặc khu của căn — câu sửa phải giữ {gio} và {can}', 'SRS-5.1zzzzzzz158 · câu người xem chat chị Ngân góp ý 23/10; 27/10 bỏ gọi khách "mình" (SRS-5.1zzzzzzz226)', 34)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon;
