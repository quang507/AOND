-- 20261001d: dọn sạch sổ lỗi bot_errors (01/10/2026).
--
-- Chủ dự án 01/10: "lỗi Claude mới nhất trong sổ lỗi là 'Your credit balance is too low' — xoá cái sổ này đi". Lỗi hết
-- credit là chuyện cũ (bắn thử cùng ngày, 4/4 lượt AI gọi Claude thành công), nhưng vẫn nằm đầu sổ và bắn thử in nó ra
-- như lỗi đang có. Cùng cách 20260908e đã dọn (DELETE toàn bộ). Chạy lại vô hại: chỉ xoá dòng lỗi, không đụng schema.
delete from public.bot_errors;
