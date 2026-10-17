-- nguong-hem.sql — ngưỡng suy LOẠI HẺM theo bề rộng (20261003a, SRS-5.1zi). Chủ chỉ nói số mét:
-- < 3m → hẻm xe máy; 3m ≤ rộng < 3,5m → `hem` (chưa rõ, không suy xe hơi); từ 3,5m → xe hơi; từ 6m → xe tải.
-- Chủ nói thẳng "hxh" / "xe hơi vào được" thì theo lời chủ. Mỗi khẳng định sai → raise exception. Rollback cuối.
begin;
set local client_min_messages = warning;
alter table listings disable trigger listing_insert_drip;
alter table listings disable trigger trg_listings_bao_tin_moi_khop;
alter table listings disable trigger trg_listings_zz_toa_do;
alter table listings disable trigger trg_pe_listings;
insert into sellers (id, zalo_user_id, seller_type) values ('00000000-0000-0000-0000-0000000000b1', 'thu-sql-hem', 'ccrb');
create temp table ca (ten text, co text, mong text) on commit drop;
create function pg_temp.kt(p_ten text, p_co text, p_mong text) returns void language plpgsql as $$
begin insert into ca values (p_ten, coalesce(p_co, 'NULL'), p_mong); end $$;
-- boc_thong_so (đọc câu rao)
select pg_temp.kt('rao "hẻm 2.5m" → hẻm xe máy', boc_thong_so('bán nhà hẻm 2.5m tân bình 4x12') ->> 'access_type', 'hem_xe_may');
select pg_temp.kt('rao "hẻm 3m" → hem (chưa rõ xe hơi)', boc_thong_so('bán nhà hẻm 3m tân bình 4x12') ->> 'access_type', 'hem');
select pg_temp.kt('rao "hẻm 3m" → vẫn ghi bề rộng 3', boc_thong_so('bán nhà hẻm 3m tân bình 4x12') ->> 'alley_width_m', '3');
select pg_temp.kt('rao "hẻm 3.5m" → hẻm xe hơi', boc_thong_so('bán nhà hẻm 3.5m bình thạnh') ->> 'access_type', 'hem_xe_hoi');
select pg_temp.kt('rao "hẻm 4m" → hẻm xe hơi', boc_thong_so('bán nhà hẻm 4m nguyễn trãi quận 5') ->> 'access_type', 'hem_xe_hoi');
select pg_temp.kt('rao "hẻm 6m" → hẻm xe tải', boc_thong_so('bán nhà hẻm 6m quận 10') ->> 'access_type', 'hem_xe_tai');
select pg_temp.kt('rao "hxh 3m" (chủ nói xe hơi) → hẻm xe hơi', boc_thong_so('bán nhà hxh 3m quận 8') ->> 'access_type', 'hem_xe_hoi');
-- listing_facts_sync_cols (câu trả lời ô "độ rộng hẻm")
insert into listings (id, seller_id, deal, district, description, status, property_type) values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'ban', 'Quận Tân Bình', 'bán nhà', 'cho_thong_tin', 'nha_pho'),
  ('10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'ban', 'Quận Tân Bình', 'bán nhà', 'cho_thong_tin', 'nha_pho');
select ghi_fact_listing('10000000-0000-0000-0000-0000000000b1', 'do_rong_hem', '3m', 'seller_chat');
select ghi_fact_listing('10000000-0000-0000-0000-0000000000b2', 'do_rong_hem', '4m', 'seller_chat');
select pg_temp.kt('đáp ô hẻm "3m" → hem / 3', access_type || '/' || alley_width_m::text, 'hem/3') from listings where id = '10000000-0000-0000-0000-0000000000b1';
select pg_temp.kt('đáp ô hẻm "4m" → hẻm xe hơi', access_type, 'hem_xe_hoi') from listings where id = '10000000-0000-0000-0000-0000000000b2';
do $$ declare r record; n int := 0; begin
  for r in select * from ca loop
    if r.co is distinct from r.mong then raise warning 'SAI: % — có %, mong %', r.ten, r.co, r.mong; n := n + 1; end if;
  end loop;
  if n > 0 then raise exception '% ca sai', n; end if;
end $$;
rollback;
