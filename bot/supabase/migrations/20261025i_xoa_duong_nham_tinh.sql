-- 20261025i — Xoá dòng `duong` TP.HCM có toạ độ cách tâm phường > 50 km (SRS-5.1zzzzzzz186, chủ dự án 25/10/2026: "uk" sau khi kiểm toạ độ).
-- Soát 25/10: 19 dòng đường (Quốc lộ 20, Hùng Vương, Tà Lài, ...) nằm dưới "Phường Tân Phú / Quận Tân Phú" nhưng toạ độ ở huyện Tân Phú, Đồng Nai
-- (~100 km); trong đó một dòng tên là `"Huyện Tân Phú, Đồng Nai"` (cả dấu ngoặc kép). Nguồn: lượt nap-duong 08/10 (đa giác trùng tên ở tỉnh khác).
-- Đã đếm trước khi viết: 5 dòng khác lệch 16–20 km (Củ Chi, Hiệp Phước, Dầu Tiếng, Thanh An, Tây Nam) là đường dài trong xã lớn — KHÔNG đụng.
-- Hẻm / đường số của phường (330 hẻm + 34 đường thật) nằm trong 15 km của tâm phường nên cũng không bị đụng.
delete from public.duong d
 using public.wards w
 where w.ten_day_du = d.phuong
   and d.tinh = 'TP.HCM'
   and w.lat is not null and w.lng is not null
   and d.lat is not null and d.lng is not null
   and public.khoang_cach_m(d.lat, d.lng, w.lat::double precision, w.lng::double precision) > 50000;
