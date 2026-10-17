-- 20260905h — RPC nguyên tử cho `viecNguoiThat` (FR-147). Vá đua escalation.
--
-- VÌ SAO KHÔNG DÙNG CHỈ MỤC DUY NHẤT như 20260905f.
-- Bất biến ở đây KHÔNG phải "một dòng cho mỗi khoá" mà là hai luật theo THỜI GIAN:
--   · nhánh VOICE:  không có việc escalation nào của khách này còn
--                   `pending|sent`, note bắt đầu "VOICE:", trong 24 GIỜ TRƯỢT;
--   · nhánh thường: không có việc escalation nào của khách này còn `pending`.
-- Cửa sổ trượt không phát biểu được bằng `create unique index`. Ép thành "mỗi
-- NGÀY LỊCH" là đổi luật nghiệp vụ, không phải vá cạnh tranh.
--
-- Và một khoá `unique (buyer_id) where kind='escalation' and status='pending'`
-- thì SAI HẲN: khách đang có việc "cần người thật" mà chốt kèo thì việc báo
-- "khách vừa ĐỒNG Ý CHỐT" (viecChot) sẽ bị DB từ chối — CTV không được báo về
-- một giao dịch đã chốt. Mất tiền thật, chỉ để tránh một thông báo lặp.
--
-- Nên dùng KHOÁ TƯ VẤN theo khách, và giữ NGUYÊN VĂN hai điều kiện lọc. Hàm
-- này không thêm luật nào, chỉ khiến "đọc rồi ghi" xảy ra không xen được.
-- `pg_advisory_xact_lock` tự nhả khi giao dịch kết thúc (mỗi lời gọi RPC là
-- một giao dịch), nên không có đường nào kẹt khoá.
--
-- TƯƠNG THÍCH NGƯỢC: chỉ THÊM hàm mới, không đụng bảng, không đụng hàm cũ.
-- Bản `chat-reply` đang chạy (chưa deploy) vẫn đi đường hai truy vấn như cũ và
-- vẫn hoạt động — chỉ là chưa hết đua. Áp migration trước, deploy sau, không
-- có cửa sổ nào hỏng.
--
-- Ghi chú `ilike`: PostgREST `.ilike("note","VOICE:%")` không phân biệt hoa
-- thường. Giữ đúng `ilike` ở đây — đổi sang `like` là siết chặt hơn bản cũ,
-- tức đổi hành vi ở một chỗ không ai yêu cầu.

create or replace function public.mo_viec_can_nguoi_that(
  p_buyer_id uuid,
  p_ctv_id   uuid,
  p_note     text,
  p_voice    boolean
) returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  da int;
begin
  if p_buyer_id is null then
    raise exception 'p_buyer_id khong duoc null' using errcode = '22004';
  end if;

  -- Xếp hàng theo TỪNG KHÁCH: hai lượt của cùng một khách nối đuôi, hai khách
  -- khác nhau vẫn chạy song song. Hai số: miền khoá + khách, tránh đụng với
  -- khoá tư vấn của chỗ khác dùng chung không gian số.
  perform pg_advisory_xact_lock(hashtext('escalation_nguoi_that'), hashtext(p_buyer_id::text));

  if p_voice then
    select count(*) into da from public.reminders
     where buyer_id = p_buyer_id
       and kind = 'escalation'
       and status in ('pending', 'sent')
       and note ilike 'VOICE:%'
       and created_at > now() - interval '24 hours';
  else
    select count(*) into da from public.reminders
     where buyer_id = p_buyer_id
       and kind = 'escalation'
       and status = 'pending';
  end if;

  if da > 0 then
    return false;                       -- đã có việc đang chờ → không mở thêm
  end if;

  insert into public.reminders (kind, buyer_id, ctv_id, due_at, note)
  values ('escalation', p_buyer_id, p_ctv_id, now(), p_note);
  return true;
end $$;

-- FR-167: hàm nội bộ không nằm trên API công khai.
revoke all on function public.mo_viec_can_nguoi_that(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.mo_viec_can_nguoi_that(uuid, uuid, text, boolean)
  to service_role;
