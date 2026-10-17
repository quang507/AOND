-- 07/09/2026 — `listing_media.sort_order` phải là SỐ THỨ TỰ, không phải một con
-- số bất kỳ nhặt được trong tên file.
--
-- ═══════════════ CHUYỆN ĐÃ XẢY RA ═══════════════
-- Lượt đẩy 1005 ảnh masterDB sáng nay mất 2 tấm. `up-anh.mjs` lấy `sort_order`
-- bằng `/(\d+)/` trên tên file; hai ảnh chụp bằng điện thoại mang tên dấu thời
-- gian ("20240912152429-2dc0_wm.jpg") nên nó nuốt trọn 14 chữ số. Vượt trần
-- int4 (2.147.483.647) → insert nổ:
--
--     value "20240912152429" is out of range for type integer
--
-- Nổ ĐÚNG SAU khi file đã lên kho, nên nhánh dọn dẹp của script xoá file vừa
-- up để khỏi để lại rác mồ côi. Kết quả: tấm ảnh biến mất hẳn, chỉ còn một
-- dòng `✗` trôi giữa 1005 dòng `✓`, script vẫn thoát 0 và in "Xong".
-- Mất 1 ảnh của #BDS-Q5-0020 và 1 của #BDS-Q5-0129 (đã đẩy bù).
--
-- ═══════════════ VÌ SAO KHÔNG NỚI SANG bigint ═══════════════
-- Nới cột là hết nổ. Nhưng rồi `20240912152429` được ghi vào như một thứ tự
-- HỢP LỆ: tấm đó xếp cuối vĩnh viễn, ảnh bìa có thể đổi, và KHÔNG AI BIẾT —
-- đổi một lỗi ồn ào lấy một lỗi câm. Repo này có cả một mục trong CLAUDE.md về
-- đúng loại hỏng đó.
--
-- `sort_order` mang nghĩa "tấm thứ mấy trong tin". Một tin có vài chục ảnh là
-- cùng. Vậy thì miền giá trị đúng của nó là số nhỏ, và ràng buộc phải NÓI RA
-- điều đó thay vì để kiểu dữ liệu nói hộ một cách tình cờ.
--
-- Vá ba tầng, mỗi tầng bắt một thứ khác nhau:
--   1. `up-anh.mjs` chỉ nhận số ≤ 4 chữ số  → không sinh ra giá trị bậy;
--   2. CHECK dưới đây                       → mọi đường ghi KHÁC cũng bị chặn,
--      và chặn với thông điệp đọc hiểu được thay vì "out of range";
--   3. `ghiLoi()` trong up-anh.mjs (FR-152)  → lần sau lỗi vào sổ `bot_errors`,
--      không trôi trong log rồi mất theo cửa sổ terminal.
--
-- Dữ liệu hiện tại: 1005 dòng, sort_order nằm trong [1, 99] — không dòng nào
-- vi phạm, nên thêm ràng buộc không cần dọn gì trước.

alter table public.listing_media
  drop constraint if exists listing_media_sort_order_hop_le;

alter table public.listing_media
  add constraint listing_media_sort_order_hop_le
  check (sort_order is null or (sort_order >= 0 and sort_order <= 9999));

comment on column public.listing_media.sort_order is
  'Thứ tự tấm ảnh trong tin (0-9999, ảnh bìa = nhỏ nhất). CỐ Ý là int4 hẹp: đây là số thứ tự, không phải nơi chứa dấu thời gian trong tên file. Xem migration 20260907a.';
