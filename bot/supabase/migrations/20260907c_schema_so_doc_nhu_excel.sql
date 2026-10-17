-- 20260907c — schema `so`: nhìn dữ liệu như nhìn Excel.
--
-- VÌ SAO. Chủ dự án mở Schema Visualizer / Table Editor của schema `public` ra
-- thấy 31 bảng + 17 view + dây nối chằng chịt, "rối quá, khó kiểm soát". Cái anh
-- muốn nhìn là `masterDB/nhà Q5.xlsx`: MỘT sheet, 9 cột — sst · bán hay cho thuê
-- · Vị trí · Diện tích · Giá bán · Mô tả · Số điện thoại · Người bán. `ro_hang_ban`
-- (20260906b) đã dịch nhãn sang tiếng Việt nhưng vẫn nằm lẫn trong `public`,
-- vẫn phải tìm nó giữa 48 cái tên.
--
-- CÁCH LÀM. Một schema riêng tên `so` ("sổ"), chỉ chứa view đọc-người, đặt tên
-- và xếp cột y như sheet Excel. Trong Table Editor chọn schema `so` là thấy
-- đúng 2 "sheet", không thấy ruột bot. `public` giữ nguyên, không đụng một
-- cột nào — đây là kính nhìn, không phải bảng mới.
--
-- AN TOÀN. PostgREST chỉ phơi `public` + `graphql_public` (pgrst.db_schemas
-- mặc định), nên `so` KHÔNG ra API. `pg_default_acl` không có dòng nào cho
-- `so` (chỉ có cho public/storage/auth/graphql), nên view mới ở đây không tự
-- lộ như ở `public` — vẫn revoke tường minh cho chắc. View chứa `sellers.phone`
-- THẬT (Excel cũng có cột đó), nên chỉ `postgres` (Dashboard) và `service_role`
-- đọc được; `security_invoker = true` để không ai mượn view này leo quyền.
--
-- GIỚI HẠN. `xuat_schema()` (20260905a) chỉ quét `public`, nên `so` KHÔNG nằm
-- trong `bot/supabase/schema.sql`. Dựng lại từ số không thì chạy schema.sql
-- rồi chạy thêm file này (đã ghi ở bot/README.md §Phục hồi từ số không). Mất
-- `so` không mất dữ liệu — nó chỉ là view.
--
-- KHÁC EXCEL Ở ĐÂU (ghi thẳng để không ai đi tìm):
--   · Cột "Số điện thoại" trong Excel là SĐT của TỪNG tin (chủ nhà / môi giới
--     đăng). DB không giữ SĐT theo tin — mô tả đã lọc sạch (FR-104, kiểm
--     07/09: 0/173 mô tả còn SĐT). Chỉ 60/173 tin gắn `seller_id` (3 NMG), nên
--     cột `so_dien_thoai` ở đây là SĐT NGƯỜI BÁN đã ký, 113 tin còn lại trống.
--     Muốn đủ như Excel thì phải nhập cột SĐT của masterDB vào `sellers` — đó
--     là việc dữ liệu, không phải việc của view này.
--   · "Giá bán" lấy `price_raw` nguyên văn ('50,5 tỷ'); thiếu thì quy từ
--     `price_vnd`.

create schema if not exists so;
comment on schema so is
  '[SỔ] Kính nhìn dữ liệu như Excel: chỉ view đọc-người, không bảng, không ghi. Mở Table Editor → chọn schema "so". Ruột bot ở public. Không ra API (PostgREST không phơi schema này). 20260907c.';

revoke all on schema so from public, anon, authenticated;
grant usage on schema so to postgres, service_role;

-- ── Sheet 1: rổ hàng — 9 cột đầu đúng thứ tự Excel, cột thêm nằm sau ──────
create or replace view so.ro_hang
  with (security_invoker = true) as
select
  l.legacy_sst                                            as stt,
  case l.deal when 'ban' then 'Bán' else 'Cho thuê' end   as ban_hay_thue,
  regexp_replace(l.location_raw, E'\\r?\\n', ' — ', 'g')  as vi_tri,
  l.area_m2 || ' m²'                                      as dien_tich,
  coalesce(l.price_raw,
           replace(round(l.price_vnd::numeric / 1e9, 2)::text, '.', ',') || ' tỷ')
                                                          as gia,
  l.description                                           as mo_ta,
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

revoke all on so.ro_hang from anon, authenticated;
grant select on so.ro_hang to postgres, service_role;

comment on view so.ro_hang is
  '[SỔ] Rổ hàng nhìn như masterDB/nhà Q5.xlsx: 9 cột đầu đúng thứ tự sheet (stt · bán hay thuê · vị trí · diện tích · giá · mô tả · SĐT · người bán), cột thêm xếp sau. Cả bán lẫn cho thuê (ro_hang_ban ở public chỉ có bán). so_dien_thoai là SĐT NGƯỜI BÁN đã ký (60/173 tin), không phải SĐT theo tin như Excel. Chỉ đọc; sửa thì sửa public.listings.';
comment on column so.ro_hang.stt is 'legacy_sst — đúng số thứ tự trong Excel gốc, để dò ngược.';
comment on column so.ro_hang.so_dien_thoai is 'sellers.phone THẬT. Không ra API, không ra web. Trống = tin chưa gắn người bán.';
comment on column so.ro_hang.gia is 'price_raw nguyên văn Excel; trống thì quy từ price_vnd.';
comment on column so.ro_hang.so_anh is 'media (lối cũ, file ngoài Supabase) + listing_media (lối mới, FR-165).';

-- ── Sheet 2: người bán — thay cho pivot "Count of sst" theo SĐT ─────────────
create or replace view so.nguoi_ban
  with (security_invoker = true) as
select
  s.name                                                  as ten,
  s.phone                                                 as so_dien_thoai,
  s.phone_proxy                                           as sdt_proxy,
  case s.seller_type::text when 'nmg' then 'NMG (môi giới)' else 'CCRB (chính chủ)' end
                                                          as vai,
  count(l.id)                                             as so_tin,
  count(l.id) filter (where l.status in ('dang_ban', 'dang_quan_tam'))
                                                          as dang_ban,
  count(l.id) filter (where l.status = 'da_chot')         as da_chot,
  case when s.rating_count > 0
       then round(s.rating_sum::numeric / s.rating_count, 1) end
                                                          as diem,
  s.zalo_user_id is not null                              as co_zalo,
  s.created_at::date                                      as ngay_tao,
  s.id
from public.sellers s
left join public.listings l on l.seller_id = s.id
group by s.id
order by so_tin desc, s.name;

revoke all on so.nguoi_ban from anon, authenticated;
grant select on so.nguoi_ban to postgres, service_role;

comment on view so.nguoi_ban is
  '[SỔ] Mỗi người bán một dòng, đếm tin — thay cho sheet pivot "Count of sst" trong Excel. SĐT thật, chỉ postgres/service_role đọc. Chỉ đọc; sửa thì sửa public.sellers.';
