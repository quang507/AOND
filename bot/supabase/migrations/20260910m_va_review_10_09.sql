-- 20260910m — VÁ NĂM LỖI DB TỪ BẢN REVIEW 10/09/2026 (A2, C3, C5, C6, B1).
--
-- Chủ dự án đưa bản review độc lập trên commit 00e4a1d, hỏi "nên sửa theo ko".
-- Năm mục dưới đây đã KIỂM LẠI TRÊN DB THẬT trước khi vá, không vá theo lời kể.

-- ─── A2. Policy anon chặn một khoá KHÔNG TỒN TẠI ───────────────────────────
-- Kiểm: `select polname, pg_get_expr(polqual, polrelid) from pg_policy` trả về
--   question <> ALL (ARRAY['hinh_anh', 'dia_chi_chi_tiet'])
-- mà `select distinct question from listing_facts` KHÔNG có chữ nào tên
-- `dia_chi_chi_tiet`; khoá thật là `vi_tri` ("vị trí cụ thể: đường, số nhà,
-- hẻm"), sinh ngày 09/09 — tức 14 ngày SAU policy này.
--
-- Hỏng thế nào: chủ nhà trả lời `vi_tri` = "148/12 Trần Bình Trọng, gọi em
-- 090…" → bất kỳ ai cầm publishable key (khoá này nằm sẵn trong bundle web)
-- gọi `/rest/v1/listing_facts?select=question,answer` là đọc được nguyên văn.
-- `sanitizeDescription` bên web là lớp RENDER — PostgREST đi thẳng qua nó.
-- Hôm nay chưa dòng nào lọt vì mọi tin đang `cho_thong_tin` (policy đòi
-- `dang_ban`/`dang_quan_tam`/`da_chot`), nên đây là bẫy chờ tin đầu tiên lên kệ.
--
-- Chặn theo DANH SÁCH TÊN vẫn là chỗ dễ trôi tiếp (thêm khoá mới lại quên), nên
-- kèm luôn `nhan_fact` — khoá nào thuộc nhóm địa chỉ/liên hệ thì chặn theo NHÓM.
drop policy if exists anon_read_listing_facts on public.listing_facts;
create policy anon_read_listing_facts on public.listing_facts
  for select to anon, authenticated
  using (
    question <> all (array['hinh_anh', 'dia_chi_chi_tiet', 'vi_tri', 'dia_chi', 'so_nha', 'lien_he', 'so_dien_thoai'])
    and exists (
      select 1 from listings l
       where l.id = listing_facts.listing_id
         and l.status = any (array['dang_ban', 'dang_quan_tam', 'da_chot'])
    )
  );

comment on policy anon_read_listing_facts on public.listing_facts is
  'FR-104/NFR-07: anon đọc fact của tin ĐANG LÊN KỆ, trừ ảnh và mọi khoá mang địa chỉ '
  'chính xác hay liên hệ. Bản cũ chặn "dia_chi_chi_tiet" — một khoá chưa từng tồn tại — '
  'trong khi khoá thật là "vi_tri" (review 10/09).';

-- ─── C3. `duyet_fact_du_an` có HAI overload → nút duyệt gọi là lỗi ──────────
-- Kiểm: `select count(*) from pg_proc where proname='duyet_fact_du_an'` = 2.
-- `20260910h` tạo bản 3 tham số nhưng không drop bản 2 tham số. Web gọi bằng 2
-- tham số → khớp CẢ HAI chữ ký → PostgREST trả PGRST203 "function is not
-- unique" → admin bấm gật thì hàng chờ đứng im. Đây là lỗi do chính bản hôm nay
-- đẻ ra, chưa ai bấm nên chưa ai thấy.
drop function if exists public.duyet_fact_du_an(bigint, boolean);

-- ─── C5. Mã tin luôn ra BDS-NP-* vì hai trigger chạy sai thứ tự ─────────────
-- Postgres bắn BEFORE-row trigger theo THỨ TỰ CHỮ CÁI của tên trigger:
--   trg_listings_fill_code  <  trg_listings_fill_property_type
-- nên `next_listing_code(new.property_type)` đọc `property_type` lúc nó vẫn còn
-- là `chua_ro` (chat-reply luôn chèn `chua_ro` rồi để trigger đoán) → rơi nhánh
-- `else 'NP'`. Bằng chứng trong kho ngay lúc review: 10/10 tin từ chat là căn hộ
-- mà mã đều `BDS-NP-…`.
--
-- Đội đã biết luật chữ cái (nên mới có `trg_y_`, `trg_z_`, `trg_zz_`) nhưng sót
-- đúng cặp này. Đổi tên chứ không đổi hàm: `trg_listings_zz_fill_code` đứng sau
-- `..._fill_property_type` và vẫn trước `trg_y_…` (so ký tự thứ 5: 'l' < 'y').
alter trigger trg_listings_fill_code on public.listings
  rename to trg_listings_zz_fill_code;

comment on trigger trg_listings_zz_fill_code on public.listings is
  'Cấp mã tin. Tên có "zz" để chạy SAU trg_listings_fill_property_type — trigger BEFORE '
  'chạy theo thứ tự chữ cái, và mã tin phải đọc property_type đã đoán xong (review 10/09).';

-- ─── C6. Toà nhà >20 phòng ngủ: bóc tách nhận, bảng từ chối ─────────────────
-- `boc_thong_so` nhận `between 1 and 30`, `listings_bedrooms_check` chỉ cho tới
-- 20. Chủ toà CHDV rao "toà nhà 24 phòng" → INSERT ném 23514, tin KHÔNG tạo
-- được; nếu số đó tới qua `listing_facts` thì trigger nổ và cuộn ngược cả dòng
-- fact — mất luôn câu trả lời của chủ nhà. Loại `toa_nha` mới mở 09/09 nên bẫy
-- này vừa sinh ra.
--
-- Nới tới 60: một toà cho thuê 24-40 phòng là chuyện thường ở Sài Gòn, còn số
-- lớn hơn 60 thì gần như chắc chắn là gõ nhầm — vẫn cần một cái trần để chặn
-- "2000 phòng ngủ" đi thẳng vào rổ hàng.
alter table public.listings drop constraint if exists listings_bedrooms_check;
alter table public.listings add constraint listings_bedrooms_check
  check (bedrooms is null or (bedrooms >= 1 and bedrooms <= 60));

-- ─── B1. `xuat_schema()` làm rơi `security_invoker` của 3 view ──────────────
-- `pg_class.reloptions` giữ NGUYÊN VĂN chữ người viết. Kiểm trên DB thật:
--   security_invoker=true → boc_tach_v, seller_ranks
--   security_invoker=on   → public_listings, public_media, ro_hang_ban
-- mà `xuat_schema()` chỉ in mệnh đề khi thấy đúng chuỗi `security_invoker=true`.
--
-- Hỏng thế nào: chạy `phuc-hoi.mjs` sau sự cố → ba view kia dựng lại KHÔNG có
-- security_invoker, tức chạy bằng quyền chủ sở hữu và ĐỌC XUYÊN RLS.
-- `ro_hang_ban` đã cấp select cho mọi `authenticated`, nên một người bán tự đăng
-- ký tài khoản web đọc được cả tin nháp lẫn tin ẩn. Bậc Free không có backup tự
-- động (OPEN-25) nên đây là lưới an toàn duy nhất — nó không được phép tự hạ cấp
-- bảo mật đúng lúc cần nhất.
--
-- Vá HAI TẦNG, vì một tầng thôi là lần sau lại trôi:
--   1. Chuẩn hoá ba view về `= true` — hết hai cách viết cho cùng một ý.
--   2. `xuat_schema()` nhận cả `on` lẫn `true` — người sau viết `on` vẫn an toàn.
alter view public.public_listings set (security_invoker = true);
alter view public.public_media    set (security_invoker = true);
alter view public.ro_hang_ban     set (security_invoker = true);

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
    || '-- Sinh lại: node scripts/sao-luu.mjs (ghi đè file này).' || E'\n'
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
  where c.relkind = 'S';
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
                  case when c.reloptions::text[] @> array['security_invoker=true']
                         or c.reloptions::text[] @> array['security_invoker=on']
                       then ' with (security_invoker = true)' else '' end,
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

