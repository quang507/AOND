-- SRS-5.1zzzzzzz398 (08/11/2026, audit bảo mật N1): cổng quyền trong hàm SECURITY DEFINER dùng `current_user`.
-- Trong hàm SECURITY DEFINER, `current_user` là CHỦ HÀM (postgres), không phải người gọi → vế
-- `current_user in ('postgres','supabase_admin')` luôn đúng, `current_user not in ('service_role','postgres')` luôn sai,
-- nên `la_admin()` mất tác dụng: mọi tài khoản `authenticated` (ai đăng nhập Google trên web cũng có) gọi được
-- admin_xoa_het_khach_va_ro_hang('XOA HET'), admin_khoi_phuc_lan_xoa, don_du_lieu_thu, admin_cap_nhat_khach,
-- admin_gan_bds_quan_tam, admin_xoa_bds_quan_tam; log_loi bỏ qua trần 200 dòng/giờ cho anon.
--
-- Sửa (chỉ thay đúng các khuôn chữ dưới đây trong thân hàm; CREATE OR REPLACE giữ nguyên GRANT):
--  * 5 hàm admin_* chỉ web /admin gọi → bỏ hẳn ngoại lệ theo tên vai: chỉ còn `la_admin()` hoặc `service_role`.
--  * don_du_lieu_thu (lịch pg_cron), log_loi (trigger / cron), xuat_schema (mgmt-api trong apply-migration.yml) cần
--    cho phiên quản trị → đổi sang `session_user` = vai ĐĂNG NHẬP: PostgREST là `authenticator` (vế sai), pg_cron /
--    mgmt-api là `postgres` / `supabase_admin` (vế đúng). Đo pg_stat_activity 08/11.
--  * don_du_lieu_thu không có nơi gọi từ web → thu EXECUTE của authenticated.
-- Khối cuối chặn nếu còn hàm SECURITY DEFINER nào trong public dùng `current_user`.
do $$
declare
  r record;
  def text;
  moi text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prosrc ~ 'current_user'
  loop
    def := pg_get_functiondef(r.oid);
    if r.proname in ('admin_cap_nhat_khach', 'admin_gan_bds_quan_tam', 'admin_xoa_bds_quan_tam') then
      moi := replace(def, $q$current_user not in ('service_role', 'postgres')$q$,
                          $q$coalesce(auth.role(), '') <> 'service_role'$q$);
    elsif r.proname in ('admin_khoi_phuc_lan_xoa', 'admin_xoa_het_khach_va_ro_hang') then
      moi := regexp_replace(def, $q$\s*or current_user in \('postgres', 'supabase_admin'\)$q$, '', 'g');
      moi := replace(moi, $q$coalesce(auth.uid()::text, current_user)$q$, $q$coalesce(auth.uid()::text, session_user)$q$);
    else
      moi := replace(def, $q$current_user in ('postgres', 'supabase_admin')$q$,
                          $q$session_user in ('postgres', 'supabase_admin')$q$);
    end if;
    if moi = def or moi ~ 'current_user' then
      raise exception 'Hàm % có current_user ở khuôn chưa biết — sửa tay', r.proname;
    end if;
    execute moi;
  end loop;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prosrc ~ 'current_user'
  ) then
    raise exception 'Còn hàm SECURITY DEFINER dùng current_user sau khi sửa';
  end if;
end
$$;

revoke execute on function public.don_du_lieu_thu() from authenticated;
