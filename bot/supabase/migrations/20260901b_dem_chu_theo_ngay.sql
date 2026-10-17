-- 20260901b — Đếm CHỮ, không chỉ đếm LƯỢT
--
-- VÌ SAO CẦN. `bot_usage` (dựng 27/08) đếm số lượt gọi bộ não để chặn đốt tiền.
-- Nó làm đúng việc đó. Nhưng khi chủ dự án hỏi "scale up lên tiền đâu chịu nổi"
-- thì số lượt không trả lời được, vì tiền tính theo CHỮ gửi đi chứ không theo
-- số lượt: một lượt khách nhắn "ok anh" và một lượt khách hỏi ba căn cùng lúc
-- lệch nhau nhiều lần. Muốn trả lời câu đó bằng số đo thay vì bằng ước tính thì
-- phải ghi lại số chữ.
--
-- BỐN CỘT, VÌ BỐN LOẠI CHỮ CÓ BỐN GIÁ KHÁC NHAU (Opus 5, giá gốc $5/1 triệu
-- chữ-máy vào, $25/1 triệu ra):
--
--   in_tokens           chữ gửi lên, tính đủ giá        ×1      = $5/triệu
--   cache_read_tokens   chữ máy đọc lại từ bộ nhớ tạm   ×0,1    = $0,50/triệu
--   cache_write_tokens  chữ nạp vào bộ nhớ tạm          ×1,25 (nhịp 5 phút)
--                                                       ×2    (nhịp 1 giờ)
--   out_tokens          chữ máy viết ra                 ×5      = $25/triệu
--
-- Tách riêng cache_write và cache_read là điểm mấu chốt, không phải chi tiết
-- vụn: chỉ khi thấy hai cột này cạnh nhau mới biết bộ nhớ tạm đang LỜI hay đang
-- LỖ. Write cao mà read thấp = lượt nào cũng trượt = đang trả thêm tiền để
-- không được gì, và lúc đó phải đổi nhịp nhớ tạm (xem chat-reply/index.ts, khối
-- bình luận ở chỗ cache_control).
--
-- KHÔNG lưu thành tiền, chỉ lưu số chữ. Giá có thể đổi, và một con số đô cứng
-- ghi vào DB hôm nay thì sang năm là số sai mà không ai biết. Nhân giá lúc đọc.
--
-- KHÔNG chặn gì cả. Trần đốt tiền vẫn là bump_model_quota đếm theo lượt. Đây
-- thuần tuý là cái đồng hồ đo, ghi hỏng thì thôi, không được phép làm hỏng câu
-- trả lời cho khách.

alter table public.bot_usage
  add column if not exists in_tokens          bigint not null default 0,
  add column if not exists out_tokens         bigint not null default 0,
  add column if not exists cache_write_tokens bigint not null default 0,
  add column if not exists cache_read_tokens  bigint not null default 0;

comment on column public.bot_usage.in_tokens is
  'Chữ gửi lên KHÔNG nằm trong bộ nhớ tạm — tính đủ giá.';
comment on column public.bot_usage.cache_read_tokens is
  'Chữ đọc lại từ bộ nhớ tạm — 1/10 giá. Cao là tốt.';
comment on column public.bot_usage.cache_write_tokens is
  'Chữ nạp vào bộ nhớ tạm — 1,25 lần giá (nhịp 5 phút) hoặc 2 lần (nhịp 1 giờ). '
  'Cao hơn cache_read nghĩa là lượt nào cũng trượt, đang lỗ vì bộ nhớ tạm.';

-- Cộng dồn số chữ của MỘT lượt vào dòng của ngày hôm nay (giờ VN).
--
-- Vì sao vẫn cần `insert … on conflict` chứ không `update` thẳng: lượt gọi model
-- đầu tiên trong ngày có thể là lượt KHÔNG đi qua bump_model_quota (nudge,
-- ctv-report, ask-seller chạy theo lịch), khi đó dòng của ngày chưa tồn tại và
-- một câu update thuần sẽ lặng lẽ ghi vào hư không.
create or replace function public.cong_token(
  p_in           bigint default 0,
  p_out          bigint default 0,
  p_cache_write  bigint default 0,
  p_cache_read   bigint default 0
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into bot_usage (day, model_calls, in_tokens, out_tokens, cache_write_tokens, cache_read_tokens)
  values ((now() at time zone 'Asia/Ho_Chi_Minh')::date, 0,
          coalesce(p_in,0), coalesce(p_out,0), coalesce(p_cache_write,0), coalesce(p_cache_read,0))
  on conflict (day) do update set
    in_tokens          = bot_usage.in_tokens          + coalesce(p_in,0),
    out_tokens         = bot_usage.out_tokens         + coalesce(p_out,0),
    cache_write_tokens = bot_usage.cache_write_tokens + coalesce(p_cache_write,0),
    cache_read_tokens  = bot_usage.cache_read_tokens  + coalesce(p_cache_read,0);
exception when others then
  -- Đồng hồ đo hỏng thì thôi. TUYỆT ĐỐI không để nó làm hỏng lượt trả lời khách.
  return;
end $$;

comment on function public.cong_token(bigint, bigint, bigint, bigint) is
  'Cộng số chữ của một lượt gọi model vào dòng hôm nay của bot_usage. Chỉ đo, '
  'không chặn; nuốt mọi lỗi để không làm hỏng câu trả lời cho khách.';

revoke execute on function public.cong_token(bigint, bigint, bigint, bigint)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- CHO ADMIN ĐỌC. Đồng hồ không ai đọc được thì bằng không có đồng hồ: bảng này
-- dựng 27/08 chỉ để bot tự ghi tự đọc, `revoke all from anon, authenticated`,
-- nên trang /admin (đọc bằng khoá công khai qua RLS) không thấy gì.
--
-- Đúng khuôn `bot_errors_admin_read` / `bot_health_admin_read`: cấp SELECT cho
-- vai `authenticated` rồi để RLS lọc xuống đúng người có email trong bảng
-- `admins`. Cấp quyền mà quên policy thì mọi người đăng nhập đều đọc được —
-- hai vế phải đi cùng nhau.
--
-- KHÔNG cấp INSERT/UPDATE: ghi vẫn chỉ qua service_role và cong_token. Bảng
-- không chứa gì riêng tư — thuần số đếm, không tên, không số điện thoại.
grant select on public.bot_usage to authenticated;

drop policy if exists bot_usage_admin_read on public.bot_usage;
create policy bot_usage_admin_read on public.bot_usage
  for select to authenticated
  using (exists (
    select 1 from admins a
    where a.email = ((select auth.jwt()) ->> 'email')
  ));
