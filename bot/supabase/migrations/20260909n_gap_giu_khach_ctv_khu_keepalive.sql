-- 20260909n — chủ dự án 10/09/2026 00:40: "triển khai hết không được sót cái nào":
--   1. FR-188 GẤP: fact `gap` hỏi ngay sau giá ("mình cần ra hàng gấp hay được giá thì
--      thôi"), bắt ở mọi lượt, đổ vào cột listings.gap; người mua có cờ preferences.gap.
--   2. FR-189 NGƯỜI THẬT GIỮ / TRẢ BOT: conversations.human_hold; RPC giu_khach cho admin;
--      ensure_*_conversation trả thêm cờ để chat-reply im.
--   3. FR-190 CTV THEO KHU + TRẦN 15 CA: ctvs.khu_vuc (quận/huyện phụ trách),
--      app_config ctv_tran_ca=15; route_info_request + assign_ctv_round_robin ưu tiên CTV
--      đúng khu, bỏ qua CTV đã đầy.
--   4. FR-191 KEEP-ALIVE 6 NGÀY (luật 7 ngày Zalo, chat 21/06 lượt 35–36): chủ nhà im 6 ngày
--      → xin bổ sung 1 lượt (2–3 thông tin) qua ask-seller; hết thứ để hỏi thì "còn bán không".
--   5. FR-186 o KHÔNG HỎI LẦN THỨ HAI: view/keep-alive bỏ câu đã expired (ask-seller cũng lọc).

-- ─── 1. GẤP ──────────────────────────────────────────────────────────────────
insert into public.required_facts (property_type, fact_key, priority, nhom, deal)
select t::public.property_type, 'gap', 10, 'co_ban', null
  from unnest(array['nha_pho','nha_cap4','chung_cu','dat','biet_thu','phong_tro','mat_bang','toa_nha','dat_nong_nghiep','dat_kinh_doanh','kho_xuong']) t
on conflict do nothing;

create or replace function public.doc_gap(p_text text) returns boolean
language sql immutable set search_path to 'public' as $function$
  select case
    when p_text is null or btrim(p_text) = '' then null
    when public.bo_dau(p_text) ~ '\m(khong|ko|k|chua|chang|dau co)\s*(can\s*)?(gap|voi)\M|\mduoc gia thi thoi\M|\mkhong voi\M|\mtu tu\M|\mban duoc gia\M' then false
    when public.bo_dau(p_text) ~ '\mgap\s*(doi|ba|lan|ruoi|[0-9])' then null
    when public.bo_dau(p_text) ~ '\mgap\M|\mcan tien\M|\m(ban|di|ra)\s*nhanh\M|\mvoi\M' then true
    else null end;
$function$;
comment on function public.doc_gap(text) is 'FR-188: "cần bán gấp"/"không vội, được giá thì thôi" → true/false/null. Cùng luật với laGap() trong khop-cau-tra-loi.ts.';

create or replace view public.listing_missing_facts as
 select l.id as listing_id, rf.fact_key, rf.priority, rf.nhom
   from public.listings l
   join public.required_facts rf
     on rf.property_type = coalesce(l.property_type, 'chua_ro'::public.property_type)
    and (rf.deal is null or rf.deal = l.deal)
   left join public.listing_facts lf on lf.listing_id = l.id and lf.question = rf.fact_key
  where lf.id is null and rf.nhom <> 'phu'
    and not (
         (rf.fact_key = 'ket_cau' and l.floors is not null)
      or (rf.fact_key in ('do_rong_hem', 'do_rong_duong') and (l.alley_width_m is not null or l.access_type = 'mat_tien'))
      or (rf.fact_key = 'phap_ly' and l.legal_status is not null)
      or (rf.fact_key = 'huong' and l.direction is not null)
      or (rf.fact_key = 'so_phong_ngu' and l.bedrooms is not null)
      or (rf.fact_key = 'so_wc' and l.bathrooms is not null)
      or (rf.fact_key = 'tang' and l.floor is not null)
      or (rf.fact_key in ('dien_tich', 'dien_tich_dat', 'dien_tich_tim_tuong') and l.area_m2 is not null)
      or (rf.fact_key = 'nam_xay' and l.year_built is not null)
      or (rf.fact_key = 'noi_that' and l.furnishing is not null)
      or (rf.fact_key = 'mat_tien' and l.frontage_m is not null)
      or (rf.fact_key = 'no_hau' and l.rear_width_m is not null)
      or (rf.fact_key = 'cach_mat_tien' and l.distance_to_street_m is not null)
      or (rf.fact_key = 'can_goc' and l.corner_lot is not null)
      or (rf.fact_key = 'thang_may' and l.has_elevator is not null)
      or (rf.fact_key = 'thuong_luong' and l.negotiable is not null)
      or (rf.fact_key = 'doanh_thu' and l.rent_income_vnd is not null)
      or (rf.fact_key = 'quy_hoach' and l.planning_status is not null)
      or (rf.fact_key = 'gia' and l.price_vnd is not null)
      or (rf.fact_key = 'gap' and l.gap is not null)
      or (rf.fact_key = 'phuong' and l.ward is not null)
      or (rf.fact_key = 'vi_tri' and (coalesce(btrim(l.location_raw), '') <> '' or coalesce(btrim(l.street), '') <> '' or l.project_id is not null))
      or (rf.fact_key = 'hinh_anh' and exists (select 1 from public.listing_media m where m.listing_id = l.id))
    )
  order by l.id, rf.priority, rf.fact_key;

-- sync_cols: thêm nhánh gap (đọc true/false từ câu chủ nhà, đè khi bậc ≥ cụm đang giữ)
create or replace function public.listing_facts_sync_gap() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare v boolean;
begin
  if new.question <> 'gap' then return null; end if;
  v := public.doc_gap(new.answer);
  if v is not null then
    update public.listings set gap = v where id = new.listing_id and gap is distinct from v;
  end if;
  return null;
end $function$;
drop trigger if exists trg_listing_facts_sync_gap on public.listing_facts;
create trigger trg_listing_facts_sync_gap after insert on public.listing_facts
  for each row execute function public.listing_facts_sync_gap();
comment on function public.listing_facts_sync_gap() is 'FR-188: fact gap → listings.gap (true/false), trigger riêng để không đụng listing_facts_sync_cols.';

-- nhan_fact: giữ nguyên bảng 20260909i, bọc thêm khoá `gap` (đổi tên bản cũ rồi bọc).
do $$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'nhan_fact_cu') then
    alter function public.nhan_fact(text) rename to nhan_fact_cu;
  end if;
end $$;
create or replace function public.nhan_fact(p_key text)
 returns text language sql immutable set search_path to 'public'
as $function$
  select case p_key
    when 'gap' then 'cần bán/cho thuê gấp hay không'
    else public.nhan_fact_cu(p_key) end;
$function$;

-- ─── 2. NGƯỜI THẬT GIỮ / TRẢ BOT ──────────────────────────────────────────────
alter table public.conversations add column if not exists human_hold boolean not null default false;
comment on column public.conversations.human_hold is '[NGƯỜI & HỘI THOẠI] FR-189: true = người thật đang GIỮ khách (bot im vô thời hạn) — lệnh "#mã giữ" / "#mã trả bot" qua Zalo nội bộ hoặc nút ở /admin/tin-nhan.';

drop function if exists public.ensure_seller_conversation(uuid, text);
create or replace function public.ensure_seller_conversation(p_seller_id uuid, p_channel text default 'zalo_oa')
 returns table(c_id uuid, c_human_touch_at timestamptz, c_ctv_id uuid, c_human_hold boolean)
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_conv conversations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('seller:' || p_seller_id::text));
  select * into v_conv from conversations
    where conversations.seller_id = p_seller_id
    order by started_at desc limit 1;
  if not found then
    insert into conversations (seller_id, channel) values (p_seller_id, p_channel)
      returning * into v_conv;
  end if;
  return query select v_conv.id, v_conv.human_touch_at, v_conv.ctv_id, v_conv.human_hold;
end $function$;
revoke all on function public.ensure_seller_conversation(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_seller_conversation(uuid, text) to service_role;

drop function if exists public.ensure_buyer_conversation(text, text);
create or replace function public.ensure_buyer_conversation(p_zalo_user_id text, p_channel text default 'zalo_oa')
 returns table(b_id uuid, c_id uuid, b_name text, b_prefs jsonb, c_ctv_id uuid, c_human_touch_at timestamptz, c_human_hold boolean)
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_buyer buyers%rowtype; v_conv conversations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('buyer:' || p_zalo_user_id));
  select * into v_buyer from buyers where zalo_user_id = p_zalo_user_id;
  if not found then
    insert into buyers (zalo_user_id) values (p_zalo_user_id) returning * into v_buyer;
  end if;
  update buyers set last_contact_at = now() where id = v_buyer.id;
  select * into v_conv from conversations
    where conversations.buyer_id = v_buyer.id
    order by started_at desc limit 1;
  if not found then
    insert into conversations (buyer_id, channel) values (v_buyer.id, p_channel)
      returning * into v_conv;
  end if;
  return query select v_buyer.id, v_conv.id, v_buyer.name, v_buyer.preferences,
                      v_conv.ctv_id, v_conv.human_touch_at, v_conv.human_hold;
end $function$;
revoke all on function public.ensure_buyer_conversation(text, text) from public, anon, authenticated;
grant execute on function public.ensure_buyer_conversation(text, text) to service_role;

create or replace function public.giu_khach(p_conversation_id uuid, p_giu boolean)
 returns void language sql security definer set search_path to 'public'
as $function$
  update public.conversations
     set human_hold = p_giu,
         needs_human = case when p_giu then false else needs_human end,
         human_touch_at = case when p_giu then now() else human_touch_at end
   where id = p_conversation_id
     and (coalesce(auth.role(), '') = 'service_role' or public.la_admin());
$function$;
revoke all on function public.giu_khach(uuid, boolean) from public, anon;
grant execute on function public.giu_khach(uuid, boolean) to authenticated, service_role;
comment on function public.giu_khach(uuid, boolean) is 'FR-189: admin giữ / trả bot một hội thoại (nút ở /admin/tin-nhan).';

-- ─── 3. CTV THEO KHU + TRẦN CA ────────────────────────────────────────────────
alter table public.ctvs add column if not exists khu_vuc text[] not null default '{}';
comment on column public.ctvs.khu_vuc is '[CTV] FR-190: quận/huyện phụ trách (đúng chuỗi listings.district, ví dụ {"Quận 5","Quận 10"}); rỗng = mọi khu.';
insert into public.app_config (key, value) values ('ctv_tran_ca', '15') on conflict (key) do nothing;

create or replace function public.ctv_dang_ganh(p_ctv uuid) returns integer
language sql stable set search_path to 'public' as $function$
  select (select count(*) from public.info_requests q where q.ctv_id = p_ctv and q.status = 'pending')::int
       + (select count(*) from public.conversations c where c.ctv_id = p_ctv and c.needs_human)::int;
$function$;
comment on function public.ctv_dang_ganh(uuid) is 'FR-190: số ca đang mở của một CTV = câu khách chờ + hội thoại cần người thật.';

create or replace function public.chon_ctv(p_district text) returns uuid
language sql stable set search_path to 'public' as $function$
  select c.id from public.ctvs c
   where c.active and (c.zalo_user_id is not null or c.phone is not null)
     and public.ctv_dang_ganh(c.id) < coalesce(nullif(public.cau_hinh('ctv_tran_ca'), '')::int, 15)
   order by (case
               when p_district is not null and exists (
                 select 1 from unnest(c.khu_vuc) k
                  where public.bo_dau(p_district) like '%' || public.bo_dau(k) || '%'
                     or public.bo_dau(k) like '%' || public.bo_dau(p_district) || '%') then 0
               when cardinality(c.khu_vuc) = 0 then 1
               else 2 end),
            public.ctv_dang_ganh(c.id), c.last_assigned_at nulls first, c.created_at
   limit 1;
$function$;
comment on function public.chon_ctv(text) is 'FR-190: chọn CTV — đúng khu trước, rồi CTV không giới hạn khu, rồi khu khác; bỏ CTV đã đủ trần ca (app_config ctv_tran_ca, mặc định 15); trong nhóm thì ít ca hơn trước.';

create or replace function public.route_info_request() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare v_seller_zalo text; v_district text; v_ctv uuid;
begin
  if new.assignee is not null then return new; end if;
  select s.zalo_user_id, l.district into v_seller_zalo, v_district
    from listings l join sellers s on s.id = l.seller_id where l.id = new.listing_id;
  if v_seller_zalo is not null then
    new.assignee := 'seller';
    if new.source = 'buyer_ask' then
      new.sla_due_at := now() + make_interval(hours => public.chu_nha_han_gio());
    end if;
    return new;
  end if;
  v_ctv := public.chon_ctv(v_district);
  if v_ctv is not null then
    new.assignee := 'ctv'; new.ctv_id := v_ctv;
    update ctvs set last_assigned_at = now() where id = v_ctv;
    if new.source = 'buyer_ask' then
      new.sla_due_at := now() + make_interval(mins => public.ctv_sla_phut());
    end if;
  else
    new.assignee := 'admin';
  end if;
  return new;
end $function$;

create or replace function public.assign_ctv_round_robin() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare picked uuid; v_district text;
begin
  if new.ctv_id is not null then return new; end if;
  -- khu của khách mua: quận trong hồ sơ (preferences.area) nếu có; người bán: quận tin mới nhất
  if new.buyer_id is not null then
    select coalesce(b.preferences->>'district', b.preferences->>'area') into v_district from buyers b where b.id = new.buyer_id;
  elsif new.seller_id is not null then
    select l.district into v_district from listings l where l.seller_id = new.seller_id order by l.created_at desc limit 1;
  end if;
  picked := public.chon_ctv(v_district);
  if picked is not null then
    new.ctv_id := picked;
    update public.ctvs set last_assigned_at = now() where id = picked;
  end if;
  return new;
end $function$;

-- ─── 4. KEEP-ALIVE 6 NGÀY ─────────────────────────────────────────────────────
create or replace function public.seller_keep_alive_tick() returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare r record; n int := 0; v_ir uuid;
begin
  for r in
    select l.id, l.code, l.seller_id, s.zalo_user_id
      from listings l join sellers s on s.id = l.seller_id
     where l.status = 'dang_ban' and s.zalo_user_id is not null
       -- chủ nhà im ≥ 6 ngày (tin cuối do chủ nhắn)
       and coalesce((select max(m.created_at) from messages m join conversations c on c.id = m.conversation_id
                      where c.seller_id = l.seller_id and m.sender = 'seller'), l.created_at) < now() - interval '6 days'
       -- chưa keep-alive / hỏi bù trong 6 ngày
       and not exists (select 1 from info_requests q where q.listing_id = l.id and q.created_at > now() - interval '6 days')
       and not exists (select 1 from info_requests q where q.listing_id = l.id and q.status = 'pending')
     order by l.updated_at limit 20
  loop
    if exists (select 1 from listing_missing_facts m where m.listing_id = r.id
                and not exists (select 1 from info_requests q where q.listing_id = r.id and q.question = m.fact_key and q.status = 'expired')) then
      -- còn thứ để hỏi (chưa bị né) → xin bổ sung 1 lượt 2–3 thông tin (ask-seller gom)
      perform ask_seller_drip(r.id);
    else
      insert into info_requests (listing_id, question, status, source)
      values (r.id, 'con_ban', 'pending', 'seller_flow') returning id into v_ir;
      insert into reminders (kind, listing_id, seller_id, due_at, note)
      values ('escalation', r.id, r.seller_id, now(),
        'Căn ' || coalesce(nullif((select coalesce(location_raw, ward) from listings where id = r.id), ''), '#' || coalesce(r.code, '?')) ||
        ' của mình còn bán không ạ? Còn thì anh/chị nhắn "còn" giúp em, có khách hỏi em báo liền.');
    end if;
    n := n + 1;
  end loop;
  return n;
end $function$;
revoke all on function public.seller_keep_alive_tick() from public, anon, authenticated;
grant execute on function public.seller_keep_alive_tick() to service_role;
comment on function public.seller_keep_alive_tick() is 'FR-191: luật 7 ngày Zalo — chủ nhà im 6 ngày thì nhắn một lần: còn thứ chưa hỏi (không bị né) → ask-seller gom 2–3 câu; hết → "còn bán không". Cron seller-keep-alive-tick 02:30 UTC (09:30 VN).';
select cron.schedule('seller-keep-alive-tick', '30 2 * * *', 'select public.seller_keep_alive_tick()');
