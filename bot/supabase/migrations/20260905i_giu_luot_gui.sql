-- 20260905i — CHỐT CHO CHIỀU GỬI. Vá phát-lại-đồng-thời gửi đúp (FR-162/166).
--
-- LỖ. `claim_inbound` có chốt cho chiều ĐẾN: `status='processing'` mà còn tươi
-- (< 150 giây) thì trả `in_flight`, lượt sau không chạy bộ não nữa. Nhưng nhánh
-- `status='completed'` TRẢ VỀ NGAY, không đánh dấu gì cả — mà đó đúng là trạng
-- thái `viec_inbound_bo_roi()` chuyên đi tìm:
--
--     when l.status = 'completed' and l.sent_at is null then 'chua_gui'
--
-- Nên hai lượt phát lại cùng một sự kiện "đã có câu trả lời, chưa gửi xong" sẽ
-- CÙNG đọc `sent_bubbles`, CÙNG thấy 0, và CÙNG gửi bong bóng đầu. Khách nhận
-- đúp. Không phải cảnh hiếm: cron sweep chạy 1 phút/lần, mà một lượt gửi có thể
-- kéo 300ms giữa hai bong bóng cộng 2 giây thử lại mỗi lần OA nghẹn — lượt sau
-- chồng lên lượt trước là chuyện bình thường.
-- Đã dựng lại được trong e2e (GUI-3) TRƯỚC khi vá: 4 bong bóng cho 2 câu.
--
-- CÁCH VÁ: lease trên chính dòng sổ, bằng MỘT câu UPDATE có điều kiện. Không
-- khoá tư vấn (`pg_advisory_xact_lock` chỉ sống trong một giao dịch, còn lượt
-- gửi kéo dài qua nhiều lượt HTTP ra Zalo), không hàng đợi, không bộ nhớ ngoài.
-- `update ... where sending_until is null or sending_until < now()` là nguyên
-- tử ở tầng hàng: hai lượt cùng chạy thì Postgres cho đúng một lượt thấy
-- `found`, lượt kia thấy 0 dòng.
--
-- HẠN 120 giây, không phải vô hạn: worker chết giữa chừng (instance bị evict,
-- OOM) mà lease không hạn thì tin đó KHÔNG BAO GIỜ được gửi nữa — hỏng nặng
-- hơn hẳn cái đang vá. 120 giây rộng hơn mọi lượt gửi thật (2 bong bóng ×
-- (300ms + tối đa 2s thử lại) ≈ 5 giây) mà vẫn ngắn hơn một lượt cron.
--
-- NHẢ NGAY khi gửi xong hay gửi hụt, không đợi hết hạn: `inbound-sweep` hiện
-- thử lại ngay lượt cron sau, giữ nguyên nhịp đó. Ôm lease tới lúc hết hạn là
-- làm chậm đường cứu — đổi hành vi ở chỗ không ai yêu cầu.
--
-- TƯƠNG THÍCH NGƯỢC: cột nullable thêm mới, hai hàm thêm mới, không đụng gì
-- đang có. Bản `zalo-webhook` đang chạy không biết hai hàm này và vẫn hoạt động
-- y như cũ (chỉ là chưa hết đua). Áp migration trước, deploy sau.

alter table public.inbound_ledger
  add column if not exists sending_until timestamptz;

comment on column public.inbound_ledger.sending_until is
  'Lease chiều GỬI (20260905i): có giá trị ở tương lai = đang có worker gửi tin '
  'này. NULL hoặc đã quá hạn = ai giành cũng được. Khác `locked_by`/`started_at` '
  'vốn là chốt của chiều ĐẾN trong claim_inbound.';

-- Giành lượt gửi. Trả true nếu giành được, false nếu lượt khác đang giữ (hoặc
-- tin đã gửi xong / không có dòng sổ nào).
create or replace function public.giu_luot_gui(
  p_msg_id   text,
  p_han_secs int default 120
) returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ok boolean := false;
begin
  update public.inbound_ledger
     set sending_until = now() + make_interval(secs => p_han_secs),
         updated_at    = now()
   where zalo_msg_id = p_msg_id
     and sent_at is null
     and (sending_until is null or sending_until < now());
  if found then v_ok := true; end if;
  return v_ok;
end $$;

-- Nhả lượt gửi. Cố ý KHÔNG kiểm ai đang giữ: worker nào chạy xong thì nhả,
-- và trường hợp duy nhất nhả nhầm là khi lease đã hết hạn và người khác vừa
-- giành — lúc đó `sent_bubbles` vẫn là lưới chống gửi đúp như trước bản này.
create or replace function public.nha_luot_gui(p_msg_id text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  update public.inbound_ledger
     set sending_until = null, updated_at = now()
   where zalo_msg_id = p_msg_id;
$$;

-- FR-167: hàm nội bộ không nằm trên API công khai.
revoke all on function public.giu_luot_gui(text, int) from public, anon, authenticated;
grant execute on function public.giu_luot_gui(text, int) to service_role;
revoke all on function public.nha_luot_gui(text) from public, anon, authenticated;
grant execute on function public.nha_luot_gui(text) to service_role;
