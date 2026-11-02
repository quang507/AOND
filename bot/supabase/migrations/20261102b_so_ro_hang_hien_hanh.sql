-- 20261102b_so_ro_hang_hien_hanh — định nghĩa HIỆN HÀNH của `so.ro_hang`, một chỗ cho cả production lẫn dựng lại từ số không (02/11/2026).
-- (1) 20261102a định nghĩa lại view bằng `create or replace view` KHÔNG ghi `with (...)` — Postgres thay toàn bộ tuỳ chọn view
--     nên mất `security_invoker = true` (20261022g đặt). Chưa lộ (anon / authenticated đã revoke, `so` không ra API), gắn lại ở đây.
-- (2) `scripts/dung-lai-db.mjs` dựng `so` bằng 20260907c / 20260907f — hai bản `so.ro_hang` đó đọc `public.media` (gỡ 20261102a) và
--     `listings.legacy_sst` / `source_url` (gỡ 20261022g) nên hỏng trên schema.sql hiện tại. Script nay bỏ các câu `so.ro_hang` của
--     hai file đó và chạy file này sau cùng. Không sửa migration cũ. Đổi `so.ro_hang` về sau: sửa thẳng file này bằng migration mới
--     cùng khuôn (ghi `with (security_invoker = true)`), và trỏ `dung-lai-db.mjs` sang file mới.
begin;

create or replace view so.ro_hang with (security_invoker = true) as
 SELECT row_number() OVER (ORDER BY l.created_at, l.id)::integer AS stt,
        CASE l.deal
            WHEN 'ban'::listing_deal THEN 'Bán'::text
            ELSE 'Cho thuê'::text
        END AS ban_hay_thue,
    regexp_replace(regexp_replace(TRIM(BOTH FROM l.location_raw), '\r?\n'::text, ' — '::text, 'g'::text), '(,\s*Quận 5)?,\s*(tp\.?|thành phố)?\s*Hồ Chí Minh\.?\s*$'::text, ''::text, 'i'::text) AS vi_tri,
    replace(l.area_m2::text, '.'::text, ','::text) || ' m²'::text AS dien_tich,
    COALESCE(l.price_raw, replace(round(l.price_vnd::numeric / '1000000000'::numeric, 2)::text, '.'::text, ','::text) || ' tỷ'::text) AS gia,
    regexp_replace(regexp_replace(TRIM(BOTH E' \r\n\t'::text FROM l.description), '\s*\r?\n\s*[-•+*]?\s*'::text, ' · '::text, 'g'::text), '^[-•+*]\s*'::text, ''::text) AS mo_ta,
    s.phone AS so_dien_thoai,
    s.name AS nguoi_ban,
    l.code AS ma_tin,
        CASE l.property_type
            WHEN 'nha_pho'::property_type THEN 'nhà phố'::text
            WHEN 'nha_cap4'::property_type THEN 'nhà cấp 4'::text
            WHEN 'chung_cu'::property_type THEN 'chung cư'::text
            WHEN 'dat'::property_type THEN 'đất'::text
            WHEN 'biet_thu'::property_type THEN 'biệt thự'::text
            WHEN 'phong_tro'::property_type THEN 'phòng trọ'::text
            WHEN 'mat_bang'::property_type THEN 'mặt bằng'::text
            ELSE 'chưa rõ'::text
        END AS loai,
        CASE l.status
            WHEN 'cho_thong_tin'::text THEN 'chờ thông tin'::text
            WHEN 'dang_ban'::text THEN 'đang bán'::text
            WHEN 'dang_quan_tam'::text THEN 'đang quan tâm'::text
            WHEN 'da_coc'::text THEN 'đã cọc'::text
            WHEN 'da_chot'::text THEN 'đã chốt'::text
            WHEN 'an'::text THEN 'ẩn'::text
            ELSE l.status
        END AS trang_thai,
    ( SELECT count(*) AS count
           FROM listing_media lm
          WHERE lm.listing_id = l.id) AS so_anh,
    'https://nhadat.cc/nha-dat/'::text || l.code AS link_web,
    l.source AS nguon,
    l.created_at::date AS ngay_vao,
    l.id
   FROM listings l
     LEFT JOIN sellers s ON s.id = l.seller_id
  ORDER BY l.created_at;
comment on view so.ro_hang is '[SỔ] Rổ hàng nhìn như masterDB/nhà Q5.xlsx: 9 cột đầu đúng thứ tự sheet (stt · bán hay thuê · vị trí · diện tích · giá · mô tả · SĐT · người bán), cột thêm xếp sau. Cả bán lẫn cho thuê. so_dien_thoai là SĐT NGƯỜI BÁN đã ký, không phải SĐT theo tin như Excel. so_anh đếm listing_media (bảng media cũ gỡ 02/11/2026). Chỉ đọc; sửa thì sửa public.listings.';

revoke all on so.ro_hang from public, anon, authenticated;
grant select on so.ro_hang to postgres, service_role;

commit;
