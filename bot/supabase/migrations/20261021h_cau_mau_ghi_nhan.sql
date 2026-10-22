-- 20261021h — Câu mẫu `ghi_nhan_mau`: các câu VÍ DỤ cho kiểu ghi nhận ngắn (SRS-5.1zzzzzzz120). Lê Quang 21/10/2026: "mấy cái em ghi nhận sửa ở chỗ
-- mẫu câu". Không phải câu nói nguyên văn — các câu cách nhau bằng "|", bot lấy làm mẫu và đổi kiểu mỗi lượt. Đặt cuối nhóm "Chốt từ 20/10"
-- (thu_tu 10); các dòng từ thu_tu 10 trở đi lùi một bậc. Dòng đã có thì chỉ làm mới câu gốc / mô tả, KHÔNG đụng câu chủ dự án đã sửa (cột cau).
update public.cau_mau set thu_tu = thu_tu + 1 where thu_tu >= 10 and not exists (select 1 from public.cau_mau where khoa = 'ghi_nhan_mau');
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('ghi_nhan_mau', 'Em ghi rồi ạ. | Em cảm ơn {goi}. | Em lưu vào tin rồi nha {goi}. | Em nắm rồi {goi}. | Em thêm vào tin rồi {goi}.', 'Em ghi rồi ạ. | Em cảm ơn {goi}. | Em lưu vào tin rồi nha {goi}. | Em nắm rồi {goi}. | Em thêm vào tin rồi {goi}.', 'KHÔNG phải câu nói nguyên văn: các câu VÍ DỤ cho kiểu ghi nhận ngắn khi khách vừa cho thông tin — cách nhau bằng dấu "|", bot đổi kiểu mỗi lượt, không lặp. Không bắt đầu bằng "Dạ" / "Vâng" (luật cấm Dạ — câu như vậy bị bỏ qua)', 'SRS-5.1zzzzzzz120 · Lê Quang 21/10: "mấy cái em ghi nhận sửa ở chỗ mẫu câu"', 10)
on conflict (khoa) do update set mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
