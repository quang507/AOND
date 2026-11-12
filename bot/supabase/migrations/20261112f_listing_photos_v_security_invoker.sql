-- 12/11/2026, soát truy vết: migration 20261112a (SRS-5.1zzzzzzz425) dựng lại view `listing_photos_v` bằng
-- `create or replace view` không kèm `with (security_invoker=true)` nên view rơi về chạy quyền chủ sở hữu (postgres)
-- — cùng lỗi SRS-5.1zzzzzzz327. Gắn lại. Anon vẫn đọc đủ ảnh qua policy `listing_media_doc_cong_khai`.
alter view public.listing_photos_v set (security_invoker = true);
