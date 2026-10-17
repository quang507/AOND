-- 20260829c — Nhả việc nhắc mà mình KHÔNG thử được (FR-166 f)
--
-- LỘ RA TỪ ĐÂU. Sau khi `nudge` v14 chạy thật lúc 02:00, 10 dòng `reminders`
-- kind `escalation`/`report` có `locked_at`, `attempts = 1`, mà `last_error`
-- rỗng và `next_retry_at` rỗng. Không có gì hỏng cả — chúng là việc dành cho
-- BRIDGE kéo qua `escalation-feed`, không phải cho OA gửi. Khối escalation của
-- `nudge` chỉ gửi khi `target && oaToken`; thiếu một trong hai thì nó bỏ qua
-- lặng lẽ, và dòng đó nằm lại `pending` như thiết kế.
--
-- VẤN ĐỀ MÀ FR-166 VÔ TÌNH TẠO RA. Từ khi `nhan_viec_nhac` là cửa lấy việc,
-- mỗi lượt cron KHÔNG thử gửi được vẫn +1 `attempts`. Nửa tiếng một lần, vô
-- hạn. Con số đó thành lời nói dối: `job_suc_khoe` cho thấy một việc "đã thử
-- 40 lần" trong khi chưa ai thử lần nào, và người đọc không phân biệt nổi việc
-- ĐANG HỎNG với việc ĐANG CHỜ BRIDGE. Bất biến 14 nói thêm quan sát "chỉ ở nơi
-- có ích" — một bộ đếm đếm sai còn tệ hơn không có.
--
-- Không đụng `bao_hong_nhac`: hai chuyện khác nhau. "Thử rồi hụt" phải lùi dần
-- và phải chết sau 5 lần. "Chưa thử được" thì trả việc lại nguyên vẹn.
create or replace function public.nha_viec_nhac(p_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update reminders
     set locked_at = null,
         locked_by = null,
         attempts  = greatest(attempts - 1, 0)
   where id = p_id and status = 'pending';
  if not found then return 'khong_co'; end if;
  return 'da_nha';
end $$;

comment on function public.nha_viec_nhac(uuid) is
  'FR-166 f: worker giành được việc nhưng KHÔNG thử gửi (thiếu đích, thiếu token '
  '— việc của bridge). Trả lại hợp đồng thuê và hoàn luôn lượt đếm: chưa thử thì '
  'không tính là đã thử.';

revoke execute on function public.nha_viec_nhac(uuid) from public, anon, authenticated;
grant execute on function public.nha_viec_nhac(uuid) to service_role;

-- Dọn 10 dòng đã bị đếm oan trong lượt cron 02:00.
update public.reminders
   set locked_at = null, locked_by = null, attempts = 0
 where status = 'pending'
   and kind in ('escalation', 'report')
   and locked_at is not null
   and last_error is null;

-- Sửa lời chú thích sai của `20260829a`: view này KHÔNG đọc được từ /admin, vì
-- trang đó dùng publishable key (vai `anon`) mà view thì `revoke all` khỏi anon.
-- Câu cũ mô tả một hiện thực chưa có, và như đang viết thì không hiện thực hoá
-- được. Muốn hiện thật thì mở qua RPC security-definer có kiểm quyền admin.
comment on view public.job_suc_khoe is
  'FR-166: một cửa sổ cho ba hàng đợi — việc nào chưa xong, thử mấy lần, lỗi '
  'gì, bao giờ thử lại. CHƯA nối vào /admin: trang đó đọc bằng publishable key '
  '(vai anon) mà view này revoke all khỏi anon; muốn hiện thì mở qua một RPC '
  'security-definer có kiểm quyền admin. Hiện đọc bằng service key.';
