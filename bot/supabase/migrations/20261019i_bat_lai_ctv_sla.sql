-- 20261019i — bật lại lịch `ctv-sla-tick` (docs/07 SRS-5.1zzzzzzz70). `20261018b` / `20261018h` tắt nó cùng bot TypeScript vì khi đó
-- không còn ai tạo `info_requests`. Từ bản này lõi Python ghi câu khách mua hỏi (`src/aioi/mua.py`), nên câu chủ nhà / CTV quá hạn
-- lại cần leo thang: chủ nhà quá `chu_nha_han_gio()` → giao CTV; CTV quá `ctv_sla_phut()` → báo admin. Cùng nhịp với `20260903a`
-- (15 phút, 8h–20h giờ VN = 1–13 UTC).
select cron.unschedule(jobid) from cron.job where jobname = 'ctv-sla-tick';
select cron.schedule('ctv-sla-tick', '*/15 1-13 * * *', $$select public.info_request_sla_tick()$$);
