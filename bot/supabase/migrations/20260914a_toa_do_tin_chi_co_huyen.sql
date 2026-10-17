-- 20260914a — tin CHỈ nói quận/huyện cũng được định vị (tâm quận/huyện)
--
-- Bắn 20 tin thật 14/09/2026: "bán đất Củ Chi 100m2 thổ cư hết, 900tr" có
-- district = "Huyện Củ Chi" mà không đường, không xã — `tin_can_geocode` chỉ nhận
-- tin có location_raw / street / ward / toạ độ dự án, nên tin này KHÔNG BAO GIỜ vào
-- hàng tra, nằm không toạ độ trong khi 6 tin cùng lượt đã có.
--
-- Nay: thêm mức `quan` (tâm quận/huyện) và đưa tin chỉ-có-quận vào hàng — trừ khi
-- quận là MẶC ĐỊNH (`boc_tach.quan_mac_dinh`, chưa ai nói quận thật). Mức này:
--   · không vào tìm gần mốc — `tin_gan_moc` vẫn chỉ nhận duong / du_an / tay;
--   · không nạp tiện ích (geocode-listings bỏ bước Overpass như mức phuong);
--   · không lên bản đồ web — /ban-do lọc `ward is not null`.
-- Khi chủ nhà nói thêm xã / đường, trigger `listings_xoa_toa_do_khi_doi_dia_chi`
-- xoá toạ độ cũ, tin vào hàng tra lại ở mức tốt hơn.

alter table public.listings drop constraint if exists listings_toa_do_muc_check;
alter table public.listings add constraint listings_toa_do_muc_check
  check (toa_do_muc is null or toa_do_muc = any (array['duong', 'phuong', 'quan', 'du_an', 'tay']));

comment on column public.listings.toa_do_muc is
  'Toạ độ chính xác tới đâu: duong (đoạn đường) · phuong (tâm phường) · quan (tâm quận/huyện, 20260914a) · du_an (toạ độ dự án) · tay (admin đặt tay). Chỉ duong/du_an/tay dùng cho tìm gần mốc.';

create or replace function public.tin_can_geocode(p_limit integer default 40)
 returns table(id uuid, location_raw text, street text, ward text, district text, quan_mac_dinh boolean, lat double precision, lng double precision, toa_do_muc text, du_an_lat double precision, du_an_lng double precision)
 language sql
 stable
 set search_path to 'public'
as $function$
  select l.id, l.location_raw, l.street, l.ward, l.district,
         coalesce((l.boc_tach ->> 'quan_mac_dinh')::boolean, false),
         l.lat::double precision, l.lng::double precision, l.toa_do_muc,
         p.lat::double precision, p.lng::double precision
  from listings l
  left join projects p on p.id = l.project_id
  where (
          (l.lat is null and (coalesce(btrim(l.location_raw), '') <> ''
                              or coalesce(btrim(l.street), '') <> ''
                              or coalesce(btrim(l.ward), '') <> ''
                              or p.lat is not null
                              -- 14/09/2026: chỉ có quận/huyện THẬT (không phải mặc định)
                              or (coalesce(btrim(l.district), '') <> ''
                                  and not coalesce((l.boc_tach ->> 'quan_mac_dinh')::boolean, false))))
          or (l.lat is not null and l.tien_ich_at is null)
        )
    and (l.geocode_at is null or l.geocode_at < now() - interval '12 hours')
  order by l.geocode_at nulls first, l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 200))
$function$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260914a', 'toa_do_tin_chi_co_huyen') on conflict do nothing;
