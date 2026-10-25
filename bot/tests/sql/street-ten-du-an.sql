-- street-ten-du-an.sql — SRS-5.1zzzzzh (20261012c): căn hộ trong dự án, location_raw = tên dự án → cột street KHÔNG mang tên dự án.
-- Bắn production 12/10 (thu-kb-thue): "căn hộ Sunrise City quận 7" → street = "Sunrise City". Đỏ khi tắt bản sửa trong trigger.
begin;
set local client_min_messages = warning;
alter table listings disable trigger trg_listings_zz_toa_do;
alter table listings disable trigger trg_pe_listings;
insert into sellers (id, zalo_user_id, seller_type) values ('00000000-0000-0000-0000-0000000000c1', 'thu-sql-st', 'ccrb');
insert into projects (id, name, slug, district) values
  ('20000000-0000-0000-0000-0000000000c1', 'Sunrise City', 'sunrise-city-thu', 'Quận 7'),
  ('20000000-0000-0000-0000-0000000000c2', 'Thảo Điền Pearl', 'thao-dien-pearl-thu', 'Quận 2');
create temp table ca (ten text, co text, mong text) on commit drop;
create function pg_temp.kt(p_ten text, p_co text, p_mong text) returns void language plpgsql as $$
begin insert into ca values (p_ten, coalesce(p_co, 'NULL'), p_mong); end $$;
insert into listings (id, seller_id, deal, district, location_raw, project_id, status, property_type) values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'cho_thue', 'Quận 7', 'Sunrise City',
   '20000000-0000-0000-0000-0000000000c1', 'cho_thong_tin', 'chung_cu'),
  -- cách nói mới: tên dự án viết thường + kèm phường sau dấu phẩy
  ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 'ban', 'Quận 2', 'thảo điền pearl, phường 12',
   '20000000-0000-0000-0000-0000000000c2', 'cho_thong_tin', 'chung_cu'),
  -- đối chứng: nhà phố không dự án, location_raw là đường thật → street vẫn đọc ra
  ('10000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c1', 'ban', 'Quận 5', 'hẻm 120 Trần Hưng Đạo',
   null, 'cho_thong_tin', 'nha_pho');
select pg_temp.kt('căn hộ "Sunrise City" → street trống', street, 'NULL') from listings where id = '10000000-0000-0000-0000-0000000000c1';
select pg_temp.kt('"thảo điền pearl, phường 12" → street trống', street, 'NULL') from listings where id = '10000000-0000-0000-0000-0000000000c2';
select pg_temp.kt('đối chứng nhà phố "hẻm 120 Trần Hưng Đạo" → Trần Hưng Đạo', street, 'Trần Hưng Đạo') from listings where id = '10000000-0000-0000-0000-0000000000c3';
do $$ declare r record; n int := 0; begin
  for r in select * from ca loop
    if r.co is distinct from r.mong then raise warning 'SAI: % — có %, mong %', r.ten, r.co, r.mong; n := n + 1; end if;
  end loop;
  if n > 0 then raise exception '% ca sai', n; end if;
end $$;
rollback;
