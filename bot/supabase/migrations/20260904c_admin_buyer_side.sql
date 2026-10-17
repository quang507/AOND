-- 20260904c — Admin buyer side: admin đọc được phía khách mua ngay trên /admin
-- (FR-71, FR-74, FR-76, FR-77, FR-78, FR-80)
--
-- Nghiệm thu 04/09/2026 (docs/10 §10.8) kết luận nhóm FR-70…81 "chỉ có bảng
-- thô, không UI, RLS không cho admin đọc". Cụ thể: `info_requests`, `viewings`,
-- `conversations`, `messages`, `ctvs` bật RLS mà KHÔNG có policy nào cho
-- `authenticated`; `buyers` chỉ có tự-đọc-mình (`auth_user_id`). Admin đăng nhập
-- web đọc ra 0 dòng, nên bốn danh sách của "admin buyer side" không có gì để vẽ.
--
-- Migration này mở đúng một chiều: SELECT cho admin (email trong bảng `admins`,
-- cùng khuôn `sellers_admin_read` ở 20260902b). KHÔNG mở insert/update/delete —
-- bot và trigger vẫn là chủ các bảng này. `buyers.phone` nằm trong bảng nhưng
-- web KHÔNG chọn cột đó (xem app/admin/page.tsx); hàng rào ở đây là "ai được
-- đọc", còn "đọc cột nào" là kỷ luật phía web.
--
-- Hai view mới, gác cổng cùng khuôn `ctv_ranks` (auth.role() = service_role
-- hoặc email trong `admins`), view definer (mặc định) + grant select cho
-- authenticated, revoke khỏi anon. View không có `set search_path` nên mọi bảng
-- đều viết đủ `public.` để không phụ thuộc search_path của người đọc.
--   • `hoi_thoai_thong_ke`  (FR-71): 30 ngày gần nhất theo ngày giờ VN — hội
--     thoại khách mới, tin khách/bot/người thật, khách mới, số lần giơ cờ
--     `needs_human`. Ngày không có gì vẫn ra dòng 0 để CSV không thủng.
--   • `khach_can_nguoi_that` (FR-77): hội thoại đang giơ cờ `needs_human` mà
--     chưa có người thật chạm sau lúc giơ cờ, kèm tên khách, tin khách cuối
--     (cắt 120 ký tự), tên CTV.
--
-- Cuối file là khối kiểm thử trong `do … raise exception` (luôn rollback):
-- admin đọc được, anon 0 dòng / bị chặn. Kết quả ghi ở docs/10 TS-ADM2.

-- ── 1. Policy đọc cho admin ────────────────────────────────────────────────────

drop policy if exists info_requests_admin_read on public.info_requests;
create policy info_requests_admin_read on public.info_requests
  for select to authenticated
  using (exists (select 1 from public.admins a where a.email = ((select auth.jwt()) ->> 'email')));

drop policy if exists viewings_admin_read on public.viewings;
create policy viewings_admin_read on public.viewings
  for select to authenticated
  using (exists (select 1 from public.admins a where a.email = ((select auth.jwt()) ->> 'email')));

drop policy if exists buyers_admin_read on public.buyers;
create policy buyers_admin_read on public.buyers
  for select to authenticated
  using (exists (select 1 from public.admins a where a.email = ((select auth.jwt()) ->> 'email')));

drop policy if exists conversations_admin_read on public.conversations;
create policy conversations_admin_read on public.conversations
  for select to authenticated
  using (exists (select 1 from public.admins a where a.email = ((select auth.jwt()) ->> 'email')));

drop policy if exists messages_admin_read on public.messages;
create policy messages_admin_read on public.messages
  for select to authenticated
  using (exists (select 1 from public.admins a where a.email = ((select auth.jwt()) ->> 'email')));

drop policy if exists ctvs_admin_read on public.ctvs;
create policy ctvs_admin_read on public.ctvs
  for select to authenticated
  using (exists (select 1 from public.admins a where a.email = ((select auth.jwt()) ->> 'email')));

comment on policy info_requests_admin_read on public.info_requests is
  'FR-76 04/09: admin xem câu khách hỏi đang chờ/đã trả lời trên /admin. Chỉ đọc.';
comment on policy viewings_admin_read on public.viewings is
  'FR-78 04/09: admin xem lịch hẹn xem nhà trên /admin. Chỉ đọc.';
comment on policy buyers_admin_read on public.buyers is
  'FR-74 04/09: admin tìm khách theo tên/Zalo uid trên /admin. Web KHÔNG chọn cột phone.';
comment on policy conversations_admin_read on public.conversations is
  'FR-71/77 04/09: admin đọc hội thoại (thống kê + cờ needs_human). Chỉ đọc.';
comment on policy messages_admin_read on public.messages is
  'FR-71/77 04/09: admin đọc tin nhắn (đếm + trích tin khách cuối). Chỉ đọc.';
comment on policy ctvs_admin_read on public.ctvs is
  'FR-76/77 04/09: admin thấy tên CTV được giao việc. Web chỉ chọn id/name/active.';

-- ── 2. View FR-71: thống kê hội thoại 30 ngày, theo ngày giờ VN ──────────────

create or replace view public.hoi_thoai_thong_ke as
with ngay as (
  select d::date as ngay
  from generate_series(
    (now() at time zone 'Asia/Ho_Chi_Minh')::date - 29,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    interval '1 day') as d
),
ht as (
  select (c.started_at at time zone 'Asia/Ho_Chi_Minh')::date as ngay,
         count(*) filter (where c.buyer_id is not null) as hoi_thoai_khach_moi,
         count(*) filter (where c.seller_id is not null) as hoi_thoai_ban_moi
  from public.conversations c
  where c.started_at >= now() - interval '31 days'
  group by 1
),
co as (
  -- `needs_human_at` bị ghi đè mỗi lần giơ cờ lại, nên đây là "lần giơ cờ gần
  -- nhất rơi vào ngày nào", không phải tổng số lần giơ cờ [giả định BA].
  select (c.needs_human_at at time zone 'Asia/Ho_Chi_Minh')::date as ngay,
         count(*) as co_nguoi_that
  from public.conversations c
  where c.needs_human_at >= now() - interval '31 days'
  group by 1
),
tin as (
  select (m.created_at at time zone 'Asia/Ho_Chi_Minh')::date as ngay,
         count(*) filter (where m.sender = 'buyer')            as tin_khach,
         count(*) filter (where m.sender = 'seller')           as tin_nguoi_ban,
         count(*) filter (where m.sender = 'bot')              as tin_bot,
         count(*) filter (where m.sender in ('ctv', 'human'))  as tin_nguoi_that
  from public.messages m
  where m.created_at >= now() - interval '31 days'
  group by 1
),
kh as (
  select (b.created_at at time zone 'Asia/Ho_Chi_Minh')::date as ngay,
         count(*) as khach_moi
  from public.buyers b
  where b.created_at >= now() - interval '31 days'
  group by 1
)
select n.ngay,
       coalesce(ht.hoi_thoai_khach_moi, 0)::int as hoi_thoai_khach_moi,
       coalesce(ht.hoi_thoai_ban_moi, 0)::int   as hoi_thoai_ban_moi,
       coalesce(tin.tin_khach, 0)::int          as tin_khach,
       coalesce(tin.tin_nguoi_ban, 0)::int      as tin_nguoi_ban,
       coalesce(tin.tin_bot, 0)::int            as tin_bot,
       coalesce(tin.tin_nguoi_that, 0)::int     as tin_nguoi_that,
       coalesce(kh.khach_moi, 0)::int           as khach_moi,
       coalesce(co.co_nguoi_that, 0)::int       as co_nguoi_that
from ngay n
left join ht  on ht.ngay  = n.ngay
left join tin on tin.ngay = n.ngay
left join kh  on kh.ngay  = n.ngay
left join co  on co.ngay  = n.ngay
where auth.role() = 'service_role'
   or exists (select 1 from public.admins a where a.email = (select auth.jwt()) ->> 'email');

-- Default privileges của Supabase cấp ALL cho authenticated/service_role trên
-- view mới — thu về rồi chỉ cấp lại SELECT (đo 04/09: `ctv_ranks` đang mang
-- INSERT/UPDATE thừa vì thiếu bước này; view không cập nhật được nên vô hại).
revoke all on public.hoi_thoai_thong_ke from public, anon, authenticated, service_role;
grant select on public.hoi_thoai_thong_ke to authenticated, service_role;
comment on view public.hoi_thoai_thong_ke is
  'FR-71 04/09: thống kê hội thoại 30 ngày theo ngày giờ VN. Chỉ admin/service_role đọc; anon bị revoke.';

-- ── 3. View FR-77: hội thoại đang cần người thật ─────────────────────────────

create or replace view public.khach_can_nguoi_that as
select c.id                                   as conversation_id,
       case when c.buyer_id is not null then 'khach' else 'nguoi_ban' end as vai,
       c.buyer_id,
       c.seller_id,
       coalesce(b.name, s.name)               as ten,
       coalesce(b.zalo_user_id, s.zalo_user_id) as zalo_user_id,
       c.needs_human_at,
       c.human_escalated_at,
       c.last_message_at,
       c.ctv_id,
       ct.name                                as ctv_name,
       left(m.body, 120)                      as tin_khach_cuoi,
       m.created_at                           as tin_khach_cuoi_at
from public.conversations c
left join public.buyers  b  on b.id  = c.buyer_id
left join public.sellers s  on s.id  = c.seller_id
left join public.ctvs    ct on ct.id = c.ctv_id
left join lateral (
  select m.body, m.created_at
  from public.messages m
  where m.conversation_id = c.id and m.sender in ('buyer', 'seller')
  order by m.created_at desc
  limit 1
) m on true
where c.needs_human = true
  and (c.human_touch_at is null or c.human_touch_at < c.needs_human_at)
  and (auth.role() = 'service_role'
       or exists (select 1 from public.admins a where a.email = (select auth.jwt()) ->> 'email'));

revoke all on public.khach_can_nguoi_that from public, anon, authenticated, service_role;
grant select on public.khach_can_nguoi_that to authenticated, service_role;
comment on view public.khach_can_nguoi_that is
  'FR-77 04/09: hội thoại giơ cờ needs_human chưa có người thật chạm, kèm tên, tin khách cuối (120 ký tự), CTV. Chỉ admin/service_role đọc.';

-- ── 4. Kiểm thử trong giao dịch, LUÔN rollback (TS-ADM2-01…08) ───────────────
-- KHÔNG nằm trong phần chạy của migration (raise exception sẽ cuộn cả DDL trên
-- lại) — chạy RIÊNG bằng execute_sql SAU khi áp, và chạy lại sau mọi lần đụng
-- RLS của sáu bảng này. Dựng dữ liệu thử bằng vai chủ (postgres), rồi đổi vai:
--   authenticated + JWT email admin thật (lấy từ bảng `admins`, không ghi cứng)
--   → đọc được bảng + hai view;  anon → 0 dòng / bị chặn quyền.
-- Không in email ra ngoài; `raise exception 'KQ: …'` ở cuối cuộn lại mọi thứ.
-- Kết quả lần chạy 04/09/2026 ghi ở docs/10 TS-ADM2.
/*
do $$
declare
  v_email    text;
  v_listing  uuid;
  v_buyer    uuid;
  v_conv     uuid;
  v_ir       uuid;
  n1 int; n2 int; n3 int; n4 int; n5 int; n6 int; n7 int; n8 int;
  v_anon_view text := 'khong chan';
  v_kq text;
begin
  select email into v_email from public.admins order by email limit 1;
  if v_email is null then raise exception 'KQ: bảng admins rỗng, không kiểm được'; end if;

  -- Dữ liệu thử
  select id into v_listing from public.listings where status = 'dang_ban' order by created_at limit 1;
  insert into public.buyers (name, zalo_user_id) values ('TS-ADM2 khách thử', 'TEST-adm2-uid')
    returning id into v_buyer;
  insert into public.conversations (buyer_id, channel, started_at, needs_human, needs_human_at)
    values (v_buyer, 'zalo', now(), true, now()) returning id into v_conv;
  insert into public.messages (conversation_id, sender, body)
    values (v_conv, 'buyer', 'TS-ADM2: em muốn gặp người thật, bot trả lời không đúng ý');
  insert into public.info_requests (listing_id, buyer_id, question, status, source)
    values (v_listing, v_buyer, 'TS-ADM2: hẻm mấy mét?', 'pending', 'buyer_ask') returning id into v_ir;
  insert into public.viewings (listing_id, buyer_id, slot, status, time_text, source)
    values (v_listing, v_buyer, now() + interval '2 days', 'pending', 'chiều mốt', 'TS-ADM2');

  -- Vai admin qua JWT
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'email', v_email)::text, true);

  select count(*) into n1 from public.info_requests where id = v_ir;
  select count(*) into n2 from public.viewings where buyer_id = v_buyer;
  select count(*) into n3 from public.buyers where id = v_buyer;
  select count(*) into n4 from public.messages where conversation_id = v_conv;
  select count(*) into n5 from public.ctvs;
  select count(*) into n6 from public.khach_can_nguoi_that where conversation_id = v_conv
    and tin_khach_cuoi like 'TS-ADM2%' and ten = 'TS-ADM2 khách thử';
  select count(*) into n7 from public.hoi_thoai_thong_ke;
  select tin_khach into n8 from public.hoi_thoai_thong_ke
    where ngay = (now() at time zone 'Asia/Ho_Chi_Minh')::date;

  -- Vai anon
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  declare a1 int; a2 int; a3 int;
  begin
    select count(*) into a1 from public.info_requests;
    select count(*) into a2 from public.buyers;
    select count(*) into a3 from public.conversations;
    begin
      perform 1 from public.khach_can_nguoi_that;
      perform 1 from public.hoi_thoai_thong_ke;
    exception when insufficient_privilege then v_anon_view := 'chan (42501)';
    end;
    v_kq := format(
      'admin: info_requests=%s viewings=%s buyers=%s messages=%s ctvs=%s | view khach_can_nguoi_that=%s | hoi_thoai_thong_ke dòng=%s tin_khach hôm nay=%s || anon: info_requests=%s buyers=%s conversations=%s view=%s',
      n1, n2, n3, n4, n5, n6, n7, n8, a1, a2, a3, v_anon_view);
  end;
  execute 'reset role';
  raise exception 'KQ: %', v_kq;
end $$;
*/
