-- 20260908f — khoá LẠI view public_listings (TS-SEC đỏ trên main từ run 69, 08/09/2026).
--
-- 20260826c đã đóng LỖ 2 (NẶNG): `public_listings` = SELECT … FROM listings KHÔNG
-- lọc trạng thái, chạy security definer → anon đọc được cả tin nháp. Cách đóng:
-- security_invoker = on + revoke anon/authenticated. TS-SEC-03 canh đúng chỗ đó.
--
-- 08/09 view này được DROP rồi CREATE lại để thêm cột `legacy_code` (đi cùng
-- 20260908c) — nhưng lệnh đó chạy ngoài file migration: không file nào trong repo
-- có `create view public_listings`, chỉ schema.sql chụp lại kết quả. DROP xoá
-- sạch reloptions và grant; `alter default privileges` của project cấp lại
-- SELECT cho anon + authenticated (CLAUDE.md §6: "view MỚI ở project này mặc định
-- LỘ"). Đo trên DB 08/09: reloptions = (none), grant anon:SELECT, và TS-SEC báo
-- "public_listings: anon đọc được" 6 lượt CI liên tiếp.
--
-- Web không dùng view này (grep app/ lib/ components/: 0 kết quả) — khoá không
-- hỏng trang nào. Idempotent: chạy lại trên DB đã khoá không đổi gì.
alter view public.public_listings set (security_invoker = on);
revoke all on public.public_listings from anon, authenticated;

comment on view public.public_listings is
  'Hình chiếu CỘT của listings (12 cột, có legacy_code từ 20260908c; bỏ seller_id/lat/lng/cột thông số). CHÚ Ý: KHÔNG lọc dòng — điều kiện lên kệ KHÔNG nằm ở đây. security_invoker=on nên RLS của người gọi vẫn áp; chỉ service_role được cấp quyền. Muốn đổi cột thì CREATE OR REPLACE (giữ grant), đừng DROP rồi CREATE — DROP là mở lại lỗ 20260826c.';
