-- 20261023e — Câu mẫu cố định: tin báo khách mua có căn mới thành 4 tin Zalo ngắn (SRS-5.1zzzzzzz159, chủ dự án 23/10/2026: "3 4 tin gì đó, nghe
-- người hơn tí"). Mỗi đoạn cách nhau một dòng trống trong câu là MỘT tin; thêm chỗ giữ chữ {Mo_ta} và {vi_sao}.
-- Server đọc MỌI dòng bảng cau_mau làm câu "đã sửa" nên đổi mặc định mà không đổi cột cau thì DB vẫn đè câu cũ: dòng NÀO CHƯA AI SỬA (cau = mac_dinh
-- cũ) được chuyển sang câu mới; dòng chủ dự án đã sửa tay (cau khác mac_dinh) giữ nguyên.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('bao_can_moi', '{Goi} ơi, {toi} đang có căn này hợp với nhu cầu của {goi} nè, {goi} xem qua nha.

{Mo_ta}. {vi_sao}

Xem hình và chi tiết ở đây ạ: {link}

{Goi} có muốn {toi} sắp lịch xem thử không ạ?', '{Goi} ơi, {toi} đang có căn này hợp với nhu cầu của {goi} nè, {goi} xem qua nha.

{Mo_ta}. {vi_sao}

Xem hình và chi tiết ở đây ạ: {link}

{Goi} có muốn {toi} sắp lịch xem thử không ạ?', 'Tin chủ động báo khách mua có căn mới vừa nhu cầu (8–20 giờ, tối đa 1 tin / khách / 24 giờ). MỖI ĐOẠN cách nhau một dòng trống là MỘT tin Zalo (ảnh căn gửi ngay sau đoạn có {link}). {toi} = em / mình, {Mo_ta} (hoặc {mo_ta}, chữ thường) = loại, đường, phường, quận, diện tích, giá, phòng ngủ, {vi_sao} = vì sao hợp (khu, loại, ngân sách, xe hơi — code ghép từ dữ liệu), {link} = link căn', 'SRS-5.1zzzzzzz150 / 159 · chủ dự án 23/10', 32),
  ('bao_can_moi_vuot', '{Goi} ơi, {toi} đang có căn này gần với nhu cầu của {goi} nè, {goi} xem qua nha.

{Mo_ta}. {vi_sao} Giá nhỉnh hơn ngân sách {goi} nêu khoảng {pct}%.

Xem hình và chi tiết ở đây ạ: {link}

{Goi} thấy sao, {toi} sắp lịch xem thử giúp {goi} nhé?', '{Goi} ơi, {toi} đang có căn này gần với nhu cầu của {goi} nè, {goi} xem qua nha.

{Mo_ta}. {vi_sao} Giá nhỉnh hơn ngân sách {goi} nêu khoảng {pct}%.

Xem hình và chi tiết ở đây ạ: {link}

{Goi} thấy sao, {toi} sắp lịch xem thử giúp {goi} nhé?', 'Như trên, khi giá vượt ngân sách một chút (tới 15 %). {pct} = % vượt, code tính', 'SRS-5.1zzzzzzz150 / 159 · chủ dự án 23/10', 33)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
