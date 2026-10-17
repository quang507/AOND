-- 20260905f — ba khoá chống ghi đúp cho ba chỗ SELECT-rồi-INSERT (soát 05/09/2026).
--
-- VÌ SAO. Soát toàn bộ edge function tìm mẫu "SELECT kiểm tồn tại → nếu chưa
-- có → INSERT". Mẫu đó KHÔNG nguyên tử: hai request chạy song song cùng đọc
-- "chưa có" rồi cùng ghi. Ở đây song song là chuyện thường, không phải hiếm:
--   · Zalo giao hai tin của cùng một người cách nhau vài trăm ms — `claim_inbound`
--     chỉ chặn giao TRÙNG một msg_id, hai msg_id KHÁC nhau chạy song song thật;
--   · cron `seller-drip-tick` nổ lúc :22 và :52 trong khi người bán đang gõ chat,
--     `ask-seller` và `chat-reply` cùng ghi vào `info_requests`.
--
-- Ba chỗ dưới đây có BẤT BIẾN NGHIỆP VỤ rõ ràng, phát biểu được bằng một chỉ
-- mục duy nhất, và chỉ mục đó KHÔNG đổi hành vi đang đúng — nó chỉ chặn đúng
-- cái mà code đã cố chặn bằng `count()`. Chỗ nào bất biến còn mơ hồ (các
-- escalation "một lần trong 24 giờ") thì CỐ Ý để nguyên: xem ghi chú cuối file.
--
-- Đã kiểm trước khi áp: không dòng nào hiện có vi phạm cả ba khoá.

-- ══ 1. info_requests — MỘT câu hỏi đang chờ cho mỗi (tin, loại thông tin) ══
-- `ask-seller` tự viết bất biến này trong comment của nó: "listing đang có bất
-- kỳ câu pending nào thì nhịp này bỏ qua, kẻo hai câu hỏi song song làm câu
-- trả lời của chủ nhà bị ghi nhầm fact". Nhưng nó bảo vệ bằng một `SELECT`
-- xong lọc trong JS — hai tiến trình cùng đọc tập rỗng là cùng ghi.
-- Hậu quả thật: chủ nhà nhận hai câu hỏi, trả lời một câu, câu trả lời bị gán
-- cho fact sai, và vòng hỏi nhỏ giọt đứng mãi ở một câu không ai trả lời.
create unique index if not exists info_requests_mot_cau_cho_idx
  on public.info_requests (listing_id, question)
  where status = 'pending';

-- ══ 2. reminders kind='viewing' — MỘT nhắc cho mỗi buổi xem ══
-- chat-reply đếm `reminders` theo `viewing_id` rồi mới ghi. Cùng khuôn với ba
-- chỉ mục đã có (`feedback`, `match`, `sold`, `reengage`) — `viewing` là cái
-- sót lại. Hậu quả thật: khách nhận hai tin nhắc cùng một buổi xem.
create unique index if not exists reminders_mot_nhac_moi_buoi_xem_idx
  on public.reminders (viewing_id)
  where kind = 'viewing' and status = 'pending' and viewing_id is not null;

-- ══ 3. viewings — MỘT buổi xem đang chờ cho mỗi (khách, căn) ══
-- chat-reply đọc buổi xem `pending` mới nhất của khách, thấy trùng căn thì
-- SỬA, không trùng thì THÊM. Hai tin song song cùng thấy "chưa có" là thành
-- hai buổi xem cho đúng một cuộc hẹn — rồi mỗi buổi đẻ một nhắc riêng, khách
-- bị nhắc hai lần cho một lần đi xem.
-- `coalesce(listing_code,'')` vì NULL trong chỉ mục duy nhất là KHÁC NHAU: để
-- trần thì đúng cái ca "khách hẹn xem mà chưa nói căn nào" — ca hay gặp nhất —
-- lại không được bảo vệ.
create unique index if not exists viewings_mot_hen_cho_moi_can_idx
  on public.viewings (buyer_id, coalesce(listing_code, ''))
  where status = 'pending';

-- ══ CỐ Ý KHÔNG KHOÁ ══
-- `reminders kind='escalation'` có ba chỗ đếm-rồi-ghi (đổi nhãn người bán,
-- chạm trần 100 tin/24h, khách cần người thật). Bất biến ở đó là "một lần
-- trong 24 GIỜ TRƯỢT", không phải "một lần cho mỗi khoá" — chỉ mục duy nhất
-- không phát biểu được cửa sổ trượt. Ép nó thành "một lần mỗi NGÀY LỊCH" là
-- ĐỔI HÀNH VI, không phải vá cạnh tranh. Đua ở đó cho ra một thông báo admin
-- lặp, không hỏng dữ liệu — ghi nhận, không sửa.
--
-- `deals` đã có `deals_listing_buyer_key`; chỗ hỏng nằm ở phía app (nuốt lỗi
-- ghi rồi vẫn chạy tiếp) nên vá trong chat-reply, không thêm gì ở DB.
