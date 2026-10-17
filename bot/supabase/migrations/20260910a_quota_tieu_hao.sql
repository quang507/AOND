-- 20260910a — QUOTA TIÊU HAO: một cửa đọc cho trang /admin (FR-192).
--
-- VÌ SAO. Hệ thống có bốn cái trần, và hôm nay không có chỗ nào xem cả bốn cùng
-- lúc:
--   (1) trần LƯỢT GỌI MODEL theo ngày — `bump_model_quota(DAILY_MODEL_CALL_CAP)`,
--       mặc định 1000; chạm trần thì bot NGỪNG trả lời cả ngày và đóng dấu
--       `bot_usage.capped_at`;
--   (2) trần THEO NGƯỜI — `bump_user_quota` 30 lượt/giờ và 120 lượt/24h, người
--       quen (seller/ctv/admin) nới ×4; đếm trong `chat_quota`;
--   (3) SỐ DƯ tài khoản Anthropic — không có API nào cho web hỏi, nhưng khi hết
--       thì mọi lượt gọi model trả 400 "credit balance is too low" và rơi vào
--       `bot_errors`. Sáng 10/09/2026 chính cảnh đó xảy ra: bot vẫn trả lời
--       bằng câu mẫu tiền định nên NHÌN BÊN NGOÀI KHÔNG KHÁC GÌ, chủ dự án đọc
--       bản ghi chỉ thấy "giọng cứng" mà không biết model đã chết;
--   (4) trần bộ nhớ tạm / tiền — `bot_usage` đã đếm sẵn số chữ (`20260901b`),
--       trang /admin đã quy ra đô ở thẻ "Chi phí Model".
--
-- Ba cái đầu chưa hiện ở đâu. Trang /admin đọc DB bằng publishable key qua RLS,
-- mà `bot_usage`/`chat_quota` đều khoá với `anon`, và `DAILY_MODEL_CALL_CAP` nằm
-- trong Vault — web không đọc trực tiếp được cái nào. Nên một hàm
-- SECURITY DEFINER gom đúng những con số cần xem, tự kiểm `la_admin()`.
--
-- KHÔNG trả về bí mật nào ngoài một con số trần (đọc `get_secret` đúng một khoá
-- `DAILY_MODEL_CALL_CAP`). Đây là cửa sổ, không phải cửa sau.

create or replace function public.quota_tieu_hao()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ngay        date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_tran_ngay   integer;
  v_hom_nay     record;
  v_gio_limit   integer := 30;   -- cùng mặc định với bump_user_quota
  v_ngay_limit  integer := 120;
  v_nguoi       jsonb;
  v_credit      record;
  v_tran_nguoi  integer;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;

  -- (1) Trần lượt model theo ngày. Vault có thể không đặt khoá → mặc định 1000,
  -- đúng con số `chat-reply` dùng khi `secretOf` trả null.
  begin
    v_tran_ngay := nullif(btrim(coalesce(public.get_secret('DAILY_MODEL_CALL_CAP'), '')), '')::integer;
  exception when others then
    v_tran_ngay := null;
  end;
  v_tran_ngay := coalesce(v_tran_ngay, 1000);

  select coalesce(u.model_calls, 0) as luot,
         coalesce(u.in_tokens, 0) + coalesce(u.out_tokens, 0)
           + coalesce(u.cache_write_tokens, 0) + coalesce(u.cache_read_tokens, 0) as tokens,
         u.capped_at
    into v_hom_nay
    from bot_usage u
   where u.day = v_ngay;

  -- (2) Trần theo người: ai đang đốt nhiều nhất trong 24 giờ, và giờ này bao nhiêu.
  select coalesce(jsonb_agg(x order by x.trong_24h desc), '[]'::jsonb)
    into v_nguoi
    from (
      select q.zalo_user_id                                              as uid,
             sum(q.calls)                                                as trong_24h,
             sum(q.calls) filter (where q.gio = date_trunc('hour', now())) as trong_gio,
             exists (
               select 1 from sellers s where s.zalo_user_id = q.zalo_user_id
               union all
               select 1 from ctvs c   where c.zalo_user_id = q.zalo_user_id
               union all
               select 1 from admins a where a.zalo_user_id = q.zalo_user_id
             )                                                           as nguoi_quen
        from chat_quota q
       where q.gio > now() - interval '24 hours'
       group by q.zalo_user_id
       order by 2 desc
       limit 10
    ) x;

  select count(*)::int as so_loi, max(e.at) as lan_cuoi
    into v_credit
    from bot_errors e
   where e.at > now() - interval '24 hours'
     and e.detail ilike '%credit balance is too low%';

  select count(*)::int into v_tran_nguoi
    from (
      select q.zalo_user_id, sum(q.calls) as c
        from chat_quota q
       where q.gio > now() - interval '24 hours'
       group by q.zalo_user_id
      having sum(q.calls) >= v_ngay_limit
    ) y;

  return jsonb_build_object(
    'ngay',            v_ngay,
    'luot_hom_nay',    coalesce(v_hom_nay.luot, 0),
    'tran_ngay',       v_tran_ngay,
    'capped_at',       v_hom_nay.capped_at,
    'token_hom_nay',   coalesce(v_hom_nay.tokens, 0),
    'tran_gio_nguoi',  v_gio_limit,
    'tran_ngay_nguoi', v_ngay_limit,
    'he_so_nguoi_quen', 4,
    'nguoi_dot_nhieu', coalesce(v_nguoi, '[]'::jsonb),
    'so_nguoi_cham_tran', coalesce(v_tran_nguoi, 0),
    'het_credit',      coalesce(v_credit.so_loi, 0) > 0,
    'credit_loi_24h',  coalesce(v_credit.so_loi, 0),
    'credit_lan_cuoi', v_credit.lan_cuoi
  );
end $$;

comment on function public.quota_tieu_hao() is
  'FR-192: gom quota tiêu hao cho trang /admin — lượt model hôm nay so với trần '
  'DAILY_MODEL_CALL_CAP, dấu chạm trần, người đốt nhiều nhất 24h so với trần theo '
  'người, và dấu hiệu HẾT SỐ DƯ Anthropic (bot_errors "credit balance is too low"). '
  'Chỉ admin hoặc service_role gọi được.';

revoke execute on function public.quota_tieu_hao() from public, anon;
grant execute on function public.quota_tieu_hao() to authenticated, service_role;

-- `chat_quota` vẫn KHÔNG mở cho web: web chỉ được nhìn qua hàm trên, vì bảng đó
-- chứa Zalo ID trần của mọi người nhắn tới (kể cả người lạ) — §5.
