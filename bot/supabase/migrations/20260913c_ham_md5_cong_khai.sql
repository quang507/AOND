-- 20260913c — cổng CI biết schema.sql có tụt sau DB không, bằng NỘI DUNG
--
-- Review code 13/09/2026: `schema.sql` mang `parse_vnd`, `chuan_hoa_gia_raw`,
-- `doc_gap`, `guess_property_type`, `trg_vi_tri_vao_cot` bản TRƯỚC migration
-- 20260911e, mà cả hai cổng canh đều xanh:
--   · `soat-truy-vet.sh` chỉ soi TÊN hàm — `create or replace` đè hàm đã có thì
--     tên vẫn đó;
--   · `soat-migration.mjs` so MTIME file — sau `git clone` (việc CI làm) mọi file
--     cùng mtime, nhánh đỏ không bao giờ chạy.
-- Hệ quả: DB dựng lại từ số không (Supabase Free, không có sao lưu) sẽ mang lại
-- luật tiền cũ.
--
-- So với FILE migration thì không được: soát 13/09 thấy 34 hàm trong DB có thân
-- KHÁC file migration cuối cùng định nghĩa chúng — bản áp qua MCP không giống
-- file (hình lỗi OPEN-46). DB là bản thật, nên cổng so `schema.sql` ↔ DB.
--
-- Hàm này chỉ trả TÊN + md5 THÂN hàm (prosrc) của schema `public`, bỏ hàm của
-- extension — cùng phạm vi `xuat_schema()` quét. Mở cho anon: thân hàm vốn đã
-- công khai nguyên văn trong `bot/supabase/schema.sql` của repo public; md5 không
-- lộ thêm gì. Không trả nội dung, không đọc bảng dữ liệu nào.

create or replace function public.ham_md5_cong_khai()
returns table (ten text, md5 text)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select p.proname::text, md5(replace(p.prosrc, E'\r', ''))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.prokind in ('f', 'p')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   order by 1, 2;
$$;

comment on function public.ham_md5_cong_khai() is
  'Review code 13/09: tên + md5 thân mọi hàm public (không nội dung) để cổng CI so với '
  'bot/supabase/schema.sql. Mở cho anon vì thân hàm đã công khai trong repo.';

revoke execute on function public.ham_md5_cong_khai() from public;
grant execute on function public.ham_md5_cong_khai() to anon, authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260913c', 'ham_md5_cong_khai') on conflict do nothing;
