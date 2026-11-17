-- 20261117b (SRS-5.1zzzzzzz523) · Môi giới đăng ký trên web, admin quản lý — 17/11/2026
--
-- Chủ dự án 17/11 (sau khi xem batdongsan.com.vn và hifriendz.com): "Form trên web như HiFriendz và có trang trong admin quản lý đi".
-- Trước bản này trang /moi-gioi chỉ có một nút "Nhắn Zalo để tham gia"; không nơi nào ghi lại ai muốn vào mạng lưới, chuyên khu nào.
--
-- Bảng `dang_ky_moi_gioi`: một dòng mỗi lần đăng ký từ form /moi-gioi/dang-ky. Web dùng khoá công khai nên KHÔNG được ghi thẳng bảng —
-- đi qua hàm `gui_dang_ky_moi_gioi(jsonb)` (kiểm dữ liệu, chống gửi dồn). Chỉ admin đọc và đổi trạng thái (RLS `la_admin()`).
-- Không thu căn cước hay tài khoản ngân hàng — hai thứ đó chỉ cần khi ký hợp tác, làm ngoài form.

create table if not exists public.dang_ky_moi_gioi (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  loai text not null check (loai in ('ca_nhan', 'san')),
  ho_ten text not null,
  so_dien_thoai text not null,
  khu_vuc text[] not null,
  loai_bds text[] not null default '{}',
  cong_ty text,
  kinh_nghiem text,
  so_can integer check (so_can between 0 and 100000),
  ghi_chu text,
  dong_y_du_lieu_luc timestamptz not null default now(),
  trang_thai text not null default 'moi' check (trang_thai in ('moi', 'da_lien_he', 'duyet', 'tu_choi')),
  ghi_chu_admin text,
  xu_ly_luc timestamptz,
  xu_ly_boi text
);

comment on table public.dang_ky_moi_gioi is '[NGƯỜI & HỘI THOẠI] Môi giới / sàn đăng ký vào mạng lưới qua form web /moi-gioi/dang-ky (SRS-5.1zzzzzzz523). Ghi qua gui_dang_ky_moi_gioi(); chỉ admin đọc, đổi trạng thái ở /admin/moi-gioi.';
comment on column public.dang_ky_moi_gioi.loai is 'ca_nhan = môi giới cá nhân; san = sàn / công ty môi giới.';
comment on column public.dang_ky_moi_gioi.ho_ten is 'Họ tên người đăng ký tự khai.';
comment on column public.dang_ky_moi_gioi.so_dien_thoai is 'Số điện thoại có Zalo, đã chuẩn về dạng 0xxxxxxxxx. Admin dùng để nhắn Zalo.';
comment on column public.dang_ky_moi_gioi.khu_vuc is 'Khu vực hoạt động người đăng ký chọn (1–5 mục, chữ theo lib/moi-gioi.ts).';
comment on column public.dang_ky_moi_gioi.loai_bds is 'Loại nhà đất chuyên (0–8 mục).';
comment on column public.dang_ky_moi_gioi.cong_ty is 'Tên sàn / công ty đang làm (bắt buộc khi loai = san).';
comment on column public.dang_ky_moi_gioi.kinh_nghiem is 'Mức kinh nghiệm tự khai (chữ theo lib/moi-gioi.ts).';
comment on column public.dang_ky_moi_gioi.so_can is 'Số căn đang nhận bán / cho thuê, tự khai.';
comment on column public.dang_ky_moi_gioi.ghi_chu is 'Lời nhắn thêm của người đăng ký.';
comment on column public.dang_ky_moi_gioi.dong_y_du_lieu_luc is 'Lúc người đăng ký tích đồng ý cho xử lý dữ liệu cá nhân để liên hệ hợp tác.';
comment on column public.dang_ky_moi_gioi.trang_thai is 'moi → da_lien_he → duyet / tu_choi. Admin đổi ở /admin/moi-gioi.';
comment on column public.dang_ky_moi_gioi.ghi_chu_admin is 'Ghi chú nội bộ của admin.';
comment on column public.dang_ky_moi_gioi.xu_ly_luc is 'Lần gần nhất admin đổi trạng thái / ghi chú.';
comment on column public.dang_ky_moi_gioi.xu_ly_boi is 'Email admin xử lý lần gần nhất.';

create index if not exists dang_ky_moi_gioi_created_idx on public.dang_ky_moi_gioi (created_at desc);
create index if not exists dang_ky_moi_gioi_sdt_idx on public.dang_ky_moi_gioi (so_dien_thoai, created_at desc);

alter table public.dang_ky_moi_gioi enable row level security;
revoke all on public.dang_ky_moi_gioi from anon, authenticated;
grant select on public.dang_ky_moi_gioi to authenticated;
grant update (trang_thai, ghi_chu_admin, xu_ly_luc, xu_ly_boi) on public.dang_ky_moi_gioi to authenticated;
drop policy if exists dang_ky_moi_gioi_admin_doc on public.dang_ky_moi_gioi;
create policy dang_ky_moi_gioi_admin_doc on public.dang_ky_moi_gioi for select to authenticated using (public.la_admin());
drop policy if exists dang_ky_moi_gioi_admin_sua on public.dang_ky_moi_gioi;
create policy dang_ky_moi_gioi_admin_sua on public.dang_ky_moi_gioi for update to authenticated
  using (public.la_admin()) with check (public.la_admin());

create or replace function public.gui_dang_ky_moi_gioi(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_loai text := coalesce(p->>'loai', '');
  v_ten text := btrim(regexp_replace(coalesce(p->>'ho_ten', ''), '\s+', ' ', 'g'));
  v_sdt text := regexp_replace(coalesce(p->>'so_dien_thoai', ''), '\D', '', 'g');
  v_cty text := nullif(btrim(coalesce(p->>'cong_ty', '')), '');
  v_kn text := nullif(btrim(coalesce(p->>'kinh_nghiem', '')), '');
  v_ghi text := nullif(btrim(coalesce(p->>'ghi_chu', '')), '');
  v_can integer;
  v_khu text[];
  v_bds text[];
begin
  -- Mã lỗi ngắn để form hiện đúng chỗ; không bao giờ trả lại dữ liệu người khác.
  if v_loai not in ('ca_nhan', 'san') then return jsonb_build_object('ok', false, 'loi', 'loai'); end if;
  if char_length(v_ten) < 2 or char_length(v_ten) > 80 then return jsonb_build_object('ok', false, 'loi', 'ho_ten'); end if;
  if v_sdt like '84%' and char_length(v_sdt) = 11 then v_sdt := '0' || substr(v_sdt, 3); end if;
  if v_sdt !~ '^0[35789]\d{8}$' then return jsonb_build_object('ok', false, 'loi', 'so_dien_thoai'); end if;
  if coalesce(p->>'dong_y', '') <> 'true' then return jsonb_build_object('ok', false, 'loi', 'dong_y'); end if;
  if jsonb_typeof(p->'khu_vuc') is distinct from 'array' then return jsonb_build_object('ok', false, 'loi', 'khu_vuc'); end if;
  select array_agg(distinct btrim(x)) into v_khu from jsonb_array_elements_text(p->'khu_vuc') x where char_length(btrim(x)) between 2 and 60;
  if v_khu is null or cardinality(v_khu) > 5 then return jsonb_build_object('ok', false, 'loi', 'khu_vuc'); end if;
  if jsonb_typeof(p->'loai_bds') = 'array' then
    select array_agg(distinct btrim(x)) into v_bds from jsonb_array_elements_text(p->'loai_bds') x where char_length(btrim(x)) between 2 and 40;
  end if;
  v_bds := coalesce(v_bds, '{}');
  if cardinality(v_bds) > 8 then return jsonb_build_object('ok', false, 'loi', 'loai_bds'); end if;
  if v_loai = 'san' and v_cty is null then return jsonb_build_object('ok', false, 'loi', 'cong_ty'); end if;
  if char_length(coalesce(v_cty, '')) > 120 or char_length(coalesce(v_kn, '')) > 60 or char_length(coalesce(v_ghi, '')) > 500 then
    return jsonb_build_object('ok', false, 'loi', 'qua_dai');
  end if;
  if coalesce(p->>'so_can', '') ~ '^\d{1,6}$' then v_can := (p->>'so_can')::integer; end if;

  -- Chống gửi dồn: cùng số trong 24 giờ thì coi như đã nhận (không thêm dòng); cả bảng quá 40 dòng / giờ thì hẹn thử lại.
  if exists (select 1 from dang_ky_moi_gioi d where d.so_dien_thoai = v_sdt and d.created_at > now() - interval '24 hours') then
    return jsonb_build_object('ok', true, 'da_co', true);
  end if;
  if (select count(*) from dang_ky_moi_gioi d where d.created_at > now() - interval '1 hour') >= 40 then
    return jsonb_build_object('ok', false, 'loi', 'qua_nhieu');
  end if;

  insert into dang_ky_moi_gioi (loai, ho_ten, so_dien_thoai, khu_vuc, loai_bds, cong_ty, kinh_nghiem, so_can, ghi_chu)
  values (v_loai, v_ten, v_sdt, v_khu, v_bds, v_cty, v_kn, v_can, v_ghi);
  return jsonb_build_object('ok', true, 'da_co', false);
end $function$;
comment on function public.gui_dang_ky_moi_gioi(jsonb) is
  'SRS-5.1zzzzzzz523: nhận một lượt đăng ký môi giới từ form web (khoá công khai). Kiểm dữ liệu, chuẩn số điện thoại, chống gửi dồn. Trả {ok, loi?, da_co?}.';
revoke all on function public.gui_dang_ky_moi_gioi(jsonb) from public, anon, authenticated;
grant execute on function public.gui_dang_ky_moi_gioi(jsonb) to anon, authenticated, service_role;
