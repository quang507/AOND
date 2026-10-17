-- 20260909j — vá FR-187: /admin/ro-hang/json báo "permission denied for function boc_tach_nhom".
-- View `boc_tach_v` là security_invoker (để RLS `listings_admin_read` quyết định dòng), nên hàm
-- `boc_tach_nhom(listings)` chạy dưới vai `authenticated` — mà 20260909i lại revoke execute
-- của vai đó. Cấp lại: hàm là security definer nhưng đầu vào là DÒNG listings, người gọi chỉ
-- đưa được dòng RLS cho họ thấy, nên không lộ gì thêm. `anon` vẫn bị chặn.
grant execute on function public.boc_tach_nhom(public.listings) to authenticated;
