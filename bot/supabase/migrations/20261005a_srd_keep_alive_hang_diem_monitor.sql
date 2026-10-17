-- 05/10/2026 — Đối chiếu SRD Aioinhadat (`AOND req + chat examples`, chưng cất ở docs/06 §6.8) với hệ thống; chủ dự án: "thôi làm
-- cho giống luôn", trừ nút bấm (chờ OA), và hai chỗ CHỈ GHI DB không nhắn ai (điểm phản hồi, chuẩn NMG). docs/07 SRS-5.1zzc…zzg.
--
--   1. Keep-alive người bán theo SRD §VI: im > 5 ngày (không phải 6), mỗi người mỗi ngày hỏi NGẪU NHIÊN 1–2 căn đang rao, một
--      lượt chủ động cho CẢ tài khoản (trả lời 1 căn = gia hạn 7 ngày Zalo cho mọi căn); câu "còn bán không" GHI VÀO SỔ HỘI
--      THOẠI để lượt AI kế đọc đúng câu bot vừa hỏi (trước đây reminders → bridge gửi mà `messages` không có, AI không biết
--      bot đã hỏi gì). Đường TRẢ LỜI sửa ở chat-reply (SRS-5.1zzc).
--   2. Điểm người rao theo SRD §IV: 50% độ hoàn chỉnh dữ liệu + 50% độ KỊP THỜI phản hồi (`diem_phan_hoi`: đo thời gian chủ
--      nhà trả lời sau tin bot trong 90 ngày, theo `messages`). Chỉ GHI (view), không nhắn "điểm giảm còn X".
--   3. Hạng theo ĐIỂM (OPEN-26 chốt theo SRD): Đồng < 50 · Bạc 50–79 · Vàng ≥ 80 — `hang_theo_diem`; `seller_ranks` /
--      `so.nguoi_ban` đổi theo. `agents_public` (view công khai, hạng ẩn khỏi web) giữ hàm cũ vì anon không gọi được điểm.
--   4. Chuẩn NMG (SRD §V): ≥ 10 BĐS đang rao và tỷ lệ chốt ≥ 5% trong 6 tháng — `chuan_nmg`, cột `dat_chuan_nmg` trên view.
--      Chỉ ghi, không báo NMG.
--   5. Đặc quyền hạng (SRD §IV.3): Đồng tối đa 5 căn (`con_duoc_rao`, chat-reply hỏi trước khi mở tin); Vàng NMG được ưu tiên
--      khi ghép khách nét (`hang_cua_nguoi_ban`, chat-reply xếp kho); CCRB Vàng lên kệ → đẩy rổ tới ≤ 20 NMG lõi
--      (`day_ro_ccrb_toi_nmg`, trigger khi tin sang dang_ban).
--   6. Live Chat Monitor ba nhãn (SRD §VII): view `hoi_thoai_nhan` — NEED_HUMAN · WAITING_HINT · AI_HANDLING, /admin đọc.

-- ─── 1. Keep-alive người bán theo SRD §VI ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.seller_keep_alive_tick() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  s record; r record; n int := 0; v_so int; v_cv uuid; v_note text; v_ten text; v_goi text;
begin
  for s in
    select se.id, se.zalo_user_id, se.xung_ho
      from sellers se
     where se.zalo_user_id is not null
       and exists (select 1 from listings l where l.seller_id = se.id and l.status in ('dang_ban', 'dang_quan_tam'))
       -- chủ nhà im > 5 ngày (tin cuối do chủ nhắn; chưa nhắn gì thì lấy ngày mở tin đầu)
       and coalesce((select max(m.created_at) from messages m join conversations c on c.id = m.conversation_id
                      where c.seller_id = se.id and m.sender = 'seller'),
                    (select min(l.created_at) from listings l where l.seller_id = se.id)) < now() - interval '5 days'
       -- một lượt chủ động cho CẢ tài khoản trong 5 ngày (hỏi bù hay keep-alive của bất kỳ căn nào)
       and not exists (select 1 from info_requests q join listings l on l.id = q.listing_id
                        where l.seller_id = se.id and q.source = 'seller_flow' and q.created_at > now() - interval '5 days')
       and not exists (select 1 from info_requests q join listings l on l.id = q.listing_id
                        where l.seller_id = se.id and q.status = 'pending')
     order by se.id
     limit 20
  loop
    v_so := 1 + floor(random() * 2)::int;   -- SRD §VI: "mỗi ngày chỉ hỏi ngẫu nhiên 1–2 căn trong rổ hàng"
    v_goi := coalesce(nullif(btrim(s.xung_ho), ''), 'anh/chị');
    for r in
      select l.id, l.code, l.seller_id, l.deal, l.location_raw, l.ward
        from listings l
       where l.seller_id = s.id and l.status in ('dang_ban', 'dang_quan_tam')
       order by random()
       limit v_so
    loop
      if exists (select 1 from listing_missing_facts m where m.listing_id = r.id
                  and not exists (select 1 from info_requests q where q.listing_id = r.id and q.question = m.fact_key and q.status = 'expired')) then
        -- còn thứ để hỏi (chưa bị né) → xin bổ sung 1 thông tin (ask-seller drip; SRD §VI 2.1–2.3)
        perform ask_seller_drip(r.id);
      else
        -- dữ liệu đủ → xác thực trạng thái (SRD §VI 2.4)
        insert into info_requests (listing_id, question, status, source) values (r.id, 'con_ban', 'pending', 'seller_flow');
        v_ten := coalesce(nullif(btrim(coalesce(r.location_raw, '')), ''), nullif(btrim(coalesce(r.ward, '')), ''), '#' || coalesce(r.code, '?'));
        v_note := 'Dạ ' || v_goi || ' ơi, căn ' || v_ten || ' của mình hiện còn ' ||
                  case when r.deal::text = 'cho_thue' then 'cho thuê' else 'bán' end ||
                  ' không ạ? Còn thì ' || v_goi || ' nhắn em một chữ "còn" để em giữ tin, có khách hỏi em báo liền nha.';
        -- "💬 " = câu soạn sẵn cho chủ nhà, bridge gửi nguyên văn (_shared/tin_nhac.ts)
        insert into reminders (kind, listing_id, seller_id, due_at, note) values ('escalation', r.id, r.seller_id, now(), '💬 ' || v_note);
        -- vào sổ hội thoại: lượt AI kế (doc-y-luot) đọc "câu bot vừa nói" từ messages — không có dòng này thì AI không biết bot
        -- đã hỏi còn bán không, "còn em" chỉ là hai chữ lạc.
        select c_id into v_cv from public.ensure_seller_conversation(r.seller_id, 'zalo_personal');
        if v_cv is not null then
          insert into messages (conversation_id, sender, body) values (v_cv, 'bot', v_note);
        end if;
      end if;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
comment on function public.seller_keep_alive_tick() is
  'SRD §VI (05/10/2026, SRS-5.1zzc; thay FR-191 6 ngày): chủ nhà có tin đang rao mà im > 5 ngày → mỗi NGƯỜI một lượt / 5 ngày, ngẫu nhiên 1–2 căn: còn thứ chưa hỏi → ask-seller drip; đủ dữ liệu → "còn bán không" (💬 nguyên văn, ghi cả vào messages). Cron seller-keep-alive-tick 02:30 UTC.';

-- ─── 2. Điểm phản hồi kịp thời (SRD §IV.1) ────────────────────────────────────────────────────────────────────────────────
-- Đo theo `messages`: mỗi LƯỢT bot nhắn chủ nhà (bong bóng cuối của lượt) → chủ nhà trả lời sau bao lâu. ≤ 1 giờ 100 · ≤ 12 giờ
-- 80 · ≤ 24 giờ 60 · ≤ 3 ngày 30 · lâu hơn / không trả lời (lượt bot kế đã tới hoặc quá 7 ngày) 0. Trung bình 90 ngày gần nhất.
-- Không đo bằng info_requests vì `expired` còn dùng cho câu bot TỰ thôi hỏi (FR-233) — phạt nhầm người có trả lời.
create or replace function public.diem_phan_hoi(p_seller_id uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with tin as (
    select m.created_at, m.sender,
           lead(m.sender)     over (partition by m.conversation_id order by m.created_at, m.seq) as sender_ke,
           lead(m.created_at) over (partition by m.conversation_id order by m.created_at, m.seq) as luc_ke
      from messages m
      join conversations c on c.id = m.conversation_id
     where c.seller_id = p_seller_id
       and m.created_at >= now() - interval '90 days'
  ),
  luot as (
    -- bong bóng cuối của một lượt bot: tin kế không phải của bot (hoặc không có tin kế)
    select created_at,
           case when sender_ke = 'seller' then extract(epoch from luc_ke - created_at) / 3600.0 end as gio_tra_loi
      from tin
     where sender = 'bot' and (sender_ke is distinct from 'bot')
       -- lượt bot mới nhất mà chưa quá 7 ngày và chưa ai trả lời: chưa kết luận, không tính
       and not (sender_ke is null and created_at > now() - interval '7 days')
  ),
  diem as (
    select case
             when gio_tra_loi is null then 0
             when gio_tra_loi <= 1   then 100
             when gio_tra_loi <= 12  then 80
             when gio_tra_loi <= 24  then 60
             when gio_tra_loi <= 72  then 30
             else 0 end as d,
           gio_tra_loi
      from luot
  )
  select case when count(*) = 0 then jsonb_build_object('diem', null, 'so_luot', 0, 'tb_gio', null)
              else jsonb_build_object('diem', round(avg(d))::int, 'so_luot', count(*),
                                      'tb_gio', round(avg(gio_tra_loi)::numeric, 1)) end
    from diem;
$$;
revoke all on function public.diem_phan_hoi(uuid) from public, anon, authenticated;
grant execute on function public.diem_phan_hoi(uuid) to service_role;
comment on function public.diem_phan_hoi(uuid) is
  'SRD §IV.1 (05/10/2026, SRS-5.1zzd): độ KỊP THỜI phản hồi của người bán 0–100, đo theo messages 90 ngày (lượt bot → chủ trả lời sau bao lâu). {diem, so_luot, tb_gio}; diem null = chưa có lượt nào để đo. Chỉ ghi, không nhắn.';

-- Điểm người rao = (50% hoàn chỉnh + 50% kịp thời) × hệ số quy mô NMG; chưa đo được kịp thời thì 100% hoàn chỉnh (như FR-183).
create or replace function public.diem_nguoi_ban(p_seller_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_type seller_type;
  v_tb numeric;
  v_n int;
  v_he_so numeric := 1;
  v_ph jsonb;
  v_ph_diem int;
  v_goc numeric;
  v_diem int;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  select seller_type into v_type from sellers where id = p_seller_id;
  if v_type is null then return null; end if;
  select avg((public.diem_tin(l)->>'diem')::numeric), count(*)
    into v_tb, v_n
    from listings l
   where l.seller_id = p_seller_id and l.status in ('dang_ban', 'dang_quan_tam', 'cho_thong_tin');
  if coalesce(v_n, 0) = 0 then
    return jsonb_build_object('diem', 0, 'diem_tb', 0, 'so_tin', 0, 'he_so', 1, 'diem_phan_hoi', null, 'so_luot_phan_hoi', 0);
  end if;
  if v_type = 'nmg' then
    v_he_so := 1 + 0.06 * least(v_n, 10)
                 + 0.04 * greatest(least(v_n, 30) - 10, 0)
                 + 0.015 * greatest(v_n - 30, 0);
  end if;
  v_ph := public.diem_phan_hoi(p_seller_id);
  v_ph_diem := (v_ph->>'diem')::int;
  v_goc := case when v_ph_diem is null then v_tb else 0.5 * v_tb + 0.5 * v_ph_diem end;
  v_diem := least(100, round(v_goc * v_he_so))::int;
  return jsonb_build_object('diem', v_diem, 'diem_tb', round(v_tb, 1), 'so_tin', v_n, 'he_so', round(v_he_so, 3),
                            'diem_phan_hoi', v_ph_diem, 'so_luot_phan_hoi', coalesce((v_ph->>'so_luot')::int, 0));
end $$;
comment on function public.diem_nguoi_ban(uuid) is
  'FR-183 + SRD §IV.1 (05/10/2026, SRS-5.1zzd): điểm người rao 0–100 = (50% trung bình diem_tin các tin đang rao + 50% diem_phan_hoi) × hệ số quy mô NMG; chưa đo được phản hồi thì 100% hoàn chỉnh. Trả {diem, diem_tb, so_tin, he_so, diem_phan_hoi, so_luot_phan_hoi}. Chỉ service_role/admin.';

-- ─── 3. Hạng theo điểm (SRD §IV.3, chốt OPEN-26) ──────────────────────────────────────────────────────────────────────────
create or replace function public.hang_theo_diem(p_diem integer) returns text
language sql immutable set search_path to 'public' as $$
  select case when coalesce(p_diem, 0) >= 80 then 'vang' when coalesce(p_diem, 0) >= 50 then 'bac' else 'dong' end;
$$;
grant execute on function public.hang_theo_diem(integer) to anon, authenticated, service_role;
comment on function public.hang_theo_diem(integer) is 'SRD §IV.3 (05/10/2026, OPEN-26 chốt): Đồng < 50 · Bạc 50–79 · Vàng ≥ 80 theo điểm người rao.';

-- ─── 4. Chuẩn NMG (SRD §V) — chỉ ghi, không báo ──────────────────────────────────────────────────────────────────────────
create or replace function public.chuan_nmg(p_seller_id uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with t as (
    select count(*) filter (where l.status in ('dang_ban', 'dang_quan_tam'))                                   as dang_rao,
           count(*) filter (where l.status = 'da_chot' and coalesce(l.chu_noi_du_at, l.updated_at) >= now() - interval '6 months') as chot_6t,
           count(*) filter (where l.created_at >= now() - interval '6 months' or l.status in ('dang_ban', 'dang_quan_tam', 'cho_thong_tin')) as tong_6t
      from listings l where l.seller_id = p_seller_id
  )
  select jsonb_build_object(
           'dang_rao', dang_rao, 'chot_6_thang', chot_6t, 'tong_6_thang', tong_6t,
           'ty_le_chot', case when tong_6t > 0 then round(100.0 * chot_6t / tong_6t, 1) else 0 end,
           'dat_chuan', dang_rao >= 10 and tong_6t > 0 and chot_6t::numeric / tong_6t >= 0.05)
    from t;
$$;
revoke all on function public.chuan_nmg(uuid) from public, anon, authenticated;
grant execute on function public.chuan_nmg(uuid) to service_role;
comment on function public.chuan_nmg(uuid) is
  'SRD §V (05/10/2026, SRS-5.1zze): NMG phải duy trì ≥ 10 BĐS đang rao và tỷ lệ chốt ≥ 5% / 6 tháng. {dang_rao, chot_6_thang, tong_6_thang, ty_le_chot, dat_chuan}. Chỉ ghi vào view, KHÔNG nhắn NMG (chủ dự án 05/10).';

-- `create or replace view` không cho chèn cột giữa danh sách cũ → drop rồi tạo lại, cấp quyền lại ngay bên dưới (view mới ở
-- project này mặc định LỘ cho anon/authenticated — CLAUDE.md §6).
drop view if exists public.seller_ranks;
create view public.seller_ranks with (security_invoker = true) as
 select s.id,
    s.name,
    s.seller_type,
    coalesce(c.active, 0::bigint)::integer as active_count,
    coalesce(c.closed, 0::bigint)::integer as closed_count,
    coalesce(c.total, 0::bigint)::integer as total_count,
    public.hang_theo_diem((d.j ->> 'diem')::integer) as rank,
    (d.j ->> 'diem')::integer as diem_nguoi_rao,
    (d.j ->> 'diem_tb')::numeric as diem_hoan_chinh,
    (d.j ->> 'diem_phan_hoi')::integer as diem_phan_hoi,
    (d.j ->> 'so_luot_phan_hoi')::integer as so_luot_phan_hoi,
    case when s.seller_type = 'nmg' then ((public.chuan_nmg(s.id)) ->> 'dat_chuan')::boolean end as dat_chuan_nmg,
    s.ten_tro_ly
   from sellers s
     left join lateral ( select count(*) filter (where l.status = any (array['dang_ban'::text, 'dang_quan_tam'::text])) as active,
            count(*) filter (where l.status = 'da_chot'::text) as closed,
            count(*) as total
           from listings l
          where l.seller_id = s.id) c on true
     left join lateral ( select public.diem_nguoi_ban(s.id) as j ) d on true;
revoke all on public.seller_ranks from anon, authenticated;
grant select on public.seller_ranks to authenticated, service_role;
comment on view public.seller_ranks is
  '[NGƯỜI & HỘI THOẠI] Hạng người rao THEO ĐIỂM (SRD §IV.3, 05/10/2026): Đồng < 50 · Bạc 50–79 · Vàng ≥ 80; điểm = 50% hoàn chỉnh + 50% phản hồi × hệ số NMG. dat_chuan_nmg (SRD §V) chỉ với NMG. Chỉ admin/service_role đọc được (diem_nguoi_ban chặn anon). Hạng ẩn khỏi web (OPEN-26).';

drop view if exists so.nguoi_ban;
create view so.nguoi_ban with (security_invoker = true) as
select
  s.name                                                  as ten,
  s.phone                                                 as so_dien_thoai,
  s.phone_proxy                                           as sdt_proxy,
  case s.seller_type::text when 'nmg' then 'NMG (môi giới)' else 'CCRB (chính chủ)' end
                                                          as vai,
  s.ten_tro_ly                                            as tro_ly,
  count(l.id)                                             as so_tin,
  count(l.id) filter (where l.status in ('dang_ban', 'dang_quan_tam'))
                                                          as dang_ban,
  count(l.id) filter (where l.status = 'da_chot')         as da_chot,
  (public.diem_nguoi_ban(s.id)->>'diem')::int             as diem_nguoi_rao,
  (public.diem_nguoi_ban(s.id)->>'diem_phan_hoi')::int    as diem_phan_hoi,
  case public.hang_theo_diem((public.diem_nguoi_ban(s.id)->>'diem')::int)
       when 'vang' then 'Vàng' when 'bac' then 'Bạc' else 'Đồng' end
                                                          as hang,
  case when s.seller_type = 'nmg'
       then (public.chuan_nmg(s.id)->>'dat_chuan')::boolean end
                                                          as dat_chuan_nmg,
  case when s.rating_count > 0
       then round(s.rating_sum::numeric / s.rating_count, 1) end
                                                          as diem,
  s.zalo_user_id is not null                              as co_zalo,
  s.created_at::date                                      as ngay_tao,
  s.id
from public.sellers s
left join public.listings l on l.seller_id = s.id
group by s.id
order by so_tin desc, s.name;
revoke all on so.nguoi_ban from anon, authenticated;
grant select on so.nguoi_ban to postgres, service_role;
comment on view so.nguoi_ban is
  '[SỔ] Mỗi người bán một dòng: vai, trợ lý (FR-181), số tin, điểm người rao (FR-183 + SRD §IV.1: 50% hoàn chỉnh + 50% phản hồi), hạng theo điểm (SRD §IV.3), đạt chuẩn NMG (SRD §V). SĐT thật, chỉ postgres/service_role đọc.';

-- ─── 5. Đặc quyền hạng (SRD §IV.3) ────────────────────────────────────────────────────────────────────────────────────────
-- (a) Đồng: tối đa 5 căn. chat-reply hỏi TRƯỚC khi mở tin; đủ trần thì nói thật và bày cách lên hạng, không mở tin.
create or replace function public.con_duoc_rao(p_seller_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare v_hang text; v_so int; v_diem int;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  select count(*) into v_so from listings l
   where l.seller_id = p_seller_id and l.status in ('cho_thong_tin', 'dang_ban', 'dang_quan_tam');
  v_diem := (public.diem_nguoi_ban(p_seller_id)->>'diem')::int;
  v_hang := public.hang_theo_diem(v_diem);
  return jsonb_build_object('duoc', not (v_hang = 'dong' and v_so >= 5), 'hang', v_hang, 'so_dang_rao', v_so, 'tran', case when v_hang = 'dong' then 5 end, 'diem', v_diem);
end $$;
revoke all on function public.con_duoc_rao(uuid) from public, anon, authenticated;
grant execute on function public.con_duoc_rao(uuid) to service_role;
comment on function public.con_duoc_rao(uuid) is
  'SRD §IV.3 (05/10/2026, SRS-5.1zzf): hạng Đồng tối đa 5 căn (cho_thong_tin + dang_ban + dang_quan_tam). {duoc, hang, so_dang_rao, tran, diem}. chat-reply gọi trước khi mở tin mới.';

-- (b) Vàng NMG ưu tiên khách nét: chat-reply xếp kho — hàm trả hạng của một nhóm người bán trong MỘT lượt gọi.
create or replace function public.hang_cua_nguoi_ban(p_ids uuid[]) returns table(seller_id uuid, hang text, diem integer)
language sql stable security definer set search_path to 'public' as $$
  select s.id, public.hang_theo_diem((public.diem_nguoi_ban(s.id)->>'diem')::int), (public.diem_nguoi_ban(s.id)->>'diem')::int
    from sellers s where s.id = any(p_ids);
$$;
revoke all on function public.hang_cua_nguoi_ban(uuid[]) from public, anon, authenticated;
grant execute on function public.hang_cua_nguoi_ban(uuid[]) to service_role;
comment on function public.hang_cua_nguoi_ban(uuid[]) is
  'SRD §IV.3 (05/10/2026, SRS-5.1zzf): hạng + điểm của một nhóm người bán, chat-reply dùng xếp tin của NMG Vàng lên đầu kho khi khách mua đã nét (đủ khu vực + ngân sách).';

-- (c) CCRB Vàng lên kệ → đẩy rổ tới ≤ 20 NMG lõi (NMG có Zalo, xếp theo hạng Vàng → điểm → đang hoạt động), mỗi NMG tối đa 1
--     tin đẩy rổ / ngày (soat_db đếm "quá 2 tin chủ động một ngày").
create or replace function public.day_ro_ccrb_toi_nmg(p_listing_id uuid) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare l record; v_hang text; v_note text; v_n int := 0;
begin
  select li.id, li.code, li.seller_id, li.deal::text as deal, li.location_raw, li.ward, li.district, li.price_raw, li.area_m2, li.property_type,
         s.seller_type
    into l
    from listings li join sellers s on s.id = li.seller_id
   where li.id = p_listing_id;
  if l.id is null or l.seller_type <> 'ccrb' then return 0; end if;
  v_hang := public.hang_theo_diem((public.diem_nguoi_ban(l.seller_id)->>'diem')::int);
  if v_hang <> 'vang' then return 0; end if;
  v_note := '💬 Căn chính chủ mới lên kệ: ' ||
            coalesce(nullif(btrim(coalesce(l.location_raw, '')), '') || ', ', '') || coalesce(l.ward, '') || coalesce(', ' || l.district, '') ||
            coalesce(' · ' || l.price_raw, '') ||
            coalesce(' · ' || rtrim(to_char(l.area_m2, 'FM9999999990.99'), '.') || 'm2', '') ||
            case when l.deal = 'cho_thue' then ' (cho thuê)' else '' end ||
            '. Anh/chị có khách phù hợp nhắn em một tiếng, em nối với chủ nhà ạ.';
  insert into reminders (kind, listing_id, seller_id, due_at, note)
  select 'escalation', l.id, n.id, now(), v_note
    from (
      select s.id, public.hang_theo_diem((public.diem_nguoi_ban(s.id)->>'diem')::int) as hang,
             (public.diem_nguoi_ban(s.id)->>'diem')::int as diem,
             coalesce(h.hoat_dong, false) as hoat_dong
        from sellers s
        left join nmg_hoat_dong h on h.id = s.id
       where s.seller_type = 'nmg' and s.zalo_user_id is not null and s.id <> l.seller_id
    ) n
   where not exists (select 1 from reminders r where r.listing_id = l.id and r.seller_id = n.id and r.note like '💬 Căn chính chủ mới lên kệ%')
     and not exists (select 1 from reminders r where r.seller_id = n.id and r.note like '💬 Căn chính chủ mới lên kệ%'
                      and r.created_at > now() - interval '24 hours')
   order by (n.hang = 'vang') desc, n.hoat_dong desc, n.diem desc nulls last
   limit 20;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.day_ro_ccrb_toi_nmg(uuid) from public, anon, authenticated;
grant execute on function public.day_ro_ccrb_toi_nmg(uuid) to service_role;
comment on function public.day_ro_ccrb_toi_nmg(uuid) is
  'SRD §IV.3 (05/10/2026, SRS-5.1zzf): CCRB hạng Vàng có tin lên kệ → xếp tin "💬 Căn chính chủ mới lên kệ…" cho ≤ 20 NMG lõi (có Zalo; Vàng → đang hoạt động → điểm), mỗi NMG ≤ 1 tin/ngày. Bridge gửi nguyên văn.';

create or replace function public.trg_listings_day_ro_ccrb() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'dang_ban' and coalesce(old.status, '') <> 'dang_ban' then
    perform public.day_ro_ccrb_toi_nmg(new.id);
  end if;
  return new;
end $$;
drop trigger if exists trg_listings_day_ro_ccrb on public.listings;
create trigger trg_listings_day_ro_ccrb after update of status on public.listings
  for each row execute function public.trg_listings_day_ro_ccrb();
comment on function public.trg_listings_day_ro_ccrb() is 'SRD §IV.3: tin sang dang_ban → day_ro_ccrb_toi_nmg (chỉ CCRB Vàng mới đẩy; hàm tự kiểm).';

-- ─── 6. Live Chat Monitor ba nhãn (SRD §VII) ───────────────────────────────────────────────────────────────────────────────
-- NEED_HUMAN: cờ cần người thật chưa ai chạm, hoặc người thật đang giữ (human_hold).
-- WAITING_HINT: bot đang CHỜ người — khách hỏi mà câu đang treo chờ chủ nhà/CTV, hoặc tin cuối của khách quá 10 phút chưa có
--               tin bot nào sau đó (bot bí / lỗi).
-- AI_HANDLING: còn lại.
create or replace view public.hoi_thoai_nhan with (security_invoker = true) as
 select c.id as conversation_id,
        case
          when c.human_hold or (c.needs_human and (c.human_touch_at is null or c.human_touch_at < c.needs_human_at)) then 'NEED_HUMAN'
          when exists (select 1 from info_requests q where q.buyer_id = c.buyer_id and c.buyer_id is not null and q.status = 'pending')
            or (m.sender in ('buyer', 'seller') and m.created_at < now() - interval '10 minutes') then 'WAITING_HINT'
          else 'AI_HANDLING'
        end as nhan,
        case
          when c.human_hold then 'người thật đang giữ khách'
          when c.needs_human and (c.human_touch_at is null or c.human_touch_at < c.needs_human_at) then 'bot xin người thật'
          when exists (select 1 from info_requests q where q.buyer_id = c.buyer_id and c.buyer_id is not null and q.status = 'pending') then 'khách hỏi, đang chờ chủ nhà/CTV trả lời'
          when m.sender in ('buyer', 'seller') and m.created_at < now() - interval '10 minutes' then 'khách nhắn > 10 phút chưa có tin bot'
          else null
        end as ly_do,
        m.created_at as tin_cuoi_at,
        m.sender::text as tin_cuoi_cua
   from conversations c
   left join lateral (select m1.sender, m1.created_at from messages m1 where m1.conversation_id = c.id order by m1.created_at desc, m1.seq desc limit 1) m on true
  where auth.role() = 'service_role' or (exists (select 1 from admins a where a.email = ((select auth.jwt()) ->> 'email')));
revoke all on public.hoi_thoai_nhan from anon, authenticated;
grant select on public.hoi_thoai_nhan to authenticated, service_role;
comment on view public.hoi_thoai_nhan is
  '[NGƯỜI & HỘI THOẠI] SRD §VII Live Chat Monitor (05/10/2026, SRS-5.1zzg): mỗi hội thoại một nhãn NEED_HUMAN · WAITING_HINT · AI_HANDLING + lý do; /admin/tin-nhan hiện và lọc. security_invoker (RLS bảng gốc) + cổng admin trong WHERE; grant authenticated để admin đăng nhập đọc.';
