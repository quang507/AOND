-- 20261019c — bật lại hai lịch nhúng vector (docs/07 SRS-5.1zzzzzzz60; chủ dự án 19/10/2026: "tôi muốn tra địa chỉ, tra tên
-- đường phường bằng schematic"). 20261019b gỡ chúng vì lúc đó không còn ai đọc vector; nay lõi Python tra phường / đường theo
-- nghĩa (src/aioi/dia_danh.py → tim_dia_danh_theo_nghia), mà bảng duong mới nhúng 11.950 / 39.421 dòng — lịch phải chạy tiếp.
-- Cùng lịch, cùng lệnh như trước khi gỡ.
select cron.schedule('nhung-tick', '*/2 * * * *', 'select public.nhung_tick()')
 where not exists (select 1 from cron.job where jobname = 'nhung-tick');
select cron.schedule('nhung-dia-danh-tick', '1-59/2 * * * *', 'select public.nhung_dia_danh_tick()')
 where not exists (select 1 from cron.job where jobname = 'nhung-dia-danh-tick');
update public.app_config set value = 'bat' where key = 'tim_theo_nghia';
