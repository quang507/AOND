-- 20261021d — Câu mẫu cố định: câu báo phí tester sửa ở trang Câu chuẩn thành câu mẫu `bao_phi` (SRS-5.1zzzzzzz111). Chủ dự án 21/10/2026:
-- "mấy câu mẫu đã sửa cũng cho lên trên câu mẫu lun". Đặt ngay sau câu hỏi phí (thu_tu 3) trong nhóm "Chốt từ 20/10"; các dòng từ thu_tu 3
-- trở đi lùi một bậc. Dòng đã có thì chỉ làm mới câu gốc / mô tả, KHÔNG đụng câu chủ dự án đã sửa (cột cau).
update public.cau_mau set thu_tu = thu_tu + 1 where thu_tu >= 3 and not exists (select 1 from public.cau_mau where khoa = 'bao_phi');
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('bao_phi', 'Em xin phép báo phí bên em: phí môi giới bên em là {phi}. Chỉ thu khi giao dịch thành công. Mình cần biết thêm thông tin, nhắn em hỗ trợ ạ.', 'Em xin phép báo phí bên em: phí môi giới bên em là {phi}. Chỉ thu khi giao dịch thành công. Mình cần biết thêm thông tin, nhắn em hỗ trợ ạ.', 'Báo con số phí (khách chưa biết phí / hỏi phí). {phi} = mức phí theo vai + bán hay thuê, code điền (vd "0.75 tháng tiền thuê") — câu sửa phải giữ {phi}', 'SRS-5.1zzzzzzz111 · câu tester sửa ở Câu chuẩn 21/10', 3)
on conflict (khoa) do update set mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
