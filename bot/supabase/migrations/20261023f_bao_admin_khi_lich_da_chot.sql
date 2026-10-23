-- 20261023f — Lịch xem đã chốt (khách đã nói giờ + CTV xác nhận với chủ nhà) thì BÁO ADMIN (SRS-5.1zzzzzzz164, chủ dự án 23/10/2026:
-- "nếu 2 bên đã chốt giờ thì báo admin cũng được").
-- Trước đó: khách đặt lịch → nhắc CTV (hoặc admin nếu hội thoại không có CTV); CTV nhắn "#mã: ok giờ" → lịch sang `confirmed` + báo khách.
-- Admin không biết lịch đã chốt. Nay: câu `xac_nhan_lich` do CTV trả lời (ctv_id có, chưa leo thang sang admin) → thêm MỘT nhắc `escalation`
-- không gắn seller / ctv (bridge đưa về admin) nói lịch đã chốt. Admin tự trả lời thì không báo thêm (chính admin vừa chốt).
-- Chỉ thêm khối báo admin; phần còn lại của hàm giữ nguyên bản `schema.sql`. Bọc riêng: sổ hỏng không được chặn việc báo lại khách.
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
      -- 20261023f: lịch đã chốt do CTV xác nhận → báo admin nắm (không cần làm gì thêm)
      if v_vw is not null and new.ctv_id is not null and coalesce(new.assignee, '') <> 'admin' then
        begin
          insert into reminders (kind, buyer_id, listing_id, viewing_id, due_at, note)
          values ('escalation', new.buyer_id, new.listing_id, v_vw, now(),
            'Lịch xem #' || coalesce(v_code, '?') || ' đã chốt (khách và chủ nhà thống nhất, CTV xác nhận): '
            || left(coalesce(new.answer, ''), 150) || ' — báo để admin nắm, không cần làm gì thêm.');
        exception when others then
          perform public.log_loi('lich_chot_bao_admin', left(sqlerrm, 400), null::integer);
        end;
      end if;
    else
      insert into reminders (kind, buyer_id, listing_id, due_at, note)
      values ('followup', new.buyer_id, new.listing_id, now(),
        'chủ nhà vừa trả lời câu khách hỏi về #' || coalesce(v_code, '?') || ' — "'
        || coalesce(new.question, '') || '": ' || left(coalesce(new.answer, ''), 300));
    end if;
  end if;
  return null;
end $$;
