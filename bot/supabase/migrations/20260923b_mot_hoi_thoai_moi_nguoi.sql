-- 20260923b — MỘT hội thoại cho MỘT người (FR-214 a, chủ dự án 23/09/2026: "có 1 chat thôi").
--
-- Trước: một Zalo vừa mua vừa bán có HAI dòng `conversations` (một buyer_id, một seller_id; ràng buộc
-- `conversations_mot_vai_check` bắt đúng một vai). Nhánh bán không thấy tin nhánh mua và ngược lại, nên
-- bot quên người này vừa hỏi mua căn gì khi họ quay sang rao, và /admin hiện hai cuộc cho một người.
-- Nay: một dòng mang CẢ HAI khoá (vai nào có thì điền), ràng buộc thành "ít nhất một vai". Hai hàm
-- `ensure_*_conversation` khoá chung theo Zalo ID và luôn trả về cùng một dòng; dòng cũ tách đôi được gộp:
-- giữ dòng bắt đầu sớm hơn, dời tin nhắn / mẫu câu / fact dự án sang, gộp cờ người thật.
-- Zalo KHÁC là người khác (chủ dự án) — không gộp theo SĐT hay tên.

alter table public.conversations drop constraint if exists conversations_mot_vai_check;
alter table public.conversations drop constraint if exists conversations_co_vai_check;
alter table public.conversations add constraint conversations_co_vai_check CHECK (((buyer_id IS NOT NULL) OR (seller_id IS NOT NULL)));

do $gop$
declare
  r record;
  giu uuid; bo uuid;
  d public.conversations%rowtype;
begin
  for r in
    select cb.id as cb_id, cb.started_at as cb_at, cs.id as cs_id, cs.started_at as cs_at, b.id as b_id, s.id as s_id
      from public.buyers b
      join public.sellers s on s.zalo_user_id = b.zalo_user_id
      join public.conversations cb on cb.buyer_id = b.id and cb.seller_id is null
      join public.conversations cs on cs.seller_id = s.id and cs.buyer_id is null
  loop
    if r.cb_at <= r.cs_at then giu := r.cb_id; bo := r.cs_id; else giu := r.cs_id; bo := r.cb_id; end if;
    update public.messages set conversation_id = giu where conversation_id = bo;
    update public.mau_cau set conversation_id = giu where conversation_id = bo;
    update public.project_facts set conversation_id = giu where conversation_id = bo;
    select * into d from public.conversations where id = bo;
    delete from public.conversations where id = bo;
    update public.conversations c set
      buyer_id = r.b_id, seller_id = r.s_id,
      needs_human = c.needs_human or coalesce(d.needs_human, false),
      needs_human_at = greatest(c.needs_human_at, d.needs_human_at),
      human_touch_at = greatest(c.human_touch_at, d.human_touch_at),
      human_escalated_at = greatest(c.human_escalated_at, d.human_escalated_at),
      human_hold = coalesce(c.human_hold, false) or coalesce(d.human_hold, false),
      last_message_at = greatest(c.last_message_at, d.last_message_at),
      ctv_id = coalesce(c.ctv_id, d.ctv_id)
    where c.id = giu;
  end loop;
end $gop$;

CREATE OR REPLACE FUNCTION public.ensure_buyer_conversation(p_zalo_user_id text, p_channel text DEFAULT 'zalo_oa'::text)
 RETURNS TABLE(b_id uuid, c_id uuid, b_name text, b_prefs jsonb, c_ctv_id uuid, c_human_touch_at timestamp with time zone, c_human_hold boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_buyer buyers%rowtype; v_conv conversations%rowtype; v_seller uuid;
begin
  -- 20260923b: khoá theo NGƯỜI (Zalo ID), chung với ensure_seller_conversation — một người một hội thoại.
  perform pg_advisory_xact_lock(hashtext('nguoi:' || p_zalo_user_id));
  select * into v_buyer from buyers where zalo_user_id = p_zalo_user_id;
  if not found then
    insert into buyers (zalo_user_id) values (p_zalo_user_id) returning * into v_buyer;
  end if;
  update buyers set last_contact_at = now() where id = v_buyer.id;
  select s.id into v_seller from sellers s where s.zalo_user_id = p_zalo_user_id;
  select * into v_conv from conversations
    where conversations.buyer_id = v_buyer.id
    order by started_at desc limit 1;
  if v_conv.id is null and v_seller is not null then
    update conversations set buyer_id = v_buyer.id
     where id = (select c.id from conversations c where c.seller_id = v_seller order by c.started_at desc limit 1)
    returning * into v_conv;
  end if;
  if v_conv.id is null then
    insert into conversations (buyer_id, seller_id, channel) values (v_buyer.id, v_seller, p_channel)
      returning * into v_conv;
  end if;
  return query select v_buyer.id, v_conv.id, v_buyer.name, v_buyer.preferences,
                      v_conv.ctv_id, v_conv.human_touch_at, v_conv.human_hold;
end $function$;

CREATE OR REPLACE FUNCTION public.ensure_seller_conversation(p_seller_id uuid, p_channel text DEFAULT 'zalo_oa'::text)
 RETURNS TABLE(c_id uuid, c_human_touch_at timestamp with time zone, c_ctv_id uuid, c_human_hold boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_conv conversations%rowtype; v_zalo text; v_buyer uuid;
begin
  -- 20260923b: khoá theo NGƯỜI (Zalo ID), chung với ensure_buyer_conversation — một người một hội thoại.
  select s.zalo_user_id into v_zalo from sellers s where s.id = p_seller_id;
  perform pg_advisory_xact_lock(hashtext('nguoi:' || coalesce(v_zalo, p_seller_id::text)));
  select * into v_conv from conversations
    where conversations.seller_id = p_seller_id
    order by started_at desc limit 1;
  if v_conv.id is null and v_zalo is not null then
    select b.id into v_buyer from buyers b where b.zalo_user_id = v_zalo;
    if v_buyer is not null then
      update conversations set seller_id = p_seller_id
       where id = (select c.id from conversations c where c.buyer_id = v_buyer order by c.started_at desc limit 1)
      returning * into v_conv;
    end if;
  end if;
  if v_conv.id is null then
    insert into conversations (seller_id, buyer_id, channel) values (p_seller_id, v_buyer, p_channel)
      returning * into v_conv;
  end if;
  return query select v_conv.id, v_conv.human_touch_at, v_conv.ctv_id, v_conv.human_hold;
end $function$;

comment on constraint conversations_co_vai_check on public.conversations is
  'FR-214 (20260923b): một hội thoại mỗi người — mang buyer_id, seller_id hoặc cả hai (người vừa mua vừa bán).';
