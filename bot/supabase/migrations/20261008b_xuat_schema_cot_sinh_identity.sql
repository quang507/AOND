-- 20261008b — xuat_schema() xuất đúng cột SINH và cột IDENTITY (08/10/2026).
--
-- Bắt lúc dựng lại DB trên project mới (project cũ bị xoá nhầm 08/10/2026): schema.sql do xuat_schema() sinh ra
--   · cột generated stored (duong.ten_khong_dau, listings.price_per_m2_vnd) thành `default <biểu thức>` → Postgres từ chối
--     ("cannot use column reference in DEFAULT expression"), hai bảng lõi không tạo được, kéo theo ~240 câu hỏng dây chuyền;
--   · cột identity (messages.seq, required_facts.id, phuong_cu.id, boc_tach_bong.id, van_kich.id) thành `not null` trơn,
--     còn sequence của nó xuất riêng → dựng lại ra bảng mất tự tăng;
--   · tuỳ chọn view chỉ in khi `security_invoker=true` → rơi `security_invoker=false` của agents_public (20260910q).
-- Lưới "dựng lại được từ schema.sql" chưa từng diễn tập nên hai lỗi này nằm im từ 21/09 (duong) và 02/09 (listings).
-- Thân hàm dưới đây = bản trong schema.sql (07/10) + hai chỗ sửa có ghi chú 08/10/2026.

CREATE OR REPLACE FUNCTION public.xuat_schema()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  o text;
  p text;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'Chi service_role duoc xuat schema' using errcode = '42501';
  end if;

  o := '-- Ảnh chụp schema `public` + `storage` của project nhadat-cc.' || E'\n'
    || '-- SINH TỰ ĐỘNG bởi public.xuat_schema() — ĐỪNG SỬA TAY.' || E'\n'
    || '-- Sinh lại: gọi rpc xuat_schema() rồi ghi đè file này (CLAUDE.md).' || E'\n'
    || '-- Đây là lưới an toàn để dựng lại từ số không, KHÔNG thay cho migration:' || E'\n'
    || '-- thay đổi schema vẫn phải đi qua một file trong bot/supabase/migrations/.' || E'\n'
    || '-- Sinh lúc: '
    || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI')
    || ' (giờ VN)' || E'\n';

  select coalesce(string_agg(
           format('create extension if not exists %I with schema %I;', e.extname, n.nspname),
           E'\n' order by e.extname), '')
    into p
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname <> 'plpgsql';
  o := o || E'\n-- ══ Extension ══\n' || p || E'\n';

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

  select coalesce(string_agg(
           format('create sequence if not exists public.%I;', c.relname),
           E'\n' order by c.relname), '')
    into p
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind = 'S'
    -- 08/10/2026: sequence của cột IDENTITY do chính `generated … as identity` tạo — xuất riêng là đụng tên khi dựng lại.
    and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'i');
  o := o || E'\n-- ══ Sequence ══\n' || p || E'\n';

  select coalesce(string_agg(
           format(E'create table if not exists public.%I (\n%s\n);', x.tbl, x.body),
           E'\n\n' order by x.tbl), '')
    into p
  from (
    select c.relname as tbl,
           string_agg(format('  %I %s%s%s',
             a.attname,
             format_type(a.atttypid, a.atttypmod),
             case when a.attnotnull and a.attidentity = '' then ' not null' else '' end,
             -- 08/10/2026 (dựng lại sau khi project cũ bị xoá): cột SINH (generated stored) từng xuất thành `default <biểu thức>`
             -- (Postgres từ chối: "cannot use column reference in DEFAULT"), cột IDENTITY thành `not null` trơn (mất tự tăng).
             case when a.attgenerated = 's'
                  then ' generated always as (' || pg_get_expr(ad.adbin, ad.adrelid) || ') stored'
                  when a.attidentity in ('a', 'd')
                  then ' generated ' || case a.attidentity when 'a' then 'always' else 'by default' end || ' as identity'
                  when ad.adbin is not null
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

  select coalesce(string_agg(
           format(E'create or replace view public.%I%s as\n%s',
                  c.relname,
                  -- `reloptions` giữ NGUYÊN VĂN chữ người viết: ba view khai `= on`
                  -- (public_listings, public_media, ro_hang_ban), hai view khai
                  -- `= true`. Bản cũ chỉ so đúng chuỗi `true` nên bản chụp làm RƠI
                  -- thuộc tính của ba view kia — dựng lại là chúng chạy bằng quyền
                  -- chủ sở hữu, ĐỌC XUYÊN RLS (review 10/09, mục B1). Nay nhận cả
                  -- hai cách viết, và in ra một dạng chuẩn.
                  -- 08/10/2026: in NGUYÊN VĂN mọi tuỳ chọn view. Bản cũ chỉ nhận `security_invoker=true/on` nên làm rơi
                  -- `security_invoker=false` mà agents_public cố ý khai (20260910q) — dựng lại ra view bị cổng soát kêu.
                  case when c.reloptions is not null
                       then ' with (' || array_to_string(c.reloptions, ', ') || ')' else '' end,
                  pg_get_viewdef(c.oid, true)),
           E'\n\n' order by c.oid), '')
    into p
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind = 'v';
  o := o || E'\n-- ══ View ══\n' || p || E'\n';

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

  select coalesce(string_agg(
           format('select cron.schedule(%L, %L, %L);', j.jobname, j.schedule, j.command),
           E'\n' order by j.jobname), '')
    into p
  from cron.job j;
  o := o || E'\n-- ══ Cron ══\n' || p || E'\n';

  return o;
end
$function$;
