-- 20260905c — `liet_ke_migration()`: để máy so được DB ↔ repo.
--
-- VÌ SAO. CLAUDE.md §6 nói "Migration là nguồn sự thật của schema". Soát
-- 05/09/2026 cho thấy câu đó KHÔNG đúng: DB đã áp 103 migration, repo chỉ có
-- 59 file — 44 migration đầu (21/08 → 27/08) áp thẳng qua MCP mà không ai lưu
-- file lại. Không ai phát hiện suốt hai tuần vì không có gì đối chiếu hai bên.
--
-- Bảng `supabase_migrations.schema_migrations` nằm ngoài schema `public` nên
-- PostgREST không phơi ra. Hàm này là cửa duy nhất cho `scripts/soat-migration.mjs`.
-- Chỉ trả version + name, không trả nội dung SQL đã áp.

create or replace function public.liet_ke_migration()
returns table (version text, name text)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select m.version, m.name
  from supabase_migrations.schema_migrations m
  order by m.version;
$$;

revoke all on function public.liet_ke_migration() from public, anon, authenticated;
grant execute on function public.liet_ke_migration() to service_role;
