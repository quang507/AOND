-- 20261025b — Bỏ nhánh "CTV xác nhận lịch → báo admin nắm" (SRS-5.1zzzzzzz173, chủ dự án 25/10/2026: "Bỏ luôn nhánh CTV xác nhận lịch đi").
-- Nhánh thêm ở 20261023f (SRS-5.1zzzzzzz164): lịch đã chốt do CTV xác nhận thì thêm một nhắc `escalation` về admin. Từ SRS-165 / SRS-170 không còn dòng
-- `info_requests` nào giao CTV nên nhánh nằm im; gỡ cho gọn. Chỉ bỏ khối đó, phần còn lại giữ nguyên bản `schema.sql`.
CREATE OR REPLACE FUNCTION public.info_request_bao_lai_khach()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
