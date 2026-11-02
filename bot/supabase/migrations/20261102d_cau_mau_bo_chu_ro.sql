-- 20261102d_cau_mau_bo_chu_ro — câu mẫu không nói chữ "rổ" / "rổ hàng" với khách (SRS-5.1zzzzzzz356). Năm câu (`da_an_het`, `da_cap_nhat_ro`,
-- `giu_nguyen_ro`, `nhap_bang_tinh`, `chua_co_ban_ve`) lộ từ nội bộ; câu mẫu không qua lưới `tu_noi_bo` của `_soat_hinh_thuc` (SRS-343).
-- Cùng cách 20261027e: dòng chưa ai sửa (cau = mac_dinh) chuyển sang câu mới; dòng chủ dự án đã sửa tay giữ nguyên câu, chỉ đổi mac_dinh.
-- Soát DB 02/11 trước khi viết: cả 5 dòng đều cau = mac_dinh (chưa ai sửa tay). Chữ sinh từ `src/aioi/cau_mau.py` MAC_DINH.
begin;

insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('da_an_het', 'Em đã NGƯNG RAO toàn bộ các tin của {goi} ạ — các tin giờ ở trạng thái **không rao** (em vẫn giữ nguyên dữ liệu, {goi} muốn rao lại căn nào cứ nhắn em). 🙈', 'Em đã NGƯNG RAO toàn bộ các tin của {goi} ạ — các tin giờ ở trạng thái **không rao** (em vẫn giữ nguyên dữ liệu, {goi} muốn rao lại căn nào cứ nhắn em). 🙈', 'Khách đồng ý ẩn hết', 'Hỏi trước khi ẩn', 19),
  ('da_cap_nhat_ro', 'Em đã cập nhật các tin rồi ạ.', 'Em đã cập nhật các tin rồi ạ.', 'Khách đồng ý, việc khác ngoài ẩn', 'Hỏi trước khi ẩn', 21),
  ('giu_nguyen_ro', 'Em giữ nguyên các tin, không xóa gì đâu ạ 👍', 'Em giữ nguyên các tin, không xóa gì đâu ạ 👍', 'Khách không đồng ý ẩn', 'Hỏi trước khi ẩn', 22),
  ('nhap_bang_tinh', 'Em nhận được bảng tính rồi, đã nhập {n} căn vào danh sách tin ạ! 🎉 {Goi} xem lại giúp em nhé.', 'Em nhận được bảng tính rồi, đã nhập {n} căn vào danh sách tin ạ! 🎉 {Goi} xem lại giúp em nhé.', 'Khách gửi link bảng tính (rổ hàng). {n} = số căn đã nhập', 'Nhận tệp', 26),
  ('chua_co_ban_ve', 'Em CHƯA có bản vẽ/mặt bằng {can} ạ 😅. {Goi} có file bản vẽ thì gửi giúp em, em gắn vào tin ngay nhé! (Các tin đang rao em giữ nguyên ạ.)', 'Em CHƯA có bản vẽ/mặt bằng {can} ạ 😅. {Goi} có file bản vẽ thì gửi giúp em, em gắn vào tin ngay nhé! (Các tin đang rao em giữ nguyên ạ.)', 'Khách xin bản vẽ / mặt bằng mà chưa có. {can} = căn đang nói (vd "căn A12 (mẫu Fusion)"). 27/10 (SRS-216): bỏ "để em xin bên dự án rồi gửi lại" — không có đường nào xin; bản vẽ admin nạp vào kho dự án thì bot tự gửi như ảnh dự án', 'Bản vẽ · SRS-5.1zzzzzzz216', 30)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon;

commit;
