-- giao-lo.sql — giao_lo_cua / giao_lo_gan (20261018f, SRS-5.1zzzzzzz40). Dữ liệu mẫu dựng tay, rollback cuối. Sai → raise exception.
begin;
set local client_min_messages = warning;
delete from giao_lo;
insert into giao_lo (duong_a, duong_b, loai_a, loai_b, lat, lng, phuong, quan_cu, osm_node, nguon) values
  ('Lê Văn Sỹ', 'Trần Huy Liệu', 'duong', 'duong', 10.7900, 106.6800, 'Phường Nhiêu Lộc', 'Quận 3', 1, 'thu'),
  ('Lê Văn Sỹ', 'Trần Quang Diệu', 'duong', 'duong', 10.7930, 106.6800, 'Phường Nhiêu Lộc', 'Quận 3', 2, 'thu'),
  ('Hẻm 137 Lê Văn Sỹ', 'Lê Văn Sỹ', 'hem', 'duong', 10.7905, 106.6800, 'Phường Nhiêu Lộc', 'Quận 3', 3, 'thu'),
  ('Lê Văn Sỹ', 'Trần Huy Liệu', 'duong', 'duong', 10.8000, 106.6800, 'Phường Tân Sơn Hòa', 'Quận Tân Bình', 4, 'thu');
create temp table ca (ten text, co text, mong text) on commit drop;
insert into ca values
  ('ngã tư hai đường, thứ tự bất kỳ, không dấu, có tiền tố "đường"',
   (select string_agg(phuong, ' | ' order by phuong) from giao_lo_cua('đường tran huy lieu', 'Le Van Sy')),
   'Phường Nhiêu Lộc | Phường Tân Sơn Hòa'),
  ('có toạ độ thì ngã tư gần trước',
   (select phuong from giao_lo_cua('Lê Văn Sỹ', 'Trần Huy Liệu', 10.7990, 106.6800) limit 1), 'Phường Tân Sơn Hòa'),
  ('ngã tư gần một điểm, bỏ hẻm, gần trước',
   (select string_agg(duong_b || ' ' || round(cach_m)::text, ' | ' order by cach_m) from giao_lo_gan(10.7910, 106.6800, 400)),
   'Trần Huy Liệu 111 | Trần Quang Diệu 222'),
  ('giữ hẻm khi p_bo_hem = false',
   (select count(*)::text from giao_lo_gan(10.7910, 106.6800, 400, 5, false)), '3'),
  ('ngoài bán kính → rỗng', (select count(*)::text from giao_lo_gan(10.7000, 106.6000, 300)), '0'),
  ('hai đường không giao → rỗng', (select count(*)::text from giao_lo_cua('Lê Văn Sỹ', 'Nguyễn Trãi')), '0'),
  ('tên quá ngắn / rỗng → rỗng', (select count(*)::text from giao_lo_cua('', 'Lê Văn Sỹ')), '0');
do $$ declare r record; n int := 0; begin
  for r in select * from ca loop
    if r.co is distinct from r.mong then raise warning 'SAI: % — có "%", mong "%"', r.ten, r.co, r.mong; n := n + 1; end if;
  end loop;
  if n > 0 then raise exception '% ca sai', n; end if;
end $$;
rollback;
