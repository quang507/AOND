-- Bản sao tham chiếu các migration đã áp lên project nhadat-cc ngày 25/08/2026
-- (áp qua MCP apply_migration; file này để đọc-hiểu và dựng lại môi trường mới).
-- Gồm: SRS-4.5 giá số, FR-135 cờ người thật, FR-32 follow-up, FR-136/137 CRM CTV.

-- ============ SRS-4.5: giá dạng số để lọc "dưới 4 tỷ" bằng SQL ============
-- Hướng parseVnd của NhaDat-Radar: "5,5 tỷ"→5.5e9; "3 tỷ 200"→3.2e9;
-- "5 tỷ 5"→5.5e9 (vế sau 1 chữ số = ×100 triệu); "12 triệu/tháng"→12e6;
-- "thương lượng"→NULL. (bản đã vá qua fix_parse_vnd_colloquial_tenths)
create or replace function public.parse_vnd(p text) returns bigint
language plpgsql immutable as $$
declare
  m text[];
begin
  if p is null or btrim(p) = '' then return null; end if;
  m := regexp_match(p, '([0-9]+)\s*t[ỷỉyĩ]\w*\s*([0-9]{1,3})(?!\s*m)', 'i');
  if m is not null then
    if length(m[2]) = 1 then
      return m[1]::numeric * 1e9 + m[2]::numeric * 1e8;  -- "5 tỷ 5" → 5,5 tỷ
    end if;
    return m[1]::numeric * 1e9 + m[2]::numeric * 1e6;    -- "3 tỷ 200" → 3,2 tỷ
  end if;
  m := regexp_match(p, '([0-9]+[.,]?[0-9]*)\s*t[ỷỉyĩ]', 'i');
  if m is not null then
    return (replace(m[1], ',', '.')::numeric * 1e9)::bigint;
  end if;
  m := regexp_match(p, '([0-9]+[.,]?[0-9]*)\s*(tri[ệe]u|tr\M)', 'i');
  if m is not null then
    return (replace(m[1], ',', '.')::numeric * 1e6)::bigint;
  end if;
  return null;
exception when others then
  return null;
end $$;

alter table public.listings add column if not exists price_vnd bigint;
update public.listings set price_vnd = public.parse_vnd(price_raw) where price_vnd is null;

create or replace function public.listings_set_price_vnd() returns trigger
language plpgsql as $$
begin
  new.price_vnd := public.parse_vnd(new.price_raw);
  return new;
end $$;
drop trigger if exists trg_listings_price_vnd on public.listings;
create trigger trg_listings_price_vnd
  before insert or update of price_raw on public.listings
  for each row execute function public.listings_set_price_vnd();
create index if not exists idx_listings_price_vnd on public.listings (deal, price_vnd);

-- ============ FR-135: bot bí / khách đòi người thật → cờ cho CTV ============
alter table public.conversations
  add column if not exists needs_human boolean not null default false,
  add column if not exists needs_human_at timestamptz;

-- ============ FR-32: hỏi một căn rồi im ~2,5h → chủ động gửi thêm ============
alter table public.reminders drop constraint if exists reminders_kind_check;
alter table public.reminders add constraint reminders_kind_check
  -- 'escalation' dùng cho FR-140 (báo CTV/admin) — xem cuối file
  check (kind in ('promise', 'reengage', 'viewing', 'followup', 'escalation'));
alter table public.reminders add column if not exists listing_id uuid references public.listings(id);

-- ============ FR-136: CRM CTV — chia đơn xoay vòng ============
create table if not exists public.ctvs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zalo_user_id text unique,          -- Zalo cá nhân CTV (điền khi có thật)
  active boolean not null default true,
  last_assigned_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ctvs enable row level security;
alter table public.ctvs add column if not exists last_assigned_at timestamptz;

insert into public.ctvs (name)
select v from (values ('CTV 1'), ('CTV 2')) as t(v)
where not exists (select 1 from public.ctvs where active);

alter table public.conversations add column if not exists ctv_id uuid references public.ctvs(id);

-- Đơn "đang chăm" = có tương tác 30 ngày gần nhất; người ôm ít nhất nhận đơn mới
create or replace function public.assign_ctv_round_robin() returns trigger
language plpgsql security definer as $$
declare
  picked uuid;
begin
  if new.ctv_id is not null then return new; end if;
  select c.id into picked
  from public.ctvs c
  left join public.conversations v
    on v.ctv_id = c.id and v.last_message_at > now() - interval '30 days'
  where c.active
  group by c.id, c.last_assigned_at
  order by count(v.id), c.last_assigned_at nulls first
  limit 1;
  if picked is not null then
    new.ctv_id := picked;
    update public.ctvs set last_assigned_at = now() where id = picked;
  end if;
  return new;
end $$;
drop trigger if exists trg_conversations_assign_ctv on public.conversations;
create trigger trg_conversations_assign_ctv
  before insert on public.conversations
  for each row execute function public.assign_ctv_round_robin();

-- ============ FR-137: báo cáo CTV 17h VN mỗi ngày ============
create table if not exists public.ctv_daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  ctv_id uuid references public.ctvs(id),
  body text not null,
  scores jsonb,
  sent_to text,                       -- 'zalo_oa:<admin_id>' | 'none'
  created_at timestamptz not null default now(),
  unique (report_date, ctv_id)
);
alter table public.ctv_daily_reports enable row level security;

-- 17h VN = 10:00 UTC; gọi edge ctv-report qua pg_net với anon key (key công khai)
create or replace function public.ctv_report_tick() returns void
language plpgsql security definer as $$
begin
  perform net.http_post(
    url := 'https://tbcdpupiarkuxtntmosl.supabase.co/functions/v1/ctv-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_zmJBmEgFPn3bBKx_1ve6Pg_dXdo4haX'
    ),
    body := '{}'::jsonb
  );
end $$;
select cron.schedule('ctv-report-tick', '0 10 * * *', 'select public.ctv_report_tick()');

-- ============ FR-138: cấu hình "não" bot từ dashboard ============
-- (đã áp kèm seed 7 key từ _shared/prompts.ts qua migration
--  add_bot_prompts_runtime_config; schema tham chiếu:)
create table if not exists public.bot_prompts (
  key text primary key,   -- tone_rules | human_chat_rules | fee_rules |
                          -- seller_script_rules | slang_notes | buyer_fewshot | rate_ctv_rubric
  content text not null,
  updated_at timestamptz not null default now()
);
alter table public.bot_prompts enable row level security;  -- chỉ service_role

-- ============ FR-139: vòng đời tin (đã áp qua migration add_listing_lifecycle) ============
-- listings.status (text) 5 trạng thái: cho_thong_tin → dang_ban → dang_quan_tam
-- → da_chot, + an (gỡ tay). Kèm cột last_interest_at.
--   * trg_z_listings_normalize_status (BEFORE INSERT/UPDATE): dịch nhãn cũ
--     (unverified→cho_thong_tin, active→dang_ban, sold→da_chot, expired→an,
--     negotiating→dang_quan_tam) + AUTO-PUBLISH: đang cho_thong_tin mà UPDATE
--     đủ price_vnd + area_m2 + ward thì tự nhảy dang_ban.
--     (tên trg_z_ để chạy SAU trg_listings_price_vnd theo thứ tự abc)
--   * mark_listing_interest(p_codes text[]) SECURITY DEFINER (revoke anon):
--     chat-reply gọi khi khách hỏi / bot giới thiệu căn — dang_ban → dang_quan_tam
--     + last_interest_at = now(). Bám theo MÃ CĂN, không theo người.
--   * cron listing-interest-decay (0 20 * * * UTC = 3h sáng VN): 7 ngày không
--     ai hỏi thì dang_quan_tam trả về dang_ban.
--   * RLS anon (web) chỉ đọc dang_ban / dang_quan_tam / da_chot;
--     listings_own_insert with_check status='cho_thong_tin'.

-- ============ FR-140: fallback hỏi-chủ-nhà → CTV → admin ============
-- (đã áp qua migration add_info_request_escalation_fr140; schema tham chiếu:)
alter table info_requests
  add column if not exists assignee text check (assignee in ('seller','ctv','admin')),
  add column if not exists ctv_id uuid references ctvs(id),
  add column if not exists source text not null default 'seller_flow';
-- Kênh liên lạc admin: GIÁ TRỊ THẬT (SĐT/Zalo id) nhập thẳng DB, không commit vào repo
alter table admins
  add column if not exists zalo_user_id text,
  add column if not exists zalo_phone text;
alter table reminders add column if not exists ctv_id uuid references ctvs(id);
-- reminders.kind thêm 'escalation' (promise|reengage|viewing|followup|escalation)
-- trigger trg_route_info_request (BEFORE INSERT khi assignee null):
--   seller có zalo_user_id → 'seller'; không thì CTV active CÒN LIÊN LẠC ĐƯỢC
--   (có zalo hoặc SĐT) ít việc nhất → 'ctv' (+ cập nhật last_assigned_at);
--   không có CTV → 'admin'.
-- trigger trg_notify_info_request_escalation (AFTER INSERT, assignee ctv/admin):
--   sinh reminder kind='escalation' due ngay — nudge gửi OA, hoặc bridge kéo
--   qua edge escalation-feed rồi ack.

-- ============ FR-141/142/144: takeover + chốt theo đồng ý + drip chính chủ ============
-- (đã áp qua migration add_takeover_agree_seller_escalation; schema tham chiếu:)
alter table conversations add column if not exists human_touch_at timestamptz;
-- messages.sender nhận thêm 'human' (không có check constraint)
-- bot_prompts thêm key 'agree_rules' (tín hiệu đồng ý — chữ/emoji/like-tim,
-- sửa ở Table Editor); deals được ghi tự động khi khách đồng ý chốt (FR-142).
-- trigger notify_info_request_escalation mở rộng: assignee='seller' và
-- source='buyer_ask' → reminder escalation kèm seller_id (nudge/bridge chủ
-- động nhắn chính chủ xin bổ sung — FR-144); ask-seller drip thêm guard
-- một-câu-một-lúc (đang có pending thì nhịp cron bỏ qua, không hỏi chồng).
