-- SRS-5.1zzzzzzz428 (12/11/2026): LQC mảng So sánh cạnh tranh — căn cùng loại đang rao gần căn của chủ (4.1 · 4.2) + căn đã cọc / chốt gần
-- đó (4.3 · 4.4, chỉ dòng có thật) + dải đơn giá các căn đang rao (4.5). Chỉ đọc; KHÔNG trả số nhà, người bán, mô tả.
-- Tin thử (`source = 'seed_thu'`) bị loại trừ khi `p_gom_thu` (chỉ bật cho ID thử) — gửi tin thử cho chủ nhà thật là bịa.

create or replace function public.can_dang_rao_gan(p_listing_id uuid, p_ban_kinh_m integer default 3000, p_toi_da integer default 3,
                                                   p_gom_thu boolean default false)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with g as (
    select id, deal, property_type, seller_id, lat::float8 as lat, lng::float8 as lng, access_type
      from listings where id = p_listing_id and lat is not null and lng is not null
  ), ung as (
    select l.code, l.street, l.ward, l.area_m2, l.price_vnd, l.price_per_m2_vnd, l.access_type, l.floors, l.status, l.updated_at,
           round(khoang_cach_m(g.lat, g.lng, l.lat::float8, l.lng::float8))::int as m,
           (l.access_type is not distinct from g.access_type) as cung_loi_vao
      from listings l, g
     where l.id <> g.id and l.deal = g.deal and l.property_type = g.property_type
       and (g.seller_id is null or l.seller_id is distinct from g.seller_id)
       and l.lat is not null and l.lng is not null and l.price_per_m2_vnd is not null
       and (p_gom_thu or coalesce(l.source, '') <> 'seed_thu')
       and khoang_cach_m(g.lat, g.lng, l.lat::float8, l.lng::float8) <= p_ban_kinh_m
  )
  select jsonb_build_object(
    'dang_rao', coalesce((select jsonb_agg(to_jsonb(x) - 'updated_at' - 'cung_loi_vao' - 'status')
                            from (select * from ung where status in ('dang_ban', 'dang_quan_tam')
                                   order by cung_loi_vao desc, m limit p_toi_da) x), '[]'::jsonb),
    'don_gia', (select jsonb_build_object('n', count(*), 'min', min(price_per_m2_vnd), 'max', max(price_per_m2_vnd),
                                          'trung_vi', round(percentile_cont(0.5) within group (order by price_per_m2_vnd)))
                  from ung where status in ('dang_ban', 'dang_quan_tam')),
    'da_giao_dich', coalesce((select jsonb_agg(to_jsonb(x) - 'updated_at' - 'cung_loi_vao')
                                from (select * from ung where status in ('da_coc', 'da_chot') and updated_at > now() - interval '180 days'
                                       order by m limit p_toi_da) x), '[]'::jsonb)
  )
$function$;

revoke all on function public.can_dang_rao_gan(uuid, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.can_dang_rao_gan(uuid, integer, integer, boolean) to service_role;
