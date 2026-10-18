-- 20261018h (SRS-5.1zzzzzzz42): gỡ hẳn 9 lịch đã tắt ở 20261018b. Chúng gọi các edge function của lõi TypeScript đã xoá khỏi
-- Supabase (go-ham-ts.yml, 18/10/2026: chat-reply, nudge, ask-seller, ctv-report, inbound-sweep…) — bật lại cũng chỉ ra 404.
-- Chủ dự án 18/10 soát hạ tầng: "có phần nào dư ra ko … sửa hết đi". Muốn dựng lại thì lấy định nghĩa trong lịch sử git.
do $$
declare
  j record;
begin
  if to_regclass('cron.job') is null then return; end if;  -- Postgres tạm của test:sql không có pg_cron
  for j in
    select jobid, jobname from cron.job
    where jobname in (
      'nudge-tick', 'seller-drip-tick', 'seller-hoi-bu-tick', 'seller-keep-alive-tick', 'stale-listing-tick',
      'info-timeout-tick', 'ctv-report-tick', 'ctv-sla-tick', 'inbound-sweep-tick'
    ) and not active
  loop
    perform cron.unschedule(j.jobid);
    raise notice 'gỡ lịch %', j.jobname;
  end loop;
end
$$;
