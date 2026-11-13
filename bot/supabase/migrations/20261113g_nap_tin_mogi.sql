-- SRS-5.1zzzzzzz474 (13/11/2026): nạp dataset thử Mogi — scripts/lay-mogi.py lấy tin, scripts/nap-mogi.py gọi hàm này qua REST (service_role).
-- Mỗi phần tử ds: legacy, deal, ptype, district, street, area, price_raw, descr, beds, baths, floors, access, alley, legal, lat, lng, tin_goc, url, dia_chi_goc.
-- Phường lấy theo toạ độ (phuong_tai_diem) — ngoài 168 phường TP.HCM mới thì bỏ; legacy_code đã có thì bỏ (chạy lại không nhân đôi).
-- Tin vào cho_thong_tin, trigger listings_quyet_dinh_dang_tin tự đưa lên dang_ban khi đủ giá + diện tích + phường.
-- Lời người đăng gốc chỉ ở listing_noi_bo (nội bộ). Xoá cả bộ: delete from listings where source = 'mogi_thu'; rồi xoá seller zalo_user_id = 'thu-mogi'.
create or replace function public.nap_tin_mogi(ds jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare ban uuid; n integer;
begin
  insert into sellers (name, zalo_user_id, seller_type_source)
  select 'Dữ liệu thử Mogi', 'thu-mogi', 'admin' where not exists (select 1 from sellers where zalo_user_id = 'thu-mogi');
  select id into ban from sellers where zalo_user_id = 'thu-mogi';
  with v as (
    select e->>'legacy' legacy, e->>'deal' deal, e->>'ptype' ptype, e->>'district' district, e->>'street' street,
           (e->>'area')::numeric area, e->>'price_raw' price_raw, e->>'descr' descr, (e->>'beds')::int beds, (e->>'baths')::int baths,
           (e->>'floors')::int floors, e->>'access' access, (e->>'alley')::numeric alley, e->>'legal' legal,
           (e->>'lat')::numeric lat, (e->>'lng')::numeric lng, e->>'tin_goc' tin_goc, e->>'url' url, e->>'dia_chi_goc' dia_chi_goc
      from jsonb_array_elements(ds) e
  ), p as (
    select v.*, public.phuong_tai_diem(v.lat, v.lng) as ward from v
     where not exists (select 1 from listings x where x.legacy_code = v.legacy)
  ), l as (
    insert into listings (seller_id, deal, district, ward, street, location_raw, area_m2, price_raw, description, source, status, property_type,
                          property_type_source, price_source, ward_source, bedrooms, bathrooms, floors, access_type, alley_width_m, legal_status,
                          lat, lng, toa_do_muc, geocode_at, legacy_code, boc_tach)
    select ban, p.deal::listing_deal, p.district, p.ward, p.street, concat_ws(', ', p.street, p.ward, p.district), p.area, p.price_raw, p.descr,
           'mogi_thu', 'cho_thong_tin', p.ptype::property_type, 'chu_xac_nhan', 'chu_xac_nhan', 'suy_doan', p.beds, p.baths, p.floors,
           p.access, p.alley, p.legal, p.lat, p.lng, 'phuong', now(), p.legacy,
           jsonb_build_object('duong', p.street, 'phuong', p.ward, 'quan', p.district, 'gia', p.price_raw, '_thong_so_ai', true)
      from p where p.ward is not null
    returning id, legacy_code
  ), nb as (
    insert into listing_noi_bo (listing_id, du_lieu)
    select l.id, jsonb_build_object('tin_goc', v.tin_goc, 'nguon', 'mogi', 'url', v.url, 'dia_chi_goc', v.dia_chi_goc)
      from l join v on v.legacy = l.legacy_code
    returning 1
  )
  select count(*) into n from nb;
  return n;
end $$;
revoke all on function public.nap_tin_mogi(jsonb) from public, anon, authenticated;
grant execute on function public.nap_tin_mogi(jsonb) to service_role;
notify pgrst, 'reload schema';
