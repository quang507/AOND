-- 20260908e_chuan_hoa_thong_bao_va_don_loi.sql
-- Yêu cầu người dùng (08/09/2026):
-- 1. Dọn sạch toàn bộ sổ lỗi cũ bot_errors, cập nhật con trỏ bot_health.
-- 2. Tăng timeout cho media_cleanup_tick lên 30s để tránh timeout mạng khi dọn ảnh.
-- 3. Cấu hình lại còi thông báo: CHỈ GỬI THÔNG BÁO khi:
--    a) Bot trên VPS bị tắt (v_dead = true: bridge Zalo im quá 15 phút hoặc chưa từng điểm danh).
--       Các lỗi vặt nội bộ không được hú còi báo động hay tạo nhắc nhở phiền hà.
--    b) Có tin BĐS đang được tạo (trigger trg_listing_thong_bao_tao_tin trên listings).
--    c) Có khách hàng đang được hỏi / hỏi thông tin / cần người thật (trigger trg_info_request_thong_bao_khach_hoi va mở cổng email_admin không phụ thuộc admin_email rỗng).

-- 1. Tăng timeout cho media_cleanup_tick (30s)
CREATE OR REPLACE FUNCTION public.media_cleanup_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    body := '{}'::jsonb,
    timeout_milliseconds := 30000);
end $function$;

-- 2. Cấu hình bot_health_tick: CHỈ báo động khi bot trên VPS tắt (v_dead = true)
CREATE OR REPLACE FUNCTION public.bot_health_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_from bigint; v_to bigint; v_new integer := 0;
  v_beat timestamptz; v_co_hang boolean; v_hour integer;
  v_dead boolean := false; v_chua_bao_gio boolean := false;
  v_cnt integer; v_ntfy bigint;
  v_ntfy_truoc bigint; v_ma_truoc integer; v_co_dau_vet boolean;
  v_da_gui boolean := false;
begin
  select last_id into v_from from bot_health where who = 'pg_net';
  if v_from is null then
    select coalesce(max(id), 0) into v_from from net._http_response;
    insert into bot_health (who, last_id) values ('pg_net', v_from);
  end if;

  select coalesce(max(id), v_from) into v_to from net._http_response;

  insert into bot_errors (at, source, status_code, detail)
  select r.created, 'pg_net', r.status_code,
         left(public.che_sdt(coalesce(r.error_msg, r.content)), 500)
  from net._http_response r
  where r.id > v_from and r.id <= v_to
    and (r.status_code is null or r.status_code < 200 or r.status_code >= 300);
  get diagnostics v_new = row_count;
  update bot_health set last_id = v_to, at = now() where who = 'pg_net';

  v_hour := extract(hour from (now() at time zone 'Asia/Ho_Chi_Minh'))::int;
  select at into v_beat from bot_health where who = 'bridge-zca';
  v_co_hang := found;

  if v_hour between 7 and 22 then
    if not v_co_hang then
      v_chua_bao_gio := true;
      v_dead := true;
      insert into bot_errors (source, detail)
      select 'bridge', 'bridge-zca CHƯA TỪNG điểm danh lần nào — chưa chạy, hoặc chạy mà không ghi được bot_health.'
      where not exists (select 1 from bot_errors
                        where source = 'bridge' and at > now() - interval '1 hour');
    elsif v_beat < now() - interval '15 minutes' then
      v_dead := true;
      insert into bot_errors (source, detail)
      select 'bridge', format('bridge-zca im từ %s (VN)',
                              to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'))
      where not exists (select 1 from bot_errors
                        where source = 'bridge' and at > now() - interval '1 hour');
    end if;
  end if;

  select last_id into v_ntfy_truoc from bot_health
   where who = 'ntfy' and at > now() - interval '1 hour';
  if v_ntfy_truoc is not null then
    select status_code into v_ma_truoc from net._http_response where id = v_ntfy_truoc;
    v_co_dau_vet := found;
    if not v_co_dau_vet then
      v_da_gui := true;
    elsif v_ma_truoc between 200 and 299 then
      v_da_gui := true;
    else
      v_da_gui := false;
      insert into bot_errors (source, detail)
      select 'coi ntfy',
             format('lượt báo trước (pg_net req %s) KHÔNG tới nơi (mã %s) — bắn lại.',
                    v_ntfy_truoc, coalesce(v_ma_truoc::text, 'timeout/không có mã'))
      where not exists (select 1 from bot_errors
                        where source = 'coi ntfy' and at > now() - interval '1 hour');
    end if;
  end if;

  -- QUY TẮC: CHỈ báo động khi bot trên VPS đang tắt (v_dead = true)
  if v_dead
     and not exists (select 1 from reminders
                     where kind = 'escalation' and note like '🚨%'
                       and created_at > now() - interval '1 hour') then
    update reminders set status = 'cancelled'
     where kind = 'escalation' and status = 'pending' and note like '🚨%';
    insert into reminders (kind, due_at, note)
    values ('escalation', now(),
      format('🚨 CẢNH BÁO: Bot trên VPS (bridge-zca) đang tắt hoặc im từ %s. Cần kiểm tra VPS!',
             case when v_chua_bao_gio then 'chưa từng điểm danh'
                  else to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') end));
  end if;

  if v_dead and not v_da_gui then
    v_ntfy := public.canh_bao_ngoai(
      '🚨 [BOT VPS TẮT] Mất kết nối bridge Zalo',
      format('Bot trên VPS đang im tiếng từ %s. Vui lòng kiểm tra dịch vụ nhadat-bridge trên VPS.',
             case when v_chua_bao_gio then 'chưa từng điểm danh'
                  else to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') end),
      5, false);
    insert into bot_health (who, at, last_id) values ('ntfy', now(), coalesce(v_ntfy, 0))
    on conflict (who) do update set at = now(), last_id = excluded.last_id;
  end if;

  update reminders set status = 'cancelled'
   where kind = 'report' and status = 'pending' and created_at < now() - interval '36 hours';

  delete from bot_errors where at < now() - interval '30 days';

  return jsonb_build_object('loi_moi', v_new, 'bridge_im', v_dead,
                            'bridge_chua_bao_gio', v_chua_bao_gio,
                            'quet_toi', v_to, 'ntfy', v_ntfy,
                            'lan_truoc_da_gui', v_da_gui);
end $function$;

-- 3. Mở rộng email_admin: Không chặn khi admin_email rỗng mà luôn gửi qua canh_bao_ngoai
CREATE OR REPLACE FUNCTION public.email_admin(p_loai text, p_zalo_uid text, p_body text, p_listing_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_mail text; v_bds text; v_id bigint;
begin
  select value into v_mail from app_config where key = 'admin_email';
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
    (v_mail is not null and btrim(v_mail) <> ''));
  return v_id;
exception when others then
  perform public.log_loi('email_admin', left(p_loai || ': ' || sqlerrm, 400), null::integer);
  return null;
end $function$;

-- 4. Thông báo khi có TIN BĐS ĐANG ĐƯỢC TẠO
CREATE OR REPLACE FUNCTION public.trg_listing_thong_bao_tao_tin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_title text;
  v_text text;
begin
  v_title := '[TIN MỚI] ' || coalesce(new.code, 'BĐS');
  v_text := format('Có tin BĐS mới vừa được tạo: %s · %s%s · Giá: %s · DT: %sm2. Trạng thái: %s',
                   coalesce(new.code, 'Chưa mã'),
                   coalesce(new.property_type, 'BĐS'),
                   case when new.location_raw is not null then ' tại ' || new.location_raw else '' end,
                   coalesce(new.price_raw, 'Thương lượng'),
                   coalesce(new.area_m2::text, '-'),
                   case when new.status = 'cho_thong_tin' then 'Chờ thông tin'
                        when new.status = 'dang_ban' then 'Đang bán'
                        else new.status end);
  perform public.canh_bao_ngoai(v_title, v_text, 4, false);
  return new;
exception when others then
  return new;
end $function$;

DROP TRIGGER IF EXISTS trg_listing_thong_bao_tao_tin ON public.listings;
CREATE TRIGGER trg_listing_thong_bao_tao_tin
AFTER INSERT ON public.listings
FOR EACH ROW EXECUTE FUNCTION public.trg_listing_thong_bao_tao_tin();

-- 5. Thông báo khi CÓ KHÁCH HÀNG ĐẶT CÂU HỎI VỀ BĐS
CREATE OR REPLACE FUNCTION public.trg_info_request_thong_bao_khach_hoi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_bds text;
  v_buyer text;
begin
  if new.question is not null and btrim(new.question) <> '' then
    select coalesce('#' || code, '') into v_bds from listings where id = new.listing_id;
    select coalesce(name, 'Khách hàng') into v_buyer from buyers where id = new.buyer_id;

    perform public.canh_bao_ngoai(
      format('[KHÁCH HỎI BĐS] %s', coalesce(v_bds, 'Tin')),
      format('%s vừa hỏi về căn %s: "%s". Cần kiểm tra và hỗ trợ khách.',
             coalesce(v_buyer, 'Khách'),
             coalesce(v_bds, ''),
             left(new.question, 300)),
      4, false);
  end if;
  return new;
exception when others then
  return new;
end $function$;

DROP TRIGGER IF EXISTS trg_info_request_thong_bao_khach_hoi ON public.info_requests;
CREATE TRIGGER trg_info_request_thong_bao_khach_hoi
AFTER INSERT ON public.info_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_info_request_thong_bao_khach_hoi();

-- 6. Dọn sạch sổ lỗi và các nhắc nhở cũ
DELETE FROM public.bot_errors;
UPDATE public.bot_health SET last_id = (SELECT coalesce(max(id), 0) FROM net._http_response) WHERE who = 'pg_net';
DELETE FROM public.reminders WHERE note LIKE '🩺%';
