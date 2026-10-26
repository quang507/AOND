-- 20261026d — Chỉ mục riêng cho lớp đường của bản đồ /ban-do (SRS-5.1zzzzzzz206).
-- Đo 26/10: khung 0,08° × 0,12° (zoom ~14 ở màn rộng) đi `duong_lat_lng` mất ~2,9 s — 13.642 dòng khớp toạ độ thì 11.415 là hẻm bị lọc SAU
-- khi đã đọc heap (dòng `duong` nặng vì cột vector). Chỉ mục một phần chỉ gồm đường / đường số, mang sẵn cột hàm `ban_do_khung` trả
-- (ten, phuong, quan_cu) nên đọc được bằng index-only scan, không chạm heap.
create index if not exists duong_ban_do on public.duong (lat, lng) include (ten, phuong, quan_cu, loai)
  where loai in ('duong', 'so');

comment on index public.duong_ban_do is
  '[HỆ THỐNG] Lớp đường bản đồ /ban-do (ban_do_khung): chỉ đường + đường số, mang sẵn cột trả về để không đọc heap. SRS-5.1zzzzzzz206.';
