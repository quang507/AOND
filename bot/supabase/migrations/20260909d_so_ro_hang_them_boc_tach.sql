-- 20260909d — so.ro_hang thêm cột boc_tach (09/09/2026)
--
-- Chủ dự án mở Table Editor ở schema `so` để đọc rổ hàng, muốn thấy luôn JSON
-- bóc tách (FR-177 h) mà không phải đổi sang `public.listings`. View chỉ cho
-- thêm cột ở ĐUÔI, nên boc_tach đứng sau `gap`; các cột trước giữ nguyên thứ tự.
-- Bản trên web là /admin/ro-hang/json (FR-175 c).
create or replace view so.ro_hang
  with (security_invoker = true) as
select
  l.legacy_sst                                            as stt,
  case l.deal when 'ban' then 'Bán' else 'Cho thuê' end   as ban_hay_thue,
  regexp_replace(
    regexp_replace(trim(l.location_raw), E'\r?\n', ' — ', 'g'),
    E'(,\s*Quận 5)?,\s*(tp\.?|thành phố)?\s*Hồ Chí Minh\.?\s*$', '', 'i')
                                                          as vi_tri,
  replace(l.area_m2::text, '.', ',') || ' m²'             as dien_tich,
  coalesce(l.price_raw,
           replace(round(l.price_vnd::numeric / 1e9, 2)::text, '.', ',') || ' tỷ')
                                                          as gia,
  regexp_replace(
    regexp_replace(trim(both E' \r\n\t' from l.description),
                   E'\s*\r?\n\s*[-•+*]?\s*', ' · ', 'g'),
    E'^[-•+*]\s*', '')                                    as mo_ta,
  s.phone                                                 as so_dien_thoai,
  s.name                                                  as nguoi_ban,
  l.code                                                  as ma_tin,
  case l.property_type
    when 'nha_pho'   then 'nhà phố'   when 'nha_cap4'  then 'nhà cấp 4'
    when 'chung_cu'  then 'chung cư'  when 'dat'       then 'đất'
    when 'biet_thu'  then 'biệt thự'  when 'phong_tro' then 'phòng trọ'
    when 'mat_bang'  then 'mặt bằng'  else 'chưa rõ' end  as loai,
  case l.status
    when 'cho_thong_tin' then 'chờ thông tin' when 'dang_ban'      then 'đang bán'
    when 'dang_quan_tam' then 'đang quan tâm' when 'da_chot'       then 'đã chốt'
    when 'an'            then 'ẩn'            else l.status end     as trang_thai,
  (select count(*) from public.media m where m.listing_id = l.id)
  + (select count(*) from public.listing_media lm where lm.listing_id = l.id)
                                                          as so_anh,
  'https://nhadat.cc/nha-dat/' || l.code                  as link_web,
  l.source_url                                            as nguon,
  l.created_at::date                                      as ngay_vao,
  l.id,
  case l.gap when true then 'gấp' when false then 'không gấp' else '' end as gap,
  l.boc_tach                                              as boc_tach
from public.listings l
left join public.sellers s on s.id = l.seller_id
order by l.legacy_sst nulls last, l.created_at;

comment on column so.ro_hang.boc_tach is
  'FR-177 h: JSON bóc tách (câu rao + mọi fact chủ nhà trả lời, không có khoá null). Ruột ở public.listings.boc_tach; bản web /admin/ro-hang/json.';
