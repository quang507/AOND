-- FR-162 (phần 2) · Tách danh tính SỰ KIỆN khỏi danh tính JOB, thứ tự tin tất
-- định, và exactly-once cho chiều GỬI khi provider giao trùng.
--
-- Sau migration này, bốn danh tính tách bạch (bất biến "separate identities"):
--   * SỰ KIỆN inbound  → `inbound_events`  — mỗi lần Zalo GIAO một event là một
--     lần đếm; cùng msg_id giao 10 lần vẫn MỘT dòng, delivery_count = 10.
--     Webhook ghi dòng này TRƯỚC khi ack 200, nên instance chết ngay sau ack
--     vẫn còn vết + nguyên payload để xử lý lại bằng tay.
--   * TIN logic        → `messages` — unique index `messages_zalo_msg_id_key`
--     (đã có từ trước) bảo đảm một msg_id một dòng, ở TẦNG DB chứ không phải
--     SELECT-rồi-INSERT phía app.
--   * JOB xử lý        → `inbound_ledger` (20260827m) — received/processing/
--     completed/failed + attempts + payload trả lời để phát lại.
--   * TIN gửi ra       → dòng sender='bot' trong `messages` + `sent_at`/
--     `send_error` trên ledger (webhook ghi sau khi gửi).

-- ─────────────────────────────────────────────────────────────────────────────
-- (1) Sổ SỰ KIỆN. Khoá là msg_id thật của Zalo (ev.message.msg_id) — không
-- phải text/timestamp/sender/conversation. PK = ràng buộc DB chống trùng.
create table public.inbound_events (
  event_id       text primary key,
  zalo_user_id   text,
  payload        jsonb,
  delivery_count int  not null default 1,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

comment on table public.inbound_events is
  'FR-162: danh tinh SU KIEN inbound theo msg_id cua Zalo. Provider giao trung bao nhieu lan cung MOT dong, delivery_count dem so lan giao. Webhook ghi TRUOC khi ack.';

alter table public.inbound_events enable row level security;
revoke all on public.inbound_events from public, anon, authenticated;

-- Atomic ghi-hoặc-đếm. Trả về delivery_count để webhook biết đây là lần giao
-- thứ mấy (lần > 1 = provider redelivery). Payload chỉ lưu ở lần đầu — các lần
-- giao sau chỉ khác timestamp giao, nội dung tin là một.
create or replace function public.ghi_su_kien_inbound(
  p_event_id text, p_zalo_user_id text, p_payload jsonb
) returns int
language sql
security definer
set search_path to 'public'
as $fn$
  insert into inbound_events (event_id, zalo_user_id, payload)
  values (p_event_id, p_zalo_user_id, p_payload)
  on conflict (event_id) do update
    set delivery_count = inbound_events.delivery_count + 1,
        last_seen_at   = now()
  returning delivery_count;
$fn$;

revoke all on function public.ghi_su_kien_inbound(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ghi_su_kien_inbound(text, text, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) Thứ tự tin TẤT ĐỊNH. `created_at` đo bằng đồng hồ — hai tin cùng
-- mili-giây thì `order by created_at desc limit 1` trả bên nào cũng được, mà
-- check nhường-lượt FR-131 đang dựa vào đúng câu đó. `seq` là identity đơn
-- điệu do DB cấp: không bao giờ hoà, không phụ thuộc đồng hồ.
alter table public.messages
  add column seq bigint generated always as identity;
alter table public.messages
  add constraint messages_seq_key unique (seq);

comment on column public.messages.seq is
  'FR-162: thu tu tat dinh do DB cap. Check nhuong-luot FR-131 so seq, khong so created_at (hoa nhau khi cung mili-giay).';

-- ─────────────────────────────────────────────────────────────────────────────
-- (3) `claim_inbound` trả thêm `r_sent_at`: replay phải nói được cho kênh biết
-- "câu này ĐÃ GỬI TỚI KHÁCH rồi hay chưa". Provider giao trùng khi lần trước
-- gửi thành công → kênh im (khách không nhận đúp); lần trước gửi hụt → kênh
-- gửi lại (đường retry outbound giữ nguyên). Đổi kiểu trả về nên phải drop
-- trước — create or replace không đổi được return type.
drop function public.claim_inbound(text, int);

create or replace function public.claim_inbound(p_msg_id text, p_stale_secs int default 150)
returns table (r_state text, r_reply jsonb, r_attempts int, r_sent_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v inbound_ledger%rowtype;
begin
  if p_msg_id is null or btrim(p_msg_id) = '' then
    return query select 'claimed'::text, null::jsonb, 1, null::timestamptz; return;
  end if;

  if random() < 0.01 then
    delete from inbound_ledger where created_at < now() - interval '30 days';
    delete from inbound_events where first_seen_at < now() - interval '30 days';
  end if;

  insert into inbound_ledger (zalo_msg_id) values (p_msg_id)
  on conflict (zalo_msg_id) do nothing;
  if found then
    return query select 'claimed'::text, null::jsonb, 1, null::timestamptz; return;
  end if;

  select * into v from inbound_ledger where zalo_msg_id = p_msg_id for update;

  if v.status = 'completed' then
    return query select 'completed'::text, v.reply, v.attempts, v.sent_at; return;
  end if;

  if v.status = 'failed'
     or v.updated_at < now() - make_interval(secs => p_stale_secs) then
    update inbound_ledger
       set status = 'received', attempts = attempts + 1,
           detail = null, updated_at = now()
     where zalo_msg_id = p_msg_id;
    return query select 'claimed'::text, null::jsonb, v.attempts + 1, null::timestamptz; return;
  end if;

  return query select 'in_flight'::text, null::jsonb, v.attempts, null::timestamptz;
end $fn$;

comment on function public.claim_inbound(text, int) is
  'FR-162: claim atomic mot luot xu ly theo zalo_msg_id. claimed = lam di; completed = phat lai r_reply (r_sent_at cho biet da toi tay khach chua); in_flight = luot khac dang cam.';

revoke all on function public.claim_inbound(text, int) from public, anon, authenticated;
grant execute on function public.claim_inbound(text, int) to service_role;
