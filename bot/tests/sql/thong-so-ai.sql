-- thong-so-ai.sql — tin do AI quyết thông số (dấu `_thong_so_ai`) thì regex DB không đè (20261002a, SRS-5.1v).
-- Mỗi khẳng định sai → raise exception (chay.sh báo ✗). Chạy trong một transaction rồi rollback.
begin;
set local client_min_messages = warning;
alter table listings disable trigger listing_insert_drip;
alter table listings disable trigger trg_listings_bao_tin_moi_khop;
alter table listings disable trigger trg_listings_zz_toa_do;
alter table listings disable trigger trg_pe_listings;
insert into sellers (id, zalo_user_id, seller_type) values ('00000000-0000-0000-0000-0000000000a1', 'thu-sql-1', 'ccrb');
create temp table ca (ten text, co text, mong text) on commit drop;
create function pg_temp.kt(p_ten text, p_co text, p_mong text) returns void language plpgsql as $$
begin insert into ca values (p_ten, coalesce(p_co, 'NULL'), p_mong); end $$;
-- Câu rao KCN "không có hẻm"
insert into listings (id, seller_id, deal, district, description, status, property_type, boc_tach) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'cho_thue', 'Quận Bình Tân',
   'cho thuê kho xưởng 500m2 trong KCN Tân Tạo, nằm trong khu công nghiệp nên không có hẻm', 'cho_thong_tin', 'kho_xuong', null),
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'cho_thue', 'Quận Bình Tân',
   'cho thuê kho xưởng 500m2 trong KCN Tân Tạo, nằm trong khu công nghiệp nên không có hẻm', 'cho_thong_tin', 'kho_xuong', '{"_thong_so_ai": true}'),
  ('10000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', 'ban', 'Quận 5', 'bán nhà', 'cho_thong_tin', 'nha_pho', '{"_thong_so_ai": true}');
select pg_temp.kt('rao "không có hẻm", tin AI quyết → access_type trống', access_type, 'NULL') from listings where id = '10000000-0000-0000-0000-0000000000a2';
select pg_temp.kt('rao "không có hẻm", tin cũ (luật đỡ) → như trước', access_type, 'hem') from listings where id = '10000000-0000-0000-0000-0000000000a1';
-- Chữ tự do không điền cột
select ghi_fact_listing('10000000-0000-0000-0000-0000000000a3', 'bo_sung', 'nhà mặt tiền nhưng không có hẻm sau, 2 lầu', 'seller_chat');
select pg_temp.kt('bổ sung "mặt tiền … 2 lầu" → không điền access_type / floors', coalesce(access_type, 'NULL') || '/' || coalesce(floors::text, 'NULL'), 'NULL/NULL')
  from listings where id = '10000000-0000-0000-0000-0000000000a3';
-- Ô đúng khoá vẫn điền
select ghi_fact_listing('10000000-0000-0000-0000-0000000000a3', 'phap_ly', 'sổ hồng riêng, đã hoàn công', 'ai_kiem');
select ghi_fact_listing('10000000-0000-0000-0000-0000000000a3', 'ket_cau', 'trệt + 2 lầu + sân thượng', 'ai_kiem');
select ghi_fact_listing('10000000-0000-0000-0000-0000000000a3', 'loai_duong_vao', 'hẻm xe hơi', 'ai_kiem');
select ghi_fact_listing('10000000-0000-0000-0000-0000000000a3', 'thang_may', 'không', 'ai_kiem');
select ghi_fact_listing('10000000-0000-0000-0000-0000000000a3', 'can_goc', 'có', 'ai_kiem');
select ghi_fact_listing('10000000-0000-0000-0000-0000000000a3', 'o_to_vao_nha', 'có', 'ai_kiem');
select pg_temp.kt('pháp lý → legal_status / has_completion', legal_status || '/' || has_completion::text, 'so_hong_rieng/true') from listings where id = '10000000-0000-0000-0000-0000000000a3';
select pg_temp.kt('kết cấu → floors / floors_text', floors::text || '/' || floors_text, '3/trệt + 2 lầu + sân thượng') from listings where id = '10000000-0000-0000-0000-0000000000a3';
select pg_temp.kt('loai_duong_vao "hẻm xe hơi" → access_type', access_type, 'hem_xe_hoi') from listings where id = '10000000-0000-0000-0000-0000000000a3';
select pg_temp.kt('thang_may "không" / can_goc "có" / o_to_vao_nha "có"', has_elevator::text || '/' || corner_lot::text || '/' || car_in_house::text, 'false/true/true')
  from listings where id = '10000000-0000-0000-0000-0000000000a3';
-- Luật ghi "không có thang máy" (tin cũ) — từng thành CÓ thang máy
select ghi_fact_listing('10000000-0000-0000-0000-0000000000a1', 'thang_may', 'không có thang máy', 'seller_chat');
select pg_temp.kt('"không có thang máy" → has_elevator false', has_elevator::text, 'false') from listings where id = '10000000-0000-0000-0000-0000000000a1';
do $$ declare r record; n int := 0; begin
  for r in select * from ca loop
    if r.co is distinct from r.mong then raise warning 'SAI: % — có %, mong %', r.ten, r.co, r.mong; n := n + 1; end if;
  end loop;
  if n > 0 then raise exception '% ca sai', n; end if;
end $$;
rollback;
