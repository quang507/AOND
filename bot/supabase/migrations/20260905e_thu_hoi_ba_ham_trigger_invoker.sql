-- 20260905e — thu hồi EXECUTE của 3 hàm trigger còn phơi ra `anon` (FR-167).
--
-- VÌ SAO. `20260904h` đã khoá 8 hàm trigger về `postgres` + `service_role`, và
-- advisor Supabase từ đó báo sạch. Nhưng soát 05/09 đếm lại toàn bộ 31 hàm
-- trigger trong schema `public` thì còn ĐÚNG BA cái vẫn mang
-- `=X/postgres anon=X/postgres authenticated=X/postgres`:
--
--   listings_boc_thong_so() · listings_chuan_hoa_cot() · listings_quyet_dinh_dang_tin()
--
-- Chúng sót vì cả hai vòng lưới đều chỉ nhìn hàm `SECURITY DEFINER`:
--   · `20260904h` liệt kê tay đúng các hàm definer của đợt 04/09;
--   · advisor `anon_security_definer_function_executable` theo tên đã nói rõ
--     nó chỉ soi definer.
-- Ba hàm này là `SECURITY INVOKER`, nên KHÔNG hàng rào nào nhìn thấy — và sẽ
-- không bao giờ nhìn thấy. Đó mới là phần đáng ngại: không phải lỗ, mà là điểm
-- mù thường trực.
--
-- MỨC RỦI RO HÔM NAY: THẤP. Gọi thẳng qua `/rest/v1/rpc/<tên>` thì Postgres từ
-- chối ("trigger functions can only be called as triggers"), và vì là INVOKER
-- nên chúng không mượn được quyền của ai. Vá vì luật FR-167 nói hàm nội bộ
-- không nằm trên API công khai, và vì một hàm trigger đổi thành hàm thường sau
-- này thì cửa đã mở sẵn từ trước.
--
-- ĐÃ ĐO TRƯỚC KHI ÁP — trigger có ngừng chạy sau khi thu hồi không?
-- Tiền lệ trong repo là có thật: luồng đăng tin của người bán từng chết 42501
-- vì `parse_vnd` chỉ cấp cho service_role. Nên không đoán, làm thí nghiệm cô
-- lập (bảng + trigger INVOKER riêng, tự cuộn lại):
--     revoke all on function <trg> from public;
--     set local role authenticated;  insert ...;
--   → trigger VẪN CHẠY.
-- Postgres kiểm EXECUTE lúc TẠO trigger, không kiểm lúc trigger nổ. Nên thu
-- hồi ở đây không đụng luồng đăng tin của người bán ở /quan-ly, cũng không
-- đụng đường ghi của bot (service_role vẫn được cấp bên dưới).

revoke all on function public.listings_boc_thong_so() from public, anon, authenticated;
grant execute on function public.listings_boc_thong_so() to service_role;

revoke all on function public.listings_chuan_hoa_cot() from public, anon, authenticated;
grant execute on function public.listings_chuan_hoa_cot() to service_role;

revoke all on function public.listings_quyet_dinh_dang_tin() from public, anon, authenticated;
grant execute on function public.listings_quyet_dinh_dang_tin() to service_role;
