-- 20261117d (SRS-5.1zzzzzzz525) · Mức chi cho môi giới giới thiệu khách; chốt và đánh dấu đã chi; báo admin qua Zalo — 17/11/2026
--
-- Chủ dự án 17/11: "đưa con số theo thị trường đi … cứ đưa số hợp lý trước chỉnh sau, còn gì thiếu thì làm để chạy được đã".
-- Mốc thị trường tra 17/11: môi giới có khách và môi giới giữ hàng thường chia 50/50; người chỉ giới thiệu, không dẫn khách, nhận 10–20 %;
-- HiFriendz chi cộng tác viên khoảng 12–22 % tiền thuê một tháng. Ở đây môi giới chỉ giới thiệu, admin dẫn khách → khởi đầu 20 % PHÍ CÔNG TY
-- THU ĐƯỢC từ giao dịch, cho cả bán và thuê; admin chỉnh ở /admin/khach-gioi-thieu. Chi sau khi công ty thu đủ phí.
--
-- 1. `cau_hinh_moi_gioi` (một dòng): tỷ lệ chi; ai cũng đọc được (mức công bố), chỉ admin sửa.
-- 2. `chot_khach_gioi_thieu`: admin chốt một khách, nhập phí công ty thu → hệ thống tính phần môi giới theo tỷ lệ lúc chốt (làm tròn nghìn).
--    `chi_hoa_hong_khach_gioi_thieu`: đánh dấu đã chi. `cap_nhat_khach_gioi_thieu` không còn nhận trạng thái `chot` (phải qua hàm chốt),
--    mở lại khách đã chốt thì xoá phần đã tính, khách đã chi thì không đổi trạng thái được.
-- 3. Môi giới đăng ký / gửi khách → một tin nội bộ cho admin qua Zalo (`reminders` kind escalation, đường bridge sẵn có).

create table if not exists public.cau_hinh_moi_gioi (
  id smallint primary key default 1 check (id = 1),
  ty_le_ban numeric not null default 0.20 check (ty_le_ban between 0 and 1),
  ty_le_thue numeric not null default 0.20 check (ty_le_thue between 0 and 1),
  cap_nhat_luc timestamptz,
  cap_nhat_boi text
);
comment on table public.cau_hinh_moi_gioi is '[CẤU HÌNH] Một dòng: tỷ lệ chi cho môi giới giới thiệu khách, tính trên phí công ty thu được (SRS-5.1zzzzzzz525). Ai cũng đọc được; admin sửa ở /admin/khach-gioi-thieu.';
comment on column public.cau_hinh_moi_gioi.ty_le_ban is 'Phần môi giới được chi khi khách giới thiệu MUA thành công, 0–1 trên phí công ty thu.';
comment on column public.cau_hinh_moi_gioi.ty_le_thue is 'Phần môi giới được chi khi khách giới thiệu THUÊ thành công, 0–1 trên phí công ty thu.';
comment on column public.cau_hinh_moi_gioi.cap_nhat_luc is 'Lần sửa gần nhất.';
comment on column public.cau_hinh_moi_gioi.cap_nhat_boi is 'Email admin sửa lần gần nhất.';
insert into public.cau_hinh_moi_gioi (id) values (1) on conflict (id) do nothing;
alter table public.cau_hinh_moi_gioi enable row level security;
revoke all on public.cau_hinh_moi_gioi from anon, authenticated;
grant select on public.cau_hinh_moi_gioi to anon, authenticated;
grant update (ty_le_ban, ty_le_thue, cap_nhat_luc, cap_nhat_boi) on public.cau_hinh_moi_gioi to authenticated;
drop policy if exists cau_hinh_moi_gioi_doc on public.cau_hinh_moi_gioi;
create policy cau_hinh_moi_gioi_doc on public.cau_hinh_moi_gioi for select to anon, authenticated using (true);
drop policy if exists cau_hinh_moi_gioi_admin_sua on public.cau_hinh_moi_gioi;
create policy cau_hinh_moi_gioi_admin_sua on public.cau_hinh_moi_gioi for update to authenticated using (public.la_admin()) with check (public.la_admin());

alter table public.khach_gioi_thieu add column if not exists loai_chot text check (loai_chot in ('ban', 'thue'));
alter table public.khach_gioi_thieu add column if not exists gia_chot_vnd bigint check (gia_chot_vnd >= 0);
alter table public.khach_gioi_thieu add column if not exists phi_cong_ty_vnd bigint check (phi_cong_ty_vnd >= 0);
alter table public.khach_gioi_thieu add column if not exists hoa_hong_ty_le numeric;
alter table public.khach_gioi_thieu add column if not exists hoa_hong_vnd bigint;
alter table public.khach_gioi_thieu add column if not exists hoa_hong_trang_thai text check (hoa_hong_trang_thai in ('cho_thu_phi', 'da_chi'));
alter table public.khach_gioi_thieu add column if not exists hoa_hong_chi_luc timestamptz;
comment on column public.khach_gioi_thieu.loai_chot is 'Giao dịch chốt là ban hay thue.';
comment on column public.khach_gioi_thieu.gia_chot_vnd is 'Giá chốt (bán) hoặc tiền thuê một tháng (thuê), đồng. Tuỳ chọn.';
comment on column public.khach_gioi_thieu.phi_cong_ty_vnd is 'Phí công ty thu từ giao dịch này, đồng — gốc để tính phần môi giới.';
comment on column public.khach_gioi_thieu.hoa_hong_ty_le is 'Tỷ lệ chi áp dụng lúc chốt (chụp từ cau_hinh_moi_gioi).';
comment on column public.khach_gioi_thieu.hoa_hong_vnd is 'Phần chi cho môi giới = phí công ty × tỷ lệ, làm tròn nghìn đồng. Trước thuế thu nhập cá nhân.';
comment on column public.khach_gioi_thieu.hoa_hong_trang_thai is 'cho_thu_phi = chờ công ty thu đủ phí; da_chi = đã chuyển cho môi giới.';
comment on column public.khach_gioi_thieu.hoa_hong_chi_luc is 'Lúc admin đánh dấu đã chi.';

create or replace function public.chot_khach_gioi_thieu(p_id uuid, p_loai text, p_phi_cong_ty bigint, p_gia_chot bigint default null, p_ghi_chu text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text := (select auth.jwt()) ->> 'email';
  v_ghi text := nullif(btrim(coalesce(p_ghi_chu, '')), '');
  k public.khach_gioi_thieu;
  v_tl numeric;
  v_hh bigint;
begin
  if not public.la_admin() then return jsonb_build_object('ok', false, 'loi', 'khong_quyen'); end if;
  if p_loai not in ('ban', 'thue') then return jsonb_build_object('ok', false, 'loi', 'loai'); end if;
  if p_phi_cong_ty is null or p_phi_cong_ty <= 0 or p_phi_cong_ty > 100000000000 then return jsonb_build_object('ok', false, 'loi', 'phi'); end if;
  if p_gia_chot is not null and (p_gia_chot <= 0 or p_gia_chot < p_phi_cong_ty) then return jsonb_build_object('ok', false, 'loi', 'gia'); end if;
  if char_length(coalesce(v_ghi, '')) > 1000 then return jsonb_build_object('ok', false, 'loi', 'qua_dai'); end if;
  select * into k from khach_gioi_thieu where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'loi', 'khong_thay'); end if;
  if k.hoa_hong_trang_thai = 'da_chi' then return jsonb_build_object('ok', false, 'loi', 'da_chi'); end if;
  select case p_loai when 'ban' then ty_le_ban else ty_le_thue end into v_tl from cau_hinh_moi_gioi where id = 1;
  v_tl := coalesce(v_tl, 0.20);
  v_hh := (round(p_phi_cong_ty * v_tl / 1000.0) * 1000)::bigint;
  update khach_gioi_thieu
     set trang_thai = 'chot', loai_chot = p_loai, gia_chot_vnd = p_gia_chot, phi_cong_ty_vnd = p_phi_cong_ty, hoa_hong_ty_le = v_tl,
         hoa_hong_vnd = v_hh, hoa_hong_trang_thai = 'cho_thu_phi', hoa_hong_chi_luc = null, cap_nhat_luc = now(), nguoi_phu_trach = v_email
   where id = p_id;
  insert into khach_gioi_thieu_nhat_ky (khach_id, vai, ai, viec, ghi_chu)
  values (p_id, 'admin', coalesce(v_email, 'admin'), 'Chốt giao dịch',
          concat_ws(' ', 'Phần của môi giới: ' || replace(to_char(v_hh, 'FM999,999,999,999'), ',', '.') || ' đồng (' || round(v_tl * 100)::text
                    || '% phí công ty thu), chi sau khi công ty thu đủ phí.', v_ghi));
  return jsonb_build_object('ok', true, 'hoa_hong_vnd', v_hh, 'ty_le', v_tl);
end $function$;
comment on function public.chot_khach_gioi_thieu(uuid, text, bigint, bigint, text) is
  'SRS-5.1zzzzzzz525: admin chốt một khách môi giới giới thiệu — nhập phí công ty thu, hệ thống tính phần môi giới theo cau_hinh_moi_gioi (làm tròn nghìn) và ghi nhật ký.';
revoke all on function public.chot_khach_gioi_thieu(uuid, text, bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.chot_khach_gioi_thieu(uuid, text, bigint, bigint, text) to authenticated, service_role;

create or replace function public.chi_hoa_hong_khach_gioi_thieu(p_id uuid, p_ghi_chu text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text := (select auth.jwt()) ->> 'email';
  v_ghi text := nullif(btrim(coalesce(p_ghi_chu, '')), '');
  k public.khach_gioi_thieu;
begin
  if not public.la_admin() then return jsonb_build_object('ok', false, 'loi', 'khong_quyen'); end if;
  select * into k from khach_gioi_thieu where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'loi', 'khong_thay'); end if;
  if k.trang_thai <> 'chot' or k.hoa_hong_trang_thai is distinct from 'cho_thu_phi' then return jsonb_build_object('ok', false, 'loi', 'chua_chot'); end if;
  update khach_gioi_thieu set hoa_hong_trang_thai = 'da_chi', hoa_hong_chi_luc = now(), cap_nhat_luc = now() where id = p_id;
  insert into khach_gioi_thieu_nhat_ky (khach_id, vai, ai, viec, ghi_chu)
  values (p_id, 'admin', coalesce(v_email, 'admin'), 'Đã chi cho môi giới',
          concat_ws(' ', replace(to_char(k.hoa_hong_vnd, 'FM999,999,999,999'), ',', '.') || ' đồng.', v_ghi));
  return jsonb_build_object('ok', true);
end $function$;
comment on function public.chi_hoa_hong_khach_gioi_thieu(uuid, text) is
  'SRS-5.1zzzzzzz525: admin đánh dấu đã chi phần môi giới của một khách đã chốt (một chiều), ghi nhật ký.';
revoke all on function public.chi_hoa_hong_khach_gioi_thieu(uuid, text) from public, anon, authenticated;
grant execute on function public.chi_hoa_hong_khach_gioi_thieu(uuid, text) to authenticated, service_role;

do $$
declare
  def text;
  cu text;
begin
  -- Thay một đoạn, đòi trúng (như 20261019f).
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.oid = 'public.cap_nhat_khach_gioi_thieu(uuid,text,text)'::regprocedure;
  cu := def;
  def := replace(def, E'    if p_trang_thai is null and v_ghi is null then return jsonb_build_object(''ok'', false, ''loi'', ''trong''); end if;\n',
    E'    if p_trang_thai is null and v_ghi is null then return jsonb_build_object(''ok'', false, ''loi'', ''trong''); end if;\n'
    || E'    -- SRS-5.1zzzzzzz525: chốt phải qua chot_khach_gioi_thieu (cần phí công ty thu); khách đã chi thì không đổi trạng thái.\n'
    || E'    if p_trang_thai = ''chot'' then return jsonb_build_object(''ok'', false, ''loi'', ''dung_form_chot''); end if;\n'
    || E'    if p_trang_thai is not null and k.hoa_hong_trang_thai = ''da_chi'' then return jsonb_build_object(''ok'', false, ''loi'', ''da_chi''); end if;\n');
  if def = cu then raise exception 'cap_nhat_khach_gioi_thieu: không thấy chỗ kiểm trạng thái'; end if;
  cu := def;
  def := replace(def, E'    insert into khach_gioi_thieu_nhat_ky (khach_id, vai, ai, viec, ghi_chu) values (p_id, ''admin'', coalesce(v_email, ''admin''), v_nhan, v_ghi);\n',
    E'    if p_trang_thai is not null and k.trang_thai = ''chot'' then   -- mở lại khách đã chốt: xoá phần đã tính\n'
    || E'      update khach_gioi_thieu set loai_chot = null, gia_chot_vnd = null, phi_cong_ty_vnd = null, hoa_hong_ty_le = null, hoa_hong_vnd = null,\n'
    || E'             hoa_hong_trang_thai = null, hoa_hong_chi_luc = null where id = p_id;\n'
    || E'    end if;\n'
    || E'    insert into khach_gioi_thieu_nhat_ky (khach_id, vai, ai, viec, ghi_chu) values (p_id, ''admin'', coalesce(v_email, ''admin''), v_nhan, v_ghi);\n');
  if def = cu then raise exception 'cap_nhat_khach_gioi_thieu: không thấy chỗ ghi nhật ký admin'; end if;
  execute def;

  select pg_get_functiondef(p.oid) into def from pg_proc p where p.oid = 'public.gui_dang_ky_moi_gioi(jsonb)'::regprocedure;
  cu := def;
  def := replace(def, E'  values (v_loai, v_ten, v_sdt, v_khu, v_bds, v_cty, v_kn, v_can, v_ghi);\n',
    E'  values (v_loai, v_ten, v_sdt, v_khu, v_bds, v_cty, v_kn, v_can, v_ghi);\n'
    || E'  -- SRS-5.1zzzzzzz525: báo admin qua Zalo (tin nội bộ, đường bridge); không kèm số điện thoại.\n'
    || E'  insert into reminders (kind, due_at, note)\n'
    || E'  values (''escalation'', now(), ''🆕 Môi giới mới đăng ký: '' || v_ten || '' ('' || array_to_string(v_khu, '', '') || ''). Xem ở /admin/moi-gioi'');\n');
  if def = cu then raise exception 'gui_dang_ky_moi_gioi: không thấy chỗ ghi dòng'; end if;
  execute def;

  select pg_get_functiondef(p.oid) into def from pg_proc p where p.oid = 'public.gui_khach_gioi_thieu(jsonb)'::regprocedure;
  cu := def;
  def := replace(def, E'  insert into khach_gioi_thieu_nhat_ky (khach_id, vai, ai, viec) values (v_id, ''moi_gioi'', v_ma, ''Tạo hồ sơ khách'');\n',
    E'  insert into khach_gioi_thieu_nhat_ky (khach_id, vai, ai, viec) values (v_id, ''moi_gioi'', v_ma, ''Tạo hồ sơ khách'');\n'
    || E'  -- SRS-5.1zzzzzzz525: báo admin qua Zalo; không kèm số điện thoại khách.\n'
    || E'  insert into reminders (kind, due_at, note)\n'
    || E'  values (''escalation'', now(), ''🆕 Môi giới '' || v_ma || '' gửi khách cần '' || case v_nc when ''thue'' then ''thuê'' else ''mua'' end\n'
    || E'          || coalesce('' ở '' || v_khu, '''') || ''. Xem ở /admin/khach-gioi-thieu'');\n');
  if def = cu then raise exception 'gui_khach_gioi_thieu: không thấy chỗ ghi nhật ký'; end if;
  execute def;
end $$;
