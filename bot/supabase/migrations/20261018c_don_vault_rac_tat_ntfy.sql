-- 18/10/2026 (SRS-5.1zzzzzzz33): chủ dự án "xóa vault rác đi, tự xóa luôn, còi ntfy xóa luôn".
-- (1) Sáu mục DA_XOA_VPS_* là vỏ các lượt cai-vps cũ để lại (giá trị đã ghi đè thành 'x'); bước tự ghi đè đã bỏ ở
--     apply-migration.yml nên sẽ không sinh thêm.
-- (2) Còi ntfy: canh_bao_ngoai() tự im khi app_config.ntfy_topic trống — xoá khoá đó là tắt hẳn ntfy, không sửa hàm.
--     Email admin (email_admin → canh_bao_ngoai p_email) đi chung đường ntfy nên cũng tắt; tin 🩺 Zalo cho admin
--     (bot_health_tick → reminders → escalation-feed → bridge) vẫn chạy.
delete from vault.secrets where name like 'DA\_XOA\_%';
delete from public.app_config where key = 'ntfy_topic';
