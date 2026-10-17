-- 20261002b: CÔNG TẮC TRỢ LÝ CÓ CÔNG CỤ (nhánh người mua) — docs/07 SRS-5.1y.
--
-- Chủ dự án 02/10/2026: "mày để nó tương tác như 1 chatbot gắn crm bình thường… nghe hiểu các yêu cầu của khách, và ghi lại
-- vào crm" → "làm trợ lý có công cụ đi". chat-reply đọc `app_config.tro_ly` mỗi lượt mua (không nhớ tạm — đổi ở Table Editor
-- là có hiệu lực lượt kế):
--   tat (mặc định; không có dòng cũng là tắt) · thu = chỉ ID thử theo `la_id_thu` · bat = mọi khách mua.
-- Bật `thu` để bắn thử production bằng ID thử trước; khách thật vẫn đi đường cũ cho tới khi chủ dự án đổi sang `bat`.
insert into public.app_config (key, value, ghi_chu)
values ('tro_ly', 'thu', 'Trợ lý có công cụ nhánh mua (SRS-5.1y): tat | thu (chỉ ID thử, la_id_thu) | bat (mọi khách mua).')
on conflict (key) do nothing;
