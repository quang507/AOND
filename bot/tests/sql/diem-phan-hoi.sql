-- diem-phan-hoi.sql — điểm phản hồi chỉ đo lượt bot CHỦ ĐỘNG, cần ≥ 5 lượt mới vào điểm người rao (20261006c, SRS-5.1zzx).
-- Ca gốc: người bán mới rao căn đầu, chat liên tục với bot → phản hồi 100 → hạng Vàng ngay lần đầu.
begin;
set local client_min_messages = warning;
create or replace function auth.role() returns text language sql as $$ select 'service_role'::text $$;
-- bài này chỉ đo hàm điểm: tắt mọi trigger (hội thoại mới gọi chon_ctv, tin mới xếp nhắc…), khoá ngoại vẫn chạy
set local session_replication_role = replica;
insert into sellers (id, zalo_user_id, seller_type) values
  ('00000000-0000-0000-0000-0000000000c1', 'thu-sql-ph1', 'ccrb'),
  ('00000000-0000-0000-0000-0000000000c2', 'thu-sql-ph2', 'ccrb'),
  ('00000000-0000-0000-0000-0000000000c3', 'thu-sql-ph3', 'ccrb');
insert into conversations (id, seller_id) values
  ('20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1'),
  ('20000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2'),
  ('20000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c3');
insert into listings (id, code, seller_id, deal, district, description, status, property_type) values
  ('10000000-0000-0000-0000-0000000000c1', 'BDS-THU-SQL-PH1', '00000000-0000-0000-0000-0000000000c1', 'ban', 'Quận 5', 'bán nhà hẻm', 'dang_ban', 'nha_pho');

-- (1) Lần rao đầu: 10 lượt chủ nhắn → bot đáp sau 2 giây → chủ nhắn tiếp sau 20 giây. Không lượt nào chủ động.
insert into messages (conversation_id, sender, body, created_at, seq) overriding system value
select '20000000-0000-0000-0000-0000000000c1', s.sender::msg_sender, 'x',
       now() - interval '20 days' + (i * interval '22 seconds') + case when s.sender = 'bot' then interval '2 seconds' else interval '0' end,
       i * 2 + case when s.sender = 'bot' then 1 else 0 end
  from generate_series(1, 10) i, (values ('seller'), ('bot')) s(sender);
do $$ declare ph jsonb; nb jsonb; begin
  ph := diem_phan_hoi('00000000-0000-0000-0000-0000000000c1');
  if (ph->>'so_luot')::int <> 0 then raise exception 'SAI (1): lượt bot đáp ngay khi chủ đang chat bị đếm: %', ph; end if;
  nb := diem_nguoi_ban('00000000-0000-0000-0000-0000000000c1');
  if nb->>'diem_phan_hoi' is not null or (nb->>'diem')::numeric <> round((nb->>'diem_tb')::numeric) then
    raise exception 'SAI (1): người rao mới phải chấm 100%% hoàn chỉnh, được %', nb;
  end if;
end $$;

-- (2) Thêm 4 lượt bot chủ động (chủ im 3 ngày), chủ trả lời sau 10 phút → 4 lượt: vẫn chưa đủ 5, chưa tính vào điểm.
insert into messages (conversation_id, sender, body, created_at, seq) overriding system value
select '20000000-0000-0000-0000-0000000000c1', s.sender::msg_sender, 'y',
       now() - interval '15 days' + (i * interval '3 days') + case when s.sender = 'seller' then interval '10 minutes' else interval '0' end,
       100 + i * 2 + case when s.sender = 'seller' then 1 else 0 end
  from generate_series(0, 3) i, (values ('bot'), ('seller')) s(sender);
do $$ declare ph jsonb; nb jsonb; begin
  ph := diem_phan_hoi('00000000-0000-0000-0000-0000000000c1');
  if (ph->>'so_luot')::int <> 4 or (ph->>'diem')::int <> 100 then raise exception 'SAI (2): mong 4 lượt chủ động / 100, được %', ph; end if;
  nb := diem_nguoi_ban('00000000-0000-0000-0000-0000000000c1');
  if nb->>'diem_phan_hoi' is not null then raise exception 'SAI (2): 4 lượt đã tính vào điểm người rao: %', nb; end if;
end $$;

-- (3) Lượt thứ 5 → đủ, điểm phản hồi vào điểm người rao.
insert into messages (conversation_id, sender, body, created_at, seq) overriding system value values
  ('20000000-0000-0000-0000-0000000000c1', 'bot', 'z', now() - interval '2 days', 200),
  ('20000000-0000-0000-0000-0000000000c1', 'seller', 'z', now() - interval '2 days' + interval '5 minutes', 201);
do $$ declare nb jsonb; begin
  nb := diem_nguoi_ban('00000000-0000-0000-0000-0000000000c1');
  if (nb->>'diem_phan_hoi')::int is distinct from 100 or (nb->>'so_luot_phan_hoi')::int <> 5 then
    raise exception 'SAI (3): 5 lượt chủ động phải tính, được %', nb;
  end if;
end $$;

-- (4) Chủ lờ 5 tin nhắc liền nhau (mỗi tin cách 2 ngày, không trả lời) → 5 lượt, điểm 0. Trước đây lượt bị tin bot kế "nuốt".
insert into messages (conversation_id, sender, body, created_at, seq) overriding system value
select '20000000-0000-0000-0000-0000000000c2', 'bot', 'nhac', now() - interval '20 days' + (i * interval '2 days'), 1000 + i
  from generate_series(0, 5) i;
do $$ declare ph jsonb; begin
  ph := diem_phan_hoi('00000000-0000-0000-0000-0000000000c2');
  if (ph->>'so_luot')::int <> 6 or (ph->>'diem')::int <> 0 then raise exception 'SAI (4): mong 6 lượt lờ / 0 điểm, được %', ph; end if;
end $$;

-- (5) Một lượt bot nhiều bong bóng (cách nhau 1 giây) chỉ là MỘT lượt.
insert into messages (conversation_id, sender, body, created_at, seq) overriding system value values
  ('20000000-0000-0000-0000-0000000000c3', 'bot', 'a', now() - interval '10 days', 2001),
  ('20000000-0000-0000-0000-0000000000c3', 'bot', 'b', now() - interval '10 days' + interval '1 second', 2002),
  ('20000000-0000-0000-0000-0000000000c3', 'seller', 'c', now() - interval '10 days' + interval '2 hours', 2003);
do $$ declare ph jsonb; begin
  ph := diem_phan_hoi('00000000-0000-0000-0000-0000000000c3');
  if (ph->>'so_luot')::int <> 1 or (ph->>'diem')::int <> 80 then raise exception 'SAI (5): mong 1 lượt / 80, được %', ph; end if;
end $$;
rollback;
