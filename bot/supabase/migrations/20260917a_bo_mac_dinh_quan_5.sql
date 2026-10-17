-- 20260917a — BỎ HẲN mặc định "Quận 5": quận chưa rõ thì ĐỂ TRỐNG, không bịa.
--
-- VÌ SAO. Chủ dự án 17/09/2026 (Zalo thật, tin Ny'ah Phú Định nằm "Quận 5" dù dự án
-- ở Quận 8): "kiểm tra code xem chỗ nào cứ mặc định quận 5 xóa sạch đi". Cột
-- `listings.district` từ thời chỉ làm chợ Quận 5 là NOT NULL DEFAULT 'Quận 5'; mọi
-- lớp trên phải vá bằng cờ `boc_tach.quan_mac_dinh` để biết "Quận 5 này là thật hay
-- là mặc định" — cờ đó lệch là tin sai quận. Nay:
--   1. `district` cho phép NULL, bỏ default. NULL = chưa rõ quận, bot hỏi "phường mấy,
--      quận nào" (`phuong@chua_quan`); có phường / dự án thì suy quận từ đó.
--   2. Mã tin khi chưa rõ quận mang nhãn "XX" (BDS-NP-XX-0001) thay vì Q5; trigger
--      `listings_doi_ma_theo_quan_loai` (20260911f) cấp lại mã khi quận được điền.
--   3. `admin_dang_tin` không đổ 'Quận 5' vào chỗ trống.
-- Cờ `quan_mac_dinh` giữ lại để đọc dữ liệu cũ; tin mới không cần nó nữa.

alter table public.listings alter column district drop default;
alter table public.listings alter column district drop not null;

comment on column public.listings.district is
  'Quận/huyện (hoặc tỉnh lân cận: "Bến Lức, Long An"). NULL = chưa rõ — KHÔNG mặc định Quận 5 từ 20260917a; bot hỏi "phường mấy, quận nào" hoặc suy từ phường / dự án.';

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

-- admin_dang_tin: chỗ trống không đổ 'Quận 5' nữa (chỉ đổi một dòng, thân hàm giữ nguyên).
CREATE OR REPLACE FUNCTION public.admin_dang_tin(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email  text := (select auth.jwt() ->> 'email');
  v_seller uuid;
  v_zalo   text;
  v_phone  text;
  v_code   text;
  v_id     uuid;
  v_price  bigint;
begin
  if v_email is null or not exists (select 1 from admins a where a.email = v_email) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;

  v_seller := nullif(p->>'seller_id', '')::uuid;

  if v_seller is null and coalesce(btrim(p->>'seller_name'), '') <> '' then
    v_zalo  := nullif(btrim(p->>'seller_zalo'), '');
    v_phone := nullif(btrim(p->>'seller_phone'), '');

    if v_zalo is not null then
      select id into v_seller from sellers where zalo_user_id = v_zalo;
    end if;
    if v_seller is null and v_phone is not null then
      select id into v_seller from sellers where phone = v_phone;
    end if;

    if v_seller is null then
      insert into sellers (name, seller_type, phone, zalo_user_id)
      values (
        btrim(p->>'seller_name'),
        coalesce(nullif(p->>'seller_type', ''), 'ccrb')::seller_type,
        v_phone,
        v_zalo
      )
      returning id into v_seller;
    end if;
  end if;

  insert into listings (
    code, seller_id, deal, district, ward, ward_source, location_raw,
    area_m2, price_raw, price_source, bedrooms,
    property_type, property_type_source, description, source, status
  ) values (
    null,
    v_seller,
    coalesce(nullif(p->>'deal', ''), 'ban')::listing_deal,
    nullif(btrim(p->>'district'), ''),
    nullif(btrim(p->>'ward'), ''),
    case when nullif(btrim(p->>'ward'), '') is not null then 'admin' else 'suy_doan' end,
    nullif(btrim(p->>'location_raw'), ''),
    nullif(p->>'area_m2', '')::numeric,
    nullif(btrim(p->>'price_raw'), ''),
    case when nullif(btrim(p->>'price_raw'), '') is not null then 'admin' else 'suy_doan' end,
    nullif(p->>'bedrooms', '')::int,
    coalesce(nullif(p->>'property_type', ''), 'chua_ro')::property_type,
    case when nullif(p->>'property_type', '') is not null then 'admin' else 'suy_doan' end,
    nullif(btrim(p->>'description'), ''),
    coalesce(nullif(btrim(p->>'source'), ''), 'admin'),
    coalesce(nullif(p->>'status', ''), 'cho_thong_tin')
  )
  returning id, code, price_vnd into v_id, v_code, v_price;

  return jsonb_build_object(
    'id', v_id, 'code', v_code, 'price_vnd', v_price, 'seller_id', v_seller
  );
end
$function$
;
