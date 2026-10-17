-- 20260829a — Việc chạy nền: hồi phục sau sập, lùi dần, và thư chết (FR-166)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SOÁT MÔ HÌNH CHẠY HIỆN TẠI TRƯỚC KHI ĐỔI
-- ═══════════════════════════════════════════════════════════════════════════
--   Zalo → zalo-webhook → verify chữ ký
--        → ghi_su_kien_inbound (inbound_events, PK = msg_id)   ← bền
--        → ack 200
--        → EdgeRuntime.waitUntil(handleEvent)                  ← CÙNG instance
--             → chat-reply (claim_inbound → gọi model → lưu reply vào ledger)
--             → sendZalo từng bong bóng (thử lại 1 lần, 2s)
--             → update inbound_ledger.sent_at
--
-- LỖ HỔNG LỚN NHẤT: `inbound_events` được GHI mà KHÔNG AI ĐỌC. Grep cả repo:
-- chỉ có đúng một chỗ ghi (webhook) và không chỗ nào quét. Nó là sổ ghi chép,
-- không phải hàng đợi. Việc thật chạy trong `EdgeRuntime.waitUntil`, tức cùng
-- instance vừa trả 200 — instance đó chết (deploy, evict, OOM, hết giờ tường)
-- thì tin của khách MẤT VĨNH VIỄN, im lặng. `claim_inbound` hồi phục được việc
-- kẹt, nhưng chỉ khi có ai gọi nó, mà người gọi duy nhất chính là instance đã
-- chết.
--
-- VÌ SAO KHÔNG ĐẨY HẲN SANG WORKER CRON. Kiến trúc đích nói
-- "webhook → sự kiện bền → job async → worker". Làm thuần tuý như vậy thì độ
-- trễ trả lời = chu kỳ cron (thấp nhất 1 phút), trong khi FR-131 chốt "càng
-- nhanh càng tốt" và cả sản phẩm dựng quanh chuyện bot đáp NGAY. Nên:
--   • ĐƯỜNG NHANH giữ nguyên — webhook vẫn chạy việc inline, độ trễ y như cũ;
--   • ĐƯỜNG CỨU thêm mới — cron quét việc mà đường nhanh chưa kịp xong.
-- Bình thường không ai chạm tới đường cứu. Khi instance chết, nó nhặt lại.
--
-- MỘT NHÀ CHỨC TRÁCH CHO MỖI VIỆC (giữ tách 4 danh tính của FR-162):
--   inbound_events  = SỰ KIỆN (payload gốc, delivery_count)
--   inbound_ledger  = JOB xử lý (vòng đời, attempts, reply, gửi)
--   messages        = TIN logic
--   sent_at         = TIN đã gửi ra
-- KHÔNG dựng bảng job thứ hai — hai bảng cùng nói "việc này tới đâu rồi" là
-- chỗ để chúng cãi nhau (bài học FR-164).

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) LÙI DẦN — một luật chung, không mỗi chỗ một kiểu
-- ═══════════════════════════════════════════════════════════════════════════
-- 30s, 1p, 2p, 4p, 8p, 16p, 32p, rồi chặn ở 1 tiếng. Cộng nhiễu ±20% để nhiều
-- việc cùng hỏng không dồn vào đúng một nhịp rồi cùng đập lại vào API.
create or replace function public.lan_thu_ke(p_attempts int)
returns interval
language sql
immutable
set search_path to 'public'
as $$
  select least(
           interval '30 seconds' * power(2, greatest(p_attempts, 1) - 1),
           interval '1 hour'
         ) * (0.8 + random() * 0.4);
$$;

comment on function public.lan_thu_ke(int) is
  'FR-166: khoảng chờ trước lần thử kế — nhân đôi dần, chặn ở 1 tiếng, có nhiễu '
  '±20% để các việc hỏng cùng lúc không đập lại API cùng một nhịp.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) SỔ INBOUND: thêm vòng đời đầy đủ
-- ═══════════════════════════════════════════════════════════════════════════
-- Có sẵn: status (received/processing/completed/failed), attempts, reply,
-- detail, sent_at, send_error. Thiếu: bao giờ thử lại, ai đang giữ, thư chết,
-- và mốc thời gian để nhìn ra việc chạy bao lâu.
alter table public.inbound_ledger
  add column if not exists next_retry_at timestamptz,
  add column if not exists locked_by     text,
  add column if not exists started_at    timestamptz,
  add column if not exists finished_at   timestamptz,
  -- Bất biến 10/12: gửi hụt giữa chừng thì lần sau ĐI TIẾP từ bong bóng chưa
  -- gửi, không phát lại từ đầu. Zalo OA `message/cs` KHÔNG có trường khoá
  -- idempotency phía nhà cung cấp (đã tra tài liệu v3.0), nên đếm-đã-gửi ở
  -- phía ứng dụng là cách an toàn mạnh nhất mà tích hợp hiện tại cho phép.
  add column if not exists sent_bubbles  int not null default 0;

comment on column public.inbound_ledger.sent_bubbles is
  'FR-166 bất biến 10: số bong bóng ĐÃ tới Zalo. Lần thử sau bỏ qua đúng bấy '
  'nhiêu tấm đầu — sập giữa chừng không làm khách nhận đúp.';
comment on column public.inbound_ledger.next_retry_at is
  'FR-166: sớm nhất được thử lại. NULL = thử được ngay.';

-- Mở thêm trạng thái KẾT cho việc hỏng vĩnh viễn.
alter table public.inbound_ledger drop constraint if exists inbound_ledger_status_check;
alter table public.inbound_ledger add constraint inbound_ledger_status_check
  check (status in ('received','processing','completed','failed','dead'));

-- Guard sẵn có tên là `inbound_ledger_giu_completed` (FR-163). Giữ nguyên độ
-- chặt của nó, chỉ dạy thêm rằng `dead` cũng là KẾT — nhưng `dead → completed`
-- thì CHO, vì đó là việc chết được cứu sống bằng cách xử lý xong thật.
create or replace function public.inbound_ledger_giu_completed()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.status = 'completed' and new.status is distinct from 'completed' then
    raise exception 'FR-163: inbound_ledger % da completed — khong duoc tut trang thai (thu ghi %).',
      old.zalo_msg_id, new.status using errcode = 'P0001';
  end if;
  if old.status = 'dead' and new.status not in ('dead', 'completed') then
    raise exception 'FR-166: inbound_ledger % da dead — chi go duoc bang completed (thu ghi %).',
      old.zalo_msg_id, new.status using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Việc cần cứu: quét theo (status, next_retry_at). Chỉ index phần CHƯA xong —
-- phần đã xong mới là phần lớn dần theo thời gian, mà không ai quét nó.
create index if not exists inbound_ledger_can_cuu_idx
  on public.inbound_ledger (next_retry_at, created_at)
  where status in ('received','processing','failed');

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) CLAIM_INBOUND: thêm lùi dần + thư chết, giữ nguyên hợp đồng trả về
-- ═══════════════════════════════════════════════════════════════════════════
-- chat-reply đọc r_state / r_reply / r_attempts / r_sent_at — giữ đúng bốn cột
-- đó để KHÔNG phải sửa chat-reply. Thêm r_dead để bên gọi biết đừng cố nữa.
-- Bản cũ là `claim_inbound(p_msg_id text, p_stale_secs int)`. Thêm tham số mà
-- không DROP thì Postgres tạo NẠP CHỒNG chứ không thay thế, và PostgREST có thể
-- chọn nhầm bản. Nên DROP trước, và GIỮ NGUYÊN `p_stale_secs` để bên gọi nào
-- đang truyền nó vẫn chạy.
drop function if exists public.claim_inbound(text, int);

create or replace function public.claim_inbound(
  p_msg_id     text,
  p_stale_secs int  default 150,
  p_worker     text default null
)
returns table (
  r_state    text,
  r_reply    jsonb,
  r_attempts int,
  r_sent_at  timestamptz,
  r_dead     boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.inbound_ledger%rowtype;
  v_max_attempts constant int := 8;
begin
  -- Cửa vào atomic: thắng thì có dòng, thua thì rơi xuống nhánh đọc bên dưới.
  insert into inbound_ledger (zalo_msg_id, status, attempts, started_at, locked_by)
  values (p_msg_id, 'processing', 1, now(), p_worker)
  on conflict (zalo_msg_id) do nothing;

  if found then
    return query select 'received'::text, null::jsonb, 1, null::timestamptz, false;
    return;
  end if;

  select * into v_row from inbound_ledger where zalo_msg_id = p_msg_id for update;

  if v_row.status = 'completed' then
    return query select 'completed'::text, v_row.reply, v_row.attempts, v_row.sent_at, false;
    return;
  end if;

  if v_row.status = 'dead' then
    return query select 'dead'::text, v_row.reply, v_row.attempts, v_row.sent_at, true;
    return;
  end if;

  -- Đang có người làm và chưa quá hạn thuê → nhường.
  if v_row.status = 'processing'
     and v_row.updated_at > now() - make_interval(secs => p_stale_secs) then
    return query select 'in_flight'::text, null::jsonb, v_row.attempts, v_row.sent_at, false;
    return;
  end if;

  -- Chưa tới giờ thử lại → nhường, đừng đập lại API sớm.
  if v_row.next_retry_at is not null and v_row.next_retry_at > now() then
    return query select 'in_flight'::text, null::jsonb, v_row.attempts, v_row.sent_at, false;
    return;
  end if;

  -- Hỏng quá nhiều lần → thư chết. Bất biến 7: đừng thử mãi.
  if v_row.attempts >= v_max_attempts then
    update inbound_ledger
       set status = 'dead', finished_at = now(), updated_at = now()
     where zalo_msg_id = p_msg_id;
    return query select 'dead'::text, v_row.reply, v_row.attempts, v_row.sent_at, true;
    return;
  end if;

  update inbound_ledger
     set status = 'processing',
         attempts = v_row.attempts + 1,
         locked_by = p_worker,
         started_at = now(),
         next_retry_at = null,
         updated_at = now()
   where zalo_msg_id = p_msg_id;

  return query select 'received'::text, v_row.reply, v_row.attempts + 1, v_row.sent_at, false;
end $$;

revoke execute on function public.claim_inbound(text, int, text) from public, anon, authenticated;
grant execute on function public.claim_inbound(text, int, text) to service_role;

-- Báo hỏng: đặt giờ thử lại theo luật lùi dần, hoặc chuyển thư chết.
create or replace function public.bao_hong_inbound(p_msg_id text, p_detail text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_attempts int;
  v_status   text;
  v_max constant int := 8;
begin
  select attempts, status into v_attempts, v_status
    from inbound_ledger where zalo_msg_id = p_msg_id;
  if v_attempts is null then return 'khong_co'; end if;

  -- Dòng ĐÃ completed nghĩa là model đã chạy xong và câu trả lời đã nằm trong
  -- sổ; hỏng ở đây là hỏng khâu GỬI. Đụng vào `status` lúc này sẽ va guard
  -- FR-163 (completed là kết) và làm hỏng luôn đường phát-lại. Khâu gửi đã có
  -- `send_error` + `sent_bubbles` lo, nên ở đây không làm gì.
  if v_status = 'completed' then return 'da_completed'; end if;

  if v_attempts >= v_max then
    update inbound_ledger
       set status = 'dead', detail = left(p_detail, 500),
           finished_at = now(), updated_at = now()
     where zalo_msg_id = p_msg_id;
    return 'dead';
  end if;

  update inbound_ledger
     set status = 'failed', detail = left(p_detail, 500),
         next_retry_at = now() + public.lan_thu_ke(v_attempts),
         updated_at = now()
   where zalo_msg_id = p_msg_id;
  return 'failed';
end $$;

revoke execute on function public.bao_hong_inbound(text, text) from public, anon, authenticated;
grant execute on function public.bao_hong_inbound(text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) ĐƯỜNG CỨU: tìm việc mà đường nhanh không làm xong
-- ═══════════════════════════════════════════════════════════════════════════
-- Hai loại việc bỏ rơi:
--   (a) có SỰ KIỆN mà không có JOB — instance chết trước cả khi gọi chat-reply;
--   (b) có JOB mà chưa xong / chưa gửi — chết giữa chừng.
-- Cả hai đều tìm được mà không cần bảng mới.
create or replace function public.viec_inbound_bo_roi(p_limit int default 20)
returns table (event_id text, ly_do text, attempts int)
language sql
security definer
set search_path to 'public'
as $$
  select e.event_id,
         case when l.zalo_msg_id is null then 'chua_co_job'
              when l.status = 'completed' and l.sent_at is null then 'chua_gui'
              else 'job_do_dang' end as ly_do,
         coalesce(l.attempts, 0) as attempts
    from inbound_events e
    left join inbound_ledger l on l.zalo_msg_id = e.event_id
   where e.first_seen_at > now() - interval '24 hours'   -- quá cũ thì thôi
     and (
       l.zalo_msg_id is null
       or (l.status in ('received','failed'))
       or (l.status = 'processing' and l.updated_at < now() - interval '150 seconds')
       -- ĐẾM BONG BÓNG, không đợi `send_error`. Instance chết NGAY SAU khi
       -- chat-reply trả về và TRƯỚC lần gửi đầu thì không có send_error nào
       -- cả (completed / sent_at null / send_error null / sent_bubbles 0) —
       -- dòng đó lọt lưới và câu trả lời không bao giờ tới tay khách. Chính
       -- bài test E2E làm lộ ra. So "reply có mấy tấm" với "đã gửi mấy tấm":
       -- còn thiếu thì còn việc. Cửa sổ 24h ở trên là chặn trên, nên môi
       -- trường cấu hình sai (thiếu OA token) không bị quét mãi mãi.
       or (l.status = 'completed'
           and l.sent_at is null
           and coalesce(jsonb_array_length(l.reply -> 'replies'), 0) > coalesce(l.sent_bubbles, 0))
     )
     and coalesce(l.next_retry_at, '-infinity'::timestamptz) <= now()
     and coalesce(l.status, '') <> 'dead'
   order by e.first_seen_at
   limit p_limit;
$$;

revoke execute on function public.viec_inbound_bo_roi(int) from public, anon, authenticated;
grant execute on function public.viec_inbound_bo_roi(int) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) NHẮC / NUDGE: giành việc atomic, hết cảnh gửi đúp
-- ═══════════════════════════════════════════════════════════════════════════
-- `nudge` đang: SELECT status='pending' → gửi → UPDATE status='sent'. Hai lượt
-- chạy chồng nhau (cron gối, hoặc gọi tay lúc cron đang chạy) cùng thấy một
-- dòng pending và CÙNG GỬI. Đúng cái bất biến 13 cấm.
--
-- Giữ nguyên ba trạng thái sẵn có (pending/sent/cancelled) — không thêm
-- 'processing'. Quyền sở hữu thể hiện bằng HỢP ĐỒNG THUÊ `locked_at`, đủ để
-- loại trừ lẫn nhau mà không phải nới CHECK. Chỉ thêm 'dead' cho việc hỏng
-- vĩnh viễn, vì trạng thái đó thật sự chưa có.
alter table public.reminders
  add column if not exists locked_at     timestamptz,
  add column if not exists locked_by     text,
  add column if not exists attempts      int not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_error    text;

alter table public.reminders drop constraint if exists reminders_status_check;
alter table public.reminders add constraint reminders_status_check
  check (status in ('pending','sent','cancelled','dead'));

create index if not exists reminders_den_han_idx
  on public.reminders (due_at)
  where status = 'pending';

-- Giành việc: chỉ dòng tới hạn, chưa ai giữ (hoặc hết hạn thuê 5 phút).
-- `for update skip locked` để hai worker chạy song song không chờ nhau.
create or replace function public.nhan_viec_nhac(
  p_kinds text[],
  p_limit int default 20,
  p_worker text default null
)
returns setof public.reminders
language sql
security definer
set search_path to 'public'
as $$
  update public.reminders r
     set locked_at = now(),
         locked_by = p_worker,
         attempts = r.attempts + 1
   where r.id in (
     select id from public.reminders
      where status = 'pending'
        and kind = any(p_kinds)
        and due_at <= now()
        and (locked_at is null or locked_at < now() - interval '5 minutes')
        and coalesce(next_retry_at, '-infinity'::timestamptz) <= now()
      order by due_at
      limit p_limit
      for update skip locked
   )
  returning r.*;
$$;

revoke execute on function public.nhan_viec_nhac(text[], int, text) from public, anon, authenticated;
grant execute on function public.nhan_viec_nhac(text[], int, text) to service_role;

-- Gửi hụt: nhả hợp đồng thuê + hẹn giờ lùi dần, hoặc bỏ hẳn sau 5 lần.
create or replace function public.bao_hong_nhac(p_id uuid, p_detail text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_attempts int; v_max constant int := 5;
begin
  select attempts into v_attempts from reminders where id = p_id;
  if v_attempts is null then return 'khong_co'; end if;

  if v_attempts >= v_max then
    update reminders
       set status = 'dead', last_error = left(p_detail, 300), locked_at = null
     where id = p_id;
    return 'dead';
  end if;

  update reminders
     set locked_at = null,
         last_error = left(p_detail, 300),
         next_retry_at = now() + public.lan_thu_ke(v_attempts)
   where id = p_id;
  return 'retry';
end $$;

revoke execute on function public.bao_hong_nhac(uuid, text) from public, anon, authenticated;
grant execute on function public.bao_hong_nhac(uuid, text) to service_role;

-- Guard sẵn có tên là `reminders_giu_trang_thai_ket` (FR-163), và nó chặn MỌI
-- thay đổi rời khỏi sent/cancelled chứ không riêng đường về pending. Giữ đúng
-- độ chặt đó, chỉ thêm `dead` vào danh sách kết: lùi một nhắc đã gửi về pending
-- là gửi lại cho khách một tin họ đã nhận.
create or replace function public.reminders_giu_trang_thai_ket()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.status in ('sent', 'cancelled', 'dead')
     and new.status is distinct from old.status then
    new.status  := old.status;
    new.sent_at := old.sent_at;
  end if;
  return new;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) DỌN FILE: thêm thư chết (đang thử lại vô hạn)
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.media_cleanup_queue
  add column if not exists next_retry_at timestamptz;

alter table public.media_cleanup_queue drop constraint if exists media_cleanup_queue_trang_thai_check;
alter table public.media_cleanup_queue add constraint media_cleanup_queue_trang_thai_check
  check (trang_thai in ('cho','dang_lam','xong','loi','chet'));

create or replace function public.nhan_viec_don_media(p_limit int default 50)
returns setof public.media_cleanup_queue
language sql
security definer
set search_path to 'public'
as $$
  update public.media_cleanup_queue q
     set trang_thai = 'dang_lam', attempts = q.attempts + 1, updated_at = now()
   where q.id in (
     select id from public.media_cleanup_queue
      where (trang_thai = 'cho'
             or (trang_thai in ('dang_lam','loi') and updated_at < now() - interval '10 minutes'))
        and attempts < 6                                   -- bất biến 7
        and coalesce(next_retry_at, '-infinity'::timestamptz) <= now()
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning q.*;
$$;

revoke execute on function public.nhan_viec_don_media(int) from public, anon, authenticated;
grant execute on function public.nhan_viec_don_media(int) to service_role;

-- Việc quá số lần → thư chết, thôi quét nữa.
create or replace function public.chon_viec_don_chet()
returns int
language sql
security definer
set search_path to 'public'
as $$
  with x as (
    update public.media_cleanup_queue
       set trang_thai = 'chet', updated_at = now()
     where trang_thai in ('cho','loi','dang_lam')
       and attempts >= 6
    returning 1
  ) select count(*)::int from x;
$$;

revoke execute on function public.chon_viec_don_chet() from public, anon, authenticated;
grant execute on function public.chon_viec_don_chet() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- (7) NHÌN THẤY ĐƯỢC — một cửa sổ cho cả ba hàng đợi
-- ═══════════════════════════════════════════════════════════════════════════
-- Chỉ những cột trả lời được câu "việc nào đang kẹt, thử mấy lần, lỗi gì, bao
-- giờ thử lại". Không thêm cột cho vui.
create or replace view public.job_suc_khoe as
select 'inbound' as hang_doi, zalo_msg_id as job_id, status as trang_thai,
       attempts, detail as loi, started_at, finished_at, next_retry_at, updated_at
  from public.inbound_ledger
 where status <> 'completed'
union all
select 'nhac', id::text, status, attempts, last_error, null, sent_at, next_retry_at, created_at
  from public.reminders
 where status in ('pending','dead')
union all
select 'don_file', id::text, trang_thai, attempts, last_error, null, null, next_retry_at, updated_at
  from public.media_cleanup_queue
 where trang_thai <> 'xong';

revoke all on public.job_suc_khoe from anon, authenticated;

comment on view public.job_suc_khoe is
  'FR-166: một cửa sổ cho ba hàng đợi — việc nào chưa xong, thử mấy lần, lỗi '
  'gì, bao giờ thử lại. CHƯA nối vào /admin: trang đó đọc bằng publishable key '
  '(vai anon) mà view này revoke all khỏi anon; muốn hiện thì mở qua một RPC '
  'security-definer có kiểm quyền admin. Hiện đọc bằng service key.';
