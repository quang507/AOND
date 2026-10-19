-- 20261019d — gỡ sáu công tắc app_config chỉ bot TypeScript đã gỡ đọc (docs/07 SRS-5.1zzzzzzz62; chủ dự án 19/10/2026: "kiểm tra
-- nếu ko xài dc thì xóa"). Soát: không hàm / view SQL nào đọc (dò 'khoá' trong pg_get_functiondef + pg_views; 'tro_ly' trong
-- boc_tach_nhom là tên khoá jsonb, không phải công tắc), lõi Python / web / bridge / edge function không đọc app_config các khoá này.
-- "hello" (reset) và "json" (xem dữ liệu) nằm cứng trong src/aioi/engine.py, không theo test_reset_hello / lenh_json.
-- Giá trị cũ chép sang luu_tru trước khi xoá.
create table if not exists luu_tru.app_config_ts_20261019 as select * from public.app_config where false;
insert into luu_tru.app_config_ts_20261019
  select * from public.app_config
   where key in ('bao_lai_da_luu', 'boc_tach_ai', 'lenh_json', 'luat_loi_bot', 'test_reset_hello', 'tro_ly');
delete from public.app_config
 where key in ('bao_lai_da_luu', 'boc_tach_ai', 'lenh_json', 'luat_loi_bot', 'test_reset_hello', 'tro_ly');
