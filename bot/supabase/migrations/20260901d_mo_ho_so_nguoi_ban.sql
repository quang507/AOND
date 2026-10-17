-- 20260901d — Mở hồ sơ người bán từ chat, khi người ta TỰ NHẬN có bất động sản
--
-- VÌ SAO CẦN (FR-159, quyết định chủ dự án 27/08/2026, tới nay chưa dựng).
-- Soát 01/09 theo bốn vai người nhắn: người LẠ (chưa có dòng `sellers` lẫn
-- `buyers`) nhắn "tôi muốn bán nhà q5 giá 5 tỷ" thì rơi thẳng vào nhánh NGƯỜI
-- MUA — vì cổng nhận câu rao nằm bên trong `if (sellerRow …)`, mà dòng `sellers`
-- chỉ được tạo bằng form admin. Bot bóc "khu vực: q5, ngân sách: 5 tỷ" thành hồ
-- sơ NGƯỜI MUA rồi hỏi ngược "anh tìm khu nào ạ?". Câu rao mất.
--
-- RANH GIỚI (giữ đúng chữ của FR-158/159, kể cả CHIỀU của sai số: FR-159 nói
-- đoán nhầm người MUA thành người bán mới là lỗi đắt): hồ sơ người bán chỉ mở
-- khi người ta TỰ NHẬN RÕ — câu rao thật, "chính chủ", "ký gửi", "cần rao" — ở
-- bất kỳ tin nào; còn "tôi có căn nhà…" chỉ khi đang trả lời câu hỏi vai.
-- KHÔNG mở bằng suy đoán từ một chữ "bán" lẻ hay từ câu chào. Phần nhận diện
-- nằm ở chat-reply; hàm này chỉ là cửa ghi.
--
-- `on conflict … do update` (thay vì `do nothing`) là để RETURNING trả về dòng
-- kể cả khi đã có: chủ nhà gõ vụn ba tin liền là ba lượt gọi đồng thời, lượt
-- thứ hai không được ăn 23505 rồi trắng tay.
--
-- `seller_type` để mặc định `unknown`: chính chủ hay môi giới là chuyện của
-- FR-160 (phân loại tự động), không đoán ở đây.

create or replace function public.mo_ho_so_nguoi_ban(p_zalo_user_id text)
returns table(id uuid, name text, active_listing_id uuid)
language sql
security definer
set search_path to 'public'
as $$
  insert into sellers (zalo_user_id)
  values (p_zalo_user_id)
  on conflict (zalo_user_id) do update set zalo_user_id = excluded.zalo_user_id
  returning sellers.id, sellers.name, sellers.active_listing_id;
$$;

comment on function public.mo_ho_so_nguoi_ban(text) is
  'FR-159: mở (hoặc lấy lại) hồ sơ người bán theo zalo_user_id khi người nhắn tự '
  'nhận có BĐS. Idempotent; chỉ chat-reply gọi, chỉ service_role.';

revoke execute on function public.mo_ho_so_nguoi_ban(text) from public, anon, authenticated;
