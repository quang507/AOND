-- 20260928a — ghi fact cho khoá nào thì câu ĐANG TREO cùng khoá của tin đó đóng luôn (FR-235).
--
-- Chủ dự án 28/09/2026 test Zalo thật: nhắn "hướng đông. đăng bài được chưa. a bận rồi" — bóc tách ghi `huong` = đông vào
-- listing_facts, nhưng câu `huong` trong info_requests vẫn `pending`, nên lượt sau ("ok e") bot hỏi lại đúng câu hướng vừa
-- được trả lời. Mọi đường ghi fact (bóc tách, kèm, AI đọc ghi chú, admin) đều qua hàm này, nên đóng câu treo ở đây một chỗ
-- thay vì vá từng nhánh chat-reply. Chỉ câu hỏi người bán (buyer_id trống): câu khách mua hỏi còn phải chuyển trả lời cho khách.
-- `bo_sung` / `kien_thuc` là ô ghi chú tự do, không phải câu hỏi — không đóng gì.
create or replace function public.ghi_fact_listing(p_listing_id uuid, p_question text, p_answer text, p_source text default 'seller_chat'::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if p_listing_id is null or coalesce(btrim(p_answer), '') = '' then
    return null;
  end if;
  insert into listing_facts (listing_id, question, answer, source)
  values (p_listing_id, btrim(p_question), btrim(p_answer),
          coalesce(nullif(btrim(p_source), ''), 'seller_chat'))
  returning id into v_id;
  if btrim(p_question) not in ('bo_sung', 'kien_thuc') then
    update info_requests
       set status = 'answered', answer = btrim(p_answer), answered_at = now()
     where listing_id = p_listing_id
       and buyer_id is null
       and question = btrim(p_question)
       and status = 'pending';
  end if;
  return v_id;
end $function$;
