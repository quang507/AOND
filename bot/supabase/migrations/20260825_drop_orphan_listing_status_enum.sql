-- Bản tham chiếu của migration đã áp lên project tbcdpupiarkuxtntmosl.
-- Dọn schema dư: type enum `listing_status` (unverified/draft/pending_review/
-- active/negotiating/sold/expired) là vòng đời CŨ bằng tiếng Anh. Từ FR-139
-- (25/08) listings.status đã đổi sang text tiếng Việt + CHECK
-- ('cho_thong_tin','dang_ban','dang_quan_tam','da_chot','an'), không cột nào
-- còn dùng type này nữa. DROP không CASCADE — còn ai phụ thuộc là lỗi ngay.
drop type if exists public.listing_status;
