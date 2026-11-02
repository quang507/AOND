-- tim-nha-uy-tin.sql — tim_nha: cùng mức khớp thì người rao hạng cao xếp trước; hạng KHÔNG thắng mức khớp (SRS-5.1zzzzzzz361).
-- Chạy trên DB thật (SQL Editor / MCP execute_sql), TỰ CUỘN LẠI bằng `raise exception`. Mọi dòng phải `OK`.
-- Hạng người rao thật phụ thuộc điểm mọi tin của họ — khó dựng; bài này THAY TẠM `hang_so_nguoi_ban` (cùng giao dịch, cuộn lại) để cố
-- định hạng: người rao 'thu-361-vang' = 3, còn lại = 1. Tắt bản sửa (tim_nha cũ, xếp phụ theo updated_at) → ca [uy-tin] ra HONG vì căn
-- của người Đồng cập nhật SAU nên đứng trước.
do $$
declare
  o text := ''; n int; s_vang uuid; s_dong uuid; l_vang uuid; l_dong uuid; l_khop uuid; ds uuid[];
begin
  -- Trigger tin thiếu ô ép trạng thái về `cho_thong_tin` (tim_nha bỏ qua) và đặt lại updated_at — tắt trigger trong giao dịch này
  -- (cuộn lại cùng `raise`) để dựng đúng hai căn "đang bán" cùng mức khớp, khác thời điểm cập nhật.
  set local session_replication_role = replica;
  -- Bản thay tạm nằm TRONG khối do: `raise` cuối khối cuộn lại cả nó, dù file chạy kiểu mỗi câu một giao dịch.
  execute $s$create or replace function public.hang_so_nguoi_ban(p_seller_id uuid) returns integer language sql stable as $f$
    select case when (select zalo_user_id from public.sellers where id = p_seller_id) = 'thu-361-vang' then 3 else 1 end $f$ $s$;
  insert into sellers (zalo_user_id, name, seller_type) values ('thu-361-vang', 'Nguoi rao vang', 'ccrb') returning id into s_vang;
  insert into sellers (zalo_user_id, name, seller_type) values ('thu-361-dong', 'Nguoi rao dong', 'ccrb') returning id into s_dong;
  -- Hai căn cùng mức khớp (đúng khu = 3); căn của người Đồng cập nhật SAU.
  insert into listings (code, seller_id, status, deal, street, price_vnd, area_m2, updated_at)
    values ('T361VANG', s_vang, 'dang_ban', 'ban', 'Duong VTHU361', 5000000000, 40, now() - interval '2 day') returning id into l_vang;
  insert into listings (code, seller_id, status, deal, street, price_vnd, area_m2, updated_at)
    values ('T361DONG', s_dong, 'dang_ban', 'ban', 'Duong VTHU361', 5000000000, 40, now() - interval '1 day') returning id into l_dong;

  select array_agg((t.can->>'id')::uuid) into ds from public.tim_nha('ban', p_khu => 'VTHU361', p_limit => 2) t;
  o := o || case when ds[1] = l_vang then 'OK' else 'HONG' end || ' [uy-tin]cung-muc-khop-vang-truoc ';
  o := o || case when ds[2] = l_dong then 'OK' else 'HONG' end || ' [uy-tin]dong-xep-sau ';

  -- Căn người Đồng khớp HƠN (thêm đủ diện tích) → vẫn đứng đầu: hạng không thắng mức khớp.
  insert into listings (code, seller_id, status, deal, street, price_vnd, area_m2, updated_at)
    values ('T361KHOP', s_dong, 'dang_ban', 'ban', 'Duong VTHU361', 5000000000, 80, now() - interval '3 day') returning id into l_khop;
  select array_agg((t.can->>'id')::uuid) into ds from public.tim_nha('ban', p_khu => 'VTHU361', p_dt_min => 60, p_limit => 3) t;
  o := o || case when ds[1] = l_khop then 'OK' else 'HONG' end || ' [khop]khop-hon-van-dau-du-hang-dong ';
  o := o || case when ds[2] = l_vang then 'OK' else 'HONG' end || ' [uy-tin]sau-do-van-vang-truoc ';

  -- Hạng không lộ ra kết quả.
  select count(*) into n from public.tim_nha('ban', p_khu => 'VTHU361', p_limit => 3) t where t.can ? 'hang' or t.can ? 'hang_so';
  o := o || case when n = 0 then 'OK' else 'HONG' end || ' [an]hang-khong-ra-ket-qua ';
  raise exception 'KQ: %', o;
end $$;
