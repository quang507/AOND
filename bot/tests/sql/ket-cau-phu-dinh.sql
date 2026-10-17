-- ket-cau-phu-dinh.sql — tầng phụ đi sau chữ phủ định là KHÔNG có (20261011a, SRS-5.1zzzzy). Ca gốc: "không có gác lửng ạ, 4 tầng
-- đầy đủ" từng thành "trệt + lửng + 3 lầu". Mỗi khẳng định sai → raise exception. Rollback cuối.
begin;
set local client_min_messages = warning;
create temp table ca (ten text, co text, mong text) on commit drop;
create function pg_temp.kt(p_ten text, p_co text, p_mong text) returns void language plpgsql as $$
begin insert into ca values (p_ten, coalesce(p_co, 'NULL'), p_mong); end $$;
select pg_temp.kt('ca gốc "không có gác lửng ạ, 4 tầng đầy đủ" → không lửng', boc_thong_so('không có gác lửng ạ, 4 tầng đầy đủ', 'nha_pho') ->> 'floors_text', 'trệt + 3 lầu');
select pg_temp.kt('cách nói mới "1 trệt 2 lầu ko lửng, ko sân thượng"', boc_thong_so('1 trệt 2 lầu ko lửng, ko sân thượng', 'nha_pho') ->> 'floors_text', 'trệt + 2 lầu');
select pg_temp.kt('"nhà 3 tầng chưa có hầm" → không hầm', boc_thong_so('nhà 3 tầng chưa có hầm', 'nha_pho') ->> 'floors_text', 'trệt + 2 lầu');
select pg_temp.kt('đối chứng "trệt lửng 2 lầu sân thượng" vẫn có lửng + sân thượng', boc_thong_so('trệt lửng 2 lầu sân thượng', 'nha_pho') ->> 'floors_text', 'trệt + lửng + 2 lầu + sân thượng');
select pg_temp.kt('đối chứng "có gác lửng, 3 lầu" vẫn có lửng', boc_thong_so('có gác lửng, 3 lầu', 'nha_pho') ->> 'floors_text', 'trệt + lửng + 3 lầu');
do $$ declare r record; n int := 0; begin
  for r in select * from ca loop
    if r.co is distinct from r.mong then raise warning 'SAI: % — có %, mong %', r.ten, r.co, r.mong; n := n + 1; end if;
  end loop;
  if n > 0 then raise exception '% ca sai', n; end if;
end $$;
rollback;
