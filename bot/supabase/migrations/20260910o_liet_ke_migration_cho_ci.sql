-- 20260910o — DANH SÁCH MIGRATION ĐỌC ĐƯỢC BẰNG KHOÁ CÔNG KHAI, ĐỂ CI SO ĐƯỢC.
--
-- Chủ dự án 10/09/2026 tối: "thêm một cổng CI so danh sách migration trên
-- database với thư mục trong repo. Cổng này lẽ ra đã chặn được cả năm báo động
-- giả hôm nay."
--
-- Cổng đó cần ĐỌC được `supabase_migrations.schema_migrations` từ máy CI.
-- Hàm sẵn có `liet_ke_migration()` chỉ cho `service_role`, mà nhét khoá
-- service_role vào CI của một repo ĐANG PUBLIC là mở toang: khoá đó bỏ qua mọi
-- RLS, và một workflow sửa được là đọc sạch SĐT khách. Cổng để chống trôi
-- schema không đáng đổi bằng cái đó.
--
-- Nên: hàm THỨ HAI, chỉ trả `version` + `name` — hai thứ vốn đã nằm công khai
-- trong tên file của repo này. TUYỆT ĐỐI không trả cột `statements` (nội dung
-- DDL); nó mới là thứ hé lộ cấu trúc bên trong.
--
-- Đây là cùng một lối nghĩ với TS-SEC: bài kiểm chạy bằng đúng cái khoá mà ai
-- cũng có, vì thứ phải chịu được chính là cái khoá đó.

create or replace function public.liet_ke_migration_cong_khai()
returns table (version text, name text)
language sql
stable
security definer
set search_path to 'supabase_migrations', 'pg_catalog'
as $$
  select m.version, m.name
    from supabase_migrations.schema_migrations m
   order by m.version;
$$;

comment on function public.liet_ke_migration_cong_khai() is
  'FR-152/OPEN-46: danh sách migration đã áp (CHỈ version + name, KHÔNG có nội dung DDL) '
  'để cổng CI so với thư mục bot/supabase/migrations. Mở cho anon vì tên file đã công khai '
  'trong repo; nội dung câu lệnh thì không bao giờ.';

revoke execute on function public.liet_ke_migration_cong_khai() from public;
grant execute on function public.liet_ke_migration_cong_khai() to anon, authenticated, service_role;
