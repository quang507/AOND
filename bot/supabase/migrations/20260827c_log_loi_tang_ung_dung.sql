-- FR-152 (b) — cửa ghi lỗi TẦNG ỨNG DỤNG.
-- BẢN SAO THAM CHIẾU của migration đã áp thật qua MCP ngày 27/08/2026
-- (`20260827c_log_loi_tang_ung_dung`). Chạy lại là vô hại.
--
-- ========================= LỖ CÒN LẠI SAU 20260827b =========================
-- bot_health_tick() chỉ bắt được lỗi TẦNG HTTP: cái gì trả không-2xx thì vào
-- sổ. Nhưng loại lỗi nguy nhất của hệ này lại TRẢ 200 — `catch` nuốt exception
-- rồi hàm chạy tiếp và trả về bình thường. Đếm được 9 chỗ như vậy, cả 9 chỉ
-- `console.error` vào log Supabase, mà bậc Free giữ log 1 ngày rồi xoá.
--
--   chat-reply:751       model hỏng → bot vẫn trả lời bằng regex fallback.
--                        Khách không thấy lạ, mã HTTP không thấy lạ, admin mù.
--   ctv-report:104       đúng con bug 26/08 (JSON hụt đuôi → điểm CTV mất im).
--   zalo-webhook:51      bộ não trả {error} → khách KHÔNG nhận được gì.
--   zalo-webhook:69/76   Zalo từ chối gửi → khách ngồi chờ câu không bao giờ tới.
--   zalo-webhook:104     exception trong tác vụ nền, không ai await, rơi vào hư không.
--   bridge (7 chỗ)       console.error hiện ở terminal rồi mất theo cửa sổ.
--
-- log_loi() là cửa cho những chỗ đó ghi vào `bot_errors` — cùng sổ với lỗi HTTP,
-- cùng còi báo, cùng hiện ở /admin.
-- ===========================================================================

create or replace function public.log_loi(
  p_source text,
  p_detail text,
  p_code   integer default null
) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_src text := left(coalesce(nullif(trim(p_source), ''), 'khong_ro'), 40);
begin
  -- Hàm này PHẢI mở cho `anon`: server Next.js (instrumentation.ts →
  -- onRequestError) chạy bằng publishable key, tức vai anon. Mà anon key thì
  -- nằm sẵn trong bundle JS của web — ai mở trang cũng lấy được, nên phải coi
  -- như hàm này mở cho cả Internet. Hai cái van:
  --   * 20 dòng/nguồn/giờ — chặn một chỗ hỏng lặp làm ngập sổ;
  --   * 200 dòng/giờ tổng  — chặn kẻ đổi p_source liên tục để lách van trên.
  -- Chạm van thì im lặng bỏ qua, KHÔNG ném: nơi gọi đang ở trong `catch`, ném
  -- thêm ở đây là biến một lỗi thành hai.
  if (select count(*) from bot_errors
      where source = v_src and at > now() - interval '1 hour') >= 20 then
    return;
  end if;
  if (select count(*) from bot_errors
      where at > now() - interval '1 hour') >= 200 then
    return;
  end if;

  insert into bot_errors (source, status_code, detail)
  values (v_src, p_code, left(coalesce(p_detail, ''), 500));
end $$;

grant execute on function public.log_loi(text, text, integer) to anon, authenticated, service_role;

comment on function public.log_loi(text, text, integer) is
  'FR-152 — ghi lỗi tầng ứng dụng vào bot_errors. Có van 20/nguồn/giờ và 200/giờ vì anon gọi được.';

-- bot_health_tick() sửa hai chỗ so với bản 20260827b:
--   1. Còi báo đếm MỌI lỗi mới trong giờ qua, không chỉ lỗi HTTP — giờ log_loi()
--      cũng đổ vào cùng bảng.
--   2. Tự dọn sổ quá 30 ngày. Bậc Free chỉ có 500MB, một chỗ hỏng lặp mà không
--      dọn thì nuôi bảng này lớn mãi. Gắn vào nhịp */15 đã có, khỏi đẻ cron mới.
-- (Toàn văn hàm nằm trong migration đã áp; xem 20260827b để hiểu phần quét
--  net._http_response và phần nhịp tim bridge — hai phần đó không đổi.)

-- ====================== ĐÃ THỬ THẬT (27/08/2026) ======================
-- Van theo nguồn:
--   do $$ begin for i in 1..25 loop
--     perform public.log_loi('thu-van', 'dong ' || i, 500); end loop; end $$;
--   → ghi được ĐÚNG 20 dòng, 5 lượt sau bị nuốt.
--
-- Van tổng + vai anon (600 lượt, 30 nguồn khác nhau, chạy bằng `set local role anon`):
--   → tổng bảng dừng ở ĐÚNG 200 dòng. Vai anon gọi được (đúng ý: web cần).
--
-- Đường bridge → sổ (qua escalation-feed action 'log', kèm x-bridge-secret
-- lấy từ Vault ngay trong SQL nên giá trị không ra khỏi Postgres):
--   → 200 {"ok":true}, bot_errors có dòng source='bridge thu-nghiem'.
--
-- Dọn sạch dấu vết thử sau khi đo.
