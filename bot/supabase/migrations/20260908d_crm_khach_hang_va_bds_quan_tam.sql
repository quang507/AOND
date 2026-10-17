-- 20260908d — Hỗ trợ CRM khách hàng hai vai (vừa mua vừa bán), gắn BĐS quan tâm, sửa nhu cầu.

-- ── 1. Cấp quyền UPDATE cho admin trên buyers ───────────────────────────────────
drop policy if exists buyers_admin_update on public.buyers;
create policy buyers_admin_update on public.buyers
  for update to authenticated
  using (exists (select 1 from admins a where a.email = ((select auth.jwt() as jwt) ->> 'email'::text)))
  with check (exists (select 1 from admins a where a.email = ((select auth.jwt() as jwt) ->> 'email'::text)));

-- ── 2. Cấp quyền RLS cho admin trên interests ──────────────────────────────────
alter table public.interests enable row level security;

drop policy if exists interests_admin_select on public.interests;
create policy interests_admin_select on public.interests
  for select to authenticated
  using (exists (select 1 from admins a where a.email = ((select auth.jwt() as jwt) ->> 'email'::text)));

drop policy if exists interests_admin_insert on public.interests;
create policy interests_admin_insert on public.interests
  for insert to authenticated
  with check (exists (select 1 from admins a where a.email = ((select auth.jwt() as jwt) ->> 'email'::text)));

drop policy if exists interests_admin_delete on public.interests;
create policy interests_admin_delete on public.interests
  for delete to authenticated
  using (exists (select 1 from admins a where a.email = ((select auth.jwt() as jwt) ->> 'email'::text)));

grant select, insert, delete on public.interests to authenticated, service_role;

-- ── 3. RPC gắn BĐS quan tâm cho khách ──────────────────────────────────────────
create or replace function public.admin_gan_bds_quan_tam(p_buyer_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_listing_id uuid;
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.admins a
    where a.email = ((select auth.jwt()) ->> 'email')
  ) into v_is_admin;

  if not v_is_admin and current_user not in ('service_role', 'postgres') then
    raise exception 'Chỉ admin mới có quyền thực hiện';
  end if;

  select id into v_listing_id
  from public.listings
  where code ilike trim(p_code) or legacy_code ilike trim(p_code)
  limit 1;

  if v_listing_id is null then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy BĐS có mã ' || p_code);
  end if;

  insert into public.interests (buyer_id, listing_id)
  values (p_buyer_id, v_listing_id)
  on conflict (buyer_id, listing_id) do nothing;

  update public.listings
  set status = 'dang_quan_tam', last_interest_at = now()
  where id = v_listing_id and status in ('dang_ban', 'dang_quan_tam');

  return jsonb_build_object('ok', true, 'listing_id', v_listing_id);
end;
$$;

revoke all on function public.admin_gan_bds_quan_tam(uuid, text) from public, anon;
grant execute on function public.admin_gan_bds_quan_tam(uuid, text) to authenticated, service_role;

-- ── 4. RPC gỡ BĐS quan tâm ────────────────────────────────────────────────────
create or replace function public.admin_xoa_bds_quan_tam(p_buyer_id uuid, p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.admins a
    where a.email = ((select auth.jwt()) ->> 'email')
  ) into v_is_admin;

  if not v_is_admin and current_user not in ('service_role', 'postgres') then
    raise exception 'Chỉ admin mới có quyền thực hiện';
  end if;

  delete from public.interests
  where buyer_id = p_buyer_id and listing_id = p_listing_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_xoa_bds_quan_tam(uuid, uuid) from public, anon;
grant execute on function public.admin_xoa_bds_quan_tam(uuid, uuid) to authenticated, service_role;

-- ── 5. RPC cập nhật nhu cầu khách ─────────────────────────────────────────────
create or replace function public.admin_cap_nhat_khach(p_buyer_id uuid, p_preferences jsonb, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.admins a
    where a.email = ((select auth.jwt()) ->> 'email')
  ) into v_is_admin;

  if not v_is_admin and current_user not in ('service_role', 'postgres') then
    raise exception 'Chỉ admin mới có quyền thực hiện';
  end if;

  update public.buyers
  set preferences = p_preferences,
      notes = p_notes
  where id = p_buyer_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_cap_nhat_khach(uuid, jsonb, text) from public, anon;
grant execute on function public.admin_cap_nhat_khach(uuid, jsonb, text) to authenticated, service_role;
