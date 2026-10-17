-- 20260905j — sửa `giu_luot_gui` của `20260905i`: không có dòng sổ ≠ có người giữ.
--
-- LỖI CỦA BẢN TRƯỚC. Bản `i` chỉ có một câu `update … returning found`. Dòng sổ
-- không tồn tại thì `found` là false, và nơi gọi hiểu false là "lượt khác đang
-- gửi" → BỎ LUÔN cú gửi. Hai cảnh khác hẳn nhau bị gộp vào cùng một `false` —
-- đúng cùng một lỗi hình dạng với SEC-02 ("chưa đặt secret" gộp với "đọc hụt").
--
-- Cảnh đó có thật trong bộ kiểm: ca CK-8 phát lại một sự kiện chưa có dòng
-- `inbound_ledger` (bộ não bị stub nên không gọi `claim_inbound`), và bản `i`
-- làm bong bóng không bao giờ đi. Ở production `claim_inbound` luôn tạo dòng
-- trước khi tới khâu gửi, nên xác suất thấp — nhưng hậu quả là KHÁCH KHÔNG
-- NHẬN ĐƯỢC GÌ, nặng hơn hẳn cái đang vá (một bong bóng lặp). Không đánh đổi
-- kiểu đó cho một nhánh "chắc không xảy ra".
--
-- Nay tách ba cảnh:
--   · giành được                        → true
--   · có dòng, người khác đang giữ /
--     đã gửi xong (sent_at)             → false
--   · KHÔNG có dòng nào                 → true (không có gì để phối hợp)

create or replace function public.giu_luot_gui(
  p_msg_id   text,
  p_han_secs int default 120
) returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_co boolean;
begin
  update public.inbound_ledger
     set sending_until = now() + make_interval(secs => p_han_secs),
         updated_at    = now()
   where zalo_msg_id = p_msg_id
     and sent_at is null
     and (sending_until is null or sending_until < now());
  if found then
    return true;
  end if;

  select exists(select 1 from public.inbound_ledger where zalo_msg_id = p_msg_id)
    into v_co;
  if not v_co then
    return true;
  end if;

  return false;
end $$;

revoke all on function public.giu_luot_gui(text, int) from public, anon, authenticated;
grant execute on function public.giu_luot_gui(text, int) to service_role;
