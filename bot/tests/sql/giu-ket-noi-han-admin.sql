-- giu-ket-noi-han-admin.sql — SRS-5.1zzzzzzz238 (20261028c, chủ dự án 28/10/2026: "làm lại tin chống xoá kết nối", "hạn admin trả lời
-- câu khách hỏi 5 giờ"). Đỏ khi: câu khách hỏi giao admin không có hạn 5 giờ; khách im 6–7 ngày không được chọn nhắn giữ kết nối; khách
-- im chưa tới 6 ngày / quá 7 ngày / ID thử / đã nhắn rồi vẫn bị chọn.
begin;
set local client_min_messages = warning;
create or replace function auth.role() returns text language sql as $$ select 'service_role'::text $$;
set local session_replication_role = replica;   -- dựng dữ liệu: tắt trigger (tin mới xếp nhắc, gọi mạng…), khoá ngoại vẫn chạy
insert into sellers (id, zalo_user_id, seller_type) values
  ('00000000-0000-0000-0000-0000000000d1', null, 'ccrb'),                  -- chủ nhà không có Zalo → câu hỏi giao admin
  ('00000000-0000-0000-0000-0000000000d2', 'zl-ban-6ngay', 'ccrb');
insert into buyers (id, zalo_user_id, name) values
  ('00000000-0000-0000-0000-0000000000e1', 'zl-mua-6ngay', 'A'),
  ('00000000-0000-0000-0000-0000000000e2', 'zl-mua-3ngay', 'B'),
  ('00000000-0000-0000-0000-0000000000e3', 'zl-mua-8ngay', 'C'),
  ('00000000-0000-0000-0000-0000000000e4', 'thu-mua-6ngay', 'D'),
  ('00000000-0000-0000-0000-0000000000e5', 'zl-mua-danhan', 'E');
insert into listings (id, code, seller_id, deal, district, description, status, property_type) values
  ('10000000-0000-0000-0000-0000000000d1', 'BDS-THU-SQL-GK1', '00000000-0000-0000-0000-0000000000d1', 'ban', 'Quận 5', 'x', 'dang_ban', 'nha_pho');
insert into conversations (id, buyer_id, seller_id) values
  ('20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', null),
  ('20000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e2', null),
  ('20000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e3', null),
  ('20000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e4', null),
  ('20000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000e5', null),
  ('20000000-0000-0000-0000-0000000000d2', null, '00000000-0000-0000-0000-0000000000d2');
insert into messages (conversation_id, sender, body, created_at) values
  ('20000000-0000-0000-0000-0000000000e1', 'buyer', 'x', now() - interval '6 days 3 hours'),
  ('20000000-0000-0000-0000-0000000000e1', 'bot', 'x', now() - interval '6 days 2 hours'),
  ('20000000-0000-0000-0000-0000000000e2', 'buyer', 'x', now() - interval '3 days'),
  ('20000000-0000-0000-0000-0000000000e3', 'buyer', 'x', now() - interval '8 days'),
  ('20000000-0000-0000-0000-0000000000e4', 'buyer', 'x', now() - interval '6 days 3 hours'),
  ('20000000-0000-0000-0000-0000000000e5', 'buyer', 'x', now() - interval '6 days 3 hours'),
  ('20000000-0000-0000-0000-0000000000d2', 'seller', 'x', now() - interval '6 days 5 hours');
insert into reminders (kind, buyer_id, due_at, note, status, created_at) values
  ('reengage', '00000000-0000-0000-0000-0000000000e5', now() - interval '1 day', 'giu_ket_noi: đã nhắn', 'sent', now() - interval '1 day');

-- (1) Ai cần tin giữ kết nối: chỉ khách mua im 6 ngày (e1) và người bán im 6 ngày (d2), đúng vai.
do $$ declare ds text; begin
  select string_agg(zalo_user_id || ':' || vai, ',' order by zalo_user_id) into ds from khach_can_giu_ket_noi();
  if ds is distinct from 'zl-ban-6ngay:seller,zl-mua-6ngay:buyer' then
    raise exception 'SAI (1): khach_can_giu_ket_noi ra %', ds;
  end if;
end $$;

-- (2) Câu khách hỏi mà chủ nhà không có Zalo → giao admin, hạn 5 giờ (cấu hình admin_han_gio).
set local session_replication_role = origin;
insert into info_requests (id, listing_id, buyer_id, question, status, source)
values ('30000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1',
        'sổ riêng không', 'pending', 'buyer_ask');
do $$ declare q record; begin
  select assignee, sla_due_at into q from info_requests where id = '30000000-0000-0000-0000-0000000000d1';
  if q.assignee <> 'admin' or q.sla_due_at is null
     or abs(extract(epoch from q.sla_due_at - (now() + interval '5 hours'))) > 60 then
    raise exception 'SAI (2): câu giao admin phải có hạn 5 giờ, được % / %', q.assignee, q.sla_due_at;
  end if;
end $$;
rollback;
