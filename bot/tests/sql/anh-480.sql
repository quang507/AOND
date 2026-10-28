-- anh-480.sql — SRS-5.1zzzzzzz241 (20261028g, OPEN-38 a). Đỏ khi: view ảnh không có url_480 (bản nhỏ, rơi về ảnh gốc khi chưa có); xoá dòng
-- ảnh mà bản nhỏ không được xếp dọn (tệp mồ côi).
begin;
set local client_min_messages = warning;
set local session_replication_role = replica;
insert into sellers (id, zalo_user_id, seller_type) values ('00000000-0000-0000-0000-0000000000b8', 'zl-480', 'ccrb');
insert into listings (id, code, seller_id, deal, district, description, status, property_type) values
  ('10000000-0000-0000-0000-0000000000b8', 'BDS-THU-SQL-480', '00000000-0000-0000-0000-0000000000b8', 'ban', 'Quận 5', 'x', 'dang_ban', 'nha_pho');
insert into listing_media (id, listing_id, bucket, storage_path, media_type, mime_type, variants) values
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b8', 'listing-public',
   '10000000-0000-0000-0000-0000000000b8/a.jpg', 'khac', 'image/jpeg', '{"480": "10000000-0000-0000-0000-0000000000b8/480/a.jpg"}'),
  ('30000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-0000000000b8', 'listing-public',
   '10000000-0000-0000-0000-0000000000b8/b.jpg', 'khac', 'image/jpeg', '{}');
set local session_replication_role = origin;
insert into app_config (key, value) values ('storage_public_base_url', 'https://kho.vd/storage/v1/object/public')
  on conflict (key) do update set value = excluded.value;

do $$ declare a text; b text; begin
  select url_480 into a from listing_photos_v where media_id = '30000000-0000-0000-0000-0000000000b1';
  select url_480 into b from listing_photos_v where media_id = '30000000-0000-0000-0000-0000000000b2';
  if a is null or b is null or a not like '%/listing-public/10000000-0000-0000-0000-0000000000b8/480/a.jpg' or b not like '%/b.jpg' then
    raise exception 'SAI (view): url_480 = % / %', a, b;
  end if;
end $$;

delete from listing_media where id = '30000000-0000-0000-0000-0000000000b1';
do $$ declare n int; begin
  select count(*) into n from media_cleanup_queue where storage_path = '10000000-0000-0000-0000-0000000000b8/480/a.jpg';
  if n <> 1 then raise exception 'SAI (dọn): bản nhỏ không được xếp dọn (% dòng)', n; end if;
end $$;
rollback;
