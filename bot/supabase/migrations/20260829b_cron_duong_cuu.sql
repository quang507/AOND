-- 20260829b — Cron cho đường cứu + khoá chống reengage trùng (FR-166)

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) MỘT KHÁCH — MỘT LỜI HỎI THĂM ĐANG CHỜ
-- ═══════════════════════════════════════════════════════════════════════════
-- Khối reengage của `nudge` trước đây ĐẾM xem đã hỏi thăm trong 5 ngày chưa,
-- rồi mới gửi, rồi mới ghi vết. Đó là đọc-rồi-hành-động: hai lượt chạy chồng
-- nhau cùng đếm ra 0 và CÙNG GỬI — đúng cái bất biến 13 cấm.
-- Nay `nudge` chèn dòng `pending` TRƯỚC khi gọi model. Index này là thứ biến
-- "chèn trước" thành bảo đảm thật: bên thua nhận 23505 rồi nhường.
create unique index if not exists reminders_mot_reengage_cho_idx
  on public.reminders (buyer_id)
  where kind = 'reengage' and status = 'pending';

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) NHỊP CHO ĐƯỜNG CỨU
-- ═══════════════════════════════════════════════════════════════════════════
-- 1 phút/lần là nhịp nhanh nhất pg_cron cho. Nghe dày, nhưng hàm tick tự hỏi
-- trước: KHÔNG có việc bỏ rơi thì nó return ngay, không gọi edge function,
-- không sinh dòng `net._http_response`. Bình thường (đường nhanh chạy tốt) nó
-- im hoàn toàn — chỉ tốn một câu đếm mỗi phút.
insert into public.app_config (key, value, ghi_chu)
values ('functions_base_url',
        'https://tbcdpupiarkuxtntmosl.supabase.co/functions/v1',
        'Tiền tố URL của edge function. Đổi project thì UPDATE dòng này.')
on conflict (key) do nothing;

create or replace function public.inbound_sweep_tick()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_n int;
begin
  select count(*) into v_n from public.viec_inbound_bo_roi(1);
  if v_n = 0 then return; end if;

  perform net.http_post(
    url := public.cau_hinh('functions_base_url') || '/inbound-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_zmJBmEgFPn3bBKx_1ve6Pg_dXdo4haX',
      'x-bridge-secret', public.get_secret('BRIDGE_SECRET')),
    body := '{}'::jsonb);
end $$;

revoke execute on function public.inbound_sweep_tick() from public, anon, authenticated;
grant execute on function public.inbound_sweep_tick() to service_role;

select cron.schedule('inbound-sweep-tick', '* * * * *',
  $$select public.inbound_sweep_tick()$$);

-- Việc dọn file quá số lần → thư chết. Mỗi giờ một lần là đủ: nó chỉ dọn nhãn
-- cho thứ đã hết đường thử lại.
select cron.schedule('media-chet-tick', '0 * * * *',
  $$select public.chon_viec_don_chet()$$);
