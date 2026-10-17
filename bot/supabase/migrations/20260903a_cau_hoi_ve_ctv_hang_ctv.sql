-- 20260903a — FR-173: câu khách hỏi → CTV; CTV chậm → hạng CTV + admin đỡ khách
-- (quyết định chủ dự án 03/09/2026: "cần thông tin thì gửi về CTV, nếu CTV bận
-- sau khoảng thời gian chưa rep thì chấm điểm Đồng/Bạc/Vàng, và nhắn để admin
-- hỗ trợ khách").
--
-- Thay cho bản 20260902h (mọi câu khách hỏi → nhắn chủ nhà + báo admin luôn):
--   a. `buyer_ask` KHÔNG còn giao chủ nhà; luôn giao CTV còn liên lạc được, ít
--      việc nhất. Không có CTV nào thì giao admin. Câu hỏi nhỏ giọt (drip, không
--      phải buyer_ask) vẫn đi chủ nhà như cũ.
--   b. Admin KHÔNG còn bị báo mỗi câu; chỉ báo khi CTV quá hạn.
--   c. Hạn CTV: `ctv_sla_phut()` = 120 phút [giả định BA — OPEN-42]; nhịp
--      `info_request_sla_tick()` (cron 15 phút, 8–20h VN) quá hạn → một dòng nhắc
--      admin + `sla_missed_at`.
--   d. CTV/admin trả lời bằng cách nhắn bot "#mã tin: câu trả lời" — chat-reply
--      v46 nhận ra người nội bộ qua `nguoi_noi_bo(zalo)`, ghi fact nguồn `ctv`/
--      `admin`, đóng câu hỏi; trigger `info_request_bao_lai_khach` (20260902h)
--      báo lại khách như cũ.
--   e. Hạng CTV Đồng/Bạc/Vàng = tỷ lệ trả lời ĐÚNG HẠN 30 ngày (view `ctv_ranks`):
--      Vàng ≥ 90%, Bạc ≥ 70%, Đồng dưới; < 3 câu thì "chưa đủ" [giả định BA].

-- ── a+c. Cột hạn ───────────────────────────────────────────────────────────────
alter table public.info_requests
  add column if not exists sla_due_at    timestamptz,
  add column if not exists sla_missed_at timestamptz;
create index if not exists info_requests_sla_idx on public.info_requests (sla_due_at)
  where status = 'pending' and sla_missed_at is null;

create or replace function public.ctv_sla_phut() returns int
language sql immutable as $$ select 120 $$;
comment on function public.ctv_sla_phut() is 'FR-173: hạn CTV trả lời câu khách hỏi (phút). Đổi ở đây, một chỗ. OPEN-42.';

-- ── Bậc nguồn: CTV nhắn lại lời chủ = bậc admin (2) ──────────────────────────
create or replace function public.bac_nguon(p_source text) returns integer
language sql immutable set search_path to 'public' as $$
  select case p_source
    when 'chu_xac_nhan' then 3
    when 'admin'        then 2
    when 'ctv'          then 2
    else 1
  end;
$$;

create or replace function public.listing_facts_sync_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txt  text := coalesce(new.answer, '');
  v_num  numeric;
  j      jsonb;
  -- Bậc nguồn theo FR-164: chat chủ nhà (`seller_chat`) là chu_xac_nhan; admin
  -- nhập tay là admin; CTV nhắn lại lời chủ (FR-173) cũng xếp bậc admin — lời
  -- truyền qua một người, thấp hơn chủ nói thẳng; còn lại coi như lời chủ.
  bac    text := case when new.source ilike 'admin%' or new.source ilike 'ctv%' then 'admin' else 'chu_xac_nhan' end;
  l      listings%rowtype;
  de     boolean;
begin
  select * into l from listings where id = new.listing_id;
  if not found then return null; end if;
  -- Được đè khi bậc của fact ≥ bậc cụm cột đang giữ (chu_xac_nhan ≥ chu_xac_nhan:
  -- câu mới nhất thắng — FR-163 a; chu_xac_nhan > admin > boc_mo_ta — FR-164 a).
  de := public.bac_nguon(bac) >= public.bac_nguon(coalesce(l.specs_source, 'boc_mo_ta'));
  j := public.boc_thong_so(v_txt, l.property_type::text);

  if new.question = 'so_phong_ngu' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 1 and 20 then
      update listings set bedrooms = v_num::int, specs_source = bac
       where id = new.listing_id and (bedrooms is null or de);
    end if;

  elsif new.question like 'dien_tich%' then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num > 5 and v_num < 5000 then
      update listings set area_m2 = v_num where id = new.listing_id and area_m2 is null;
    end if;
    if j ? 'frontage_m' then
      update listings set frontage_m = (j->>'frontage_m')::numeric, length_m = (j->>'length_m')::numeric, specs_source = bac
       where id = new.listing_id and (frontage_m is null or de);
    end if;

  elsif new.question = 'tang' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 0 and 80 then
      update listings set floor = v_num::int, specs_source = bac
       where id = new.listing_id and (floor is null or de);
    end if;

  elsif new.question = 'huong' then
    if j ? 'direction' then
      update listings set direction = j->>'direction', specs_source = bac
       where id = new.listing_id and (direction is null or de);
    elsif length(btrim(v_txt)) between 2 and 40 then
      update listings set direction = btrim(v_txt), specs_source = bac
       where id = new.listing_id and (direction is null or de);
    end if;

  elsif new.question in ('ket_cau', 'hien_trang') and j ? 'floors' then
    update listings set floors = (j->>'floors')::int, floors_text = j->>'floors_text',
           bathrooms = coalesce((j->>'bathrooms')::int, bathrooms),
           bedrooms  = case when bedrooms is null or de then coalesce((j->>'bedrooms')::int, bedrooms) else bedrooms end,
           specs_source = bac
     where id = new.listing_id and (floors is null or de);

  elsif new.question in ('do_rong_hem', 'do_rong_duong') then
    if j ? 'alley_width_m' or j ? 'access_type' then
      update listings set alley_width_m = coalesce((j->>'alley_width_m')::numeric, alley_width_m),
             access_type = coalesce(j->>'access_type', access_type), specs_source = bac
       where id = new.listing_id and (alley_width_m is null or access_type is null or de);
    else
      v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
      if v_num is not null and v_num between 1 and 40 then
        update listings set alley_width_m = v_num,
               access_type = coalesce(access_type, case when v_num >= 6 then 'hem_xe_tai' when v_num >= 3.5 then 'hem_xe_hoi' else 'hem_xe_may' end),
               specs_source = bac
         where id = new.listing_id and (alley_width_m is null or de);
      end if;
    end if;

  elsif new.question = 'phap_ly' and j ? 'legal_status' then
    update listings set legal_status = j->>'legal_status',
           has_completion = coalesce((j->>'has_completion')::boolean, has_completion), specs_source = bac
     where id = new.listing_id and (legal_status is null or de);

  elsif new.question = 'quy_hoach' then
    update listings set planning_status = coalesce(j->>'planning_status',
             case when public.bo_dau(v_txt) ~ '(khong|ko|k co|k dinh)' then 'khong_quy_hoach' end), specs_source = bac
     where id = new.listing_id and (planning_status is null or de)
       and (j ? 'planning_status' or public.bo_dau(v_txt) ~ '(khong|ko|k co|k dinh)');

  elsif new.question = 'nam_xay' then
    v_num := nullif(substring(v_txt, '(?:19|20)[0-9]{2}'), '')::numeric;
    if v_num is not null then
      update listings set year_built = v_num::int, specs_source = bac
       where id = new.listing_id and (year_built is null or de);
    end if;

  elsif new.question = 'noi_that' then
    update listings set furnishing = coalesce(j->>'furnishing',
             case when public.bo_dau(v_txt) ~ '(full|day du|cao cap)' then 'full'
                  when public.bo_dau(v_txt) ~ '(khong|trong|ko)' then 'khong'
                  when public.bo_dau(v_txt) ~ '(co ban)' then 'co_ban' end), specs_source = bac
     where id = new.listing_id and (furnishing is null or de)
       and (j ? 'furnishing' or public.bo_dau(v_txt) ~ '(full|day du|cao cap|khong|trong|ko|co ban)');

  elsif new.question = 'mat_tien' then
    v_num := coalesce((j->>'frontage_m')::numeric, nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric);
    if v_num is not null and v_num between 1.5 and 40 then
      update listings set frontage_m = v_num, specs_source = bac
       where id = new.listing_id and (frontage_m is null or de);
    end if;
  end if;

  return null;
end;
$$;

-- ── a. Định tuyến ─────────────────────────────────────────────────────────────
create or replace function public.route_info_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_seller_zalo text;
  v_ctv ctvs%rowtype;
begin
  if new.assignee is not null then return new; end if;

  -- Câu nhỏ giọt (không phải khách hỏi) vẫn đi chủ nhà khi chủ có Zalo.
  if coalesce(new.source, '') <> 'buyer_ask' then
    select s.zalo_user_id into v_seller_zalo
    from listings l join sellers s on s.id = l.seller_id
    where l.id = new.listing_id;
    if v_seller_zalo is not null then
      new.assignee := 'seller';
      return new;
    end if;
  end if;

  -- FR-173 a: câu khách hỏi → CTV còn liên lạc được, chia đều theo lượt gần nhất.
  select * into v_ctv from ctvs
  where active and (zalo_user_id is not null or phone is not null)
  order by last_assigned_at nulls first, created_at
  limit 1;

  if found then
    new.assignee := 'ctv';
    new.ctv_id := v_ctv.id;
    update ctvs set last_assigned_at = now() where id = v_ctv.id;
    if new.source = 'buyer_ask' then
      new.sla_due_at := now() + make_interval(mins => public.ctv_sla_phut());
    end if;
  else
    new.assignee := 'admin';
  end if;
  return new;
end $$;

-- ── b. Nhắc: CTV nhận việc kèm cách trả lời; admin chỉ khi không có ai ────────
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

-- ── c. Quá hạn → admin đỡ khách ───────────────────────────────────────────────
create or replace function public.info_request_sla_tick()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; n int := 0;
begin
  for r in
    select q.id, q.question, l.code, coalesce(c.name, '?') as ctv_name
    from info_requests q
    join listings l on l.id = q.listing_id
    left join ctvs c on c.id = q.ctv_id
    where q.status = 'pending' and q.source = 'buyer_ask' and q.assignee = 'ctv'
      and q.sla_due_at < now() and q.sla_missed_at is null
    limit 50
  loop
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', (select listing_id from info_requests where id = r.id), now(),
      '⏰ CTV ' || r.ctv_name || ' chưa trả lời câu khách hỏi #' || coalesce(r.code, '?')
      || ' ("' || coalesce(r.question, '') || '") sau ' || public.ctv_sla_phut()
      || ' phút. Admin đỡ khách giúp: hỏi chủ rồi nhắn bot "#' || coalesce(r.code, '?') || ': câu trả lời".');
    update info_requests set sla_missed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'ctv-sla-tick';
select cron.schedule('ctv-sla-tick', '*/15 1-13 * * *', $$select public.info_request_sla_tick()$$);

-- ── d. Người nội bộ nhắn bot: CTV hay admin? ──────────────────────────────────
create or replace function public.nguoi_noi_bo(p_zalo text)
returns table (vai text, id uuid, name text)
language sql
security definer
set search_path to 'public'
stable
as $$
  select 'ctv'::text, c.id, c.name from ctvs c
   where c.active and c.zalo_user_id = p_zalo
  union all
  select 'admin'::text, null::uuid, coalesce(a.email, 'admin') from admins a
   where a.zalo_user_id = p_zalo
  limit 1;
$$;
revoke all on function public.nguoi_noi_bo(text) from public, anon, authenticated;

-- ── e. Hạng CTV ───────────────────────────────────────────────────────────────
create or replace view public.ctv_ranks as
with q as (
  select q.ctv_id,
         count(*) as tong,
         count(*) filter (where q.status = 'answered') as tra_loi,
         count(*) filter (where q.status = 'answered' and q.answered_at <= q.sla_due_at) as dung_han,
         count(*) filter (where q.sla_missed_at is not null) as tre
  from info_requests q
  where q.source = 'buyer_ask' and q.assignee = 'ctv'
    and q.created_at >= now() - interval '30 days'
  group by q.ctv_id
)
select c.id, c.name, c.active,
       coalesce(q.tong, 0)::int as tong,
       coalesce(q.tra_loi, 0)::int as tra_loi,
       coalesce(q.dung_han, 0)::int as dung_han,
       coalesce(q.tre, 0)::int as tre,
       case when coalesce(q.tong, 0) = 0 then null
            else round(q.dung_han::numeric / q.tong, 2) end as ty_le_dung_han,
       case when coalesce(q.tong, 0) < 3 then 'chua_du'
            when q.dung_han::numeric / q.tong >= 0.9 then 'vang'
            when q.dung_han::numeric / q.tong >= 0.7 then 'bac'
            else 'dong' end as rank
from ctvs c
left join q on q.ctv_id = c.id
where auth.role() = 'service_role'
   or exists (select 1 from admins a where a.email = auth.jwt() ->> 'email');

revoke all on public.ctv_ranks from public, anon;
grant select on public.ctv_ranks to authenticated, service_role;
comment on view public.ctv_ranks is 'FR-173 e: hạng CTV Đồng/Bạc/Vàng theo tỷ lệ trả lời đúng hạn 30 ngày (ngưỡng OPEN-42). Chỉ admin/service_role đọc.';
