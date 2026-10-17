-- 20260903b — FR-173 soát lại sau khi chạy: khoá hai hàm nội bộ khỏi REST,
-- cố định search_path cho ctv_sla_phut (advisor Supabase 03/09/2026).
--
-- `info_request_sla_tick()` là SECURITY DEFINER và mặc định ai cầm khoá anon
-- cũng gọi được qua /rest/v1/rpc → chỉ cron (postgres) và service_role cần.
-- `info_request_bao_lai_khach()` là hàm trigger, gọi thẳng thì lỗi nhưng vẫn
-- đóng cho sạch. Trigger vẫn chạy: quyền EXECUTE chỉ kiểm lúc CREATE TRIGGER.

create or replace function public.ctv_sla_phut() returns int
language sql immutable set search_path = '' as $$ select 120 $$;

revoke all on function public.info_request_sla_tick()      from public, anon, authenticated;
revoke all on function public.info_request_bao_lai_khach() from public, anon, authenticated;
