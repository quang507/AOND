-- 20261031a_cau_mau_bao_phi — SRS-5.1zzzzzzz315 (chủ dự án 31/10/2026: "q3 viết lại"): câu báo phí cũ ("Em xin phép báo phí… nhắn em hỗ trợ ạ")
-- giám khảo bộ chấm chê giọng tổng đài. Câu mới giữ {phi} và ý "chỉ thu khi giao dịch thành công", gọi khách bằng {goi} (lõi truyền đúng cách
-- khách xưng). Câu đã sửa tay ở CRM thì giữ.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('bao_phi', 'Đăng tin bên em miễn phí ạ. Phí môi giới là {phi}, chỉ thu khi giao dịch thành công — chưa thành thì {goi} không tốn đồng nào.', 'Đăng tin bên em miễn phí ạ. Phí môi giới là {phi}, chỉ thu khi giao dịch thành công — chưa thành thì {goi} không tốn đồng nào.', 'Báo con số phí (khách chưa biết phí / hỏi phí). {phi} = mức phí theo vai + bán hay thuê, code điền (vd "0.75 tháng tiền thuê") — câu sửa phải giữ {phi}', 'SRS-5.1zzzzzzz111 · câu tester 21/10; 31/10 chủ dự án viết lại, bỏ giọng tổng đài (SRS-5.1zzzzzzz315)', 3)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
