-- 20260903d — FR-174 đợt 1 (địa bàn mở: Sài Gòn phường mới + Long An, chốt
-- 03/09/2026, OPEN-27 nửa đầu): admin_dang_tin không ghi cứng 'Quận 5' nữa —
-- nhận `district` từ form, không có thì mặc định 'Quận 5' (cụm khởi điểm).
-- Giữ NGUYÊN mọi hành vi khác của bản 20260828b.
create or replace function public.admin_dang_tin(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
    coalesce(nullif(btrim(p->>'district'), ''), 'Quận 5'),
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
$fn$;

revoke all on function public.admin_dang_tin(jsonb) from public, anon;
grant execute on function public.admin_dang_tin(jsonb) to authenticated;
