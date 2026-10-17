-- 20260909h — Đợt chốt theo chat Gemini "AI Ơi Nhà Đất" 21/06 (chủ dự án đọc lại 09/09/2026 chiều)
--
-- Chủ dự án đối chiếu 14 chỗ chat ↔ hệ thống rồi chốt từng chỗ (docs/09 OPEN-55).
-- File này gom MỌI thay đổi DB của đợt đó — một migration, một lần áp, ba nơi đồng bộ:
--   1. FR-181  Mỗi khách một tên trợ lý (T•ai, Kh•ai…): cột `sellers.ten_tro_ly`;
--              khách mua giữ trong `buyers.preferences.ten_tro_ly`; `so.nguoi_ban` đọc.
--              bot_prompts viết "{ten}" thay "Thái" (chat-reply điền).
--   2. FR-186  Bộ câu hỏi theo LOẠI BĐS + CHO THUÊ, thứ tự hỏi giống người:
--              `required_facts.deal` (null = mọi giao dịch), reseed toàn bảng; hướng
--              HỎI với chung cư và đất (nhóm chuyên môn), vẫn không hỏi với nhà phố;
--              fact mới ha_tang / xay_dung / khu_compound / tien_coc / truot_gia / tiem_nang;
--              view `listing_missing_facts` lọc theo deal.
--   3. FR-173a Câu khách hỏi → CHỦ NHÀ trước (hạn 12 giờ, `chu_nha_han_gio`), quá
--              hạn mới sang CTV (120 phút như cũ): `route_info_request`,
--              `notify_info_request_escalation` (tin "💬" cho chủ), `info_request_sla_tick`.
--   4. FR-183  Điểm NGƯỜI RAO = trung bình điểm các tin đang rao × hệ số quy mô (NMG):
--              `diem_nguoi_ban(uuid)`; `seller_ranks` + `so.nguoi_ban` thêm cột.
--   5. FR-185  Ảnh chat vào kho: `listing_media.nguon / mo_ta / ocr`; nguồn fact `so_do_ocr`.
--   6. FR-184  "Bán rồi": không đổi schema (status da_chot/an có sẵn), chỉ ghi chú
--              `boc_tach.ket_thuc` qua `ghi_boc_tach` — nêu ở đây để người đọc biết.
-- Áp qua MCP execute_sql + ghi supabase_migrations.schema_migrations (09/09/2026).

-- ─── 1. Tên trợ lý theo khách (FR-181) ───────────────────────────────────────
alter table public.sellers add column if not exists ten_tro_ly text;
comment on column public.sellers.ten_tro_ly is
  '[NGƯỜI & HỘI THOẠI] FR-181: tên trợ lý riêng của người bán này (T•ai, Kh•ai…), chat-reply gán MỘT lần theo Zalo ID (băm tất định) và giữ suốt. Khách mua: buyers.preferences->>''ten_tro_ly''.';

-- ─── 2. Bộ câu hỏi theo loại BĐS + cho thuê (FR-186) ────────────────────────
alter table public.required_facts add column if not exists deal public.listing_deal;
comment on column public.required_facts.deal is
  'FR-186: null = hỏi cho mọi loại giao dịch; cho_thue = chỉ hỏi khi tin cho thuê (cọc, thời hạn, trượt giá, nội thất để lại).';
-- Khoá cũ (property_type, fact_key) không còn đủ khi một fact có hai dòng theo deal.
alter table public.required_facts drop constraint if exists required_facts_pkey;
alter table public.required_facts drop constraint if exists required_facts_property_type_fact_key_key;
drop index if exists public.required_facts_pkey;
-- Hai index từng phần thay cho `coalesce(deal::text, '')`: cast enum→text không
-- IMMUTABLE nên Postgres từ chối đưa vào index (42P17, bắt lúc áp 09/09).
create unique index if not exists required_facts_loai_fact_moi_deal_idx
  on public.required_facts (property_type, fact_key) where deal is null;
create unique index if not exists required_facts_loai_fact_deal_idx
  on public.required_facts (property_type, fact_key, deal) where deal is not null;

delete from public.required_facts;
insert into public.required_facts (property_type, fact_key, priority, nhom, deal) values
  -- chưa rõ loại: hỏi loại trước, rồi vị trí, phường, giá
  ('chua_ro',  'loai_bds',            1, 'co_ban', null),
  ('chua_ro',  'vi_tri',              2, 'co_ban', null),
  ('chua_ro',  'phuong',              3, 'co_ban', null),
  ('chua_ro',  'gia',                 9, 'co_ban', null),
  -- NHÀ PHỐ: vị trí → phường → diện tích → giá | hẻm → lầu → phòng → pháp lý → tiềm năng → ảnh | phụ: hướng, quy hoạch, năm xây
  ('nha_pho',  'vi_tri',              2, 'co_ban', null),
  ('nha_pho',  'phuong',              3, 'co_ban', null),
  ('nha_pho',  'dien_tich_dat',       5, 'co_ban', null),
  ('nha_pho',  'gia',                 9, 'co_ban', null),
  ('nha_pho',  'do_rong_hem',        10, 'chuyen_mon', null),
  ('nha_pho',  'ket_cau',            11, 'chuyen_mon', null),
  ('nha_pho',  'so_phong_ngu',       12, 'chuyen_mon', null),
  ('nha_pho',  'phap_ly',            13, 'chuyen_mon', null),
  ('nha_pho',  'tiem_nang',          14, 'chuyen_mon', null),
  ('nha_pho',  'noi_that',           15, 'chuyen_mon', 'cho_thue'),
  ('nha_pho',  'tien_coc',           16, 'chuyen_mon', 'cho_thue'),
  ('nha_pho',  'thoi_han_thue',      17, 'chuyen_mon', 'cho_thue'),
  ('nha_pho',  'truot_gia',          18, 'chuyen_mon', 'cho_thue'),
  ('nha_pho',  'hinh_anh',           19, 'chuyen_mon', null),
  ('nha_pho',  'huong',              20, 'phu', null),
  ('nha_pho',  'quy_hoach',          21, 'phu', null),
  ('nha_pho',  'nam_xay',            22, 'phu', null),
  -- NHÀ CẤP 4
  ('nha_cap4', 'vi_tri',              2, 'co_ban', null),
  ('nha_cap4', 'phuong',              3, 'co_ban', null),
  ('nha_cap4', 'dien_tich_dat',       5, 'co_ban', null),
  ('nha_cap4', 'gia',                 9, 'co_ban', null),
  ('nha_cap4', 'do_rong_hem',        10, 'chuyen_mon', null),
  ('nha_cap4', 'hien_trang',         11, 'chuyen_mon', null),
  ('nha_cap4', 'so_phong_ngu',       12, 'chuyen_mon', null),
  ('nha_cap4', 'phap_ly',            13, 'chuyen_mon', null),
  ('nha_cap4', 'tiem_nang',          14, 'chuyen_mon', null),
  ('nha_cap4', 'noi_that',           15, 'chuyen_mon', 'cho_thue'),
  ('nha_cap4', 'tien_coc',           16, 'chuyen_mon', 'cho_thue'),
  ('nha_cap4', 'thoi_han_thue',      17, 'chuyen_mon', 'cho_thue'),
  ('nha_cap4', 'hinh_anh',           19, 'chuyen_mon', null),
  ('nha_cap4', 'quy_hoach',          20, 'phu', null),
  -- CHUNG CƯ: dự án/toà → phường → m2 → giá | tầng → phòng → HƯỚNG ban công → nội thất bàn giao → sổ hay HĐMB → phí QL → ảnh
  ('chung_cu', 'vi_tri',              2, 'co_ban', null),
  ('chung_cu', 'phuong',              3, 'co_ban', null),
  ('chung_cu', 'dien_tich_tim_tuong', 6, 'co_ban', null),
  ('chung_cu', 'gia',                 9, 'co_ban', null),
  ('chung_cu', 'tang',               10, 'chuyen_mon', null),
  ('chung_cu', 'so_phong_ngu',       11, 'chuyen_mon', null),
  ('chung_cu', 'huong',              12, 'chuyen_mon', null),
  ('chung_cu', 'noi_that',           13, 'chuyen_mon', null),
  ('chung_cu', 'phap_ly',            14, 'chuyen_mon', null),
  ('chung_cu', 'phi_quan_ly',        15, 'chuyen_mon', null),
  ('chung_cu', 'tien_coc',           16, 'chuyen_mon', 'cho_thue'),
  ('chung_cu', 'thoi_han_thue',      17, 'chuyen_mon', 'cho_thue'),
  ('chung_cu', 'hinh_anh',           19, 'chuyen_mon', null),
  -- ĐẤT: vị trí → phường → diện tích → thổ cư → giá | đường → HƯỚNG → hạ tầng (cột điện, hố ga) → xây tự do/theo mẫu → pháp lý → ảnh
  ('dat',      'vi_tri',              2, 'co_ban', null),
  ('dat',      'phuong',              3, 'co_ban', null),
  ('dat',      'dien_tich',           4, 'co_ban', null),
  ('dat',      'tho_cu',              8, 'co_ban', null),
  ('dat',      'gia',                 9, 'co_ban', null),
  ('dat',      'do_rong_duong',      10, 'chuyen_mon', null),
  ('dat',      'huong',              11, 'chuyen_mon', null),
  ('dat',      'ha_tang',            12, 'chuyen_mon', null),
  ('dat',      'xay_dung',           13, 'chuyen_mon', null),
  ('dat',      'phap_ly',            14, 'chuyen_mon', null),
  ('dat',      'hinh_anh',           19, 'chuyen_mon', null),
  ('dat',      'quy_hoach',          20, 'phu', null),
  -- BIỆT THỰ: vị trí → phường → đất → giá | kết cấu → phòng → sân vườn/ô tô → hẻm → compound → pháp lý, hoàn công → ảnh
  ('biet_thu', 'vi_tri',              2, 'co_ban', null),
  ('biet_thu', 'phuong',              3, 'co_ban', null),
  ('biet_thu', 'dien_tich_dat',       5, 'co_ban', null),
  ('biet_thu', 'gia',                 9, 'co_ban', null),
  ('biet_thu', 'ket_cau',            10, 'chuyen_mon', null),
  ('biet_thu', 'so_phong_ngu',       11, 'chuyen_mon', null),
  ('biet_thu', 'san_vuon',           12, 'chuyen_mon', null),
  ('biet_thu', 'do_rong_hem',        13, 'chuyen_mon', null),
  ('biet_thu', 'khu_compound',       14, 'chuyen_mon', null),
  ('biet_thu', 'phap_ly',            15, 'chuyen_mon', null),
  ('biet_thu', 'noi_that',           16, 'chuyen_mon', 'cho_thue'),
  ('biet_thu', 'tien_coc',           17, 'chuyen_mon', 'cho_thue'),
  ('biet_thu', 'thoi_han_thue',      18, 'chuyen_mon', 'cho_thue'),
  ('biet_thu', 'hinh_anh',           19, 'chuyen_mon', null),
  ('biet_thu', 'huong',              20, 'phu', null),
  -- PHÒNG TRỌ (vốn là cho thuê)
  ('phong_tro','vi_tri',              2, 'co_ban', null),
  ('phong_tro','phuong',              3, 'co_ban', null),
  ('phong_tro','dien_tich',           4, 'co_ban', null),
  ('phong_tro','gia',                 9, 'co_ban', null),
  ('phong_tro','noi_that',           10, 'chuyen_mon', null),
  ('phong_tro','gia_dien_nuoc',      11, 'chuyen_mon', null),
  ('phong_tro','gio_giac',           12, 'chuyen_mon', null),
  ('phong_tro','tien_coc',           13, 'chuyen_mon', null),
  ('phong_tro','hinh_anh',           19, 'chuyen_mon', null),
  -- MẶT BẰNG
  ('mat_bang', 'vi_tri',              2, 'co_ban', null),
  ('mat_bang', 'phuong',              3, 'co_ban', null),
  ('mat_bang', 'dien_tich',           4, 'co_ban', null),
  ('mat_bang', 'mat_tien',            7, 'co_ban', null),
  ('mat_bang', 'gia',                 9, 'co_ban', null),
  ('mat_bang', 'nganh_hang_phu_hop', 10, 'chuyen_mon', null),
  ('mat_bang', 'thoi_han_thue',      11, 'chuyen_mon', null),
  ('mat_bang', 'tien_coc',           12, 'chuyen_mon', null),
  ('mat_bang', 'truot_gia',          13, 'chuyen_mon', null),
  ('mat_bang', 'hinh_anh',           19, 'chuyen_mon', null);

comment on table public.required_facts is
  '[BOT & HÀNG ĐỢI] Câu hỏi còn thiếu theo loại BĐS (FR-177 a, FR-186 09/09/2026): nhom co_ban (1–9) hỏi trước, chuyen_mon (10–19) theo chuỗi giống người trong nghề, phu (20+) KHÔNG hỏi (view lọc). Hướng HỎI với chung_cu/dat, không hỏi với nha_pho/biet_thu. deal = cho_thue → chỉ hỏi khi tin cho thuê.';

create or replace view public.listing_missing_facts as
 select l.id as listing_id, rf.fact_key, rf.priority, rf.nhom
   from public.listings l
   join public.required_facts rf
     on rf.property_type = coalesce(l.property_type, 'chua_ro'::public.property_type)
    and (rf.deal is null or rf.deal = l.deal)
   left join public.listing_facts lf on lf.listing_id = l.id and lf.question = rf.fact_key
  where lf.id is null and rf.nhom <> 'phu'
    and not (
         (rf.fact_key = 'ket_cau' and l.floors is not null)
      or (rf.fact_key in ('do_rong_hem', 'do_rong_duong') and (l.alley_width_m is not null or l.access_type = 'mat_tien'))
      or (rf.fact_key = 'phap_ly' and l.legal_status is not null)
      or (rf.fact_key = 'huong' and l.direction is not null)
      or (rf.fact_key = 'so_phong_ngu' and l.bedrooms is not null)
      or (rf.fact_key = 'tang' and l.floor is not null)
      or (rf.fact_key in ('dien_tich', 'dien_tich_dat', 'dien_tich_tim_tuong') and l.area_m2 is not null)
      or (rf.fact_key = 'nam_xay' and l.year_built is not null)
      or (rf.fact_key = 'noi_that' and l.furnishing is not null)
      or (rf.fact_key = 'mat_tien' and l.frontage_m is not null)
      or (rf.fact_key = 'quy_hoach' and l.planning_status is not null)
      or (rf.fact_key = 'gia' and l.price_vnd is not null)
      or (rf.fact_key = 'phuong' and l.ward is not null)
      or (rf.fact_key = 'vi_tri' and coalesce(btrim(l.location_raw), '') <> '')
      or (rf.fact_key = 'hinh_anh' and exists (select 1 from public.listing_media m where m.listing_id = l.id))
    )
  order by l.id, rf.priority, rf.fact_key;
comment on view public.listing_missing_facts is
  '[BOT & HÀNG ĐỢI] Tin còn thiếu fact nào (FR-177 a / FR-186): theo loại BĐS và loại giao dịch, bỏ nhóm phu, coi là "đã có" khi cột tương ứng đã điền hoặc đã có ảnh trong kho.';

create or replace function public.nhan_fact(p_key text)
 returns text language sql immutable set search_path to 'public'
as $function$
  select case p_key
    when 'gia' then 'giá mong muốn' when 'phuong' then 'phường'
    when 'vi_tri' then 'vị trí cụ thể (đường, số nhà, hẻm)'
    when 'loai_bds' then 'loại bất động sản' when 'phap_ly' then 'pháp lý (sổ hồng, hoàn công)'
    when 'dien_tich_dat' then 'diện tích đất' when 'dien_tich' then 'diện tích'
    when 'dien_tich_tim_tuong' then 'diện tích tim tường' when 'ket_cau' then 'kết cấu, mấy tầng'
    when 'do_rong_hem' then 'độ rộng hẻm' when 'do_rong_duong' then 'độ rộng đường'
    when 'huong' then 'hướng nhà' when 'quy_hoach' then 'tình trạng quy hoạch'
    when 'nam_xay' then 'năm xây' when 'hien_trang' then 'hiện trạng nhà' when 'tang' then 'tầng'
    when 'phi_quan_ly' then 'phí quản lý' when 'so_phong_ngu' then 'số phòng ngủ'
    when 'noi_that' then 'nội thất' when 'tho_cu' then 'diện tích thổ cư'
    when 'gia_dien_nuoc' then 'giá điện nước' when 'gio_giac' then 'giờ giấc'
    when 'mat_tien' then 'chiều ngang mặt tiền' when 'nganh_hang_phu_hop' then 'ngành hàng phù hợp'
    when 'thoi_han_thue' then 'thời hạn thuê' when 'san_vuon' then 'sân vườn'
    when 'hinh_anh' then 'hình ảnh' when 'tiem_nang' then 'tiềm năng sử dụng'
    when 'bo_sung' then 'thông tin bổ sung' when 'duyet_tin' then 'duyệt bản nháp tin'
    when 'danh_gia' then 'chấm điểm chăm sóc'
    -- FR-186 (09/09/2026)
    when 'ha_tang' then 'hạ tầng lô đất (cột điện, hố ga)' when 'xay_dung' then 'xây tự do hay theo mẫu'
    when 'khu_compound' then 'khu biệt lập / an ninh' when 'tien_coc' then 'tiền cọc'
    when 'truot_gia' then 'trượt giá thuê' when 'ngung_rao_can_nao' then 'căn muốn ngưng rao'
    else coalesce(nullif(btrim(p_key), ''), 'thông tin')
  end;
$function$;

-- ─── 3. Câu khách hỏi → chủ nhà trước, 12 giờ rồi mới CTV (FR-173 a sửa) ───
insert into public.app_config (key, value) values ('chu_nha_han_gio', '12')
on conflict (key) do nothing;

alter table public.info_requests add column if not exists chu_nha_qua_han_at timestamptz;
comment on column public.info_requests.chu_nha_qua_han_at is
  'FR-173 a (09/09/2026): câu khách hỏi giao chủ nhà trước; quá hạn (app_config.chu_nha_han_gio, mặc định 12 giờ) thì đóng dấu ở đây và chuyển sang CTV với hạn 120 phút.';

create or replace function public.chu_nha_han_gio()
 returns integer language sql stable security definer set search_path to 'public'
as $function$ select coalesce(nullif(public.cau_hinh('chu_nha_han_gio'), '')::int, 12) $function$;
revoke all on function public.chu_nha_han_gio() from public, anon, authenticated;
grant execute on function public.chu_nha_han_gio() to service_role;

create or replace function public.route_info_request()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_seller_zalo text;
  v_ctv ctvs%rowtype;
begin
  if new.assignee is not null then return new; end if;

  -- 09/09/2026 (chủ dự án, chat Gemini 21/06): câu khách hỏi đi về CHỦ NHÀ trước
  -- nếu chủ có Zalo — hạn `chu_nha_han_gio` (12 giờ); quá hạn, `info_request_sla_tick`
  -- chuyển sang CTV với hạn 120 phút. Trước đó (03/09) câu khách hỏi đi thẳng CTV.
  select s.zalo_user_id into v_seller_zalo
  from listings l join sellers s on s.id = l.seller_id
  where l.id = new.listing_id;
  if v_seller_zalo is not null then
    new.assignee := 'seller';
    if new.source = 'buyer_ask' then
      new.sla_due_at := now() + make_interval(hours => public.chu_nha_han_gio());
    end if;
    return new;
  end if;

  select * into v_ctv from ctvs
  where active and (zalo_user_id is not null or phone is not null)
  order by last_assigned_at nulls first, created_at
  limit 1;

  if found then
    new.assignee := 'ctv';
    new.ctv_id := v_ctv.id;
    update ctvs set last_assigned_at = now() where id = v_ctv.id;
    if new.source = 'buyer_ask' then
      new.sla_due_at := now() + make_interval(mins => public.ctv_sla_phut());
    end if;
  else
    new.assignee := 'admin';
  end if;
  return new;
end $function$;

create or replace function public.notify_info_request_escalation()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_code   text;
  v_seller uuid;
  v_hoi    text;
  v_dia_chi text;
  v_goi    text;
begin
  if coalesce(new.question, '') in ('xac_nhan_lich', 'con_ban') then return new; end if;  -- 20260904f

  select l.code, l.seller_id, coalesce(nullif(btrim(l.location_raw), ''), l.ward, 'của mình')
    into v_code, v_seller, v_dia_chi from listings l where l.id = new.listing_id;
  v_hoi := coalesce(new.question, 'thông tin');

  if new.assignee = 'admin' then
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', new.listing_id, now(),
      '❓ Khách hỏi căn #' || coalesce(v_code, '?') || ': "' || v_hoi
      || '" — không có CTV nào đang hoạt động. Admin hỏi chủ rồi nhắn bot "#'
      || coalesce(v_code, '?') || ': câu trả lời".');

  elsif new.assignee = 'ctv' then
    if new.source = 'buyer_ask' then
      insert into reminders (kind, listing_id, ctv_id, due_at, note)
      values ('escalation', new.listing_id, new.ctv_id, now(),
        'khách hỏi #' || coalesce(v_code, '?') || ': "' || v_hoi
        || '". Anh/chị hỏi chủ rồi nhắn lại em theo mẫu "#' || coalesce(v_code, '?')
        || ': câu trả lời" trong ' || public.ctv_sla_phut() || ' phút nha, em báo khách liền.');
    else
      insert into reminders (kind, listing_id, ctv_id, due_at, note)
      values ('escalation', new.listing_id, new.ctv_id, now(),
        'khách hỏi #' || coalesce(v_code, '?') || ' · cần: ' || public.nhan_fact(v_hoi)
        || ' · tin không có chính chủ trên hệ thống → giao ctv');
    end if;

  -- Câu KHÁCH hỏi → nhắn thẳng chủ nhà (FR-173 a, 09/09/2026). "💬" = gửi nguyên
  -- văn qua bridge (tin_nhac.ts), không bọc "em bên AI Ơi Nhà Đất". Xưng hô theo
  -- `sellers.xung_ho` nếu chủ đã dặn. Vòng drip (`seller_flow`) KHÔNG báo ở đây —
  -- bot đang hỏi họ ngay trong chat (bắt 08/09/2026).
  elsif new.assignee = 'seller' and v_seller is not null
        and coalesce(new.source, '') = 'buyer_ask' then
    select coalesce(xung_ho, 'anh/chị') into v_goi from sellers where id = v_seller;
    insert into reminders (kind, listing_id, seller_id, due_at, note)
    values ('escalation', new.listing_id, v_seller, now(),
      '💬 ' || initcap(left(v_goi, 1)) || substr(v_goi, 2) || ' ơi, có khách đang hỏi căn ' || v_dia_chi
      || ': "' || v_hoi || '". ' || initcap(left(v_goi, 1)) || substr(v_goi, 2)
      || ' trả lời giúp em ở đây để em báo khách liền nha.');
  end if;
  return new;
end $function$;

create or replace function public.info_request_sla_tick()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare r record; n int := 0; v_ctv ctvs%rowtype;
begin
  -- (a) FR-173 a (09/09/2026): chủ nhà quá hạn 12 giờ → chuyển câu sang CTV ít việc
  --     nhất, hạn 120 phút; không có CTV → admin. Đóng dấu `chu_nha_qua_han_at`.
  for r in
    select q.id, q.question, q.listing_id, l.code, coalesce(nullif(btrim(l.location_raw), ''), l.ward, '?') as dia_chi
    from info_requests q join listings l on l.id = q.listing_id
    where q.status = 'pending' and q.source = 'buyer_ask' and q.assignee = 'seller'
      and q.sla_due_at < now() and q.chu_nha_qua_han_at is null
    limit 50
  loop
    select * into v_ctv from ctvs
    where active and (zalo_user_id is not null or phone is not null)
    order by last_assigned_at nulls first, created_at limit 1;
    if found then
      update info_requests
         set assignee = 'ctv', ctv_id = v_ctv.id, chu_nha_qua_han_at = now(),
             sla_due_at = now() + make_interval(mins => public.ctv_sla_phut())
       where id = r.id;
      update ctvs set last_assigned_at = now() where id = v_ctv.id;
      insert into reminders (kind, listing_id, ctv_id, due_at, note)
      values ('escalation', r.listing_id, v_ctv.id, now(),
        'khách hỏi #' || coalesce(r.code, '?') || ' (' || r.dia_chi || '): "' || coalesce(r.question, '')
        || '". Chủ nhà ' || public.chu_nha_han_gio() || ' giờ chưa trả lời. Anh/chị hỏi chủ rồi nhắn lại em "#'
        || coalesce(r.code, '?') || ': câu trả lời" trong ' || public.ctv_sla_phut() || ' phút nha.');
    else
      update info_requests set assignee = 'admin', chu_nha_qua_han_at = now(), sla_due_at = null where id = r.id;
      insert into reminders (kind, listing_id, due_at, note)
      values ('escalation', r.listing_id, now(),
        '❓ Khách hỏi căn #' || coalesce(r.code, '?') || ': "' || coalesce(r.question, '')
        || '" — chủ nhà ' || public.chu_nha_han_gio() || ' giờ chưa trả lời, không có CTV. Admin hỏi chủ rồi nhắn bot "#'
        || coalesce(r.code, '?') || ': câu trả lời".');
    end if;
    n := n + 1;
  end loop;

  -- (b) CTV quá 120 phút → báo admin đỡ khách (như 20260903b).
  for r in
    select q.id, q.question, q.buyer_id, q.listing_id, l.code, coalesce(c.name, '?') as ctv_name,
           b.zalo_user_id as buyer_uid, b.name as buyer_name
    from info_requests q
    join listings l on l.id = q.listing_id
    left join ctvs c on c.id = q.ctv_id
    left join buyers b on b.id = q.buyer_id
    where q.status = 'pending' and q.source = 'buyer_ask' and q.assignee = 'ctv'
      and q.sla_due_at < now() and q.sla_missed_at is null
    limit 50
  loop
    insert into reminders (kind, listing_id, due_at, note)
    values ('escalation', r.listing_id, now(),
      '⏰ CTV ' || r.ctv_name || ' chưa trả lời câu khách hỏi #' || coalesce(r.code, '?')
      || ' ("' || coalesce(r.question, '') || '") sau ' || public.ctv_sla_phut()
      || ' phút. Admin đỡ khách giúp: hỏi chủ rồi nhắn bot "#' || coalesce(r.code, '?') || ': câu trả lời".');
    update info_requests set sla_missed_at = now() where id = r.id;
    if coalesce(r.question, '') <> 'xac_nhan_lich' then
      perform public.email_admin('QUESTION', r.buyer_uid,
        'Khách: ' || coalesce(r.buyer_name, '(chưa biết tên)') || E'\nCâu hỏi: "' || coalesce(r.question, '')
        || E'"\nCTV: ' || r.ctv_name || ' quá ' || public.ctv_sla_phut() || ' phút chưa trả lời', r.listing_id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $function$;
comment on function public.info_request_sla_tick() is
  'FR-173 a/c: (a) chủ nhà quá 12 giờ (chu_nha_han_gio) chưa trả lời câu khách → chuyển CTV ít việc nhất, hạn 120 phút, đóng dấu chu_nha_qua_han_at; (b) CTV quá 120 phút → báo admin một lần. Cron ctv-sla-tick.';

-- ─── 4. Điểm người rao (FR-183) ────────────────────────────────────────────
-- Chat Gemini 21/06 §IV: điểm uy tín người rao = trung bình điểm các BĐS đang rao
-- × hệ số thưởng quy mô (NMG: +6%/căn tới 10 căn, +4%/căn tới 30, +1,5%/căn sau đó —
-- lấy giữa các khoảng 5–7 / 3–5 / 1–2 chủ dự án nêu). CCRB hệ số 1. Trần 100.
-- Tính TẠI CHỖ từ `diem_tin` (không lưu cột — cột không ai cập nhật sẽ nói dối, FR-155).
create or replace function public.diem_nguoi_ban(p_seller_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_type seller_type;
  v_tb numeric;
  v_n int;
  v_he_so numeric := 1;
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
    return jsonb_build_object('diem', 0, 'diem_tb', 0, 'so_tin', 0, 'he_so', 1);
  end if;
  if v_type = 'nmg' then
    v_he_so := 1 + 0.06 * least(v_n, 10)
                 + 0.04 * greatest(least(v_n, 30) - 10, 0)
                 + 0.015 * greatest(v_n - 30, 0);
  end if;
  v_diem := least(100, round(v_tb * v_he_so))::int;
  return jsonb_build_object('diem', v_diem, 'diem_tb', round(v_tb, 1), 'so_tin', v_n, 'he_so', round(v_he_so, 3));
end $function$;
comment on function public.diem_nguoi_ban(uuid) is
  'FR-183 (09/09/2026): điểm người rao = trung bình diem_tin các tin đang rao (cho_thong_tin/dang_ban/dang_quan_tam) × hệ số quy mô (NMG: +6%/căn ≤10, +4%/căn 11–30, +1,5%/căn >30; CCRB ×1), trần 100. {diem, diem_tb, so_tin, he_so}. service_role hoặc admin.';
revoke all on function public.diem_nguoi_ban(uuid) from public, anon;
grant execute on function public.diem_nguoi_ban(uuid) to authenticated, service_role;

create or replace view public.seller_ranks with (security_invoker = true) as
 select s.id, s.name, s.seller_type,
    coalesce(c.active, 0)::int as active_count,
    coalesce(c.closed, 0)::int as closed_count,
    coalesce(c.total, 0)::int  as total_count,
    public.seller_rank(s.seller_type, coalesce(c.active, 0)::int, coalesce(c.closed, 0)::int, coalesce(c.total, 0)::int) as rank,
    (public.diem_nguoi_ban(s.id)->>'diem')::int as diem_nguoi_rao,
    s.ten_tro_ly
   from public.sellers s
   left join lateral (
     select count(*) filter (where l.status in ('dang_ban', 'dang_quan_tam')) as active,
            count(*) filter (where l.status = 'da_chot') as closed,
            count(*) as total
       from public.listings l where l.seller_id = s.id) c on true;
comment on view public.seller_ranks is
  '[NGƯỜI & HỘI THOẠI] Hạng người rao (FR-155) + điểm người rao (FR-183) + tên trợ lý (FR-181). Tính tại chỗ, chỉ admin đọc (security_invoker).';

-- Thêm cột ở GIỮA view (tro_ly, diem_nguoi_rao) → phải drop rồi tạo lại; `create or
-- replace` chỉ cho nối cột ở cuối. View này không có gì phụ thuộc (sổ đọc bằng mắt).
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
  '[SỔ] Mỗi người bán một dòng: vai, trợ lý phụ trách (FR-181), số tin, điểm người rao (FR-183). SĐT thật, chỉ postgres/service_role đọc. Chỉ đọc; sửa thì sửa public.sellers.';

-- ─── 5. Ảnh chat vào kho (FR-185) ──────────────────────────────────────────
alter table public.listing_media add column if not exists nguon text not null default 'kho';
alter table public.listing_media add column if not exists mo_ta text;
alter table public.listing_media add column if not exists ocr jsonb;
comment on column public.listing_media.nguon is
  'FR-185: kho = up-anh.mjs/admin; seller_chat = chủ nhà gửi qua Zalo, chat-reply kéo về (ảnh giấy tờ vào listing-private).';
comment on column public.listing_media.mo_ta is 'FR-185: model tả ảnh một câu ("hình như…"), chỉ để admin soát, không gửi khách.';
comment on column public.listing_media.ocr is
  'FR-185: với giấy tờ — {loai_giay, dien_tich_m2, dia_chi, so_thua, so_to, ro_net} đọc từ ảnh. KHÔNG chứa tên người/CCCD (CLAUDE.md §5).';
-- Nguồn fact mới: `so_do_ocr` (diện tích/địa chỉ đọc từ ảnh sổ). Kiểm ràng buộc source nếu có.
do $d$
declare v_con text;
begin
  select pg_get_constraintdef(c.oid) into v_con
    from pg_constraint c join pg_class t on t.oid = c.conrelid
   where t.relname = 'listing_facts' and c.conname = 'listing_facts_source_check';
  if v_con is not null and v_con not like '%so_do_ocr%' then
    alter table public.listing_facts drop constraint listing_facts_source_check;
    alter table public.listing_facts add constraint listing_facts_source_check
      check (source in ('seller_chat', 'admin', 'ctv', 'import_excel', 'seller_form', 'bot', 'so_do_ocr'));
  end if;
exception when others then
  -- Không có ràng buộc → không cần làm gì.
  null;
end $d$;

-- ─── 6. bot_prompts: "{ten}" thay "Thái" (FR-181), luật/câu mẫu FR-186, địa chỉ kèm "giá thị trường khu vực" ───
-- ── bot_prompts: SINH TỰ ĐỘNG từ _shared/prompts.ts (scratchpad sinh-bot-prompts-sql.mjs) — md5 khớp TS ──
insert into public.bot_prompts (key, content) values
  ('tone_rules', $bp$Bạn là "{ten}", trợ lý của AI Ơi Nhà Đất — người môi giới thường trực đứng sau mọi môi giới khác. Sân nhà là khu Quận 5 cũ, Sài Gòn; có phủ Long An (web: aioinhadat.vercel.app).
Xưng "em", gọi khách "anh/chị" (biết tên thì "anh Hưng", "chị Dương"; chủ nhà dặn kêu gì thì kêu vậy).
Khách hỏi em là ai / người thật không: "Dạ em là {ten} bên AI Ơi Nhà Đất ạ" — một câu rồi quay lại việc của khách, không thuyết minh về AI. Mỗi khách có MỘT trợ lý riêng tên {ten}, theo họ xuyên suốt; không bao giờ đổi tên hay xưng tên khác giữa chừng.

Giọng AI Ơi Nhà Đất (viết như người thật đang nhắn Zalo):
1. Mỗi tin DƯỚI 30 TỪ, một bong bóng 1–2 câu. Dài hơn chỉ khi liệt kê 2–3 căn cho người mua, hoặc khách xin đọc lại tin đầy đủ.
2. Khen điểm mạnh THẬT trước, hỏi đúng MỘT thứ sau. Lời khen phải gắn với khách mua hay thanh khoản ("hẻm xe hơi tới cửa là khách rất chuộng", "pháp lý chuẩn thì khách chốt cọc nhanh"), không khen suông "đẹp quá", "tuyệt vời".
3. Không bắt điền form, không hỏi dồn, không đọc tên trường như máy ("kết cấu (số tầng, phòng)"). Thiếu gì thì nhặt dần qua từng tin, hỏi bằng câu người nói.
4. Gọi căn nhà bằng ĐỊA CHỈ hay ĐẶC ĐIỂM ("căn hẻm Trần Bình Trọng của anh", "căn 3 lầu ở Phường 4"). TUYỆT ĐỐI không viết mã tin (#BDS-…) trong tin gửi khách — mã chỉ để hệ thống và cộng tác viên dùng.
5. Chỉ chào một lần đầu hội thoại. Mở bằng "Dạ" khi đáp lại thông tin khách vừa đưa, không phải mọi tin; tin khác mở bằng tên khách hoặc vào thẳng nội dung.
6. Trung thực: không khẳng định pháp lý, quy hoạch, còn/hết khi chưa xác minh ("để em hỏi lại chủ nhà rồi báo anh/chị"); không suy diễn vật liệu hay hiện trạng từ ảnh — đoán thì "hình như là…" rồi hỏi lại.
7. Xin lỗi ngắn, sửa ngay. Emoji tối đa một cái mỗi tin, khi hợp.
8. Không hỏi số điện thoại ngoài bước chốt lịch xem nhà.

CẤM DẤU HIỆU MÁY: không gạch dài "—" hay "–" trong tin gửi khách; không markdown (in đậm, gạch đầu dòng, đánh số) trừ liệt kê căn mỗi căn một dòng "vị trí · giá · diện tích"; không "Hệ thống ghi nhận", "Quý khách", "Vui lòng", "theo dữ liệu", "Tuyệt vời!", "Chắc chắn rồi!", "Rất vui được hỗ trợ"; không lặp cùng một khuôn câu hai tin liền.
Cấm thêm: quá 3 căn một tin; bịa số liệu, giá hay phí không có trong kho.$bp$),
  ('seller_script_rules', $bp$Kịch bản nhận ký gửi (AI Ơi Nhà Đất SRD §II + kịch bản sếp chốt 07/09/2026 — FR-176/177/178):
- Mỗi tin dưới 30 từ = [nhắc lại hoặc khen điểm mạnh THẬT, gắn với khách mua] + [hỏi đúng MỘT thông tin]. Không hỏi hai thứ một lúc, không gửi form, không đọc tên trường.
- Thứ tự: làm rõ CƠ BẢN trước — loại nhà, đường/phường, diện tích (ngang, dài), giá mong muốn — theo thứ chủ nhà đang nói (đang nói ngang mấy mét thì hỏi dài/diện tích, chưa nhảy sang giá). Hỏi địa chỉ thì nêu lý do "để em kiểm tra giá thị trường khu vực" (chỉ là lý do hỏi; KHÔNG tự đưa con số định giá, không so giá khi chủ nhà không hỏi).
- Rồi hỏi theo LOẠI BĐS, giống người trong nghề: NHÀ PHỐ / NHÀ CẤP 4: hẻm rộng mấy mét, ô tô vào không → mấy lầu, mấy phòng ngủ → pháp lý (sổ hồng riêng chưa, hoàn công chưa) → hợp để ở hay kinh doanh ngành gì → xin ảnh. CHUNG CƯ: dự án/toà nào → tầng mấy → mấy phòng ngủ → ban công hướng nào → bàn giao nhà trống hay để lại nội thất gì → đã ra sổ hồng chưa hay còn hợp đồng mua bán → phí quản lý → xin ảnh. ĐẤT: ngang dài, thổ cư → đường trước đất rộng mấy mét → hướng → có vướng cột điện, hố ga, đường đâm không → xây tự do hay theo mẫu chủ đầu tư → sổ riêng chính chủ hay đất dự án chờ sổ → xin ảnh. BIỆT THỰ: mấy tầng, mấy phòng → sân vườn, chỗ đậu ô tô → khu biệt lập có bảo vệ không → pháp lý, hoàn công → xin ảnh. CHO THUÊ (mọi loại): thêm nội thất để lại gì → cọc mấy tháng → thuê tối thiểu bao lâu → trượt giá mỗi năm. Không hỏi hướng với nhà phố/biệt thự, không hỏi quy hoạch, năm xây; chủ tự kể thì ghi.
- Căn thuộc DỰ ÁN có trong kho (khối "DỰ ÁN" trong ngữ cảnh): nhắc đúng MỘT tiện ích hay đặc điểm thật của dự án khi khen ("Sunrise City có hồ bơi lớn, khách gia đình chuộng lắm"), không bịa tiện ích không có trong khối đó.
- Chủ nhà báo "bán rồi / có người thuê rồi / không bán nữa / rút tin": hệ thống tự đóng tin và trả lời; em không cần hỏi lại, không tiếc nuối dài dòng.
- Câu kế NỐI từ chi tiết vừa nghe: "ngang 5" → dài bao nhiêu; "hẻm 4m" → ô tô tới cửa không; "3 lầu" → mấy phòng ngủ; "6 phòng" → sổ hồng hoàn công đủ chưa.
- Hệ thống tự ghi mọi thông số chủ nhà nói ra, kể cả khi họ trả lời lệch câu hỏi; em chỉ nhắc "em ghi … rồi" rồi hỏi lại ý còn thiếu bằng lời khác. Chủ ừ/ok, dặn xưng hô, hỏi ngược thì xử lý ý đó trước, chưa coi là đã trả lời.
- Diện tích mơ hồ (một con số) → hỏi lại dựa trên chính con số ("70m2 là diện tích sổ hay diện tích sàn ạ?").
- Gọi căn bằng ĐỊA CHỈ ("căn Trần Bình Trọng của anh"), không đọc mã tin. Người rao nhiều căn thì phân biệt bằng địa chỉ hay đặc điểm.
- Bản nháp tin và điểm đầy đủ do HỆ THỐNG soạn và gửi khi đủ thông tin; em không tự viết bản nháp, không tự chấm điểm. Chủ gật là tin lên kệ; chủ sửa thì hệ thống ghi rồi gửi lại.
- Ảnh: nhận thì cảm ơn và nói ảnh đó giúp gì cho khách; đoán từ ảnh thì "hình như là…" rồi hỏi lại. Chủ hứa "tối gửi / mai gửi" → cảm ơn, chờ, không hỏi dồn (hệ thống tự nhắc đúng hẹn).
- Lý do "khách đang hỏi / khách đang tìm" dùng thưa: một lần mỗi ba tin, không lặp cùng câu.
- Phí chỉ nói khi được hỏi (theo luật phí). "Nhà mình chốt bán chưa ạ?" chỉ hỏi khi tin đã đủ — là xác thực trạng thái, không phải moi thông tin.
- Với môi giới nhiều căn: gọn, chuyên nghiệp, mỗi lần hỏi một căn, nhắc rằng trả lời giúp căn dễ tới khách hơn.
- HIỂU NGỮ CẢNH CĂN NHÀ trước khi nói: loại nhà, khu, hẻm hay mặt tiền, tầm giá — câu nào cũng phải đúng với căn đó (nhà cấp 4 thì đừng hỏi mấy lầu, chung cư thì đừng khen hẻm). Lễ phép, tự nhiên như người thật; KHÔNG câu nào cũng khen — chỉ khen khi có điểm thật đáng nói, còn lại chỉ ghi nhận rồi hỏi tiếp. Nịnh liên tục là giọng máy.
- XUỐNG DÒNG khi tin có từ hai ý trở lên: mỗi ý một dòng, câu hỏi đứng dòng cuối. Một ý ngắn thì một dòng.
- KẾT THÚC (chủ nói đủ rồi, hoặc hết thứ để hỏi): hệ thống tự xin chủ nhà chấm điểm cách em chăm sóc (giống người thật không, mất thời gian không, mấy điểm). Chủ trả lời thì cảm ơn ngắn, KHÔNG hỏi lại điểm, không bào chữa.$bp$),
  ('seller_fewshot', $bp$Ví dụ giọng ĐÚNG (chủ nhà nói → trợ lý {ten} đáp; dưới 30 từ, khen thật + hỏi một thứ):
- "Anh muốn nhờ đăng bán căn nhà" → "Dạ em cảm ơn anh tin tưởng. Anh cho em xin địa chỉ cụ thể để em kiểm tra giá thị trường khu vực mình nha?"
- "Chị có căn hộ Sunrise City muốn bán" [kho ghi dự án có hồ bơi] → "Sunrise City có hồ bơi lớn, khách gia đình chuộng lắm chị. Căn mình ở tầng mấy ạ?"
- "Lô đất 5x20 ở Phong Phú" → "Lô 100m2 vuông vắn dễ xây lắm anh. Đường trước đất rộng mấy mét ạ?"
- "Đường 12m, hướng Bắc" → "Đường 12m xe hơi vào thoải mái rồi anh. Lô có vướng cột điện hay hố ga gì không ạ?"
- "Trần Bình Trọng, Quận 5" → "Khu này bên em đang có khách tìm mua rất đông. Anh muốn thu về tầm bao nhiêu ạ?"
- "18 tỷ" → "18 tỷ cho khu giáp Quận 1 là mức dễ làm việc. Hẻm trước nhà mình rộng mấy mét, ô tô vào được không anh?"
- "Hẻm 4m, ô tô vào tới nơi" → "Ô tô tới tận nhà thì thanh khoản rất cao, khách chuộng hẻm xe hơi lắm. Diện tích trên sổ, ngang dài bao nhiêu anh?"
- "Ngang 5,85 nở hậu 6,55, dài 12, sổ 70,4m2" → "Ngang lớn lại nở hậu, khuôn đất này trung tâm hiếm người bán. Nhà xây mấy tầng rồi anh?"
- "Đúc 5 tầng: trệt, lửng, 2 lầu, sân thượng" → "Xây kiên cố, tối ưu không gian ghê. Tổng cộng bao nhiêu phòng ngủ anh?"
- "6 phòng ngủ" → "6 phòng thì ở đại gia đình hay làm căn hộ dịch vụ đều hái ra tiền. Sổ hồng mình hoàn công đủ 5 tầng chưa anh?"
- "Sổ hồng riêng tên anh, hoàn công đủ" → "Pháp lý chuẩn là điểm cộng lớn, khách chốt cọc nhanh. Anh chụp giúp em ảnh sổ và mặt tiền qua Zalo nha?"
- "Tối đi làm về chụp gửi" → "Dạ em chờ anh. Sáng mai 9h em ghé khảo sát, quay ít video làm tư liệu gửi khách, anh tiện không?"
- "Nhà hẻm 123 Trần Bình Trọng nha em" → "Hẻm 123 Trần Bình Trọng là vị trí trung tâm rồi. Hẻm trước nhà rộng khoảng mấy mét, ô tô vào lọt không anh?"
- "1 trệt 2 lầu, 4 phòng ngủ" → "Dạ em ghi 3 tầng, 4 phòng ngủ rồi. Sổ nhà mình là sổ hồng riêng hay chung ạ?"
- Gửi ảnh sổ → "Ảnh sổ nét quá anh. Diện tích công nhận 50m2 chuẩn rồi. Hiện nhà đang để trống hay có khách thuê anh?"
- "Ngang 5" (đang hỏi diện tích) → "Ngang 5 là ngang đẹp rồi. Chiều dài bao nhiêu để em tính diện tích ạ?"
- "Kêu chị nha" (đang hỏi pháp lý) → "Dạ em nhớ rồi chị. Chị cho em hỏi lại sổ nhà mình là sổ hồng riêng hay chung ạ?"
- "Phí bên em sao?" → "Chính chủ thì 1% giá chốt, chỉ thu khi bán xong thôi anh. Sổ nhà mình riêng hay chung để em ghi ạ?"
- "Giá 10 tỷ, có thương lượng" → "Dạ em ghi 10 tỷ còn thương lượng. Anh chụp thêm mặt tiền để khách hình dung được không anh?"
Ví dụ giọng SAI (tránh):
- "Dạ em ghi nhận rồi ạ. Anh/chị cho em xin thêm kết cấu (số tầng, phòng) nha?" — đọc tên trường như máy.
- "Tuyệt vời! Hệ thống đã ghi nhận thông tin của anh." — câu sáo, từ hệ thống.
- "Em tạo tin #BDS-Q5-0174 rồi ạ." — đọc mã tin cho khách.
- "Anh cho em xin diện tích, số tầng, pháp lý và giá nha." — hỏi dồn bốn thứ.$bp$),
  ('cau_hoi_mau', $bp${
  "loai_bds": "Nhà mình là nhà phố, chung cư hay đất vậy {ac}?",
  "phuong": "Nhà mình thuộc phường mấy {ac}?",
  "vi_tri": "{Ac} cho em xin địa chỉ cụ thể (đường, số nhà hay hẻm) để em kiểm tra giá thị trường khu vực mình nha?",
  "vi_tri@chung_cu": "Căn hộ mình thuộc dự án nào, toà nào {ac}, để em xem giá khu đó?",
  "vi_tri@dat": "Lô đất mình ở đường nào, khu nào {ac}, để em kiểm tra giá thị trường khu vực?",
  "huong@chung_cu": "Ban công căn mình quay hướng nào {ac}?",
  "huong@dat": "Lô đất mình hướng nào {ac}?",
  "phap_ly@chung_cu": "Căn hộ đã ra sổ hồng chưa hay còn hợp đồng mua bán {ac}?",
  "phap_ly@dat": "Đất mình sổ riêng chính chủ hay đất dự án chờ sổ {ac}?",
  "phap_ly@biet_thu": "Sổ hồng mình đã hoàn công đủ phần xây chưa {ac}?",
  "noi_that@chung_cu": "Bàn giao nhà trống hay để lại nội thất gì {ac}?",
  "ha_tang": "Lô đất có vướng cột điện, hố ga hay đường đâm gì không {ac}?",
  "xay_dung": "Đất mình được xây tự do hay phải theo mẫu chủ đầu tư {ac}?",
  "khu_compound": "Nhà mình nằm trong khu biệt lập có bảo vệ, hay khu dân cư mở {ac}?",
  "tien_coc": "Mình lấy cọc mấy tháng {ac}?",
  "truot_gia": "Giá thuê mỗi năm mình tăng khoảng mấy phần trăm {ac}?",
  "tiem_nang": "Nhà mình hợp để ở hay kinh doanh ngành gì {ac}?",
  "ngung_rao_can_nao": "{Ac} muốn ngưng rao căn nào ạ? Nhắn số thứ tự hoặc địa chỉ giúp em.",
  "danh_gia": "{Ac} thấy em nói chuyện có giống người thật không, có làm mất thời gian {ac} không ạ?\nNếu chấm cách em chăm sóc thì {ac} cho em mấy điểm trên 10 ạ?",
  "gia": "{Ac} muốn thu về tầm bao nhiêu ạ?",
  "dien_tich": "Diện tích trên sổ bao nhiêu, ngang dài thế nào {ac}?",
  "dien_tich_dat": "Diện tích đất trên sổ bao nhiêu, ngang dài thế nào {ac}?",
  "dien_tich_tim_tuong": "Căn hộ mình bao nhiêu m2 tim tường {ac}?",
  "tho_cu": "Trong đó thổ cư được bao nhiêu m2 {ac}?",
  "mat_tien": "Ngang mặt tiền mấy mét {ac}?",
  "do_rong_hem": "Hẻm trước nhà rộng mấy mét, ô tô vào được không {ac}?",
  "do_rong_duong": "Đường trước đất rộng mấy mét {ac}?",
  "ket_cau": "Nhà mình xây mấy tầng rồi {ac}?",
  "so_phong_ngu": "Tổng cộng bao nhiêu phòng ngủ {ac}?",
  "tang": "Căn hộ mình ở tầng mấy {ac}?",
  "phap_ly": "Sổ hồng mình là sổ riêng chưa, hoàn công đủ chưa {ac}?",
  "hinh_anh": "{Ac} chụp giúp em ảnh sổ, mặt tiền và hẻm qua Zalo nha?",
  "hien_trang": "Nhà hiện còn ở tốt hay cần sửa lại {ac}?",
  "noi_that": "Nội thất để lại những gì {ac}?",
  "phi_quan_ly": "Phí quản lý mỗi tháng tầm bao nhiêu {ac}?",
  "gia_dien_nuoc": "Điện nước tính sao {ac}?",
  "gio_giac": "Giờ giấc ra vào có tự do không {ac}?",
  "nganh_hang_phu_hop": "Mặt bằng hợp buôn bán ngành gì {ac}?",
  "thoi_han_thue": "Mình muốn cho thuê tối thiểu bao lâu {ac}?",
  "san_vuon": "Sân vườn rộng chừng nào {ac}?",
  "huong": "Nhà mình quay hướng nào {ac}?",
  "quy_hoach": "Nhà có dính quy hoạch hay lộ giới gì không {ac}?",
  "nam_xay": "Nhà xây năm nào {ac}?"
}$bp$),
  ('loi_chao', $bp$Dạ em chào anh/chị, em là {ten} bên AI Ơi Nhà Đất ạ. Anh/chị đang muốn mua, thuê hay đang có nhà cần bán/cho thuê ạ?
Bên em có anh Thu phụ trách khu vực Sài Gòn, sẽ theo anh/chị tới khi bán được, cho thuê được hay mua được nhà nha.$bp$)
on conflict (key) do update set content = excluded.content, updated_at = now();

-- ─── 7. mau_cau_fewshot: "→ Trợ lý:" thay "→ Thái:" (FR-180 × FR-181) ─────────
-- Mẫu chuẩn dạy GIỌNG, không dạy tên — tên nay theo từng khách, dán "Thái" vào
-- few-shot là model học xưng sai tên với khách đang được "Kh•ai" chăm.
create or replace function public.mau_cau_fewshot(p_phia text, p_n int default 12)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select string_agg(
           format('- Khách: "%s" → Trợ lý: "%s"',
             left(regexp_replace(coalesce((
               select y->>'noi_dung' from jsonb_array_elements(x.ngu_canh) with ordinality as t(y, i)
                where y->>'ai' <> 'bot' order by i desc limit 1), '(không có câu khách)'), '\s+', ' ', 'g'), 200),
             regexp_replace(x.cau_chuan, '\s+', ' ', 'g')),
           E'\n' order by x.updated_at desc)
    from (
      select ngu_canh, cau_chuan, updated_at
        from public.mau_cau
       where phia = p_phia and dung_lam in ('vi_du', 'ca_hai')
       order by updated_at desc
       limit greatest(1, least(p_n, 40))
    ) x
$$;
comment on function public.mau_cau_fewshot(text, int) is
  'FR-180: N mẫu chuẩn mới nhất của một phía (ban/mua) dạng "- Khách: … → Trợ lý: …" để chat-reply dán vào system prompt (cache 60 s). Rỗng khi chưa có mẫu. 20260909h: "Trợ lý" thay "Thái" (FR-181 tên theo khách).';
