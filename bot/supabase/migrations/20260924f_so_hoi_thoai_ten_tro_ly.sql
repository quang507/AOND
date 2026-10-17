-- 20260924f — so.hoi_thoai: cột `ai` hiện TÊN TRỢ LÝ RIÊNG của từng khách (FR-181), không ghi cứng "Thái (bot)".
--
-- Chủ dự án 24/09/2026 ("cái này đang là ramdom đúng ko sao trong này toàn nhận là Thái vậy sửa rồi mà"): trên Zalo bot
-- xưng "R•ai" (tên băm TẤT ĐỊNH theo Zalo ID, không random — `tenTroLy`, prompts.ts), nhưng view log từ 20260907g ghi
-- cứng 'Thái (bot)' cho mọi tin bot. Nay đọc tên đã lưu: người bán `sellers.ten_tro_ly`, người mua
-- `buyers.preferences->>'ten_tro_ly'`; người cũ chưa lưu tên thì "trợ lý (bot)". Giữ nguyên cột, quyền, chú thích.
create or replace view so.hoi_thoai
  with (security_invoker = true) as
select
  to_char(m.created_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI:SS') as luc,
  case m.sender
    when 'bot'    then coalesce(nullif(s.ten_tro_ly, ''), nullif(b.preferences->>'ten_tro_ly', ''), 'trợ lý') || ' (bot)'
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

comment on column so.hoi_thoai.ai is 'Tên trợ lý riêng của khách + " (bot)" (FR-181: sellers.ten_tro_ly / buyers.preferences.ten_tro_ly; chưa lưu thì "trợ lý") / người thật / tên chủ nhà hoặc khách; chưa có tên thì "…" + 4 ký tự cuối Zalo id. Không có SĐT. 20260924f.';
