-- 20261025a — Bỏ gán CTV cho hội thoại (SRS-5.1zzzzzzz172, chủ dự án 24/10/2026: "Bỏ luôn assign_ctv_round_robin đi"; "sau khi chốt thì admin tự báo
-- qua zalo đến ctv để dẫn khách sau, ko cần bot làm đoạn này nữa").
-- Trigger `trg_conversations_assign_ctv` (BEFORE INSERT trên `conversations`) gọi `assign_ctv_round_robin` để điền `conversations.ctv_id` theo vòng.
-- Sau SRS-165 / SRS-170 không còn đường nhắc nào đọc cột đó để giao việc (lịch xem và câu khách hỏi đều đi thẳng admin), nên gỡ cả trigger lẫn hàm.
-- Giữ nguyên: cột `conversations.ctv_id` + dữ liệu cũ (`ctv_dang_ganh` còn đếm), hàm `chon_ctv` (không đụng ở đây).
drop trigger if exists trg_conversations_assign_ctv on public.conversations;
drop function if exists public.assign_ctv_round_robin();
