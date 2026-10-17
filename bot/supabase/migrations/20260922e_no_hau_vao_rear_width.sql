-- 20260922e — fact `no_hau` vào cột `rear_width_m` (22/09/2026, bắn lại kịch bản D sau deploy #191).
--
-- "nở hậu 4m5" → luật TS ghi fact `no_hau` = "4.5m" (đã vá cùng ngày), nhưng cột `rear_width_m` vẫn trống:
-- `boc_thong_so` chỉ đọc nở hậu khi câu CÓ chữ "nở hậu", đáp án đã cắt là "4.5m" — cùng hình lỗi `cach_mat_tien` 14/09.
-- Thân hàm chép nguyên từ `schema.sql` đã vá — cổng md5 (`soat-migration.mjs`) so với DB.

CREATE OR REPLACE FUNCTION public.listing_facts_sync_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
