-- 20260908a — bốn lỗi làm bot "trả lời ngu" và dội tin vào Zalo
-- (bàn giao 08/09/2026 §7 + soi log `so.hoi_thoai` lượt rao 07/09 15:36–15:40).
-- Cả bốn đều kiểm trên DB thật trước khi sửa, không sửa theo phỏng đoán.
--
-- 1. BOT HỎI ĐÚNG THỨ FR-177 CẤM HỎI. `listing_missing_facts` trả cả nhóm `phu`
--    (hướng, quy hoạch, năm xây). `20260907h` xếp chúng priority >= 20 để chúng
--    "không bao giờ tới lượt" — nhưng khi các nhóm trên đã trả lời hết thì
--    `phu` LÀ nhóm còn lại, `chonCauKe()` bốc ngay. Log 07/09 đúng vậy: hỏi
--    xong pháp lý là hỏi hướng rồi quy hoạch, trong khi `seller_script_rules`
--    ghi rõ "không hỏi, chủ tự kể thì ghi". View là "THỨ TỰ BOT HỎI" nên chỗ
--    lọc phải nằm ở đây, không phải rắc rối ở từng nơi gọi.
--
-- 2. DỘI TIN VÀO ZALO CHỦ NHÀ. `notify_info_request_escalation` bắn reminder
--    "khách đang quan tâm căn #… cần bổ sung: dien_tich_dat" cho CHÍNH chủ nhà
--    mỗi lần bot mở một câu hỏi nhỏ giọt — trong khi bot vừa hỏi họ câu đó
--    trong chat. Hai cái hại: nói dối (không có khách nào quan tâm, đó là vòng
--    drip) và đọc tên cột cho người đọc. Nay chỉ báo khi câu hỏi ĐẾN TỪ KHÁCH
--    (`buyer_ask`), và đọc bằng tiếng người.
--
-- 3. CÂU TRẢ LỜI ĐÃ XONG MÀ TIN NHẮC VẪN NẰM ĐÓ. Không có đường huỷ, nên nhắc
--    cũ trôi tới lượt gửi sau. Nay `answered`/`expired` là huỷ.
--
-- 4. BÓC SỐ SAI. "6x11" thành diện tích 6 m2 (lấy số đầu tiên, lọt vì 6 > 5);
--    "7t" không ra giá (parse_vnd không biết `t` trần) trong khi `boc_thong_so`
--    lại đọc thành 7 tầng.

-- ── 1. View: bỏ nhóm phụ khỏi thứ tự hỏi ────────────────────────────────────
create or replace view public.listing_missing_facts as
 select l.id as listing_id, rf.fact_key, rf.priority, rf.nhom
   from public.listings l
   join public.required_facts rf
     on rf.property_type = coalesce(l.property_type, 'chua_ro'::property_type)
   left join public.listing_facts lf
     on lf.listing_id = l.id and lf.question = rf.fact_key
  where lf.id is null
    and rf.nhom <> 'phu'
    and not (
         (rf.fact_key = 'ket_cau' and l.floors is not null)
      or (rf.fact_key in ('do_rong_hem', 'do_rong_duong')
          and (l.alley_width_m is not null or l.access_type = 'mat_tien'))
      or (rf.fact_key = 'phap_ly' and l.legal_status is not null)
      or (rf.fact_key = 'huong' and l.direction is not null)
      or (rf.fact_key = 'so_phong_ngu' and l.bedrooms is not null)
      or (rf.fact_key = 'tang' and l.floor is not null)
      or (rf.fact_key in ('dien_tich', 'dien_tich_dat', 'dien_tich_tim_tuong')
          and l.area_m2 is not null)
      or (rf.fact_key = 'nam_xay' and l.year_built is not null)
      or (rf.fact_key = 'noi_that' and l.furnishing is not null)
      or (rf.fact_key = 'mat_tien' and l.frontage_m is not null)
      or (rf.fact_key = 'quy_hoach' and l.planning_status is not null)
      or (rf.fact_key = 'gia' and l.price_vnd is not null)
      or (rf.fact_key = 'phuong' and l.ward is not null)
      or (rf.fact_key = 'hinh_anh'
          and exists (select 1 from public.listing_media m where m.listing_id = l.id))
    )
  order by l.id, rf.priority, rf.fact_key;

revoke all on public.listing_missing_facts from public, anon, authenticated;
grant select on public.listing_missing_facts to service_role;

comment on view public.listing_missing_facts is
  '[RỔ HÀNG] Câu còn thiếu của từng tin — đây là THỨ TỰ BOT HỎI, nên nhóm `phu` (hướng, quy hoạch, năm xây) BỊ LOẠI: FR-177 cấm hỏi, chủ tự kể thì ghi. Nhóm co_ban (1–9) trước chuyen_mon (10–19); thứ tự trong nhóm co_ban do chonCauKe() chọn theo câu chủ nhà vừa nói. "Đã có" đọc từ cả fact lẫn cột lẫn listing_media. FR-144/176/177.';

-- ── 2. Nhãn tiếng người cho fact_key ────────────────────────────────────────
-- Cùng bộ chữ với FACT_LABELS trong `_shared/prompts.ts`. Hai bản là cố ý:
-- SQL không đọc được TS. Đổi một bên thì đổi bên kia.
create or replace function public.nhan_fact(p_key text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case p_key
    when 'gia' then 'giá mong muốn'
    when 'phuong' then 'phường'
    when 'loai_bds' then 'loại bất động sản'
    when 'phap_ly' then 'pháp lý (sổ hồng, hoàn công)'
    when 'dien_tich_dat' then 'diện tích đất'
    when 'dien_tich' then 'diện tích'
    when 'dien_tich_tim_tuong' then 'diện tích tim tường'
    when 'ket_cau' then 'kết cấu, mấy tầng'
    when 'do_rong_hem' then 'độ rộng hẻm'
    when 'do_rong_duong' then 'độ rộng đường'
    when 'huong' then 'hướng nhà'
    when 'quy_hoach' then 'tình trạng quy hoạch'
    when 'nam_xay' then 'năm xây'
    when 'hien_trang' then 'hiện trạng nhà'
    when 'tang' then 'tầng'
    when 'phi_quan_ly' then 'phí quản lý'
    when 'so_phong_ngu' then 'số phòng ngủ'
    when 'noi_that' then 'nội thất'
    when 'tho_cu' then 'diện tích thổ cư'
    when 'gia_dien_nuoc' then 'giá điện nước'
    when 'gio_giac' then 'giờ giấc'
    when 'mat_tien' then 'chiều ngang mặt tiền'
    when 'nganh_hang_phu_hop' then 'ngành hàng phù hợp'
    when 'thoi_han_thue' then 'thời hạn thuê'
    when 'san_vuon' then 'sân vườn'
    when 'hinh_anh' then 'hình ảnh'
    when 'tiem_nang' then 'tiềm năng sử dụng'
    when 'bo_sung' then 'thông tin bổ sung'
    when 'duyet_tin' then 'duyệt bản nháp tin'
    else coalesce(nullif(btrim(p_key), ''), 'thông tin')
  end;
$function$;

revoke all on function public.nhan_fact(text) from public, anon, authenticated;
grant execute on function public.nhan_fact(text) to service_role, authenticated;

comment on function public.nhan_fact(text) is
  'Nhãn tiếng người cho fact_key, dùng trong tin nhắn gửi người thật. Song bản với FACT_LABELS ở _shared/prompts.ts.';

-- ── 3. Trigger escalation: không dội tin vòng drip ──────────────────────────
create or replace function public.notify_info_request_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code   text;
  v_seller uuid;
  v_hoi    text;
begin
  if coalesce(new.question, '') in ('xac_nhan_lich', 'con_ban') then return new; end if;  -- 20260904f

  select l.code, l.seller_id into v_code, v_seller from listings l where l.id = new.listing_id;
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

  -- CHỈ báo chủ nhà khi câu hỏi ĐẾN TỪ KHÁCH. Vòng drip (`seller_flow`,
  -- `seller_drip`) là bot đang hỏi họ ngay trong chat — bắn thêm một tin
  -- "khách đang quan tâm… cần bổ sung: dien_tich_dat" vừa dội vừa nói sai:
  -- không có khách nào cả. Bắt 08/09/2026 từ log Zalo của chủ dự án.
  elsif new.assignee = 'seller' and v_seller is not null
        and coalesce(new.source, '') = 'buyer_ask' then
    insert into reminders (kind, listing_id, seller_id, due_at, note)
    values ('escalation', new.listing_id, v_seller, now(),
      'khách đang quan tâm căn #' || coalesce(v_code, '?') || ' của mình, cần bổ sung: '
      || public.nhan_fact(v_hoi));
  end if;
  return new;
end $function$;

-- ── 4. Trả lời xong thì huỷ tin nhắc ────────────────────────────────────────
create or replace function public.huy_nhac_khi_da_tra_loi()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_nhan text;
begin
  if new.status not in ('answered', 'expired') or old.status is not distinct from new.status then
    return null;
  end if;
  v_nhan := public.nhan_fact(coalesce(new.question, ''));
  -- Nhãn rơi về mặc định 'thông tin' thì KHÔNG lọc theo nhãn nữa: chuỗi đó có
  -- trong gần như mọi ghi chú, huỷ theo nó là huỷ nhầm tin của câu khác.
  if v_nhan = 'thông tin' then
    return null;
  end if;
  update reminders set status = 'cancelled'
   where kind = 'escalation' and status = 'pending'
     and listing_id = new.listing_id
     and note like '%' || v_nhan || '%';
  return null;
end $function$;

revoke all on function public.huy_nhac_khi_da_tra_loi() from public, anon, authenticated;
grant execute on function public.huy_nhac_khi_da_tra_loi() to service_role;

drop trigger if exists trg_huy_nhac_khi_da_tra_loi on public.info_requests;
create trigger trg_huy_nhac_khi_da_tra_loi
  after update of status on public.info_requests
  for each row execute function public.huy_nhac_khi_da_tra_loi();

comment on function public.huy_nhac_khi_da_tra_loi() is
  'FR-140: câu hỏi đã trả lời (hoặc hết hạn) thì huỷ tin nhắc escalation còn chờ của cùng căn + cùng nhãn, kẻo nhắc trôi tới lượt gửi sau.';

-- ── 5. parse_vnd: "7t" là 7 tỷ ──────────────────────────────────────────────
-- Luật cũ có `5t5` (số-t-số) và `7ty`, nhưng KHÔNG có `t` trần cuối chuỗi, nên
-- "7t" trả null → tin rao mất giá. Đặt SAU luật `tr` để "7tr" vẫn là 7 triệu;
-- `\M` (cuối từ) nên "7 tấm" không dính vì sau `t` còn chữ.
create or replace function public.parse_vnd(p text)
returns bigint
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  t    text;
  m    text[];
  v    numeric;
  ruoi boolean;
begin
  if p is null or btrim(p) = '' then return null; end if;
  t := lower(p);
  ruoi := t ~ 'rưỡi|rươi|ruoi';

  t := regexp_replace(t, 'tỏi|tỷ|tỉ|tị|tỹ', ' _ty ', 'g');
  t := regexp_replace(t, 'triệu|trieu|củ',  ' _trieu ', 'g');

  t := regexp_replace(t, '([0-9])\s*ty\s*([0-9])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*t\s*([0-9])',  '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*ty\M',         '\1 _ty ',   'g');
  t := regexp_replace(t, '([0-9])\s*tr\M',         '\1 _trieu ', 'g');
  t := regexp_replace(t, '([0-9])\s*t\M',          '\1 _ty ',   'g');

  -- Phan le sau don vi: "5 ty 5" = 5,5 ty | "3 ty 200" = 3,2 ty.
  -- Chan hai kieu bat nham: "5 ty 50m2" (dien tich) va viec cat bot chu so
  -- ("50" bi lui ve "5" cho khop) — nen cam ca chu so lan m dung ngay sau.
  m := regexp_match(t, '([0-9]+)\s*_ty\s*([0-9]{1,3})(?![0-9.,]|\s*m)');
  if m is not null then
    return (m[1]::numeric * 1e9
            + case when length(m[2]) = 1
                   then m[2]::numeric * 1e8
                   else m[2]::numeric * 1e6 end)::bigint;
  end if;

  m := regexp_match(t, '([0-9]+[.,]?[0-9]*)\s*_ty');
  if m is not null then
    v := replace(m[1], ',', '.')::numeric * 1e9;
    if ruoi then v := v + 5e8; end if;
    return v::bigint;
  end if;

  m := regexp_match(t, '([0-9]+[.,]?[0-9]*)\s*_trieu');
  if m is not null then
    v := replace(m[1], ',', '.')::numeric * 1e6;
    if ruoi then v := v + 5e5; end if;
    return v::bigint;
  end if;

  return null;
exception when others then
  return null;
end
$function$;

-- ── 7. Dọn câu hỏi treo đã sai từ đầu ───────────────────────────────────────
-- Câu nhóm `phu` lẽ ra không bao giờ được hỏi; để `pending` thì bot vẫn coi là
-- câu đang treo và ép chủ nhà trả lời. Đánh `expired`, không xoá — giữ dấu vết.
update public.info_requests q
   set status = 'expired'
  from public.required_facts rf
 where q.status = 'pending'
   and rf.fact_key = q.question
   and rf.nhom = 'phu';
