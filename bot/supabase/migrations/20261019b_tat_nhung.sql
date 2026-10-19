-- 20261019b — tắt hai lịch nhúng vector Gemini (docs/07 SRS-5.1zzzzzzz59; chủ dự án 19/10/2026: "làm sạch và cho hệ thống chạy
-- xuyên suốt"). Người đọc vector duy nhất là chat-reply TypeScript (tim_dia_danh_theo_nghia) — đã gỡ 18/10 (SRS-5.1zzzzzzz31/46);
-- lõi Python và web không tìm theo nghĩa. Hai lịch vẫn gọi Gemini mỗi 2 phút, hết hạn mức (429) và ghi sổ lỗi cho thứ không ai dùng.
-- GIỮ hàm, bảng việc và vector đã nhúng (~100 MB, chủ dự án quyết xoá hay giữ): bật lại = schedule lại hai lịch + tim_theo_nghia = bat.
select cron.unschedule(jobid) from cron.job where jobname in ('nhung-tick', 'nhung-dia-danh-tick');
update public.app_config set value = 'tat' where key = 'tim_theo_nghia';
