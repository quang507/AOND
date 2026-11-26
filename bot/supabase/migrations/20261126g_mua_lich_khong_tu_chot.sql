-- 20261126g_mua_lich_khong_tu_chot — SRS-5.1zzzzzzz552 (chủ dự án 26/11/2026: "Sửa 3 lỗi P0 trước" — audit ECC chat Zalo 25/11, phía mua).
-- Admin trả lời câu xác nhận lịch ("#mã: …") thì trigger cũ chốt lịch `confirmed` bất kể nội dung, khách nhận "đã chốt" đúng giờ khách tự
-- đề nghị ("chủ bận thứ 7, CN 9h được không" → khách nhận "đã chốt thứ 7"). Nay lõi đọc lời admin bằng AI và tự chốt khi đồng ý đúng giờ
-- (`Engine._doc_y_chot_lich` → `chot_lich`, chốt TRƯỚC khi đặt câu trả lời); trigger chỉ xếp nhắc `followup` kèm viewing_id (lịch mới nhất
-- của khách ở căn đó, kể cả đã chốt). Lõi gửi "đã chốt" khi lịch `confirmed`, còn lại gửi nguyên lời admin (câu mẫu mới `bao_lich_chu_tra_loi`).
begin;

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
    if coalesce(new.question, '') = 'xac_nhan_lich' then                       -- 20260904f FR-52 · 20261126g: không tự chốt lịch
      select id into v_vw from viewings
       where buyer_id = new.buyer_id and listing_id = new.listing_id
         and status in ('proposed', 'pending', 'confirmed')
       order by created_at desc limit 1;
      insert into reminders (kind, buyer_id, listing_id, viewing_id, due_at, note)
      values ('followup', new.buyer_id, new.listing_id, v_vw, now(),
        'trả lời lịch xem #' || coalesce(v_code, '?') || ': ' || left(coalesce(new.answer, ''), 200));
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

insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu)
select 'bao_lich_chu_tra_loi', 'Về lịch xem căn {ma}, chủ nhà nhắn lại: “{tra_loi}”
Lịch này chưa chốt, {goi} xem rồi nhắn {toi} để {toi} sắp xếp tiếp nha.', 'Về lịch xem căn {ma}, chủ nhà nhắn lại: “{tra_loi}”
Lịch này chưa chốt, {goi} xem rồi nhắn {toi} để {toi} sắp xếp tiếp nha.', 'Admin trả lời câu xác nhận lịch xem mà chưa đồng ý đúng giờ khách hẹn (AI đọc) → báo khách mua NGUYÊN lời (đã che số / link), nhắc `followup` có viewing_id. {ma} = mã căn, {tra_loi} = lời admin, {toi} = bot tự xưng — câu sửa phải giữ {tra_loi}', 'SRS-5.1zzzzzzz552',
       (select coalesce(max(thu_tu), 0) + 1 from public.cau_mau)
on conflict (khoa) do nothing;

commit;
