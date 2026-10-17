-- 20260922c — luật tiền nhận "ti" không dấu; fact `so_wc` vào cột `bathrooms` (22/09/2026, kịch bản C bắn thật).
--
-- (1) `parse_vnd`: "7 ti 5" trả null — "ti" không dấu chưa từng là tỷ ở cả SQL lẫn TS `docTien`, nên cổng
--     đối chiếu (`doi-chieu:tien`) không đỏ; hệ quả: chủ nhà sửa giá "7 ti 5" mà `price_raw` giữ "7ty2", bot vẫn
--     nói "đã sửa". Hai chỗ `ty` → `t[yi]`; ca mới ở `bot/tests/luat/tien.json`.
-- (2) `listing_facts_sync_cols`: "3pn 2wc" → fact `so_wc` = 2 (ai_kiem) nhưng `bathrooms` null — chưa có nhánh.
--     Thêm nhánh cùng luật với `so_phong_ngu` (1..20, đè theo bậc nguồn).
-- Thân hàm chép nguyên từ `schema.sql` đã vá — cổng md5 (`soat-migration.mjs`) so với DB.

CREATE OR REPLACE FUNCTION public.parse_vnd(p text)
 RETURNS bigint
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$

CREATE OR REPLACE FUNCTION public.listing_facts_sync_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
