-- 20261029a — `tim_nha` cộng điểm SỐ TẦNG khách muốn (SRS-5.1zzzzzzz262, chủ dự án 29/10/2026: "tìm nhà có 4 tầng … tìm trường phù hợp với code có
-- sẵn"). Cột `listings.floors` (tính cả trệt, không tính lửng — `parse_ket_cau`, 20261012b) đã có, chỉ chưa dùng khi tìm. Thêm `p_tang_min integer`:
-- căn có floors ≥ p_tang_min cộng 1 điểm (như phòng ngủ), `ly_do` ghi "đủ số tầng"; căn ít tầng / chưa rõ số tầng không bị loại — lõi ghi
-- "ÍT tầng hơn" / "CHƯA RÕ số tầng" (mua.danh_dau_lech) để bot nói thẳng. `can` thêm `floors`. Đổi chữ ký → drop bản cũ trước (PGRST203).
drop function if exists public.tim_nha(text, text, bigint, text, numeric, integer, boolean, double precision[], integer, text[]);

create or replace function public.tim_nha(p_deal text, p_loai text default null, p_gia_max bigint default null, p_khu text default null,
                                          p_dt_min numeric default null, p_pn_min integer default null, p_xe_hoi boolean default false,
                                          p_vec double precision[] default null, p_limit integer default 3, p_tien_ich text[] default null,
                                          p_tang_min integer default null)
 returns table(can jsonb, diem numeric, ly_do text)
 language sql
 stable security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with chon as (
    select l.*,
      case when nullif(btrim(p_khu), '') is not null
                and (l.ward ilike '%' || btrim(p_khu) || '%' or l.district ilike '%' || btrim(p_khu) || '%'
                     or l.street ilike '%' || btrim(p_khu) || '%') then 3 else 0 end as d_khu,
      case when p_dt_min is not null and l.area_m2 >= p_dt_min then 1 else 0 end as d_dt,
      case when p_pn_min is not null and l.bedrooms >= p_pn_min then 1 else 0 end as d_pn,
      case when p_tang_min is not null and l.floors >= p_tang_min then 1 else 0 end as d_tang,
      case when coalesce(p_xe_hoi, false)
                and (l.access_type::text in ('mat_tien', 'hem_xe_tai', 'hem_xe_hoi') or coalesce(l.car_in_house, false)) then 2 else 0 end as d_xe,
      case when p_vec is not null and l.nhung is not null
           then greatest(0, 1 - (l.nhung <=> (p_vec::extensions.halfvec(768)))) * 4 else 0 end as d_vec,
      case when p_tien_ich is not null and jsonb_typeof(l.tien_ich_gan) = 'array'
           then (select count(*) from jsonb_array_elements(l.tien_ich_gan) t
                  where t->>'loai' = any(p_tien_ich) and coalesce((t->>'m')::numeric, 99999) <= 1000) * 2
           else 0 end as d_ti
      from public.listings l
     where l.status in ('dang_ban', 'dang_quan_tam', 'da_coc')
       and l.deal::text = p_deal
       and (p_loai is null or l.property_type::text = p_loai)
       and (p_gia_max is null or l.price_vnd <= p_gia_max)
  )
  select jsonb_build_object(
           'id', c.id, 'code', c.code, 'property_type', c.property_type, 'deal', c.deal, 'street', c.street, 'ward', c.ward,
           'district', c.district, 'area_m2', c.area_m2, 'price_raw', c.price_raw, 'price_vnd', c.price_vnd, 'bedrooms', c.bedrooms,
           'floors', c.floors, 'floors_text', c.floors_text, 'legal_status', c.legal_status, 'direction', c.direction,
           'access_type', c.access_type, 'alley_width_m', c.alley_width_m, 'status', c.status, 'tien_ich_gan', c.tien_ich_gan,
           'chinh_chu', (select s.seller_type = 'ccrb' from public.sellers s where s.id = c.seller_id)) as can,
         (c.d_khu + c.d_dt + c.d_pn + c.d_tang + c.d_xe + c.d_vec + c.d_ti)::numeric as diem,
         nullif(concat_ws('; ',
           case when c.d_khu > 0 then 'đúng khu vực khách chọn'
                when nullif(btrim(p_khu), '') is not null then 'KHÁC khu vực khách chọn' end,
           case when c.d_xe > 0 then 'xe hơi vào được' end,
           case when c.d_dt > 0 then 'đủ diện tích' end,
           case when c.d_pn > 0 then 'đủ phòng ngủ' end,
           case when c.d_tang > 0 then 'đủ số tầng' end,
           case when c.d_ti > 0 then
             (select string_agg('gần ' || (t->>'ten') || ' ~' || (t->>'m') || ' m', ', ' order by (t->>'m')::numeric)
                from jsonb_array_elements(c.tien_ich_gan) t
               where t->>'loai' = any(p_tien_ich) and coalesce((t->>'m')::numeric, 99999) <= 1000) end), '') as ly_do
    from chon c
   order by (c.d_khu + c.d_dt + c.d_pn + c.d_tang + c.d_xe + c.d_vec + c.d_ti) desc, c.updated_at desc
   limit greatest(1, least(coalesce(p_limit, 3), 10));
$function$;
revoke all on function public.tim_nha(text, text, bigint, text, numeric, integer, boolean, double precision[], integer, text[], integer) from public, anon, authenticated;
grant execute on function public.tim_nha(text, text, bigint, text, numeric, integer, boolean, double precision[], integer, text[], integer) to service_role;
comment on function public.tim_nha(text, text, bigint, text, numeric, integer, boolean, double precision[], integer, text[], integer) is
  '[RỔ HÀNG] Tìm căn cho khách mua (SRS-5.1zzzzzzz138): lọc cứng giao dịch / loại / giá; cộng điểm khu vực, diện tích, phòng ngủ, xe hơi, vector nhu cầu, tiện ích quanh căn (20261025g: p_tien_ich ≤ 1 km) và từ 20261029a số tầng (p_tang_min, cột floors tính cả trệt). Mỗi căn kèm ly_do từ cột thật; can có floors + tien_ich_gan + chinh_chu.';
