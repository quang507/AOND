-- 20261019e — trạng thái tin `da_coc` (docs/07 SRS-5.1zzzzzzz63; anh Luận 19/10/2026 "cọc rồi … mọi trạng thái của db phải được thể
-- hiện qua tin nhắn"; chủ dự án 19/10: "thêm hẳn trạng thái mới da_coc; tin đã cọc vẫn hiện trên web, ko kèm nhãn").
-- `da_coc` đứng cạnh `dang_quan_tam` ở MỌI chỗ quyết tin có hiện hay không: policy đọc công khai, view ảnh, các view / hàm đếm tin
-- đang rao, gợi ý cùng khu, danh sách tuyển, lịch nhúng vector. Sửa bằng cách thay chữ ngay trên định nghĩa ĐANG CHẠY (DB là bản
-- thật — CLAUDE.md §6), không chép tay thân hàm. Không đụng các hàm ĐỔI trạng thái sang `dang_quan_tam` (admin_gan_bds_quan_tam,
-- mark_listing_interest): tin đã cọc không bị kéo về "đang quan tâm".

alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
  check (status = any (array['cho_thong_tin', 'dang_ban', 'dang_quan_tam', 'da_coc', 'da_chot', 'an']));
comment on column public.listings.status is
  'cho_thong_tin · dang_ban · dang_quan_tam · da_coc (đã nhận cọc, vẫn hiện web như đang bán, không nhãn) · da_chot · an';

do $$
declare
  r record;
  def text;
  opts text;
begin
  -- View: mảng trạng thái hiện / đếm thêm da_coc; bảng nhãn thêm "đã cọc". Giữ nguyên tuỳ chọn view (security_invoker …).
  for r in
    select c.oid, n.nspname, c.relname, c.reloptions
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'v' and n.nspname in ('public', 'so') and pg_get_viewdef(c.oid) like '%''dang_quan_tam''%'
  loop
    def := pg_get_viewdef(r.oid);
    def := replace(def, $q$WHEN 'dang_quan_tam'::text THEN 'đang quan tâm'::text$q$,
                        $q$WHEN 'dang_quan_tam'::text THEN 'đang quan tâm'::text WHEN 'da_coc'::text THEN 'đã cọc'::text$q$);
    def := regexp_replace(def, $q$'dang_quan_tam'::text(?=[,\]])$q$, $q$'dang_quan_tam'::text, 'da_coc'::text$q$, 'g');
    opts := case when r.reloptions is null then '' else ' with (' || array_to_string(r.reloptions, ', ') || ')' end;
    execute format('create or replace view %I.%I%s as %s', r.nspname, r.relname, opts, rtrim(def, '; '));
  end loop;

  -- Policy đọc công khai (tin, ảnh, thông số): tin đã cọc vẫn đọc được.
  for r in
    select schemaname, tablename, policyname, qual from pg_policies
     where schemaname = 'public' and qual like '%''dang_quan_tam''::text%'
  loop
    execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename,
                   regexp_replace(r.qual, $q$'dang_quan_tam'::text(?=[,\]])$q$, $q$'dang_quan_tam'::text, 'da_coc'::text$q$, 'g'));
  end loop;

  -- Hàm chọn tin đang hiện (gợi ý cùng khu, danh sách tuyển, nhúng vector) và đếm tin đang rao của người bán.
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('can_cung_khu', 'doc_danh_sach', 'nhung_tick', 'chuan_nmg', 'diem_nguoi_ban')
  loop
    def := pg_get_functiondef(r.oid);
    def := replace(def, $q$'dang_quan_tam')$q$, $q$'dang_quan_tam', 'da_coc')$q$);
    def := replace(def, $q$'dang_quan_tam', 'cho_thong_tin')$q$, $q$'dang_quan_tam', 'da_coc', 'cho_thong_tin')$q$);
    execute def;
  end loop;
end $$;
