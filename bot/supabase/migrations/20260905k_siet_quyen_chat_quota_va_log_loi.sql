-- 20260905k — hai chỗ least-privilege tìm ra trong đợt soát bảo mật DB 05/09.
-- Không sửa migration cũ (chúng đã áp rồi); đây là migration mới.
--
-- ══ 1. chat_quota: anon đang có DELETE/INSERT/UPDATE/TRUNCATE ══
-- Bảng này do `20260905d` tạo trong chính phiên hôm nay. Supabase cấp mặc định
-- `all` cho anon/authenticated trên bảng mới trong schema `public`, và migration
-- đó không thu hồi. Soát toàn bộ 31 bảng: `chat_quota` là bảng DUY NHẤT còn
-- quyền GHI cho anon.
--
-- Hôm nay chưa khai thác được qua PostgREST: RLS đang bật, bảng không có policy
-- nào, nên mọi SELECT/INSERT/UPDATE/DELETE đều bị chặn. NHƯNG:
--   · `TRUNCATE` KHÔNG chịu RLS. Đường nào chạy được lệnh đó với vai anon là
--     xoá sạch bảng hạn mức. PostgREST không phơi TRUNCATE nên hôm nay không
--     với tới, và đó là một sự may mắn về mặt kiến trúc, không phải một hàng rào.
--   · Ngày nào có người thêm một policy `for select using (true)` cho tiện, thì
--     cả bốn quyền ghi kia mở theo — vì quyền bảng vẫn nằm đó.
-- Không ai cần chúng: `bump_user_quota` là SECURITY DEFINER và chỉ service_role
-- gọi được, nên nó ghi bằng quyền chủ sở hữu chứ không qua quyền của anon.
revoke all on table public.chat_quota from anon, authenticated;

-- ══ 2. log_loi: anon bơm rác là bịt được miệng sổ của BOT ══
-- `log_loi` mở cho anon CÓ CHỦ Ý và phải giữ nguyên: `instrumentation.ts` của
-- web ghi lỗi server bằng khoá công khai (FR-152 b). Thu hồi là tắt luôn sổ lỗi
-- phía web — im lặng, đúng thứ FR-152 sinh ra để chống.
--
-- Vấn đề nằm ở TRẦN CHUNG. Bản cũ: quá 20 dòng/nguồn/giờ HOẶC quá 200 dòng
-- TỔNG/giờ thì bỏ. Khoá công khai nằm sẵn trong bundle JS của web, nên bất kỳ
-- ai cũng bắn được 200 lượt `log_loi` trong một giờ và từ đó MỌI lỗi thật —
-- kể cả lỗi của bot chạy bằng service_role — bị nuốt sạch trong giờ đó.
-- Không phải rò rỉ dữ liệu, mà là tắt đèn: hỏng vẫn hỏng, chỉ không ai thấy.
--
-- Sửa tối thiểu: trần chung CHỈ áp cho người gọi không phải service_role.
-- Trần theo NGUỒN (20/giờ) giữ nguyên cho mọi vai, nên bot vẫn không tự làm
-- ngập sổ được. Kết quả: rác từ anon không còn bịt được kênh của bot.
--
-- CÒN LẠI, nói thẳng chứ không giả vờ đã xong: kênh của chính WEB vẫn bịt được
-- — kẻ tấn công cứ gửi `p_source='web app'` là đốt hết 20 lượt/giờ của đúng
-- nguồn đó. Chặn triệt để thì phải để web ghi bằng khoá server thay vì khoá
-- công khai, tức đổi kiến trúc, không nằm trong đợt này.
create or replace function public.log_loi(
  p_source text,
  p_detail text,
  p_code   integer default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_src text := left(coalesce(nullif(trim(p_source), ''), 'khong_ro'), 40);
  v_nguon int;
  v_tong int;
  v_noi_bo boolean := coalesce(auth.role(), '') = 'service_role'
                      or current_user in ('postgres', 'supabase_admin');
begin
  select count(*) filter (where source = v_src), count(*)
    into v_nguon, v_tong
    from bot_errors where at > now() - interval '1 hour';

  if v_nguon >= 20 then
    return;
  end if;
  if not v_noi_bo and v_tong >= 200 then
    return;
  end if;

  insert into bot_errors (source, status_code, detail)
  values (v_src, p_code, left(coalesce(p_detail, ''), 500));
end $$;

-- Giữ NGUYÊN tập người gọi như trước (anon vẫn cần cho instrumentation.ts).
revoke all on function public.log_loi(text, text, integer) from public;
grant execute on function public.log_loi(text, text, integer)
  to anon, authenticated, service_role;
