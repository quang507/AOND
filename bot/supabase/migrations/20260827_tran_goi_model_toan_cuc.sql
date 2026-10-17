-- Bản tham chiếu của migration ĐÃ ÁP LÊN Supabase 27/08/2026 (FR-151).
--
-- BỐI CẢNH — vì sao FR-146 không đủ.
-- FR-146 đặt trần 100 tin/24h, nhưng đếm theo `conversation_id`, mà conversation
-- sinh ra từ `external_user_id` — chuỗi do NGƯỜI GỌI tự đặt trong body request.
-- `ensure_buyer_conversation` không kiểm gì cả: không thấy thì tạo buyer mới.
-- Nên chỉ cần đổi `external_user_id` mỗi request là bộ đếm về 0.
-- FR-146 chặn được KHÁCH THẬT nhắn nhiều. Nó KHÔNG chặn được ai cố tình đốt tiền.
--
-- Mức thiệt hại: mỗi lượt ~$0.017 (Opus 5 $5/1M input, $25/1M output; khối luật
-- ~3.4K token được cache nên đọc lại chỉ 0.1×). 1 request/giây ≈ $61/giờ, để qua
-- đêm 8 tiếng ≈ $490. Trần thực tế là SỐ DƯ tài khoản Anthropic, không phải code.
-- Mà anon key thì nằm trong bundle JS của web VÀ trong bot/bridge-zca/index.mjs
-- của repo public — ai cũng grep ra.
--
-- 27/08: mới 2 buyer, chưa ai phá. Đây là lỗ treo, vá trước khi bị dùng.

create table if not exists public.bot_usage (
  day          date primary key default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  model_calls  integer not null default 0,
  capped_at    timestamptz
);
alter table public.bot_usage enable row level security;  -- chỉ service_role đụng
revoke all on public.bot_usage from anon, authenticated;

comment on table public.bot_usage is
  'Đếm lượt gọi model theo ngày (giờ VN) để chặn đốt tiền. Chỉ bot ghi.';

-- Tăng bộ đếm và trả về CÒN ĐƯỢC GỌI hay không, trong một câu nguyên tử.
-- `on conflict do update` khoá đúng một dòng nên không cần advisory lock.
create or replace function public.bump_model_quota(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_calls integer;
begin
  insert into bot_usage (day, model_calls)
  values ((now() at time zone 'Asia/Ho_Chi_Minh')::date, 1)
  on conflict (day) do update set model_calls = bot_usage.model_calls + 1
  returning model_calls into v_calls;

  if v_calls > p_limit then
    -- Chạm trần: ghi mốc + báo admin ĐÚNG MỘT LẦN mỗi ngày, đừng spam.
    update bot_usage set capped_at = now()
      where day = (now() at time zone 'Asia/Ho_Chi_Minh')::date
        and capped_at is null;
    if found then
      insert into reminders (kind, due_at, note)
      values ('escalation', now(),
        format('🚨 Bot chạm trần %s lượt gọi model trong ngày và đã TẠM DỪNG trả lời. '
               'Nếu không phải khách thật thì có người đang đốt tiền model bằng anon key.',
               p_limit));
    end if;
    return false;
  end if;
  return true;
end $$;

-- Hàm SECURITY DEFINER: thu hồi EXECUTE khỏi mọi vai công khai, đúng luật đã
-- đặt ở 20260826c. Bot chạy service_role nên không ảnh hưởng.
revoke execute on function public.bump_model_quota(integer)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- PHÍA EDGE FUNCTION (bot/supabase/functions/chat-reply/index.ts, v31):
--   CỔNG 1  BRIDGE_SECRET (Vault) → bắt buộc header `x-bridge-secret`, TRỪ khi
--           request mang service_role key (zalo-webhook gọi server-to-server).
--           Chưa đặt secret thì chạy như cũ → bật được mà không gãy bridge.
--           Bridge gửi header khi máy chạy bridge có env BRIDGE_SECRET.
--   CỔNG 2  bump_model_quota(DAILY_MODEL_CALL_CAP ?? 1000) → vượt thì 429 + im.
--
-- THỨ TỰ BẬT CỔNG 1 — LÀM ĐÚNG CHIỀU NÀY:
--   1. Máy chạy bridge: đặt env `BRIDGE_SECRET` TRƯỚC, khởi động lại.
--   2. Rồi mới cất secret cùng tên vào Vault.
-- Lý do: bridge gửi header khi Vault chưa có secret thì header bị bỏ qua, VÔ
-- HẠI. Ngược lại, bật Vault trước khi bridge biết chuỗi là mọi request từ
-- bridge ăn 403 ngay — bot câm cho tới lúc bridge được khởi động lại.
-- (Bản đầu của file này ghi ngược thứ tự. Đã sửa 27/08.)
--
-- TẮT khẩn cấp nếu lỡ lệch: xoá secret là cổng tự mở lại như cũ —
--   delete from vault.secrets where name = 'BRIDGE_SECRET';
--
-- 27/08: secret đã được sinh NGAY TRONG DB bằng
--   vault.create_secret(encode(extensions.gen_random_bytes(32),'base64'), 'BRIDGE_SECRET', …)
-- nên giá trị chưa từng đi qua log hay khung chat. Đọc ở Dashboard → Vault.
-- Kiểm chứng cùng ngày: gọi KHÔNG header → 403 forbidden; gọi CÓ header lấy từ
-- Vault → 200 kèm câu trả lời thật. Cổng cũng bao luôn `escalation-feed` vì hai
-- function dùng chung một tên secret.
