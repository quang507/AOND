-- 20260909b — CHẾ ĐỘ TEST: nhắn "hello" là xoá sạch dữ liệu của số Zalo đó (09/09/2026)
--
-- Chủ dự án 09/09/2026: "bây giờ đang test, mỗi lần bắt gặp khách nói hello thì
-- xoá dữ liệu cũ của người bán này đi, đối xử như người khách mới".
--
-- Đây là công tắc TEST, không phải tính năng cho khách thật — khách thật mở
-- lời bằng "hello" mà mất sạch tin rao thì là sự cố. Nên:
--   · có công tắc `app_config.test_reset_hello` ('1' = bật). Chạy thật thì đặt
--     '0' (hoặc xoá dòng) — chat-reply đọc mỗi lần gặp chữ "hello", không cache,
--     nên tắt là hết ngay lượt sau, không cần deploy.
--   · xoá bằng MỘT hàm `reset_nguoi_test(p_zalo)` chỉ service_role gọi được,
--     đi đúng thứ tự khoá ngoại (listings ← sellers là NO ACTION nên phải xoá
--     tin trước; messages ← conversations NO ACTION nên xoá tin nhắn trước).
--   · hàm trả về số dòng đã xoá để chat-reply ghi console — nhìn log biết nó
--     có chạy thật hay không (NFR-18).
-- Không đụng: inbound_ledger / inbound_events (sổ chống trùng — xoá là lượt
-- "hello" tiếp theo bị coi là trùng), bot_errors, bot_usage, ctvs, admins.

insert into public.app_config (key, value, ghi_chu)
values ('test_reset_hello', '1',
  'CHẾ ĐỘ TEST (20260909b): 1 = ai nhắn "hello" là reset_nguoi_test() xoá sạch dữ liệu số Zalo đó rồi tiếp đón như khách mới. Chạy THẬT thì đặt 0. chat-reply đọc mỗi lượt, không cache.')
on conflict (key) do update set value = excluded.value, ghi_chu = excluded.ghi_chu;

create or replace function public.reset_nguoi_test(p_zalo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sellers uuid[];
  v_buyers  uuid[];
  v_listings uuid[];
  v_convs   uuid[];
  n_listings int := 0; n_msgs int := 0; n_convs int := 0; n_sellers int := 0; n_buyers int := 0;
begin
  if coalesce(btrim(p_zalo), '') = '' then return jsonb_build_object('ok', false, 'ly_do', 'thiếu zalo'); end if;

  select coalesce(array_agg(id), '{}') into v_sellers from sellers where zalo_user_id = p_zalo;
  select coalesce(array_agg(id), '{}') into v_buyers  from buyers  where zalo_user_id = p_zalo;
  select coalesce(array_agg(id), '{}') into v_listings from listings where seller_id = any(v_sellers);
  select coalesce(array_agg(id), '{}') into v_convs
    from conversations where seller_id = any(v_sellers) or buyer_id = any(v_buyers);

  -- 1. Những thứ NO ACTION trỏ vào listings / buyers / conversations.
  delete from deals where listing_id = any(v_listings) or buyer_id = any(v_buyers);
  delete from viewings where listing_id = any(v_listings) or buyer_id = any(v_buyers);
  delete from listing_views where listing_id = any(v_listings);
  delete from info_requests where listing_id = any(v_listings) or buyer_id = any(v_buyers);
  delete from messages where conversation_id = any(v_convs);
  get diagnostics n_msgs = row_count;
  delete from conversations where id = any(v_convs);
  get diagnostics n_convs = row_count;

  -- 2. Tin rao (cascade: facts, media, events, interests, ratings_log, reminders).
  update sellers set active_listing_id = null where id = any(v_sellers);
  delete from listings where id = any(v_listings);
  get diagnostics n_listings = row_count;

  -- 3. Người.
  delete from sellers where id = any(v_sellers);
  get diagnostics n_sellers = row_count;
  delete from buyers where id = any(v_buyers);
  get diagnostics n_buyers = row_count;

  -- 4. Trần lượt theo người (20260905d).
  delete from chat_quota where zalo_user_id = p_zalo;

  return jsonb_build_object('ok', true, 'listings', n_listings, 'messages', n_msgs,
    'conversations', n_convs, 'sellers', n_sellers, 'buyers', n_buyers);
end $$;

revoke all on function public.reset_nguoi_test(text) from public, anon, authenticated;
grant execute on function public.reset_nguoi_test(text) to service_role;
comment on function public.reset_nguoi_test(text) is
  'CHẾ ĐỘ TEST (20260909b): xoá sạch dữ liệu của một số Zalo (tin rao + fact + hội thoại + người bán/mua + trần lượt) để tiếp đón như khách mới. chat-reply gọi khi text = "hello" và app_config.test_reset_hello = 1. Không đụng sổ chống trùng, sổ lỗi, CTV, admin.';

-- ── Thương hiệu viết tách chữ (chủ dự án 09/09/2026: "đổi lại AI Ơi Nhà Đất, ko có viết gộp") ──
-- Cùng phép thay với _shared/prompts.ts (md5 khớp — TS-KYGUI-16): trước hết gộp
-- "Aioinhadat (AI Ơi Nhà Đất)" thành một, rồi mọi "Aioinhadat" còn lại.
update public.bot_prompts
   set content = replace(replace(content, 'Aioinhadat (AI Ơi Nhà Đất)', 'AI Ơi Nhà Đất'), 'Aioinhadat', 'AI Ơi Nhà Đất'),
       updated_at = now()
 where content like '%Aioinhadat%';
