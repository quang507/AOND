-- FR-163 · Toàn vẹn dữ liệu: chặn dữ liệu mâu thuẫn/vô lý ở TẦNG DB.
--
-- NGUỒN SỰ THẬT (source of truth) — chốt theo kiến trúc sẵn có, không vẽ lại:
--   * `listings`      = giá trị HIỆN HÀNH của các trường tìm kiếm/hiển thị
--                       (price_vnd, area_m2, bedrooms, floor, direction,
--                       property_type, ward, status).
--   * `listing_facts` = BẰNG CHỨNG hội thoại, append-only, đã có provenance
--                       (source + created_at). Không bao giờ sửa/xoá fact để
--                       "đồng bộ" — fact là lịch sử.
--   * price_raw (lời người rao) → price_vnd (DẪN XUẤT qua parse_vnd). Không
--     đường nào được ghi price_vnd lệch khỏi price_raw.
--   * inbound_events / inbound_ledger / messages / sent_at: bốn danh tính
--     đã tách ở 20260827m/n — không đụng lại.
--
-- Kiểm dữ liệu 28/08/2026 TRƯỚC khi thêm ràng buộc: 0 mâu thuẫn price,
-- 0 deals trùng cặp, 0 conversation sai vai, 0 người có 2 hội thoại cùng vai,
-- viewings đang rỗng — mọi ràng buộc dưới đây thêm được không cần sửa dữ liệu.
-- Backfill vẫn viết idempotent để migration chạy an toàn trên môi trường khác.

-- ─────────────────────────────────────────────────────────────────────────────
-- (0) PROVENANCE loại BĐS — cột phải có TRƯỚC vì (1) tham chiếu nó.
-- Suy đoán regex KHÔNG được coi ngang bằng xác nhận. Một cột duy nhất:
--   'suy_doan'     = trg_listings_fill_property_type đoán từ câu rao (FR-150)
--   'chu_xac_nhan' = chủ nhà trả lời câu loai_bds (qua sync ở (1))
--   'admin'        = admin chọn tay trong form đăng tin
-- fill_property_type vốn CHỈ điền khi null/chua_ro nên không bao giờ đè giá
-- trị đã xác nhận — không phải sửa nó, chỉ cần cột ghi lại ai nói.
alter table public.listings
  add column property_type_source text not null default 'suy_doan'
  check (property_type_source in ('suy_doan', 'chu_xac_nhan', 'admin'));

comment on column public.listings.property_type_source is
  'FR-163: ai chot property_type — suy_doan (regex tu cau rao) / chu_xac_nhan (chu nha tra loi loai_bds) / admin (form dang tin).';

-- ─────────────────────────────────────────────────────────────────────────────
-- (1) FACT MỚI NHẤT CỦA CHỦ NHÀ PHẢI THẮNG — sửa listing_facts_sync_cols.
--
-- Bản cũ đồng bộ fact → cột CHỈ KHI CỘT ĐANG NULL ("only if NULL"): chủ nhà
-- sửa "3 phòng ngủ → 4 phòng" là fact ghi nhận mà listing đứng im ở 3 — đúng
-- kiểu mâu thuẫn "facts nói X, listings nói Y". Luật kinh doanh thật: câu trả
-- lời MỚI NHẤT của chủ nhà là giá trị hiện hành; lịch sử đã nằm nguyên trong
-- listing_facts (source + created_at), không cần cột thêm.
--
-- Sửa kèm hai lỗi khớp khoá của bản cũ:
--   * 'dien_tich%' ôm nhầm cả 'dien_tich_tim_tuong' — diện tích TIM TƯỜNG mà
--     đè lên area_m2 (diện tích đất/sàn) là sai nghĩa. Giờ chỉ nhận đúng
--     'dien_tich' và 'dien_tich_dat'.
--   * 'loai_bds' không được đồng bộ ở DB (chỉ chat-reply tự làm) — nhét vào
--     đây để MỌI đường ghi fact đều đồng bộ, đúng bài học FR-157(b).
create or replace function public.listing_facts_sync_cols()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_txt  text := coalesce(new.answer, '');
  v_num  numeric;
  v_pt   public.property_type;
begin
  if new.question = 'so_phong_ngu' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 1 and 20 then
      update listings set bedrooms = v_num::int
       where id = new.listing_id and bedrooms is distinct from v_num::int;
    end if;

  elsif new.question in ('dien_tich', 'dien_tich_dat') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num > 5 and v_num < 5000 then
      update listings set area_m2 = v_num
       where id = new.listing_id and area_m2 is distinct from v_num;
    end if;

  elsif new.question = 'tang' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 0 and 80 then
      update listings set floor = v_num::int
       where id = new.listing_id and floor is distinct from v_num::int;
    end if;

  elsif new.question = 'huong' then
    if length(btrim(v_txt)) between 2 and 40 then
      update listings set direction = btrim(v_txt)
       where id = new.listing_id and direction is distinct from btrim(v_txt);
    end if;

  elsif new.question = 'loai_bds' then
    v_pt := public.guess_property_type_answer(v_txt);
    if v_pt is not null then
      update listings
         set property_type = v_pt, property_type_source = 'chu_xac_nhan'
       where id = new.listing_id
         and (property_type is distinct from v_pt
              or property_type_source is distinct from 'chu_xac_nhan');
    end if;
  end if;

  return null;
end;
$function$;

comment on function public.listing_facts_sync_cols() is
  'FR-163: fact MOI NHAT cua chu nha thang — dong bo fact -> cot listings vo dieu kien (khong con "chi khi NULL"). Facts la lich su, listings la gia tri hien hanh.';

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) Backfill provenance: fact loai_bds nào đã có từ trước thì tin đó là
-- chủ-xác-nhận.
-- Dữ liệu nhỏ (test env vài chục dòng); môi trường lớn hơn vẫn an toàn vì chỉ
-- UPDATE các listing có fact loai_bds (đếm được, không khoá cả bảng).
update public.listings l
   set property_type_source = 'chu_xac_nhan'
  from (select distinct on (listing_id) listing_id, answer
          from public.listing_facts
         where question = 'loai_bds'
         order by listing_id, created_at desc) f
 where l.id = f.listing_id
   and public.guess_property_type_answer(f.answer) is not null
   and l.property_type_source <> 'chu_xac_nhan';

-- admin_dang_tin: form đưa loại tường minh thì ghi 'admin'. Giữ NGUYÊN mọi
-- hành vi khác (bản 20260827k).
create or replace function public.admin_dang_tin(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email  text := (select auth.jwt() ->> 'email');
  v_seller uuid;
  v_zalo   text;
  v_phone  text;
  v_code   text;
  v_id     uuid;
  v_price  bigint;
begin
  if v_email is null or not exists (select 1 from admins a where a.email = v_email) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;

  v_seller := nullif(p->>'seller_id', '')::uuid;

  if v_seller is null and coalesce(btrim(p->>'seller_name'), '') <> '' then
    v_zalo  := nullif(btrim(p->>'seller_zalo'), '');
    v_phone := nullif(btrim(p->>'seller_phone'), '');

    if v_zalo is not null then
      select id into v_seller from sellers where zalo_user_id = v_zalo;
    end if;
    if v_seller is null and v_phone is not null then
      select id into v_seller from sellers where phone = v_phone;
    end if;

    if v_seller is null then
      insert into sellers (name, seller_type, phone, zalo_user_id)
      values (
        btrim(p->>'seller_name'),
        coalesce(nullif(p->>'seller_type', ''), 'ccrb')::seller_type,
        v_phone,
        v_zalo
      )
      returning id into v_seller;
    end if;
  end if;

  insert into listings (
    code, seller_id, deal, district, ward, location_raw,
    area_m2, price_raw, bedrooms, property_type, property_type_source,
    description, source, status
  ) values (
    null,
    v_seller,
    coalesce(nullif(p->>'deal', ''), 'ban')::listing_deal,
    'Quận 5',
    nullif(btrim(p->>'ward'), ''),
    nullif(btrim(p->>'location_raw'), ''),
    nullif(p->>'area_m2', '')::numeric,
    nullif(btrim(p->>'price_raw'), ''),
    nullif(p->>'bedrooms', '')::int,
    coalesce(nullif(p->>'property_type', ''), 'chua_ro')::property_type,
    case when nullif(p->>'property_type', '') is not null then 'admin' else 'suy_doan' end,
    nullif(btrim(p->>'description'), ''),
    coalesce(nullif(btrim(p->>'source'), ''), 'admin'),
    coalesce(nullif(p->>'status', ''), 'cho_thong_tin')
  )
  returning id, code, price_vnd into v_id, v_code, v_price;

  return jsonb_build_object(
    'id', v_id, 'code', v_code, 'price_vnd', v_price, 'seller_id', v_seller
  );
end
$fn$;

revoke all on function public.admin_dang_tin(jsonb) from public, anon;
grant execute on function public.admin_dang_tin(jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- (3) GIÁ: price_vnd là DẪN XUẤT, không bao giờ được lệch nguồn.
-- Trigger cũ chỉ bắn khi price_raw đổi — UPDATE thẳng price_vnd (Table Editor,
-- script) là hai cột lệch nhau vĩnh viễn. Giờ bắn ở MỌI insert/update: hễ có
-- price_raw thì price_vnd = parse_vnd(price_raw), ghi tay bị đè lại; price_raw
-- trống thì price_vnd bắt buộc null (không có nguồn thì không có số).
create or replace function public.listings_set_price_vnd()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  new.price_vnd := public.parse_vnd(new.price_raw);
  return new;
end $function$;

drop trigger if exists trg_listings_price_vnd on public.listings;
create trigger trg_listings_price_vnd
  before insert or update on public.listings
  for each row execute function public.listings_set_price_vnd();

comment on function public.listings_set_price_vnd() is
  'FR-163: price_raw la nguon su that duy nhat; price_vnd luon = parse_vnd(price_raw), ghi tay bi de lai o moi INSERT/UPDATE.';

-- ─────────────────────────────────────────────────────────────────────────────
-- (4) DEALS: chốt kèo là sổ TIỀN.
-- (a) Một cặp (listing, buyer) một kèo — chat-reply đang SELECT-đếm-rồi-INSERT
--     (race kinh điển): hai lượt "ok em" đồng thời là hai dòng deals, hạng
--     seller (FR-155) đếm chốt đôi. Unique = chặn ở tầng DB; code cũ thành
--     lưới đầu, 23505 nếu lọt cũng chỉ là một lỗi ghi sổ, không phải hai kèo.
--     NULLS NOT DISTINCT vì buyer_id nullable: unique thường coi NULL ≠ NULL,
--     hai kèo "không rõ khách" trên cùng căn vẫn lọt — bắt được đúng lỗ này
--     khi chạy TS-TOANVEN-05a lần đầu (FAIL rồi mới chữa).
alter table public.deals
  add constraint deals_listing_buyer_key unique nulls not distinct (listing_id, buyer_id);

-- (b) Kèo ĐÃ CHỐT không được xoá âm thầm — service_role bỏ qua RLS nên guard
--     phải nằm ở trigger. Đường thoát tường minh: muốn xoá thật thì UPDATE
--     closed_at về NULL trước (hai bước, có chủ đích), không có đường một phát.
create or replace function public.deals_chan_xoa_da_chot()
returns trigger
language plpgsql
as $function$
begin
  if old.closed_at is not null then
    raise exception 'FR-163: deal da chot (closed_at=%) khong duoc xoa. Muon xoa that: UPDATE closed_at ve NULL truoc.', old.closed_at
      using errcode = 'P0001';
  end if;
  return old;
end $function$;

drop trigger if exists trg_deals_chan_xoa on public.deals;
create trigger trg_deals_chan_xoa
  before delete on public.deals
  for each row execute function public.deals_chan_xoa_da_chot();

-- ─────────────────────────────────────────────────────────────────────────────
-- (5) VIEWINGS: hai điều chỉnh theo bất biến thật.
-- (a) listing_id NOT NULL đang MẤT DỮ LIỆU ÂM THẦM: model chốt lịch mà chưa
--     bắt được mã căn → chat-reply insert listing_id=null → 23502 → biến số
--     `vw` null bị bỏ qua, lịch xem BAY MẤT không một dòng lỗi. Kiến trúc vốn
--     đã có listing_code text làm neo dự phòng (sameAppt xử lý null code) —
--     bất biến thật là "lịch xem phải neo vào MỘT danh tính căn: id HOẶC code".
alter table public.viewings alter column listing_id drop not null;
alter table public.viewings
  add constraint viewings_can_neo_check
  check (listing_id is not null or listing_code is not null);

-- (b) status là text trần không CHECK. Giá trị đang dùng: 'proposed' (default),
--     'pending' (bot). Thêm hai trạng thái kết 'done'/'cancelled' cho vòng đời
--     tối thiểu [giả định BA — chưa có code nào ghi, chờ FR riêng khi làm].
alter table public.viewings
  add constraint viewings_status_check
  check (status in ('proposed', 'pending', 'done', 'cancelled'));

-- ─────────────────────────────────────────────────────────────────────────────
-- (6) CONVERSATIONS: một hội thoại đúng MỘT vai, một người MỘT hội thoại/vai.
-- FR-157: cùng một Zalo có thể có hội thoại mua VÀ hội thoại bán — nhưng là
-- HAI DÒNG, mỗi dòng một vai. Dòng hai vai là dòng mà mọi câu `where buyer_id`
-- lẫn `where seller_id` đều vớ được — sổ lẫn lộn. Dòng không vai là rác.
alter table public.conversations
  add constraint conversations_mot_vai_check
  check ((buyer_id is null) <> (seller_id is null));

-- ensure_buyer/seller_conversation là get-or-create "một người một hội thoại"
-- bằng advisory lock — biến lời hứa app-level thành bảo đảm DB-level. Kiểm
-- 28/08: không ai có 2 hội thoại cùng vai, thêm được ngay.
create unique index conversations_buyer_uniq
  on public.conversations (buyer_id) where buyer_id is not null;
create unique index conversations_seller_uniq
  on public.conversations (seller_id) where seller_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- (7) TRẠNG THÁI KẾT LÀ KẾT — hai guard chuyển trạng thái.
-- (a) reminders: 'sent'/'cancelled' là trạng thái kết. Lỗ thật đang có:
--     escalation-feed ack UPDATE status='sent' theo id KHÔNG lọc status —
--     reminder đã cancelled (khách nhắn lại nên hủy) mà bridge ack trễ là
--     cancelled→sent, sổ nói dối. Guard REVERT ÊM (giữ status cũ) chứ không
--     raise: đường ack đang sống không được gãy, chỉ dữ liệu không được sai.
create or replace function public.reminders_giu_trang_thai_ket()
returns trigger
language plpgsql
as $function$
begin
  if old.status in ('sent', 'cancelled') and new.status is distinct from old.status then
    new.status  := old.status;
    new.sent_at := old.sent_at; -- đừng đóng dấu sent_at lên reminder đã hủy
  end if;
  return new;
end $function$;

drop trigger if exists trg_reminders_trang_thai on public.reminders;
create trigger trg_reminders_trang_thai
  before update on public.reminders
  for each row execute function public.reminders_giu_trang_thai_ket();

-- (b) inbound_ledger: 'completed' là kết — payload trả lời đã phát cho khách,
--     tụt về received/processing/failed là mở đường trả lời ĐÔI. Writer duy
--     nhất là code của chính hệ (claim_inbound không bao giờ rời completed),
--     nên ở đây RAISE cho hỏng lộ mặt ngay thay vì revert êm.
create or replace function public.inbound_ledger_giu_completed()
returns trigger
language plpgsql
as $function$
begin
  if old.status = 'completed' and new.status is distinct from 'completed' then
    raise exception 'FR-163: inbound_ledger % da completed — khong duoc tut trang thai (thu ghi %).',
      old.zalo_msg_id, new.status using errcode = 'P0001';
  end if;
  return new;
end $function$;

drop trigger if exists trg_inbound_ledger_trang_thai on public.inbound_ledger;
create trigger trg_inbound_ledger_trang_thai
  before update on public.inbound_ledger
  for each row execute function public.inbound_ledger_giu_completed();

-- ─────────────────────────────────────────────────────────────────────────────
-- (8) MẤT-CẬP-NHẬT hồ sơ người mua: buyers.preferences đang được ghi kiểu
-- đọc-trộn-ghi-đè cả object phía edge function ({...prefs, ...delta}) — hai
-- lượt xử lý gối nhau là lượt sau đè mất delta lượt trước. Trộn bằng `||`
-- ngay trong SQL là atomic: chỉ các khoá trong delta bị đổi, khoá khác giữ
-- giá trị MỚI NHẤT trong DB chứ không phải bản đọc cũ.
create or replace function public.merge_buyer_prefs(p_buyer_id uuid, p_delta jsonb)
returns void
language sql
security definer
set search_path to 'public'
as $fn$
  update buyers
     set preferences = coalesce(preferences, '{}'::jsonb) || coalesce(p_delta, '{}'::jsonb)
   where id = p_buyer_id;
$fn$;

comment on function public.merge_buyer_prefs(uuid, jsonb) is
  'FR-163: tron delta ho so vao preferences bang || atomic — thay cho doc-tron-ghi-de phia edge function (mat cap nhat khi hai luot goi nhau).';

revoke all on function public.merge_buyer_prefs(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.merge_buyer_prefs(uuid, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- (9) INDEX theo truy vấn THẬT: từ FR-162, lịch sử hội thoại + check nhường
-- lượt đều `where conversation_id = ? order by seq desc limit N` — index
-- (conversation_id, created_at) cũ không phục vụ được ORDER BY seq. Giữ index
-- cũ vì đếm 100 tin/24h vẫn lọc theo created_at.
-- Kiểm EXPLAIN sau khi tạo: `Index Scan using messages_conv_seq_idx`, không
-- còn nút Sort.
create index messages_conv_seq_idx on public.messages (conversation_id, seq desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- (10) Vá theo security advisor (chạy sau khi áp (1)-(9)): khoá search_path
-- các hàm guard mới + thu quyền execute — trigger function không phải RPC
-- công khai, dù gọi ngoài ngữ cảnh trigger cũng chỉ ra lỗi nhưng đừng để lộ.
alter function public.deals_chan_xoa_da_chot() set search_path to 'public';
alter function public.reminders_giu_trang_thai_ket() set search_path to 'public';
alter function public.inbound_ledger_giu_completed() set search_path to 'public';
revoke execute on function public.deals_chan_xoa_da_chot() from public, anon, authenticated;
revoke execute on function public.reminders_giu_trang_thai_ket() from public, anon, authenticated;
revoke execute on function public.inbound_ledger_giu_completed() from public, anon, authenticated;
revoke execute on function public.listing_facts_sync_cols() from public, anon, authenticated;
