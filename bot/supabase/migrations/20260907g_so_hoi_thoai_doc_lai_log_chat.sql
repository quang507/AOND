-- 20260907g — so.hoi_thoai: đọc lại log chat bằng mắt người.
--
-- VÌ SAO. Chủ dự án hỏi "log chat lưu ở đâu để tao xem lại" (07/09 tối).
-- Log nằm ở public.messages, nhưng bảng đó chỉ có sender/body/conversation_id
-- dạng UUID — muốn biết ai nói, phía bán hay mua, phải join 3 bảng. /admin
-- chưa có màn xem hội thoại. Thêm một view vào schema `so` (20260907c), cùng
-- chỗ với ro_hang và nguoi_ban: mở Table Editor → schema so → hoi_thoai.
--
-- AN TOÀN. Cùng luật với hai view kia: security_invoker, revoke anon/
-- authenticated, chỉ postgres (Dashboard) và service_role. Không phơi SĐT;
-- người chưa có tên hiện "…" + 4 ký tự cuối zalo_user_id để phân biệt.
-- Ngoài vùng xuat_schema() quét — dựng lại từ số không chạy thêm file này
-- (bot/README.md §Phục hồi).

create or replace view so.hoi_thoai
  with (security_invoker = true) as
select
  to_char(m.created_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI:SS') as luc,
  case m.sender
    when 'bot'    then 'Thái (bot)'
    when 'human'  then 'người thật bên mình'
    when 'seller' then coalesce(s.name, 'chủ nhà …' || right(s.zalo_user_id, 4))
    when 'buyer'  then coalesce(b.name, 'khách …' || right(b.zalo_user_id, 4))
    else m.sender::text end                                 as ai,
  m.body                                                    as noi_dung,
  case when c.seller_id is not null then 'bán' else 'mua' end as phia,
  c.channel                                                 as kenh,
  c.needs_human                                             as can_nguoi_that,
  m.conversation_id                                         as hoi_thoai,
  m.seq,
  m.created_at
from public.messages m
join public.conversations c on c.id = m.conversation_id
left join public.sellers s on s.id = c.seller_id
left join public.buyers  b on b.id = c.buyer_id
order by m.created_at desc, m.seq desc;

revoke all on so.hoi_thoai from anon, authenticated;
grant select on so.hoi_thoai to postgres, service_role;

comment on view so.hoi_thoai is
  '[SỔ] Log chat đọc bằng mắt người, tin mới nhất trên cùng: lúc · ai · nội dung · phía bán/mua · kênh · cần người thật. Lọc theo cột hoi_thoai để xem trọn một cuộc. Chỉ đọc; nguồn là public.messages. 20260907g.';
comment on column so.hoi_thoai.ai is 'bot / người thật / tên chủ nhà hoặc khách; chưa có tên thì "…" + 4 ký tự cuối Zalo id. Không có SĐT.';
comment on column so.hoi_thoai.hoi_thoai is 'conversations.id — lọc bằng cột này để đọc trọn một cuộc theo thứ tự.';
