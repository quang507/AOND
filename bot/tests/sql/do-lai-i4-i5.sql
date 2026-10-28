-- do-lai-i4-i5.sql — SRS-5.1zzzzzzz240 (20261028e, chủ dự án 28/10/2026 OPEN-67 a). Đỏ khi: NMG có tin đang rao và nhắn bot trong 7 ngày
-- mà nmg_hoat_dong vẫn ra không hoạt động (đếm info_requests cũ); khách mua còn nhắn sau ngày 30 mà ket_noi_zalo_song không có / sai; ID thử
-- lọt vào I4.
begin;
set local client_min_messages = warning;
create or replace function auth.role() returns text language sql as $$ select 'service_role'::text $$;
set local session_replication_role = replica;
insert into sellers (id, zalo_user_id, seller_type) values ('00000000-0000-0000-0000-0000000000f1', 'zl-nmg-1', 'nmg');
insert into listings (id, code, seller_id, deal, district, description, status, property_type) values
  ('10000000-0000-0000-0000-0000000000f1', 'BDS-THU-SQL-I5', '00000000-0000-0000-0000-0000000000f1', 'ban', 'Quận 5', 'x', 'dang_ban', 'nha_pho');
insert into buyers (id, zalo_user_id, name) values
  ('00000000-0000-0000-0000-0000000000f2', 'zl-mua-song', 'A'),
  ('00000000-0000-0000-0000-0000000000f3', 'zl-mua-im', 'B'),
  ('00000000-0000-0000-0000-0000000000f4', 'thu-mua-song', 'C');
insert into conversations (id, buyer_id, seller_id) values
  ('20000000-0000-0000-0000-0000000000f1', null, '00000000-0000-0000-0000-0000000000f1'),
  ('20000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f2', null),
  ('20000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f3', null),
  ('20000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f4', null);
insert into messages (conversation_id, sender, body, created_at) values
  ('20000000-0000-0000-0000-0000000000f1', 'seller', 'x', now() - interval '2 days'),
  ('20000000-0000-0000-0000-0000000000f2', 'buyer', 'x', now() - interval '40 days'),
  ('20000000-0000-0000-0000-0000000000f2', 'buyer', 'x', now() - interval '3 days'),
  ('20000000-0000-0000-0000-0000000000f3', 'buyer', 'x', now() - interval '40 days'),
  ('20000000-0000-0000-0000-0000000000f3', 'buyer', 'x', now() - interval '35 days'),
  ('20000000-0000-0000-0000-0000000000f4', 'buyer', 'x', now() - interval '40 days'),
  ('20000000-0000-0000-0000-0000000000f4', 'buyer', 'x', now() - interval '1 days');

do $$ declare h record; begin
  select hoat_dong, drip_answered_7d into h from nmg_hoat_dong where id = '00000000-0000-0000-0000-0000000000f1';
  if h.hoat_dong is distinct from true or h.drip_answered_7d <> 1 then
    raise exception 'SAI (I5): NMG có tin + nhắn 2 ngày trước phải hoạt động, được % / %', h.hoat_dong, h.drip_answered_7d;
  end if;
end $$;

do $$ declare ds text; begin
  select string_agg(b.zalo_user_id || ':' || k.song_sau_30_ngay, ',' order by b.zalo_user_id) into ds
    from ket_noi_zalo_song k join buyers b on b.id = k.buyer_id;
  if ds is distinct from 'zl-mua-im:false,zl-mua-song:true' then
    raise exception 'SAI (I4): ket_noi_zalo_song ra %', ds;
  end if;
end $$;
rollback;
