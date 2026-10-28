-- 20261028d_bo_ctv_buoc2 — SRS-5.1zzzzzzz238 bước 2 (chủ dự án 28/10/2026: "dọn CTV luôn đi làm giống bên anh Luận").
-- Chạy SAU khi escalation-feed, lõi Python và web bản 20261028c đã lên (không còn đọc `ctvs` / `ctv_id` / `ctv_ranks` / `ctv_name`).
-- Soát DB 28/10 trước khi xoá: `ctvs` 0 dòng; `conversations` / `deals` / `info_requests` / `reminders` 0 dòng có `ctv_id`; 0 câu hỏi
-- `assignee = 'ctv'`; 0 tin `sender = 'ctv'` — không mất dữ liệu nên không chép sang `luu_tru`.
-- Giữ: giá trị `ctv` của enum `msg_sender` (Postgres không gỡ được giá trị enum đơn giản; view `hoi_thoai_thong_ke` còn đếm nó vào
-- "tin người thật", vô hại).

drop view if exists public.ctv_ranks;

drop view if exists public.khach_can_nguoi_that;
create view public.khach_can_nguoi_that as
 SELECT c.id AS conversation_id,
        CASE
            WHEN c.buyer_id IS NOT NULL THEN 'khach'::text
            ELSE 'nguoi_ban'::text
        END AS vai,
    c.buyer_id,
    c.seller_id,
    COALESCE(b.name, s.name) AS ten,
    COALESCE(b.zalo_user_id, s.zalo_user_id) AS zalo_user_id,
    c.needs_human_at,
    c.human_escalated_at,
    c.last_message_at,
    "left"(m.body, 120) AS tin_khach_cuoi,
    m.created_at AS tin_khach_cuoi_at
   FROM conversations c
     LEFT JOIN buyers b ON b.id = c.buyer_id
     LEFT JOIN sellers s ON s.id = c.seller_id
     LEFT JOIN LATERAL ( SELECT m_1.body,
            m_1.created_at
           FROM messages m_1
          WHERE m_1.conversation_id = c.id AND (m_1.sender = ANY (ARRAY['buyer'::msg_sender, 'seller'::msg_sender]))
          ORDER BY m_1.created_at DESC
         LIMIT 1) m ON true
  WHERE c.needs_human = true AND (c.human_touch_at IS NULL OR c.human_touch_at < c.needs_human_at) AND (auth.role() = 'service_role'::text OR (EXISTS ( SELECT 1
           FROM admins a
          WHERE a.email = ((( SELECT auth.jwt() AS jwt)) ->> 'email'::text))));
revoke all on public.khach_can_nguoi_that from anon, authenticated;
grant select on public.khach_can_nguoi_that to authenticated;
grant all on public.khach_can_nguoi_that to service_role;

create or replace view public.hoi_thoai_nhan with (security_invoker = true) as
 SELECT c.id AS conversation_id,
        CASE
            WHEN c.human_hold OR c.needs_human AND (c.human_touch_at IS NULL OR c.human_touch_at < c.needs_human_at) THEN 'NEED_HUMAN'::text
            WHEN (EXISTS ( SELECT 1
               FROM info_requests q
              WHERE q.buyer_id = c.buyer_id AND c.buyer_id IS NOT NULL AND q.status = 'pending'::request_status)) OR (m.sender = ANY (ARRAY['buyer'::msg_sender, 'seller'::msg_sender])) AND m.created_at < (now() - '00:10:00'::interval) THEN 'WAITING_HINT'::text
            ELSE 'AI_HANDLING'::text
        END AS nhan,
        CASE
            WHEN c.human_hold THEN 'người thật đang giữ khách'::text
            WHEN c.needs_human AND (c.human_touch_at IS NULL OR c.human_touch_at < c.needs_human_at) THEN 'bot xin người thật'::text
            WHEN (EXISTS ( SELECT 1
               FROM info_requests q
              WHERE q.buyer_id = c.buyer_id AND c.buyer_id IS NOT NULL AND q.status = 'pending'::request_status)) THEN 'khách hỏi, đang chờ chủ nhà/admin trả lời'::text
            WHEN (m.sender = ANY (ARRAY['buyer'::msg_sender, 'seller'::msg_sender])) AND m.created_at < (now() - '00:10:00'::interval) THEN 'khách nhắn > 10 phút chưa có tin bot'::text
            ELSE NULL::text
        END AS ly_do,
    m.created_at AS tin_cuoi_at,
    m.sender::text AS tin_cuoi_cua
   FROM conversations c
     LEFT JOIN LATERAL ( SELECT m1.sender,
            m1.created_at
           FROM messages m1
          WHERE m1.conversation_id = c.id
          ORDER BY m1.created_at DESC, m1.seq DESC
         LIMIT 1) m ON true
  WHERE auth.role() = 'service_role'::text OR (EXISTS ( SELECT 1
           FROM admins a
          WHERE a.email = ((( SELECT auth.jwt() AS jwt)) ->> 'email'::text)));

alter table public.conversations drop column if exists ctv_id;
alter table public.deals drop column if exists ctv_id;
alter table public.info_requests drop column if exists ctv_id;
alter table public.reminders drop column if exists ctv_id;

alter table public.info_requests drop constraint if exists info_requests_assignee_check;
alter table public.info_requests add constraint info_requests_assignee_check CHECK ((assignee = ANY (ARRAY['seller'::text, 'admin'::text])));

drop function if exists public.chon_ctv(text);
drop function if exists public.ctv_dang_ganh(uuid);
drop function if exists public.ctv_sla_phut();
drop table if exists public.ctvs;
delete from public.app_config where key = 'ctv_tran_ca';

do $d$ begin
  perform cron.unschedule('ctv-sla-tick');
exception when others then null; end $d$;
do $d$ begin
  perform cron.unschedule('info-request-sla-tick');
exception when others then null; end $d$;
do $d$ begin
  perform cron.schedule('info-request-sla-tick', '*/15 1-13 * * *', 'select public.info_request_sla_tick()');
exception when undefined_function or invalid_schema_name then
  raise notice 'không có pg_cron (Postgres thử) — bỏ qua lên lịch';
end $d$;
