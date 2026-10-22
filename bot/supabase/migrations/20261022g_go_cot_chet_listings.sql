-- 20261022g — gỡ 7 cột `listings` đã chết (docs/07 SRS-5.1zzzzzzz140; chủ dự án 22/10/2026: "làm bản gọn khoảng 30 cột").
-- Soát 22/10 (DB + toàn bộ mã nguồn): 7 cột không có luồng ghi nào còn sống và 0/4 dòng có dữ liệu —
--   cc_link, unit_status (FR-117 chưa dựng), legacy_sst (STT sheet Excel Q5 đã xoá), last_confirmed_at, chu_noi_du_at,
--   source_url (tin rao không bao giờ ghi; `projects.source_url` là bảng khác), specs_source (cờ của trigger bóc thông số cũ). 70 → 63 cột.
-- 15 cột thông số khác (hướng, nội thất, năm xây, thang máy, WC, cách mặt tiền…) CÒN: trang chi tiết tin công khai đang hiện và lõi Python ghi
-- qua `COT_THONG_SO` — gỡ chúng là bỏ thông tin người mua đang xem, chờ chủ dự án quyết (SRS-5.1zzzzzzz140 mục 4).
-- Thứ tự: sao dữ liệu → sửa 3 hàm → nhớ định nghĩa 4 view → gỡ view → gỡ cột → dựng lại view (cùng định nghĩa, bỏ cột chết) → cấp quyền cũ.
-- Cả file chạy MỘT lượt (Management API) nên lỗi giữa chừng thì không đổi gì; đoạn cuối tự kiểm và ném lỗi nếu hàm / view hỏng.
set lock_timeout = '10s';   -- bảng nóng: chờ khoá quá 10 giây thì bỏ cuộc, không xếp hàng chặn cả web

create table if not exists luu_tru.listings_cot_chet_20261022 as
  select id, cc_link, unit_status, legacy_sst, last_confirmed_at, chu_noi_du_at, source_url, specs_source
    from public.listings where false;
insert into luu_tru.listings_cot_chet_20261022
  select id, cc_link, unit_status, legacy_sst, last_confirmed_at, chu_noi_du_at, source_url, specs_source
    from public.listings;

-- 1. listings_boc_thong_so (trigger): bỏ specs_source
CREATE OR REPLACE FUNCTION public.listings_boc_thong_so()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  j jsonb;
  de boolean;
  co boolean := false;
begin
  -- 20261012c (SRS-5.1zzzzzh, bắn production 12/10 thu-kb-thue): căn hộ "Sunrise City" → location_raw "Sunrise City" → street "Sunrise City".
  -- Tên DỰ ÁN không phải tên ĐƯỜNG: chữ đọc ra trùng tên dự án tin đang gắn thì cột street để trống.
  if new.street is null then
    new.street := public.boc_ten_duong(new.location_raw);
    if new.street is not null and new.project_id is not null and exists (
      select 1 from public.projects p where p.id = new.project_id and lower(btrim(p.name)) = lower(btrim(new.street))
    ) then new.street := null; end if;
  end if;
  if new.description is null then return new; end if;
  -- 20261002a (đợt 1 chuyển luật sang AI): tin do AI quyết thông số (dấu `_thong_so_ai`, chat-reply chế độ `ai`) → KHÔNG đọc
  -- câu rao bằng regex. Bắn thử lx-t5-05: "nằm trong khu công nghiệp nên không có hẻm" → `\mhem\M` → access_type = 'hem'.
  if coalesce(new.boc_tach->>'_thong_so_ai', '') = 'true' then return new; end if;
  de := tg_op = 'UPDATE' and new.description is distinct from old.description;
  j := public.boc_thong_so(new.description, new.property_type::text);

  if j ? 'frontage_m'           and (de or new.frontage_m is null)           then new.frontage_m := (j->>'frontage_m')::numeric; co := true; end if;
  if j ? 'length_m'             and (de or new.length_m is null)             then new.length_m := (j->>'length_m')::numeric; co := true; end if;
  if j ? 'rear_width_m'         and (de or new.rear_width_m is null)         then new.rear_width_m := (j->>'rear_width_m')::numeric; co := true; end if;
  if j ? 'legal_area_m2'        and (de or new.legal_area_m2 is null)        then new.legal_area_m2 := (j->>'legal_area_m2')::numeric; co := true; end if;
  if j ? 'built_area_m2'        and (de or new.built_area_m2 is null)        then new.built_area_m2 := (j->>'built_area_m2')::numeric; co := true; end if;
  if j ? 'floors'               and (de or new.floors is null)               then new.floors := (j->>'floors')::int; new.floors_text := j->>'floors_text'; co := true; end if;
  if j ? 'floor'                and (de or new.floor is null)                then new.floor := (j->>'floor')::int; co := true; end if;
  if j ? 'bedrooms'             and (de or new.bedrooms is null)             then new.bedrooms := (j->>'bedrooms')::int; co := true; end if;
  if j ? 'bathrooms'            and (de or new.bathrooms is null)            then new.bathrooms := (j->>'bathrooms')::int; co := true; end if;
  if j ? 'access_type'          and (de or new.access_type is null)          then new.access_type := j->>'access_type'; co := true; end if;
  if j ? 'alley_width_m'        and (de or new.alley_width_m is null)        then new.alley_width_m := (j->>'alley_width_m')::numeric; co := true; end if;
  if j ? 'distance_to_street_m' and (de or new.distance_to_street_m is null) then new.distance_to_street_m := (j->>'distance_to_street_m')::numeric; co := true; end if;
  if j ? 'legal_status'         and (de or new.legal_status is null)         then new.legal_status := j->>'legal_status'; co := true; end if;
  if j ? 'has_completion'       and (de or new.has_completion is null)       then new.has_completion := (j->>'has_completion')::boolean; co := true; end if;
  if j ? 'planning_status'      and (de or new.planning_status is null)      then new.planning_status := j->>'planning_status'; co := true; end if;
  if j ? 'has_elevator'         and (de or new.has_elevator is null)         then new.has_elevator := true; co := true; end if;
  if j ? 'car_in_house'         and (de or new.car_in_house is null)         then new.car_in_house := true; co := true; end if;
  if j ? 'corner_lot'           and (de or new.corner_lot is null)           then new.corner_lot := true; co := true; end if;
  if j ? 'furnishing'           and (de or new.furnishing is null)           then new.furnishing := j->>'furnishing'; co := true; end if;
  if j ? 'year_built'           and (de or new.year_built is null)           then new.year_built := (j->>'year_built')::int; co := true; end if;
  if j ? 'direction'            and (de or new.direction is null)            then new.direction := j->>'direction'; co := true; end if;
  if j ? 'negotiable'           and (de or new.negotiable is null)           then new.negotiable := (j->>'negotiable')::boolean; co := true; end if;
  if j ? 'rent_income_vnd' and new.deal = 'ban' and (de or new.rent_income_vnd is null) then new.rent_income_vnd := (j->>'rent_income_vnd')::bigint; co := true; end if;

  return new;
end $function$;

-- 2. boc_tach_nhom: bỏ 'chu_noi_du_luc'
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
end $function$;

-- 3. chuan_nmg: ngày chốt tính theo updated_at
CREATE OR REPLACE FUNCTION public.chuan_nmg(p_seller_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with t as (
    select count(*) filter (where l.status in ('dang_ban', 'dang_quan_tam', 'da_coc'))                                   as dang_rao,
           count(*) filter (where l.status = 'da_chot' and l.updated_at >= now() - interval '6 months') as chot_6t,
           count(*) filter (where l.created_at >= now() - interval '6 months' or l.status in ('dang_ban', 'dang_quan_tam', 'da_coc', 'cho_thong_tin')) as tong_6t
      from listings l where l.seller_id = p_seller_id
  )
  select jsonb_build_object(
           'dang_rao', dang_rao, 'chot_6_thang', chot_6t, 'tong_6_thang', tong_6t,
           'ty_le_chot', case when tong_6t > 0 then round(100.0 * chot_6t / tong_6t, 1) else 0 end,
           'dat_chuan', dang_rao >= 10 and tong_6t > 0 and chot_6t::numeric / tong_6t >= 0.05)
    from t;
$function$;

-- 4. nhớ định nghĩa view → gỡ view → gỡ cột → dựng lại view
do $do$
declare
  v_btv text := pg_get_viewdef('public.boc_tach_v'::regclass, true);
  v_pl  text := pg_get_viewdef('public.public_listings'::regclass, true);
  v_rhb text := pg_get_viewdef('public.ro_hang_ban'::regclass, true);
  v_rh  text := pg_get_viewdef('so.ro_hang'::regclass, true);
  v_cmt text := obj_description('so.ro_hang'::regclass);
begin
  v_btv := regexp_replace(v_btv, '\s+chu_noi_du_at,', '', 'g');
  v_pl  := regexp_replace(v_pl,  '\s+last_confirmed_at,', '', 'g');
  v_rhb := regexp_replace(v_rhb, 'CASE\s+WHEN specs_source = ''boc_mo_ta''::text THEN ''[^'']*''::text\s+ELSE NULL::text\s+END,\s*', '', 'g');
  v_rh  := replace(v_rh, 'l.legacy_sst AS stt', 'row_number() OVER (ORDER BY l.created_at, l.id)::integer AS stt');
  v_rh  := replace(v_rh, 'l.source_url AS nguon', 'l.source AS nguon');
  v_rh  := replace(v_rh, 'ORDER BY l.legacy_sst, l.created_at', 'ORDER BY l.created_at');
  if v_btv ~ 'chu_noi_du_at' or v_pl ~ 'last_confirmed_at' or v_rhb ~ 'specs_source' or v_rh ~ 'legacy_sst|source_url' then
    raise exception 'định nghĩa view còn tham chiếu cột sắp gỡ — dừng, không đổi gì';
  end if;

  drop view public.boc_tach_v;
  drop view public.public_listings;
  drop view public.ro_hang_ban;
  drop view so.ro_hang;

  alter table public.listings
    drop column cc_link, drop column unit_status, drop column legacy_sst, drop column last_confirmed_at,
    drop column chu_noi_du_at, drop column source_url, drop column specs_source;

  execute 'create view public.boc_tach_v with (security_invoker = true) as ' || rtrim(v_btv, ';');
  execute 'create view public.public_listings with (security_invoker = true) as ' || rtrim(v_pl, ';');
  execute 'create view public.ro_hang_ban with (security_invoker = true) as ' || rtrim(v_rhb, ';');
  execute 'create view so.ro_hang with (security_invoker = true) as ' || rtrim(v_rh, ';');
  if v_cmt is not null then execute format('comment on view so.ro_hang is %L', v_cmt); end if;
end
$do$;

-- 5. quyền như cũ (view mới ở project này mặc định LỘ cho anon / authenticated nên phải thu hồi trước)
revoke all on public.boc_tach_v, public.public_listings, public.ro_hang_ban, so.ro_hang from anon, authenticated;
grant all on public.boc_tach_v, public.public_listings, public.ro_hang_ban to service_role;
grant select on public.boc_tach_v, public.ro_hang_ban to authenticated;
grant select on so.ro_hang to service_role;

-- 6. tự kiểm: gọi mọi hàm / view vừa sửa trên dữ liệu thật; hỏng chỗ nào thì ném lỗi và CẢ FILE hoàn tác
do $kiem$
begin
  perform public.boc_tach_nhom(l) from public.listings l;
  perform public.diem_tin(l) from public.listings l;
  perform public.van_ban_nhung(l.id) from public.listings l;
  perform public.chuan_nmg(s.id) from public.sellers s;
  perform * from public.tim_nha('ban', null, null, null, null, null, false, null, 3);
  perform 1 from public.boc_tach_v;
  perform 1 from public.public_listings;
  perform 1 from public.ro_hang_ban;
  perform 1 from so.ro_hang;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'listings') <> 63 then
    raise exception 'listings phải còn 63 cột sau khi gỡ 7 cột chết';
  end if;
end
$kiem$;
