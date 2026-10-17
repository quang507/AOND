-- 20260828h — Cron gọi worker dọn file + cấu hình URL functions (FR-165)
--
-- Hàng đợi ở 20260828g chỉ ghi Ý ĐỊNH xoá; không có ai mang đi thì bất biến
-- "xoá/thay media rồi thì file vật lý PHẢI biến mất" mới xong một nửa. Đây là
-- nửa còn lại.
--
-- URL lấy từ `app_config` chứ không nhúng cứng như các tick cũ
-- (`ctv_report_tick`, `bot_health_tick`… nhúng thẳng cả host lẫn key). Không
-- sửa các tick cũ trong bản này — chúng nằm ngoài phạm vi kho ảnh; ghi lại
-- thành việc cần dọn sau.

insert into public.app_config (key, value, ghi_chu)
values (
  'functions_base_url',
  'https://tbcdpupiarkuxtntmosl.supabase.co/functions/v1',
  'Tiền tố URL của edge function. Đổi project thì UPDATE dòng này.'
)
on conflict (key) do nothing;

create or replace function public.media_cleanup_tick()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cho int;
begin
  -- Không có việc thì đừng gọi: mỗi lượt gọi là một lambda + một dòng
  -- net._http_response. Cron 5 phút/lần mà kho ảnh yên thì im hẳn.
  select count(*) into v_cho
    from public.media_cleanup_queue
   where trang_thai in ('cho', 'dang_lam', 'loi');
  if v_cho = 0 then return; end if;

  perform net.http_post(
    url := public.cau_hinh('functions_base_url') || '/media-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_zmJBmEgFPn3bBKx_1ve6Pg_dXdo4haX',
      'x-bridge-secret', public.get_secret('BRIDGE_SECRET')
    ),
    body := '{}'::jsonb
  );
end $$;

-- Revoke từ PUBLIC, không chỉ từ anon/authenticated (xem ghi chú ở 20260828g).
revoke execute on function public.media_cleanup_tick() from public, anon, authenticated;
grant execute on function public.media_cleanup_tick() to service_role;

select cron.schedule(
  'media-cleanup-tick',
  '*/5 * * * *',
  $$select public.media_cleanup_tick()$$
);
