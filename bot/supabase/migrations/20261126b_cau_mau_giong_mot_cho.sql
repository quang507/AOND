-- 20261126b_cau_mau_giong_mot_cho — SRS-5.1zzzzzzz546 (chủ dự án 26/11/2026: "kiểm tra lời chat của bot, tôi muốn các luật lệ để chỗ khác còn
-- tông giọng để riêng 1 chỗ"; "xem xét ở zalo thôi"). Giọng ở `src/aioi/giong.py`; câu mẫu `src/aioi/cau_mau.py` viết theo đó: bỏ "hỗ trợ",
-- "ạ" chồng với "nha" / "nhé", chữ HOA, emoji ngoài lời chào / báo tin đã đăng, nửa câu lý do khi xin ảnh; thêm khoá `tra_cuu_chua_co` (câu viết
-- cứng cũ trong hoi_sau_dang mở bằng "Dạ"). Soát DB 26/11 trước khi sinh: 60 dòng; 22 dòng đổi đều chưa ai sửa (cau = mac_dinh), 2 khoá mới.
-- Cùng cách 20261113h: dòng chưa ai sửa (cau = mac_dinh) nhận câu mới; dòng đã sửa tay giữ nguyên câu, chỉ đổi mac_dinh. thu_tu dòng cũ giữ nguyên.
begin;

insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('hoi_phi', '{Goi} có thể vào {web} để theo dõi tin rao. {Goi} biết phí môi giới bên em chưa ạ?', '{Goi} có thể vào {web} để theo dõi tin rao. {Goi} biết phí môi giới bên em chưa ạ?', 'Ngay sau câu duyệt tin — tin nhắn thứ hai, câu hỏi phí (bot nói theo tinh thần câu này)', 'SRS-5.1zzzzzzz81 / 98 · bản anh Luận + câu tester 21/10', 2),
  ('nhac_ban_nhap', 'Em gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm thì nhắn em nha!', 'Em gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm thì nhắn em nha!', 'Tin nhắc sau 5 phút khách chưa trả lời bản nháp', 'SRS-5.1zzzzzzz99 / 101 · câu tester 21/10', 4),
  ('nhac_ban_nhap_em', '{Toi} gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm thì nhắn {toi} nhé!', '{Toi} gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm thì nhắn {toi} nhé!', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý)', 'SRS-5.1zzzzzzz101 · 214', 5),
  ('xin_cham_sao', '{Goi} chấm giúp em 1–5 sao nha, để em làm tốt hơn.', '{Goi} chấm giúp em 1–5 sao nha, để em làm tốt hơn.', 'Xin khách chấm sao — một lần, sau khi tin lên web và nói xong phí / khách mua đủ thông tin căn', 'SRS-5.1zzzzzzz104 · chủ dự án chốt 21/10', 6),
  ('xin_cham_sao_em', '{Goi} chấm giúp {toi} 1–5 sao nha, để {toi} làm tốt hơn.', '{Goi} chấm giúp {toi} 1–5 sao nha, để {toi} làm tốt hơn.', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý)', 'SRS-5.1zzzzzzz104 · 214', 7),
  ('giu_cho', '{Toi} đang xem kỹ thông tin {goi} gửi, {goi} chờ {toi} một chút nhé, {toi} trả lời ngay.', '{Toi} đang xem kỹ thông tin {goi} gửi, {goi} chờ {toi} một chút nhé, {toi} trả lời ngay.', 'Lượt trả lời bị lỗi — giữ chỗ, bot tự làm lại sau 20 giây', 'SRS-5.1zzzzzzz82 · đánh giá UX 20/10; 29/10 gọi theo cách khách xưng (SRS-5.1zzzzzzz267)', 8),
  ('xac_nhan_an', '{Goi} muốn em {viec}, đúng không ạ? Nhắn "đúng" để em làm, hoặc "thôi" để giữ nguyên nhé. Em không xóa dữ liệu đâu, chỉ ẩn tin, muốn rao lại lúc nào cũng được.', '{Goi} muốn em {viec}, đúng không ạ? Nhắn "đúng" để em làm, hoặc "thôi" để giữ nguyên nhé. Em không xóa dữ liệu đâu, chỉ ẩn tin, muốn rao lại lúc nào cũng được.', 'Khách bảo gỡ / ẩn căn — hỏi xác nhận trước. {viec} = việc sắp làm (vd "ngưng rao (ẩn) căn A12")', 'Hỏi trước khi ẩn', 17),
  ('nhap_bang_tinh', 'Em nhập xong {n} căn từ bảng tính rồi nha, {goi} xem giúp em có sót căn nào không?', 'Em nhập xong {n} căn từ bảng tính rồi nha, {goi} xem giúp em có sót căn nào không?', 'Khách gửi link bảng tính (rổ hàng). {n} = số căn đã nhập', 'Nhận tệp', 29),
  ('nhac_xin_anh', 'Khi nào tiện {goi} chụp gửi em vài tấm ảnh thực tế của căn nhé.', 'Khi nào tiện {goi} chụp gửi em vài tấm ảnh thực tế của căn nhé.', 'Tin nhắc sau 5 phút khi không còn câu chờ và căn chưa có ảnh', 'SRS-5.1zzzzzzz73', 33),
  ('nhac_xin_anh_em', 'Khi nào tiện {goi} chụp gửi {toi} vài tấm ảnh thực tế của căn nhé.', 'Khi nào tiện {goi} chụp gửi {toi} vài tấm ảnh thực tế của căn nhé.', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý)', 'SRS-5.1zzzzzzz73 · 214', 34),
  ('xin_anh_sau_dang', '{Goi} tiện thì chụp thêm giúp {toi} vài tấm ảnh thực tế của căn nha.', '{Goi} tiện thì chụp thêm giúp {toi} vài tấm ảnh thực tế của căn nha.', 'Tin nhắc 10 phút sau khi tin đã lên web mà chưa đủ ảnh — chỉ dùng khi model viết tin nhắc hụt (bình thường model viết theo góc hợp nhánh căn)', 'SRS-5.1zzzzzzz421', 35),
  ('bao_can_moi_3', 'Hôm nay {toi} gặp một căn {goi} có thể thích đó.

{Mo_ta}. {vi_sao}

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy ổn, {toi} hẹn giờ cho {goi} đi xem luôn nhé?', 'Hôm nay {toi} gặp một căn {goi} có thể thích đó.

{Mo_ta}. {vi_sao}

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy ổn, {toi} hẹn giờ cho {goi} đi xem luôn nhé?', 'Biến thể xoay vòng theo số tin báo đã gửi cho khách (SRS-5.1zzzzzzz188), cùng khung bốn đoạn và cùng chỗ giữ chữ với `bao_can_moi`', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 39),
  ('bao_can_moi_vuot_3', 'Hôm nay {toi} gặp một căn gần ý {goi}, có điều giá nhỉnh một chút.

{Mo_ta}. {vi_sao} Giá vượt ngân sách khoảng {pct}%.

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy chấp nhận được, {toi} hẹn giờ cho {goi} đi xem luôn nhé?', 'Hôm nay {toi} gặp một căn gần ý {goi}, có điều giá nhỉnh một chút.

{Mo_ta}. {vi_sao} Giá vượt ngân sách khoảng {pct}%.

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy chấp nhận được, {toi} hẹn giờ cho {goi} đi xem luôn nhé?', 'Biến thể xoay vòng của `bao_can_moi_vuot` (SRS-5.1zzzzzzz188), thêm {pct} = % vượt ngân sách', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 42),
  ('bao_lich_da_chot', 'Lịch xem căn {ma} của {goi} đã được chốt: {gio}. Tới giờ {goi} ghé xem nhé, có gì thay đổi thì nhắn {toi}.', 'Lịch xem căn {ma} của {goi} đã được chốt: {gio}. Tới giờ {goi} ghé xem nhé, có gì thay đổi thì nhắn {toi}.', 'Admin chốt lịch xem (`#mã: ok giờ`) → báo khách mua (nhắc `followup` có viewing_id). {ma} = mã căn, {gio} = giờ đã chốt, {toi} = bot tự xưng — câu sửa phải giữ {gio}', 'SRS-5.1zzzzzzz216', 46),
  ('bao_them_anh', 'Chủ nhà căn {ma} vừa gửi thêm ảnh rồi {goi} ạ. {Goi} xem ở đây nhé: {url}', 'Chủ nhà căn {ma} vừa gửi thêm ảnh rồi {goi} ạ. {Goi} xem ở đây nhé: {url}', 'Chủ nhà gửi thêm ảnh sau khi khách mua xin (nhắc `followup`). {ma} = mã căn, {url} = link trang tin — câu sửa phải giữ {url}', 'SRS-5.1zzzzzzz254', 48),
  ('giu_ket_noi_mua', '{Goi} ơi, {toi} vẫn đang để mắt tìm căn hợp ý cho {goi}. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì {toi} không nhắn được nữa ạ.', '{Goi} ơi, {toi} vẫn đang để mắt tìm căn hợp ý cho {goi}. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì {toi} không nhắn được nữa ạ.', 'Khách mua im 6 ngày — giữ kết nối Zalo trước mốc 7 ngày (FR-63). {toi} = bot tự xưng', 'SRS-5.1zzzzzzz238', 51),
  ('giu_ket_noi_ban', '{Goi} ơi, {toi} vẫn đang giữ tin căn của {goi} trên hệ thống. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì có khách hỏi {toi} không báo {goi} được ạ.', '{Goi} ơi, {toi} vẫn đang giữ tin căn của {goi} trên hệ thống. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì có khách hỏi {toi} không báo {goi} được ạ.', 'Người bán im 6 ngày — giữ kết nối Zalo trước mốc 7 ngày (FR-63). {toi} = bot tự xưng', 'SRS-5.1zzzzzzz238', 52),
  ('hoi_con_ban', '{Goi} ơi, {toi} hỏi thăm chút: {can} của {goi} hiện {con} không ạ? Còn thì {goi} nhắn {toi} một chữ "còn" là được, bán / cọc rồi thì báo {toi} sửa tin cho đúng nha.', '{Goi} ơi, {toi} hỏi thăm chút: {can} của {goi} hiện {con} không ạ? Còn thì {goi} nhắn {toi} một chữ "còn" là được, bán / cọc rồi thì báo {toi} sửa tin cho đúng nha.', 'Tin rao quá 20 ngày chưa xác nhận — hỏi chủ nhà căn còn bán / còn cho thuê (lõi gửi, 8–21 giờ). {can} = các căn, {con} = "còn bán" / "còn cho thuê"', 'SRS-5.1zzzzzzz295', 53),
  ('du_an_hoi_mau_nha', '‘{ten}’ nghe giống mẫu nhà trong dự án “{du_an}” — đây là mẫu nhà của “{du_an}”, hay là một dự án riêng ạ? {Toi} hỏi cho chắc kẻo nhầm.', '‘{ten}’ nghe giống mẫu nhà trong dự án “{du_an}” — đây là mẫu nhà của “{du_an}”, hay là một dự án riêng ạ? {Toi} hỏi cho chắc kẻo nhầm.', 'Tên khách nói giống mẫu nhà của một dự án trong kho. {ten} = tên khách nói, {du_an} = dự án trong kho', 'SRS-5.1zzzzzzz250', 54),
  ('web_da_luu', '{Toi} đọc trang {host} rồi:

{tom_tat}

Lần sau {goi} hỏi tới là {toi} trả lời được liền (nguồn: {url}).', '{Toi} đọc trang {host} rồi:

{tom_tat}

Lần sau {goi} hỏi tới là {toi} trả lời được liền (nguồn: {url}).', 'Khách gửi link trang web về dự án đang rao — bot tóm tắt và ghi vào kiến thức dự án. {tom_tat} {url} {host} code điền', 'SRS-5.1zzzzzzz250', 56),
  ('ban_ve_gui_kem', 'Bản vẽ / mặt bằng mẫu {mau_nha} {toi} gửi kèm đây ạ.', 'Bản vẽ / mặt bằng mẫu {mau_nha} {toi} gửi kèm đây ạ.', 'Khách xin bản vẽ — ảnh bản vẽ mẫu nhà gửi kèm sau câu này. {mau_nha} = tên mẫu nhà', 'SRS-5.1zzzzzzz249', 58),
  ('ban_ve_pdf', 'Bản vẽ / mặt bằng mẫu {mau_nha} đây ạ: {link}', 'Bản vẽ / mặt bằng mẫu {mau_nha} đây ạ: {link}', 'Khách xin bản vẽ — mẫu nhà chỉ có bản PDF. {link} = đường dẫn PDF (bắt buộc)', 'SRS-5.1zzzzzzz249', 59),
  ('bang_tinh_chua_mo', 'Em nhận link bảng tính rồi, nhưng nhập cả danh sách từ bảng tính hiện chỉ mở cho tài khoản môi giới đã kích hoạt. {Goi} nhắn em từng căn (địa chỉ, diện tích, giá) là em lên tin ngay nhé.', 'Em nhận link bảng tính rồi, nhưng nhập cả danh sách từ bảng tính hiện chỉ mở cho tài khoản môi giới đã kích hoạt. {Goi} nhắn em từng căn (địa chỉ, diện tích, giá) là em lên tin ngay nhé.', 'Người chưa phải môi giới đã duyệt gửi link bảng tính', 'Nhận tệp', 61),
  ('tra_cuu_chua_co', '{Goi} ơi, điều {goi} hỏi lúc nãy {toi} xem lại rồi, hiện bên {toi} chưa có dữ liệu đủ chắc nên {toi} không đoán. {Toi} chuyển câu hỏi cho người phụ trách xem thêm rồi, có thông tin là {toi} báo {goi} liền.', '{Goi} ơi, điều {goi} hỏi lúc nãy {toi} xem lại rồi, hiện bên {toi} chưa có dữ liệu đủ chắc nên {toi} không đoán. {Toi} chuyển câu hỏi cho người phụ trách xem thêm rồi, có thông tin là {toi} báo {goi} liền.', 'Điều bot đã hẹn tra cứu mà hết lượt thử vẫn không có dữ kiện (vòng nền `hoi_sau_dang`, code gửi, không qua model). {toi} = bot tự xưng', 'SRS-5.1zzzzzzz526 · 546: dời từ câu viết cứng trong hoi_sau_dang, bỏ "Dạ" mở đầu và "ạ" chồng', 62)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon;

commit;
