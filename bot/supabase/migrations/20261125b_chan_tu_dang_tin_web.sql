-- 25/11/2026 (audit ECC P1-1 / P1-2 / P1-3 / P1-4, SRS-5.1zzzzzzz539). Chủ dự án 25/11: "Sửa tiếp P1".
-- P1-1: ai có email cũng đăng nhập web, `/quan-ly` tự tạo hồ sơ người bán, rồi `listings_own_insert` cho chèn tin với MỌI cột
--   (price_source = 'admin_xac_minh' giả nhãn xác minh, legacy_code / code tuỳ ý, can_kiem_chung, nhung…) — đủ giá + diện tích
--   + phường là trigger tự đưa lên web, không ai duyệt. Sửa: bỏ quyền INSERT thẳng của authenticated trên listings / sellers;
--   web đi qua `ho_so_web()` (chỉ ghi auth_user_id) và `dang_tin_web(...)` (chỉ ghi câu rao / phường / quận / giá, source 'web',
--   mã do trigger cấp). Người chưa kích hoạt mã môi giới → `can_chu_duyet = true`: tin nằm "chờ duyệt" tới khi admin bấm "rao"
--   (nút sẵn có ở /admin/ro-hang, đặt can_chu_duyet = false). Môi giới đã kích hoạt (`ma_moi_gioi`) giữ luật FR-139 tự lên web.
--   Trần 20 tin / ngày / người.
-- P1-2: `next_listing_code` ép đuôi số `::int` — một mã tự đặt kiểu `BDS-NP-Q5-99999999999` làm mọi tin mới cùng tiền tố lỗi
--   `integer out of range` (lõi lưu cả rổ trong một lần nên các căn sau cũng mất). Sửa: chỉ đọc đuôi 1–9 chữ số; web hết tự đặt mã.
-- P1-3: `boc_tach_nhom(listings)` SECURITY DEFINER không cổng quyền, view `boc_tach_v` (security_invoker) gọi nó cho mọi tin công
--   khai → user web đọc tên người rao, toạ độ, đường dẫn tệp giấy tờ riêng. Sửa: anon / authenticated không phải admin → null
--   (service_role, admin, phiên postgres như Table Editor / so.boc_tach giữ nguyên).
-- P1-4: `/quan-ly` ghi seller `seller_type = 'nmg'`, tên = phần trước @ email → view công khai `agents_public` lộ tên đó, đếm sai
--   số môi giới. Sửa: hồ sơ web tạo ở `unknown`, không tên (noi_moi_gioi đặt nmg + họ tên đăng ký khi kích hoạt); view chỉ hiện
--   môi giới có `ma_moi_gioi`.
-- Dữ liệu lúc áp (25/11): 0 hồ sơ người bán web, 0 tin web, 0 dòng agents_public, 0 mã đuôi ≥ 10 chữ số — không dòng nào phải sửa.

-- P1-1 / P1-4 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.ho_so_web()
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Chưa đăng nhập.' using errcode = '42501';
  end if;
  select id into v_id from sellers where auth_user_id = v_uid;
  if v_id is null then
    insert into sellers (auth_user_id) values (v_uid)
    on conflict (auth_user_id) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from sellers where auth_user_id = v_uid;
    end if;
  end if;
  return v_id;
end $function$;
comment on function public.ho_so_web() is
  'Hồ sơ người bán của tài khoản web đang đăng nhập (tạo nếu chưa có): chỉ ghi auth_user_id — loại unknown, không tên; kích hoạt môi giới (noi_moi_gioi) mới đặt nmg + họ tên (SRS-5.1zzzzzzz539, audit ECC P1-4).';
revoke all on function public.ho_so_web() from public, anon, authenticated;
grant execute on function public.ho_so_web() to authenticated, service_role;

create or replace function public.dang_tin_web(p_mo_ta text, p_phuong text, p_quan text, p_gia text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_mo_ta text := btrim(coalesce(p_mo_ta, ''));
  v_seller uuid;
  v_ma text;
  v_hom_nay int;
  l listings;
begin
  if v_uid is null then
    raise exception 'Chưa đăng nhập.' using errcode = '42501';
  end if;
  select id, ma_moi_gioi into v_seller, v_ma from sellers where auth_user_id = v_uid;
  if v_seller is null then
    raise exception 'Tài khoản chưa có hồ sơ người bán — tải lại trang giúp em.' using errcode = 'P0002';
  end if;
  if length(v_mo_ta) < 15 or length(v_mo_ta) > 3000 then
    raise exception 'Câu rao cần từ 15 đến 3000 ký tự.' using errcode = '22023';
  end if;
  if length(coalesce(p_phuong, '')) > 100 or length(coalesce(p_quan, '')) > 100 or length(coalesce(p_gia, '')) > 100 then
    raise exception 'Phường, quận, giá mỗi ô tối đa 100 ký tự.' using errcode = '22023';
  end if;
  select count(*) into v_hom_nay from listings where seller_id = v_seller and created_at > now() - interval '1 day';
  if v_hom_nay >= 20 then
    raise exception 'Mỗi tài khoản đăng tối đa 20 tin một ngày.' using errcode = '53400';
  end if;
  insert into listings (seller_id, deal, district, ward, description, price_raw, status, source, can_chu_duyet)
  values (v_seller, 'ban', nullif(btrim(p_quan), ''), nullif(btrim(p_phuong), ''), v_mo_ta, nullif(btrim(p_gia), ''),
          'cho_thong_tin', 'web', v_ma is null)
  returning * into l;
  return jsonb_build_object(
    'id', l.id, 'code', l.code, 'deal', l.deal, 'district', l.district, 'ward', l.ward, 'location_raw', l.location_raw,
    'price_raw', l.price_raw, 'price_vnd', l.price_vnd, 'description', l.description, 'status', l.status,
    'can_chu_duyet', l.can_chu_duyet, 'created_at', l.created_at);
end $function$;
comment on function public.dang_tin_web(text, text, text, text) is
  'Đăng tin từ /quan-ly: chỉ ghi câu rao / phường / quận / giá, source web, mã do trigger cấp; chưa kích hoạt mã môi giới thì chờ admin "rao" (can_chu_duyet). Trần 20 tin/ngày (SRS-5.1zzzzzzz539, audit ECC P1-1).';
revoke all on function public.dang_tin_web(text, text, text, text) from public, anon, authenticated;
grant execute on function public.dang_tin_web(text, text, text, text) to authenticated, service_role;

drop policy if exists listings_own_insert on public.listings;
drop policy if exists sellers_self_insert on public.sellers;
revoke insert on public.listings from authenticated;
revoke insert on public.sellers from authenticated;

-- P1-4: agents_public ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace view public.agents_public with (security_invoker=false) as
 SELECT s.id,
    s.name,
    s.seller_type,
    s.rating_sum,
    s.rating_count,
    ( SELECT count(*) AS count
           FROM listings l
          WHERE l.seller_id = s.id AND (l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text, 'cho_thong_tin'::text]))) AS listing_count,
    seller_rank(s.seller_type, c.active::integer, c.closed::integer, c.total::integer) AS rank,
    c.closed::integer AS closed_count
   FROM sellers s
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text])) AS active,
            count(*) FILTER (WHERE l.status = 'da_chot'::text) AS closed,
            count(*) AS total
           FROM listings l
          WHERE l.seller_id = s.id) c ON true
  WHERE s.seller_type = 'nmg'::seller_type AND s.ma_moi_gioi IS NOT NULL;

-- P1-2: next_listing_code ──────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_listing_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_code text;
begin
  -- Advisory lock, KHONG `lock table`: ham nay chay trong trigger BEFORE INSERT,
  -- luc do transaction da giu ROW EXCLUSIVE tren listings. Xin them
  -- SHARE ROW EXCLUSIVE la nang cap khoa -> hai insert dong thoi deadlock.
  perform pg_advisory_xact_lock(hashtext('listing_code'));

  select 'BDS-Q5-' || lpad(
           (coalesce(max((regexp_match(code, '^BDS-Q5-([0-9]{1,9})$'))[1]::int), 0) + 1)::text,
           4, '0')
    into v_code
    from listings
   where code ~ '^BDS-Q5-[0-9]{1,9}$';

  return v_code;
end $function$
;

CREATE OR REPLACE FUNCTION public.next_listing_code(p_property_type text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_province text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text;
  v_loc text;
  v_so text;
  v_prefix text;
  v_num int;
begin
  perform pg_advisory_xact_lock(hashtext('listing_code'));

  v_type := case lower(coalesce(p_property_type, 'nha_pho'))
    when 'chung_cu' then 'CH'
    when 'can_ho' then 'CH'
    when 'dat' then 'DAT'
    when 'dat_nen' then 'DAT'
    when 'biet_thu' then 'BT'
    when 'nha_cap4' then 'C4'
    when 'mat_bang' then 'MB'
    when 'phong_tro' then 'PT'
    else 'NP'
  end;

  -- 20260917a: chưa rõ quận → 'XX', không còn ép về Q5.
  v_loc := public.bo_dau(coalesce(p_district, p_province, ''));
  v_loc := upper(regexp_replace(v_loc, '[^a-zA-Z0-9]', '', 'g'));

  v_so := (regexp_match(v_loc, '^(?:QUAN|Q)?([0-9]{1,2})$'))[1];
  if v_so is not null then
    v_loc := 'Q' || v_so::int;
  elsif v_loc ~ 'BINHTAN' then v_loc := 'BINHTAN';
  elsif v_loc ~ 'BINHTHANH' then v_loc := 'BINHTHANH';
  elsif v_loc ~ 'TANBINH' then v_loc := 'TANBINH';
  elsif v_loc ~ 'TANPHU' then v_loc := 'TANPHU';
  elsif v_loc ~ 'GOVAP' then v_loc := 'GOVAP';
  elsif v_loc ~ 'THUDUC' then v_loc := 'THUDUC';
  elsif v_loc ~ 'BINHDUONG' then v_loc := 'BINHDUONG';
  elsif v_loc ~ 'TAYNINH' then v_loc := 'TAYNINH';
  elsif v_loc ~ 'DONGNAI' then v_loc := 'DONGNAI';
  elsif v_loc ~ 'LONGAN' then v_loc := 'LONGAN';
  end if;

  if v_loc is null or v_loc = '' then v_loc := 'XX'; end if;

  v_prefix := 'BDS-' || v_type || '-' || v_loc || '-';

  select coalesce(max((regexp_match(code, '^' || v_prefix || '([0-9]{1,9})$'))[1]::int), 0) + 1
    into v_num
    from listings
   where code ~ ('^' || v_prefix || '[0-9]{1,9}$');

  return v_prefix || lpad(v_num::text, 4, '0');
end;
$function$
;

-- P1-3: boc_tach_nhom(listings) ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.boc_tach_nhom(l listings)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f   jsonb;
  bt  jsonb := coalesce(l.boc_tach, '{}'::jsonb);
  anh jsonb;
  bs  jsonb;
  url_chat jsonb;
  s   record;
  d   jsonb;
begin
  if l.id is null then return null; end if;
  -- SRS-5.1zzzzzzz539 (audit ECC P1-3): view boc_tach_v goi ham nay cho moi tin user web doc duoc -- nguoi dung web
  -- khong phai admin khong duoc thay ten nguoi rao, toa do, duong dan tep giay to.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.la_admin() then return null; end if;
  f := public.o_boc_tach(bt);
  bs := '[]'::jsonb;
  url_chat := '[]'::jsonb;
  select coalesce(jsonb_agg(jsonb_build_object(
           'loai', media_type, 'kho', bucket, 'duong_dan', storage_path,
           'nguon', nguon, 'mo_ta', mo_ta, 'ocr', ocr, 'bia', is_cover) order by sort_order), '[]'::jsonb)
    into anh from public.listing_media where listing_id = l.id;
  select name, seller_type, ten_tro_ly into s from public.sellers where id = l.seller_id;
  d := public.diem_tin(l);

  return public.jsonb_bo_rong(jsonb_build_object(
    'tin', jsonb_build_object(
      'ma', l.code, 'ma_cu', l.legacy_code, 'loai_giao_dich', l.deal,
      'loai_bds', nullif(l.property_type::text, 'chua_ro'), 'trang_thai', l.status, 'gap', l.gap,
      'nguon', l.source, 'tu_chat', l.can_chu_duyet, 'chu_duyet_luc', l.chu_duyet_at,
      'tao_luc', l.created_at, 'sua_luc', l.updated_at, 'id', l.id),
    'nguoi_rao', jsonb_build_object('ten', s.name, 'vai', s.seller_type, 'tro_ly', s.ten_tro_ly),
    'vi_tri', jsonb_build_object(
      'dia_chi', l.location_raw, 'duong', l.street, 'phuong', l.ward, 'quan', l.district,
      'chu_noi', f->>'vi_tri', 'du_an', bt->>'du_an', 'ma_can', l.unit_code,
      'loai_duong', l.access_type, 'do_rong_hem_m', l.alley_width_m,
      'do_rong_hem', coalesce(f->>'do_rong_hem', f->>'do_rong_duong', f->>'duong_vao'),
      'cach_mat_tien_m', l.distance_to_street_m, 'cach_mat_tien', f->>'cach_mat_tien',
      'hem_thong', f->>'hem_thong', 'ngap_nuoc', f->>'ngap_nuoc', 'ha_tang', f->>'ha_tang',
      'tien_ich_gan', f->>'tien_ich_gan', 'khu_compound', f->>'khu_compound',
      'duong_container', f->>'duong_container', 'lat', l.lat, 'lng', l.lng),
    'thong_so', jsonb_build_object(
      'dien_tich_m2', l.area_m2, 'dien_tich_so_m2', l.legal_area_m2, 'dien_tich_xay_m2', l.built_area_m2,
      'chu_noi_dien_tich', coalesce(f->>'dien_tich', f->>'dien_tich_dat', f->>'dien_tich_tim_tuong'),
      'ngang_m', l.frontage_m, 'dai_m', l.length_m, 'no_hau_m', l.rear_width_m, 'no_hau', f->>'no_hau',
      'mat_tien', f->>'mat_tien', 'tho_cu', f->>'tho_cu', 'hinh_dang', f->>'hinh_dang',
      'so_tang', l.floors, 'ket_cau', coalesce(l.floors_text, f->>'ket_cau'), 'tang', l.floor, 'chu_noi_tang', f->>'tang',
      'so_phong_ngu', l.bedrooms, 'so_wc', coalesce(l.bathrooms::text, f->>'so_wc'),
      'huong', coalesce(l.direction, f->>'huong'), 'view', f->>'view',
      'can_goc', coalesce(l.corner_lot::text, f->>'can_goc'), 'thang_may', coalesce(l.has_elevator::text, f->>'thang_may'),
      'o_to_trong_nha', l.car_in_house, 'san_vuon', f->>'san_vuon', 'hien_trang', f->>'hien_trang',
      'nam_xay', coalesce(l.year_built::text, f->>'nam_xay'),
      'mat_do_xd', f->>'mat_do_xd', 'tang_cao_toi_da', f->>'tang_cao_toi_da',
      'so_phong', f->>'so_phong', 'pccc', f->>'pccc',
      'chieu_cao', f->>'chieu_cao', 'tai_trong_san', f->>'tai_trong_san', 'tram_bien_ap', f->>'tram_bien_ap',
      'xu_ly_nuoc_thai', f->>'xu_ly_nuoc_thai',
      'duong_vao', f->>'duong_vao', 'nguon_nuoc', f->>'nguon_nuoc', 'ranh_gioi', f->>'ranh_gioi'),
    'phap_ly', jsonb_build_object(
      'tinh_trang', l.legal_status, 'hoan_cong', l.has_completion,
      'quy_hoach', coalesce(l.planning_status, f->>'quy_hoach'), 'chu_noi', f->>'phap_ly',
      'the_chap', f->>'the_chap', 'xay_dung', f->>'xay_dung', 'so_huu', f->>'so_huu',
      'len_tho_cu', f->>'len_tho_cu', 'thoi_han_su_dung', f->>'thoi_han_su_dung',
      'hinh_thuc_thue_dat', f->>'hinh_thuc_thue_dat', 'muc_dich', f->>'muc_dich'),
    'gia', jsonb_build_object(
      'gia_raw', l.price_raw, 'gia_vnd', l.price_vnd, 'gia_m2_vnd', l.price_per_m2_vnd,
      'thuong_luong', coalesce(l.negotiable::text, f->>'thuong_luong'), 'gap', l.gap,
      'ly_do_ban', f->>'ly_do_ban', 'hien_trang_su_dung', f->>'hien_trang_su_dung'),
    'cho_thue', jsonb_build_object(
      'tien_coc', f->>'tien_coc', 'thoi_han_thue', f->>'thoi_han_thue', 'truot_gia', f->>'truot_gia',
      'fit_out', f->>'fit_out', 'noi_that', coalesce(l.furnishing, f->>'noi_that'),
      'phi_quan_ly', f->>'phi_quan_ly', 'phi_gui_xe', f->>'phi_gui_xe',
      'gia_dien_nuoc', f->>'gia_dien_nuoc', 'gio_giac', f->>'gio_giac',
      'doanh_thu_thang_vnd', l.rent_income_vnd, 'doanh_thu', f->>'doanh_thu', 'ty_le_lap_day', f->>'ty_le_lap_day'),
    'khai_thac', jsonb_build_object('tiem_nang', f->>'tiem_nang', 'nganh_hang_phu_hop', f->>'nganh_hang_phu_hop'),
    'anh', jsonb_build_object('so_tam', (d->>'so_anh')::int, 'kho', anh, 'url_chat', url_chat),
    'bo_sung', bs,
    'cham_soc', jsonb_build_object(
      'danh_gia', f->>'danh_gia', 'ket_thuc', bt->>'ket_thuc', 'ket_thuc_luc', bt->>'ket_thuc_luc',
      'ket_thuc_loi', bt->>'ket_thuc_loi', 'boc_tach_cap_nhat', bt->>'_cap_nhat'),
    'diem', jsonb_build_object('tong', d->'diem', 'chi_tiet', d->'chi_tiet', 'thieu', d->'thieu')
  ));
end $function$
;
