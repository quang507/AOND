-- viewings-id-thu.sql — lịch hẹn / câu hỏi của ID thử không nhắn admin, không bắn cảnh báo ngoài (SRS-330, 02/11/2026).
-- Chạy trên DB thật (SQL Editor hoặc MCP execute_sql), TỰ CUỘN LẠI bằng `raise exception` — không để rác. Mọi dòng phải `OK`.
-- Đối chứng dương: khách THẬT (ID không khớp `la_id_thu`) vẫn được nhắc admin — không có ca này thì "0 nhắc" chỉ chứng minh trigger chết.
-- Gỡ dòng `if public.la_id_thu(v_uid) then return null` (hoặc dòng chặn trong trg_info_request_thong_bao_khach_hoi) → ca [thu] ra HONG.
do $$
declare
  o text := ''; l uuid; b_thu uuid; b_that uuid; n int; q0 bigint;
begin
  insert into listings (code, status, price_raw, ward) values ('VTHU-0001', 'dang_ban', '5 ty', 'Phuong 4') returning id into l;
  insert into buyers (zalo_user_id, name) values ('thu-330-viewings', 'Khach thu') returning id into b_thu;
  insert into buyers (zalo_user_id, name) values ('VTHU-THAT-330', 'Khach that') returning id into b_that;
  -- `ntfy_topic` chưa đặt thì canh_bao_ngoai thoát sớm → mọi ca hàng đợi đạt câm. Đặt tạm (cuộn lại cùng giao dịch: pg_net chỉ gửi
  -- dòng hàng đợi đã commit, nên không có tin nào ra ngoài).
  insert into app_config (key, value) values ('ntfy_topic', 'vthu-330-khong-gui') on conflict (key) do update set value = excluded.value;
  select count(*) into q0 from net.http_request_queue;

  insert into viewings (listing_id, buyer_id, status, time_text) values (l, b_thu, 'proposed', '9h mai');
  select count(*) into n from reminders where listing_id = l and kind = 'escalation';
  o := o || case when n = 0 then 'OK' else 'HONG' end || ' [thu]khong-nhac-admin(' || n || ') ';
  select count(*) into n from info_requests where listing_id = l and buyer_id = b_thu;
  o := o || case when n = 0 then 'OK' else 'HONG' end || ' [thu]khong-giao-xac-nhan-lich(' || n || ') ';
  select count(*) - q0 into n from net.http_request_queue;
  o := o || case when n = 0 then 'OK' else 'HONG' end || ' [thu]khong-email-khong-canh-bao(' || n || ') ';

  insert into info_requests (listing_id, buyer_id, question, status, source, assignee)
  values (l, b_thu, 'nha con khong', 'pending', 'buyer_ask', 'admin');
  select count(*) - q0 into n from net.http_request_queue;
  o := o || case when n = 0 then 'OK' else 'HONG' end || ' [thu]cau-hoi-khong-canh-bao-ngoai(' || n || ') | ';

  insert into viewings (listing_id, buyer_id, status, time_text) values (l, b_that, 'proposed', '10h mai');
  select count(*) into n from reminders where listing_id = l and kind = 'escalation' and viewing_id is not null;
  o := o || case when n = 1 then 'OK' else 'HONG' end || ' [dc]that-van-nhac-admin(' || n || ') ';
  select count(*) into n from info_requests where listing_id = l and buyer_id = b_that and question = 'xac_nhan_lich';
  o := o || case when n = 1 then 'OK' else 'HONG' end || ' [dc]that-van-giao-xac-nhan-lich(' || n || ') ';
  select count(*) - q0 into n from net.http_request_queue;
  o := o || case when n >= 1 then 'OK' else 'HONG' end || ' [dc]that-van-email(' || n || ') ';

  raise exception 'KQ: %', o;
end $$;
