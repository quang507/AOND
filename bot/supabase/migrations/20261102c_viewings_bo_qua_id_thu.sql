-- 20261102c_viewings_bo_qua_id_thu — trigger nhắn admin không chạy cho ID thử (02/11/2026, SRS-330).
-- `viewings_bao_admin_va_email`: lịch hẹn của ID thử (`la_id_thu`) vẫn ghi vào `viewings` nhưng không nhắc admin (reminders escalation),
-- không giao câu `xac_nhan_lich`, không email [VIEWING]. Cùng lớp: `trg_info_request_thong_bao_khach_hoi` bắn `canh_bao_ngoai` cho mọi
-- câu hỏi `buyer_ask`, kể cả của ID thử — chặn luôn. Lõi đã chặn cùng cách ở `SupabaseConversationStore._xep_tin_admin` (SRS-321).
begin;

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

  -- 20261102c (SRS-330): ID thử (`la_id_thu`, cùng danh sách với lõi) — lịch hẹn vẫn ghi, KHÔNG nhắc admin, không giao câu xác nhận
  -- lịch, không email. Bắn thử ban-thu-mua 02/11 từng nhắn admin thật lịch xem của "Khách thử".
  if public.la_id_thu(v_uid) then return null; end if;

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
  if new.source is distinct from 'buyer_ask' then return new; end if;
  -- 20261102c (SRS-330): khách là ID thử thì không bắn cảnh báo ra ngoài.
  if exists (select 1 from buyers b where b.id = new.buyer_id and public.la_id_thu(b.zalo_user_id)) then return new; end if;

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
  perform public.log_loi('trg_info_request_thong_bao_khach_hoi', left(sqlerrm, 400), null::integer);
  return new;
end $function$
;

commit;
