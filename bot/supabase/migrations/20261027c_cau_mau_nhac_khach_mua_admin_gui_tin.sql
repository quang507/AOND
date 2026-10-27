-- 20261027c_cau_mau_nhac_khach_mua_admin_gui_tin — Nối bốn lời hứa chưa nối (SRS-5.1zzzzzzz216, chủ dự án 27/10/2026: "sửa 1 … lõi
-- python tự gửi", "làm 4 đi trong này có 1 ô để admin gửi lại nữa"):
-- 1. Bốn câu mẫu cho nhắc `followup` / `sold` / `feedback` mà lõi Python nay gửi (từ 18/10 gỡ `nudge` không ai gửi chúng); câu bản vẽ bỏ
--    "để em xin bên dự án rồi gửi lại" (không có đường nào xin). Cùng cách 20261025c: dòng chưa ai sửa chuyển sang câu mới.
-- 2. Loại nhắc mới `admin_reply`: admin gõ ở ô gửi tin trên /admin/tin-nhan → `admin_gui_tin` xếp một dòng (chữ ở `note`), lõi gửi qua bridge
--    rồi ghi `messages` sender `human` và bot nhường sân 30 phút. KHÔNG ghi `noi_dung_gui` lúc xếp: escalation-feed cũng kéo dòng có cột đó.
-- 3. Phép soát 8 không đếm `admin_reply` (admin nói chuyện, không phải bot nhắn dồn). Thân hàm chép nguyên từ schema.sql, thêm một điều kiện.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('chua_co_ban_ve', 'Em CHƯA có bản vẽ/mặt bằng {can} ạ 😅. {Goi} có file bản vẽ thì gửi giúp em, em gắn vào tin ngay nhé! (Em không đụng gì tới rổ hàng đâu ạ.)', 'Em CHƯA có bản vẽ/mặt bằng {can} ạ 😅. {Goi} có file bản vẽ thì gửi giúp em, em gắn vào tin ngay nhé! (Em không đụng gì tới rổ hàng đâu ạ.)', 'Khách xin bản vẽ / mặt bằng mà chưa có. {can} = căn đang nói (vd "căn A12 (mẫu Fusion)"). 27/10 (SRS-216): bỏ "để em xin bên dự án rồi gửi lại" — không có đường nào xin; bản vẽ admin nạp vào kho dự án thì bot tự gửi như ảnh dự án', 'Bản vẽ · SRS-5.1zzzzzzz216', 30),
  ('bao_tra_loi_chu_nha', 'Chủ nhà căn {ma} vừa trả lời câu {goi} hỏi “{cau_hoi}”: {tra_loi}
{Goi} còn muốn hỏi thêm gì về căn này không ạ?', 'Chủ nhà căn {ma} vừa trả lời câu {goi} hỏi “{cau_hoi}”: {tra_loi}
{Goi} còn muốn hỏi thêm gì về căn này không ạ?', 'Chủ nhà / admin trả lời câu khách mua hỏi (nhắc `followup`). {ma} = mã căn, {cau_hoi} = câu khách hỏi, {tra_loi} = câu trả lời, {toi} = bot tự xưng — câu sửa phải giữ {tra_loi}', 'SRS-5.1zzzzzzz216', 41),
  ('bao_lich_da_chot', 'Lịch xem căn {ma} của {goi} đã được chốt: {gio}. Tới giờ {goi} ghé xem nhé, có gì thay đổi {goi} nhắn {toi} ạ.', 'Lịch xem căn {ma} của {goi} đã được chốt: {gio}. Tới giờ {goi} ghé xem nhé, có gì thay đổi {goi} nhắn {toi} ạ.', 'Admin chốt lịch xem (`#mã: ok giờ`) → báo khách mua (nhắc `followup` có viewing_id). {ma} = mã căn, {gio} = giờ đã chốt, {toi} = bot tự xưng — câu sửa phải giữ {gio}', 'SRS-5.1zzzzzzz216', 42),
  ('bao_can_da_ban', 'Căn {ma} {goi} quan tâm vừa có người chốt rồi ạ. {Goi} muốn {toi} tìm căn khác tương tự không ạ?', 'Căn {ma} {goi} quan tâm vừa có người chốt rồi ạ. {Goi} muốn {toi} tìm căn khác tương tự không ạ?', 'Căn khách mua đã quan tâm chuyển sang đã chốt (nhắc `sold`). {ma} = mã căn, {toi} = bot tự xưng', 'SRS-5.1zzzzzzz216', 43),
  ('hoi_cam_nhan_sau_xem', '{Goi} đi xem căn {ma} rồi thấy sao ạ? {Goi} kể {toi} nghe vài dòng để {toi} tìm tiếp cho đúng ý nhé.', '{Goi} đi xem căn {ma} rồi thấy sao ạ? {Goi} kể {toi} nghe vài dòng để {toi} tìm tiếp cho đúng ý nhé.', '4 giờ sau giờ hẹn xem nhà (nhắc `feedback`). {ma} = mã căn, {toi} = bot tự xưng', 'SRS-5.1zzzzzzz216', 44)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;

alter table public.reminders drop constraint if exists reminders_kind_check;
alter table public.reminders add constraint reminders_kind_check
  check (kind = any (array['promise', 'reengage', 'viewing', 'followup', 'escalation', 'report', 'match', 'feedback', 'sold', 'rating',
                           'admin_reply']));
comment on column public.reminders.kind is '[BOT & HÀNG ĐỢI] Loại nhắc. escalation / report: tin nội bộ, escalation-feed kéo → bridge. followup '
  '(chủ nhà / admin trả lời câu khách hỏi, admin chốt lịch xem) / sold (căn đã chốt) / feedback (hỏi cảm nhận sau xem) / admin_reply (admin gõ '
  'ở /admin/tin-nhan, chữ ở note): LÕI PYTHON gửi (gui_nhac.py, SRS-5.1zzzzzzz216). match: báo căn mới, lõi ghi sẵn status sent.';

create or replace function public.admin_gui_tin(p_conversation_id uuid, p_noi_dung text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_sid uuid; v_bid uuid; v_id uuid; v_chu text;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.la_admin()) then
    raise exception 'chỉ admin' using errcode = '42501';
  end if;
  v_chu := left(btrim(coalesce(p_noi_dung, '')), 2000);
  if v_chu = '' then
    raise exception 'tin rỗng' using errcode = '22023';
  end if;
  select seller_id, buyer_id into v_sid, v_bid from public.conversations where id = p_conversation_id;
  if v_sid is null and v_bid is null then
    raise exception 'hội thoại không có khách' using errcode = '22023';
  end if;
  insert into public.reminders (kind, seller_id, buyer_id, due_at, note, status)
  values ('admin_reply', v_sid, v_bid, now(), v_chu, 'pending')
  returning id into v_id;
  update public.conversations set human_touch_at = now() where id = p_conversation_id;
  return v_id;
end $$;
comment on function public.admin_gui_tin(uuid, text) is
  'Admin gửi một tin cho khách từ /admin/tin-nhan (SRS-5.1zzzzzzz216): xếp nhắc kind admin_reply (chữ ở note), lõi Python gửi qua bridge trong ~1 phút, ghi messages sender human, bot nhường sân 30 phút.';
revoke all on function public.admin_gui_tin(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_gui_tin(uuid, text) to authenticated;
grant execute on function public.admin_gui_tin(uuid, text) to service_role;

CREATE OR REPLACE FUNCTION public.soat_db_cong_khai()
 RETURNS TABLE(ma text, muc text, so integer, chi_tiet text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  -- ── 1. (gỡ 19/10/2026, 20261019f) Phép soát policy chặn khoá của bảng fact cũ — bảng và policy đã gỡ.


  -- ── 2. VIEW NÀO THIẾU CHẾ ĐỘ QUYỀN ───────────────────────────────────────
  -- `security_invoker` là thứ bắt view chạy bằng quyền NGƯỜI GỌI, tức RLS còn
  -- áp. Thiếu nó, view đọc xuyên RLS. Ba view từng khai `= on` (Postgres giữ
  -- nguyên văn) làm `xuat_schema()` in thiếu mệnh đề — bản phục hồi hạ cấp bảo
  -- mật đúng lúc cần nhất. Ở đây bắt CẢ HAI: thiếu hẳn, và viết khác chuẩn.
  -- Mức tuỳ CÓ CỔNG TRONG THÂN VIEW hay không: nhiều view admin tự chặn bằng
  -- `la_admin()` / `admins` ngay trong WHERE, thiếu security_invoker ở đó không
  -- phơi gì (NHE). Không có cổng nào thì đúng là đọc xuyên RLS (NANG).
  return query
  select 'view_thieu_quyen',
         case when bool_and(pg_get_viewdef(c.oid) ~ '(la_admin|admins)') then 'NHE' else 'NANG' end,
         count(*)::int,
         -- Dấu " (!)" = view KHÔNG có cổng admin trong thân, tức thiếu
         -- security_invoker là đọc xuyên RLS thật. Không có dấu = có cổng
         -- trong WHERE, thiếu thuộc tính vẫn không phơi gì.
         coalesce(string_agg(
           c.relname
             || coalesce(' (' || c.reloptions::text || ')', '')
             || case when pg_get_viewdef(c.oid) ~ '(la_admin|admins)' then '' else ' (!)' end,
           ', ' order by c.relname), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     -- `agents_public` cố ý là definer (đã khai `security_invoker=false`).
     and not (coalesce(c.reloptions::text[], '{}') @> array['security_invoker=false'])
     and not (coalesce(c.reloptions::text[], '{}') @> array['security_invoker=true'])
     -- CHỈ tính view mà `anon`/`authenticated` ĐỌC ĐƯỢC. Lượt chạy đầu báo 13
     -- view, gần hết là view nội bộ chỉ `service_role` mở được — thiếu
     -- `security_invoker` ở đó không phơi gì cho ai. Một cổng kêu 13 dòng mỗi
     -- lần chạy là một cổng sẽ bị bỏ qua.
     and (has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('authenticated', c.oid, 'SELECT'))
  having count(*) > 0;

  -- ── 3. HÀM NÀO TRÙNG CHỮ KÝ ──────────────────────────────────────────────
  -- `duyet_fact_du_an` có hai overload (2 và 3 tham số) vì migration thêm bản
  -- mới mà quên `drop` bản cũ. PostgREST gọi bằng 2 tham số → PGRST203
  -- "function is not unique" → nút duyệt ở /admin chết, hàng chờ đứng im.
  -- Overload là hợp lệ trong Postgres nhưng ĐỘC với PostgREST, nên soi ở đây.
  --
  -- Overload là HỢP LỆ trong Postgres — chỉ độc khi hai chữ ký cùng tên mà bộ
  -- TÊN THAM SỐ của cái này là TẬP CON của cái kia: lúc đó một lượt gọi bằng bộ
  -- tham số nhỏ khớp cả hai, PostgREST không chọn được. Lượt chạy đầu báo 5 hàm
  -- trùng tên, trong đó `next_listing_code`, `diem_tin`… là overload lành (khác
  -- kiểu, khác bộ tên) — báo cả 5 là dạy người đọc bỏ qua cổng này.
  return query
  with ham as (
    select p.oid, p.proname,
           coalesce((select array_agg(x order by x) from unnest(p.proargnames) x), '{}') as ten_ts
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  )
  select 'ham_trung_chu_ky', 'NANG', count(*)::int,
         coalesce(string_agg(distinct a.proname, ', ' order by a.proname), '')
    from ham a join ham b on a.proname = b.proname and a.oid <> b.oid
   where a.ten_ts <@ b.ten_ts
  having count(*) > 0;

  -- ── 4. BẢNG NÀO THIẾU KHOÁ CHÍNH ─────────────────────────────────────────
  -- `required_facts` mất PK khi `20260909h` đổi constraint thành hai index
  -- partial. Bảng không khoá chính là bảng cho phép hai dòng y hệt nhau —
  -- ở bảng danh mục câu hỏi thì đó là bot hỏi hai lần cùng một thứ.
  return query
  select 'bang_thieu_khoa_chinh', 'NANG', count(*)::int,
         coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'p')
  having count(*) > 0;

  -- ── 5. HÀM SECURITY DEFINER THIẾU `set search_path` ──────────────────────
  -- Định nghĩa của leo thang đặc quyền cổ điển: hàm chạy bằng quyền chủ sở hữu
  -- mà để người gọi tự đặt `search_path` là người gọi chọn được hàm nào sẽ chạy.
  -- Hôm nay 0 lỗ; phép soát này giữ cho nó ở 0.
  return query
  select 'definer_thieu_search_path', 'NANG', count(*)::int,
         coalesce(string_agg(p.proname, ', ' order by p.proname), '')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search\_path=%')
  having count(*) > 0;

  -- ── 6. BẢNG BẬT RLS MÀ KHÔNG CÓ POLICY NÀO ───────────────────────────────
  -- Không policy = không ai vào (trừ service_role). Với bảng nội bộ đó là CHỦ
  -- ĐÍCH; với bảng web phải đọc thì đó là trang trắng không rõ nguyên nhân —
  -- đúng sự cố /moi-gioi 27/08 → 04/09. Mức NHẸ: liệt kê để người đọc quyết.
  return query
  select 'rls_bat_khong_policy', 'NHE', count(*)::int,
         coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
     -- Bảng nội bộ bật RLS mà không policy là CHỦ ĐÍCH (không ai vào trừ
     -- service_role) — lượt chạy đầu báo 11 bảng loại đó. Chỉ đáng kêu khi web
     -- ĐÃ ĐƯỢC CẤP quyền đọc mà RLS lại chặn sạch: đúng hình sự cố /moi-gioi
     -- trắng trang 27/08 → 04/09, và nó câm chứ không báo lỗi.
     and (has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('authenticated', c.oid, 'SELECT'))
  having count(*) > 0;

  -- ── 7. TRIGGER BEFORE CHẠY SAI THỨ TỰ ────────────────────────────────────
  -- Postgres bắn BEFORE-row trigger theo THỨ TỰ CHỮ CÁI của tên. `fill_code`
  -- từng chạy trước `fill_property_type` nên mã tin đọc `property_type` lúc nó
  -- còn `chua_ro` → 100% tin từ chat mang tiền tố NP. Quy ước của dự án là ép
  -- thứ tự bằng tên (`trg_y_`, `trg_z_`, `trg_zz_`); phép soát canh đúng cặp đã
  -- từng gãy, để nó không gãy lại lần nữa sau một lượt đổi tên.
  return query
  select 'trigger_sai_thu_tu', 'NANG', 1,
         'trg_listings_zz_fill_code phải chạy SAU trg_listings_fill_property_type'
   where (select t.tgname from pg_trigger t
           where t.tgrelid = 'public.listings'::regclass and not t.tgisinternal
             and t.tgname like '%fill_code%' limit 1)
         < (select t.tgname from pg_trigger t
             where t.tgrelid = 'public.listings'::regclass and not t.tgisinternal
               and t.tgname like '%fill_property_type%' limit 1);

  -- ── 8. AI NHẬN QUÁ HAI TIN CHỦ ĐỘNG MỘT NGÀY ─────────────────────────────
  -- Đây là phép soát NGHIỆP VỤ duy nhất trong tám cái, và là cái đắt nhất nếu
  -- sai: bot nhắn dồn là khách chặn OA, mất luôn đường liên lạc. Trần thiết kế
  -- là 2 tin chủ động/người/ngày (FR-130 nhịp nhắn giống người).
  --
  -- KHÔNG trả Zalo ID trần, KHÔNG trả nội dung tin — chỉ trả 4 số cuối và số
  -- đếm. Hàm này mở cho `anon` nên chính chỗ này là chỗ dễ biến một cổng kiểm
  -- thành một lỗ rò.
  return query
  -- 23/10/2026 (SRS-5.1zzzzzzz156): dòng `escalation` đi tới chủ nhà / CTV / admin (escalation-feed), KHÔNG tới người mua — `buyer_id` ở đó
  -- chỉ nói việc về khách nào. Đếm nó vào người mua làm lịch hẹn xem thật (2 việc báo admin + 1 tin báo căn mới) hiện thành "3 tin" oan.
  -- 27/10/2026 (SRS-5.1zzzzzzz214 mục 7): tin NỘI BỘ (note mở bằng 🙋 ⭐ 🩺 ❓ 😟… — cùng luật `laTinNoiBo` của bridge: chữ đầu không phải chữ /
  -- số, không phải 💬) KHÔNG BAO GIỜ tới chủ nhà dù dòng gắn `seller_id` (escalation-feed, 01/10/2026) — nó đi CTV / admin. Đếm nó vào chủ nhà
  -- làm 15 tin 🙋 về admin (lỗi lặp cổng phường, đã sửa ở lõi) hiện thành "chủ nhà …8895 nhận 16 tin" oan. Tin tới admin có chỗ đếm riêng? Chưa —
  -- admin là người nhà, không phải khách bị nhắn dồn.
  with gui as (
    select coalesce(s.zalo_user_id, case when r.kind <> 'escalation' then b.zalo_user_id end) as uid, count(*) as so_tin
      from reminders r
      left join sellers s on s.id = r.seller_id
      left join buyers  b on b.id = r.buyer_id
     where r.status = 'sent' and r.sent_at > now() - interval '24 hours'
       and coalesce(s.zalo_user_id, case when r.kind <> 'escalation' then b.zalo_user_id end) is not null
       and not (coalesce(btrim(r.note), '') <> '' and btrim(r.note) not like '💬%' and left(btrim(r.note), 1) !~ '[[:alnum:]]')
       -- 27/10/2026 (SRS-5.1zzzzzzz216): `admin_reply` là admin NÓI CHUYỆN với khách qua ô gửi ở /admin/tin-nhan (lõi gửi hộ), không phải
       -- tin chủ động của bot — admin trả lời ba câu trong một ngày không phải "nhắn dồn".
       and r.kind <> 'admin_reply'
     group by 1 having count(*) > 2
  )
  select 'gui_qua_hai_tin_mot_ngay', 'NANG', count(*)::int,
         coalesce(string_agg('…' || right(uid, 4) || ': ' || so_tin || ' tin', ', ' order by so_tin desc), '')
    from gui
  having count(*) > 0;
end $function$

;
