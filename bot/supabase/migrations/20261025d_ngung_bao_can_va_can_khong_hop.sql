-- 20261025d — Khách mua tắt tin báo căn mới + ghi căn khách chê (SRS-5.1zzzzzzz175, soát UX 25/10/2026, chủ dự án: "Làm luôn 2 cái đầu đi").
-- (1) `buyers.bao_can_moi`: khách bảo "đừng gửi nữa" → false, vòng `bao_can_moi` trong lõi bỏ qua khách đó. Khách xin báo lại → true.
-- (2) `interests.trang_thai` (quan_tam / khong_hop) + `ly_do` nguyên văn khách nói: căn khách chê không gợi lại trong chat (`can_phu_hop`), không báo
--     lại (`bao_can_moi`), không báo "đã chốt" (`bao_can_da_chot`). `mark_listing_interest` đè ngược về quan_tam khi khách đổi ý.
alter table public.buyers add column if not exists bao_can_moi boolean not null default true;
comment on column public.buyers.bao_can_moi is
  'false = khách đã bảo đừng gửi tin tự động báo căn mới (SRS-5.1zzzzzzz175); lõi `bao_can_moi.chay_mot_luot` bỏ qua. Khách xin báo lại → true.';

alter table public.interests add column if not exists trang_thai text not null default 'quan_tam';
alter table public.interests add column if not exists ly_do text;
alter table public.interests drop constraint if exists interests_trang_thai_check;
alter table public.interests add constraint interests_trang_thai_check check (trang_thai in ('quan_tam', 'khong_hop'));
comment on column public.interests.trang_thai is
  'quan_tam = khách tỏ ý thích / hẹn xem (mark_listing_interest); khong_hop = khách chê căn trong chat (SRS-5.1zzzzzzz175) — không gợi / không báo lại.';
comment on column public.interests.ly_do is 'Nguyên văn cụm khách nói vì sao căn không hợp (có thể trống). Chỉ ghi điều khách nói.';

CREATE OR REPLACE FUNCTION public.mark_listing_interest(p_codes text[], p_buyer_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n int;
begin
  n := public.mark_listing_interest(p_codes);
  if p_buyer_id is not null then
    insert into interests (buyer_id, listing_id)
    select p_buyer_id, l.id from listings l
     where (l.code = any(p_codes) or l.legacy_code = any(p_codes))
       and l.status in ('dang_ban', 'dang_quan_tam', 'da_chot')
    on conflict (buyer_id, listing_id) do update set trang_thai = 'quan_tam', ly_do = null;
  end if;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.bao_can_da_chot(p_listing_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_code text; v_note text; v_thay text; n int := 0;
begin
  select code into v_code from listings where id = p_listing_id;
  for r in
    select i.buyer_id
      from interests i
      join buyers b on b.id = i.buyer_id
     where i.listing_id = p_listing_id
       and i.trang_thai = 'quan_tam'
       and b.zalo_user_id is not null
       and not exists (select 1 from deals d where d.listing_id = p_listing_id and d.buyer_id = i.buyer_id)
       and not exists (select 1 from reminders x
                        where x.buyer_id = i.buyer_id and x.kind = 'sold'
                          and x.status in ('pending', 'sent')
                          and x.created_at > now() - interval '24 hours')
     limit 50
  loop
    select string_agg(c.tom_tat, '; ') into v_thay
      from public.can_cung_khu(r.buyer_id, p_listing_id, 2) c;
    v_note := '#' || coalesce(v_code, '?') || ' đã chốt'
           || coalesce(' · thay thế: ' || v_thay, '');
    insert into reminders (kind, buyer_id, listing_id, due_at, note)
    values ('sold', r.buyer_id, p_listing_id, now(), v_note)
    on conflict (buyer_id, listing_id) where kind = 'sold' do nothing;
    n := n + 1;
  end loop;
  return n;
end $function$
;
