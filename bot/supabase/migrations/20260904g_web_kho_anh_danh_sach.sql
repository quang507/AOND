-- 20260904g — Web: up ảnh từ trình duyệt (FR-96), giấy tờ ký URL ngắn hạn
-- (NFR-06), danh sách riêng cho một người mua (FR-100 / SRS-3.8b / SRS-4.3)
--
-- Nghiệm thu 04/09/2026 (docs/10 §10.8) lộ ra ba khoảng trống có tài liệu mà
-- không có code, chủ dự án chốt "dựng hết":
--   (1) FR-96 "upload nhiều ảnh cho listing": chỉ có `scripts/up-anh.mjs` chạy
--       bằng service_role trên máy local. `storage.objects` bật RLS và KHÔNG có
--       policy nào (đo 04/09: 0 policy) — admin/người bán đăng nhập web không up
--       được gì; `listing_media` cũng chưa GRANT insert/delete cho `authenticated`.
--   (2) NFR-06: bucket `listing-private` đóng kín đúng, nhưng chưa ai LẤY được
--       file ra — `createSignedUrl` cần SELECT trên `storage.objects` của bucket
--       riêng cho admin.
--   (3) FR-100 `curated_lists`: SRS-3.8b ghi "chưa dựng — OPEN-43".
--
-- Nguyên tắc giữ nguyên từ 20260828g §7: KHÔNG có policy rộng tay. Mọi policy
-- ghi ở đây đều khoá theo (a) email trong `admins`, hoặc (b) thư mục đầu của
-- đường dẫn = UUID một tin mà `sellers.auth_user_id = auth.uid()`. Anon không
-- được thêm quyền nào. Khối kiểm thử rollback ở cuối file (TS-WEB2).

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) storage.objects — ai được ghi vào bucket nào
-- ═══════════════════════════════════════════════════════════════════════════
-- Hàm tiện ích dùng lại trong nhiều policy: "người gọi là admin" và "tin này là
-- của người gọi". STABLE + security definer để policy không phải join qua RLS
-- của `admins`/`sellers` (admins không có policy cho authenticated đọc).
create or replace function public.la_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.admins a
     where a.email = ((select auth.jwt()) ->> 'email')
  )
$$;

create or replace function public.tin_cua_toi(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.listings l
      join public.sellers s on s.id = l.seller_id
     where l.id = p_listing
       and s.auth_user_id = (select auth.uid())
  )
$$;

revoke execute on function public.la_admin() from public, anon;
revoke execute on function public.tin_cua_toi(uuid) from public, anon;
grant execute on function public.la_admin() to authenticated, service_role;
grant execute on function public.tin_cua_toi(uuid) to authenticated, service_role;

-- Thư mục đầu của đường dẫn phải là UUID hợp lệ thì mới thử ép kiểu; chuỗi lạ
-- (không phải UUID) trả false thay vì ném lỗi 22P02 làm vỡ cả câu INSERT.
create or replace function public.thu_muc_dau_uuid(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
    else null end
$$;
revoke execute on function public.thu_muc_dau_uuid(text) from public, anon;
grant execute on function public.thu_muc_dau_uuid(text) to authenticated, service_role;

-- Admin: toàn quyền ghi/đọc cả hai bucket của kho ảnh.
drop policy if exists storage_admin_public_all on storage.objects;
create policy storage_admin_public_all on storage.objects
  for all to authenticated
  using (bucket_id = 'listing-public' and public.la_admin())
  with check (bucket_id = 'listing-public' and public.la_admin());

-- NFR-06: admin ĐỌC được object bucket riêng → `createSignedUrl` ký được (≤15
-- phút, phía web). Ghi cũng chỉ admin — bucket riêng không có cửa cho người bán.
drop policy if exists storage_admin_private_all on storage.objects;
create policy storage_admin_private_all on storage.objects
  for all to authenticated
  using (bucket_id = 'listing-private' and public.la_admin())
  with check (bucket_id = 'listing-private' and public.la_admin());

-- Người bán đăng nhập: chỉ ghi/xoá trong thư mục `<uuid tin của mình>/…` của
-- bucket công khai. Không có SELECT: đọc bucket công khai đi qua route
-- /object/public, không hỏi RLS.
drop policy if exists storage_seller_own_insert on storage.objects;
create policy storage_seller_own_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-public'
    and public.tin_cua_toi(public.thu_muc_dau_uuid(name))
  );

drop policy if exists storage_seller_own_delete on storage.objects;
create policy storage_seller_own_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-public'
    and public.tin_cua_toi(public.thu_muc_dau_uuid(name))
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) listing_media — dòng metadata đi kèm file
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260828g chỉ GRANT select. Mở insert/delete cho `authenticated`, gác bằng
-- policy: admin mọi dòng; người bán chỉ dòng của tin mình + bucket công khai
-- (CHECK `listing_media_giay_to_phai_rieng` vẫn chặn so_do/giay_to vào bucket
-- công khai — người bán KHÔNG up được giấy tờ qua đường này, đúng NFR-06).
grant insert, delete on public.listing_media to authenticated;

drop policy if exists listing_media_admin_all on public.listing_media;
create policy listing_media_admin_all on public.listing_media
  for all to authenticated
  using (public.la_admin())
  with check (public.la_admin());

drop policy if exists listing_media_own_read on public.listing_media;
create policy listing_media_own_read on public.listing_media
  for select to authenticated
  using (bucket = 'listing-public' and public.tin_cua_toi(listing_id));

drop policy if exists listing_media_own_insert on public.listing_media;
create policy listing_media_own_insert on public.listing_media
  for insert to authenticated
  with check (bucket = 'listing-public' and public.tin_cua_toi(listing_id));

drop policy if exists listing_media_own_delete on public.listing_media;
create policy listing_media_own_delete on public.listing_media
  for delete to authenticated
  using (bucket = 'listing-public' and public.tin_cua_toi(listing_id));

comment on policy listing_media_admin_all on public.listing_media is
  'FR-96/NFR-06 04/09: admin đọc/ghi mọi dòng media, kể cả bucket riêng (để ký URL giấy tờ).';
comment on policy listing_media_own_insert on public.listing_media is
  'FR-96 04/09: người bán đăng nhập ghi dòng media cho tin của mình, chỉ bucket công khai.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) curated_lists — danh sách riêng cho một người mua (FR-100, SRS-3.8b)
-- ═══════════════════════════════════════════════════════════════════════════
-- Token 12 byte ngẫu nhiên → 24 ký tự hex (SRS-4.3 đòi ≥ 22). Hết hạn mặc định
-- 30 ngày. `listing_ids` là UUID bất biến (cùng bài học FR-165: không neo vào
-- mã tin). Anon KHÔNG có policy nào trên bảng: cửa đọc duy nhất là RPC
-- `doc_danh_sach(token)` (security definer) — có token mới thấy, không liệt kê
-- được, không lộ `buyer_id`.
create table if not exists public.curated_lists (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default encode(gen_random_bytes(12), 'hex'),
  buyer_id     uuid null references public.buyers(id) on delete set null,
  listing_ids  uuid[] not null check (cardinality(listing_ids) between 1 and 60),
  title        text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days'
);
comment on table public.curated_lists is
  'FR-100: danh sách vài chục căn lọc riêng cho một người mua, mở bằng /ds/<token>. '
  'Anon chỉ đọc qua RPC doc_danh_sach; tạo qua RPC tao_danh_sach (admin/service_role).';

alter table public.curated_lists enable row level security;
revoke all on public.curated_lists from public, anon, authenticated;
grant select, insert on public.curated_lists to service_role;

-- Cửa ĐỌC: trả danh sách còn hạn + các tin đang lên kệ, đúng cột CARD_COLS của
-- web. Thứ tự giữ theo thứ tự trong `listing_ids`. Không trả buyer_id (WF-11:
-- không lộ danh tính B trên trang).
create or replace function public.doc_danh_sach(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'title',      c.title,
    'created_at', c.created_at,
    'expires_at', c.expires_at,
    'listings',   coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'code', l.code, 'deal', l.deal, 'district', l.district, 'ward', l.ward,
        'street', l.street, 'location_raw', l.location_raw, 'area_m2', l.area_m2,
        'price_vnd', l.price_vnd, 'price_raw', l.price_raw, 'property_type', l.property_type,
        'bedrooms', l.bedrooms, 'bathrooms', l.bathrooms, 'floors', l.floors,
        'access_type', l.access_type, 'status', l.status, 'created_at', l.created_at
      ) order by x.ord)
      from unnest(c.listing_ids) with ordinality as x(id, ord)
      join public.listings l on l.id = x.id
      where l.status in ('dang_ban', 'dang_quan_tam')
    ), '[]'::jsonb)
  )
  from public.curated_lists c
  where c.token = p_token
    and length(p_token) between 16 and 64
    and c.expires_at > now()
$$;
comment on function public.doc_danh_sach(text) is
  'FR-100: mở danh sách riêng theo token. NULL khi không có/hết hạn. Chỉ tin đang lên kệ.';

revoke execute on function public.doc_danh_sach(text) from public;
grant execute on function public.doc_danh_sach(text) to anon, authenticated, service_role;

-- Cửa TẠO: admin (email trong `admins`, cùng khuôn admin_dang_tin) hoặc
-- service_role (bot gọi từ edge function). Nhận MÃ tin (thứ admin gõ), đổi ra
-- UUID; mã lạ thì báo lỗi rõ chứ không lặng lẽ bỏ.
create or replace function public.tao_danh_sach(
  p_listing_codes text[],
  p_title text default null,
  p_buyer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_codes text[];
  v_ids   uuid[];
  v_thieu text[];
  v_row   public.curated_lists;
begin
  if auth.role() <> 'service_role' and not public.la_admin() then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;

  select array_agg(distinct upper(btrim(x))) into v_codes
    from unnest(coalesce(p_listing_codes, '{}')) as x
   where btrim(x) <> '';
  if v_codes is null or cardinality(v_codes) = 0 then
    raise exception 'Danh sach ma tin rong';
  end if;
  if cardinality(v_codes) > 60 then
    raise exception 'Toi da 60 tin mot danh sach';
  end if;

  -- Giữ đúng thứ tự admin gõ.
  select array_agg(l.id order by x.ord) into v_ids
    from unnest(v_codes) with ordinality as x(code, ord)
    join public.listings l on l.code = x.code;
  select array_agg(x.code) into v_thieu
    from unnest(v_codes) as x(code)
   where not exists (select 1 from public.listings l where l.code = x.code);
  if v_thieu is not null then
    raise exception 'Khong co tin: %', array_to_string(v_thieu, ', ');
  end if;

  insert into public.curated_lists (buyer_id, listing_ids, title)
  values (p_buyer_id, v_ids, nullif(btrim(p_title), ''))
  returning * into v_row;

  return jsonb_build_object(
    'token', v_row.token,
    'path', '/ds/' || v_row.token,
    'expires_at', v_row.expires_at,
    'n', cardinality(v_ids)
  );
end $$;
comment on function public.tao_danh_sach(text[], text, uuid) is
  'FR-100 / SRS-4.3: tạo danh sách riêng từ mã tin. Admin (bảng admins) hoặc service_role.';

revoke execute on function public.tao_danh_sach(text[], text, uuid) from public, anon;
grant execute on function public.tao_danh_sach(text[], text, uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) KIỂM THỬ trong giao dịch, LUÔN rollback (TS-WEB2-P01…P10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Chạy RIÊNG bằng execute_sql SAU khi áp (raise exception cuộn cả DDL nếu để
-- chung). Đóng ba vai: admin (JWT email từ bảng `admins`), người bán (tạo
-- auth.users giả + sellers.auth_user_id), anon. Insert `storage.objects` giả
-- (chỉ dòng metadata, không có file thật) và `listing_media`. Cuối cùng
-- `raise exception 'KQ: …'` cuộn lại mọi thứ. Kết quả 04/09/2026: docs/10 TS-WEB2.
/*
do $$
declare
  v_email text; v_uid uuid := gen_random_uuid(); v_seller uuid;
  v_tin_toi uuid; v_tin_khac uuid; v_media uuid;
  v_token text; v_ds jsonb;
  r text := '';
  ok boolean; n int;
begin
  select email into v_email from public.admins order by email limit 1;
  if v_email is null then raise exception 'KQ: admins rỗng'; end if;

  -- Dữ liệu thử: một người bán có tài khoản, một tin của họ, một tin của người khác
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'ts-web2-' || left(v_uid::text, 8) || '@example.invalid', '', now(), now(), now(), '{}', '{}');
  insert into public.sellers (name, seller_type, auth_user_id) values ('TS-WEB2 seller', 'nmg', v_uid) returning id into v_seller;
  insert into public.listings (seller_id, deal, district, ward, price_raw, status, description)
    values (v_seller, 'ban', 'Quận 5', 'Phường 1', '5 tỷ', 'dang_ban', 'TS-WEB2 tin của tôi') returning id into v_tin_toi;
  select id into v_tin_khac from public.listings where status = 'dang_ban' and id <> v_tin_toi order by created_at limit 1;

  -- ── Vai người bán ──
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', 'x@example.invalid')::text, true);

  -- 01 người bán up vào thư mục tin của mình: được
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('listing-public', v_tin_toi::text || '/a.jpg', v_uid::text);
    r := r || '01 seller_insert_own=OK ';
  exception when others then r := r || '01 seller_insert_own=FAIL(' || sqlstate || ') ';
  end;
  -- 02 người bán up vào thư mục tin người khác: bị chặn
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('listing-public', v_tin_khac::text || '/b.jpg', v_uid::text);
    r := r || '02 seller_insert_other=LOT! ';
  exception when others then r := r || '02 seller_insert_other=chan(' || sqlstate || ') ';
  end;
  -- 03 người bán up vào bucket riêng: bị chặn
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('listing-private', v_tin_toi::text || '/so.jpg', v_uid::text);
    r := r || '03 seller_private=LOT! ';
  exception when others then r := r || '03 seller_private=chan(' || sqlstate || ') ';
  end;
  -- 04 người bán ghi listing_media cho tin mình (public): được; đọc lại được
  begin
    insert into public.listing_media (listing_id, bucket, storage_path, media_type, mime_type, sort_order)
      values (v_tin_toi, 'listing-public', v_tin_toi::text || '/a.jpg', 'khac', 'image/jpeg', 1) returning id into v_media;
    select count(*) = 1 into ok from public.listing_media where id = v_media;
    r := r || '04 seller_media_own=OK doc=' || ok || ' ';
  exception when others then r := r || '04 seller_media_own=FAIL(' || sqlstate || ') ';
  end;
  -- 05 người bán ghi listing_media cho tin người khác: bị chặn
  begin
    insert into public.listing_media (listing_id, bucket, storage_path, media_type, mime_type)
      values (v_tin_khac, 'listing-public', v_tin_khac::text || '/b.jpg', 'khac', 'image/jpeg');
    r := r || '05 seller_media_other=LOT! ';
  exception when others then r := r || '05 seller_media_other=chan(' || sqlstate || ') ';
  end;
  -- 06 người bán KHÔNG tạo được danh sách riêng
  begin
    perform public.tao_danh_sach(array['BDS-Q5-0001'], 'x');
    r := r || '06 seller_tao_ds=LOT! ';
  exception when others then r := r || '06 seller_tao_ds=chan(' || sqlstate || ') ';
  end;

  -- ── Vai admin ──
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'email', v_email)::text, true);
  -- 07 admin up bucket công khai mọi đường dẫn + bucket riêng + đọc bucket riêng
  begin
    insert into storage.objects (bucket_id, name) values ('listing-public', v_tin_khac::text || '/c.jpg');
    insert into storage.objects (bucket_id, name) values ('listing-private', v_tin_khac::text || '/so.pdf');
    select count(*) = 1 into ok from storage.objects where bucket_id = 'listing-private' and name = v_tin_khac::text || '/so.pdf';
    insert into public.listing_media (listing_id, bucket, storage_path, media_type, mime_type)
      values (v_tin_khac, 'listing-private', v_tin_khac::text || '/so.pdf', 'so_do', 'application/pdf');
    r := r || '07 admin_storage=OK doc_private=' || ok || ' ';
  exception when others then r := r || '07 admin_storage=FAIL(' || sqlstate || ') ';
  end;
  -- 08 admin tạo danh sách; mã lạ bị báo
  begin
    v_ds := public.tao_danh_sach(array[(select code from public.listings where id = v_tin_khac), (select code from public.listings where id = v_tin_toi)], 'TS-WEB2 ds');
    v_token := v_ds ->> 'token';
    r := r || '08 admin_tao_ds=OK n=' || (v_ds ->> 'n') || ' len=' || length(v_token) || ' ';
    begin
      perform public.tao_danh_sach(array['KHONG-CO-MA-NAY'], 'x');
      r := r || '08b ma_la=LOT! ';
    exception when others then r := r || '08b ma_la=bao(' || sqlstate || ') ';
    end;
  exception when others then r := r || '08 admin_tao_ds=FAIL(' || sqlstate || ':' || sqlerrm || ') ';
  end;

  -- ── Vai anon ──
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  -- 09 anon mở danh sách qua RPC: thấy 2 tin, không thấy buyer_id; token sai → null
  begin
    v_ds := public.doc_danh_sach(v_token);
    r := r || '09 anon_doc_ds n=' || jsonb_array_length(v_ds -> 'listings') || ' co_buyer=' || (v_ds ? 'buyer_id') || ' token_sai_null=' || (public.doc_danh_sach('abcdefabcdefabcdefabcdef') is null) || ' ';
  exception when others then r := r || '09 anon_doc_ds=FAIL(' || sqlstate || ') ';
  end;
  -- 10 anon: không đọc thẳng bảng, không up storage, không thấy media riêng
  begin
    perform 1 from public.curated_lists; r := r || '10 anon_bang=LOT! ';
  exception when others then r := r || '10 anon_bang=chan(' || sqlstate || ') ';
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('listing-public', v_tin_khac::text || '/z.jpg');
    r := r || '10b anon_storage=LOT! ';
  exception when others then r := r || '10b anon_storage=chan(' || sqlstate || ') ';
  end;
  select count(*) into n from public.listing_media where bucket = 'listing-private';
  r := r || '10c anon_media_private=' || n || ' ';

  execute 'reset role';
  raise exception 'KQ: %', r;
end $$;
*/
