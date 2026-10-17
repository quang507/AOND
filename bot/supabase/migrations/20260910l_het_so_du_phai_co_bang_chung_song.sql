-- 20260910l — "HẾT SỐ DƯ" PHẢI CÓ BẰNG CHỨNG CÒN SỐNG, KHÔNG CHỈ DẤU VẾT CHẾT (FR-192 b).
--
-- Chủ dự án 10/09/2026 nhìn thẻ Quota tiêu hao: "nãy giờ tao thấy vẫn còn 15 đô
-- chứ hết đâu, nếu còn tiền mà nó thông báo vậy là sai rồi".
--
-- Đúng. Hàm cũ đọc `bot_errors` tìm "credit balance is too low" trong 24 giờ, có
-- dòng nào là phất cờ `het_credit`. Sáng nay 68 lượt bị từ chối THẬT, lần cuối
-- 12:09 — rồi chủ dự án nạp tiền. Tài khoản còn tiền, model gọi được, mà thẻ vẫn
-- đỏ "HẾT SỐ DƯ" tới tận trưa mai vì mấy dòng lỗi cũ chưa trôi khỏi cửa sổ 24 giờ.
--
-- Đây đúng cái bẫy CLAUDE.md ghi cho cái còi ntfy — "cái gì chứng minh nó tới
-- nơi?" — nhưng ngược chiều: một dòng lỗi CŨ không chứng minh được BÂY GIỜ vẫn
-- hỏng. Băng đỏ nói sai một lần thì lần sau không ai tin nó nữa, mà băng này là
-- thứ DUY NHẤT nói ra rằng bot đang trả lời bằng câu mẫu thay vì bằng model.
--
-- Nay `het_credit` cần CẢ HAI vế: có lỗi trong 24h VÀ chưa có dấu
-- `bot_health(model_chinh)` nào mới hơn lỗi cuối. Nạp tiền xong, lượt gọi đầu
-- tiên đóng dấu là băng tắt ngay — không phải chờ hết 24 giờ.
--
-- Chép nguyên thân hàm của `20260910h` rồi sửa đúng ba chỗ (khai biến, het_credit,
-- dang_chay_du_phong), để không lỡ tay đổi tên cột `bot_usage.day` hay hình dạng
-- `nguoi_dot_nhieu` mà trang /admin đang đọc.

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
  v_gio_limit   integer := 30;
  v_ngay_limit  integer := 120;
  v_nguoi       jsonb;
  v_credit      record;
  v_tran_nguoi  integer;
  v_co_du_phong boolean := false;
  v_song           timestamptz;
  v_dang_du_phong timestamptz;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;

  begin
    v_tran_ngay := nullif(btrim(coalesce(public.get_secret('DAILY_MODEL_CALL_CAP'), '')), '')::integer;
  exception when others then v_tran_ngay := null; end;
  v_tran_ngay := coalesce(v_tran_ngay, 1000);

  begin
    v_co_du_phong := coalesce(btrim(coalesce(public.get_secret('GROQ_API_KEY'), '')), '') <> '';
  exception when others then v_co_du_phong := false; end;

  select coalesce(u.model_calls, 0) as luot,
         coalesce(u.in_tokens,0)+coalesce(u.out_tokens,0)+coalesce(u.cache_write_tokens,0)+coalesce(u.cache_read_tokens,0) as tokens,
         u.capped_at
    into v_hom_nay from bot_usage u where u.day = v_ngay;

  select coalesce(jsonb_agg(x order by x.trong_24h desc), '[]'::jsonb) into v_nguoi
    from (
      select q.zalo_user_id as uid, sum(q.calls) as trong_24h,
             sum(q.calls) filter (where q.gio = date_trunc('hour', now())) as trong_gio,
             exists (
               select 1 from sellers s where s.zalo_user_id = q.zalo_user_id
               union all select 1 from ctvs c where c.zalo_user_id = q.zalo_user_id
               union all select 1 from admins a where a.zalo_user_id = q.zalo_user_id
             ) as nguoi_quen
        from chat_quota q where q.gio > now() - interval '24 hours'
       group by q.zalo_user_id order by 2 desc limit 10
    ) x;

  -- Dấu SỐNG của model chính: `_shared/claude.ts` đóng khi một lượt gọi model
  -- chính TRẢ VỀ (tiết chế 2 phút/lượt). Cố ý không dùng bot_usage/cong_token:
  -- đường dự phòng Groq cũng ghi token qua đó, nên một lượt Groq thành công sẽ
  -- xoá oan cờ hết số dư của Anthropic — nói ngược lại sự thật.
  select h.at into v_song from bot_health h where h.who = 'model_chinh';

  select count(*)::int as so_loi, max(e.at) as lan_cuoi into v_credit
    from bot_errors e
   where e.at > now() - interval '24 hours'
     and e.detail ilike '%credit balance is too low%';

  select max(e.at) into v_dang_du_phong
    from bot_errors e
   where e.at > now() - interval '1 hour' and e.source ilike 'model chinh hong%';

  select count(*)::int into v_tran_nguoi from (
    select q.zalo_user_id from chat_quota q where q.gio > now() - interval '24 hours'
     group by q.zalo_user_id having sum(q.calls) >= v_ngay_limit) y;

  return jsonb_build_object(
    'ngay', v_ngay, 'luot_hom_nay', coalesce(v_hom_nay.luot, 0), 'tran_ngay', v_tran_ngay,
    'capped_at', v_hom_nay.capped_at, 'token_hom_nay', coalesce(v_hom_nay.tokens, 0),
    'tran_gio_nguoi', v_gio_limit, 'tran_ngay_nguoi', v_ngay_limit, 'he_so_nguoi_quen', 4,
    'nguoi_dot_nhieu', coalesce(v_nguoi, '[]'::jsonb),
    'so_nguoi_cham_tran', coalesce(v_tran_nguoi, 0),
    -- CÒN hết số dư chỉ khi: có lỗi trong 24h VÀ chưa có lượt gọi model chính
    -- nào thành công SAU lỗi cuối. Dòng lỗi CŨ không phải bằng chứng rằng BÂY
    -- GIỜ vẫn hỏng.
    'het_credit', coalesce(v_credit.so_loi, 0) > 0
                    and (v_song is null or v_song <= v_credit.lan_cuoi),
    'model_song_luc', v_song,
    'credit_loi_24h', coalesce(v_credit.so_loi, 0),
    'credit_lan_cuoi', v_credit.lan_cuoi,
    'co_du_phong', v_co_du_phong,
    'dang_chay_du_phong', v_dang_du_phong is not null
                            and (v_song is null or v_song <= v_dang_du_phong)
  );
end $$;

comment on function public.quota_tieu_hao() is
  'FR-192/194: quota tiêu hao cho /admin. het_credit cần CẢ HAI: có lỗi "credit balance is '
  'too low" trong 24h VÀ chưa có dấu bot_health(model_chinh) mới hơn lỗi cuối — nạp tiền '
  'xong là băng đỏ tắt ngay, không đợi lỗi cũ trôi khỏi cửa sổ 24 giờ.';
