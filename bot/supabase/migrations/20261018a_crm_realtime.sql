-- SRS-5.1zzzzzzz29 (18/10/2026, chủ dự án: "crm có cập nhật khi nhận tin luôn chưa"): CRM /admin/tin-nhan nghe Supabase Realtime
-- thay cho bấm "Làm mới". Publication `supabase_realtime` trước đây rỗng. Realtime vẫn đi qua RLS: `messages_admin_read` /
-- `conversations_admin_read` chỉ cho admin (bảng `admins`) — người khác không nhận sự kiện nào. Chạy lại được.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;
