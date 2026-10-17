-- 20260910q — HAI VIEW CUỐI CÙNG CHƯA CÓ CỔNG (mục F1 bản review 10/09).
--
-- Chủ dự án: "sửa 2 view chưa có cổng đi".
--
-- Cổng soát tầng hai (`soat_db_cong_khai`) đánh dấu `(!)` cho view vừa THIẾU
-- `security_invoker` vừa KHÔNG có cổng admin trong thân — tức chạy bằng quyền
-- chủ sở hữu và ai đọc được view là đọc xuyên RLS. Còn đúng hai cái:
--   · `project_facts_cho_duyet`  — hàng chờ duyệt thông tin dự án
--   · `listing_photos_v`         — ảnh của tin đã lên kệ
--
-- HAI CÁI NÀY KHÔNG SỬA GIỐNG NHAU, và đó là điểm chính của file này.

-- ─── 1. project_facts_cho_duyet: bật security_invoker là xong ──────────────
-- Bảng gốc `project_facts` đã có policy `project_facts_admin_read`
-- (chỉ `authenticated` là admin). View chạy theo quyền người gọi thì policy đó
-- tự áp: admin thấy đủ, người khác thấy 0 dòng. Không cần thêm cổng nào trong
-- thân view — cổng đã có sẵn ở tầng bảng, chỉ là view đang đi vòng qua nó.
alter view public.project_facts_cho_duyet set (security_invoker = true);

comment on view public.project_facts_cho_duyet is
  'FR-195: hàng chờ duyệt thông tin dự án. `security_invoker` bật từ 10/09 nên RLS của '
  'project_facts (admin-only) tự áp — trước đó view chạy bằng quyền chủ sở hữu, ai đọc '
  'được view là đọc xuyên RLS.';

-- ─── 2. listing_photos_v: KHÔNG bật thẳng được, phải mở đường trước ────────
-- Đây là chỗ dễ sửa hỏng nhất trong hai cái, nên viết rõ vì sao.
--
-- View đọc ba thứ: `listing_media`, `listings`, và một truy vấn con vào
-- `app_config` để lấy URL gốc của kho ảnh. Hai bảng đầu đều CÓ policy cho anon
-- (`listing_media_doc_cong_khai`, `anon_read_listings`), nhưng `app_config` thì
-- KHÔNG có policy nào và anon cũng không được cấp quyền select.
--
-- Nghĩa là: bật `security_invoker` mà không đụng gì khác thì truy vấn con kia
-- trả NULL cho anon → cột `url` thành NULL → **web mất sạch ảnh**, mà không có
-- lỗi nào để lần ra. Đúng cảnh "siết nhầm còn tệ hơn để nguyên".
--
-- Nên mở một cửa HẸP: hàm chỉ trả đúng URL gốc kho ảnh — không phải cả bảng
-- `app_config` (trong đó có khoá publishable, mốc dọn dữ liệu, cấu hình nội bộ).
-- Cấp `execute` cho anon là cấp đúng một chuỗi vốn đã nằm công khai trong mọi
-- URL ảnh trên web.
create or replace function public.url_kho_anh()
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $$
  select c.value from app_config c where c.key = 'storage_public_base_url';
$$;

comment on function public.url_kho_anh() is
  'URL gốc của kho ảnh công khai — MỘT khoá trong app_config, không mở cả bảng. Sinh ra '
  'để listing_photos_v chạy được với security_invoker mà không phải cấp quyền app_config '
  'cho anon (10/09).';

revoke execute on function public.url_kho_anh() from public;
grant execute on function public.url_kho_anh() to anon, authenticated, service_role;

-- Dựng lại view: cùng cột, cùng bộ lọc (bucket công khai + tin đã lên kệ), chỉ
-- đổi đường lấy URL và bật quyền theo người gọi.
drop view if exists public.listing_photos_v;
create view public.listing_photos_v with (security_invoker = true) as
  select
    l.code,
    public.url_kho_anh() || '/' || m.bucket || '/' || m.storage_path as url,
    m.storage_path as path,
    m.sort_order,
    m.is_cover,
    m.created_at,
    m.listing_id,
    m.id as media_id,
    l.legacy_code
  from listing_media m
  join listings l on l.id = m.listing_id
  where m.bucket = 'listing-public'
    and l.status = any (array['dang_ban', 'dang_quan_tam', 'da_chot']);

comment on view public.listing_photos_v is
  'Ảnh công khai của tin ĐÃ LÊN KỆ. `security_invoker` bật từ 10/09: RLS của listing_media '
  'và listings tự áp thay vì view đi vòng qua. URL gốc lấy qua url_kho_anh() — bật '
  'security_invoker mà vẫn đọc thẳng app_config thì anon nhận NULL và web mất sạch ảnh.';

-- View MỚI ở project này mặc định LỘ (`alter default privileges` cấp sẵn cho
-- anon/authenticated), nên phải revoke TRƯỚC rồi grant lại đúng thứ cần —
-- luật đã ghi trong CLAUDE.md §6.
revoke all on public.listing_photos_v from anon, authenticated;
grant select on public.listing_photos_v to anon, authenticated;

-- ─── 3. Cổng soát: bỏ tên cứng, đọc KHAI BÁO ───────────────────────────────
-- Phép soát 2 đang bỏ qua `agents_public` bằng TÊN. Tên cứng là thứ sẽ trôi:
-- view thứ hai cố ý chạy definer thì lại phải sửa cổng. Nay bỏ qua view nào
-- KHAI BÁO TƯỜNG MINH `security_invoker=false` — tuyên bố chủ đích, đọc được
-- ngay trong `\d+`, và view nào chỉ QUÊN thì vẫn bị kêu.
do $do$
declare v_src text; v_cu text; v_moi text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'soat_db_cong_khai' limit 1;

  v_cu  := '     and c.relname <> ''agents_public''';
  v_moi := '     and not (coalesce(c.reloptions::text[], ''{}'') @> array[''security_invoker=false''])';

  if position(v_moi in v_src) > 0 then
    raise notice 'soat_db_cong_khai da doc khai bao, bo qua';
  elsif position(v_cu in v_src) = 0 then
    raise exception 'Khong tim thay dong loai tru theo ten — dung lai, dung va mu';
  else
    execute replace(v_src, v_cu, v_moi);
  end if;
end $do$;
