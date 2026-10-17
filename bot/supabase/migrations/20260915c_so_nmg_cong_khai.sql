-- 20260915c — `so_nmg_cong_khai()`: SỐ nhà môi giới (NMG) đang có, mở cho anon (15/09/2026).
--
-- Vì sao. `bun run test:sec` (TS-SEC-AUTO-05) đỏ liên tục trên main từ 07:27 UTC
-- 15/09: `agents_public` trả 0 dòng cho anon trong khi kho có tin. Bài kiểm coi
-- đó là "siết quá tay" (đúng hình lỗi 27/08: view bị đặt security_invoker=true,
-- /moi-gioi trắng 8 ngày). Nhưng lần này view cấu hình ĐÚNG (security_invoker=false),
-- nó rỗng chỉ vì lệnh xoá hàng loạt (FR-210, 10:44) đã xoá 3 NMG thật và 29 người
-- bán còn lại đều là tài khoản thử loại CCRB. Bài kiểm không có tín hiệu độc lập
-- nào để phân biệt hai cảnh — anon không đọc được `sellers.seller_type`, còn
-- `seller_ranks` là security_invoker nên anon cũng ra 0.
--
-- Hàm này trả MỘT CON SỐ (đếm NMG), không tên, không Zalo, không gì khác — cùng
-- tinh thần `soat_db_cong_khai()` (20260910p): chỉ KẾT LUẬN, mở cho anon vì
-- chính chỗ mở là chỗ phải tối giản. Bài kiểm từ nay so: view rỗng mà số NMG = 0
-- là đúng cảnh; view rỗng mà số NMG > 0 mới là siết quá tay.

create or replace function public.so_nmg_cong_khai()
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $$
  select count(*)::int from public.sellers where seller_type = 'nmg';
$$;

comment on function public.so_nmg_cong_khai() is
  'TS-SEC-AUTO-05 (20260915c): số nhà môi giới (sellers.seller_type = nmg) — chỉ một con số, mở cho anon '
  'để bài kiểm phân biệt "agents_public rỗng vì không có NMG" với "rỗng vì view bị siết".';

revoke execute on function public.so_nmg_cong_khai() from public;
grant execute on function public.so_nmg_cong_khai() to anon, authenticated, service_role;
