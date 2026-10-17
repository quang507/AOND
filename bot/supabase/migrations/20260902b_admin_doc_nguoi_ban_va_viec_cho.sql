-- 20260902b — Admin đọc/sửa nhãn người bán và thấy việc đang chờ mình, ngay trên /admin
--
-- QUYẾT ĐỊNH CHỦ DỰ ÁN 02/09/2026: "hiện thông báo cho người ta và hiện thông
-- báo cho admin". Nửa "cho người ta" nằm ở chat-reply (bot tự nói nhãn + mức
-- phí). Nửa "cho admin" cần hai cửa:
--   1. Thông báo đi qua hàng `reminders` kind `escalation` (bridge/OA chuyển tới
--      Zalo admin) — đường CŨ, nhưng bridge đang chết từ 27/08 nên 85 việc xếp
--      hàng không ai thấy. Vì thế cửa thứ hai:
--   2. Trang /admin đọc THẲNG bảng `reminders` — không qua bridge — và đọc
--      `sellers` để thấy nhãn vừa gán, đổi được nếu sai.
--
-- Hiện trạng: `reminders` bật RLS mà KHÔNG có policy nào → admin đăng nhập web
-- đọc ra 0 dòng. `sellers` chỉ có policy tự-đọc-mình (`auth_user_id`). Cả hai
-- đều đã có GRANT cho `authenticated`; thiếu là thiếu POLICY. Cấp đúng khuôn
-- `bot_errors_admin_read` (email trong bảng `admins`).
--
-- Ghi vẫn chỉ hai chỗ hẹp: đổi nhãn người bán, và đóng một việc chờ. Không mở
-- insert/delete cho admin qua web — bot và trigger là chủ hai bảng này.

drop policy if exists sellers_admin_read on public.sellers;
create policy sellers_admin_read on public.sellers
  for select to authenticated
  using (exists (select 1 from admins a where a.email = ((select auth.jwt()) ->> 'email')));

drop policy if exists sellers_admin_update on public.sellers;
create policy sellers_admin_update on public.sellers
  for update to authenticated
  using (exists (select 1 from admins a where a.email = ((select auth.jwt()) ->> 'email')))
  with check (exists (select 1 from admins a where a.email = ((select auth.jwt()) ->> 'email')));

drop policy if exists reminders_admin_read on public.reminders;
create policy reminders_admin_read on public.reminders
  for select to authenticated
  using (exists (select 1 from admins a where a.email = ((select auth.jwt()) ->> 'email')));

drop policy if exists reminders_admin_update on public.reminders;
create policy reminders_admin_update on public.reminders
  for update to authenticated
  using (exists (select 1 from admins a where a.email = ((select auth.jwt()) ->> 'email')))
  with check (exists (select 1 from admins a where a.email = ((select auth.jwt()) ->> 'email')));

comment on policy sellers_admin_update on public.sellers is
  'FR-159 02/09: admin đổi nhãn chính chủ/môi giới trên /admin khi bot gán sai.';
comment on policy reminders_admin_update on public.reminders is
  'FR-159 02/09: admin đóng việc chờ (escalation/report) ngay trên /admin, không cần bridge.';
