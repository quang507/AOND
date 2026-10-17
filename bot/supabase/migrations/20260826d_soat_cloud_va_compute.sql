-- Bản tham chiếu của migration ĐÃ ÁP LÊN Supabase 26/08/2026, tên
-- `soat_cloud_va_compute_26_08`. Soát toàn bộ mặt cloud/compute sau đợt vá bảo
-- mật hôm trước: advisor, cron, log edge function, dung lượng, hàng đợi pg_net.
--
-- Tình trạng lành mạnh ghi nhận cùng lúc (không cần sửa gì):
--   · 4 cron job đều active, 138 lần chạy, 0 lần lỗi;
--   · DB 17MB / hạn mức free 500MB; hàng đợi net._http_response 15 dòng;
--   · advisor bảo mật: không có lỗ mới; 2 view SECURITY DEFINER còn lại
--     (agents_public, listing_photos_v) là cố ý, đã ghi ở 20260826c.

-- ─────────────────────────────────────────────────────────────────────────
-- KHÔNG VÁ ĐƯỢC (ghi lại để khỏi tưởng đã xong) — pg_net mở cho anon.
--
--   has_schema_privilege('anon','net','usage')        → true
--   has_function_privilege('anon','net.http_post…')   → true
--
-- Đây là mồi SSRF: ai cầm anon key (key nằm sẵn trong bundle JS của web) mà
-- chọc được tới net.* là sai DB gọi HTTP đi bất cứ đâu, từ mạng và IP của
-- Supabase. HÔM NAY CHƯA KHAI THÁC ĐƯỢC vì PostgREST chỉ phơi schema `public`
-- (+ graphql_public), mà `net` không nằm trong đó — nhưng đó là hàng rào CẤU
-- HÌNH, không phải hàng rào QUYỀN. Thủng ngay khi:
--   (a) ai đó thêm `net` vào Exposed schemas ở Dashboard → Settings → API; hoặc
--   (b) có hàm SECURITY INVOKER mới trong `public` gọi net.* — nó chạy bằng
--       quyền của người gọi, mà anon đang có đủ quyền.
--
-- Migration này CÓ chạy `revoke ... from anon, authenticated` nhưng đó là
-- NO-OP: schema `net` thuộc sở hữu `supabase_admin`, còn ta kết nối bằng
-- `postgres`. REVOKE quyền mình không cấp và trên object mình không sở hữu thì
-- Postgres chỉ cảnh báo rồi bỏ qua, KHÔNG báo lỗi — nên `apply_migration` vẫn
-- trả success trong khi chẳng đổi gì. Đã kiểm lại bằng has_*_privilege: vẫn true.
--
-- Cách sống chung (xem OPEN-24):
--   1. Giữ Exposed schemas đúng `public, graphql_public`. Kiểm định kỳ.
--   2. Cấm viết hàm SECURITY INVOKER trong `public` mà gọi net.*. Hàm nào cần
--      HTTP thì để SECURITY DEFINER + `revoke execute from public, anon,
--      authenticated` (đúng như 20260826c đã làm cho mọi hàm trong public).

-- ─────────────────────────────────────────────────────────────────────────
-- VÁ 1 — policy gọi auth.uid()/auth.jwt() TRỰC TIẾP.
-- Postgres tính lại biểu thức cho TỪNG DÒNG thay vì một lần cho cả câu
-- (advisor auth_rls_initplan, 10 cảnh báo). Bọc trong (select …) là thành
-- initplan, tính đúng một lần. Ngữ nghĩa giữ nguyên 100%.
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins
  for select to authenticated
  using (email = ((select auth.jwt()) ->> 'email'));

drop policy if exists buyers_self_read on public.buyers;
create policy buyers_self_read on public.buyers
  for select to authenticated using (auth_user_id = (select auth.uid()));
drop policy if exists buyers_self_insert on public.buyers;
create policy buyers_self_insert on public.buyers
  for insert to authenticated with check (auth_user_id = (select auth.uid()));
drop policy if exists buyers_self_update on public.buyers;
create policy buyers_self_update on public.buyers
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

drop policy if exists sellers_self_read on public.sellers;
create policy sellers_self_read on public.sellers
  for select to authenticated using (auth_user_id = (select auth.uid()));
drop policy if exists sellers_self_insert on public.sellers;
create policy sellers_self_insert on public.sellers
  for insert to authenticated with check (auth_user_id = (select auth.uid()));

drop policy if exists views_own_all on public.listing_views;
create policy views_own_all on public.listing_views
  for all to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

drop policy if exists listings_own_read on public.listings;
create policy listings_own_read on public.listings
  for select to authenticated
  using (seller_id in (select id from public.sellers
                       where auth_user_id = (select auth.uid())));
drop policy if exists listings_own_insert on public.listings;
create policy listings_own_insert on public.listings
  for insert to authenticated
  with check (status = 'cho_thong_tin'
              and seller_id in (select id from public.sellers
                                where auth_user_id = (select auth.uid())));
drop policy if exists listings_admin_read on public.listings;
create policy listings_admin_read on public.listings
  for select to authenticated
  using (exists (select 1 from public.admins a
                 where a.email = ((select auth.jwt()) ->> 'email')));
drop policy if exists listings_admin_update on public.listings;
create policy listings_admin_update on public.listings
  for update to authenticated
  using (exists (select 1 from public.admins a
                 where a.email = ((select auth.jwt()) ->> 'email')))
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────
-- VÁ 2 — `projects` có HAI policy SELECT trùng nghĩa, mỗi query phải chạy cả
-- hai. `projects_public_read` cấp cho role `public` (tức MỌI vai) USING(true),
-- rộng hơn hẳn `anon_read_projects`. Giữ cái hẹp, bỏ cái rộng.
drop policy if exists projects_public_read on public.projects;

-- ─────────────────────────────────────────────────────────────────────────
-- VÁ 3 — khoá ngoại không có index phủ (advisor báo 25 chỗ): xoá hoặc join
-- bảng cha là quét toàn bộ bảng con. Giờ mỗi bảng vài chục dòng nên chưa đau,
-- nhưng index rẻ, và sinh theo danh mục hệ thống thì không sợ gõ sót tên.
-- BỎ QUA `ratings`: OPEN-23 đang đề nghị xoá hẳn bảng đó, đánh index vào bảng
-- sắp khai tử là phí.
do $$
declare r record; idx text;
begin
  for r in
    select c.conrelid::regclass::text as tbl,
           string_agg(quote_ident(a.attname), ', ' order by k.ord) as cols,
           replace(c.conname, '_fkey', '_idx') as iname
    from pg_constraint c
    join lateral unnest(c.conkey) with ordinality k(att, ord) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and n.nspname = 'public'
      and t.relname <> 'ratings'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey,1)-1] = c.conkey
      )
    group by c.conrelid, c.conname
  loop
    idx := format('create index if not exists %I on %s (%s)', r.iname, r.tbl, r.cols);
    execute idx;
    raise notice '%', idx;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- KẾT QUẢ ADVISOR sau khi áp (chạy thật 26/08/2026):
--   auth_rls_initplan          10 → 0
--   unindexed_foreign_keys     25 → 5  (5 cái còn lại đều của `ratings`)
--   multiple_permissive_policies 3 → 1
-- Cái còn lại là `listings` role `authenticated` action SELECT, gồm
-- {anon_read_listings, listings_own_read, listings_admin_read}. Ba policy này
-- phục vụ ba mục đích khác nhau (tin công khai / tin của chính chủ / toàn
-- quyền admin); gộp lại là đổi ngữ nghĩa thật chứ không phải dọn dẹp — để yên.
--
-- Advisor cũng đẻ ra 20 cảnh báo `unused_index` mới: đúng như dự kiến, index
-- vừa tạo xong thì chưa câu nào dùng tới. Không phải lỗi.
