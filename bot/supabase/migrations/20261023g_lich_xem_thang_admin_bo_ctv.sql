-- 20261023g — Lịch xem đi THẲNG admin, bỏ bước CTV (SRS-5.1zzzzzzz165, chủ dự án 23/10/2026: "bỏ qua bước ctv luôn để đưa thông tin cho admin luôn").
-- Trước đó `viewings_bao_ctv_va_email` lấy CTV của hội thoại (nếu có, còn hoạt động) làm người nhận nhắc và người được giao câu `xac_nhan_lich`;
-- không có CTV mới tới admin. Nay luôn là admin: nhắc `escalation` không gắn ctv (bridge đưa về admin), câu `xac_nhan_lich` giao `admin`
-- (không đặt `sla_due_at` — không còn bước CTV để leo thang sau 2 giờ). Chỉ đổi dòng chọn CTV; phần còn lại giữ nguyên bản `schema.sql`.
-- Chỉ áp cho LỊCH XEM. Các đường khác có bước CTV (câu khách hỏi chủ nhà, báo cáo 17h) không đụng.
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
  v_ctv := null;   -- 20261023g: bỏ bước CTV, lịch xem đi thẳng admin
  v_gio := coalesce(to_char(new.slot at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'), new.time_text, '?');

  -- (a) nhắc admin ngay
  begin
    v_note := 'Lịch xem #' || v_code || ' · ' || v_gio || ' · khách ' || coalesce(v_ten, '(chưa biết tên)')
           || ', xác nhận với chủ nhà rồi nhắn lại em "#' || v_code || ': ok ' || coalesce(to_char(new.slot at time zone 'Asia/Ho_Chi_Minh', 'HH24"h"'), 'giờ') || '" nha';
    insert into reminders (kind, buyer_id, listing_id, viewing_id, ctv_id, due_at, note)
    values ('escalation', new.buyer_id, v_listing, new.id, v_ctv, now(), v_note);
  exception when others then
    perform public.log_loi('viewings_bao_ctv', left(sqlerrm, 400), null::integer);
  end;

  -- (b) câu xác nhận lịch giao admin để lời "#mã: ok giờ" đóng được nó (info_request_bao_lai_khach chốt lịch + báo khách)
  if v_listing is not null and new.buyer_id is not null and new.status in ('proposed', 'pending') then
    begin
      insert into info_requests (listing_id, buyer_id, question, status, source, assignee, ctv_id, sla_due_at)
      values (v_listing, new.buyer_id, 'xac_nhan_lich', 'pending', 'buyer_ask', 'admin', null, null);
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
