-- 20261010a — nạp lại dòng duy nhất của bridge_dang_nhap (SRS-5.1zzzzs).
--
-- Bảng một dòng (check id = 1) mà dòng đó chỉ được tạo trong 20260911b. Dựng lại project 08/10/2026 chỉ nạp schema.sql
-- (không replay migration) và bước `du-lieu` của scripts/dung-lai-db.mjs khi đó chỉ quét 5 bảng tham chiếu — dòng id=1 mất.
-- Hậu quả: escalation-feed `update … where id = 1` trúng 0 dòng (không lỗi), ô "Zalo clone" ở /admin trống, nút
-- "Đăng nhập lại" bị khoá vì không đọc được dòng nào, yeu_cau_quet_lai_zalo() cũng update 0 dòng.
-- Chạy lại được.

insert into public.bridge_dang_nhap (id) values (1) on conflict (id) do nothing;
