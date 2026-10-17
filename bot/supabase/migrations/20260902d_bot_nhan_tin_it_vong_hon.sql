-- 20260902d — FR-171 h: bớt vòng đi về DB trong một tin (đợt tối ưu 02/09/2026)
--
-- Đếm trên chat-reply v43: người mua có hồ sơ ~24 vòng + 1 model, người bán có
-- câu chờ ~21 vòng, người lạ hỏi vai 18 vòng (0 model). Mỗi vòng 20–40 ms. Ba
-- việc dưới đây dời ba loại vòng lặp đi lặp lại xuống tầng DB.

-- a. `conversations.last_message_at` do TRIGGER giữ, không do app ghi tay --------
-- Trước: chat-reply (2 chỗ), nudge, ask-seller mỗi nơi một câu UPDATE riêng sau
-- khi chèn tin — bốn chỗ chép cùng một việc, và chat-reply chỉ ghi ở tin KHÁCH
-- chứ không ghi ở tin bot. Nay mọi dòng `messages` đều đẩy mốc; báo cáo CTV và
-- nudge đọc mốc này chỉ để biết "hội thoại còn sống không", không phân biệt ai
-- nói câu cuối.
create or replace function public.messages_bump_last_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update conversations
     set last_message_at = greatest(coalesce(last_message_at, '-infinity'::timestamptz), new.created_at)
   where id = new.conversation_id;
  return null;
end $$;

drop trigger if exists trg_messages_bump_last_message on public.messages;
create trigger trg_messages_bump_last_message
  after insert on public.messages
  for each row execute function public.messages_bump_last_message();

-- b. ensure_buyer_conversation trả luôn hai cột nhánh mua cần ngay sau đó -------
-- Bản cũ trả (b_id, c_id, b_name, b_prefs), rồi chat-reply phải SELECT lại
-- `conversations` để lấy `ctv_id` + `human_touch_at` (cổng nhường sân FR-141).
-- Cùng khuôn với `ensure_seller_conversation` vốn đã trả `c_human_touch_at`,
-- `c_ctv_id`. Thêm cột ở CUỐI: người gọi cũ đọc theo tên cột nên không gãy.
drop function if exists public.ensure_buyer_conversation(text, text);
create or replace function public.ensure_buyer_conversation(p_zalo_user_id text, p_channel text default 'zalo_oa')
returns table(b_id uuid, c_id uuid, b_name text, b_prefs jsonb, c_ctv_id uuid, c_human_touch_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_buyer buyers%rowtype; v_conv conversations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('buyer:' || p_zalo_user_id));

  select * into v_buyer from buyers where zalo_user_id = p_zalo_user_id;
  if not found then
    insert into buyers (zalo_user_id) values (p_zalo_user_id) returning * into v_buyer;
  end if;
  update buyers set last_contact_at = now() where id = v_buyer.id;

  select * into v_conv from conversations
    where conversations.buyer_id = v_buyer.id
    order by started_at desc limit 1;
  if not found then
    insert into conversations (buyer_id, channel) values (v_buyer.id, p_channel)
      returning * into v_conv;
  end if;

  return query select v_buyer.id, v_conv.id, v_buyer.name, v_buyer.preferences,
                      v_conv.ctv_id, v_conv.human_touch_at;
end $$;
revoke all on function public.ensure_buyer_conversation(text, text) from public, anon, authenticated;

-- c. Follow-up FR-32: đếm + tra tin + chèn → MỘT hàm ---------------------------
-- Luật giữ nguyên: tối đa một nhắc follow-up còn hiệu lực (pending/sent) mỗi
-- khách mỗi 24h; nhắc đã cancelled (khách nhắn lại nên chưa gửi) không chặn.
create or replace function public.tao_followup(p_buyer_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_listing uuid; v_id uuid;
begin
  select id into v_listing from listings where code = p_code;
  if v_listing is null then return false; end if;
  if exists (select 1 from reminders
              where buyer_id = p_buyer_id and kind = 'followup'
                and status in ('pending','sent')
                and created_at > now() - interval '24 hours') then
    return false;
  end if;
  insert into reminders (kind, buyer_id, listing_id, due_at, note)
  values ('followup', p_buyer_id, v_listing, now() + interval '150 minutes',
          'khách hỏi #' || p_code || ' rồi im — chủ động gửi thêm thông tin căn này')
  returning id into v_id;
  return v_id is not null;
end $$;
revoke all on function public.tao_followup(uuid, text) from public, anon, authenticated;
