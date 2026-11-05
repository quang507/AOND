-- 20261105b_cau_mau_bao_phi_thanh_cong — SRS-5.1zzzzzzz386 (chat thử 05/11/2026: khách hỏi "câu cuối chưa 'thành'… có phải thiếu chữ công"):
-- câu báo phí "chưa thành thì {goi} không tốn đồng nào" thiếu chữ → "chưa thành công thì …". Soát DB 05/11: dòng bao_phi cau = mac_dinh
-- (chưa ai sửa tay). Cùng cách 20261031a: dòng chưa sửa tay chuyển câu mới; đã sửa tay thì giữ câu, chỉ đổi mac_dinh. Chữ từ `cau_mau.MAC_DINH`.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('bao_phi', 'Đăng tin bên em miễn phí ạ. Phí môi giới là {phi}, chỉ thu khi giao dịch thành công — chưa thành công thì {goi} không tốn đồng nào.', 'Đăng tin bên em miễn phí ạ. Phí môi giới là {phi}, chỉ thu khi giao dịch thành công — chưa thành công thì {goi} không tốn đồng nào.', 'Báo con số phí (khách chưa biết phí / hỏi phí). {phi} = mức phí theo vai + bán hay thuê, code điền (vd "0.75 tháng tiền thuê") — câu sửa phải giữ {phi}', 'SRS-5.1zzzzzzz111 · câu tester 21/10; 31/10 chủ dự án viết lại, bỏ giọng tổng đài (SRS-5.1zzzzzzz315); 05/11 "chưa thành công" (SRS-5.1zzzzzzz386)', 3)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, nguon = excluded.nguon;
