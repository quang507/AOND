-- 20261113h_cau_mau_khop_giong — SRS-5.1zzzzzzz481 (chủ dự án 13/11/2026: "sửa luôn câu mẫu cho khớp giọng mới… vẫn quan trọng là lấy thông tin cho db").
-- 18 câu mẫu viết lại theo khối `prompts.GIONG` (SRS-5.1zzzzzzz480). Soát DB 13/11 trước khi viết: bảng `cau_mau` đang RỖNG (0 dòng) nên trang
-- /admin/cau-chuan không có câu nào để sửa — migration này nạp lại ĐỦ 60 khoá từ `src/aioi/cau_mau.py` MAC_DINH. Cùng cách 20261102d: dòng chưa ai
-- sửa (cau = mac_dinh) nhận câu mới; dòng đã sửa tay giữ nguyên câu, chỉ đổi mac_dinh.
begin;

insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('duyet_tin', 'Em xin phép đăng tin ạ!', 'Em xin phép đăng tin ạ!', 'Khách duyệt bản nháp — đoạn đầu lời đáp (tin đã lên web)', 'SRS-5.1zzzzzzz103 · tester, chủ dự án 21/10', 1),
  ('hoi_phi', '{Goi} có thể vào {web} để theo dõi tin rao ạ. {Goi} biết phí môi giới bên em chưa ạ?', '{Goi} có thể vào {web} để theo dõi tin rao ạ. {Goi} biết phí môi giới bên em chưa ạ?', 'Ngay sau câu duyệt tin — tin nhắn thứ hai, câu hỏi phí (bot nói theo tinh thần câu này)', 'SRS-5.1zzzzzzz81 / 98 · bản anh Luận + câu tester 21/10', 2),
  ('bao_phi', 'Đăng tin bên em miễn phí ạ. Phí môi giới là {phi}, chỉ thu khi giao dịch thành công — chưa thành công thì {goi} không tốn đồng nào.', 'Đăng tin bên em miễn phí ạ. Phí môi giới là {phi}, chỉ thu khi giao dịch thành công — chưa thành công thì {goi} không tốn đồng nào.', 'Báo con số phí (khách chưa biết phí / hỏi phí). {phi} = mức phí theo vai + bán hay thuê, code điền (vd "0.75 tháng tiền thuê") — câu sửa phải giữ {phi}', 'SRS-5.1zzzzzzz111 · câu tester sửa ở Câu chuẩn 21/10; 31/10 chủ dự án: viết lại, bỏ giọng tổng đài (SRS-5.1zzzzzzz315)', 3),
  ('nhac_ban_nhap', 'Em gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn em hỗ trợ ạ!', 'Em gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn em hỗ trợ ạ!', 'Tin nhắc sau 5 phút khách chưa trả lời bản nháp', 'SRS-5.1zzzzzzz99 / 101 · câu tester 21/10', 4),
  ('nhac_ban_nhap_em', '{Toi} gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn {toi} hỗ trợ nhé!', '{Toi} gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn {toi} hỗ trợ nhé!', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý)', 'SRS-5.1zzzzzzz101 · 214', 5),
  ('xin_cham_sao', '{Goi} chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ.', '{Goi} chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ.', 'Xin khách chấm sao — một lần, sau khi tin lên web và nói xong phí / khách mua đủ thông tin căn', 'SRS-5.1zzzzzzz104 · chủ dự án chốt 21/10', 6),
  ('xin_cham_sao_em', '{Goi} chấm giúp {toi} 1–5 sao cho lần hỗ trợ này nha, để {toi} làm tốt hơn nhé.', '{Goi} chấm giúp {toi} 1–5 sao cho lần hỗ trợ này nha, để {toi} làm tốt hơn nhé.', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý)', 'SRS-5.1zzzzzzz104 · 214', 7),
  ('giu_cho', '{Toi} đang xem kỹ thông tin {goi} gửi, {goi} chờ {toi} một chút nhé, {toi} trả lời ngay ạ.', '{Toi} đang xem kỹ thông tin {goi} gửi, {goi} chờ {toi} một chút nhé, {toi} trả lời ngay ạ.', 'Lượt trả lời bị lỗi — giữ chỗ, bot tự làm lại sau 20 giây', 'SRS-5.1zzzzzzz82 · đánh giá UX 20/10; 29/10 gọi theo cách khách xưng (SRS-5.1zzzzzzz267)', 8),
  ('thu_lai_hong', '{Toi} xin lỗi {goi}, hệ thống bên {toi} đang chậm. {Toi} đã báo người phụ trách xem tin nhắn của {goi}, người phụ trách sẽ nhắn lại sớm ạ.', '{Toi} xin lỗi {goi}, hệ thống bên {toi} đang chậm. {Toi} đã báo người phụ trách xem tin nhắn của {goi}, người phụ trách sẽ nhắn lại sớm ạ.', 'Làm lại vẫn lỗi — xin lỗi và báo người phụ trách (server gọi `bao_can_nguoi`)', 'SRS-5.1zzzzzzz82; 29/10 bỏ "anh/chị" viết cứng và "của mình" (SRS-5.1zzzzzzz267)', 9),
  ('chao_lan_dau', 'Chào {goi}! Em là {ten}, trợ lý ký gửi nhà đất của AI Ơi Nhà Đất 🏡
{Goi} đang có căn nào muốn gửi bán hay cho thuê? {Goi} cứ kể căn ở đâu, giá mong muốn bao nhiêu, đủ thông tin là có bản tin gửi {goi} xem trước nha.', 'Chào {goi}! Em là {ten}, trợ lý ký gửi nhà đất của AI Ơi Nhà Đất 🏡
{Goi} đang có căn nào muốn gửi bán hay cho thuê? {Goi} cứ kể căn ở đâu, giá mong muốn bao nhiêu, đủ thông tin là có bản tin gửi {goi} xem trước nha.', 'Khách chào (hello / hi / alo / 👋) lần đầu ở số KÝ GỬI. {ten} = tên trợ lý', 'Lời chào cũ (20/10); 26/10 một câu hỏi (SRS-212); 28/10 số ký gửi chỉ hỏi gửi bán / cho thuê — số tư vấn lo người mua (SRS-5.1zzzzzzz251); 13/11 mời kể luôn địa chỉ và giá (SRS-5.1zzzzzzz481)', 10),
  ('chao_lam_moi', 'Chào {goi}! Em là {ten}, trợ lý ký gửi nhà đất của AI Ơi Nhà Đất 🏡
Em làm mới cuộc trò chuyện rồi nha. {Goi} đang có căn nào muốn gửi bán hay cho thuê?', 'Chào {goi}! Em là {ten}, trợ lý ký gửi nhà đất của AI Ơi Nhà Đất 🏡
Em làm mới cuộc trò chuyện rồi nha. {Goi} đang có căn nào muốn gửi bán hay cho thuê?', 'Khách chào khi đã có chuyện cũ — làm mới phiên (số ký gửi). {ten} = tên trợ lý', 'Quyết định 20/10: hello làm mới phiên; 26/10 bỏ kể loại nhà (SRS-212); 28/10 chỉ gửi bán / cho thuê (SRS-5.1zzzzzzz251)', 11),
  ('chao_tu_van', 'Chào {goi}! Em là {ten} bên AI Ơi Nhà Đất nè 🏡
{Goi} đang tìm mua hay thuê, khu nào, tầm giá bao nhiêu để em lọc căn hợp liền ạ?', 'Chào {goi}! Em là {ten} bên AI Ơi Nhà Đất nè 🏡
{Goi} đang tìm mua hay thuê, khu nào, tầm giá bao nhiêu để em lọc căn hợp liền ạ?', 'Khách chào lần đầu ở số Zalo TƯ VẤN người mua. {ten} = tên trợ lý', 'SRS-5.1zzzzzzz210 · chủ dự án 26/10: một số nhận ký gửi, một số tư vấn người mua; câu hỏi mở (SRS-5.1zzzzzzz212); 28/10 nói rõ vai tư vấn mua / thuê (SRS-5.1zzzzzzz261)', 12),
  ('mo_dau_nhap', '📋 Em sẽ rao như vầy nhé {goi}:', '📋 Em sẽ rao như vầy nhé {goi}:', 'Dòng mở bản nháp tin rao — phải bắt đầu 📋 và kết thúc dấu ":" (code cắt câu dẫn theo dòng này)', 'SRS-5.1zzzzzzz76 / 85 / 90', 13),
  ('mo_dau_nhap_em', '📋 {Toi} sẽ rao như vầy nhé {goi}:', '📋 {Toi} sẽ rao như vầy nhé {goi}:', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý) — phải bắt đầu 📋, kết thúc ":"', 'SRS-5.1zzzzzzz76 · 214', 14),
  ('hoi_ban_nhap', '{Goi} muốn sửa chỗ nào, hay em đăng luôn ạ?', '{Goi} muốn sửa chỗ nào, hay em đăng luôn ạ?', 'Câu hỏi cuối bản nháp (bot được dặn kết bản nháp bằng câu này)', 'Kịch bản người bán; 26/10 bỏ câu dẫn dắt "hấp dẫn chưa" (SRS-5.1zzzzzzz212)', 15),
  ('hoi_ban_nhap_em', '{Goi} muốn sửa chỗ nào, hay {toi} đăng luôn nhé?', '{Goi} muốn sửa chỗ nào, hay {toi} đăng luôn nhé?', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý)', 'Kịch bản người bán; 26/10 bỏ câu dẫn dắt (SRS-5.1zzzzzzz212); 27/10 bot xưng theo tên (SRS-5.1zzzzzzz214)', 16),
  ('xac_nhan_an', '{Goi} muốn em {viec}, đúng không ạ? Nhắn "đúng" để em làm, hoặc "thôi" để giữ nguyên nhé. Em không xóa dữ liệu đâu, chỉ ẩn tin, muốn rao lại lúc nào cũng được.', '{Goi} muốn em {viec}, đúng không ạ? Nhắn "đúng" để em làm, hoặc "thôi" để giữ nguyên nhé. Em không xóa dữ liệu đâu, chỉ ẩn tin, muốn rao lại lúc nào cũng được.', 'Khách bảo gỡ / ẩn căn — hỏi xác nhận trước. {viec} = việc sắp làm (vd "NGƯNG RAO căn A12")', 'Hỏi trước khi ẩn', 17),
  ('da_an_het', 'Em ngưng rao hết các tin của {goi} rồi nha. Dữ liệu em vẫn giữ nguyên, {goi} muốn rao lại căn nào cứ nhắn em.', 'Em ngưng rao hết các tin của {goi} rồi nha. Dữ liệu em vẫn giữ nguyên, {goi} muốn rao lại căn nào cứ nhắn em.', 'Khách đồng ý ẩn hết', 'Hỏi trước khi ẩn', 18),
  ('da_an_bot', 'Xong rồi {goi}, giờ còn {n} căn đang rao. Mấy căn kia em chuyển sang không rao, dữ liệu vẫn giữ, muốn rao lại lúc nào cũng được.', 'Xong rồi {goi}, giờ còn {n} căn đang rao. Mấy căn kia em chuyển sang không rao, dữ liệu vẫn giữ, muốn rao lại lúc nào cũng được.', 'Khách đồng ý ẩn bớt / chỉ giữ vài căn. {n} = số căn còn rao', 'Hỏi trước khi ẩn', 19),
  ('da_cap_nhat_ro', 'Em sửa các tin theo ý {goi} rồi nha.', 'Em sửa các tin theo ý {goi} rồi nha.', 'Khách đồng ý, việc khác ngoài ẩn', 'Hỏi trước khi ẩn', 20),
  ('giu_nguyen_ro', 'Vậy em giữ nguyên các tin, không xóa gì hết nha {goi}.', 'Vậy em giữ nguyên các tin, không xóa gì hết nha {goi}.', 'Khách không đồng ý ẩn', 'Hỏi trước khi ẩn', 21),
  ('da_an_anh', 'Em ẩn tấm đó khỏi tin rồi nha, có tấm khác chụp góc đó thì {goi} gửi em thay nhé.', 'Em ẩn tấm đó khỏi tin rồi nha, có tấm khác chụp góc đó thì {goi} gửi em thay nhé.', 'Chủ đồng ý ẩn tấm ảnh Image LQC xin ẩn (SRS-5.1zzzzzzz425)', 'Hỏi trước khi ẩn', 22),
  ('giu_anh', 'Vậy em giữ nguyên tấm đó nha {goi}.', 'Vậy em giữ nguyên tấm đó nha {goi}.', 'Chủ không muốn ẩn tấm ảnh Image LQC xin ẩn (SRS-5.1zzzzzzz425)', 'Hỏi trước khi ẩn', 23),
  ('an_anh_hut', 'Em chưa ẩn được tấm đó, em nhờ người phụ trách xử lý giúp nha.', 'Em chưa ẩn được tấm đó, em nhờ người phụ trách xử lý giúp nha.', 'Chủ đồng ý ẩn ảnh nhưng ẩn hụt (lỗi kho) — SRS-5.1zzzzzzz425', 'Hỏi trước khi ẩn', 24),
  ('file_qua_lon', 'File này nặng quá (hơn 20MB) nên em chưa mở được, {goi} thông cảm nha. Em báo người phụ trách rồi, bên em sẽ vào chat này xem file rồi xử lý, {goi} không cần làm gì thêm.', 'File này nặng quá (hơn 20MB) nên em chưa mở được, {goi} thông cảm nha. Em báo người phụ trách rồi, bên em sẽ vào chat này xem file rồi xử lý, {goi} không cần làm gì thêm.', 'Khách gửi file / ảnh quá 20 MB — đã báo admin', 'Nhận tệp', 25),
  ('link_thu_muc_drive', 'Link này là cả thư mục Drive nên em chưa mở được. {Goi} gửi từng ảnh / file (hoặc link từng tấm) giúp em nhé.', 'Link này là cả thư mục Drive nên em chưa mở được. {Goi} gửi từng ảnh / file (hoặc link từng tấm) giúp em nhé.', 'Khách gửi link THƯ MỤC Google Drive (chưa đọc được)', 'Nhận tệp', 26),
  ('link_khong_mo_duoc', 'Em chưa mở được link này. {Goi} chụp rồi gửi thẳng giúp em vài tấm nhé.', 'Em chưa mở được link này. {Goi} chụp rồi gửi thẳng giúp em vài tấm nhé.', 'Khách gửi link ảnh / tệp không tải được', 'Nhận tệp', 27),
  ('link_web_trong', 'Em mở link rồi mà chưa đọc được nội dung. {Goi} gửi link khác, hoặc dán nội dung giúp em nhé.', 'Em mở link rồi mà chưa đọc được nội dung. {Goi} gửi link khác, hoặc dán nội dung giúp em nhé.', 'Khách gửi link trang web mà trang trống', 'Nhận tệp', 28),
  ('nhap_bang_tinh', 'Em nhận bảng tính rồi, đã nhập {n} căn vào danh sách tin 🎉 {Goi} xem lại giúp em có sót căn nào không nhé.', 'Em nhận bảng tính rồi, đã nhập {n} căn vào danh sách tin 🎉 {Goi} xem lại giúp em có sót căn nào không nhé.', 'Khách gửi link bảng tính (rổ hàng). {n} = số căn đã nhập', 'Nhận tệp', 29),
  ('bang_tinh_trong', 'Em có nhận bảng tính nhưng chưa đọc ra căn nào — {goi} kiểm tra lại các cột (loại hình, địa chỉ, diện tích, giá...) giúp em nhé.', 'Em có nhận bảng tính nhưng chưa đọc ra căn nào — {goi} kiểm tra lại các cột (loại hình, địa chỉ, diện tích, giá...) giúp em nhé.', 'Bảng tính không đọc ra căn nào', 'Nhận tệp', 30),
  ('chua_co_ban_ve', 'Em chưa có bản vẽ / mặt bằng {can}. {Goi} có file bản vẽ thì gửi em, em gắn vào tin ngay. Các tin đang rao em vẫn giữ nguyên.', 'Em chưa có bản vẽ / mặt bằng {can}. {Goi} có file bản vẽ thì gửi em, em gắn vào tin ngay. Các tin đang rao em vẫn giữ nguyên.', 'Khách xin bản vẽ / mặt bằng mà chưa có. {can} = căn đang nói (vd "căn A12 (mẫu Fusion)"). 27/10 (SRS-216): bỏ "để em xin bên dự án rồi gửi lại" — không có đường nào xin; bản vẽ admin nạp vào kho dự án thì bot tự gửi như ảnh dự án', 'Bản vẽ · SRS-5.1zzzzzzz216', 31),
  ('nhac_hoi_lai', '{Goi} ơi, {toi} hỏi lại chút nha: {hoi}', '{Goi} ơi, {toi} hỏi lại chút nha: {hoi}', 'Tin nhắc sau 5 phút khách im — hỏi lại câu bot vừa hỏi. {toi} = bot tự xưng (em / anh / chị / cô / chú), {hoi} = câu bot vừa hỏi', 'SRS-5.1zzzzzzz73', 32),
  ('nhac_xin_anh', 'Khi nào tiện {goi} chụp gửi em vài tấm ảnh thực tế nhé, để tin đăng nổi bật và hút khách hơn ạ.', 'Khi nào tiện {goi} chụp gửi em vài tấm ảnh thực tế nhé, để tin đăng nổi bật và hút khách hơn ạ.', 'Tin nhắc sau 5 phút khi không còn câu chờ và căn chưa có ảnh', 'SRS-5.1zzzzzzz73', 33),
  ('nhac_xin_anh_em', 'Khi nào tiện {goi} chụp gửi {toi} vài tấm ảnh thực tế nhé, để tin đăng nổi bật và hút khách hơn nè.', 'Khi nào tiện {goi} chụp gửi {toi} vài tấm ảnh thực tế nhé, để tin đăng nổi bật và hút khách hơn nè.', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý)', 'SRS-5.1zzzzzzz73 · 214', 34),
  ('xin_anh_sau_dang', '{Goi} tiện thì chụp thêm giúp {toi} vài tấm ảnh thực tế của căn nha, tin nhiều ảnh khách hỏi nhiều hơn hẳn.', '{Goi} tiện thì chụp thêm giúp {toi} vài tấm ảnh thực tế của căn nha, tin nhiều ảnh khách hỏi nhiều hơn hẳn.', 'Tin nhắc 10 phút sau khi tin đã lên web mà chưa đủ ảnh — chỉ dùng khi model viết tin nhắc hụt (bình thường model viết theo góc hợp nhánh căn)', 'SRS-5.1zzzzzzz421', 35),
  ('bao_can_moi', '{Goi} ơi, {toi} đang có căn này hợp với nhu cầu của {goi} nè, {goi} xem qua nha.

{Mo_ta}. {vi_sao}

Xem hình và chi tiết ở đây ạ: {link}

{Goi} có muốn {toi} sắp lịch xem thử không ạ?', '{Goi} ơi, {toi} đang có căn này hợp với nhu cầu của {goi} nè, {goi} xem qua nha.

{Mo_ta}. {vi_sao}

Xem hình và chi tiết ở đây ạ: {link}

{Goi} có muốn {toi} sắp lịch xem thử không ạ?', 'Tin chủ động báo khách mua có căn mới vừa nhu cầu (8–21 giờ, tối đa 1 tin / khách / 24 giờ). MỖI ĐOẠN cách nhau một dòng trống là MỘT tin Zalo (ảnh căn gửi ngay sau đoạn có {link}). {toi} = bot tự xưng (em / anh / chị / cô / chú), {Mo_ta} (hoặc {mo_ta}, chữ thường) = loại, đường, phường, quận, diện tích, giá, phòng ngủ, {vi_sao} = vì sao hợp (khu, loại, ngân sách, xe hơi — code ghép từ dữ liệu), {link} = link căn', 'SRS-5.1zzzzzzz150 / 159 · chủ dự án 23/10', 36),
  ('bao_can_moi_vuot', '{Goi} ơi, {toi} đang có căn này gần với nhu cầu của {goi} nè, {goi} xem qua nha.

{Mo_ta}. {vi_sao} Giá nhỉnh hơn ngân sách {goi} nêu khoảng {pct}%.

Xem hình và chi tiết ở đây ạ: {link}

{Goi} thấy sao, {toi} sắp lịch xem thử giúp {goi} nhé?', '{Goi} ơi, {toi} đang có căn này gần với nhu cầu của {goi} nè, {goi} xem qua nha.

{Mo_ta}. {vi_sao} Giá nhỉnh hơn ngân sách {goi} nêu khoảng {pct}%.

Xem hình và chi tiết ở đây ạ: {link}

{Goi} thấy sao, {toi} sắp lịch xem thử giúp {goi} nhé?', 'Như trên, khi giá vượt ngân sách một chút (tới 15 %). {pct} = % vượt, code tính', 'SRS-5.1zzzzzzz150 / 159 · chủ dự án 23/10', 37),
  ('bao_can_moi_2', 'Vừa có căn mới lên kệ, {toi} thấy khá sát chỗ {goi} đang tìm đó.

{Mo_ta}. {vi_sao}

Hình với thông tin đầy đủ {toi} để ở đây nè: {link}

Nếu {goi} ưng thì {toi} giữ lịch cho {goi} qua xem nhé?', 'Vừa có căn mới lên kệ, {toi} thấy khá sát chỗ {goi} đang tìm đó.

{Mo_ta}. {vi_sao}

Hình với thông tin đầy đủ {toi} để ở đây nè: {link}

Nếu {goi} ưng thì {toi} giữ lịch cho {goi} qua xem nhé?', 'Biến thể xoay vòng theo số tin báo đã gửi cho khách (SRS-5.1zzzzzzz188), cùng khung bốn đoạn và cùng chỗ giữ chữ với `bao_can_moi`', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 38),
  ('bao_can_moi_3', 'Hôm nay {toi} gặp một căn {goi} có thể thích đó.

{Mo_ta}. {vi_sao}

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy ổn, {toi} hẹn giờ cho {goi} đi xem luôn nha?', 'Hôm nay {toi} gặp một căn {goi} có thể thích đó.

{Mo_ta}. {vi_sao}

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy ổn, {toi} hẹn giờ cho {goi} đi xem luôn nha?', 'Biến thể xoay vòng theo số tin báo đã gửi cho khách (SRS-5.1zzzzzzz188), cùng khung bốn đoạn và cùng chỗ giữ chữ với `bao_can_moi`', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 39),
  ('bao_can_moi_4', 'Mới có thêm một căn đúng gu {goi} tìm nè, {goi} xem thử nha.

{Mo_ta}. {vi_sao}

Chi tiết và hình ảnh ở link này ạ: {link}

{Goi} có tiện đi xem không, để {toi} sắp xếp giúp {goi} ạ?', 'Mới có thêm một căn đúng gu {goi} tìm nè, {goi} xem thử nha.

{Mo_ta}. {vi_sao}

Chi tiết và hình ảnh ở link này ạ: {link}

{Goi} có tiện đi xem không, để {toi} sắp xếp giúp {goi} ạ?', 'Biến thể xoay vòng theo số tin báo đã gửi cho khách (SRS-5.1zzzzzzz188), cùng khung bốn đoạn và cùng chỗ giữ chữ với `bao_can_moi`', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 40),
  ('bao_can_moi_vuot_2', 'Vừa có căn mới lên kệ, {toi} thấy khá gần chỗ {goi} đang tìm đó.

{Mo_ta}. {vi_sao} Giá cao hơn mức {goi} đặt khoảng {pct}%.

Hình với thông tin đầy đủ {toi} để ở đây nè: {link}

Nếu {goi} thấy được thì {toi} giữ lịch cho {goi} qua xem nhé?', 'Vừa có căn mới lên kệ, {toi} thấy khá gần chỗ {goi} đang tìm đó.

{Mo_ta}. {vi_sao} Giá cao hơn mức {goi} đặt khoảng {pct}%.

Hình với thông tin đầy đủ {toi} để ở đây nè: {link}

Nếu {goi} thấy được thì {toi} giữ lịch cho {goi} qua xem nhé?', 'Biến thể xoay vòng của `bao_can_moi_vuot` (SRS-5.1zzzzzzz188), thêm {pct} = % vượt ngân sách', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 41),
  ('bao_can_moi_vuot_3', 'Hôm nay {toi} gặp một căn gần ý {goi}, có điều giá nhỉnh một chút.

{Mo_ta}. {vi_sao} Giá vượt ngân sách khoảng {pct}%.

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy chấp nhận được, {toi} hẹn giờ cho {goi} đi xem luôn nha?', 'Hôm nay {toi} gặp một căn gần ý {goi}, có điều giá nhỉnh một chút.

{Mo_ta}. {vi_sao} Giá vượt ngân sách khoảng {pct}%.

{Goi} bấm vào đây xem ảnh thật nha: {link}

Nếu {goi} thấy chấp nhận được, {toi} hẹn giờ cho {goi} đi xem luôn nha?', 'Biến thể xoay vòng của `bao_can_moi_vuot` (SRS-5.1zzzzzzz188), thêm {pct} = % vượt ngân sách', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 42),
  ('bao_can_moi_vuot_4', 'Mới có thêm một căn gần gu {goi} tìm nè, {goi} xem thử nha.

{Mo_ta}. {vi_sao} Lưu ý giá đang cao hơn ngân sách khoảng {pct}%.

Chi tiết và hình ảnh ở link này ạ: {link}

{Goi} có tiện đi xem không, để {toi} sắp xếp giúp {goi} ạ?', 'Mới có thêm một căn gần gu {goi} tìm nè, {goi} xem thử nha.

{Mo_ta}. {vi_sao} Lưu ý giá đang cao hơn ngân sách khoảng {pct}%.

Chi tiết và hình ảnh ở link này ạ: {link}

{Goi} có tiện đi xem không, để {toi} sắp xếp giúp {goi} ạ?', 'Biến thể xoay vòng của `bao_can_moi_vuot` (SRS-5.1zzzzzzz188), thêm {pct} = % vượt ngân sách', 'SRS-5.1zzzzzzz188 · chủ dự án 26/10: hai tin báo căn liền nhau trùng văn phong', 43),
  ('xac_nhan_lich', '{Goi} xác nhận giúp {toi}, {gio} {goi} đến xem căn {can} đúng không ạ?', '{Goi} xác nhận giúp {toi}, {gio} {goi} đến xem căn {can} đúng không ạ?', 'Khách mua đã nói đủ ngày và giờ xem nhà — bot hỏi xác nhận MỘT lần (model chép câu này, chỉ điền chỗ giữ chữ). {toi} = bot tự xưng (em / anh / chị / cô / chú), {gio} = ngày giờ khách đã nói (vd "4 giờ chiều nay"), {can} = đường hoặc khu của căn — câu sửa phải giữ {gio} và {can}', 'SRS-5.1zzzzzzz158 · câu người xem chat chị Ngân góp ý 23/10', 44),
  ('bao_tra_loi_chu_nha', 'Chủ nhà căn {ma} vừa trả lời câu {goi} hỏi “{cau_hoi}”: {tra_loi}
{Goi} còn muốn hỏi thêm gì về căn này không ạ?', 'Chủ nhà căn {ma} vừa trả lời câu {goi} hỏi “{cau_hoi}”: {tra_loi}
{Goi} còn muốn hỏi thêm gì về căn này không ạ?', 'Chủ nhà / admin trả lời câu khách mua hỏi (nhắc `followup`). {ma} = mã căn, {cau_hoi} = câu khách hỏi, {tra_loi} = câu trả lời, {toi} = bot tự xưng — câu sửa phải giữ {tra_loi}', 'SRS-5.1zzzzzzz216', 45),
  ('bao_lich_da_chot', 'Lịch xem căn {ma} của {goi} đã được chốt: {gio}. Tới giờ {goi} ghé xem nhé, có gì thay đổi {goi} nhắn {toi} ạ.', 'Lịch xem căn {ma} của {goi} đã được chốt: {gio}. Tới giờ {goi} ghé xem nhé, có gì thay đổi {goi} nhắn {toi} ạ.', 'Admin chốt lịch xem (`#mã: ok giờ`) → báo khách mua (nhắc `followup` có viewing_id). {ma} = mã căn, {gio} = giờ đã chốt, {toi} = bot tự xưng — câu sửa phải giữ {gio}', 'SRS-5.1zzzzzzz216', 46),
  ('bao_can_da_ban', 'Căn {ma} {goi} quan tâm vừa có người chốt mất rồi. {Goi} muốn {toi} tìm căn khác tương tự không?', 'Căn {ma} {goi} quan tâm vừa có người chốt mất rồi. {Goi} muốn {toi} tìm căn khác tương tự không?', 'Căn khách mua đã quan tâm chuyển sang đã chốt (nhắc `sold`). {ma} = mã căn, {toi} = bot tự xưng', 'SRS-5.1zzzzzzz216', 47),
  ('bao_them_anh', 'Chủ nhà căn {ma} vừa gửi thêm ảnh rồi {goi} ạ 📸 {Goi} xem ở đây nhé: {url}', 'Chủ nhà căn {ma} vừa gửi thêm ảnh rồi {goi} ạ 📸 {Goi} xem ở đây nhé: {url}', 'Chủ nhà gửi thêm ảnh sau khi khách mua xin (nhắc `followup`). {ma} = mã căn, {url} = link trang tin — câu sửa phải giữ {url}', 'SRS-5.1zzzzzzz254', 48),
  ('bao_tin_len_web', 'Tin của {goi} đã hiển thị trên web rồi ạ 🎉 {Goi} xem ở đây nhé: {url}', 'Tin của {goi} đã hiển thị trên web rồi ạ 🎉 {Goi} xem ở đây nhé: {url}', 'Tin chủ nhà đã duyệt mà lúc đó chưa hiển thị, nay đã lên web (nhắc `len_web`). {url} = link trang tin — câu sửa phải giữ {url}', 'SRS-5.1zzzzzzz254', 49),
  ('hoi_cam_nhan_sau_xem', '{Goi} đi xem căn {ma} rồi thấy sao ạ? {Goi} kể {toi} nghe vài dòng để {toi} tìm tiếp cho đúng ý nhé.', '{Goi} đi xem căn {ma} rồi thấy sao ạ? {Goi} kể {toi} nghe vài dòng để {toi} tìm tiếp cho đúng ý nhé.', '4 giờ sau giờ hẹn xem nhà (nhắc `feedback`). {ma} = mã căn, {toi} = bot tự xưng', 'SRS-5.1zzzzzzz216', 50),
  ('giu_ket_noi_mua', '{Goi} ơi, {toi} vẫn đang để mắt tìm căn hợp ý cho {goi}. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì {toi} không nhắn được nữa ạ 🙏', '{Goi} ơi, {toi} vẫn đang để mắt tìm căn hợp ý cho {goi}. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì {toi} không nhắn được nữa ạ 🙏', 'Khách mua im 6 ngày — giữ kết nối Zalo trước mốc 7 ngày (FR-63). {toi} = bot tự xưng', 'SRS-5.1zzzzzzz238', 51),
  ('giu_ket_noi_ban', '{Goi} ơi, {toi} vẫn đang giữ tin căn của {goi} trên hệ thống. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì có khách hỏi {toi} không báo {goi} được ạ 🙏', '{Goi} ơi, {toi} vẫn đang giữ tin căn của {goi} trên hệ thống. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì có khách hỏi {toi} không báo {goi} được ạ 🙏', 'Người bán im 6 ngày — giữ kết nối Zalo trước mốc 7 ngày (FR-63). {toi} = bot tự xưng', 'SRS-5.1zzzzzzz238', 52),
  ('hoi_con_ban', '{Goi} ơi, {toi} hỏi thăm chút: {can} của {goi} hiện {con} không ạ? Còn thì {goi} nhắn {toi} một chữ "còn" là được, bán / cọc rồi thì báo {toi} cập nhật tin cho đúng nha.', '{Goi} ơi, {toi} hỏi thăm chút: {can} của {goi} hiện {con} không ạ? Còn thì {goi} nhắn {toi} một chữ "còn" là được, bán / cọc rồi thì báo {toi} cập nhật tin cho đúng nha.', 'Tin rao quá 20 ngày chưa xác nhận — hỏi chủ nhà căn còn bán / còn cho thuê (lõi gửi, 8–21 giờ). {can} = các căn, {con} = "còn bán" / "còn cho thuê"', 'SRS-5.1zzzzzzz295', 53),
  ('du_an_hoi_mau_nha', '‘{ten}’ nghe giống MẪU NHÀ trong dự án “{du_an}” — đây là mẫu nhà của “{du_an}”, hay là một dự án riêng ạ? {Toi} hỏi cho chắc kẻo nhầm.', '‘{ten}’ nghe giống MẪU NHÀ trong dự án “{du_an}” — đây là mẫu nhà của “{du_an}”, hay là một dự án riêng ạ? {Toi} hỏi cho chắc kẻo nhầm.', 'Tên khách nói giống mẫu nhà của một dự án trong kho. {ten} = tên khách nói, {du_an} = dự án trong kho', 'SRS-5.1zzzzzzz250', 54),
  ('du_an_hoi_trung_ten', 'Dự án “{ten}” có phải cũng là “{du_an}” bên {toi} đang có không, hay là một dự án khác ạ? {Toi} hỏi cho chắc để khỏi tách nhầm thành 2 dự án.', 'Dự án “{ten}” có phải cũng là “{du_an}” bên {toi} đang có không, hay là một dự án khác ạ? {Toi} hỏi cho chắc để khỏi tách nhầm thành 2 dự án.', 'Tên dự án khách nói gần giống một dự án trong kho. {ten} = tên khách nói, {du_an} = dự án trong kho', 'SRS-5.1zzzzzzz250', 55),
  ('web_da_luu', '{Toi} đọc trang {host} rồi:

{tom_tat}

{Toi} ghi lại rồi (nguồn: {url}), lần sau {goi} hỏi là có ngay.', '{Toi} đọc trang {host} rồi:

{tom_tat}

{Toi} ghi lại rồi (nguồn: {url}), lần sau {goi} hỏi là có ngay.', 'Khách gửi link trang web về dự án đang rao — bot tóm tắt và ghi vào kiến thức dự án. {tom_tat} {url} {host} code điền', 'SRS-5.1zzzzzzz250', 56),
  ('web_hoi_du_an', '{Toi} đọc trang {host} rồi:

{tom_tat}

{Goi} đang rao dự án nào để {toi} gắn thông tin này vào cho đúng?', '{Toi} đọc trang {host} rồi:

{tom_tat}

{Goi} đang rao dự án nào để {toi} gắn thông tin này vào cho đúng?', 'Khách gửi link trang web mà chưa biết căn thuộc dự án nào. {tom_tat} {host} code điền', 'SRS-5.1zzzzzzz250', 57),
  ('ban_ve_gui_kem', 'Bản vẽ / mặt bằng mẫu {mau_nha} {toi} gửi kèm đây ạ 📐', 'Bản vẽ / mặt bằng mẫu {mau_nha} {toi} gửi kèm đây ạ 📐', 'Khách xin bản vẽ — ảnh bản vẽ mẫu nhà gửi kèm sau câu này. {mau_nha} = tên mẫu nhà', 'SRS-5.1zzzzzzz249', 58),
  ('ban_ve_pdf', 'Bản vẽ / mặt bằng mẫu {mau_nha} đây ạ 📐: {link}', 'Bản vẽ / mặt bằng mẫu {mau_nha} đây ạ 📐: {link}', 'Khách xin bản vẽ — mẫu nhà chỉ có bản PDF. {link} = đường dẫn PDF (bắt buộc)', 'SRS-5.1zzzzzzz249', 59),
  ('hoi_ro_can', '{Goi} nói rõ thêm giúp {toi} căn nào ạ?', '{Goi} nói rõ thêm giúp {toi} căn nào ạ?', 'Lượt tra rổ hàng không ra lời — hỏi lại khách căn nào', 'SRS-5.1zzzzzzz250', 60)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;

commit;
