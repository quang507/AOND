-- 20260922d — fact `doanh_thu` vào cột `rent_income_vnd` (22/09/2026, kịch bản D bắn thật).
--
-- "nhà cô đang cho thuê 30 triệu/tháng" (tin BÁN) → luật TS ghi fact `doanh_thu` = "30 triệu/tháng", nhưng
-- `listing_facts_sync_cols` chưa có nhánh, cột `rent_income_vnd` trống (điểm tin và bản nháp không thấy dòng tiền).
-- Thân hàm chép nguyên từ `schema.sql` đã vá — cổng md5 (`soat-migration.mjs`) so với DB.

CREATE OR REPLACE FUNCTION public.listing_facts_sync_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
