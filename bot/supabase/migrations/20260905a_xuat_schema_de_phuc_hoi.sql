-- 20260905a — `xuat_schema()`: sinh DDL của schema thật để repo dựng lại được.
--
-- VÌ SAO. Soát 05/09/2026: DB có 103 migration đã áp, repo chỉ có 59 file —
-- 44 migration đầu (21/08 → 27/08) áp thẳng qua MCP mà KHÔNG lưu file. Toàn bộ
-- schema lõi (28 bảng, RLS, projects, conversations, reminders, CTV, drip) chỉ
-- tồn tại trong project đang chạy. `sao-luu.mjs` kéo DỮ LIỆU, không kéo schema.
-- Nghĩa là mất project thì repo không dựng lại được: có dữ liệu mà không có
-- cái để đổ dữ liệu vào. Bậc Free lại không có backup tự động (OPEN-25).
--
-- Hàm này đọc catalog và sinh ra một file .sql dựng lại được, để `sao-luu.mjs`
-- ghi kèm mỗi lần sao lưu và để `bot/supabase/schema.sql` trong repo luôn là
-- ảnh chụp mới nhất. Từ nay migration mới vẫn phải có file — hàm này là lưới
-- an toàn, không phải cái thay thế.
--
-- GIỚI HẠN ĐÃ BIẾT (ghi luôn để người dựng lại không mất buổi sáng):
--   · Thứ tự trong file là bảng → hàm → view → trigger. View phụ thuộc view,
--     hoặc hàm SQL đọc view, có thể phải chạy lại lượt hai. Không sao — file
--     dùng `create or replace` / `if not exists` nên chạy lại được.
--   · Không xuất dữ liệu (đó là việc của `sao-luu.mjs`) và không xuất bí mật
--     trong Vault — chép Vault tay khi dựng lại.
--   · Đã kiểm 05/09: 0 thân hàm chứa JWT / khoá Anthropic / SĐT thật, 12 câu
--     lệnh cron đều chỉ gọi RPC. Nên file này an toàn để nằm trong repo public.

create or replace function public.xuat_schema()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $xs$
declare
  o text;
  p text;
begin
  -- Cổng: khoá ACL bên dưới đã chặn, nhưng theo FR-167 hàm nội bộ tự kiểm luôn.
  if not (coalesce(auth.role(), '') = 'service_role'
          or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'Chi service_role duoc xuat schema' using errcode = '42501';
  end if;

  o := '-- Ảnh chụp schema `public` + `storage` của project nhadat-cc.' || E'\n'
    || '-- SINH TỰ ĐỘNG bởi public.xuat_schema() — ĐỪNG SỬA TAY.' || E'\n'
    || '-- Sinh lại: node scripts/sao-luu.mjs (ghi đè file này).' || E'\n'
    || '-- Đây là lưới an toàn để dựng lại từ số không, KHÔNG thay cho migration:' || E'\n'
    || '-- thay đổi schema vẫn phải đi qua một file trong bot/supabase/migrations/.' || E'\n'
    || '-- Sinh lúc: '
    || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI')
    || ' (giờ VN)' || E'\n';

  -- ── Extension ──────────────────────────────────────────────────────────
  select coalesce(string_agg(
           format('create extension if not exists %I with schema %I;', e.extname, n.nspname),
           E'\n' order by e.extname), '')
    into p
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname <> 'plpgsql';
  o := o || E'\n-- ══ Extension ══\n' || p || E'\n';

  -- ── Kiểu enum ──────────────────────────────────────────────────────────
  select coalesce(string_agg(
           format(E'do $d$ begin\n  create type public.%I as enum (%s);\nexception when duplicate_object then null; end $d$;',
                  x.typname, x.vals),
           E'\n' order by x.typname), '')
    into p
  from (
    select t.typname,
           string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as vals
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
    group by t.typname
  ) x;
  o := o || E'\n-- ══ Kiểu enum ══\n' || p || E'\n';

  -- ── Sequence ───────────────────────────────────────────────────────────
  -- Phải có trước bảng: default của cột serial gọi nextval() vào đây.
  select coalesce(string_agg(
           format('create sequence if not exists public.%I;', c.relname),
           E'\n' order by c.relname), '')
    into p
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind = 'S';
  o := o || E'\n-- ══ Sequence ══\n' || p || E'\n';

  -- ── Bảng ───────────────────────────────────────────────────────────────
  select coalesce(string_agg(
           format(E'create table if not exists public.%I (\n%s\n);', x.tbl, x.body),
           E'\n\n' order by x.tbl), '')
    into p
  from (
    select c.relname as tbl,
           string_agg(format('  %I %s%s%s',
             a.attname,
             format_type(a.atttypid, a.atttypmod),
             case when a.attnotnull then ' not null' else '' end,
             case when ad.adbin is not null
                  then ' default ' || pg_get_expr(ad.adbin, ad.adrelid) else '' end),
             E',\n' order by a.attnum) as body
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
    where c.relkind = 'r'
    group by c.relname
  ) x;
  o := o || E'\n-- ══ Bảng ══\n' || p || E'\n';

  -- ── Ràng buộc khoá chính / duy nhất / CHECK ────────────────────────────
  -- `do … exception when duplicate_object` để file chạy lại được nhiều lần.
  select coalesce(string_agg(
           format(E'do $d$ begin\n  alter table public.%I add constraint %I %s;\nexception when duplicate_object then null; end $d$;',
                  c.relname, con.conname, pg_get_constraintdef(con.oid)),
           E'\n' order by c.relname, con.conname), '')
    into p
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where con.contype in ('p', 'u', 'c');
  o := o || E'\n-- ══ Ràng buộc (PK / UNIQUE / CHECK) ══\n' || p || E'\n';

  -- ── Khoá ngoại ─────────────────────────────────────────────────────────
  -- Sau tất cả bảng, không thì tham chiếu tới bảng chưa dựng.
  select coalesce(string_agg(
           format(E'do $d$ begin\n  alter table public.%I add constraint %I %s;\nexception when duplicate_object then null; end $d$;',
                  c.relname, con.conname, pg_get_constraintdef(con.oid)),
           E'\n' order by c.relname, con.conname), '')
    into p
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where con.contype = 'f';
  o := o || E'\n-- ══ Khoá ngoại ══\n' || p || E'\n';

  -- ── Index (bỏ index do ràng buộc tự sinh) ──────────────────────────────
  select coalesce(string_agg(replace(i.indexdef, 'CREATE INDEX', 'create index if not exists')
                             || ';', E'\n' order by i.indexname), '')
    into p
  from pg_indexes i
  where i.schemaname = 'public'
    and not exists (
      select 1 from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where con.conname = i.indexname and con.contype in ('p', 'u')
    );
  o := o || E'\n-- ══ Index ══\n' || p || E'\n';

  -- ── Hàm ────────────────────────────────────────────────────────────────
  -- Trước view: view gọi hàm. Bỏ hàm do extension mang theo.
  select coalesce(string_agg(pg_get_functiondef(p2.oid) || ';', E'\n\n' order by p2.proname, p2.oid), '')
    into p
  from pg_proc p2
  join pg_namespace n on n.oid = p2.pronamespace and n.nspname = 'public'
  where p2.prokind in ('f', 'p')
    and not exists (
      select 1 from pg_depend d
      where d.objid = p2.oid and d.deptype = 'e'
    );
  o := o || E'\n-- ══ Hàm ══\n' || p || E'\n';

  -- ── View ───────────────────────────────────────────────────────────────
  -- Theo oid = xấp xỉ thứ tự tạo, nên view-chồng-view thường đúng thứ tự.
  -- `security_invoker` phải giữ nguyên: đổi một chữ là view đọc bằng quyền
  -- người tạo thay vì người gọi, hoặc ngược lại — cả hai đều là lỗ.
  select coalesce(string_agg(
           format(E'create or replace view public.%I%s as\n%s',
                  c.relname,
                  case when c.reloptions::text[] @> array['security_invoker=true']
                       then ' with (security_invoker = true)' else '' end,
                  pg_get_viewdef(c.oid, true)),
           E'\n\n' order by c.oid), '')
    into p
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind = 'v';
  o := o || E'\n-- ══ View ══\n' || p || E'\n';

  -- ── Trigger ────────────────────────────────────────────────────────────
  select coalesce(string_agg(
           format(E'drop trigger if exists %I on public.%I;\n%s;',
                  t.tgname, c.relname, pg_get_triggerdef(t.oid)),
           E'\n' order by c.relname, t.tgname), '')
    into p
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where not t.tgisinternal;
  o := o || E'\n-- ══ Trigger ══\n' || p || E'\n';

  -- ── RLS + policy ───────────────────────────────────────────────────────
  select coalesce(string_agg(
           format('alter table public.%I enable row level security;', c.relname),
           E'\n' order by c.relname), '')
    into p
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind = 'r' and c.relrowsecurity;
  o := o || E'\n-- ══ Bật RLS ══\n' || p || E'\n';

  select coalesce(string_agg(
           format(E'drop policy if exists %I on public.%I;\ncreate policy %I on public.%I as %s for %s to %s%s%s;',
                  pol.policyname, pol.tablename,
                  pol.policyname, pol.tablename,
                  case when pol.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                  pol.cmd,
                  array_to_string(pol.roles, ', '),
                  case when pol.qual is not null then ' using (' || pol.qual || ')' else '' end,
                  case when pol.with_check is not null then ' with check (' || pol.with_check || ')' else '' end),
           E'\n' order by pol.tablename, pol.policyname), '')
    into p
  from pg_policies pol
  where pol.schemaname = 'public';
  o := o || E'\n-- ══ Policy ══\n' || p || E'\n';

  -- ── Quyền trên bảng / view ─────────────────────────────────────────────
  select coalesce(string_agg(x.dong, E'\n' order by x.dong), '')
    into p
  from (
    select format('grant %s on public.%I to %I;',
                  string_agg(distinct g.privilege_type, ', '),
                  g.table_name, g.grantee) as dong
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee in ('anon', 'authenticated', 'service_role')
    group by g.table_name, g.grantee
  ) x;
  o := o || E'\n-- ══ Quyền bảng ══\n' || p || E'\n';

  -- ── Quyền EXECUTE trên hàm ─────────────────────────────────────────────
  -- Thu hồi trắng trước rồi cấp lại đúng vai đang có: đây là chỗ FR-167 sống.
  -- Dựng lại mà bỏ khối này là mọi hàm SECURITY DEFINER phơi ra REST cho anon.
  select coalesce(string_agg(x.dong, E'\n' order by x.dong), '')
    into p
  from (
    select format(E'revoke all on function public.%I(%s) from public, anon, authenticated;\n%s',
                  p2.proname,
                  pg_get_function_identity_arguments(p2.oid),
                  coalesce((
                    select string_agg(format('grant execute on function public.%I(%s) to %I;',
                                             p2.proname,
                                             pg_get_function_identity_arguments(p2.oid),
                                             r.rolname), E'\n' order by r.rolname)
                    from aclexplode(p2.proacl) a
                    join pg_roles r on r.oid = a.grantee
                    where a.privilege_type = 'EXECUTE'
                      and r.rolname in ('anon', 'authenticated', 'service_role')
                  ), '-- (chỉ postgres giữ EXECUTE)')) as dong
    from pg_proc p2
    join pg_namespace n on n.oid = p2.pronamespace and n.nspname = 'public'
    where p2.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p2.oid and d.deptype = 'e')
  ) x;
  o := o || E'\n-- ══ Quyền hàm (FR-167) ══\n' || p || E'\n';

  -- ── Storage: bucket + policy ───────────────────────────────────────────
  -- Nằm ngoài schema `public` nên vòng quét ở trên không thấy; bỏ là luồng up
  -- ảnh của người bán (FR-96) chết câm sau khi dựng lại.
  select coalesce(string_agg(
           format('insert into storage.buckets (id, name, public) values (%L, %L, %L) on conflict (id) do nothing;',
                  b.id, b.name, b.public),
           E'\n' order by b.id), '')
    into p
  from storage.buckets b;
  o := o || E'\n-- ══ Storage bucket ══\n' || p || E'\n';

  select coalesce(string_agg(
           format(E'drop policy if exists %I on storage.objects;\ncreate policy %I on storage.objects as %s for %s to %s%s%s;',
                  pol.policyname,
                  pol.policyname,
                  case when pol.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                  pol.cmd,
                  array_to_string(pol.roles, ', '),
                  case when pol.qual is not null then ' using (' || pol.qual || ')' else '' end,
                  case when pol.with_check is not null then ' with check (' || pol.with_check || ')' else '' end),
           E'\n' order by pol.policyname), '')
    into p
  from pg_policies pol
  where pol.schemaname = 'storage' and pol.tablename = 'objects';
  o := o || E'\n-- ══ Storage policy ══\n' || p || E'\n';

  -- ── Cron ───────────────────────────────────────────────────────────────
  -- Đã kiểm 05/09: cả 12 câu lệnh chỉ gọi RPC, không nhúng khoá nào.
  select coalesce(string_agg(
           format('select cron.schedule(%L, %L, %L);', j.jobname, j.schedule, j.command),
           E'\n' order by j.jobname), '')
    into p
  from cron.job j;
  o := o || E'\n-- ══ Cron ══\n' || p || E'\n';

  return o;
end
$xs$;

revoke all on function public.xuat_schema() from public, anon, authenticated;
grant execute on function public.xuat_schema() to service_role;

-- `log_loi` đang cấp EXECUTE cho cả PUBLIC (`=X/postgres` trong proacl) chứ
-- không riêng anon/authenticated. Web gọi nó bằng anon key nên anon PHẢI giữ
-- (đó là đường ghi sổ lỗi tầng ứng dụng của FR-152 c, đã có trần 20 dòng/nguồn
-- /giờ chống spam); nhưng cấp cho PUBLIC là cấp thừa cho mọi vai có sau này.
revoke all on function public.log_loi(text, text, integer) from public;
grant execute on function public.log_loi(text, text, integer) to anon, authenticated, service_role;
