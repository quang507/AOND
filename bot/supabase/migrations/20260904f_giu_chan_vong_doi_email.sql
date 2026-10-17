-- 20260904f — Giữ chân 5 ngày, vòng đời BĐS & CRM, email admin
-- (FR-60/61/62/63, FR-65, FR-70/72/73, FR-81/57, FR-103, FR-108, FR-110, FR-52,
--  NFR-01, NFR-11 — 04/09/2026)
--
-- Chủ dự án chốt 04/09/2026: "dựng hết, giữ chân 5 ngày". Phần SQL của cả cụm
-- nằm ở file này; phần GỬI nằm ở edge `nudge` v25 (nơi duy nhất gửi tin chủ
-- động, qua `nhan_viec_nhac` + cửa 8–21h). Bám cái đã có: việc mới = `kind` mới
-- của `reminders` (`sold`, `rating`), sự kiện = bảng `property_events` sinh bằng
-- trigger từ các bảng ĐANG ghi, không thêm đường ghi nào cho bot.
--
-- Mục lục:
--   (1) kind `sold`/`rating`; `viewings.status` thêm `confirmed`
--   (2) FR-70/73  property_events + trigger + view `bds_hot`
--   (3) FR-72     view `hoi_thoai_phien` (phiên = cách nhau ≤ 30 phút)
--   (4) NFR-01    view `bot_do_tre` (p50/p95 inbound_ledger 7 ngày)
--   (5) helper    `khu_khop()`, `can_cung_khu()` — "căn khác cùng khu" (FR-62/108/110)
--   (6) FR-108    `mark_listing_interest(codes, buyer)` + trigger `da_chot` → `sold`
--   (7) FR-65     `ratings_log` + `ghi_danh_gia()`
--   (8) FR-81/57  `canh_bao_ngoai(…, p_email)` + `email_admin()` + 4 loại
--   (9) FR-110    `info_request_timeout_tick()` + cron `info-timeout-tick`
--  (10) FR-103    `stale_listing_tick()` + cron `stale-listing-tick`
--  (11) FR-52     viewings insert → báo CTV ngay + câu `xac_nhan_lich`;
--                 CTV trả lời → `viewings.status='confirmed'` + báo khách
--
-- Kiểm thử: docs/10 §10.7 TS-GIUCHAN (mọi ca ghi bọc `do … raise exception`,
-- cuộn lại toàn bộ; uid thử `TEST-…`).

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) KIND MỚI + TRẠNG THÁI LỊCH XEM
-- ═══════════════════════════════════════════════════════════════════════════
-- `sold`   FR-108: căn khách quan tâm vừa chốt → báo thật + gợi ý căn thay thế.
-- `rating` FR-65: dự phòng cho lời xin chấm sao đứng riêng. Hôm nay KHÔNG ai
--          chèn (xem (7)): xin sao đi kèm câu `feedback`. Giữ kind để `nudge`
--          có mẫu sẵn khi cần bật, khỏi deploy lại.
alter table public.reminders drop constraint if exists reminders_kind_check;
alter table public.reminders add constraint reminders_kind_check
  check (kind in ('promise','reengage','viewing','followup','escalation','report',
                  'match','feedback','sold','rating'));

-- Một khách một lần báo chốt cho một tin.
create unique index if not exists reminders_mot_sold_moi_tin_idx
  on public.reminders (buyer_id, listing_id)
  where kind = 'sold';

-- FR-52: lịch xem có bước "CTV xác nhận với chủ nhà". Thêm `confirmed` giữa
-- `pending` và `done`; giữ nguyên bốn giá trị cũ (chat-reply ghi `pending`).
alter table public.viewings drop constraint if exists viewings_status_check;
alter table public.viewings add constraint viewings_status_check
  check (status in ('proposed','pending','confirmed','done','cancelled'));

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) FR-70 / FR-73 — property_events + bds_hot
-- ═══════════════════════════════════════════════════════════════════════════
-- SRS-3.2 thiết kế bảng riêng có `actor_type`; ở đây gọn hơn: sự kiện sinh
-- bằng TRIGGER từ bảng đang ghi (không ai phải nhớ ghi thêm), `buyer_id` khi
-- biết, `meta` cho phần còn lại. `photos` chưa có nguồn sinh (chat-reply gửi
-- ảnh không ghi bảng nào) — để sẵn trong CHECK, chat-reply nối sau.
create table if not exists public.property_events (
  id          bigserial primary key,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  event_type  text not null check (event_type in
                ('view','asked','interest','photos','viewing','deal','match_sent','status')),
  buyer_id    uuid references public.buyers(id) on delete set null,
  at          timestamptz not null default now(),
  meta        jsonb
);
create index if not exists property_events_listing_at_idx on public.property_events (listing_id, at desc);
create index if not exists property_events_at_idx         on public.property_events (at desc);
comment on table public.property_events is
  'FR-70: sự kiện theo tin, sinh bằng trigger từ listing_views/info_requests/interests/viewings/deals/reminders/listings. Admin đọc (CSV từ Table Editor — NFR-11); bot ghi qua trigger.';

alter table public.property_events enable row level security;
revoke all on public.property_events from public, anon;
revoke insert, update, delete, truncate on public.property_events from authenticated;
grant select on public.property_events to authenticated;
grant all on public.property_events to service_role;
grant usage, select on sequence public.property_events_id_seq to service_role;
drop policy if exists property_events_admin_read on public.property_events;
create policy property_events_admin_read on public.property_events
  for select to authenticated
  using (exists (select 1 from public.admins a where a.email = ((select auth.jwt()) ->> 'email')));

-- Ghi một sự kiện, KHÔNG BAO GIỜ ném — sổ sự kiện hỏng không được chặn việc
-- thật (đặt lịch, ghi deal). Lỗi → log_loi (FR-152 d).
create or replace function public.ghi_su_kien_bds(p_listing_id uuid, p_type text, p_buyer_id uuid default null, p_meta jsonb default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_listing_id is null then return; end if;
  insert into property_events (listing_id, event_type, buyer_id, meta)
  values (p_listing_id, p_type, p_buyer_id, p_meta);
exception when others then
  perform public.log_loi('ghi_su_kien_bds', left(p_type || ': ' || sqlerrm, 400), null::integer);
end $$;
revoke all on function public.ghi_su_kien_bds(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- Một hàm trigger cho mọi bảng nguồn — nhìn TG_TABLE_NAME mà chọn loại.
create or replace function public.trg_property_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_listing uuid;
begin
  if tg_table_name = 'listing_views' then
    perform public.ghi_su_kien_bds(new.listing_id, 'view', null, jsonb_build_object('auth_user_id', new.auth_user_id));
  elsif tg_table_name = 'interests' then
    perform public.ghi_su_kien_bds(new.listing_id, 'interest', new.buyer_id, null);
  elsif tg_table_name = 'info_requests' then
    if new.source = 'buyer_ask' and coalesce(new.question, '') <> 'xac_nhan_lich' then
      perform public.ghi_su_kien_bds(new.listing_id, 'asked', new.buyer_id, jsonb_build_object('question', left(new.question, 200)));
    end if;
  elsif tg_table_name = 'viewings' then
    v_listing := new.listing_id;
    if v_listing is null and new.listing_code is not null then
      select id into v_listing from listings where code = new.listing_code;
    end if;
    perform public.ghi_su_kien_bds(v_listing, 'viewing', new.buyer_id,
      jsonb_build_object('viewing_id', new.id, 'slot', new.slot, 'time_text', new.time_text));
  elsif tg_table_name = 'deals' then
    perform public.ghi_su_kien_bds(new.listing_id, 'deal', new.buyer_id, jsonb_build_object('deal_id', new.id, 'price_vnd', new.price_vnd));
  elsif tg_table_name = 'reminders' then
    if new.kind = 'match' and new.status = 'sent' and old.status is distinct from 'sent' then
      perform public.ghi_su_kien_bds(new.listing_id, 'match_sent', new.buyer_id, jsonb_build_object('reminder_id', new.id));
    end if;
  elsif tg_table_name = 'listings' then
    if tg_op = 'UPDATE' and old.status is distinct from new.status then
      perform public.ghi_su_kien_bds(new.id, 'status', null, jsonb_build_object('tu', old.status, 'den', new.status));
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_pe_listing_views on public.listing_views;
create trigger trg_pe_listing_views after insert on public.listing_views
  for each row execute function public.trg_property_event();
drop trigger if exists trg_pe_interests on public.interests;
create trigger trg_pe_interests after insert on public.interests
  for each row execute function public.trg_property_event();
drop trigger if exists trg_pe_info_requests on public.info_requests;
create trigger trg_pe_info_requests after insert on public.info_requests
  for each row execute function public.trg_property_event();
drop trigger if exists trg_pe_viewings on public.viewings;
create trigger trg_pe_viewings after insert on public.viewings
  for each row execute function public.trg_property_event();
drop trigger if exists trg_pe_deals on public.deals;
create trigger trg_pe_deals after insert on public.deals
  for each row execute function public.trg_property_event();
drop trigger if exists trg_pe_reminders on public.reminders;
create trigger trg_pe_reminders after update of status on public.reminders
  for each row execute function public.trg_property_event();
drop trigger if exists trg_pe_listings on public.listings;
create trigger trg_pe_listings after update on public.listings
  for each row execute function public.trg_property_event();

-- FR-73: BĐS hot = đếm sự kiện 60 ngày. Gác cổng như `ctv_ranks`.
create or replace view public.bds_hot as
select l.id as listing_id, l.code, l.ward, l.district, l.status,
       count(e.id) filter (where e.at > now() - interval '60 days')::int as so_su_kien_60d,
       count(e.id) filter (where e.at > now() - interval '60 days' and e.event_type = 'view')::int    as xem_60d,
       count(e.id) filter (where e.at > now() - interval '60 days' and e.event_type = 'asked')::int   as hoi_60d,
       count(e.id) filter (where e.at > now() - interval '60 days' and e.event_type = 'viewing')::int as lich_xem_60d,
       max(e.at) as last_event_at
from public.listings l
left join public.property_events e on e.listing_id = l.id
where auth.role() = 'service_role'
   or exists (select 1 from public.admins a where a.email = (select auth.jwt()) ->> 'email')
group by l.id, l.code, l.ward, l.district, l.status
order by so_su_kien_60d desc, last_event_at desc nulls last;
revoke all on public.bds_hot from public, anon, authenticated, service_role;
grant select on public.bds_hot to authenticated, service_role;
comment on view public.bds_hot is
  'FR-73: tin xếp theo số sự kiện 60 ngày (property_events). Chỉ admin/service_role. Xuất CSV từ Table Editor là đủ (NFR-11).';

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) FR-72 — phiên trò chuyện: hai tin cách nhau > 30 phút là phiên mới
-- ═══════════════════════════════════════════════════════════════════════════
-- KHÔNG đổi model `conversations` (một hội thoại/khách là cố ý, FR-131): phiên
-- là cách NHÌN vào `messages`, tính lúc đọc bằng window lag.
create or replace view public.hoi_thoai_phien as
with m as (
  select conversation_id, created_at, sender, seq,
         lag(created_at) over (partition by conversation_id order by created_at, seq) as prev_at
  from public.messages
),
g as (
  select *,
         sum(case when prev_at is null or created_at - prev_at > interval '30 minutes' then 1 else 0 end)
           over (partition by conversation_id order by created_at, seq rows unbounded preceding) as phien
  from m
)
select g.conversation_id, c.buyer_id, c.seller_id,
       g.phien::int as so_phien,
       min(g.created_at) as phien_bat_dau,
       max(g.created_at) as phien_ket_thuc,
       (max(g.created_at) - min(g.created_at)) as thoi_luong,
       count(*)::int as so_tin,
       count(*) filter (where g.sender in ('buyer','seller'))::int as so_tin_khach,
       count(*) filter (where g.sender = 'bot')::int as so_tin_bot,
       (array_agg(g.sender::text order by g.created_at, g.seq))[1] as sender_dau
from g
join public.conversations c on c.id = g.conversation_id
where auth.role() = 'service_role'
   or exists (select 1 from public.admins a where a.email = (select auth.jwt()) ->> 'email')
group by g.conversation_id, c.buyer_id, c.seller_id, g.phien;
revoke all on public.hoi_thoai_phien from public, anon, authenticated, service_role;
grant select on public.hoi_thoai_phien to authenticated, service_role;
comment on view public.hoi_thoai_phien is
  'FR-72: tách messages thành phiên khi hai tin cách nhau > 30 phút. Chỉ admin/service_role.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) NFR-01 — độ trễ bot 7 ngày
-- ═══════════════════════════════════════════════════════════════════════════
create or replace view public.bot_do_tre as
select * from (
  select count(*)::int as so_luot,
         round(percentile_cont(0.5)  within group (order by extract(epoch from finished_at - started_at))::numeric, 2) as p50_giay,
         round(percentile_cont(0.95) within group (order by extract(epoch from finished_at - started_at))::numeric, 2) as p95_giay,
         round(max(extract(epoch from finished_at - started_at))::numeric, 2) as max_giay,
         min(started_at) as tu, max(finished_at) as den
  from public.inbound_ledger
  where started_at is not null and finished_at is not null
    and finished_at >= now() - interval '7 days'
) x
where auth.role() = 'service_role'
   or exists (select 1 from public.admins a where a.email = (select auth.jwt()) ->> 'email');
revoke all on public.bot_do_tre from public, anon, authenticated, service_role;
grant select on public.bot_do_tre to authenticated, service_role;
comment on view public.bot_do_tre is
  'NFR-01: p50/p95 (giây) của inbound_ledger.finished_at - started_at, 7 ngày. Đo cả model + gửi Zalo. Chỉ admin/service_role.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) "CĂN KHÁC CÙNG KHU" — dùng chung cho FR-62 / FR-108 / FR-110
-- ═══════════════════════════════════════════════════════════════════════════
-- Luật khu vực y hệt `bao_tin_moi_khop` (20260904d): khách NÊU số phường thì
-- phải đúng phường; không nêu thì theo tên phường chữ hoặc quận/huyện, so
-- không dấu. Tách thành hàm để ba chỗ không nói ba giọng.
create or replace function public.khu_khop(p_area_kd text, p_ward text, p_district text)
returns boolean
language plpgsql
stable
set search_path to 'public'
as $$
declare v_ward_kd text; v_ward_no text; v_dist_kd text; v_dist_re text;
begin
  if coalesce(p_area_kd, '') = '' then return false; end if;
  v_ward_kd := btrim(regexp_replace(public.bo_dau(coalesce(p_ward, '')), '^phuong\s*', ''));
  v_ward_no := (regexp_match(v_ward_kd, '^([0-9]{1,2})$'))[1];
  v_dist_kd := btrim(public.bo_dau(coalesce(p_district, '')));
  v_dist_re := case
    when v_dist_kd ~ '^(quan|q)\s*\.?\s*[0-9]{1,2}$'
      then '(quan|q)\s*\.?\s*' || (regexp_match(v_dist_kd, '([0-9]{1,2})$'))[1] || '\M'
    when v_dist_kd <> '' then '\m' || v_dist_kd || '\M'
    else null end;
  if p_area_kd ~ '(phuong\s*\.?\s*[0-9]{1,2}|(^|[^a-z0-9])p\.?\s*[0-9]{1,2}(?![0-9]))' then
    return v_ward_no is not null
       and p_area_kd ~ ('(phuong\s*\.?\s*' || v_ward_no || '(?![0-9])|(^|[^a-z0-9])p\.?\s*' || v_ward_no || '(?![0-9]))');
  end if;
  return (v_ward_no is null and v_ward_kd <> '' and p_area_kd ~ ('\m' || v_ward_kd || '\M'))
      or (v_dist_re is not null and p_area_kd ~ v_dist_re);
end $$;

-- can_cung_khu(khách, căn mốc, n): 2–3 căn `dang_ban`/`dang_quan_tam` cùng
-- phường (ưu tiên) hoặc cùng quận, giá trong 0,7×–1,15× mốc. Mốc = căn truyền
-- vào (phường/quận/giá của nó) hoặc, không có căn, hồ sơ `buyers.preferences`
-- (area/budget/deal). Trừ căn đã gửi cho khách: `reminders` match/sold/followup,
-- `interests`, `viewings`. `tom_tat` ghép từ CỘT để mẫu câu dùng thẳng.
create or replace function public.can_cung_khu(p_buyer_id uuid, p_listing_id uuid default null, p_limit int default 3)
returns table (id uuid, code text, ward text, district text, price_raw text, area_m2 numeric, tom_tat text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ward text; v_dist text; v_price bigint; v_deal text; v_area_kd text := '';
begin
  if p_listing_id is not null then
    select l.ward, l.district, l.price_vnd, l.deal::text into v_ward, v_dist, v_price, v_deal
      from listings l where l.id = p_listing_id;
  end if;
  if v_ward is null and v_dist is null and p_buyer_id is not null then
    select public.bo_dau(coalesce(b.preferences->>'area', '')),
           public.parse_vnd(b.preferences->>'budget'),
           case when coalesce(b.preferences->>'deal', 'ban') in ('thue', 'cho_thue') then 'cho_thue' else 'ban' end
      into v_area_kd, v_price, v_deal
      from buyers b where b.id = p_buyer_id;
  end if;
  v_deal := coalesce(v_deal, 'ban');
  if v_ward is null and v_dist is null and coalesce(v_area_kd, '') = '' then
    return;  -- không có mốc khu vực thì không đoán
  end if;

  return query
  select l.id, l.code, l.ward, l.district, l.price_raw, l.area_m2,
         '#' || l.code || ' · ' || coalesce(l.ward, '') || coalesce(', ' || l.district, '')
           || coalesce(' · ' || l.price_raw, '')
           || coalesce(' · ' || rtrim(to_char(l.area_m2, 'FM9999999990.99'), '.') || 'm2', '')
    from listings l
   where l.status in ('dang_ban', 'dang_quan_tam')
     and l.id is distinct from p_listing_id
     and l.deal::text = v_deal
     and (v_price is null or l.price_vnd is null
          or l.price_vnd between (v_price * 0.7)::bigint and (v_price * 1.15)::bigint)
     and (
       case when v_ward is not null or v_dist is not null then
              (v_ward is not null and public.bo_dau(l.ward) = public.bo_dau(v_ward))
              or (v_dist is not null and public.bo_dau(l.district) = public.bo_dau(v_dist))
            else public.khu_khop(v_area_kd, l.ward, l.district) end
     )
     and (p_buyer_id is null or not exists (
           select 1 from reminders r where r.buyer_id = p_buyer_id and r.listing_id = l.id
                                       and r.kind in ('match', 'sold', 'followup')))
     and (p_buyer_id is null or not exists (select 1 from interests i where i.buyer_id = p_buyer_id and i.listing_id = l.id))
     and (p_buyer_id is null or not exists (select 1 from viewings v where v.buyer_id = p_buyer_id and v.listing_id = l.id))
   order by (v_ward is not null and public.bo_dau(l.ward) = public.bo_dau(v_ward)) desc,
            l.last_interest_at desc nulls last, l.created_at desc
   limit greatest(1, least(coalesce(p_limit, 3), 5));
end $$;
revoke all on function public.can_cung_khu(uuid, uuid, int) from public, anon, authenticated;
grant  execute on function public.can_cung_khu(uuid, uuid, int) to service_role;
comment on function public.can_cung_khu(uuid, uuid, int) is
  'FR-62/108/110: 2–3 căn cùng phường (ưu tiên) hoặc quận, giá 0,7–1,15× mốc (căn hoặc hồ sơ khách), trừ căn đã gửi/quan tâm/xem. nudge gọi để chào "căn khác cùng khu".';

-- ═══════════════════════════════════════════════════════════════════════════
-- (6) FR-108 — interests + báo khi căn đã chốt
-- ═══════════════════════════════════════════════════════════════════════════
-- Chữ ký cũ giữ nguyên (chat-reply đang gọi); overload thêm buyer để ghi
-- `interests`. `on conflict do nothing` — khách hỏi lại căn cũ không nhân đôi.
create or replace function public.mark_listing_interest(p_codes text[], p_buyer_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare n int;
begin
  n := public.mark_listing_interest(p_codes);
  if p_buyer_id is not null then
    insert into interests (buyer_id, listing_id)
    select p_buyer_id, l.id from listings l
     where l.code = any(p_codes) and l.status in ('dang_ban', 'dang_quan_tam', 'da_chot')
    on conflict (buyer_id, listing_id) do nothing;
  end if;
  return n;
end $$;
revoke all on function public.mark_listing_interest(text[], uuid) from public, anon, authenticated;
grant  execute on function public.mark_listing_interest(text[], uuid) to service_role;
comment on function public.mark_listing_interest(text[], uuid) is
  'FR-108: như bản (text[]) + ghi interests(buyer_id, listing_id) on conflict do nothing.';

-- Tin sang `da_chot` → mỗi khách trong `interests` có Zalo nhận MỘT `sold`,
-- note = "#mã đã chốt · thay thế: #a (…); #b (…)" (1–2 căn cùng phường/giá).
-- Van 1 sold/khách/24h (như match). Khách vừa chốt chính căn này (có `deals`)
-- thì không báo — họ là người mua, không phải người chờ.
create or replace function public.bao_can_da_chot(p_listing_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; v_code text; v_note text; v_thay text; n int := 0;
begin
  select code into v_code from listings where id = p_listing_id;
  for r in
    select i.buyer_id
      from interests i
      join buyers b on b.id = i.buyer_id
     where i.listing_id = p_listing_id
       and b.zalo_user_id is not null
       and not exists (select 1 from deals d where d.listing_id = p_listing_id and d.buyer_id = i.buyer_id)
       and not exists (select 1 from reminders x
                        where x.buyer_id = i.buyer_id and x.kind = 'sold'
                          and x.status in ('pending', 'sent')
                          and x.created_at > now() - interval '24 hours')
     limit 50
  loop
    select string_agg(c.tom_tat, '; ') into v_thay
      from public.can_cung_khu(r.buyer_id, p_listing_id, 2) c;
    v_note := '#' || coalesce(v_code, '?') || ' đã chốt'
           || coalesce(' · thay thế: ' || v_thay, '');
    insert into reminders (kind, buyer_id, listing_id, due_at, note)
    values ('sold', r.buyer_id, p_listing_id, now(), v_note)
    on conflict (buyer_id, listing_id) where kind = 'sold' do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.bao_can_da_chot(uuid) from public, anon, authenticated;
grant  execute on function public.bao_can_da_chot(uuid) to service_role;

create or replace function public.listings_bao_can_da_chot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'da_chot' and old.status is distinct from 'da_chot' then
    begin
      perform public.bao_can_da_chot(new.id);
    exception when others then
      perform public.log_loi('bao_can_da_chot', left(sqlerrm, 400), null::integer);
    end;
  end if;
  return null;
end $$;
drop trigger if exists trg_listings_bao_can_da_chot on public.listings;
create trigger trg_listings_bao_can_da_chot
  after update of status on public.listings
  for each row execute function public.listings_bao_can_da_chot();

-- ═══════════════════════════════════════════════════════════════════════════
-- (7) FR-65 — chấm sao
-- ═══════════════════════════════════════════════════════════════════════════
-- Ba thời điểm của FR-65: (1) sau khi gửi thông tin một căn, (2) sau đợt tìm,
-- (3) sau xem nhà. Hôm nay chỉ (3): câu `feedback` (FR-56, +4h sau giờ xem)
-- thêm vế "chấm mấy sao (1-5) giúp em"; chat-reply bắt "N sao"/"N/5" trong
-- 48h rồi gọi `ghi_danh_gia`. (1) và (2) cố ý CHƯA làm: thêm hai lần xin sao
-- trong cùng một tuần là spam đúng loại FR-146 cấm [giả định BA].
create table if not exists public.ratings_log (
  buyer_id   uuid not null references public.buyers(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  stars      int  not null check (stars between 1 and 5),
  note       text,
  at         timestamptz not null default now(),
  primary key (buyer_id, listing_id)
);
alter table public.ratings_log enable row level security;
revoke all on public.ratings_log from public, anon, authenticated;
grant all on public.ratings_log to service_role;
comment on table public.ratings_log is 'FR-65: một sao/khách/căn (idempotent cho ghi_danh_gia). Bot-only, không policy.';

create or replace function public.ghi_danh_gia(p_buyer_id uuid, p_listing_id uuid, p_stars int, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_seller uuid; v_viewing uuid;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'sao phải 1..5';
  end if;
  insert into ratings_log (buyer_id, listing_id, stars, note)
  values (p_buyer_id, p_listing_id, p_stars, left(p_note, 300))
  on conflict (buyer_id, listing_id) do nothing;
  if not found then return; end if;   -- đã chấm rồi: không cộng đúp

  select id into v_viewing from viewings
   where buyer_id = p_buyer_id and listing_id = p_listing_id
   order by coalesce(slot, created_at) desc limit 1;
  if v_viewing is not null then
    update viewings set buyer_rating = p_stars,
           note = case when p_note is null then note
                       else coalesce(note || ' · ', '') || left(p_note, 300) end
     where id = v_viewing;
  end if;

  select seller_id into v_seller from listings where id = p_listing_id;
  if v_seller is not null then
    update sellers set rating_sum = coalesce(rating_sum, 0) + p_stars,
                       rating_count = coalesce(rating_count, 0) + 1
     where id = v_seller;
  end if;
end $$;
revoke all on function public.ghi_danh_gia(uuid, uuid, int, text) from public, anon, authenticated;
grant  execute on function public.ghi_danh_gia(uuid, uuid, int, text) to service_role;
comment on function public.ghi_danh_gia(uuid, uuid, int, text) is
  'FR-65: ghi sao vào viewings.buyer_rating (buổi xem gần nhất của cặp) + cộng sellers.rating_sum/count. Idempotent theo (buyer, listing) qua ratings_log.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (8) FR-81 / FR-57 — email admin qua ntfy.sh
-- ═══════════════════════════════════════════════════════════════════════════
-- Không có SMTP; ntfy.sh nhận khoá `email` trong body và CHUYỂN TIẾP email.
-- ĐÃ THỬ THẬT 04/09/2026 (net.http_post có `email: test@example.com`): ntfy
-- trả **400 `anonymous email sending is not allowed`** — gửi email cần tài
-- khoản ntfy (bậc trả phí, có hạn mức email/ngày) và token `Authorization:
-- Bearer tk_…`. Vì vậy `canh_bao_ngoai` đọc thêm secret Vault `NTFY_TOKEN`
-- (tuỳ chọn): có thì gắn header, không có thì gửi ẩn danh như cũ (push vẫn
-- tới, email bị ntfy từ chối → bot_health_tick ghi một dòng pg_net 400).
-- Muốn email chạy: tạo tài khoản ntfy → token → `select vault.create_secret(
-- 'tk_…', 'NTFY_TOKEN')` → UPDATE `admin_email`. `admin_email` rỗng = không gửi.
insert into public.app_config (key, value, ghi_chu)
values ('admin_email', '', 'FR-81: email nhận cảnh báo [VIEWING]/[UPSET]/[QUESTION]/[VOICE] qua ntfy.sh; để trống = không gửi email')
on conflict (key) do nothing;

-- Đổi chữ ký: thêm `p_email`. Phải DROP bản 3 tham số — giữ cả hai là mọi lời
-- gọi 3 tham số (bot_health_tick) thành "function is not unique".
drop function if exists public.canh_bao_ngoai(text, text, int);
create or replace function public.canh_bao_ngoai(p_title text, p_text text, p_priority int default 4, p_email boolean default false)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'net'
as $$
declare v_topic text; v_mail text; v_token text; v_body jsonb; v_hdr jsonb; v_id bigint;
begin
  select value into v_topic from app_config where key = 'ntfy_topic';
  if v_topic is null or btrim(v_topic) = '' then return null; end if;
  v_body := jsonb_build_object('topic', v_topic, 'title', left(p_title, 120),
                               'message', left(p_text, 900), 'priority', p_priority,
                               'tags', jsonb_build_array('house'));
  v_hdr := '{"Content-Type": "application/json"}'::jsonb;
  begin
    v_token := public.get_secret('NTFY_TOKEN');
  exception when others then v_token := null;
  end;
  if v_token is not null and btrim(v_token) <> '' then
    v_hdr := v_hdr || jsonb_build_object('Authorization', 'Bearer ' || btrim(v_token));
  end if;
  if p_email then
    select value into v_mail from app_config where key = 'admin_email';
    if v_mail is not null and btrim(v_mail) <> '' then
      v_body := v_body || jsonb_build_object('email', btrim(v_mail));
    end if;
  end if;
  select net.http_post(url := 'https://ntfy.sh', body := v_body, headers := v_hdr) into v_id;
  return v_id;
end $$;
revoke all on function public.canh_bao_ngoai(text, text, int, boolean) from public, anon, authenticated;
comment on function public.canh_bao_ngoai(text, text, int, boolean) is
  'FR-152 e + FR-81: đẩy cảnh báo ra ntfy.sh; p_email=true và app_config.admin_email có giá trị → ntfy chuyển tiếp email. Chỉ service_role/cron.';

-- Bốn loại FR-81. Tiêu đề "[LOẠI] <zalo uid>", thân = các trường + mô tả BĐS
-- nếu có mã. `admin_email` rỗng → KHÔNG gửi gì (không push, vì topic ntfy là
-- kênh sức khoẻ bot, không phải hộp thư việc). Không bao giờ ném.
create or replace function public.email_admin(p_loai text, p_zalo_uid text, p_body text, p_listing_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_mail text; v_bds text; v_id bigint;
begin
  select value into v_mail from app_config where key = 'admin_email';
  if v_mail is null or btrim(v_mail) = '' then return null; end if;
  if p_listing_id is not null then
    select '#' || code || ' · ' || coalesce(location_raw, '') || ' ' || coalesce(ward, '')
           || coalesce(', ' || district, '') || coalesce(' · ' || price_raw, '')
           || coalesce(' · ' || rtrim(to_char(area_m2, 'FM9999999990.99'), '.') || 'm2', '')
           || coalesce(E'\n' || left(description, 300), '')
      into v_bds from listings where id = p_listing_id;
  end if;
  v_id := public.canh_bao_ngoai(
    '[' || p_loai || '] ' || coalesce(p_zalo_uid, '?'),
    coalesce(p_body, '') || coalesce(E'\nBĐS: ' || v_bds, '')
      || E'\nThời điểm: ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'),
    case when p_loai in ('UPSET', 'VOICE') then 5 else 4 end,
    true);
  return v_id;
exception when others then
  perform public.log_loi('email_admin', left(p_loai || ': ' || sqlerrm, 400), null::integer);
  return null;
end $$;
revoke all on function public.email_admin(text, text, text, uuid) from public, anon, authenticated;
comment on function public.email_admin(text, text, text, uuid) is
  'FR-81: [QUESTION]/[VOICE]/[VIEWING]/[UPSET] <zalo uid> → canh_bao_ngoai(p_email=true). admin_email rỗng = im. Không ném.';

-- [UPSET]: hội thoại giơ cờ needs_human (FR-77 lấy cờ này làm proxy, 20260904c).
create or replace function public.conversations_email_upset()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid text; v_ten text; v_trich text;
begin
  if new.needs_human and not coalesce(old.needs_human, false) and new.buyer_id is not null then
    select b.zalo_user_id, b.name into v_uid, v_ten from buyers b where b.id = new.buyer_id;
    select string_agg('- ' || left(m.body, 200), E'\n' order by m.created_at) into v_trich
      from (select body, created_at from messages
             where conversation_id = new.id and sender = 'buyer'
             order by created_at desc limit 3) m;
    perform public.email_admin('UPSET', v_uid,
      'Khách: ' || coalesce(v_ten, '(chưa biết tên)') || E'\nHội thoại: ' || new.id::text
      || E'\nTin gần nhất:\n' || coalesce(v_trich, '-'));
  end if;
  return null;
end $$;
drop trigger if exists trg_conversations_email_upset on public.conversations;
create trigger trg_conversations_email_upset
  after update of needs_human on public.conversations
  for each row execute function public.conversations_email_upset();

-- [VOICE]: quy ước với chat-reply — khách muốn nói chuyện/gửi voice thì chèn
-- `reminders(kind='escalation', buyer_id, note 'VOICE: …')`. Trigger này chỉ
-- gửi email; đường nhắc CTV/admin đi như mọi escalation.
create or replace function public.reminders_email_voice()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid text; v_ten text;
begin
  if new.kind = 'escalation' and new.note like 'VOICE:%' then
    if new.buyer_id is not null then
      select b.zalo_user_id, b.name into v_uid, v_ten from buyers b where b.id = new.buyer_id;
    end if;
    perform public.email_admin('VOICE', v_uid,
      'Khách: ' || coalesce(v_ten, '(chưa biết tên)') || E'\n' || left(new.note, 500), new.listing_id);
  end if;
  return null;
end $$;
drop trigger if exists trg_reminders_email_voice on public.reminders;
create trigger trg_reminders_email_voice
  after insert on public.reminders
  for each row execute function public.reminders_email_voice();

-- [QUESTION]: câu khách hỏi giao CTV quá SLA — chèn vào `info_request_sla_tick`
-- (20260903a), thân giữ nguyên, thêm email. Câu `xac_nhan_lich` (FR-52) bỏ
-- qua email: đã có [VIEWING] lúc đặt lịch.
create or replace function public.info_request_sla_tick()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; n int := 0;
begin
  for r in
    select q.id, q.question, q.buyer_id, q.listing_id, l.code, coalesce(c.name, '?') as ctv_name,
           b.zalo_user_id as buyer_uid, b.name as buyer_name
    from info_requests q
    join listings l on l.id = q.listing_id
    left join ctvs c on c.id = q.ctv_id
    left join buyers b on b.id = q.buyer_id
    where q.status = 'pending' and q.source = 'buyer_ask' and q.assignee = 'ctv'
      and q.sla_due_at < now() and q.sla_missed_at is null
    limit 50
  loop
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', r.listing_id, now(),
      '⏰ CTV ' || r.ctv_name || ' chưa trả lời câu khách hỏi #' || coalesce(r.code, '?')
      || ' ("' || coalesce(r.question, '') || '") sau ' || public.ctv_sla_phut()
      || ' phút. Admin đỡ khách giúp: hỏi chủ rồi nhắn bot "#' || coalesce(r.code, '?') || ': câu trả lời".');
    update info_requests set sla_missed_at = now() where id = r.id;
    if coalesce(r.question, '') <> 'xac_nhan_lich' then
      perform public.email_admin('QUESTION', r.buyer_uid,
        'Khách: ' || coalesce(r.buyer_name, '(chưa biết tên)') || E'\nCâu hỏi: "' || coalesce(r.question, '')
        || E'"\nCTV: ' || r.ctv_name || ' quá ' || public.ctv_sla_phut() || ' phút chưa trả lời', r.listing_id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (9) FR-110 — timeout câu hỏi
-- ═══════════════════════════════════════════════════════════════════════════
-- seller_flow: > 24h chưa nhắc → `reminded_at` (drip của ask-seller vẫn là
-- người hỏi lại — không bắn thêm tin ở đây); > 48h → `expired` (drip được hỏi
-- lại từ đầu vì hết pending). buyer_ask: > 48h chưa trả lời → `expired` + một
-- `followup` cho khách: "chủ nhà chưa phản hồi #mã, gợi ý căn khác: …" — nudge
-- v25 gửi mẫu cố định, báo thật (FR-110 "báo trung thực cho B").
create or replace function public.info_request_timeout_tick()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; v_thay text; n_nhac int := 0; n_het int := 0; n_khach int := 0;
begin
  update info_requests set reminded_at = now()
   where status = 'pending' and source = 'seller_flow' and reminded_at is null
     and created_at < now() - interval '24 hours';
  get diagnostics n_nhac = row_count;

  update info_requests set status = 'expired'
   where status = 'pending' and source = 'seller_flow'
     and created_at < now() - interval '48 hours';
  get diagnostics n_het = row_count;

  for r in
    select q.id, q.buyer_id, q.listing_id, l.code
      from info_requests q left join listings l on l.id = q.listing_id
     where q.status = 'pending' and q.source = 'buyer_ask'
       and q.created_at < now() - interval '48 hours'
     limit 50
  loop
    update info_requests set status = 'expired' where id = r.id;
    if r.buyer_id is not null then
      select string_agg(c.tom_tat, '; ') into v_thay
        from public.can_cung_khu(r.buyer_id, r.listing_id, 2) c;
      update reminders set status = 'cancelled'
       where buyer_id = r.buyer_id and listing_id = r.listing_id
         and kind = 'followup' and status = 'pending';
      insert into reminders (kind, buyer_id, listing_id, due_at, note)
      values ('followup', r.buyer_id, r.listing_id, now(),
        'chủ nhà chưa phản hồi #' || coalesce(r.code, '?')
        || coalesce(', gợi ý căn khác: ' || v_thay, ''));
      n_khach := n_khach + 1;
    end if;
  end loop;
  return jsonb_build_object('nhac_24h', n_nhac, 'het_han_seller', n_het, 'het_han_buyer_ask', n_khach);
end $$;
revoke all on function public.info_request_timeout_tick() from public, anon, authenticated;
grant  execute on function public.info_request_timeout_tick() to service_role;
comment on function public.info_request_timeout_tick() is
  'FR-110: seller_flow >24h → reminded_at, >48h → expired; buyer_ask >48h → expired + followup "chủ nhà chưa phản hồi #mã, gợi ý căn khác". Cron info-timeout-tick mỗi giờ 8–20h VN.';

select cron.unschedule(jobid) from cron.job where jobname = 'info-timeout-tick';
select cron.schedule('info-timeout-tick', '3 1-13 * * *', 'select public.info_request_timeout_tick()');

-- ═══════════════════════════════════════════════════════════════════════════
-- (10) FR-103 — tin `dang_ban` im 30 ngày: hỏi "nhà mình còn bán không ạ"
-- ═══════════════════════════════════════════════════════════════════════════
-- Một câu `info_requests(source='seller_flow', question='con_ban')` mỗi 30
-- ngày/tin. Chỉ tin CÓ chủ (seller_id) — không có chủ thì hỏi ai. Trần 5
-- tin/ngày, cũ nhất trước: hôm nay 158 tin `dang_ban` nhập từ Excel sẽ cùng
-- "im 30 ngày" vào một ngày, xả hết là 158 lời nhắc CTV trong một sáng.
-- Lời hỏi đi bằng đường escalation (chính chủ có Zalo → nudge/bridge nhắn
-- thẳng; không thì giao CTV) với ghi chú viết riêng — trigger
-- `notify_info_request_escalation` bỏ qua câu này (xem (11)).
create or replace function public.stale_listing_tick()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; n int := 0; v_ir uuid; v_assignee text; v_ctv uuid;
begin
  for r in
    select l.id, l.code, l.seller_id, s.zalo_user_id as seller_zalo
      from listings l join sellers s on s.id = l.seller_id
     where l.status = 'dang_ban'
       and l.updated_at < now() - interval '30 days'
       and not exists (select 1 from property_events e
                        where e.listing_id = l.id and e.at > now() - interval '30 days')
       and not exists (select 1 from info_requests q
                        where q.listing_id = l.id and q.question = 'con_ban'
                          and q.created_at > now() - interval '30 days')
     order by l.updated_at
     limit 5
  loop
    insert into info_requests (listing_id, question, status, source)
    values (r.id, 'con_ban', 'pending', 'seller_flow')
    returning id, assignee, ctv_id into v_ir, v_assignee, v_ctv;
    if v_assignee = 'seller' then
      insert into reminders (kind, listing_id, seller_id, due_at, note)
      values ('escalation', r.id, r.seller_id, now(),
        'tin #' || coalesce(r.code, '?') || ' của mình đăng đã hơn 30 ngày. Nhà mình còn bán không ạ? Còn thì anh/chị nhắn "còn" giúp em, em giữ tin và tiếp tục tìm khách');
    else
      insert into reminders (kind, listing_id, ctv_id, due_at, note)
      values ('escalation', r.id, v_ctv, now(),
        'tin #' || coalesce(r.code, '?') || ' đăng đã 30 ngày không có khách hỏi. Anh/chị hỏi chủ nhà còn bán không rồi nhắn lại em "#' || coalesce(r.code, '?') || ': còn bán" hoặc "#' || coalesce(r.code, '?') || ': đã bán" nha');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.stale_listing_tick() from public, anon, authenticated;
grant  execute on function public.stale_listing_tick() to service_role;
comment on function public.stale_listing_tick() is
  'FR-103: tin dang_ban không sự kiện/updated_at 30 ngày → info_requests(con_ban) 1 lần/30 ngày, tối đa 5 tin/ngày, chỉ tin có chủ. Cron stale-listing-tick 9h VN.';

select cron.unschedule(jobid) from cron.job where jobname = 'stale-listing-tick';
select cron.schedule('stale-listing-tick', '0 2 * * *', 'select public.stale_listing_tick()');

-- ═══════════════════════════════════════════════════════════════════════════
-- (11) FR-52 / FR-57 — lịch xem: báo CTV NGAY, CTV xác nhận ngược
-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger mặc định của `info_requests` (`notify_info_request_escalation`,
-- 20260903a) soạn ghi chú kiểu "khách hỏi #mã: …" — không hợp với hai câu
-- có ghi chú riêng ở đây (`xac_nhan_lich`, `con_ban`). Thêm đúng một guard,
-- phần còn lại giữ nguyên chữ.
create or replace function public.notify_info_request_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code   text;
  v_seller uuid;
  v_hoi    text;
begin
  if coalesce(new.question, '') in ('xac_nhan_lich', 'con_ban') then return new; end if;  -- 20260904f

  select l.code, l.seller_id into v_code, v_seller from listings l where l.id = new.listing_id;
  v_hoi := coalesce(new.question, 'thông tin');

  if new.assignee = 'admin' then
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', new.listing_id, now(),
      '❓ Khách hỏi căn #' || coalesce(v_code, '?') || ': "' || v_hoi
      || '" — không có CTV nào đang hoạt động. Admin hỏi chủ rồi nhắn bot "#'
      || coalesce(v_code, '?') || ': câu trả lời".');

  elsif new.assignee = 'ctv' then
    if new.source = 'buyer_ask' then
      insert into reminders (kind, listing_id, ctv_id, due_at, note)
      values ('escalation', new.listing_id, new.ctv_id, now(),
        'khách hỏi #' || coalesce(v_code, '?') || ': "' || v_hoi
        || '". Anh/chị hỏi chủ rồi nhắn lại em theo mẫu "#' || coalesce(v_code, '?')
        || ': câu trả lời" trong ' || public.ctv_sla_phut() || ' phút nha, em báo khách liền.');
    else
      insert into reminders (kind, listing_id, ctv_id, due_at, note)
      values ('escalation', new.listing_id, new.ctv_id, now(),
        'khách hỏi #' || coalesce(v_code, '?') || ' · cần: ' || v_hoi
        || ' · tin không có chính chủ trên hệ thống → giao ctv');
    end if;

  elsif new.assignee = 'seller' and v_seller is not null then
    insert into reminders (kind, listing_id, seller_id, due_at, note)
    values ('escalation', new.listing_id, v_seller, now(),
      'khách đang quan tâm căn #' || coalesce(v_code, '?') || ' của mình, cần bổ sung: ' || v_hoi);
  end if;
  return new;
end $$;

-- viewings INSERT → (a) nhắc CTV của hội thoại (conversations.ctv_id) hay
-- admin NGAY, không đợi báo cáo 17h; (b) câu `xac_nhan_lich` để lời CTV
-- "#mã: ok 9h" (chat-reply nhánh nội bộ CHỈ đóng `source='buyer_ask'` —
-- kiểm code 04/09) đóng được nó và trigger (c) bên dưới chốt lịch; (c) email
-- [VIEWING]. Mỗi bước bọc riêng: sổ hỏng không được chặn đặt lịch.
create or replace function public.viewings_bao_ctv_va_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_listing uuid; v_code text; v_ctv uuid; v_uid text; v_ten text; v_gio text; v_note text;
begin
  v_listing := new.listing_id;
  if v_listing is null and new.listing_code is not null then
    select id into v_listing from listings where code = new.listing_code;
  end if;
  select code into v_code from listings where id = v_listing;
  v_code := coalesce(v_code, new.listing_code, '?');
  select b.zalo_user_id, b.name into v_uid, v_ten from buyers b where b.id = new.buyer_id;
  select c.ctv_id into v_ctv from conversations c
   where c.buyer_id = new.buyer_id and c.ctv_id is not null
   order by c.started_at desc limit 1;
  if v_ctv is not null and not exists (select 1 from ctvs where id = v_ctv and active) then
    v_ctv := null;
  end if;
  v_gio := coalesce(to_char(new.slot at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), new.time_text, '?');

  -- (a) nhắc CTV/admin ngay
  begin
    v_note := 'Lịch xem #' || v_code || ' · ' || v_gio || ' · khách ' || coalesce(v_ten, '(chưa biết tên)')
           || ', xác nhận với chủ nhà rồi nhắn lại em "#' || v_code || ': ok ' || coalesce(to_char(new.slot at time zone 'Asia/Ho_Chi_Minh', 'HH24"h"'), 'giờ') || '" nha';
    insert into reminders (kind, buyer_id, listing_id, viewing_id, ctv_id, due_at, note)
    values ('escalation', new.buyer_id, v_listing, new.id, v_ctv, now(), v_note);
  exception when others then
    perform public.log_loi('viewings_bao_ctv', left(sqlerrm, 400), null::integer);
  end;

  -- (b) câu xác nhận lịch — assignee đặt sẵn nên `route_info_request` không
  --     đụng; sla_due_at theo CTV để `info_request_sla_tick` leo thang nếu 2h
  --     chưa ai xác nhận.
  if v_listing is not null and new.buyer_id is not null and new.status in ('proposed', 'pending') then
    begin
      insert into info_requests (listing_id, buyer_id, question, status, source, assignee, ctv_id, sla_due_at)
      values (v_listing, new.buyer_id, 'xac_nhan_lich', 'pending', 'buyer_ask',
              case when v_ctv is null then 'admin' else 'ctv' end, v_ctv,
              case when v_ctv is null then null else now() + make_interval(mins => public.ctv_sla_phut()) end);
    exception when others then
      perform public.log_loi('viewings_xac_nhan_lich', left(sqlerrm, 400), null::integer);
    end;
  end if;

  -- (c) email [VIEWING] (FR-57/81)
  perform public.email_admin('VIEWING', v_uid,
    'Khách: ' || coalesce(v_ten, '(chưa biết tên)') || E'\nGiờ hẹn: ' || v_gio
    || coalesce(E'\nSĐT khách: ' || new.phone, '') || E'\nTrạng thái: ' || new.status, v_listing);
  return null;
end $$;
drop trigger if exists trg_viewings_bao_ctv_va_email on public.viewings;
create trigger trg_viewings_bao_ctv_va_email
  after insert on public.viewings
  for each row execute function public.viewings_bao_ctv_va_email();

-- CTV trả lời → `info_request_bao_lai_khach` (20260902h) đã bắt mọi
-- buyer_ask → answered. Thêm nhánh `xac_nhan_lich`: lịch sang `confirmed`
-- (buổi xem gần nhất còn proposed/pending của cặp khách/căn) + followup cho
-- khách với ghi chú "lịch xem #mã đã được xác nhận: …" (nudge v25 mẫu cố định).
create or replace function public.info_request_bao_lai_khach()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_code text; v_vw uuid;
begin
  if new.status = 'answered' and old.status is distinct from 'answered'
     and new.source = 'buyer_ask' and new.buyer_id is not null then
    select code into v_code from listings where id = new.listing_id;
    update reminders set status = 'cancelled'
     where buyer_id = new.buyer_id and listing_id = new.listing_id
       and kind = 'followup' and status = 'pending';
    if coalesce(new.question, '') = 'xac_nhan_lich' then                       -- 20260904f FR-52
      select id into v_vw from viewings
       where buyer_id = new.buyer_id and listing_id = new.listing_id
         and status in ('proposed', 'pending')
       order by created_at desc limit 1;
      if v_vw is not null then
        update viewings set status = 'confirmed' where id = v_vw;
      end if;
      insert into reminders (kind, buyer_id, listing_id, viewing_id, due_at, note)
      values ('followup', new.buyer_id, new.listing_id, v_vw, now(),
        'lịch xem #' || coalesce(v_code, '?') || ' đã được xác nhận: ' || left(coalesce(new.answer, ''), 200));
    else
      insert into reminders (kind, buyer_id, listing_id, due_at, note)
      values ('followup', new.buyer_id, new.listing_id, now(),
        'chủ nhà vừa trả lời câu khách hỏi về #' || coalesce(v_code, '?') || ' — "'
        || coalesce(new.question, '') || '": ' || left(coalesce(new.answer, ''), 300));
    end if;
  end if;
  return null;
end $$;
