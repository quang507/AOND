-- SRS-5.1zzzzzzz431 (12/11/2026, chủ dự án: "Tin thử được coi là thật"): `can_dang_rao_gan` bỏ bộ lọc `source = 'seed_thu'` — mọi tin trong kho
-- tính như nhau, cùng cách web đang hiện tin cho người mua (SRS-413). Bỏ tham số `p_gom_thu` (thay hàm 4 tham số của 20261112b / 20261112c).

drop function if exists public.can_dang_rao_gan(uuid, integer, integer, boolean);

create or replace function public.can_dang_rao_gan(p_listing_id uuid, p_ban_kinh_m integer default 3000, p_toi_da integer default 3)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with g as (
    select id, deal, property_type, seller_id, lat::float8 as lat, lng::float8 as lng, access_type, price_vnd, price_per_m2_vnd, area_m2
      from listings where id = p_listing_id and lat is not null and lng is not null
  ), ung as (
    select l.code, l.street, l.ward, l.area_m2, l.price_vnd, l.price_per_m2_vnd, l.access_type, l.floors, l.status, l.updated_at,
           round(khoang_cach_m(g.lat, g.lng, l.lat::float8, l.lng::float8))::int as m,
           (l.access_type is not distinct from g.access_type) as cung_loi_vao
      from listings l, g
     where l.id <> g.id and l.deal = g.deal and l.property_type = g.property_type
       and (g.seller_id is null or l.seller_id is distinct from g.seller_id)
       and l.lat is not null and l.lng is not null and l.price_per_m2_vnd is not null
       and khoang_cach_m(g.lat, g.lng, l.lat::float8, l.lng::float8) <= p_ban_kinh_m
  )
  select jsonb_build_object(
    'cua_chu', (select jsonb_build_object('price_vnd', price_vnd, 'price_per_m2_vnd', price_per_m2_vnd, 'area_m2', area_m2,
                                          'access_type', access_type) from g),
    'dang_rao', coalesce((select jsonb_agg(to_jsonb(x) - 'updated_at' - 'cung_loi_vao' - 'status')
                            from (select * from ung where status in ('dang_ban', 'dang_quan_tam')
                                   order by cung_loi_vao desc, m limit p_toi_da) x), '[]'::jsonb),
    'don_gia', (select jsonb_build_object('n', count(*), 'min', min(price_per_m2_vnd), 'max', max(price_per_m2_vnd),
                                          'trung_vi', round(percentile_cont(0.5) within group (order by price_per_m2_vnd)),
                                          'n_cung_loi_vao', count(*) filter (where cung_loi_vao),
                                          'trung_vi_cung_loi_vao', round(percentile_cont(0.5) within group (order by price_per_m2_vnd)
                                                                         filter (where cung_loi_vao)))
                  from ung where status in ('dang_ban', 'dang_quan_tam')),
    'da_giao_dich', coalesce((select jsonb_agg(to_jsonb(x) - 'updated_at' - 'cung_loi_vao')
                                from (select * from ung where status in ('da_coc', 'da_chot') and updated_at > now() - interval '180 days'
                                       order by m limit p_toi_da) x), '[]'::jsonb)
  )
$function$;

revoke all on function public.can_dang_rao_gan(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.can_dang_rao_gan(uuid, integer, integer) to service_role;

-- Một nguồn cho đường vào (cùng SRS): tin bot ghi (`boc_tach._thong_so_ai`) lấy `access_type` theo ô `_duong_vao` AI đọc — cùng luật
-- `supabase_store.loi_vao_tu_o`. Trước bản này 56F988C9 có `_duong_vao = mat_tien` mà cột trống.
update public.listings l set access_type = case
    when l.boc_tach->>'_duong_vao' = 'mat_tien' then 'mat_tien'
    when l.boc_tach->>'_duong_vao' = 'hem_xe_hoi' then case when l.access_type = 'hem_xe_tai' then 'hem_xe_tai' else 'hem_xe_hoi' end
    else case when l.access_type in ('hem_xe_tai', 'hem_xe_hoi', 'hem_xe_may') then l.access_type else 'hem' end end
 where coalesce(l.boc_tach->>'_thong_so_ai', '') = 'true'
   and l.boc_tach->>'_duong_vao' in ('mat_tien', 'hem', 'hem_xe_hoi')
   and l.access_type is distinct from case
    when l.boc_tach->>'_duong_vao' = 'mat_tien' then 'mat_tien'
    when l.boc_tach->>'_duong_vao' = 'hem_xe_hoi' then case when l.access_type = 'hem_xe_tai' then 'hem_xe_tai' else 'hem_xe_hoi' end
    else case when l.access_type in ('hem_xe_tai', 'hem_xe_hoi', 'hem_xe_may') then l.access_type else 'hem' end end;
