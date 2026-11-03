-- 03/11/2026 (SRS-5.1zzzzzzz378). Trang CRM /admin/chi-phi chia tiền model của NGÀY cho số cuộc chat có lượt trong ngày đó
-- (chủ dự án 03/11: "Bảng chi phí theo ngày và theo cuộc chat, đọc từ bot_usage_model — biết vòng gộp tốn thật bao nhiêu
-- trên khách thật"). Tiền đọc thẳng `bot_usage_model` (RLS admin sẵn có); phần thiếu là MẪU SỐ: số hội thoại có tin khách
-- trong ngày. `hoi_thoai_thong_ke` chỉ đếm hội thoại MỚI và số TIN, không đếm hội thoại có lượt — và kéo `messages` về web
-- để đếm thì vừa nặng vừa mang lời chat ra trình duyệt. View này chỉ trả SỐ ĐẾM theo ngày, không tên / SĐT / lời chat.
--
-- `cuoc_chat`     = số hội thoại có ít nhất một tin của khách (sender buyer / seller) trong ngày giờ VN.
-- `cuoc_chat_thu` = phần trong đó của ID thử (`la_id_thu`, chỗ duy nhất giữ tiền tố) — sổ token gộp cả lượt bắn thử nên
--                   web cần biết bao nhiêu cuộc là thử để nói rõ con số chia đều đang lẫn gì.
-- `tin_khach`     = số tin khách nhắn (≈ số lượt bot phải trả lời).

create or replace view public.chi_phi_cuoc_chat_ngay
with (security_invoker = true) as
with ngay as (
  select d::date as ngay
  from generate_series(
    (now() at time zone 'Asia/Ho_Chi_Minh')::date - 29,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    interval '1 day') as d
),
tin as (
  select (m.created_at at time zone 'Asia/Ho_Chi_Minh')::date as ngay,
         m.conversation_id,
         count(*) as so_tin
  from public.messages m
  where m.created_at >= now() - interval '31 days'
    and m.sender in ('buyer', 'seller')
  group by 1, 2
),
gop as (
  select t.ngay,
         count(*)                                                                         as cuoc_chat,
         count(*) filter (where public.la_id_thu(coalesce(b.zalo_user_id, s.zalo_user_id))) as cuoc_chat_thu,
         sum(t.so_tin)                                                                    as tin_khach
  from tin t
  join public.conversations c on c.id = t.conversation_id
  left join public.buyers  b on b.id = c.buyer_id
  left join public.sellers s on s.id = c.seller_id
  group by 1
)
select n.ngay,
       coalesce(g.cuoc_chat, 0)::int     as cuoc_chat,
       coalesce(g.cuoc_chat_thu, 0)::int as cuoc_chat_thu,
       coalesce(g.tin_khach, 0)::int     as tin_khach
from ngay n
left join gop g on g.ngay = n.ngay
-- security_invoker: RLS admin của messages / conversations / buyers / sellers tự áp; cổng admin trong WHERE là lớp thứ hai.
where auth.role() = 'service_role' or public.la_admin();

-- View MỚI mặc định LỘ cho anon / authenticated (default privileges) → revoke trước rồi mới grant.
revoke all on public.chi_phi_cuoc_chat_ngay from public, anon, authenticated, service_role;
grant select on public.chi_phi_cuoc_chat_ngay to authenticated, service_role;
comment on view public.chi_phi_cuoc_chat_ngay is
  'SRS-5.1zzzzzzz378 03/11: theo ngày giờ VN (30 ngày) — số hội thoại có tin khách, phần ID thử, số tin khách. Mẫu số cho '
  'chi phí trung bình mỗi cuộc chat ở /admin/chi-phi (tiền ngày từ bot_usage_model ÷ cuoc_chat, ước tính chia đều). Chỉ số '
  'đếm, không tên / SĐT / lời chat. security_invoker + cổng la_admin(); anon bị revoke.';
