-- 18/10/2026 (SRS-5.1zzzzzzz30): chủ dự án chốt bộ não là lõi Python (aond-core) và bỏ lõi TypeScript, "không nhắn cho CTV nữa",
-- "Zalo OA bỏ". Lõi Python có hẹn nhắn lại riêng (followup 5 phút) — để các lịch dưới đây chạy tiếp là một khách nhận tin nhắc từ
-- HAI bộ não. Chỉ TẮT (active = false), không xoá: bật lại bằng cron.alter_job(jobid, active := true) nếu cần.
--
-- Tắt: tự nhắn người bán / người mua (nudge, drip, hỏi bù, keep-alive, tin cũ, hết hạn câu hỏi), báo cáo + SLA cho CTV,
--      quét tin Zalo OA bị sót.
-- Giữ: bot-health-tick + soat-du-lieu-tick (chỉ báo admin), dọn sổ, geocode, nhúng vector, dọn media, hạ trạng thái quan tâm.
do $$
declare
  j record;
begin
  for j in
    select jobid, jobname from cron.job
    where jobname in (
      'nudge-tick', 'seller-drip-tick', 'seller-hoi-bu-tick', 'seller-keep-alive-tick', 'stale-listing-tick',
      'info-timeout-tick', 'ctv-report-tick', 'ctv-sla-tick', 'inbound-sweep-tick'
    ) and active
  loop
    perform cron.alter_job(j.jobid, active := false);
    raise notice 'tắt lịch %', j.jobname;
  end loop;
end
$$;
