-- 20260902h — FR-140 b/c: câu khách hỏi về căn → BÁO ADMIN luôn, HỎI CHỦ, và
-- khi chủ trả lời thì BÁO LẠI KHÁCH (02/09/2026)
--
-- Quyết định chủ dự án 02/09/2026: "Thông tin người ta hỏi về bđs mới báo về
-- admin và hỏi chủ bđs về thông tin bđs đó."
--
-- Trước: `notify_info_request_escalation` chỉ nhắn CHỦ NHÀ (khi tin có chủ trên
-- Zalo) HOẶC giao CTV HOẶC giao admin — admin chỉ biết khi không còn ai. Admin
-- thấy dòng nhắc chủ nhà thoáng qua ở /admin rồi mất khi bridge gửi xong, và
-- lời nhắc viết cho chủ nhà chứ không phải báo cáo.
-- Sau: mọi câu khách hỏi (`source = buyer_ask`) sinh THÊM một dòng báo admin
-- (kind escalation, không seller_id/ctv_id → đi đường admin: /admin + OA/bridge),
-- ghi rõ đã hỏi ai. Đường hỏi chủ / giao CTV giữ nguyên.
--
-- Và nửa còn thiếu của vòng INS-06: chủ trả lời xong không ai báo lại khách —
-- fact chỉ nằm chờ khách hỏi lần nữa. Nay `answered` + `buyer_id` → reminder
-- `followup` cho khách, ghi chú bắt đầu bằng "chủ nhà vừa trả lời" để `nudge`
-- soạn tin báo đúng câu trả lời (không bịa).

create or replace function public.notify_info_request_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code   text;
  v_seller uuid;
  v_ctv    text;
  v_hoi    text;
begin
  select l.code, l.seller_id into v_code, v_seller from listings l where l.id = new.listing_id;
  v_hoi := coalesce(new.question, 'thông tin');

  if new.assignee = 'admin' then
    -- Không chủ trên Zalo, không CTV: admin tự đi hỏi.
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', new.listing_id, now(),
      '❓ Khách hỏi căn #' || coalesce(v_code, '?') || ': "' || v_hoi
      || '" — tin không có chủ trên Zalo, không có CTV. Admin hỏi giúp rồi ghi vào tin.');

  elsif new.assignee = 'ctv' then
    select name into v_ctv from ctvs where id = new.ctv_id;
    -- Giao CTV (đi OA/bridge tới CTV) — như cũ
    insert into reminders (kind, listing_id, ctv_id, due_at, note)
    values ('escalation', new.listing_id, new.ctv_id, now(),
      'khách hỏi #' || coalesce(v_code, '?') || ' · cần: ' || v_hoi
      || ' · tin không có chính chủ trên hệ thống → giao ctv');
    -- + BÁO ADMIN (FR-140 b)
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', new.listing_id, now(),
      '❓ Khách hỏi căn #' || coalesce(v_code, '?') || ': "' || v_hoi
      || '" — đã giao CTV ' || coalesce(v_ctv, '?') || ' đi hỏi.');

  elsif new.assignee = 'seller' and new.source = 'buyer_ask' and v_seller is not null then
    -- Hỏi chủ nhà (đi OA/bridge tới chủ) — như cũ
    insert into reminders (kind, listing_id, seller_id, due_at, note)
    values ('escalation', new.listing_id, v_seller, now(),
      'khách đang quan tâm căn #' || coalesce(v_code, '?') || ' của mình, cần bổ sung: ' || v_hoi);
    -- + BÁO ADMIN (FR-140 b)
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', new.listing_id, now(),
      '❓ Khách hỏi căn #' || coalesce(v_code, '?') || ': "' || v_hoi
      || '" — bot đã nhắn chủ nhà hỏi. Chủ trả lời thì bot tự báo lại khách.');
  end if;
  return new;
end $$;

-- ── Chủ trả lời → báo lại khách (FR-140 c) ───────────────────────────────────
create or replace function public.info_request_bao_lai_khach()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_code text;
begin
  if new.status = 'answered' and old.status is distinct from 'answered'
     and new.source = 'buyer_ask' and new.buyer_id is not null then
    select code into v_code from listings where id = new.listing_id;
    -- Bỏ qua tao_followup (luật 1 nhắc/24h) — đây là câu trả lời khách đang đợi,
    -- không phải nhắc im lặng. Huỷ nhắc followup im lặng còn treo cho cùng căn để
    -- không gửi hai tin sát nhau.
    update reminders set status = 'cancelled'
     where buyer_id = new.buyer_id and listing_id = new.listing_id
       and kind = 'followup' and status = 'pending';
    insert into reminders (kind, buyer_id, listing_id, due_at, note)
    values ('followup', new.buyer_id, new.listing_id, now(),
      'chủ nhà vừa trả lời câu khách hỏi về #' || coalesce(v_code, '?') || ' — "'
      || coalesce(new.question, '') || '": ' || left(coalesce(new.answer, ''), 300));
  end if;
  return null;
end $$;

drop trigger if exists trg_info_request_bao_lai_khach on public.info_requests;
create trigger trg_info_request_bao_lai_khach
  after update of status on public.info_requests
  for each row execute function public.info_request_bao_lai_khach();

comment on function public.notify_info_request_escalation() is
  'FR-140: câu khách hỏi → nhắn chủ nhà (hoặc giao CTV/admin) VÀ luôn báo admin một dòng (02/09/2026).';
comment on function public.info_request_bao_lai_khach() is
  'FR-140 c: câu hỏi buyer_ask được chủ trả lời → reminder followup "chủ nhà vừa trả lời" để nudge báo lại khách.';
