-- 20260909f — nút "Xoá khách" trong CRM (09/09/2026)
--
-- Chủ dự án: "thêm nút xoá khách". Admin bấm ở /admin/tin-nhan → xoá SẠCH một
-- số Zalo (tin rao, fact, ảnh, hội thoại, tin nhắn, hồ sơ mua/bán, hạn mức) —
-- cùng luật với reset_nguoi_test (20260909b), nhưng qua cửa admin:
--   · reset_nguoi_test chỉ service_role gọi được (bot). Hàm này authenticated
--     gọi được nhưng kiểm la_admin() bên trong; không phải admin → raise.
--   · KHÔNG đụng mau_cau (tài sản huấn luyện; FK set null nên mẫu vẫn còn).
--   · Trả về số dòng đã xoá để trang báo lại cho người bấm (NN/g: trạng thái
--     hệ thống phải nhìn thấy).
create or replace function public.admin_xoa_khach(p_zalo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.la_admin() then
    raise exception 'chỉ admin được xoá khách' using errcode = '42501';
  end if;
  return public.reset_nguoi_test(p_zalo);
end $$;

revoke all on function public.admin_xoa_khach(text) from public, anon;
grant execute on function public.admin_xoa_khach(text) to authenticated, service_role;
comment on function public.admin_xoa_khach(text) is
  'CRM /admin/tin-nhan nút "Xoá khách": xoá sạch một số Zalo (tin, fact, ảnh, chat, hồ sơ, hạn mức) — bọc reset_nguoi_test sau khi kiểm la_admin(). Không đụng mau_cau.';
