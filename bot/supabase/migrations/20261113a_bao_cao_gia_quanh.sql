-- SRS-5.1zzzzzzz455 (13/11/2026) — LQC 4.6 "Em có báo cáo giá khu vực anh, làm miễn phí cho anh" (đặc tả anh Luận).
-- Chủ dự án 13/11: "dựa trên giá rao cũng dc, tạm để test vậy đi". Báo cáo cho MỘT căn: căn cùng giao dịch + cùng loại trong bán kính
-- (mặc định 3 km, như can_dang_rao_gan), dải đơn giá rao (p25 / trung vị / p75), theo lối vào, vị trí giá của căn, căn đang rao gần nhất,
-- căn gần đó đã cọc / đã chốt 180 ngày (chỉ GIÁ RAO lúc đó — giá chốt ở bảng deals là chuyện riêng hai bên, không lên trang công khai).
-- Không trả số nhà, người bán, mô tả. Gọi được bằng khoá công khai (trang web /bao-cao-gia/<mã>), chỉ cho căn đang hiện trên web.
create or replace function public.bao_cao_gia_quanh(p_code text, p_ban_kinh_m integer default 3000)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with g as (
    select id, code, deal, property_type, lat::float8 as lat, lng::float8 as lng, access_type, price_vnd, price_per_m2_vnd, area_m2,
           street, ward, district, floors
      from listings
     where code = upper(p_code) and status in ('dang_ban', 'dang_quan_tam', 'da_coc') and lat is not null and lng is not null
     limit 1
  ), ung as (
    select l.code, l.street, l.ward, l.area_m2, l.price_vnd, l.price_per_m2_vnd, l.access_type, l.floors, l.status, l.updated_at,
           round(khoang_cach_m(g.lat, g.lng, l.lat::float8, l.lng::float8))::int as m
      from listings l, g
     where l.id <> g.id and l.deal = g.deal and l.property_type = g.property_type
       and l.lat is not null and l.lng is not null and l.price_per_m2_vnd is not null
       and khoang_cach_m(g.lat, g.lng, l.lat::float8, l.lng::float8) <= greatest(500, least(p_ban_kinh_m, 10000))
  ), rao as (
    select * from ung where status in ('dang_ban', 'dang_quan_tam')
  )
  select case when not exists (select 1 from g) then null else jsonb_build_object(
    'can', (select jsonb_build_object('code', code, 'deal', deal, 'property_type', property_type, 'access_type', access_type,
                                      'price_vnd', price_vnd, 'price_per_m2_vnd', price_per_m2_vnd, 'area_m2', area_m2,
                                      'street', street, 'ward', ward, 'district', district, 'floors', floors) from g),
    'ban_kinh_m', greatest(500, least(p_ban_kinh_m, 10000)),
    'cap_nhat', now(),
    'tong', (select jsonb_build_object('n', count(*), 'min', min(price_per_m2_vnd), 'max', max(price_per_m2_vnd),
                                       'p25', round(percentile_cont(0.25) within group (order by price_per_m2_vnd)),
                                       'p50', round(percentile_cont(0.5) within group (order by price_per_m2_vnd)),
                                       'p75', round(percentile_cont(0.75) within group (order by price_per_m2_vnd)),
                                       'gia_min', min(price_vnd), 'gia_max', max(price_vnd))
               from rao),
    'theo_loi_vao', coalesce((select jsonb_agg(x order by (x->>'n')::int desc)
                                from (select jsonb_build_object('access_type', access_type, 'n', count(*),
                                                                'p50', round(percentile_cont(0.5) within group (order by price_per_m2_vnd)),
                                                                'min', min(price_per_m2_vnd), 'max', max(price_per_m2_vnd)) as x
                                        from rao group by access_type) s), '[]'::jsonb),
    -- Vị trí giá chỉ so với căn CÙNG lối vào (mặt tiền với mặt tiền, hẻm với hẻm — như muc_lech SRS-429), cần ≥ 3 căn; chưa đủ → null.
    'vi_tri', (select case when count(*) < 3 or (select price_per_m2_vnd from g) is null then null
                           else round(100.0 * count(*) filter (where r.price_per_m2_vnd < (select price_per_m2_vnd from g)) / count(*)) end
                 from rao r where r.access_type is not distinct from (select access_type from g)),
    'n_cung_loi_vao', (select count(*) from rao r where r.access_type is not distinct from (select access_type from g)),
    'dang_rao', coalesce((select jsonb_agg(to_jsonb(x) order by x.m)
                            from (select code, street, ward, area_m2, price_vnd, price_per_m2_vnd, access_type, floors, m
                                    from rao order by m limit 12) x), '[]'::jsonb),
    'da_giao_dich', coalesce((select jsonb_agg(to_jsonb(x) order by x.m)
                                from (select code, street, ward, area_m2, price_vnd, price_per_m2_vnd, access_type, floors, status, m
                                        from ung where status in ('da_coc', 'da_chot') and updated_at > now() - interval '180 days'
                                       order by m limit 10) x), '[]'::jsonb)
  ) end
$function$;

grant execute on function public.bao_cao_gia_quanh(text, integer) to anon, authenticated, service_role;
