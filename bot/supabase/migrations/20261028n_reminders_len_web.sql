-- 20261028n_reminders_len_web — SRS-5.1zzzzzzz254 (chủ dự án 28/10/2026: "“nhắn khi tin hiển thị” … cấu hình hệ thống để làm đi").
-- Loại nhắc mới `len_web`: chủ nhà đã duyệt tin mà lúc đó tin chưa hiển thị (hệ thống / admin đang hoàn tất) → lõi Python (`gui_nhac`) chờ tới khi
-- tin `dang_ban` rồi nhắn chủ nhà kèm link (câu mẫu `bao_tin_len_web`); chờ quá 7 ngày thì `dead`. Không trigger nào đẻ loại này — lõi ghi khi
-- bot nói "tin hiển thị em nhắn" (`SupabaseConversationStore.hen_bao_len_web`).
alter table public.reminders drop constraint if exists reminders_kind_check;
alter table public.reminders add constraint reminders_kind_check CHECK ((kind = ANY (ARRAY['promise'::text, 'reengage'::text, 'viewing'::text,
  'followup'::text, 'escalation'::text, 'report'::text, 'match'::text, 'feedback'::text, 'sold'::text, 'rating'::text, 'admin_reply'::text,
  'len_web'::text])));
