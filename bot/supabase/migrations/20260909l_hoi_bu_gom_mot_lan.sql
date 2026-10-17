-- 20260909l — hỏi bù GOM MỘT LẦN (chủ dự án 09/09/2026 tối: "seller-hoi-bu-tick sau 5 phút
-- khi khách ngừng thì hỏi thêm 1 lần 2 đến 3 thông tin còn thiếu, ưu tiên thông tin quan
-- trọng hoặc ảnh và sổ hồng, chứ không phải mỗi 5 phút đều hỏi").
--   * ask-seller (drip) nay hỏi 2–3 thông tin trong MỘT tin, ưu tiên ảnh/sổ/giá/diện tích/vị trí.
--   * seller_hoi_bu_tick: giữ "5 phút sau khi gật, một lần" (cửa sổ 5–20 phút, không hỏi trùng).
--   * seller_drip_tick (30'): trần mỗi tin từ 3 lần/24h xuống 1 lần/24h — tin đã được hỏi bù
--     (hoặc chủ đang nợ câu trả lời) thì không hỏi thêm trong ngày; 2 căn/người/ngày giữ nguyên.
create or replace function public.seller_drip_tick()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare r record; n int := 0;
begin
  for r in
    with asked as (
      select l2.seller_id, count(distinct q.listing_id) as c
      from info_requests q join listings l2 on l2.id = q.listing_id
      where q.created_at > now() - interval '24 hours'
      group by l2.seller_id
    ),
    cand as (
      select l.id, l.seller_id, l.created_at, coalesce(a.c, 0) as asked24,
             row_number() over (partition by l.seller_id order by l.created_at desc) as rn
      from listings l
      join sellers s on s.id = l.seller_id
      left join asked a on a.seller_id = l.seller_id
      where (l.status = 'cho_thong_tin' or (l.status = 'dang_ban' and l.can_chu_duyet))
        and l.chu_noi_du_at is null
        and (s.zalo_user_id is not null or l.created_at > now() - interval '7 days')
        and exists (select 1 from listing_missing_facts m where m.listing_id = l.id)
        and not exists (select 1 from info_requests q where q.listing_id = l.id and q.status = 'pending')
        -- 20260909l: một LƯỢT hỏi bù mỗi ngày mỗi tin (một lượt = một tin gom 2–3 câu)
        and not exists (select 1 from info_requests q where q.listing_id = l.id and q.created_at > now() - interval '24 hours')
    )
    select id from cand where rn + asked24 <= 2 order by created_at desc limit 10
  loop
    perform ask_seller_drip(r.id);
    n := n + 1;
  end loop;
  return n;
end $function$;
comment on function public.seller_drip_tick() is
  'FR-129/144/177 f: nhịp hỏi bù (cron seller-drip-tick 30 phút, 8h–20h VN). 20260909l: MỘT lượt/24h/tin, mỗi lượt ask-seller gom 2–3 thông tin (ưu tiên ảnh, sổ, giá, diện tích, vị trí); 2 căn/người/24h; 10 tin/nhịp; không hỏi khi còn câu chờ.';
comment on function public.seller_hoi_bu_tick() is
  'FR-177 f: 5 phút sau khi chủ gật bản nháp (chu_duyet_at), hỏi bù MỘT LẦN — ask-seller gom 2–3 thông tin còn thiếu, ưu tiên ảnh/sổ/giá/diện tích (20260909l). Cửa sổ 5–20 phút + chưa có info_request nào sau lúc gật → không hỏi trùng. Cron */5 1-13 UTC.';
