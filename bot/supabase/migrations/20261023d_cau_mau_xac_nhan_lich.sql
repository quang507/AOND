-- 20261023d — Câu mẫu cố định: câu bot hỏi khách mua xác nhận lịch hẹn xem (SRS-5.1zzzzzzz158, câu do người xem chat chị Ngân góp ý 23/10/2026).
-- Dòng sinh từ cau_mau.MAC_DINH; dòng đã có thì chỉ làm mới câu gốc / mô tả, KHÔNG đụng câu chủ dự án đã sửa (cột cau).
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('xac_nhan_lich', '{Goi} xác nhận giúp {toi}, {gio} mình đến xem căn {can} đúng không ạ?', '{Goi} xác nhận giúp {toi}, {gio} mình đến xem căn {can} đúng không ạ?', 'Khách mua đã nói đủ ngày và giờ xem nhà — bot hỏi xác nhận MỘT lần (model chép câu này, chỉ điền chỗ giữ chữ). {toi} = em / mình, {gio} = ngày giờ khách đã nói (vd "4 giờ chiều nay"), {can} = đường hoặc khu của căn — câu sửa phải giữ {gio} và {can}', 'SRS-5.1zzzzzzz158 · câu người xem chat chị Ngân góp ý 23/10', 34)
on conflict (khoa) do update set mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
