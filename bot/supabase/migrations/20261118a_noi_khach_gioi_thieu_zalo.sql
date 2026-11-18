-- 20261118a (SRS-5.1zzzzzzz527) · Nối khách môi giới giới thiệu với cuộc chat Zalo của chính khách đó — 18/11/2026
--
-- Lỗ hổng: `khach_gioi_thieu` chỉ có tên + số điện thoại. Phía mua đã tắt (SRS-526) nên khi khách được giới thiệu tự nhắn trợ lý, admin
-- chỉ nhận "khách cần mua" mà không biết môi giới nào gửi → xử lý như khách lạ, môi giới mất phần chi hoặc hai người cùng dẫn.
--
-- 1. Mỗi hồ sơ có `ma_khach` (KH-XXXXXXXX). Môi giới đưa mã cho khách; khách nhắn mã (hoặc số điện thoại) cho trợ lý thì
--    `noi_khach_gioi_thieu` ghi Zalo của khách vào hồ sơ, thêm một dòng nhật ký (môi giới đọc được) và trả mã môi giới để tin báo admin ghi rõ.
-- 2. `da_co_truoc`: lúc môi giới gửi khách mà số đó đã là người mua / người bán trong hệ thống thì đánh dấu, tin báo admin nói rõ.
--    Không tự từ chối — ai được ghi nhận là việc admin quyết.

alter table public.khach_gioi_thieu
  add column if not exists ma_khach text not null default ('KH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  add column if not exists zalo_user_id text,
  add column if not exists noi_zalo_luc timestamptz,
  add column if not exists da_co_truoc text check (da_co_truoc in ('nguoi_mua', 'nguoi_ban'));
comment on column public.khach_gioi_thieu.ma_khach is 'Mã khách (KH-XXXXXXXX) môi giới đưa cho khách; khách nhắn mã này cho trợ lý trên Zalo thì hồ sơ nối với cuộc chat (SRS-5.1zzzzzzz527).';
comment on column public.khach_gioi_thieu.zalo_user_id is 'Zalo của chính khách, ghi khi khách nhắn mã khách hoặc số điện thoại cho trợ lý (noi_khach_gioi_thieu).';
comment on column public.khach_gioi_thieu.noi_zalo_luc is 'Lúc hồ sơ được nối với Zalo của khách.';
comment on column public.khach_gioi_thieu.da_co_truoc is 'Lúc môi giới gửi, số điện thoại này đã có trong hệ thống: nguoi_mua / nguoi_ban; trống = chưa có. Admin quyết ai được ghi nhận.';
create unique index if not exists khach_gioi_thieu_ma_khach_key on public.khach_gioi_thieu (ma_khach);
create index if not exists khach_gioi_thieu_zalo_idx on public.khach_gioi_thieu (zalo_user_id) where zalo_user_id is not null;

alter table public.khach_gioi_thieu_nhat_ky drop constraint if exists khach_gioi_thieu_nhat_ky_vai_check;
alter table public.khach_gioi_thieu_nhat_ky add constraint khach_gioi_thieu_nhat_ky_vai_check check (vai in ('moi_gioi', 'admin', 'he_thong'));
comment on column public.khach_gioi_thieu_nhat_ky.vai is 'moi_gioi, admin hoặc he_thong (trợ lý tự ghi, vd khách đã nhắn Zalo).';

create or replace function public.khach_gioi_thieu_danh_dau_da_co()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.da_co_truoc := case
    when exists (select 1 from buyers b where regexp_replace(coalesce(b.phone, ''), '\D', '', 'g') = new.so_dien_thoai) then 'nguoi_mua'
    when exists (select 1 from sellers s where s.id <> new.seller_id and regexp_replace(coalesce(s.phone, ''), '\D', '', 'g') = new.so_dien_thoai) then 'nguoi_ban'
  end;
  return new;
end $function$;
comment on function public.khach_gioi_thieu_danh_dau_da_co() is
  'SRS-5.1zzzzzzz527: trigger trước khi ghi một khách giới thiệu — số điện thoại đã là người mua / người bán trong hệ thống thì ghi da_co_truoc.';
revoke all on function public.khach_gioi_thieu_danh_dau_da_co() from public, anon, authenticated;
drop trigger if exists khach_gioi_thieu_da_co on public.khach_gioi_thieu;
create trigger khach_gioi_thieu_da_co before insert on public.khach_gioi_thieu
  for each row execute function public.khach_gioi_thieu_danh_dau_da_co();

create or replace function public.noi_khach_gioi_thieu(p_zalo text, p_ma text default null, p_sdt text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_zalo text := btrim(coalesce(p_zalo, ''));
  v_ma text := nullif(upper(regexp_replace(coalesce(p_ma, ''), '[^0-9A-Za-z]', '', 'g')), '');
  v_sdt text := regexp_replace(coalesce(p_sdt, ''), '\D', '', 'g');
  k public.khach_gioi_thieu;
  v_mg text;
  v_ten_mg text;
  v_zalo_mg text;
  v_moi boolean := false;
begin
  if v_zalo = '' then return jsonb_build_object('ok', false, 'loi', 'thieu'); end if;
  if v_sdt like '84%' and char_length(v_sdt) = 11 then v_sdt := '0' || substr(v_sdt, 3); end if;
  if v_ma is not null then
    select * into k from khach_gioi_thieu x where replace(x.ma_khach, '-', '') = v_ma;
    if k.id is null then return jsonb_build_object('ok', false, 'loi', 'khong_khop'); end if;
  elsif v_sdt ~ '^0[35789]\d{8}$' then
    select * into k from khach_gioi_thieu x
     where x.so_dien_thoai = v_sdt and x.trang_thai not in ('chot', 'khong_thanh') order by x.created_at desc limit 1;
  end if;
  if k.id is null then   -- không mã, không số khớp: Zalo này đã nối với hồ sơ nào đang mở chưa
    select * into k from khach_gioi_thieu x
     where x.zalo_user_id = v_zalo and x.trang_thai not in ('chot', 'khong_thanh') order by x.created_at desc limit 1;
  end if;
  if k.id is null then return jsonb_build_object('ok', false, 'loi', 'khong_co'); end if;
  select s.ma_moi_gioi, s.name, s.zalo_user_id into v_mg, v_ten_mg, v_zalo_mg from sellers s where s.id = k.seller_id;
  if v_zalo_mg = v_zalo then return jsonb_build_object('ok', false, 'loi', 'chinh_moi_gioi'); end if;   -- môi giới tự nhắn mã của khách mình
  if k.zalo_user_id is not null and k.zalo_user_id <> v_zalo then return jsonb_build_object('ok', false, 'loi', 'da_noi'); end if;
  if k.zalo_user_id is null then
    update khach_gioi_thieu set zalo_user_id = v_zalo, noi_zalo_luc = now() where id = k.id;
    insert into khach_gioi_thieu_nhat_ky (khach_id, vai, ai, viec) values (k.id, 'he_thong', 'Trợ lý', 'Khách đã nhắn trợ lý trên Zalo');
    v_moi := true;
  end if;
  return jsonb_build_object('ok', true, 'moi', v_moi, 'id', k.id, 'ma_khach', k.ma_khach, 'ten_khach', k.ten_khach,
                            'ma_moi_gioi', v_mg, 'ten_moi_gioi', v_ten_mg, 'trang_thai', k.trang_thai);
end $function$;
comment on function public.noi_khach_gioi_thieu(text, text, text) is
  'SRS-5.1zzzzzzz527: lõi gọi khi khách nhắn mã khách (KH-…) hoặc số điện thoại, hoặc lúc chuyển khách mua cho người phụ trách — tìm hồ sơ môi giới gửi, ghi Zalo của khách + dòng nhật ký. Trả {ok, moi, ma_khach, ma_moi_gioi, ten_moi_gioi} hoặc {ok:false, loi: khong_khop / khong_co / da_noi / chinh_moi_gioi}.';
revoke all on function public.noi_khach_gioi_thieu(text, text, text) from public, anon, authenticated;
grant execute on function public.noi_khach_gioi_thieu(text, text, text) to service_role;

-- Tin báo admin lúc môi giới gửi khách: thêm một câu khi số đã có trong hệ thống từ trước (vá định nghĩa đang chạy, như SRS-525).
do $do$
declare
  v_def text := pg_get_functiondef('public.gui_khach_gioi_thieu(jsonb)'::regprocedure);
  v_cu text := $cu$|| coalesce(' ở ' || v_khu, '') || '. Xem ở /admin/khach-gioi-thieu');$cu$;
  v_moi text := $moi$|| coalesce(' ở ' || v_khu, '')
          || case when (select x.da_co_truoc from khach_gioi_thieu x where x.id = v_id) is not null
                  then '. Số khách này đã có trong hệ thống từ trước' else '' end
          || '. Xem ở /admin/khach-gioi-thieu');$moi$;
begin
  if position('da_co_truoc' in v_def) > 0 then return; end if;
  if position(v_cu in v_def) = 0 then raise exception 'gui_khach_gioi_thieu: không thấy đoạn tin báo admin để vá'; end if;
  execute replace(v_def, v_cu, v_moi);
end $do$;
