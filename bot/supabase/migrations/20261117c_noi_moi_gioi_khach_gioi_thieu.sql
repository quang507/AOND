-- 20261117c (SRS-5.1zzzzzzz524) · Nối đăng ký môi giới ↔ Zalo ↔ tài khoản web; môi giới giới thiệu khách — 17/11/2026
--
-- Chủ dự án 17/11: "nối ba thứ thành một đi thì bên mình có khách riêng và môi giới đem khách về" (sau khi xem cổng agent của HiFriendz:
-- mỗi cộng tác viên một mã, hồ sơ khách mang mã người giới thiệu, mọi bước có nhật ký).
--
-- 1. Admin duyệt một dòng `dang_ky_moi_gioi` → trigger cấp `ma_moi_gioi` (MG0001…, công khai) và `ma_kich_hoat` (AOND-XXXXXXXXXX, bí mật,
--    admin gửi cho môi giới qua Zalo).
-- 2. `noi_moi_gioi(mã, zalo)`: môi giới nhắn mã kích hoạt cho bot (bot gọi bằng service_role kèm Zalo ID) hoặc nhập ở /quan-ly (đã đăng
--    nhập). Hai kênh nối về MỘT dòng `sellers`: dòng có Zalo ID là dòng sống (bot giữ id đó trong bộ đệm), tin của dòng kia chuyển sang.
--    Mỗi kênh chỉ nối được một lần cho một đăng ký.
-- 3. `khach_gioi_thieu` + `khach_gioi_thieu_nhat_ky`: môi giới đã kích hoạt gửi khách ở /quan-ly; admin tiếp nhận, đổi trạng thái ở
--    /admin/khach-gioi-thieu; mỗi bước một dòng nhật ký, môi giới đọc được nhật ký khách của mình. CHƯA có mức chi cho môi giới.
-- Đảo quyết định 28/10/2026 ("bỏ đội cộng tác viên, việc dẫn khách do admin lo"): nay môi giới cũng đem khách về, admin vẫn là người dẫn.

alter table public.sellers add column if not exists ma_moi_gioi text;
comment on column public.sellers.ma_moi_gioi is 'Mã môi giới (MG0001…) sau khi đăng ký được duyệt và đã kích hoạt (SRS-5.1zzzzzzz524). Trống = chưa là môi giới đã duyệt.';
create unique index if not exists sellers_ma_moi_gioi_key on public.sellers (ma_moi_gioi) where ma_moi_gioi is not null;

alter table public.dang_ky_moi_gioi add column if not exists seller_id uuid references public.sellers(id) on delete set null;
alter table public.dang_ky_moi_gioi add column if not exists ma_moi_gioi text;
alter table public.dang_ky_moi_gioi add column if not exists ma_kich_hoat text;
comment on column public.dang_ky_moi_gioi.seller_id is 'Dòng sellers đã nối với đăng ký này (sau khi môi giới kích hoạt qua Zalo hoặc web).';
comment on column public.dang_ky_moi_gioi.ma_moi_gioi is 'Mã môi giới cấp lúc duyệt (MG0001…).';
comment on column public.dang_ky_moi_gioi.ma_kich_hoat is 'Mã kích hoạt cấp lúc duyệt (AOND-XXXXXXXXXX). Bí mật: chỉ admin thấy, gửi riêng cho môi giới.';
create unique index if not exists dang_ky_moi_gioi_ma_key on public.dang_ky_moi_gioi (ma_moi_gioi) where ma_moi_gioi is not null;
create unique index if not exists dang_ky_moi_gioi_kich_hoat_key on public.dang_ky_moi_gioi (ma_kich_hoat) where ma_kich_hoat is not null;

create sequence if not exists public.so_moi_gioi_seq;
revoke all on sequence public.so_moi_gioi_seq from public, anon, authenticated;

create or replace function public.dang_ky_moi_gioi_cap_ma()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.trang_thai = 'duyet' and new.ma_moi_gioi is null then
    new.ma_moi_gioi := 'MG' || lpad(nextval('public.so_moi_gioi_seq')::text, 4, '0');
    new.ma_kich_hoat := 'AOND-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  end if;
  return new;
end $function$;
comment on function public.dang_ky_moi_gioi_cap_ma() is 'SRS-5.1zzzzzzz524: lúc admin duyệt đăng ký môi giới, cấp mã môi giới và mã kích hoạt (một lần).';
revoke all on function public.dang_ky_moi_gioi_cap_ma() from public, anon, authenticated;
drop trigger if exists trg_dang_ky_moi_gioi_cap_ma on public.dang_ky_moi_gioi;
create trigger trg_dang_ky_moi_gioi_cap_ma before update on public.dang_ky_moi_gioi
  for each row execute function public.dang_ky_moi_gioi_cap_ma();

create or replace function public.noi_moi_gioi(p_ma text, p_zalo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ma text := upper(btrim(coalesce(p_ma, '')));
  v_bot boolean := coalesce(auth.role(), '') = 'service_role';
  v_uid uuid := auth.uid();
  v_zalo text;
  dk public.dang_ky_moi_gioi;
  s_id uuid;       -- dòng sellers của kênh đang gọi
  s_ma text;
  c_id uuid;       -- dòng sellers đã nối với đăng ký
  c_zalo text;
  c_auth uuid;
begin
  if v_bot then
    v_zalo := nullif(btrim(coalesce(p_zalo, '')), '');
    if v_zalo is null then return jsonb_build_object('ok', false, 'loi', 'zalo'); end if;
  elsif v_uid is null then
    return jsonb_build_object('ok', false, 'loi', 'dang_nhap');
  end if;

  select * into dk from dang_ky_moi_gioi where ma_kich_hoat = v_ma and trang_thai = 'duyet' for update;
  if not found then return jsonb_build_object('ok', false, 'loi', 'ma'); end if;

  if v_zalo is not null then
    select id, ma_moi_gioi into s_id, s_ma from sellers where zalo_user_id = v_zalo;
    if s_id is null then
      insert into sellers (zalo_user_id, name, seller_type, seller_type_source) values (v_zalo, dk.ho_ten, 'nmg', 'admin') returning id into s_id;
    end if;
  else
    select id, ma_moi_gioi into s_id, s_ma from sellers where auth_user_id = v_uid;
    if s_id is null then
      insert into sellers (auth_user_id, name, seller_type, seller_type_source) values (v_uid, dk.ho_ten, 'nmg', 'admin') returning id into s_id;
    end if;
  end if;
  if s_ma is not null and s_ma <> dk.ma_moi_gioi then return jsonb_build_object('ok', false, 'loi', 'tai_khoan_da_noi'); end if;

  c_id := dk.seller_id;
  if c_id is null or c_id = s_id then
    c_id := s_id;
  else
    select zalo_user_id, auth_user_id into c_zalo, c_auth from sellers where id = c_id;
    if v_zalo is not null then
      if c_zalo is not null then return jsonb_build_object('ok', false, 'loi', 'da_noi_zalo'); end if;
      -- Dòng có Zalo ID là dòng sống (bot giữ id này trong bộ đệm): tin của dòng web chuyển sang, tài khoản web gắn sang.
      update listings set seller_id = s_id where seller_id = c_id;
      update sellers set auth_user_id = null, ma_moi_gioi = null where id = c_id;
      update sellers set auth_user_id = c_auth where id = s_id and auth_user_id is null;
      c_id := s_id;
    else
      if c_auth is not null then return jsonb_build_object('ok', false, 'loi', 'da_noi_web'); end if;
      update listings set seller_id = c_id where seller_id = s_id;
      update sellers set auth_user_id = null where id = s_id;
      update sellers set auth_user_id = v_uid where id = c_id;
    end if;
  end if;

  update sellers s
     set seller_type = 'nmg', seller_type_source = 'admin', ma_moi_gioi = dk.ma_moi_gioi,
         name = coalesce(nullif(btrim(s.name), ''), dk.ho_ten),
         phone = case when s.phone is null and not exists (select 1 from sellers x where x.phone = dk.so_dien_thoai)
                      then dk.so_dien_thoai else s.phone end
   where s.id = c_id;
  update dang_ky_moi_gioi set seller_id = c_id where id = dk.id;
  return jsonb_build_object('ok', true, 'ma_moi_gioi', dk.ma_moi_gioi, 'ho_ten', dk.ho_ten);
end $function$;
comment on function public.noi_moi_gioi(text, text) is
  'SRS-5.1zzzzzzz524: nối một đăng ký môi giới đã duyệt với người gọi bằng mã kích hoạt — bot gọi kèm Zalo ID (service_role), web gọi khi đã đăng nhập. Trả {ok, ma_moi_gioi, ho_ten} hoặc {ok:false, loi}.';
revoke all on function public.noi_moi_gioi(text, text) from public, anon, authenticated;
grant execute on function public.noi_moi_gioi(text, text) to authenticated, service_role;

create or replace function public.toi_la_moi_gioi()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object('seller_id', s.id, 'ma_moi_gioi', s.ma_moi_gioi, 'ten', s.name, 'co_zalo', s.zalo_user_id is not null,
                            'chuan', case when s.ma_moi_gioi is not null then public.chuan_nmg(s.id) end)
    from sellers s where s.auth_user_id = auth.uid();
$function$;
comment on function public.toi_la_moi_gioi() is
  'SRS-5.1zzzzzzz524: hồ sơ môi giới của người đang đăng nhập web — mã môi giới (trống = chưa kích hoạt), đã nối Zalo chưa, chuẩn môi giới (chuan_nmg). Chưa có dòng sellers → null.';
revoke all on function public.toi_la_moi_gioi() from public, anon, authenticated;
grant execute on function public.toi_la_moi_gioi() to authenticated, service_role;

-- ───────────────────────── Khách môi giới giới thiệu ─────────────────────────
create table if not exists public.khach_gioi_thieu (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  seller_id uuid not null references public.sellers(id),
  ten_khach text not null,
  so_dien_thoai text not null,
  nhu_cau text not null check (nhu_cau in ('mua', 'thue')),
  khu_vuc text,
  ngan_sach text,
  ma_tin text,
  ghi_chu text,
  khach_dong_y_luc timestamptz not null default now(),
  trang_thai text not null default 'moi' check (trang_thai in ('moi', 'da_tiep_nhan', 'dang_cham_soc', 'da_xem_nha', 'chot', 'khong_thanh')),
  nguoi_phu_trach text,
  cap_nhat_luc timestamptz
);
comment on table public.khach_gioi_thieu is '[NGƯỜI & HỘI THOẠI] Khách mua / thuê do môi giới đã kích hoạt giới thiệu qua /quan-ly (SRS-5.1zzzzzzz524). Ghi qua gui_khach_gioi_thieu(); admin xử lý ở /admin/khach-gioi-thieu.';
comment on column public.khach_gioi_thieu.seller_id is 'Môi giới giới thiệu (sellers.id, có ma_moi_gioi).';
comment on column public.khach_gioi_thieu.ten_khach is 'Tên khách, môi giới khai.';
comment on column public.khach_gioi_thieu.so_dien_thoai is 'Số điện thoại khách (0xxxxxxxxx). Môi giới xác nhận khách đã đồng ý cho chuyển.';
comment on column public.khach_gioi_thieu.nhu_cau is 'mua hoặc thue.';
comment on column public.khach_gioi_thieu.khu_vuc is 'Khu vực khách muốn tìm, chữ tự do.';
comment on column public.khach_gioi_thieu.ngan_sach is 'Ngân sách khách, giữ nguyên cách môi giới ghi.';
comment on column public.khach_gioi_thieu.ma_tin is 'Mã tin khách đang quan tâm, nếu có.';
comment on column public.khach_gioi_thieu.ghi_chu is 'Lời môi giới dặn thêm.';
comment on column public.khach_gioi_thieu.khach_dong_y_luc is 'Lúc môi giới tích xác nhận khách đồng ý cho chuyển thông tin.';
comment on column public.khach_gioi_thieu.trang_thai is 'moi → da_tiep_nhan → dang_cham_soc → da_xem_nha → chot / khong_thanh.';
comment on column public.khach_gioi_thieu.nguoi_phu_trach is 'Email admin đang phụ trách khách này.';
comment on column public.khach_gioi_thieu.cap_nhat_luc is 'Lần gần nhất đổi trạng thái hoặc ghi chú.';
create index if not exists khach_gioi_thieu_seller_idx on public.khach_gioi_thieu (seller_id, created_at desc);
create index if not exists khach_gioi_thieu_sdt_idx on public.khach_gioi_thieu (so_dien_thoai);

create table if not exists public.khach_gioi_thieu_nhat_ky (
  id uuid primary key default gen_random_uuid(),
  khach_id uuid not null references public.khach_gioi_thieu(id) on delete cascade,
  luc timestamptz not null default now(),
  vai text not null check (vai in ('moi_gioi', 'admin')),
  ai text not null,
  viec text not null,
  ghi_chu text
);
comment on table public.khach_gioi_thieu_nhat_ky is '[NGƯỜI & HỘI THOẠI] Nhật ký từng bước của một khách môi giới giới thiệu: ai, lúc nào, làm gì (SRS-5.1zzzzzzz524). Môi giới đọc được nhật ký khách của mình.';
comment on column public.khach_gioi_thieu_nhat_ky.vai is 'moi_gioi hoặc admin.';
comment on column public.khach_gioi_thieu_nhat_ky.ai is 'Mã môi giới (MG0001) hoặc email admin.';
comment on column public.khach_gioi_thieu_nhat_ky.viec is 'Việc đã làm: tạo hồ sơ, tên trạng thái mới, ghi chú.';
comment on column public.khach_gioi_thieu_nhat_ky.ghi_chu is 'Lời ghi kèm (môi giới đọc được).';
create index if not exists khach_gioi_thieu_nhat_ky_idx on public.khach_gioi_thieu_nhat_ky (khach_id, luc);

alter table public.khach_gioi_thieu enable row level security;
alter table public.khach_gioi_thieu_nhat_ky enable row level security;
revoke all on public.khach_gioi_thieu from anon, authenticated;
revoke all on public.khach_gioi_thieu_nhat_ky from anon, authenticated;
grant select on public.khach_gioi_thieu to authenticated;
grant select on public.khach_gioi_thieu_nhat_ky to authenticated;
drop policy if exists khach_gioi_thieu_doc on public.khach_gioi_thieu;
create policy khach_gioi_thieu_doc on public.khach_gioi_thieu for select to authenticated
  using (public.la_admin() or seller_id in (select s.id from public.sellers s where s.auth_user_id = (select auth.uid())));
drop policy if exists khach_gioi_thieu_nhat_ky_doc on public.khach_gioi_thieu_nhat_ky;
create policy khach_gioi_thieu_nhat_ky_doc on public.khach_gioi_thieu_nhat_ky for select to authenticated
  using (public.la_admin() or khach_id in (select k.id from public.khach_gioi_thieu k
                                            where k.seller_id in (select s.id from public.sellers s where s.auth_user_id = (select auth.uid()))));

create or replace function public.gui_khach_gioi_thieu(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sid uuid;
  v_ma text;
  v_ten text := btrim(regexp_replace(coalesce(p->>'ten_khach', ''), '\s+', ' ', 'g'));
  v_sdt text := regexp_replace(coalesce(p->>'so_dien_thoai', ''), '\D', '', 'g');
  v_nc text := coalesce(p->>'nhu_cau', '');
  v_khu text := nullif(btrim(coalesce(p->>'khu_vuc', '')), '');
  v_ns text := nullif(btrim(coalesce(p->>'ngan_sach', '')), '');
  v_tin text := nullif(upper(btrim(coalesce(p->>'ma_tin', ''))), '');
  v_ghi text := nullif(btrim(coalesce(p->>'ghi_chu', '')), '');
  v_id uuid;
begin
  select s.id, s.ma_moi_gioi into v_sid, v_ma from sellers s where s.auth_user_id = auth.uid();
  if v_sid is null or v_ma is null then return jsonb_build_object('ok', false, 'loi', 'chua_kich_hoat'); end if;
  if char_length(v_ten) < 2 or char_length(v_ten) > 80 then return jsonb_build_object('ok', false, 'loi', 'ten_khach'); end if;
  if v_sdt like '84%' and char_length(v_sdt) = 11 then v_sdt := '0' || substr(v_sdt, 3); end if;
  if v_sdt !~ '^0[35789]\d{8}$' then return jsonb_build_object('ok', false, 'loi', 'so_dien_thoai'); end if;
  if v_nc not in ('mua', 'thue') then return jsonb_build_object('ok', false, 'loi', 'nhu_cau'); end if;
  if coalesce(p->>'dong_y', '') <> 'true' then return jsonb_build_object('ok', false, 'loi', 'dong_y'); end if;
  if char_length(coalesce(v_khu, '')) > 120 or char_length(coalesce(v_ns, '')) > 60 or char_length(coalesce(v_tin, '')) > 40
     or char_length(coalesce(v_ghi, '')) > 500 then
    return jsonb_build_object('ok', false, 'loi', 'qua_dai');
  end if;
  -- Một khách đang được chăm thì không nhận lần hai (ai giới thiệu trước giữ khách); một môi giới tối đa 30 khách / ngày.
  if exists (select 1 from khach_gioi_thieu k where k.so_dien_thoai = v_sdt and k.trang_thai not in ('chot', 'khong_thanh')) then
    return jsonb_build_object('ok', false, 'loi', 'trung');
  end if;
  if (select count(*) from khach_gioi_thieu k where k.seller_id = v_sid and k.created_at > now() - interval '24 hours') >= 30 then
    return jsonb_build_object('ok', false, 'loi', 'qua_nhieu');
  end if;
  insert into khach_gioi_thieu (seller_id, ten_khach, so_dien_thoai, nhu_cau, khu_vuc, ngan_sach, ma_tin, ghi_chu)
  values (v_sid, v_ten, v_sdt, v_nc, v_khu, v_ns, v_tin, v_ghi) returning id into v_id;
  insert into khach_gioi_thieu_nhat_ky (khach_id, vai, ai, viec) values (v_id, 'moi_gioi', v_ma, 'Tạo hồ sơ khách');
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;
comment on function public.gui_khach_gioi_thieu(jsonb) is
  'SRS-5.1zzzzzzz524: môi giới đã kích hoạt gửi một khách mua / thuê. Kiểm dữ liệu, chặn khách đang được chăm, ghi dòng nhật ký đầu. Trả {ok, id} hoặc {ok:false, loi}.';
revoke all on function public.gui_khach_gioi_thieu(jsonb) from public, anon, authenticated;
grant execute on function public.gui_khach_gioi_thieu(jsonb) to authenticated, service_role;

create or replace function public.cap_nhat_khach_gioi_thieu(p_id uuid, p_trang_thai text default null, p_ghi_chu text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin boolean := public.la_admin();
  v_email text := (select auth.jwt()) ->> 'email';
  v_ghi text := nullif(btrim(coalesce(p_ghi_chu, '')), '');
  k public.khach_gioi_thieu;
  v_ma text;
  v_nhan text;
begin
  select * into k from khach_gioi_thieu where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'loi', 'khong_thay'); end if;
  if char_length(coalesce(v_ghi, '')) > 1000 then return jsonb_build_object('ok', false, 'loi', 'qua_dai'); end if;
  if v_admin then
    if p_trang_thai is not null and p_trang_thai not in ('moi', 'da_tiep_nhan', 'dang_cham_soc', 'da_xem_nha', 'chot', 'khong_thanh') then
      return jsonb_build_object('ok', false, 'loi', 'trang_thai');
    end if;
    if p_trang_thai is null and v_ghi is null then return jsonb_build_object('ok', false, 'loi', 'trong'); end if;
    v_nhan := case p_trang_thai when 'moi' then 'Chuyển về mới' when 'da_tiep_nhan' then 'Tiếp nhận khách' when 'dang_cham_soc' then 'Đang chăm sóc'
                                when 'da_xem_nha' then 'Khách đã xem nhà' when 'chot' then 'Chốt giao dịch' when 'khong_thanh' then 'Không thành'
                                else 'Ghi chú' end;
    update khach_gioi_thieu
       set trang_thai = coalesce(p_trang_thai, trang_thai), cap_nhat_luc = now(),
           nguoi_phu_trach = case when p_trang_thai is not null and p_trang_thai <> 'moi' then v_email else nguoi_phu_trach end
     where id = p_id;
    insert into khach_gioi_thieu_nhat_ky (khach_id, vai, ai, viec, ghi_chu) values (p_id, 'admin', coalesce(v_email, 'admin'), v_nhan, v_ghi);
    return jsonb_build_object('ok', true);
  end if;
  -- Môi giới: chỉ ghi thêm lời nhắn vào khách của chính mình, không đổi trạng thái.
  select s.ma_moi_gioi into v_ma from sellers s where s.id = k.seller_id and s.auth_user_id = auth.uid();
  if v_ma is null then return jsonb_build_object('ok', false, 'loi', 'khong_quyen'); end if;
  if v_ghi is null then return jsonb_build_object('ok', false, 'loi', 'trong'); end if;
  update khach_gioi_thieu set cap_nhat_luc = now() where id = p_id;
  insert into khach_gioi_thieu_nhat_ky (khach_id, vai, ai, viec, ghi_chu) values (p_id, 'moi_gioi', v_ma, 'Ghi chú', v_ghi);
  return jsonb_build_object('ok', true);
end $function$;
comment on function public.cap_nhat_khach_gioi_thieu(uuid, text, text) is
  'SRS-5.1zzzzzzz524: admin đổi trạng thái / ghi chú một khách môi giới giới thiệu; môi giới ghi thêm lời nhắn vào khách của mình. Mỗi lần gọi thêm một dòng nhật ký.';
revoke all on function public.cap_nhat_khach_gioi_thieu(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cap_nhat_khach_gioi_thieu(uuid, text, text) to authenticated, service_role;
