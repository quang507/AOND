-- 20260923f — FR-217 (d): công tắc RIÊNG cho lệnh test "/json".
-- Bản đầu dùng chung `test_reset_hello` — mà production đặt 0 (bật lên là "hello" xoá dữ liệu người nhắn),
-- nên muốn xem "/json" thì phải bật luôn cái xoá. Tách ra: lenh_json = bat | tat. Chủ dự án 23/09: "hiện tại vẫn
-- giai đoạn test" → bật. Chạy thật thì đặt tat.
insert into public.app_config (key, value, ghi_chu)
values ('lenh_json', 'bat', 'FR-217: bat | tat — nhắn "/json" trong Zalo thì bot in thứ đã lưu cho chính người nhắn (giai đoạn test).')
on conflict (key) do nothing;
