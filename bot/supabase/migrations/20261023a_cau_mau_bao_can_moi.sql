-- 20261023a — Câu mẫu cố định: hai câu báo khách mua có căn mới vừa nhu cầu (SRS-5.1zzzzzzz150, chủ dự án 23/10/2026). Dòng sinh từ
-- cau_mau.MAC_DINH; dòng đã có thì chỉ làm mới câu gốc / mô tả, KHÔNG đụng câu chủ dự án đã sửa (cột cau).
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('bao_can_moi', '{Goi} ơi, {toi} vừa có căn mới hợp nhu cầu của {goi}: {mo_ta}.
Xem hình và chi tiết ở đây ạ: {link}
{Goi} có muốn {toi} sắp lịch xem thử không ạ?', '{Goi} ơi, {toi} vừa có căn mới hợp nhu cầu của {goi}: {mo_ta}.
Xem hình và chi tiết ở đây ạ: {link}
{Goi} có muốn {toi} sắp lịch xem thử không ạ?', 'Tin chủ động báo khách mua có căn mới vừa nhu cầu (8–20 giờ, tối đa 1 tin / khách / 24 giờ). {toi} = em / mình, {mo_ta} = loại, đường, phường, quận, diện tích, giá, phòng ngủ, {link} = link căn', 'SRS-5.1zzzzzzz150 · chủ dự án 23/10', 32),
  ('bao_can_moi_vuot', '{Goi} ơi, {toi} vừa có căn mới gần với nhu cầu của {goi}: {mo_ta}. Giá nhỉnh hơn ngân sách {goi} nêu khoảng {pct}% ạ.
Xem hình và chi tiết ở đây ạ: {link}
{Goi} thấy sao, {toi} sắp lịch xem thử giúp {goi} nhé?', '{Goi} ơi, {toi} vừa có căn mới gần với nhu cầu của {goi}: {mo_ta}. Giá nhỉnh hơn ngân sách {goi} nêu khoảng {pct}% ạ.
Xem hình và chi tiết ở đây ạ: {link}
{Goi} thấy sao, {toi} sắp lịch xem thử giúp {goi} nhé?', 'Như trên, khi giá vượt ngân sách một chút (tới 15 %). {pct} = % vượt, code tính', 'SRS-5.1zzzzzzz150 · chủ dự án 23/10', 33)
on conflict (khoa) do update set mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
