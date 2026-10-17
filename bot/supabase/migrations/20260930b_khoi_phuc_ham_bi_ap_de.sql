-- 20260930b — KHÔI PHỤC hai hàm + một view bị ÁP ĐÈ bằng bản 08/09.
--
-- 30/09/2026 ~03:50 UTC: workflow "Apply Database Migration" được bấm chạy trên main với ô migration_file để MẶC ĐỊNH
-- (`20260908c_chuan_hoa_ma_tin_va_boc_thong_so.sql`). File đó `create or replace` lại `boc_thong_so`, `next_listing_code`,
-- `listings_fill_code` và view `listing_photos_v` bằng bản 08/09 — đè bản hiện hành (cổng soat-migration: 2 hàm lệch thân;
-- soat-db: view đọc xuyên RLS MỚI vì bản cũ không có `security_invoker`; URL ảnh quay về dựng từ app_config thay vì
-- `url_kho_anh()`). `listings_fill_code` thân trùng bản hiện hành nên không cần dựng lại.
--
-- Chủ dự án: "lấy bản mới nhất đi". Nội dung dưới đây chép NGUYÊN VĂN từ bot/supabase/schema.sql trên main (dc03377) —
-- bản đã khớp DB lúc 02:25 UTC (CI FR-249 xanh cổng 7). Không đổi logic nào. Cùng PR: bỏ giá trị mặc định của ô
-- migration_file để bấm nhầm không áp lại file cũ nữa.

CREATE OR REPLACE FUNCTION public.boc_thong_so(p_text text, p_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  k text;
  k_ngang text;
  m text[];
  j jsonb := '{}'::jsonb;
  n_lau int; co_tret bool; co_lung bool; co_st bool; co_ham bool; co_apmai bool;
  parts text[];
  chung_cu bool := coalesce(p_type = 'chung_cu', false);
  -- 20260928f (FR-241): tin ĐẤT không có kết cấu — "còn lại cây lâu năm" từng thành "trệt + 1 lầu".
  la_dat bool := coalesce(p_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh'), false);
begin
  if p_text is null or btrim(p_text) = '' then return j; end if;
  k := public.bo_dau(p_text);
  k := regexp_replace(k, '(\d),(\d)', '\1.\2', 'g');
  k := regexp_replace(k, '\s+', ' ', 'g');
  k := replace(k, 'm²', 'm2');
  k := regexp_replace(k, '(\d)\s*m ?2\M', '\1m2', 'g');
  k := replace(k, 'm2', 'mv');
  k := regexp_replace(k, '(\d)m(\d)', '\1.\2', 'g');
  k := replace(k, 'mv', 'm2');
  k := regexp_replace(k, '(\d)\s*\*\s*(\d)', '\1 x \2', 'g');
  k := replace(k, 'hem hong', 'hemhong');
  k := regexp_replace(k, '\m2 ?mt\M', '2 mat tien', 'g');
  k_ngang := regexp_replace(k, '(cach|ra|toi|den|gan|sat|buoc ra|ke)\s*(mat tien|\mmt\M)\s*(?:chi|khoang|tam|hon|gan|duong)?[^,;.]{0,25}?\d+(?:\.\d+)?\s*m\M', ' ', 'g');

  m := regexp_match(k, '(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?');
  if m is not null and m[1]::numeric between 1.5 and 40 and m[2]::numeric between 3 and 150 then
    j := j || jsonb_build_object('frontage_m', m[1]::numeric, 'length_m', m[2]::numeric);
  end if;
  if j->>'frontage_m' is null then
    m := regexp_match(k_ngang, '(?:ngang|mat tien|chieu ngang|be ngang)\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)\s*m?\M');
    if m is not null and m[1]::numeric between 1.5 and 40 then j := j || jsonb_build_object('frontage_m', m[1]::numeric); end if;
  end if;
  if j->>'length_m' is null then
    m := regexp_match(k, '(?:dai|chieu dai|chieu sau)\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)\s*m?\M');
    if m is not null and m[1]::numeric between 3 and 150 then j := j || jsonb_build_object('length_m', m[1]::numeric); end if;
  end if;
  if j->>'frontage_m' is null and j->>'length_m' is not null then
    m := regexp_match(k, '(\d+(?:\.\d+)?)\s*m?\s*,?\s*(?:dai|chieu dai)\s*(?:hon|gan|:)?\s*\d');
    if m is not null and m[1]::numeric between 1.5 and 40 then j := j || jsonb_build_object('frontage_m', m[1]::numeric); end if;
  end if;
  m := regexp_match(k, 'no hau\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)');
  if m is not null and m[1]::numeric between 1.5 and 40 then j := j || jsonb_build_object('rear_width_m', m[1]::numeric); end if;

  m := regexp_match(k, '(?:cong nhan|dtcn|dt cn|so|so hong)\s*(?:thuc te|du)?\s*:?\s*(\d+(?:\.\d+)?)\s*m2');
  if m is not null and m[1]::numeric between 5 and 5000 then j := j || jsonb_build_object('legal_area_m2', m[1]::numeric); end if;
  m := regexp_match(k, '(?:dtxd|dt xd|dien tich xay dung|dt xay dung|dien tich san|dt san|dtsd|dt sd|dien tich su dung|dt su dung|tong dien tich san)\s*:?\s*(\d+(?:\.\d+)?)\s*m(?:2|\M)');
  if m is not null and m[1]::numeric between 5 and 20000 then j := j || jsonb_build_object('built_area_m2', m[1]::numeric); end if;

  if la_dat then
    null;
  elsif not chung_cu then
    co_tret  := k ~ '\mtret\M';
    co_lung  := k ~ '\mlung\M';
    co_st    := k ~ '(san thuong|\mst\M|mai tum)';
    co_ham   := k ~ '\mham\M';
    co_apmai := k ~ 'ap mai';
    n_lau := null;
    m := regexp_match(k, '(?:tong )?so tang\s*:?\s*(\d+)');
    if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('floors', m[1]::int); end if;
    if j->>'floors' is null
       and k !~ '(duoc xay|xay duoc|cho xay|co the xay|xay len|xay them|nang len|len duoc|len toi)\s*(?:len|toi|den|them|toi da)?\s*\d+\s*tam'
       and k !~ '(cap 4|nha c4|\mc4\M)' then
      m := regexp_match(k, '\m(\d+)\s*tam(\s*ruoi)?\M');
      if m is not null and m[1]::int between 1 and 30 then
        j := j || jsonb_build_object('floors', m[1]::int);
        if m[2] is not null then co_lung := true; end if;
      end if;
    end if;
    m := regexp_match(k, '\m(\d+)\s*lau\M');
    if m is not null and m[1]::int between 1 and 30 and j->>'floors' is null then n_lau := m[1]::int; end if;
    if n_lau is null then
      -- BỎ |t ở đây kẻo "7t" (7 tỷ) thành 7 tầng
      m := regexp_match(k, '\m(\d+)\s*tang\M');
      if m is not null and m[1]::int between 1 and 30 and j->>'floors' is null then
        j := j || jsonb_build_object('floors', m[1]::int);
      end if;
      if j->>'floors' is null and (k ~ '\mlau\M(?!\s*(nam|doi|dai|roi|qua|lam|ngay|nay))' or co_tret) then
        j := j || jsonb_build_object('floors', case when k ~ '\mlau\M(?!\s*(nam|doi|dai|roi|qua|lam|ngay|nay))' then 2 else 1 end);
      end if;
      if j->>'floors' is null and k ~ '(cap 4|nha c4|\mc4\M)' then j := j || jsonb_build_object('floors', 1); end if;
    else
      j := j || jsonb_build_object('floors', n_lau + 1);
    end if;
    if j->>'floors' is not null then
      parts := array[]::text[];
      if co_ham then parts := array_append(parts, 'hầm'); end if;
      parts := array_append(parts, 'trệt');
      if co_lung then parts := array_append(parts, 'lửng'); end if;
      if n_lau is not null then parts := array_append(parts, n_lau || ' lầu');
      elsif (j->>'floors')::int > 1 then parts := array_append(parts, ((j->>'floors')::int - 1) || ' lầu'); end if;
      if co_apmai then parts := array_append(parts, 'áp mái'); end if;
      if co_st then parts := array_append(parts, 'sân thượng'); end if;
      j := j || jsonb_build_object('floors_text', array_to_string(parts, ' + '));
    end if;
  else
    m := regexp_match(k, '(?:tang|lau)\s*(\d{1,2})\M');
    if m is not null and m[1]::int between 1 and 80 then j := j || jsonb_build_object('floor', m[1]::int); end if;
  end if;

  m := regexp_match(k, '(\d+)\s*(?:pn|phong ngu|p\.ngu)\M');
  if m is null then m := regexp_match(k, 'so phong ngu\s*:?\s*(\d+)'); end if;
  if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('bedrooms', m[1]::int); end if;
  m := regexp_match(k, '(\d+)\s*(?:wc|toilet|nha ve sinh|nvs|ve sinh|phong tam)\M');
  if m is null then m := regexp_match(k, '(?:so )?(?:phong ve sinh|phong tam|wc)\s*:?\s*(\d+)\M'); end if;
  if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('bathrooms', m[1]::int); end if;

  if k ~ '(nha|ban nha|can nha|can|ban|thue|cho thue)\s*(?:pho|rieng|dep|gap|nguyen can|moi)?\s*(hem|\mhxh\M|\mhxt\M)' then
    null;
  elsif k ~ '(cach|gan|sat|ra|toi|den|buoc ra|ke|ngay|\d+\s*m) (mat tien|\mmt\M)' and k !~ '(nha|ban|ban nha|can|lo)\s*(\d\s*)?mat tien' then
    null;
  elsif k ~ '(mat tien|\mmt\M|mat pho|mat duong|co via he|via he rong|le duong)' then
    j := j || jsonb_build_object('access_type', 'mat_tien');
  end if;
  if j->>'access_type' is null then
    if k ~ '(xe hoi|o ?to|xe tai|xe 4 banh)\s*(khong|ko|k|kg|chua)\s*(vo|vao|toi|den|duoc|lot|qua)' or k ~ '(khong|ko|k|kg|chua)\s*(co\s*)?(xe hoi|o ?to|xe tai)\s*(nao\s*)?(vo|vao|toi|duoc)' then j := j || jsonb_build_object('access_type', 'hem_xe_may');
    elsif k ~ '(hem xe tai|\mhxt\M|xe tai)' then j := j || jsonb_build_object('access_type', 'hem_xe_tai');
    elsif k ~ '(hem xe hoi|\mhxh\M|hem o ?to|hem xe con|xe hoi(?! (?:vo |vao |ngu |de |dau )?trong nha)|o ?to (vo|vao|dau|toi|do)|hem 7 cho|xe 7 cho)' then j := j || jsonb_build_object('access_type', 'hem_xe_hoi');
    elsif k ~ '(\mhxm\M|hem xe may|hem nho|hem ba gac|hem 3 gac|hem xe 3 banh|xe may)' then j := j || jsonb_build_object('access_type', 'hem_xe_may');
    elsif k ~ '\mhem\M' then j := j || jsonb_build_object('access_type', 'hem');
    end if;
  end if;
  m := regexp_match(k, '(?:hem|hxh|hxt|hxm|duong truoc nha|duong)\s*(?:xe hoi|xe tai|xe may|truoc nha|rong|thong)?\s*(?:rong)?\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)\s*m\M');
  if m is not null and m[1]::numeric between 1 and 40 then
    j := j || jsonb_build_object('alley_width_m', m[1]::numeric);
    if j->>'access_type' = 'hem' then
      j := j || jsonb_build_object('access_type', case when m[1]::numeric >= 6 then 'hem_xe_tai' when m[1]::numeric >= 3 then 'hem_xe_hoi' else 'hem_xe_may' end);
    end if;
  end if;
  m := regexp_match(k, '(?:cach|ra)\s*(?:mat tien|\mmt\M)\s*(?:chi|khoang|tam|hon|gan|duong)?\s*(?:[a-z ]{0,25}?)\s*(\d+(?:\.\d+)?)\s*m\M');
  if m is null then m := regexp_match(k, 'cach\s*(?:chi|khoang|tam)?\s*(\d+(?:\.\d+)?)\s*m\s*(?:la )?(?:ra|toi|den)\s*(?:mat tien|\mmt\M|duong)'); end if;
  if m is not null and m[1]::numeric between 5 and 500 then j := j || jsonb_build_object('distance_to_street_m', m[1]::numeric); end if;

  -- 20260923a: "chưa có sổ" / "không có sổ" / "đang làm sổ" là KHÔNG có sổ — bản cũ khớp "co so" ở giữa câu phủ định.
  if k ~ '(chua|khong|\mko\M|chang|dang cho|dang lam|chua ra)\s+(co\s+|ra\s+|lam\s+)?(so|shr|shc)\M' then null;
  elsif k ~ '(so hong rieng|\mshr\M|so rieng|so do rieng)' then j := j || jsonb_build_object('legal_status', 'so_hong_rieng');
  elsif k ~ '(so hong chung|\mshc\M|so chung|dong so huu)' then j := j || jsonb_build_object('legal_status', 'so_hong_chung');
  elsif k ~ '(hop dong mua ban|\mhdmb\M)' then j := j || jsonb_build_object('legal_status', 'hdmb');
  elsif k ~ '(giay tay|vi bang)' then j := j || jsonb_build_object('legal_status', 'giay_tay');
  elsif k ~ '(so hong|so do|\mshcc\M|so chinh chu|so dep|so vuong|so sach|so cam tay|\mso\M (day du|ro rang|chuan)|co so)' then j := j || jsonb_build_object('legal_status', 'so_hong');
  end if;
  if k ~ 'chua hoan cong' then j := j || jsonb_build_object('has_completion', false);
  elsif k ~ 'hoan cong' then j := j || jsonb_build_object('has_completion', true); end if;
  if k ~ '(khong lo gioi|khong dinh lo gioi|khong bi lo gioi|da bo lo gioi)' then j := j || jsonb_build_object('planning_status', 'khong_lo_gioi');
  elsif k ~ '(khong quy hoach|khong dinh quy hoach|khong quy hoach treo)' then j := j || jsonb_build_object('planning_status', 'khong_quy_hoach');
  elsif k ~ '(dinh lo gioi|co lo gioi|lo gioi \d|dinh quy hoach)' then j := j || jsonb_build_object('planning_status', 'dinh_lo_gioi');
  end if;

  if k ~ 'thang may' then j := j || jsonb_build_object('has_elevator', true); end if;
  if k ~ '(xe hoi (vo|vao|ngu|de) (trong )?nha|o ?to (vo|vao|ngu|dau) (trong |tan )?nha|dau (o ?to|xe hoi|xe oto) trong nha|san dau (o ?to|xe hoi)|\mgarage\M|ga ?ra ?ge|\mgara\M|xe hoi ngu trong nha|(o ?to|xe hoi) (vo|vao|toi) tan (cua|nha)|\d+ (xe hoi|o ?to|xe oto) (vo |vao |ngu |de |dau )?trong nha)' then
    j := j || jsonb_build_object('car_in_house', true);
  end if;
  if k ~ '(can goc|lo goc|nha goc|2 mat tien|hai mat tien|2 mat hem|hai mat hem|goc 2 mat|2 mat thoang)' then j := j || jsonb_build_object('corner_lot', true); end if;
  if k ~ '(full noi that|noi that day du|day du noi that|tang (toan bo |het |full |tat ca )?noi that|noi that cao cap|full nt|tang nt|nt cao cap|nt day du|noi that sang trong)' then j := j || jsonb_build_object('furnishing', 'full');
  elsif k ~ '(noi that co ban|nt co ban)' then j := j || jsonb_build_object('furnishing', 'co_ban');
  elsif k ~ '(khong noi that|nha trong(?!\s+(hem|ngo|kiet|ngach|khu|duong|xom|day|toa|chung cu|du an|kdc|so|lo))|khong co noi that)' then j := j || jsonb_build_object('furnishing', 'khong');
  end if;
  m := regexp_match(k, '(?:xay|xay dung|xd|hoan cong)\s*(?:nam|moi|tu|vao)?\s*(?:giua|dau|cuoi)?\s*(?:nam)?\s*((?:19|20)\d\d)\M');
  if m is null then m := regexp_match(k, 'nam xay\s*(?:dung)?\s*:?\s*((?:19|20)\d\d)\M'); end if;
  if m is not null then j := j || jsonb_build_object('year_built', m[1]::int); end if;

  m := regexp_match(k, 'huong\s*(?:nha|cua|chinh|ban cong)?\s*:?\s*(dong nam|dong bac|tay nam|tay bac|dong|tay|nam|bac)\M');
  if m is not null then
    j := j || jsonb_build_object('direction',
      replace(replace(replace(initcap(m[1]), 'Dong', 'Đông'), 'Tay', 'Tây'), 'Bac', 'Bắc'));
  end if;

  if k ~ '(khong tl|khong thuong luong|gia chot|mien tl|mien thuong luong)' then j := j || jsonb_build_object('negotiable', false);
  elsif k ~ '(\mtl\M|thuong luong|thoa thuan|con tl)' then j := j || jsonb_build_object('negotiable', true); end if;
  m := regexp_match(k, '(?:dang|hien|hien dang|co hop dong)\s*(?:cho )?thue\s*(?:duoc|voi gia|gia|:)?\s*(\d+(?:\.\d+)?)\s*(?:tr|trieu)\M');
  if m is null then m := regexp_match(k, '(?:cho thue|thue)\s*(\d+(?:\.\d+)?)\s*(?:tr|trieu)\s*/?\s*(?:thang|th)\M'); end if;
  if m is not null and m[1]::numeric between 1 and 2000 then j := j || jsonb_build_object('rent_income_vnd', (m[1]::numeric * 1000000)::bigint); end if;

  return j;
end $function$
;

revoke all on function public.boc_thong_so(p_text text, p_type text) from public, anon, authenticated;
grant execute on function public.boc_thong_so(p_text text, p_type text) to anon;
grant execute on function public.boc_thong_so(p_text text, p_type text) to authenticated;
grant execute on function public.boc_thong_so(p_text text, p_type text) to service_role;

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

  select coalesce(max((regexp_match(code, '^' || v_prefix || '([0-9]+)$'))[1]::int), 0) + 1
    into v_num
    from listings
   where code ~ ('^' || v_prefix || '[0-9]+$');

  return v_prefix || lpad(v_num::text, 4, '0');
end;
$function$
;

revoke all on function public.next_listing_code(p_property_type text, p_district text, p_province text) from public, anon, authenticated;
grant execute on function public.next_listing_code(p_property_type text, p_district text, p_province text) to service_role;

create or replace view public.listing_photos_v with (security_invoker = true) as
 SELECT l.code,
    (((url_kho_anh() || '/'::text) || m.bucket) || '/'::text) || m.storage_path AS url,
    m.storage_path AS path,
    m.sort_order,
    m.is_cover,
    m.created_at,
    m.listing_id,
    m.id AS media_id,
    l.legacy_code
   FROM listing_media m
     JOIN listings l ON l.id = m.listing_id
  WHERE m.bucket = 'listing-public'::text AND (l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_chot'::text]));
revoke all on public.listing_photos_v from anon, authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.listing_photos_v to service_role;
grant SELECT on public.listing_photos_v to anon;
grant SELECT on public.listing_photos_v to authenticated;

