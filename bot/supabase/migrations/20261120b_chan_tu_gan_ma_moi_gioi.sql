-- 20/11/2026 (audit P0-3, SRS-5.1zzzzzzz529): policy sellers_self_insert chỉ kiểm auth_user_id, mà authenticated có quyền INSERT mọi cột —
-- người dùng web tự tạo hồ sơ người bán kèm ma_moi_gioi tuỳ ý (hoặc zalo_user_id của người khác, điểm đánh giá giả), rồi
-- gui_khach_gioi_thieu (chỉ kiểm ma_moi_gioi khác rỗng) nhận khách giới thiệu để đòi hoa hồng, không qua admin duyệt.
-- Mã môi giới chỉ đến từ luồng duyệt đăng ký / kích hoạt (hàm security definer), nên hồ sơ tự tạo phải để trống các cột đó.
-- Web (/quan-ly) chỉ chèn auth_user_id, name, seller_type — không ảnh hưởng.
drop policy if exists sellers_self_insert on public.sellers;
create policy sellers_self_insert on public.sellers for insert to authenticated
  with check (
    auth_user_id = (select auth.uid())
    and ma_moi_gioi is null
    and zalo_user_id is null
    and coalesce(rating_sum, 0) = 0
    and coalesce(rating_count, 0) = 0
  );
