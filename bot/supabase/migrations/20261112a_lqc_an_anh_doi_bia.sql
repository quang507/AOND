-- SRS-5.1zzzzzzz425 (12/11/2026): LQC mảng Ảnh — ẩn ảnh xấu khi chủ đồng ý, đổi ảnh bìa sang tấm đẹp nhất.
-- Ẩn KHÔNG xoá file: cột `an_khoi_web`, view `listing_photos_v` (web + bot đọc chung) lọc ra. Ảnh bìa ẩn thì chọn lại bìa.

alter table public.listing_media add column if not exists an_khoi_web boolean not null default false;

-- Chọn bìa: bỏ qua khi đang đổi bìa có chủ đích (`aond.doi_bia`), bìa đang ẩn thì gỡ và chọn tấm hiện đầu tiên.
create or replace function public.listing_media_chon_bia(p_listing_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if coalesce(current_setting('aond.doi_bia', true), '') = '1' then
    return;
  end if;
  if exists (select 1 from listing_media where listing_id = p_listing_id and is_cover and not an_khoi_web) then
    return;
  end if;
  perform set_config('aond.doi_bia', '1', true);
  update listing_media set is_cover = false where listing_id = p_listing_id and is_cover;
  select id into v_id from listing_media
   where listing_id = p_listing_id and bucket = 'listing-public' and not an_khoi_web
   order by sort_order, created_at, id limit 1;
  if v_id is not null then
    update listing_media set is_cover = true where id = v_id;
  end if;
  perform set_config('aond.doi_bia', '', true);
end $function$;

drop trigger if exists trg_listing_media_bia on public.listing_media;
create trigger trg_listing_media_bia after insert or delete or update of is_cover, bucket, sort_order, an_khoi_web
  on public.listing_media for each row execute function listing_media_giu_bia();

-- Đặt bìa theo đường dẫn ảnh (Image LQC chọn tấm đẹp nhất). Một bìa mỗi tin (index listing_media_mot_bia_idx).
create or replace function public.dat_anh_bia(p_listing_id uuid, p_storage_path text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  select id into v_id from listing_media
   where listing_id = p_listing_id and storage_path = p_storage_path and bucket = 'listing-public' and not an_khoi_web;
  if v_id is null then
    return false;
  end if;
  perform set_config('aond.doi_bia', '1', true);
  update listing_media set is_cover = false where listing_id = p_listing_id and is_cover and id <> v_id;
  update listing_media set is_cover = true where id = v_id and not is_cover;
  perform set_config('aond.doi_bia', '', true);
  return true;
end $function$;

-- Ẩn / hiện lại một ảnh (chủ nhà đồng ý trong chat). Bìa bị ẩn → trigger chọn bìa mới.
create or replace function public.an_anh_tin(p_listing_id uuid, p_storage_path text, p_an boolean default true)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update listing_media set an_khoi_web = p_an
   where listing_id = p_listing_id and storage_path = p_storage_path and an_khoi_web is distinct from p_an;
  return found;
end $function$;

revoke all on function public.dat_anh_bia(uuid, text) from public, anon, authenticated;
revoke all on function public.an_anh_tin(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.dat_anh_bia(uuid, text) to service_role;
grant execute on function public.an_anh_tin(uuid, text, boolean) to service_role;

create or replace view public.listing_photos_v as
 SELECT l.code,
    (((url_kho_anh() || '/'::text) || m.bucket) || '/'::text) || m.storage_path AS url,
    m.storage_path AS path,
    m.sort_order,
    m.is_cover,
    m.created_at,
    m.listing_id,
    m.id AS media_id,
    l.legacy_code,
    (((url_kho_anh() || '/'::text) || m.bucket) || '/'::text) || COALESCE(NULLIF(m.variants ->> '480'::text, ''::text), m.storage_path) AS url_480
   FROM listing_media m
     JOIN listings l ON l.id = m.listing_id
  WHERE m.bucket = 'listing-public'::text AND NOT m.an_khoi_web
    AND (l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text, 'da_chot'::text]));
