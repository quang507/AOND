-- 20261029g_hoi_con_ban — SRS-5.1zzzzzzz295 (chủ dự án 29/10/2026, bước 3 chuỗi tiền: "3 20 ngày"): tin đang rao quá 20 ngày chưa có xác nhận
-- của chủ thì bot hỏi chủ nhà căn còn bán / còn cho thuê không (chống hàng ảo). Chủ đáp "còn" → lõi ghi `xac_nhan_con_ban_at`; chủ báo bán /
-- cọc / dừng → đường đổi trạng thái có sẵn. Lõi gửi (`hoi_con_ban.py`), giữ chỗ `reminders` kind `con_ban` (không ai khác kéo kind này).

alter table public.listings add column if not exists xac_nhan_con_ban_at timestamptz;
comment on column public.listings.xac_nhan_con_ban_at is
  'Lần gần nhất chủ nhà xác nhận căn còn bán / còn cho thuê (đáp tin hỏi 20 ngày của lõi, SRS-5.1zzzzzzz295). NULL = chưa xác nhận lần nào — mốc tính hỏi lấy chu_duyet_at / created_at.';

alter table public.reminders drop constraint if exists reminders_kind_check;
alter table public.reminders add constraint reminders_kind_check CHECK ((kind = ANY (ARRAY['promise'::text, 'reengage'::text, 'viewing'::text,
  'followup'::text, 'escalation'::text, 'report'::text, 'match'::text, 'feedback'::text, 'sold'::text, 'rating'::text, 'admin_reply'::text,
  'len_web'::text, 'con_ban'::text])));

-- Tin cần hỏi: đang hiển thị để bán / cho thuê (không tính đã cọc — lúc đó hỏi công chứng), không phải rổ mẫu, người bán có Zalo thật, hội thoại
-- không do người thật giữ, mốc xác nhận gần nhất cũ hơn p_ngay ngày và chưa có tin hỏi con_ban (pending / sent) trong p_ngay ngày.
create or replace function public.tin_can_hoi_con_ban(p_ngay integer default 20, p_limit integer default 30)
 returns table(listing_id uuid, code text, deal text, street text, district text, seller_id uuid, zalo_user_id text, ten text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select l.id, l.code, l.deal::text, l.street, l.district, s.id, s.zalo_user_id, s.name
    from listings l
    join sellers s on s.id = l.seller_id
   where l.status in ('dang_ban', 'dang_quan_tam')
     and l.source is distinct from 'seed_thu'
     and s.zalo_user_id is not null
     and not public.la_id_thu(s.zalo_user_id)
     and coalesce(l.xac_nhan_con_ban_at, l.chu_duyet_at, l.created_at) <= now() - make_interval(days => p_ngay)
     and not exists (select 1 from conversations c where c.seller_id = s.id and c.human_hold)
     and not exists (
       select 1 from reminders r
        where r.kind = 'con_ban' and r.listing_id = l.id and r.status in ('pending', 'sent')
          and r.created_at > now() - make_interval(days => p_ngay))
   order by s.id, coalesce(l.xac_nhan_con_ban_at, l.chu_duyet_at, l.created_at)
   limit p_limit
$function$;

revoke all on function public.tin_can_hoi_con_ban(integer, integer) from public, anon, authenticated;
grant execute on function public.tin_can_hoi_con_ban(integer, integer) to service_role;

insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('hoi_con_ban', '{Goi} ơi, {toi} hỏi thăm chút: {can} của {goi} hiện {con} không ạ? Còn thì {goi} nhắn {toi} một chữ "còn" là được, bán / cọc rồi thì báo {toi} cập nhật tin cho đúng nha.',
   '{Goi} ơi, {toi} hỏi thăm chút: {can} của {goi} hiện {con} không ạ? Còn thì {goi} nhắn {toi} một chữ "còn" là được, bán / cọc rồi thì báo {toi} cập nhật tin cho đúng nha.',
   'Tin rao quá 20 ngày chưa xác nhận — hỏi chủ nhà căn còn bán / còn cho thuê (lõi gửi, 8–20 giờ). {can} = các căn, {con} = "còn bán" / "còn cho thuê"',
   'SRS-5.1zzzzzzz295 · chủ dự án 29/10: hỏi lại sau 20 ngày', 40)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
