-- 20261021e — Câu chuẩn xem theo cả cuộc chat (SRS-5.1zzzzzzz112). Chủ dự án 21/10/2026: "có câu đầu ko có mấy câu phía sau nó bắn à để
-- t sửa, t nghĩ nên là từ đầu đến cuối". Mỗi câu bot là một dòng, thẻ rời nhau; dòng bắn thử mất `conversation_id` khi script dọn
-- dữ liệu thử (`on delete set null`), nên trang không biết câu nào cùng cuộc chat. Thêm hai cột CHÉP (không khoá ngoại, dọn dữ liệu
-- vẫn còn): `phien` = cuộc chat, `seq` = thứ tự tin trong cuộc chat — trang gom các câu cùng `phien`, xếp theo `seq`.

alter table public.cau_chuan add column if not exists phien uuid;
alter table public.cau_chuan add column if not exists seq bigint;
comment on column public.cau_chuan.phien is 'Cuộc chat của câu bot — chép conversation_id lúc đưa vào (không khoá ngoại: dọn dữ liệu thử vẫn còn). Trang gom câu theo cột này.';
comment on column public.cau_chuan.seq is 'Thứ tự tin trong cuộc chat (messages.seq lúc đưa vào). Trang xếp câu cùng phiên theo cột này.';
create index if not exists cau_chuan_phien_idx on public.cau_chuan (phien, seq);

-- Dòng còn hội thoại: lấy thẳng.
update public.cau_chuan c set phien = c.conversation_id, seq = m.seq
from public.messages m where m.id = c.message_id and c.phien is null;
update public.cau_chuan set phien = conversation_id where phien is null and conversation_id is not null;

-- Dòng đã mất hội thoại (bắn thử đã dọn): `cau_chuan_tu_zalo` chép mọi câu của một Zalo ID trong MỘT câu lệnh, nên cùng `created_at`
-- = cùng cuộc chat. Thứ tự: câu đầu là câu có ít ngữ cảnh nhất; câu sau là câu có tin bot cuối trong ngữ cảnh đúng bằng câu trước.
update public.cau_chuan set phien = md5(nguon || created_at::text)::uuid where phien is null;
with recursive
  dong as (
    select c.id, c.phien, c.cau_bot, jsonb_array_length(c.ngu_canh) as dai,
           (select e->>'noi_dung' from jsonb_array_elements(c.ngu_canh) with ordinality as x(e, i)
            where e->>'ai' = 'bot' order by i desc limit 1) as bot_truoc
    from public.cau_chuan c where c.seq is null),
  goc as (
    select distinct on (phien) id, phien, cau_bot, 1 as buoc from dong order by phien, dai, id),
  chuoi as (
    select id, phien, cau_bot, buoc from goc
    union all
    select n.id, n.phien, n.cau_bot, ch.buoc + 1
    from chuoi ch
    join lateral (select d.id, d.phien, d.cau_bot from dong d
                  where d.phien = ch.phien and d.bot_truoc = ch.cau_bot and d.id <> ch.id
                  order by d.dai, d.id limit 1) n on true
    where ch.buoc < 200),
  vi_tri as (select distinct on (id) id, buoc from chuoi order by id, buoc)
update public.cau_chuan c set seq = v.buoc from vi_tri v where v.id = c.id and c.seq is null;
-- Câu không nối được vào chuỗi (ngữ cảnh bị cắt) xếp cuối, theo độ dài ngữ cảnh.
update public.cau_chuan set seq = 1000 + jsonb_array_length(ngu_canh) where seq is null;

create or replace function public.cau_chuan_tu_tin(p_message_ids uuid[]) returns integer
language sql set search_path = public as $$
  with vao as (
    insert into public.cau_chuan (message_id, conversation_id, phien, seq, ngu_canh, cau_bot, nguon)
    select m.id, m.conversation_id, m.conversation_id, m.seq,
           coalesce((select jsonb_agg(jsonb_build_object('ai', t.sender, 'noi_dung', t.body) order by t.seq)
                     from (select p.sender, p.body, p.seq from public.messages p
                           where p.conversation_id = m.conversation_id and p.seq < m.seq
                           order by p.seq desc limit 8) t), '[]'::jsonb),
           m.body,
           case when public.la_id_thu(coalesce(s.zalo_user_id, b.zalo_user_id)) then 'ban_thu' else 'that' end
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    left join public.sellers s on s.id = c.seller_id
    left join public.buyers b on b.id = c.buyer_id
    where m.id = any(p_message_ids) and m.sender = 'bot' and coalesce(m.body, '') <> ''
    on conflict (message_id) do update set ngu_canh = excluded.ngu_canh, phien = excluded.phien, seq = excluded.seq
    returning 1
  )
  select count(*)::integer from vao
$$;
comment on function public.cau_chuan_tu_tin(uuid[]) is 'Đưa câu bot (theo id tin) vào cau_chuan kèm 8 tin ngữ cảnh trước nó, phiên + thứ tự tin. Trả số dòng.';
revoke all on function public.cau_chuan_tu_tin(uuid[]) from public, anon;
grant execute on function public.cau_chuan_tu_tin(uuid[]) to authenticated;
