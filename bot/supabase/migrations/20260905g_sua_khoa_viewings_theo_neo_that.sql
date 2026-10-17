-- 20260905g — sửa khoá `viewings` của `20260905f`: gộp nhầm hai căn khác nhau.
--
-- LỖI CỦA BẢN TRƯỚC. `20260905f` khoá trên `(buyer_id, coalesce(listing_code,''))`.
-- Lúc viết nó tao nghĩ `listing_code` rỗng nghĩa là "khách chưa nói căn nào", nên
-- gom hết về chuỗi rỗng là đúng. Sai — bảng có sẵn ràng buộc
--
--     viewings_can_neo_check  CHECK (listing_id IS NOT NULL OR listing_code IS NOT NULL)
--
-- nghĩa là buổi xem LUÔN có neo, chỉ là neo bằng cột nào. Một buổi xem neo bằng
-- `listing_id` mà không có `listing_code` là hợp lệ và hay gặp. Khoá cũ biến MỌI
-- buổi xem kiểu đó thành cùng một khoá `(khách, '')` — tức khách hẹn xem căn A
-- rồi hẹn xem căn B là bị DB từ chối, một cuộc hẹn thật bị mất.
--
-- Đó là kiểu hỏng tệ hơn hẳn cái nó định vá: cạnh tranh cho ra một dòng thừa,
-- còn khoá sai cho ra một cuộc hẹn KHÔNG BAO GIỜ được ghi. Tìm ra nhờ ca kiểm
-- "hai căn khác nhau, neo bằng listing_id" — ca đó viết ra để chứng minh khoá
-- KHÔNG chặn nhầm, và nó chặn nhầm thật.
--
-- Nay khoá theo NEO THẬT: `coalesce(listing_code, listing_id::text)`. Ràng buộc
-- trên bảo đảm biểu thức này không bao giờ null. Hai buổi xem cùng căn nhưng
-- một cái neo bằng code, một cái neo bằng id thì KHÔNG bị coi là trùng — bỏ sót,
-- chấp nhận. Bỏ sót thì thừa một dòng; chặn nhầm thì mất một cuộc hẹn.

drop index if exists public.viewings_mot_hen_cho_moi_can_idx;

create unique index if not exists viewings_mot_hen_cho_moi_can_idx
  on public.viewings (buyer_id, coalesce(listing_code, listing_id::text))
  where status = 'pending';
