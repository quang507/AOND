-- Gộp mọi hội thoại của CÙNG MỘT Zalo (sellers + buyers cùng zalo_user_id) thành MỘT hội thoại (SRS-5.1zzzzzzz149, 23/10/2026).
-- Đã chạy thật trên production 23/10/2026 (3 hội thoại còn lại: 3339, 4980, 8895). Chạy lại được: không còn gì để gộp thì không đổi gì.
-- Sao lưu trước khi xoá: luu_tru.hoi_thoai_gop_20261023 (dòng hội thoại bị gộp), luu_tru.tin_nhan_gop_20261023 (tin nhắn đã chuyển sang hội thoại đích).
-- Đích = hội thoại bắt đầu sớm nhất; tin nhắn và `cau_chuan` chuyển sang đích; đích được gắn đủ seller_id + buyer_id; dòng mua mang tên
-- giữ chỗ "Khách Zalo ####" dùng tên Zalo của dòng bán. Không đụng needs_human / human_hold (UPDATE OF needs_human kích trigger gửi email admin).
do $$
declare r record; tgt uuid; src record; n_gop int := 0;
begin
  create table if not exists luu_tru.hoi_thoai_gop_20261023 as select * from public.conversations where false;
  create table if not exists luu_tru.tin_nhan_gop_20261023 (message_id uuid, hoi_thoai_cu uuid, hoi_thoai_moi uuid);
  for r in select s.id sid, b.id bid, s.zalo_user_id zid from public.sellers s join public.buyers b on b.zalo_user_id = s.zalo_user_id loop
    select c.id into tgt from public.conversations c
      where c.channel = 'zalo_personal_test' and (c.seller_id = r.sid or c.buyer_id = r.bid) order by c.started_at asc limit 1;
    if tgt is null then continue; end if;
    for src in select c.* from public.conversations c
        where c.channel = 'zalo_personal_test' and (c.seller_id = r.sid or c.buyer_id = r.bid) and c.id <> tgt loop
      insert into luu_tru.hoi_thoai_gop_20261023 select * from public.conversations where id = src.id;
      insert into luu_tru.tin_nhan_gop_20261023 select m.id, src.id, tgt from public.messages m where m.conversation_id = src.id;
      update public.messages set conversation_id = tgt where conversation_id = src.id;
      update public.cau_chuan set conversation_id = tgt where conversation_id = src.id;
      update public.conversations set ctv_id = coalesce(ctv_id, src.ctv_id) where id = tgt;
      delete from public.conversations where id = src.id;
      n_gop := n_gop + 1;
    end loop;
    update public.conversations set seller_id = coalesce(seller_id, r.sid), buyer_id = coalesce(buyer_id, r.bid),
           last_message_at = (select max(created_at) from public.messages where conversation_id = tgt)
     where id = tgt;
  end loop;
  update public.buyers b set name = s.name from public.sellers s
   where s.zalo_user_id = b.zalo_user_id and b.name like 'Khách Zalo%' and coalesce(s.name,'') <> '' and s.name not like 'Khách Zalo%';
  raise notice 'đã gộp % hội thoại', n_gop;
end $$;
