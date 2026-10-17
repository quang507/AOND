-- FR-152 — Sổ lỗi bền + nhịp tim bot.
-- BẢN SAO THAM CHIẾU của migration đã áp thật qua MCP ngày 27/08/2026
-- (`20260827b_bot_health_va_bot_errors`). File này để đọc và để dựng lại project
-- từ đầu; chạy lại trên project hiện tại là vô hại (idempotent).
--
-- ============================ VÌ SAO CÓ FILE NÀY ============================
-- Soát mục "Error Tracking & Logs": hệ thống đang KHÔNG có chỗ nào ghi lại việc
-- gì đã hỏng. Cụ thể, cái tưởng là bảng theo dõi lại không phải:
--
--   select jobid, status, count(*) from cron.job_run_details
--   where start_time > now() - interval '3 days' group by 1,2;
--   → cả 4 job đều 'succeeded', 147 lượt, không một dòng 'failed'.
--
-- Nhưng `succeeded` ở đây chỉ có nghĩa "câu SQL chạy xong". Mà câu SQL của 3
-- trong 4 job là `net.http_post(...)` — hàm này XẾP HÀNG rồi trả về ngay, nó
-- không chờ HTTP. Mã trạng thái thật rơi vào `net._http_response`:
--
--   select count(*) from net._http_response where created > now() - interval '3 days';
--   → 16 dòng, cho 147 lượt cron.
--
-- Nghĩa là: (1) không ai đọc bảng phản hồi đó, (2) Supabase tự dọn nó sau vài
-- giờ. Edge function có trả 500 suốt một tuần thì bảng cron vẫn xanh lè và
-- không ai biết. Chỗ hỏng này đã cắn thật một lần rồi: `ctv-report` bị cắt JSON
-- giữa chừng ngày 26/08, điểm CTV mất im lặng, chỉ tìm ra vì đi đọc log tay.
--
-- FR-152 vá bằng ba mảnh: sổ bền (bot_errors), người quét (bot_health_tick),
-- và nhịp tim của bridge (beat).
-- ===========================================================================

-- who = 'pg_net'    → last_id là mốc đã quét tới của net._http_response
-- who = 'bridge-zca'→ at là lần cuối bridge gõ cửa escalation-feed
create table if not exists public.bot_health (
  who      text primary key,
  at       timestamptz not null default now(),
  last_id  bigint not null default 0
);

create table if not exists public.bot_errors (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  source      text not null,          -- 'pg_net' | 'bridge'
  status_code integer,
  detail      text
);
create index if not exists bot_errors_at_idx on public.bot_errors (at desc);

alter table public.bot_health enable row level security;
alter table public.bot_errors enable row level security;
revoke all on public.bot_health from anon, authenticated;
revoke all on public.bot_errors from anon, authenticated;

-- Admin ĐĂNG NHẬP đọc được để hiện trên /admin — cùng khuôn với
-- `listings_admin_read`. anon (key nằm trong bundle JS của web) vẫn mù.
grant select on public.bot_errors to authenticated;
drop policy if exists bot_errors_admin_read on public.bot_errors;
create policy bot_errors_admin_read on public.bot_errors
  for select to authenticated
  using (exists (select 1 from admins a
                 where a.email = ((select auth.jwt()) ->> 'email')));

grant select on public.bot_health to authenticated;
drop policy if exists bot_health_admin_read on public.bot_health;
create policy bot_health_admin_read on public.bot_health
  for select to authenticated
  using (exists (select 1 from admins a
                 where a.email = ((select auth.jwt()) ->> 'email')));

-- Nhịp tim. Gọi từ `escalation-feed` (service role), KHÔNG mở cho anon: mở ra
-- thì bất kỳ ai cũng giả được nhịp tim của một bridge đã chết.
create or replace function public.beat(p_who text)
returns void language sql security definer set search_path to 'public'
as $$
  insert into bot_health (who, at) values (p_who, now())
  on conflict (who) do update set at = now();
$$;
revoke execute on function public.beat(text) from public, anon, authenticated;

create or replace function public.bot_health_tick()
returns jsonb language plpgsql security definer
set search_path to 'public', 'net'
as $$
declare
  v_from bigint;
  v_to   bigint;
  v_new  integer := 0;
  v_beat timestamptz;
  v_hour integer;
  v_dead boolean := false;
begin
  select last_id into v_from from bot_health where who = 'pg_net';
  if v_from is null then
    -- Lần đầu: lấy mốc là hiện tại. Đừng dựng lại "lịch sử" mà Supabase đã dọn
    -- dở dang — cả sổ lỗi sẽ đầy rác cũ ngay phút đầu.
    select coalesce(max(id), 0) into v_from from net._http_response;
    insert into bot_health (who, last_id) values ('pg_net', v_from);
  end if;

  select coalesce(max(id), v_from) into v_to from net._http_response;

  insert into bot_errors (at, source, status_code, detail)
  select r.created, 'pg_net', r.status_code,
         left(coalesce(r.error_msg, r.content), 500)
  from net._http_response r
  where r.id > v_from and r.id <= v_to
    and (r.status_code is null or r.status_code < 200 or r.status_code >= 300);
  get diagnostics v_new = row_count;
  update bot_health set last_id = v_to, at = now() where who = 'pg_net';

  -- Bridge im quá 15 phút trong giờ làm = coi như chết. Ban đêm bỏ qua: máy
  -- chạy bridge là máy của chủ dự án, nó có quyền ngủ.
  -- CHƯA TỪNG có nhịp nào (v_beat null) thì cũng bỏ qua: bridge chưa bật lần
  -- nào mà đã réo thì lần réo thật sau này không ai còn tin.
  v_hour := extract(hour from (now() at time zone 'Asia/Ho_Chi_Minh'))::int;
  select at into v_beat from bot_health where who = 'bridge-zca';
  if v_beat is not null and v_hour between 7 and 22
     and v_beat < now() - interval '15 minutes' then
    v_dead := true;
    insert into bot_errors (source, detail)
    select 'bridge', format('bridge-zca im từ %s (VN)',
                            to_char(v_beat at time zone 'Asia/Ho_Chi_Minh',
                                    'DD/MM HH24:MI'))
    where not exists (select 1 from bot_errors
                      where source = 'bridge' and at > now() - interval '1 hour');
  end if;

  -- Báo admin: GỘP một tin mỗi giờ. Còi kêu 15 phút một lần thì tuần sau không
  -- ai đọc nữa, mà đó mới là lúc hỏng thật.
  if (v_new > 0 or v_dead)
     and not exists (select 1 from reminders
                     where kind = 'escalation' and note like '🩺%'
                       and created_at > now() - interval '1 hour') then
    insert into reminders (kind, due_at, note)
    values ('escalation', now(),
      format('🩺 nhadat.cc: %s lỗi HTTP mới từ cron/bot%s. Xem bảng bot_errors '
             'hoặc trang /admin.', v_new,
             case when v_dead then ' + bridge-zca đang im' else '' end));
  end if;

  return jsonb_build_object('loi_moi', v_new, 'bridge_im', v_dead,
                            'quet_toi', v_to);
end $$;
revoke execute on function public.bot_health_tick() from public, anon, authenticated;

comment on function public.bot_health_tick() is
  'FR-152 — soát net._http_response tìm phản hồi không 2xx, ghi vào bot_errors, báo admin 1 lần/giờ.';

-- Cron (đã tạo thật, jobid 5). `*/15` chứ không thưa hơn: pg_net tự dọn bảng
-- phản hồi sau vài giờ, quét thưa quá là mất bằng chứng trước khi đọc được.
--   select cron.schedule('bot-health-tick', '*/15 * * * *',
--                        'select public.bot_health_tick()');

-- ====================== ĐÃ THỬ THẬT (27/08/2026) ======================
-- 1) select public.bot_health_tick();                       → loi_moi 0
-- 2) select net.http_post(url := '…/functions/v1/khong-he-ton-tai', …);
-- 3) chờ 15s, select public.bot_health_tick();               → loi_moi 1
-- 4) select * from bot_errors;   → source pg_net, 404, 'Requested function was not found'
-- 5) select note from reminders where note like '🩺%';       → đúng 1 tin
-- 6) gọi escalation-feed kèm x-bridge-secret               → 200, bot_health có 'bridge-zca'
-- 7) dọn sạch dấu vết thử, đẩy last_id lên max(id) hiện tại.
--
-- GIỚI HẠN THÀNH THẬT: tin báo đi ĐƯỜNG BRIDGE (reminders → escalation-feed →
-- acc clone → Zalo admin). Bridge chết thì chính tin "bridge chết" nằm chờ tới
-- lúc bridge sống lại. Muốn biết ngay, mở /admin — trang đó đọc thẳng
-- `bot_health`/`bot_errors` bằng phiên đăng nhập admin, không qua bridge.
