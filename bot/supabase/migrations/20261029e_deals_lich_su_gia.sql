-- 20261029e_deals_lich_su_gia — SRS-5.1zzzzzzz285 (chủ dự án 29/10: "tạo plan sửa các thứ bạn triển khai được đi … cứ làm đi").
-- Soát DB theo góc môi giới:
-- (1) `deals` có khoá duy nhất (listing_id, buyer_id) NULLS NOT DISTINCT → mỗi tin chỉ ghi được MỘT giao dịch với khách ngoài hệ thống (buyer_id
--     rỗng): căn cho thuê chốt lại năm sau không ghi được. Lõi chỉ ghi `deals` lúc tin ĐỔI sang `da_chot` (một lần chốt một dòng) — bỏ khoá.
-- (2) Giá tin bị ghi đè, không có lịch sử → thêm sự kiện `doi_gia` (giá cũ → giá mới, chữ gốc, nguồn) vào `property_events`.
alter table public.deals drop constraint if exists deals_listing_buyer_key;

alter table public.property_events drop constraint if exists property_events_event_type_check;
alter table public.property_events add constraint property_events_event_type_check
  check (event_type = any (array['view','asked','interest','photos','viewing','deal','match_sent','status','doi_gia']));
comment on column public.property_events.event_type is
  'view / asked / interest / photos / viewing / deal / match_sent / status / doi_gia (20261029e: giá đổi — meta {tu, den, tu_chu, den_chu, nguon})';

CREATE OR REPLACE FUNCTION public.trg_property_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_listing uuid;
begin
  if tg_table_name = 'listing_views' then
    perform public.ghi_su_kien_bds(new.listing_id, 'view', null, jsonb_build_object('auth_user_id', new.auth_user_id));
  elsif tg_table_name = 'interests' then
    perform public.ghi_su_kien_bds(new.listing_id, 'interest', new.buyer_id, null);
  elsif tg_table_name = 'info_requests' then
    if new.source = 'buyer_ask' and coalesce(new.question, '') <> 'xac_nhan_lich' then
      perform public.ghi_su_kien_bds(new.listing_id, 'asked', new.buyer_id, jsonb_build_object('question', left(new.question, 200)));
    end if;
  elsif tg_table_name = 'viewings' then
    v_listing := new.listing_id;
    if v_listing is null and new.listing_code is not null then
      select id into v_listing from listings where code = new.listing_code;
    end if;
    perform public.ghi_su_kien_bds(v_listing, 'viewing', new.buyer_id,
      jsonb_build_object('viewing_id', new.id, 'slot', new.slot, 'time_text', new.time_text));
  elsif tg_table_name = 'deals' then
    perform public.ghi_su_kien_bds(new.listing_id, 'deal', new.buyer_id, jsonb_build_object('deal_id', new.id, 'price_vnd', new.price_vnd));
  elsif tg_table_name = 'reminders' then
    if new.kind = 'match' and new.status = 'sent' and old.status is distinct from 'sent' then
      perform public.ghi_su_kien_bds(new.listing_id, 'match_sent', new.buyer_id, jsonb_build_object('reminder_id', new.id));
    end if;
  elsif tg_table_name = 'listings' then
    if tg_op = 'UPDATE' and old.status is distinct from new.status then
      perform public.ghi_su_kien_bds(new.id, 'status', null, jsonb_build_object('tu', old.status, 'den', new.status));
    end if;
    -- 20261029e (SRS-5.1zzzzzzz285): lịch sử giá — giá cũ bị ghi đè, mất tín hiệu "chủ đã giảm giá" (chủ cần bán) và không báo được khách đã
    -- quan tâm. Chỉ ghi khi đã có giá trước đó (lần đầu điền giá không phải "đổi giá").
    if tg_op = 'UPDATE' and old.price_vnd is not null and new.price_vnd is not null and old.price_vnd is distinct from new.price_vnd then
      perform public.ghi_su_kien_bds(new.id, 'doi_gia', null, jsonb_build_object('tu', old.price_vnd, 'den', new.price_vnd,
        'tu_chu', old.price_raw, 'den_chu', new.price_raw, 'nguon', new.price_source));
    end if;
  end if;
  return null;
end $function$
;
