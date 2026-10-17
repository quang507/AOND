-- FR-141/FR-152 · Hội thoại NGƯỜI BÁN vào sổ như hội thoại người mua.
--
-- Lỗ trước bản này: nhánh seller của chat-reply bóc fact, gọi model, trả lời
-- rồi `return` thẳng — KHÔNG ghi dòng nào vào `messages`. Hai hậu quả, cả hai
-- đều im lặng:
--   1. CTV/admin mở hội thoại của chủ nhà thì trống trơn. Không có gì để chấm,
--      không có gì để bàn giao khi người thật tiếp quản.
--   2. Cờ `human_touch_at` (FR-141 — người thật gõ tay thì bot nhường sân 30')
--      chỉ được xét ở nhánh mua. CTV đang chat tay với chủ nhà mà chủ nhắn
--      tiếp là bot chen ngang ngay giữa cuộc.
--
-- `conversations.seller_id` VỐN ĐÃ CÓ SẴN (kèm khoá ngoại) từ đầu — chỉ là
-- chưa đường code nào ghi vào. Nên đây không phải đổi schema, chỉ là thêm hàm
-- get-or-create đối xứng với `ensure_buyer_conversation`.
--
-- Vẫn phải qua advisory lock như bên mua: chủ nhà gõ vụn 3 tin liên tiếp thì
-- ba lượt gọi đồng thời sẽ tạo ba dòng `conversations` cho cùng một người.
create or replace function public.ensure_seller_conversation(
  p_seller_id uuid,
  p_channel text default 'zalo_oa'
)
returns table(c_id uuid, c_human_touch_at timestamptz, c_ctv_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_conv conversations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('seller:' || p_seller_id::text));

  select * into v_conv from conversations
    where conversations.seller_id = p_seller_id
    order by started_at desc limit 1;
  if not found then
    insert into conversations (seller_id, channel) values (p_seller_id, p_channel)
      returning * into v_conv;
  end if;

  return query select v_conv.id, v_conv.human_touch_at, v_conv.ctv_id;
end $function$;

-- Chỉ service_role gọi (edge function). Anon đã bị thu hồi execute theo
-- migration soát bảo mật 20260826c, giữ nguyên nguyên tắc đó.
revoke execute on function public.ensure_seller_conversation(uuid, text)
  from public, anon, authenticated;

create index if not exists idx_conversations_seller
  on public.conversations (seller_id, started_at desc);
