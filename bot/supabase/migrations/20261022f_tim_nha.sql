-- 20261022f: công cụ tìm nhà cho bot (SRS-5.1zzzzzzz138, 22/10/2026).
-- Chủ dự án: "làm công cụ tìm nhà cho bot, lưu db sao cho bot dễ tìm nhất, tìm tốn ít quota nhất, ít hơn càng tốt".
-- MỘT hàm, không bảng mới, dùng cột vector `listings.nhung` đã có. Lọc cứng CHỈ: trạng thái đang hiện, bán / thuê, loại, giá ≤ ngân sách.
-- Mọi điều kiện khác (khu vực, diện tích, phòng ngủ, xe hơi) CHỈ TÍNH ĐIỂM, không loại căn; vector (nếu có) cộng điểm theo độ gần nghĩa.
-- Trả mỗi căn kèm `ly_do` ghép từ dữ liệu thật (không có vector trong lý do) — căn không khớp khu vực thì ghi rõ "KHÁC khu vực khách chọn".
-- Chỉ service_role gọi (lõi Python). Tin ít (hàng trăm) nên quét thẳng; khi quá vài nghìn tin thì thêm bước lấy ứng viên bằng chỉ mục vector.

create or replace function public.tim_nha(
  p_deal     text,
  p_loai     text    default null,
  p_gia_max  bigint  default null,
  p_khu      text    default null,
  p_dt_min   numeric default null,
  p_pn_min   integer default null,
  p_xe_hoi   boolean default false,
  p_vec      double precision[] default null,
  p_limit    integer default 3
) returns table(can jsonb, diem numeric, ly_do text)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with chon as (
    select l.*,
      case when nullif(btrim(p_khu), '') is not null
                and (l.ward ilike '%' || btrim(p_khu) || '%' or l.district ilike '%' || btrim(p_khu) || '%'
                     or l.street ilike '%' || btrim(p_khu) || '%') then 3 else 0 end as d_khu,
      case when p_dt_min is not null and l.area_m2 >= p_dt_min then 1 else 0 end as d_dt,
      case when p_pn_min is not null and l.bedrooms >= p_pn_min then 1 else 0 end as d_pn,
      case when coalesce(p_xe_hoi, false)
                and (l.access_type::text in ('mat_tien', 'hem_xe_tai', 'hem_xe_hoi') or coalesce(l.car_in_house, false)) then 2 else 0 end as d_xe,
      case when p_vec is not null and l.nhung is not null
           then greatest(0, 1 - (l.nhung <=> (p_vec::extensions.halfvec(768)))) * 4 else 0 end as d_vec
      from public.listings l
     where l.status in ('dang_ban', 'dang_quan_tam', 'da_coc')
       and l.deal::text = p_deal
       and (p_loai is null or l.property_type::text = p_loai)
       and (p_gia_max is null or l.price_vnd <= p_gia_max)
  )
  select jsonb_build_object(
           'id', c.id, 'code', c.code, 'property_type', c.property_type, 'deal', c.deal, 'street', c.street, 'ward', c.ward,
           'district', c.district, 'area_m2', c.area_m2, 'price_raw', c.price_raw, 'price_vnd', c.price_vnd, 'bedrooms', c.bedrooms,
           'floors_text', c.floors_text, 'legal_status', c.legal_status, 'direction', c.direction, 'access_type', c.access_type,
           'alley_width_m', c.alley_width_m, 'status', c.status) as can,
         (c.d_khu + c.d_dt + c.d_pn + c.d_xe + c.d_vec)::numeric as diem,
         nullif(concat_ws('; ',
           case when c.d_khu > 0 then 'đúng khu vực khách chọn'
                when nullif(btrim(p_khu), '') is not null then 'KHÁC khu vực khách chọn' end,
           case when c.d_xe > 0 then 'xe hơi vào được' end,
           case when c.d_dt > 0 then 'đủ diện tích' end,
           case when c.d_pn > 0 then 'đủ phòng ngủ' end), '') as ly_do
    from chon c
   order by (c.d_khu + c.d_dt + c.d_pn + c.d_xe + c.d_vec) desc, c.updated_at desc
   limit greatest(1, least(coalesce(p_limit, 3), 10));
$function$;

revoke all on function public.tim_nha(text, text, bigint, text, numeric, integer, boolean, double precision[], integer) from public, anon, authenticated;
grant execute on function public.tim_nha(text, text, bigint, text, numeric, integer, boolean, double precision[], integer) to service_role;

comment on function public.tim_nha(text, text, bigint, text, numeric, integer, boolean, double precision[], integer) is
  '[BOT & HÀNG ĐỢI] Công cụ tìm nhà cho bot mua: lọc cứng bán/thuê + loại + giá, điểm mềm khu vực / diện tích / phòng ngủ / xe hơi + vector. Chỉ service_role.';
