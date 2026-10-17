-- 20260922f — soát theo skill supabase/postgres-best-practices + linter Supabase (22/09/2026, chủ dự án gật).
--
-- (1) Hai hàm SECURITY DEFINER mở cho `authenticated` mà không kiểm người gọi (ai có Gmail cũng thành authenticated
--     qua trang đăng nhập): `don_du_lieu_thu()` xoá dữ liệu có tiền tố thử — cron `don-du-lieu-thu` gọi với
--     current_user postgres; `ngu_canh_tin(uuid)` đọc 8 tin nhắn của một hội thoại. Nay chỉ admin (`la_admin()`),
--     service_role hoặc chính DB được chạy; người khác: raise 42501 / trả rỗng.
-- (2) Năm khoá ngoại chưa có index (luật schema-foreign-key-indexes): mau_cau, project_facts ×3, boc_tach_bong.
-- (3) Policy `listings_admin_delete` gọi auth.jwt() trần, chạy lại mỗi dòng (luật security-rls-performance) → bọc (select …).
-- (4) Hai hàm chưa khoá search_path — không phải SECURITY DEFINER nên cổng `soat-db` không soi: mau_cau_cham_moc, jsonb_bo_rong.
-- Không đụng: pg_net trong schema public (linter cảnh báo) — dời extension có thể gãy cron/http, không đáng rủi ro khi không có sao lưu.
-- Thân hàm chép nguyên từ `schema.sql` đã vá — cổng md5 (`soat-migration.mjs`) so với DB.

CREATE OR REPLACE FUNCTION public.don_du_lieu_thu()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

CREATE OR REPLACE FUNCTION public.ngu_canh_tin(p_message_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

CREATE OR REPLACE FUNCTION public.mau_cau_cham_moc()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$

CREATE OR REPLACE FUNCTION public.jsonb_bo_rong(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$

create index if not exists mau_cau_conversation_id_idx on public.mau_cau (conversation_id);
create index if not exists project_facts_project_id_idx on public.project_facts (project_id);
create index if not exists project_facts_listing_id_idx on public.project_facts (listing_id);
create index if not exists project_facts_conversation_id_idx on public.project_facts (conversation_id);
create index if not exists boc_tach_bong_listing_id_idx on public.boc_tach_bong (listing_id);

drop policy if exists listings_admin_delete on public.listings;
create policy listings_admin_delete on public.listings as permissive for delete to authenticated
  using (exists (select 1 from public.admins a where a.email = ((select auth.jwt()) ->> 'email')));
