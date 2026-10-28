-- 20261028g_anh_480 — SRS-5.1zzzzzzz241 (chủ dự án 28/10/2026, OPEN-38 phương án a): ảnh tin có thêm bản nhỏ cạnh dài 480px để lưới thẻ
-- tải nhẹ (biến đổi ảnh của Supabase là tính năng Pro). Bản nhỏ nằm cùng bucket, đường dẫn `<uuid tin>/480/<tên>.jpg`, ghi ở
-- `listing_media.variants` = {"480": "<đường dẫn>"}; lõi Python (kho_anh) và CRM (UploadAnh) sinh lúc tải lên. Ảnh cũ không có bản nhỏ:
-- `url_480` rơi về ảnh gốc.
alter table public.listing_media add column if not exists variants jsonb not null default '{}'::jsonb;
comment on column public.listing_media.variants is
  'Bản biến đổi của ảnh, cùng bucket: {"480": "<uuid tin>/480/<tên>.jpg"} (OPEN-38, SRS-5.1zzzzzzz241). Xoá dòng thì trigger xếp dọn cả bản nhỏ.';

-- Xoá / đổi đường dẫn ảnh thì xếp dọn cả các bản nhỏ (không để tệp mồ côi, FR-165 bất biến 5).
CREATE OR REPLACE FUNCTION public.listing_media_xep_hang_don()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    insert into media_cleanup_queue (bucket, storage_path)
    values (old.bucket, old.storage_path);
    insert into media_cleanup_queue (bucket, storage_path)
    select old.bucket, v.value from jsonb_each_text(coalesce(old.variants, '{}'::jsonb)) v where v.value <> '';
    return old;
  end if;
  if old.bucket is distinct from new.bucket
     or old.storage_path is distinct from new.storage_path then
    insert into media_cleanup_queue (bucket, storage_path)
    values (old.bucket, old.storage_path);
    insert into media_cleanup_queue (bucket, storage_path)
    select old.bucket, v.value from jsonb_each_text(coalesce(old.variants, '{}'::jsonb)) v
     where v.value <> '' and not (coalesce(new.variants, '{}'::jsonb) ? v.key and new.variants ->> v.key = v.value);
  end if;
  return new;
end $function$
;

create or replace view public.listing_photos_v with (security_invoker = true) as
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
  WHERE m.bucket = 'listing-public'::text AND (l.status = ANY (ARRAY['dang_ban'::text, 'dang_quan_tam'::text, 'da_coc'::text, 'da_chot'::text]));
