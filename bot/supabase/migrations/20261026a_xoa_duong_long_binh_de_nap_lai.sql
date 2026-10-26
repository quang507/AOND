-- 20261026a — Xoá dòng `duong` của "Phường Long Bình" (TP.HCM) để nạp lại bằng script đã sửa (SRS-5.1zzzzzzz187).
-- Ca gốc: OSM có HAI relation cùng tên "Phường Long Bình" (Thủ Đức, 10,862°N 106,829°E và Biên Hòa, Đồng Nai, 10,946°N 106,902°E; cách ~12 km).
-- Lượt nap-duong 08/10 lấy cả hai (phép chặn đếm đa giác theo TÊN nên không kêu): đo 26/10 còn 27 đường + 25 hẻm nằm gần tâm Biên Hòa hơn
-- tâm phường và cách tâm phường > 8 km (Quốc lộ 1, Khu Công Nghiệp Amata, Vòng xoay Tam Hiệp, ...); phép lọc 50 km của SRS-186 không bắt được.
-- Không thể tách bằng SQL (không có đa giác trong DB) nên xoá hết 333 dòng của phường (66 đường + 160 hẻm + 107 đường số) và nạp lại
-- (`nap-duong --thieu` chỉ tra phường chưa có dòng nào, dùng relation gần tâm phường). Vector của các dòng mới do lịch nhung-dia-danh-tick nuôi.
delete from public.duong where tinh = 'TP.HCM' and phuong = 'Phường Long Bình';
