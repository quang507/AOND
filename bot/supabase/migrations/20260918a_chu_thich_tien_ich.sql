-- 20260918a — bảng `tien_ich` (20260911g) là bảng DUY NHẤT trong 37 bảng public chưa có
-- `comment on` (soát 18/09/2026 theo lệnh chủ dự án "kiểm tra lại hết… đồng bộ hết").
-- Luật CLAUDE.md §6: thêm bảng là thêm chú thích trong cùng migration — ở đây vá bù.
comment on table public.tien_ich is
  '[RỔ HÀNG] FR-204: tiện ích quanh tin (bệnh viện, trường, chợ, siêu thị, công viên) nạp từ OSM/Overpass trong 3 km khi geocode, và địa danh khách nhắc (dia_diem) tra Nominatim rồi nhớ lại. Nguồn cho listings.tien_ich_gan và câu "gần chợ nào". Chỉ admin đọc; geocode-listings (service_role) ghi.';
comment on column public.tien_ich.osm_id is 'Khoá OSM ("node/123", "way/456"); địa danh tra Nominatim cũng lưu theo khoá OSM của nó.';
comment on column public.tien_ich.loai is 'benh_vien | truong_hoc | cho | sieu_thi | cong_vien | dia_diem (địa danh khách nhắc, chat-reply tra và nhớ).';
comment on column public.tien_ich.ten_kd is 'Tên bỏ dấu, chữ thường, bỏ ký tự lạ (kdTen) — để so khớp lời khách gõ.';
comment on column public.tien_ich.cap_nhat_at is 'Lần nạp / tra gần nhất.';
