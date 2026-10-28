-- 20261028c_cau_mau_giu_ket_noi_han_admin_bo_ctv — SRS-5.1zzzzzzz238 (chủ dự án 28/10/2026: "làm lại tin chống xoá kết nối, dọn CTV
-- luôn đi làm giống bên anh Luận, hạn admin trả lời câu khách hỏi 5 giờ").
-- Bước 1 (chỉ thêm / sửa thân hàm, chạy được trước khi code mới lên): hạn admin 5 giờ (`admin_han_gio`, route + sla_tick nhắc lại khi
-- quá hạn), gỡ nhánh CTV khỏi notify / sla_tick / quota, đổi tên hàm + trigger lịch xem sang `viewings_bao_admin_va_email`, rpc
-- `khach_can_giu_ket_noi` cho tin giữ kết nối Zalo (FR-63), hai câu mẫu. Bước 2 (20261028d) xoá bảng / cột / view CTV sau khi
-- escalation-feed, lõi và web không còn đọc chúng. Thân hàm chép từ schema.sql (khớp DB qua md5) rồi thay có kiểm (scripts sinh tạm).
CREATE OR REPLACE FUNCTION public.admin_han_gio()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce(nullif(public.cau_hinh('admin_han_gio'), '')::int, 5) $function$
;
comment on function public.admin_han_gio() is 'Số giờ admin phải trả lời câu khách mua hỏi (info_requests giao admin) — mặc định 5, đổi bằng app_config.admin_han_gio (SRS-5.1zzzzzzz238, chủ dự án 28/10/2026)';
revoke all on function public.admin_han_gio() from public, anon, authenticated;
grant execute on function public.admin_han_gio() to service_role;

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
  new.assignee := 'admin';   -- 20261024a: không có chủ nhà trên hệ thống thì giao thẳng admin
  if new.source = 'buyer_ask' and coalesce(new.question, '') <> 'xac_nhan_lich' then
    new.sla_due_at := now() + make_interval(hours => public.admin_han_gio());   -- 20261028c: hạn admin 5 giờ
  end if;
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
    update info_requests set assignee = 'admin', chu_nha_qua_han_at = now(),
      sla_due_at = now() + make_interval(hours => public.admin_han_gio()) where id = r.id;
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', r.listing_id, now(),
      '❓ Khách hỏi căn #' || coalesce(r.code, '?') || ': "' || coalesce(r.question, '')
      || '" — chủ nhà ' || public.chu_nha_han_gio() || ' giờ chưa trả lời. Admin hỏi chủ rồi nhắn bot "#'
      || coalesce(r.code, '?') || ': câu trả lời".');
    n := n + 1;
  end loop;

  -- 20261028c: CTV bỏ hẳn — vòng 2 là ADMIN quá hạn (mặc định 5 giờ): nhắc lại admin một lần + email.
  for r in
    select q.id, q.question, q.buyer_id, q.listing_id, l.code,
           b.zalo_user_id as buyer_uid, b.name as buyer_name
    from info_requests q
    join listings l on l.id = q.listing_id
    left join buyers b on b.id = q.buyer_id
    where q.status = 'pending' and q.source = 'buyer_ask' and q.assignee = 'admin'
      and coalesce(q.question, '') <> 'xac_nhan_lich'
      and q.sla_due_at < now() and q.sla_missed_at is null
    limit 50
  loop
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', r.listing_id, now(),
      '⏰ Câu khách hỏi căn #' || coalesce(r.code, '?') || ' ("' || coalesce(r.question, '')
      || '") đã quá ' || public.admin_han_gio() || ' giờ chưa trả lời. Admin hỏi chủ rồi nhắn bot "#'
      || coalesce(r.code, '?') || ': câu trả lời".');
    update info_requests set sla_missed_at = now() where id = r.id;
    perform public.email_admin('QUESTION', r.buyer_uid,
      'Khách: ' || coalesce(r.buyer_name, '(chưa biết tên)') || E'\nCâu hỏi: "' || coalesce(r.question, '')
      || E'"\nQuá ' || public.admin_han_gio() || ' giờ chưa trả lời', r.listing_id);
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
         and seller_id is null
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

CREATE OR REPLACE FUNCTION public.viewings_bao_admin_va_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_listing uuid; v_code text; v_uid text; v_ten text; v_gio text; v_note text;
begin
  v_listing := new.listing_id;
  if v_listing is null and new.listing_code is not null then
    select id into v_listing from listings where code = new.listing_code;
  end if;
  select code into v_code from listings where id = v_listing;
  v_code := coalesce(v_code, new.listing_code, '?');
  select b.zalo_user_id, b.name into v_uid, v_ten from buyers b where b.id = new.buyer_id;
  v_gio := coalesce(to_char(new.slot at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), new.time_text, '?');

  -- (a) nhắc admin ngay
  begin
    v_note := 'Lịch xem #' || v_code || ' · ' || v_gio || ' · khách ' || coalesce(v_ten, '(chưa biết tên)')
           || ', xác nhận với chủ nhà rồi nhắn lại em "#' || v_code || ': ok ' || coalesce(to_char(new.slot at time zone 'Asia/Ho_Chi_Minh', 'HH24"h"'), 'giờ') || '" nha';
    insert into reminders (kind, buyer_id, listing_id, viewing_id, due_at, note)
    values ('escalation', new.buyer_id, v_listing, new.id, now(), v_note);
  exception when others then
    perform public.log_loi('viewings_bao_admin', left(sqlerrm, 400), null::integer);
  end;

  -- (b) câu xác nhận lịch giao admin để lời "#mã: ok giờ" đóng được nó (info_request_bao_lai_khach chốt lịch + báo khách)
  if v_listing is not null and new.buyer_id is not null and new.status in ('proposed', 'pending') then
    begin
      insert into info_requests (listing_id, buyer_id, question, status, source, assignee, sla_due_at)
      values (v_listing, new.buyer_id, 'xac_nhan_lich', 'pending', 'buyer_ask', 'admin', null);
    exception when others then
      perform public.log_loi('viewings_xac_nhan_lich', left(sqlerrm, 400), null::integer);
    end;
  end if;

  -- (c) email [VIEWING] (FR-57/81)
  perform public.email_admin('VIEWING', v_uid,
    'Khách: ' || coalesce(v_ten, '(chưa biết tên)') || E'\nGiờ hẹn: ' || v_gio
    || coalesce(E'\nSĐT khách: ' || new.phone, '') || E'\nTrạng thái: ' || new.status, v_listing);
  return null;
end $function$
;

revoke all on function public.viewings_bao_admin_va_email() from public, anon, authenticated;
grant execute on function public.viewings_bao_admin_va_email() to service_role;
drop trigger if exists trg_viewings_bao_ctv_va_email on public.viewings;
drop trigger if exists trg_viewings_bao_admin_va_email on public.viewings;
CREATE TRIGGER trg_viewings_bao_admin_va_email AFTER INSERT ON public.viewings FOR EACH ROW EXECUTE FUNCTION viewings_bao_admin_va_email();
drop function if exists public.viewings_bao_ctv_va_email();

CREATE OR REPLACE FUNCTION public.bump_user_quota(p_uid text, p_gio_limit integer DEFAULT 30, p_ngay_limit integer DEFAULT 120)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_gio   timestamptz := date_trunc('hour', now());
  v_quen  boolean;
  v_he    integer;
  v_trong_gio integer;
  v_trong_ngay integer;
begin
  if p_uid is null or btrim(p_uid) = '' then
    return true;
  end if;

  select exists (
    select 1 from sellers s where s.zalo_user_id = p_uid
    union all
    select 1 from admins a where a.zalo_user_id = p_uid
  ) into v_quen;
  v_he := case when v_quen then 4 else 1 end;

  insert into chat_quota (zalo_user_id, gio, calls)
  values (p_uid, v_gio, 1)
  on conflict (zalo_user_id, gio) do update set calls = chat_quota.calls + 1
  returning calls into v_trong_gio;

  select coalesce(sum(calls), 0) into v_trong_ngay
  from chat_quota
  where zalo_user_id = p_uid and gio > now() - interval '24 hours';

  delete from chat_quota where zalo_user_id = p_uid and gio < now() - interval '48 hours';
  if random() < 0.01 then
    delete from chat_quota where gio < now() - interval '48 hours';
  end if;

  if v_trong_gio > p_gio_limit * v_he or v_trong_ngay > p_ngay_limit * v_he then
    return false;
  end if;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.quota_tieu_hao()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ngay        date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_tran_ngay   integer;
  v_hom_nay     record;
  v_gio_limit   integer := 30;
  v_ngay_limit  integer := 120;
  v_nguoi       jsonb;
  v_credit      record;
  v_tran_nguoi  integer;
  v_co_du_phong boolean := false;
  v_song           timestamptz;
  v_dang_du_phong timestamptz;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;

  begin
    v_tran_ngay := nullif(btrim(coalesce(public.get_secret('DAILY_MODEL_CALL_CAP'), '')), '')::integer;
  exception when others then v_tran_ngay := null; end;
  v_tran_ngay := coalesce(v_tran_ngay, 1000);

  begin
    v_co_du_phong := coalesce(btrim(coalesce(public.get_secret('GROQ_API_KEY'), '')), '') <> '';
  exception when others then v_co_du_phong := false; end;

  select coalesce(u.model_calls, 0) as luot,
         coalesce(u.in_tokens,0)+coalesce(u.out_tokens,0)+coalesce(u.cache_write_tokens,0)+coalesce(u.cache_read_tokens,0) as tokens,
         u.capped_at
    into v_hom_nay from bot_usage u where u.day = v_ngay;

  select coalesce(jsonb_agg(x order by x.trong_24h desc), '[]'::jsonb) into v_nguoi
    from (
      select q.zalo_user_id as uid, sum(q.calls) as trong_24h,
             sum(q.calls) filter (where q.gio = date_trunc('hour', now())) as trong_gio,
             exists (
               select 1 from sellers s where s.zalo_user_id = q.zalo_user_id
               union all select 1 from admins a where a.zalo_user_id = q.zalo_user_id
             ) as nguoi_quen
        from chat_quota q where q.gio > now() - interval '24 hours'
       group by q.zalo_user_id order by 2 desc limit 10
    ) x;

  -- Dấu SỐNG của model chính: `_shared/claude.ts` đóng khi một lượt gọi model
  -- chính TRẢ VỀ (tiết chế 2 phút/lượt). Cố ý không dùng bot_usage/cong_token:
  -- đường dự phòng Groq cũng ghi token qua đó, nên một lượt Groq thành công sẽ
  -- xoá oan cờ hết số dư của Anthropic — nói ngược lại sự thật.
  select h.at into v_song from bot_health h where h.who = 'model_chinh';

  select count(*)::int as so_loi, max(e.at) as lan_cuoi into v_credit
    from bot_errors e
   where e.at > now() - interval '24 hours'
     and e.detail ilike '%credit balance is too low%';

  select max(e.at) into v_dang_du_phong
    from bot_errors e
   where e.at > now() - interval '1 hour' and e.source ilike 'model chinh hong%';

  select count(*)::int into v_tran_nguoi from (
    select q.zalo_user_id from chat_quota q where q.gio > now() - interval '24 hours'
     group by q.zalo_user_id having sum(q.calls) >= v_ngay_limit) y;

  return jsonb_build_object(
    'ngay', v_ngay, 'luot_hom_nay', coalesce(v_hom_nay.luot, 0), 'tran_ngay', v_tran_ngay,
    'capped_at', v_hom_nay.capped_at, 'token_hom_nay', coalesce(v_hom_nay.tokens, 0),
    'tran_gio_nguoi', v_gio_limit, 'tran_ngay_nguoi', v_ngay_limit, 'he_so_nguoi_quen', 4,
    'nguoi_dot_nhieu', coalesce(v_nguoi, '[]'::jsonb),
    'so_nguoi_cham_tran', coalesce(v_tran_nguoi, 0),
    -- CÒN hết số dư chỉ khi: có lỗi trong 24h VÀ chưa có lượt gọi model chính
    -- nào thành công SAU lỗi cuối. Dòng lỗi CŨ không phải bằng chứng rằng BÂY
    -- GIỜ vẫn hỏng.
    'het_credit', coalesce(v_credit.so_loi, 0) > 0
                    and (v_song is null or v_song <= v_credit.lan_cuoi),
    'model_song_luc', v_song,
    'credit_loi_24h', coalesce(v_credit.so_loi, 0),
    'credit_lan_cuoi', v_credit.lan_cuoi,
    'co_du_phong', v_co_du_phong,
    'dang_chay_du_phong', v_dang_du_phong is not null
                            and (v_song is null or v_song <= v_dang_du_phong)
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.khach_can_giu_ket_noi(p_tu_ngay integer DEFAULT 6, p_den_ngay integer DEFAULT 7, p_limit integer DEFAULT 10)
 RETURNS TABLE(conversation_id uuid, zalo_user_id text, ten text, vai text, buyer_id uuid, seller_id uuid, khach_cuoi timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cuoi as (
    select distinct on (m.conversation_id) m.conversation_id, m.sender::text as vai, m.created_at as khach_cuoi
      from messages m
     where m.sender in ('buyer', 'seller')
       and m.created_at > now() - make_interval(days => p_den_ngay) - interval '1 day'
     order by m.conversation_id, m.created_at desc, m.seq desc
  )
  select c.id, coalesce(case when cu.vai = 'seller' then s.zalo_user_id end, b.zalo_user_id, s.zalo_user_id),
         coalesce(case when cu.vai = 'seller' then s.name end, b.name, s.name),
         cu.vai, c.buyer_id, c.seller_id, cu.khach_cuoi
    from cuoi cu
    join conversations c on c.id = cu.conversation_id
    left join buyers b on b.id = c.buyer_id
    left join sellers s on s.id = c.seller_id
   where cu.khach_cuoi <= now() - make_interval(days => p_tu_ngay)
     and cu.khach_cuoi > now() - make_interval(days => p_den_ngay)
     and not c.human_hold
     and coalesce(case when cu.vai = 'seller' then s.zalo_user_id end, b.zalo_user_id, s.zalo_user_id) is not null
     and not public.la_id_thu(coalesce(case when cu.vai = 'seller' then s.zalo_user_id end, b.zalo_user_id, s.zalo_user_id))
     and (cu.vai = 'seller' or coalesce(b.bao_can_moi, true))
     and not exists (
       select 1 from reminders r
        where r.kind = 'reengage' and r.note like 'giu_ket_noi%' and r.status in ('pending', 'sent')
          and r.created_at >= cu.khach_cuoi
          and ((c.buyer_id is not null and r.buyer_id = c.buyer_id) or (c.seller_id is not null and r.seller_id = c.seller_id)))
   order by cu.khach_cuoi
   limit p_limit
$function$
;
comment on function public.khach_can_giu_ket_noi(integer, integer, integer) is 'Khách im 6–7 ngày cần MỘT tin giữ kết nối Zalo (FR-63, SRS-5.1zzzzzzz238) — lõi Python gửi (giu_ket_noi.py); bỏ ID thử, người thật đang giữ, khách mua đã tắt báo';
revoke all on function public.khach_can_giu_ket_noi(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.khach_can_giu_ket_noi(integer, integer, integer) to service_role;

insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('giu_ket_noi_mua', '{Goi} ơi, {toi} vẫn đang để mắt tìm căn hợp ý cho {goi}. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì {toi} không nhắn được nữa ạ 🙏', '{Goi} ơi, {toi} vẫn đang để mắt tìm căn hợp ý cho {goi}. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì {toi} không nhắn được nữa ạ 🙏', 'Khách mua im 6 ngày — giữ kết nối Zalo trước mốc 7 ngày (FR-63). {toi} = bot tự xưng', 'SRS-5.1zzzzzzz238', 45),
  ('giu_ket_noi_ban', '{Goi} ơi, {toi} vẫn đang giữ tin căn của {goi} trên hệ thống. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì có khách hỏi {toi} không báo {goi} được ạ 🙏', '{Goi} ơi, {toi} vẫn đang giữ tin căn của {goi} trên hệ thống. Nhờ {goi} nhắn lại {toi} một chữ thôi, kẻo Zalo tự ngắt kết nối thì có khách hỏi {toi} không báo {goi} được ạ 🙏', 'Người bán im 6 ngày — giữ kết nối Zalo trước mốc 7 ngày (FR-63). {toi} = bot tự xưng', 'SRS-5.1zzzzzzz238', 46)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
