-- 20261105b_cau_mau_bao_phi_thanh_cong — SRS-5.1zzzzzzz386 (chat thử 05/11/2026: khách hỏi "câu cuối chưa 'thành'… có phải thiếu chữ công"):
-- câu báo phí "chưa thành thì {goi} không tốn đồng nào" thiếu chữ → "chưa thành công thì …". Soát DB 05/11: dòng bao_phi cau = mac_dinh
-- (chưa ai sửa tay). Cùng cách 20261031a: dòng chưa sửa tay chuyển câu mới; đã sửa tay thì giữ câu, chỉ đổi mac_dinh. Chữ từ `cau_mau.MAC_DINH`.
update public.cau_mau set
  cau = case when cau = mac_dinh then 'Đăng tin bên em miễn phí ạ. Phí môi giới là {phi}, chỉ thu khi giao dịch thành công — chưa thành công thì {goi} không tốn đồng nào.' else cau end,
  mac_dinh = 'Đăng tin bên em miễn phí ạ. Phí môi giới là {phi}, chỉ thu khi giao dịch thành công — chưa thành công thì {goi} không tốn đồng nào.'
where khoa = 'bao_phi';
