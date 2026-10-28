-- 20261028f_nguon_admin_xac_minh — SRS-5.1zzzzzzz241 (chủ dự án 28/10/2026, OPEN-31 phương án a): thêm bậc nguồn `admin_xac_minh` (admin
-- đã đối chiếu sổ / giấy tờ) cho ba cột nguồn của tin. CRM màn Sửa tin ghi giá trị này khi tick "Đã đối chiếu giấy tờ"; lõi Python không ghi
-- đè ô có nguồn `admin` / `admin_xac_minh`.
alter table public.listings drop constraint if exists listings_price_source_check;
alter table public.listings add constraint listings_price_source_check
  CHECK ((price_source = ANY (ARRAY['suy_doan'::text, 'chu_xac_nhan'::text, 'admin'::text, 'admin_xac_minh'::text])));
alter table public.listings drop constraint if exists listings_property_type_source_check;
alter table public.listings add constraint listings_property_type_source_check
  CHECK ((property_type_source = ANY (ARRAY['suy_doan'::text, 'chu_xac_nhan'::text, 'admin'::text, 'admin_xac_minh'::text])));
alter table public.listings drop constraint if exists listings_ward_source_check;
alter table public.listings add constraint listings_ward_source_check
  CHECK ((ward_source = ANY (ARRAY['suy_doan'::text, 'chu_xac_nhan'::text, 'admin'::text, 'admin_xac_minh'::text])));
comment on column public.listings.price_source is
  'Nguồn giá: suy_doan < chu_xac_nhan < admin < admin_xac_minh (admin đã đối chiếu giấy tờ, OPEN-31). admin / admin_xac_minh: lõi không ghi đè.';
