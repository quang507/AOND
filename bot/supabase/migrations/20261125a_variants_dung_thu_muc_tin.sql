-- 25/11/2026 (audit ECC P0-1, SRS-5.1zzzzzzz538): người dùng web nào cũng tự tạo được tin (`/quan-ly`) rồi chèn dòng
-- listing_media cho tin mình — storage_path bị CHECK ràng vào `<uuid tin>/`, nhưng cột variants thì không ràng gì.
-- Đặt variants = {"480": "<uuid tin người khác>/<tệp>"} (hoặc "../listing-private/<uuid>/<tệp>"), xoá dòng →
-- trigger listing_media_xep_hang_don xếp tệp đó vào media_cleanup_queue → cron media-cleanup xoá thật bằng service_role.
-- storage_path cũng lọt nếu viết `..` dạng mã hoá `%2e%2e`: CHECK chỉ chặn `..` trần, còn URL tự giải `%2e%2e` thành
-- bước lùi thư mục.
-- Sửa: MỘT luật cho mọi khoá tệp của dòng — nằm trong `<uuid tin>/`, chỉ A-Z a-z 0-9 . _ - /, không `..` / `//`
-- (đúng tập ký tự kho_anh._khoa_an_toan, UploadAnh, xoa_logo, che_so đang ghi); hàng dọn chỉ nhận khoá qua luật đó.
-- media-cleanup (cùng SRS) kiểm lại khuôn và mã hoá từng đoạn trước khi gọi Storage.
-- Dữ liệu cũ: listing_media 0 dòng lúc áp (25/11/2026) — không dòng nào phải sửa.

create or replace function public.duong_dan_media_hop_le(p_listing_id uuid, p_duong text)
 returns boolean
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select coalesce(starts_with(p_duong, p_listing_id::text || '/')
                  and p_duong ~ '^[A-Za-z0-9._/-]+$'
                  and p_duong !~ '(\.\.)|(//)', false)
$function$;
comment on function public.duong_dan_media_hop_le(uuid, text) is
  'Khoá tệp của một dòng listing_media (storage_path, mọi giá trị variants) phải nằm trong thư mục <uuid tin>/, chỉ A-Z a-z 0-9 . _ - /, không .. hay // (SRS-5.1zzzzzzz538, audit ECC P0-1).';
revoke all on function public.duong_dan_media_hop_le(uuid, text) from public, anon, authenticated;
grant execute on function public.duong_dan_media_hop_le(uuid, text) to service_role;

-- storage_path: thêm ràng tập ký tự (chặn %2e%2e, \, khoảng trắng…) bên cạnh hai CHECK cũ.
alter table public.listing_media drop constraint if exists listing_media_duong_dan_ky_tu;
alter table public.listing_media add constraint listing_media_duong_dan_ky_tu CHECK ((storage_path ~ '^[A-Za-z0-9._/-]+$'::text));
comment on constraint listing_media_duong_dan_ky_tu on public.listing_media is
  'Khoá Storage chỉ gồm A-Z a-z 0-9 . _ - / — `%2e%2e` không lọt thành bước lùi thư mục khi media-cleanup ghép URL (SRS-5.1zzzzzzz538).';

-- variants: mọi giá trị là chuỗi, rỗng hoặc qua duong_dan_media_hop_le(listing_id, …).
create or replace function public.listing_media_kiem_variants()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v record;
begin
  if jsonb_typeof(new.variants) is distinct from 'object' then
    raise exception 'listing_media: variants phai la object {ten: "<uuid tin>/..."}' using errcode = 'check_violation';
  end if;
  for v in select e.key, e.value from jsonb_each(new.variants) e loop
    if jsonb_typeof(v.value) <> 'string' then
      raise exception 'listing_media: variants.% phai la chuoi', v.key using errcode = 'check_violation';
    end if;
    if v.value #>> '{}' <> '' and not duong_dan_media_hop_le(new.listing_id, v.value #>> '{}') then
      raise exception 'listing_media: variants.% tro ra ngoai thu muc %/', v.key, new.listing_id using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $function$;
comment on function public.listing_media_kiem_variants() is
  'BEFORE INSERT/UPDATE listing_media: giá trị variants phải nằm trong thư mục tin của dòng — trigger dọn tệp xoá theo giá trị này (SRS-5.1zzzzzzz538, audit ECC P0-1).';
revoke all on function public.listing_media_kiem_variants() from public, anon, authenticated;
grant execute on function public.listing_media_kiem_variants() to service_role;

drop trigger if exists trg_listing_media_kiem_variants on public.listing_media;
create trigger trg_listing_media_kiem_variants before insert or update of listing_id, variants on public.listing_media
  for each row execute function public.listing_media_kiem_variants();

-- Hàng dọn: chỉ xếp khoá qua luật — lớp chặn thứ hai cho dòng nào lọt luật trên (vd trigger từng bị tắt).
create or replace function public.listing_media_xep_hang_don()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Chi xep khoa nam trong thu muc tin cua chinh dong nay (SRS-5.1zzzzzzz538): dong do nguoi dung web chen
  -- khong duoc nham tep cua tin khac.
  if tg_op = 'DELETE' then
    insert into media_cleanup_queue (bucket, storage_path)
    select old.bucket, old.storage_path where duong_dan_media_hop_le(old.listing_id, old.storage_path);
    insert into media_cleanup_queue (bucket, storage_path)
    select old.bucket, v.value from jsonb_each_text(coalesce(old.variants, '{}'::jsonb)) v
     where v.value <> '' and duong_dan_media_hop_le(old.listing_id, v.value);
    return old;
  end if;
  if old.bucket is distinct from new.bucket
     or old.storage_path is distinct from new.storage_path then
    insert into media_cleanup_queue (bucket, storage_path)
    select old.bucket, old.storage_path where duong_dan_media_hop_le(old.listing_id, old.storage_path);
    insert into media_cleanup_queue (bucket, storage_path)
    select old.bucket, v.value from jsonb_each_text(coalesce(old.variants, '{}'::jsonb)) v
     where v.value <> '' and duong_dan_media_hop_le(old.listing_id, v.value)
       and not (coalesce(new.variants, '{}'::jsonb) ? v.key and new.variants ->> v.key = v.value);
  end if;
  return new;
end $function$;
