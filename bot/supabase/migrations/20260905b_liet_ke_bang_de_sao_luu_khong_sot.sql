-- 20260905b — `liet_ke_bang()`: cho `sao-luu.mjs` tự biết nó đang bỏ sót bảng.
--
-- VÌ SAO. `scripts/sao-luu.mjs` liệt kê tay 22 bảng, kèm bình luận nói rõ ý đồ:
-- "CỐ TÌNH không tự dò bảng: tự dò thì thêm bảng mà quên là im lặng bỏ sót,
-- còn liệt kê tay thì thiếu là thấy ngay khi so với Dashboard." Ý đồ đúng,
-- nhưng cái "thấy ngay" đó phụ thuộc việc có người mở Dashboard ra so — và
-- suốt 27/08 → 05/09 không ai so. Soát hôm nay: DB có 30 bảng, danh sách có
-- 22. Tám bảng CHƯA TỪNG được sao lưu lần nào:
--
--   app_config · curated_lists · inbound_events · inbound_ledger
--   listing_media · media_cleanup_queue · property_events · ratings_log
--
-- Nặng nhất là `listing_media`: nó là bản đồ ảnh ↔ tin (FR-165). Mất nó thì
-- file trong Storage vẫn còn nhưng không ai biết ảnh nào của tin nào — coi như
-- mất ảnh. `curated_lists` mất thì mọi link /ds/<token> đã gửi khách chết.
--
-- Hàm này giữ nguyên ý đồ liệt kê tay (danh sách vẫn nằm trong script, đọc là
-- thấy) nhưng biến "bỏ sót im lặng" thành "script dừng và kêu": mỗi lần chạy,
-- script hỏi DB có bảng nào, bảng nào chưa khai thì thoát khác 0.
--
-- Chỉ trả TÊN bảng, không trả dữ liệu — nhưng vẫn khoá `service_role` vì danh
-- sách bảng là bản đồ tấn công cho người ngoài (FR-167).

create or replace function public.liet_ke_bang()
returns text[]
language sql
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(c.relname order by c.relname), '{}')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind = 'r';
$$;

revoke all on function public.liet_ke_bang() from public, anon, authenticated;
grant execute on function public.liet_ke_bang() to service_role;
