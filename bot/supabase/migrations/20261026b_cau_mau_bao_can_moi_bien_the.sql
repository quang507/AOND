-- 20261026b — Câu mẫu biến thể cho tin báo khách mua có căn mới (SRS-5.1zzzzzzz188, chủ dự án 26/10/2026: ảnh chụp hai tin báo liền nhau cùng mở lời,
-- cùng câu link, cùng câu hỏi — "nếu tin thứ 2 thì phải khác chứ, văn phong gì trùng nhau nữa"). Thêm 6 khoá: bao_can_moi_2/_3/_4 và bao_can_moi_vuot_2/_3/_4;
-- lõi xoay kiểu theo số tin báo đã gửi cho khách (bao_can_moi.SO_KIEU = 4, kiểu 0 là hai khoá cũ) nên hai tin liền nhau luôn khác khung.
-- Chủ dự án sửa từng khoá ở khung "Câu mẫu cố định" trang /admin/cau-chuan. Dòng đã có (chạy lại) chỉ đổi khi chưa ai sửa tay (cau = mac_dinh).
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('bao_can_moi_2', 'Vừa có căn mới lên kệ, {toi} thấy khá sát chỗ {goi} đang tìm đó.

{Mo_ta}. {vi_sao}

Hình với thông tin đầy đủ {toi} để ở đây nè: {link}

Nếu {goi} ưng thì {toi} giữ lịch cho {goi} qua xem nhé?', 'Vừa có căn mới lên kệ, {toi} thấy khá sát chỗ {goi} đang tìm đó.

{Mo_ta}. {vi_sao}

Hình với thông tin đầy đủ {toi} để ở đây nè: {link}

Nếu {goi} ưng thì {toi} giữ lịch cho {goi} qua xem nhé?', 'Biến thể xoay vòng theo số tin báo đã gửi cho khách (SRS-5.1zzzzzzz188), cùng khung bốn đoạn và cùng chỗ giữ chữ với `bao_can_moi`', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 34),
  ('bao_can_moi_3', 'Hôm nay {toi} gặp một căn {goi} có thể thích đó.

{Mo_ta}. {vi_sao}

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy ổn, {toi} hẹn giờ cho {goi} đi xem luôn nha?', 'Hôm nay {toi} gặp một căn {goi} có thể thích đó.

{Mo_ta}. {vi_sao}

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy ổn, {toi} hẹn giờ cho {goi} đi xem luôn nha?', 'Biến thể xoay vòng theo số tin báo đã gửi cho khách (SRS-5.1zzzzzzz188), cùng khung bốn đoạn và cùng chỗ giữ chữ với `bao_can_moi`', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 35),
  ('bao_can_moi_4', 'Mới có thêm một căn đúng gu {goi} tìm nè, {goi} xem thử nha.

{Mo_ta}. {vi_sao}

Chi tiết và hình ảnh ở link này ạ: {link}

{Goi} có tiện đi xem không, để {toi} sắp xếp giúp {goi} ạ?', 'Mới có thêm một căn đúng gu {goi} tìm nè, {goi} xem thử nha.

{Mo_ta}. {vi_sao}

Chi tiết và hình ảnh ở link này ạ: {link}

{Goi} có tiện đi xem không, để {toi} sắp xếp giúp {goi} ạ?', 'Biến thể xoay vòng theo số tin báo đã gửi cho khách (SRS-5.1zzzzzzz188), cùng khung bốn đoạn và cùng chỗ giữ chữ với `bao_can_moi`', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 36),
  ('bao_can_moi_vuot_2', 'Vừa có căn mới lên kệ, {toi} thấy khá gần chỗ {goi} đang tìm đó.

{Mo_ta}. {vi_sao} Giá cao hơn mức {goi} đặt khoảng {pct}%.

Hình với thông tin đầy đủ {toi} để ở đây nè: {link}

Nếu {goi} thấy được thì {toi} giữ lịch cho {goi} qua xem nhé?', 'Vừa có căn mới lên kệ, {toi} thấy khá gần chỗ {goi} đang tìm đó.

{Mo_ta}. {vi_sao} Giá cao hơn mức {goi} đặt khoảng {pct}%.

Hình với thông tin đầy đủ {toi} để ở đây nè: {link}

Nếu {goi} thấy được thì {toi} giữ lịch cho {goi} qua xem nhé?', 'Biến thể xoay vòng của `bao_can_moi_vuot` (SRS-5.1zzzzzzz188), thêm {pct} = % vượt ngân sách', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 37),
  ('bao_can_moi_vuot_3', 'Hôm nay {toi} gặp một căn gần ý {goi}, có điều giá nhỉnh một chút.

{Mo_ta}. {vi_sao} Giá vượt ngân sách khoảng {pct}%.

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy chấp nhận được, {toi} hẹn giờ cho {goi} đi xem luôn nha?', 'Hôm nay {toi} gặp một căn gần ý {goi}, có điều giá nhỉnh một chút.

{Mo_ta}. {vi_sao} Giá vượt ngân sách khoảng {pct}%.

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy chấp nhận được, {toi} hẹn giờ cho {goi} đi xem luôn nha?', 'Biến thể xoay vòng của `bao_can_moi_vuot` (SRS-5.1zzzzzzz188), thêm {pct} = % vượt ngân sách', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 38),
  ('bao_can_moi_vuot_4', 'Mới có thêm một căn gần gu {goi} tìm nè, {goi} xem thử nha.

{Mo_ta}. {vi_sao} Lưu ý giá đang cao hơn ngân sách khoảng {pct}%.

Chi tiết và hình ảnh ở link này ạ: {link}

{Goi} có tiện đi xem không, để {toi} sắp xếp giúp {goi} ạ?', 'Mới có thêm một căn gần gu {goi} tìm nè, {goi} xem thử nha.

{Mo_ta}. {vi_sao} Lưu ý giá đang cao hơn ngân sách khoảng {pct}%.

Chi tiết và hình ảnh ở link này ạ: {link}

{Goi} có tiện đi xem không, để {toi} sắp xếp giúp {goi} ạ?', 'Biến thể xoay vòng của `bao_can_moi_vuot` (SRS-5.1zzzzzzz188), thêm {pct} = % vượt ngân sách', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 39)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
