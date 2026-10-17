-- 20260907f — so.ro_hang: mỗi ô một dòng, bỏ chữ thừa.
--
-- VÌ SAO. Chủ dự án mở schema `so` (20260907c) vẫn thấy "khó đọc quá". Soi
-- dữ liệu thật 07/09 (174 tin) thấy ba thứ làm rối mắt trong Table Editor:
--   · `mo_ta`: 163/174 câu rao có xuống dòng CRLF, 103 câu là danh sách "- ".
--     Ô Table Editor không ngắt dòng, nên cả đoạn dồn thành một vệt có ký tự
--     lạ; trung bình 392 ký tự, dài nhất 1284.
--   · `vi_tri`: 146/174 kết bằng ", Hồ Chí Minh", 123 bằng ", Quận 5, Hồ Chí
--     Minh" — cả rổ đều Quận 5 (`district` 174/174), đuôi đó không nói gì
--     thêm mà chiếm nửa cột.
--   · `dien_tich`: 31 tin diện tích lẻ hiện "92.9 m²" — dấu chấm kiểu máy,
--     sheet Excel gốc ghi "92,9".
--
-- CÁCH LÀM. Chỉ đổi cách TRÌNH BÀY ba cột đó, giữ nguyên tên/kiểu/thứ tự cột
-- (nên `create or replace` được, chú thích cột giữ nguyên). Nguyên văn vẫn ở
-- `public.listings` — đây là kính nhìn, không phải dữ liệu.
--   · mo_ta: gộp xuống dòng thành " · ", bỏ dấu gạch đầu dòng; cắt khoảng
--     trắng hai đầu. `trim(both E' \r\n\t')` viết MỘT gạch chéo: đó là bộ ký
--     tự thật, không phải regex — hai gạch thì nó cắt chữ r/n/t ở đầu và cuối
--     câu rao (bản áp đầu 07/09 mắc đúng lỗi này, sửa ngay bằng SQL).
--   · vi_tri: bỏ đuôi ", Quận 5, Hồ Chí Minh" / ", Tp Hồ Chí Minh" / ", Hồ Chí
--     Minh." (không phân biệt hoa thường, chấm cuối). 8 tin câu rao
--     ghi "Quận 8" thì CÒN chữ "Quận 8" — cố ý, để mắt người thấy tin lệch
--     quận (district ghi Quận 5 mà địa chỉ nói Quận 8: việc dữ liệu, không
--     phải việc của view này).
--   · dien_tich: dấu phẩy thập phân.
--
-- AN TOÀN. Quyền không đổi: `security_invoker = true`, chỉ postgres và
-- service_role đọc (đã revoke anon/authenticated ở 20260907c; `create or
-- replace` không đụng ACL). Vẫn ngoài vùng `xuat_schema()` quét — dựng lại từ
-- số không phải chạy 20260907c rồi file này (bot/README.md §Phục hồi).

create or replace view so.ro_hang
  with (security_invoker = true) as
select
  l.legacy_sst                                            as stt,
  case l.deal when 'ban' then 'Bán' else 'Cho thuê' end   as ban_hay_thue,
  regexp_replace(
    regexp_replace(trim(l.location_raw), E'\\r?\\n', ' — ', 'g'),
    E'(,\\s*Quận 5)?,\\s*(tp\\.?|thành phố)?\\s*Hồ Chí Minh\\.?\\s*$', '', 'i')
                                                          as vi_tri,
  replace(l.area_m2::text, '.', ',') || ' m²'             as dien_tich,
  coalesce(l.price_raw,
           replace(round(l.price_vnd::numeric / 1e9, 2)::text, '.', ',') || ' tỷ')
                                                          as gia,
  regexp_replace(
    regexp_replace(trim(both E' \r\n\t' from l.description),
                   E'\\s*\\r?\\n\\s*[-•+*]?\\s*', ' · ', 'g'),
    E'^[-•+*]\\s*', '')                                    as mo_ta,
  s.phone                                                 as so_dien_thoai,
  s.name                                                  as nguoi_ban,
  -- ── cột KHÔNG có trong Excel, để sau cho khỏi rối mắt ──
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
  l.id
from public.listings l
left join public.sellers s on s.id = l.seller_id
order by l.legacy_sst nulls last, l.created_at;

comment on column so.ro_hang.mo_ta is
  'Câu rao gốc, xuống dòng gộp thành " · " và bỏ gạch đầu dòng để ô Table Editor đọc một dòng. Nguyên văn ở public.listings.description.';
comment on column so.ro_hang.vi_tri is
  'location_raw bỏ đuôi ", Quận 5, Hồ Chí Minh" (cả rổ đều Quận 5). Còn chữ "Quận 8" nghĩa là câu rao nói khác district — cố ý để lộ.';
comment on column so.ro_hang.dien_tich is
  'area_m2, dấu phẩy thập phân như sheet Excel gốc.';
