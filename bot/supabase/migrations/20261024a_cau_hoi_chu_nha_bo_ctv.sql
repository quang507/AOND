-- 20261024a — Bỏ bước CTV cho câu khách hỏi chủ nhà (SRS-5.1zzzzzzz170, chủ dự án 24/10/2026: "Bỏ bước CTV luôn đi", trả lời "Báo thẳng admin").
-- Trước đó: tin không có chủ nhà trên hệ thống → chọn CTV (`chon_ctv`); chủ nhà quá `chu_nha_han_gio()` giờ chưa trả lời → chuyển CTV rồi 2 giờ sau mới tới admin.
-- Nay: không có chủ nhà → giao `admin`; chủ nhà quá hạn → nhắc `escalation` về admin ngay. Chỉ ĐỔI chỗ chọn CTV trong ba hàm; phần còn lại giữ nguyên bản `schema.sql`.
-- Vòng 2 của `info_request_sla_tick` (CTV quá hạn) và nhánh `ctv` của `notify_info_request_escalation` giữ lại cho dòng CŨ còn giao CTV. Không đụng
-- `assign_ctv_round_robin` (gán ctv cho hội thoại) và lịch xem (đã bỏ CTV ở 20261023g).
CREATE OR REPLACE FUNCTION public.route_info_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_seller_zalo text; v_district text;
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
  new.assignee := 'admin';   -- 20261024a: bỏ bước CTV, không có chủ nhà trên hệ thống thì giao thẳng admin
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.info_request_sla_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  for r in
    select q.id, q.question, q.listing_id, l.code, coalesce(nullif(btrim(l.location_raw), ''), l.ward, '?') as dia_chi
    from info_requests q join listings l on l.id = q.listing_id
    where q.status = 'pending' and q.source = 'buyer_ask' and q.assignee = 'seller'
      and q.sla_due_at < now() and q.chu_nha_qua_han_at is null
    limit 50
  loop
    update info_requests set assignee = 'admin', chu_nha_qua_han_at = now(), sla_due_at = null where id = r.id;
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', r.listing_id, now(),
      '❓ Khách hỏi căn #' || coalesce(r.code, '?') || ': "' || coalesce(r.question, '')
      || '" — chủ nhà ' || public.chu_nha_han_gio() || ' giờ chưa trả lời. Admin hỏi chủ rồi nhắn bot "#'
      || coalesce(r.code, '?') || ': câu trả lời".');
    n := n + 1;
  end loop;

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
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_info_request_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code   text;
  v_seller uuid;
  v_hoi    text;
  v_dia_chi text;
  v_goi    text;
  v_gom    int;
begin
  if coalesce(new.question, '') in ('xac_nhan_lich', 'con_ban') then return new; end if;

  select l.code, l.seller_id, coalesce(nullif(btrim(l.location_raw), ''), l.ward, 'của mình')
    into v_code, v_seller, v_dia_chi from listings l where l.id = new.listing_id;
  v_hoi := coalesce(new.question, 'thông tin');

  if new.assignee = 'admin' then
    -- Gom vào việc admin còn chờ của cùng căn (nếu có).
    with g as (
      update reminders set note = note || ' · khách hỏi thêm: "' || v_hoi || '"'
       where kind = 'escalation' and status = 'pending' and listing_id = new.listing_id
         and seller_id is null and ctv_id is null
         and created_at > now() - interval '15 minutes'
      returning 1
    ) select count(*) into v_gom from g;
    if v_gom = 0 then
      insert into reminders (kind, listing_id, due_at, note)
      values ('escalation', new.listing_id, now(),
        '❓ Khách hỏi căn #' || coalesce(v_code, '?') || ': "' || v_hoi
        || '" — tin không có chủ nhà trên hệ thống. Admin hỏi chủ rồi nhắn bot "#'
        || coalesce(v_code, '?') || ': câu trả lời".');
    end if;

  elsif new.assignee = 'ctv' then
    with g as (
      update reminders set note = note || ' · khách hỏi thêm: "' || v_hoi || '"'
       where kind = 'escalation' and status = 'pending' and listing_id = new.listing_id
         and ctv_id is not distinct from new.ctv_id
         and created_at > now() - interval '15 minutes'
      returning 1
    ) select count(*) into v_gom from g;
    if v_gom = 0 then
      if new.source = 'buyer_ask' then
        insert into reminders (kind, listing_id, ctv_id, due_at, note)
        values ('escalation', new.listing_id, new.ctv_id, now(),
          'khách hỏi #' || coalesce(v_code, '?') || ': "' || v_hoi
          || '". Anh/chị hỏi chủ rồi nhắn lại em theo mẫu "#' || coalesce(v_code, '?')
          || ': câu trả lời" trong ' || public.ctv_sla_phut() || ' phút nha, em báo khách liền.');
      else
        insert into reminders (kind, listing_id, ctv_id, due_at, note)
        values ('escalation', new.listing_id, new.ctv_id, now(),
          'khách hỏi #' || coalesce(v_code, '?') || ' · cần: ' || public.nhan_fact(v_hoi)
          || ' · tin không có chính chủ trên hệ thống → giao ctv');
      end if;
    end if;

  elsif new.assignee = 'seller' and v_seller is not null
        and coalesce(new.source, '') = 'buyer_ask' then
    select coalesce(xung_ho, 'anh/chị') into v_goi from sellers where id = v_seller;
    with g as (
      update reminders set note = note || ' Khách hỏi thêm: "' || v_hoi || '".'
       where kind = 'escalation' and status = 'pending' and listing_id = new.listing_id
         and seller_id = v_seller
         and created_at > now() - interval '15 minutes'
      returning 1
    ) select count(*) into v_gom from g;
    if v_gom = 0 then
      insert into reminders (kind, listing_id, seller_id, due_at, note)
      values ('escalation', new.listing_id, v_seller, now(),
        '💬 ' || initcap(left(v_goi, 1)) || substr(v_goi, 2) || ' ơi, có khách đang hỏi căn ' || v_dia_chi
        || ': "' || v_hoi || '". ' || initcap(left(v_goi, 1)) || substr(v_goi, 2)
        || ' trả lời giúp em ở đây để em báo khách liền nha.');
    end if;
  end if;
  return new;
end $function$
;
