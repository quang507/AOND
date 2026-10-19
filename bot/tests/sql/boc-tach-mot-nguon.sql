-- boc-tach-mot-nguon.sql — ô tin rao chỉ còn MỘT nguồn `listings.boc_tach` (20261019f, SRS-5.1zzzzzzz66). Trước bản này điểm tin,
-- văn bản nhúng vector và nở hậu đọc bảng `listing_facts` (chỉ bot TypeScript đã gỡ ghi) — lõi Python bóc ô nào cũng không tới.
-- Đỏ trên định nghĩa cũ: diem_tin không thấy thổ cư, van_ban_nhung không có lý do bán. Sai → raise exception. Rollback cuối.
begin;
set local client_min_messages = warning;
alter table listings disable trigger user;
insert into sellers (id, zalo_user_id, seller_type) values ('00000000-0000-0000-0000-0000000000c1', 'thu-sql-boc', 'ccrb');
insert into listings (id, code, seller_id, deal, district, description, status, property_type, location_raw, boc_tach) values
  ('10000000-0000-0000-0000-0000000000c1', 'THU-C1', '00000000-0000-0000-0000-0000000000c1', 'ban', 'Quận 5', 'bán đất', 'cho_thong_tin', 'dat',
   '12 Trần Bình Trọng', '{"dia_chi": "12 Trần Bình Trọng", "tho_cu": "60m2", "ly_do_ban": "định cư nước ngoài", "_cap_nhat": "x", "rong": ""}');
create temp table ca (ten text, co text, mong text) on commit drop;
insert into ca values
  ('o_boc_tach bỏ khoá nội bộ và ô trống',
   (select string_agg(k, ',' order by k) from jsonb_object_keys(o_boc_tach((select boc_tach from listings where id = '10000000-0000-0000-0000-0000000000c1'))) k),
   'dia_chi,ly_do_ban,tho_cu'),
  ('diem_tin: đất có thổ cư (ô lõi Python) → đủ 15 điểm khung',
   (select (diem_tin(l)->'chi_tiet'->>'ket_cau') from listings l where l.id = '10000000-0000-0000-0000-0000000000c1'), '15'),
  ('van_ban_nhung có ô chữ tự do (lý do bán)',
   (select (van_ban_nhung('10000000-0000-0000-0000-0000000000c1') like '%định cư nước ngoài%')::text), 'true'),
  ('van_ban_nhung không lặp địa chỉ từ ô dia_chi',
   (select ((length(v) - length(replace(v, '12 Trần Bình Trọng', ''))) / length('12 Trần Bình Trọng'))::text
      from van_ban_nhung('10000000-0000-0000-0000-0000000000c1') v), '1'),
  ('không còn bảng listing_facts', (to_regclass('public.listing_facts') is null)::text, 'true');
do $$ declare r record; n int := 0; begin
  for r in select * from ca loop
    if r.co is distinct from r.mong then raise warning 'SAI: % — có "%", mong "%"', r.ten, r.co, r.mong; n := n + 1; end if;
  end loop;
  if n > 0 then raise exception '% ca sai', n; end if;
end $$;
rollback;
