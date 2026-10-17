-- 20260902c — FR-171 a/b/c/d: bớt việc vô ích khi hệ thống im (đợt tối ưu 02/09/2026)
--
-- Số đo trước khi sửa (7 ngày, DB thật): 8.605 lượt cron, trong đó 5.911 là
-- `inbound-sweep-tick` mỗi phút quét `inbound_events` KHÔNG có index theo
-- `first_seen_at`; `nudge-tick` + `seller-drip-tick` chạy 24/7 dù 22h–8h chỉ vào
-- rồi thoát; `cron.job_run_details` không ai dọn (8.600 dòng/tuần ≈ 80MB/năm
-- trên gói Free 500MB); `log_loi` đếm hai lần trên bảng chỉ có index theo `at`.

-- a. Index còn thiếu ------------------------------------------------------------
-- `viec_inbound_bo_roi` lọc `first_seen_at > now() - 24h` rồi order by — không
-- index là seq scan + sort toàn bảng 1.440 lần/ngày, phình theo 30 ngày dữ liệu.
create index if not exists inbound_events_first_seen_idx
  on public.inbound_events (first_seen_at);

-- `log_loi` (van 20/nguồn/giờ) và trigger `bat_het_tien_api` (max(at) where
-- source=…) đều lọc theo source; index cũ `bot_errors_at_idx (at desc)` chỉ
-- phục vụ /admin. Giữ cả hai.
create index if not exists bot_errors_source_at_idx
  on public.bot_errors (source, at desc);

-- b. log_loi: một câu đếm thay hai ----------------------------------------------
create or replace function public.log_loi(p_source text, p_detail text, p_code integer default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_src text := left(coalesce(nullif(trim(p_source), ''), 'khong_ro'), 40);
  v_nguon int;
  v_tong int;
begin
  -- Hai cái van như cũ (20 dòng/nguồn/giờ, 200 dòng/giờ tổng), nhưng đếm MỘT
  -- lần: `count(*) filter (where …)` trên cùng một lượt quét cửa sổ 1 giờ.
  -- Chạm van thì im lặng bỏ qua, KHÔNG ném: nơi gọi đang ở trong `catch`.
  select count(*) filter (where source = v_src), count(*)
    into v_nguon, v_tong
    from bot_errors where at > now() - interval '1 hour';
  if v_nguon >= 20 or v_tong >= 200 then
    return;
  end if;

  insert into bot_errors (source, status_code, detail)
  values (v_src, p_code, left(coalesce(p_detail, ''), 500));
end $$;

-- c. media_cleanup_tick: guard phải dùng ĐÚNG vị từ của hàm giành việc --------
-- Guard cũ đếm mọi dòng 'cho'/'dang_lam'/'loi' bất kể `attempts`/`next_retry_at`,
-- còn `nhan_viec_don_media` thì lọc attempts < 6 và tới giờ thử lại. Một dòng
-- `loi` đang chờ giờ (hoặc đã 6 lần, chờ `media-chet-tick` mỗi giờ) làm cron gọi
-- lambda 12 lần/giờ mà không claim được gì.
create or replace function public.media_cleanup_tick()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not exists (
    select 1 from public.media_cleanup_queue
     where (trang_thai = 'cho'
            or (trang_thai in ('dang_lam','loi') and updated_at < now() - interval '10 minutes'))
       and attempts < 6
       and coalesce(next_retry_at, '-infinity'::timestamptz) <= now())
  then return; end if;

  perform net.http_post(
    url := public.cau_hinh('functions_base_url') || '/media-cleanup',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || public.cau_hinh('publishable_key'),
      'x-bridge-secret', public.get_secret('BRIDGE_SECRET')),
    body := '{}'::jsonb);
end $$;

-- d. Cron theo giờ người + dọn sổ cron ------------------------------------------
-- `cron.schedule` với jobname đã có thì CẬP NHẬT lịch, giữ jobid.
-- nudge: 8h–20h VN = 1–13 UTC. Lệch phút (7, 37) thay cho đoạn ngủ ngẫu nhiên
-- tới 45 s BÊN TRONG lambda — đoạn ngủ đó cộng vài lượt model là vượt trần 55 s
-- của `nudge_tick`, pg_net ghi timeout và `bot_health_tick` ghi lỗi giả.
select cron.schedule('nudge-tick', '7,37 1-13 * * *', $$select nudge_tick()$$);
-- seller drip: hỏi chủ nhà lúc 2 giờ sáng là không ổn, mà `seller_drip_tick`
-- không tự kiểm giờ. Cùng khung giờ với nudge, lệch phút để hai lambda không
-- giành cùng một lúc.
select cron.schedule('seller-drip-tick', '22,52 1-13 * * *', $$select seller_drip_tick()$$);
-- Sổ chạy cron: giữ 7 ngày là đủ để soi, `bot_health_tick` không đọc bảng này.
select cron.schedule('cron-don-so', '15 18 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
