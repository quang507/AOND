-- 20260907h — FR-177: nhận ký gửi như môi giới giỏi (kịch bản Gemini 07/09/2026,
-- chủ dự án chốt tối 07/09: "ưu tiên làm rõ loại, vị trí, diện tích, giá trước;
-- thứ tự hỏi tự nhiên gần với thứ khách đang nói; hỏi một đường trả lời một
-- nẻo thì VẪN ghi").
--
-- BỐN VIỆC, cùng một PR:
--
-- 1. `required_facts.nhom` — ba nhóm: co_ban (loại, phường, diện tích, giá,
--    mặt tiền) hỏi TRƯỚC; chuyen_mon (hẻm, kết cấu, pháp lý, ảnh…) hỏi sau;
--    phu (hướng, quy hoạch, năm xây) chỉ nhặt khi chủ tự kể — vẫn nằm trong
--    bảng để "đã có/chưa có" đọc được, nhưng priority ≥ 20 nên không bao giờ
--    tới lượt trước khi tin lên kệ. priority đánh lại ĐƠN ĐIỆU theo nhóm
--    (co_ban 1–9, chuyen_mon 10–19, phu 20+) để mọi chỗ đang `order by
--    priority` (chat-reply, ask-seller) không phải sửa. Thứ tự TRONG nhóm
--    co_ban do tầng tiền định `chonCauKe()` quyết theo câu chủ nhà vừa nói.
--
-- 2. `hinh_anh` vào required_facts (chuyen_mon, cuối chuỗi): kịch bản sếp có
--    bước "xin ảnh sổ, mặt tiền, hẻm". "Đã có" = có dòng listing_media HOẶC
--    fact hinh_anh (đường ghiAnhKem của chat-reply).
--
-- 3. `diem_tin(listings)` — điểm đầy đủ 0–100, 7 tiêu chí, TIỀN ĐỊNH từ cột +
--    fact, không tốn model: vị trí & hẻm 15 · diện tích 20 · kết cấu 15 ·
--    pháp lý 10 · giá 10 · tiềm năng sử dụng 20 · lời gọi hành động 10.
--    Nhận ROW chứ không nhận uuid vì trigger BEFORE UPDATE phải chấm trên
--    `new` (bản trong bảng lúc đó vẫn là cũ).
--
-- 4. Lên kệ: tin tạo từ CHAT (`can_chu_duyet = true`, chat-reply đặt lúc tạo)
--    cần đủ giá+diện tích+phường NHƯ CŨ, VÀ điểm ≥ 70, VÀ chủ nhà đã gật bản
--    nháp (`chu_duyet_at`). Tin nhập Excel / admin (can_chu_duyet = false)
--    giữ nguyên luật cũ — 173 tin đang rao không bị kéo xuống vì một hàm điểm
--    mới [giả định BA, FR-177 d]. Ngưỡng 70 cũng là giả định BA.
--
-- Fact `bo_sung` (câu lệch không nhận ra fact nào — ghi nguyên văn) và
-- `tiem_nang` (tiềm năng sử dụng) không cần DDL: listing_facts.question là
-- text tự do; `listing_facts_sync_cols` chạy `boc_thong_so` trên MỌI fact nên
-- "hẻm 4m" nằm trong bo_sung vẫn ra alley_width_m.

-- ── 1. Nhóm câu hỏi ──────────────────────────────────────────────────────────
alter table public.required_facts
  add column if not exists nhom text not null default 'chuyen_mon';
alter table public.required_facts drop constraint if exists required_facts_nhom_check;
alter table public.required_facts
  add constraint required_facts_nhom_check check (nhom in ('co_ban', 'chuyen_mon', 'phu'));

comment on column public.required_facts.nhom is
  'FR-177: co_ban (loại/phường/diện tích/giá/mặt tiền — hỏi trước) · chuyen_mon (hẻm, kết cấu, pháp lý, ảnh…) · phu (hướng, quy hoạch, năm xây — chỉ nhặt khi chủ tự kể). priority đánh đơn điệu theo nhóm: 1–9 / 10–19 / 20+.';

-- ── 2. Ảnh vào chuỗi hỏi ────────────────────────────────────────────────────
insert into public.required_facts (property_type, fact_key, priority, nhom)
select t.property_type, 'hinh_anh', 19, 'chuyen_mon'
from unnest(enum_range(null::property_type)) as t(property_type)
where t.property_type <> 'chua_ro'
on conflict (property_type, fact_key) do nothing;

-- Kịch bản sếp hỏi "mấy lầu, mấy phòng": ket_cau bắt tầng, còn phòng ngủ cần
-- fact riêng khi chủ chỉ nói "3 lầu". Biệt thự thiếu hẻm + phòng ngủ; nhà cấp 4
-- thiếu phòng ngủ — không có thì điểm kết cấu (15) không bao giờ đủ.
insert into public.required_facts (property_type, fact_key, priority, nhom)
values ('nha_pho', 'so_phong_ngu', 12, 'chuyen_mon'),
       ('nha_cap4', 'so_phong_ngu', 12, 'chuyen_mon'),
       ('biet_thu', 'so_phong_ngu', 12, 'chuyen_mon'),
       ('biet_thu', 'do_rong_hem', 10, 'chuyen_mon')
on conflict (property_type, fact_key) do nothing;

update public.required_facts set nhom = case
  when fact_key in ('loai_bds', 'phuong', 'dien_tich', 'dien_tich_dat', 'dien_tich_tim_tuong', 'tho_cu', 'gia', 'mat_tien') then 'co_ban'
  when fact_key in ('huong', 'quy_hoach', 'nam_xay') then 'phu'
  else 'chuyen_mon' end;

-- priority mới: co_ban theo thứ tự cố định (loại → phường → diện tích → mặt
-- tiền → thổ cư → giá), hai nhóm còn lại giữ thứ tự tương đối đang có.
with xep as (
  select property_type, fact_key,
         case nhom
           when 'co_ban' then array_position(
             array['loai_bds', 'phuong', 'dien_tich', 'dien_tich_dat', 'dien_tich_tim_tuong', 'mat_tien', 'tho_cu', 'gia'],
             fact_key)
           when 'chuyen_mon' then 9 + row_number() over (partition by property_type, nhom order by priority, fact_key)
           else 19 + row_number() over (partition by property_type, nhom order by priority, fact_key)
         end as p
    from public.required_facts
)
update public.required_facts rf set priority = xep.p
  from xep where xep.property_type = rf.property_type and xep.fact_key = rf.fact_key;

-- ── View: thêm cột nhom, "đã có ảnh" ─────────────────────────────────────────
-- Đổi tập cột → phải drop rồi tạo lại; quyền cấp lại tường minh (chỉ
-- service_role — soát 29/08; default privileges của project cấp sẵn cho anon
-- nên phải revoke TRƯỚC).
drop view if exists public.listing_missing_facts;
create view public.listing_missing_facts as
 select l.id as listing_id,
        rf.fact_key,
        rf.priority,
        rf.nhom
   from public.listings l
   join public.required_facts rf
     on rf.property_type = coalesce(l.property_type, 'chua_ro'::property_type)
   left join public.listing_facts lf
     on lf.listing_id = l.id and lf.question = rf.fact_key
  where lf.id is null
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
      -- FR-177: ảnh đã có trong kho (up-anh.mjs / ghiAnhKem) thì không xin nữa.
      or (rf.fact_key = 'hinh_anh'
          and exists (select 1 from public.listing_media m where m.listing_id = l.id))
    )
  order by l.id, rf.priority, rf.fact_key;

revoke all on public.listing_missing_facts from public, anon, authenticated;
grant select on public.listing_missing_facts to service_role;

comment on view public.listing_missing_facts is
  '[RỔ HÀNG] Câu còn thiếu của từng tin, xếp theo priority của required_facts — đây là THỨ TỰ BOT HỎI. FR-177: nhóm co_ban (loại, phường, diện tích, giá) trước, rồi chuyen_mon (hẻm → kết cấu → pháp lý → ảnh), phu (hướng, quy hoạch, năm xây) chỉ nhặt khi chủ tự kể. Thứ tự TRONG nhóm co_ban do chat-reply chọn theo câu chủ nhà vừa nói (chonCauKe). "Đã có" đọc từ cả fact lẫn cột lẫn listing_media. FR-144/FR-176/FR-177.';

-- ── 3. Điểm đầy đủ tin ───────────────────────────────────────────────────────
create or replace function public.diem_tin(l public.listings)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  f        jsonb;
  co_anh   boolean;
  co_hem   boolean;
  co_mt    boolean;
  co_kc    boolean;
  co_pn    boolean;
  d_vi_tri int := 0;
  d_dt     int := 0;
  d_kc     int := 0;
  d_pl     int := 0;
  d_gia    int := 0;
  d_tn     int := 0;
  d_cta    int := 0;
  -- `text[] || 'chữ'` bị Postgres đọc là nối HAI MẢNG ("malformed array
  -- literal") — bắt lúc áp 07/09; phải dùng array_append.
  thieu    text[] := '{}';
  mo_ta    text := public.bo_dau(coalesce(l.description, ''));
begin
  if l.id is null then return null; end if;
  -- Fact mới nhất của mỗi câu.
  select coalesce(jsonb_object_agg(x.question, x.answer), '{}'::jsonb) into f
    from (select distinct on (question) question, answer
            from public.listing_facts where listing_id = l.id
           order by question, created_at desc) x;
  co_anh := (f ? 'hinh_anh')
            or exists (select 1 from public.listing_media m where m.listing_id = l.id);

  -- 1. Vị trí & hẻm (15): địa chỉ 7 · phường 4 · hẻm/mặt tiền 4.
  co_hem := l.alley_width_m is not null or l.access_type = 'mat_tien'
            or (f ? 'do_rong_hem') or (f ? 'do_rong_duong')
            or l.property_type in ('chung_cu', 'phong_tro');
  d_vi_tri := (case when coalesce(btrim(l.location_raw), '') <> '' then 7 else 0 end)
            + (case when coalesce(btrim(l.ward), '') <> '' then 4 else 0 end)
            + (case when co_hem then 4 else 0 end);
  if not co_hem then thieu := array_append(thieu, 'hẻm rộng mấy mét, xe hơi vào được không'); end if;

  -- 2. Thông số diện tích (20): diện tích 12 · ngang/dài 8 (chung cư, phòng
  --    trọ không có mặt tiền nên diện tích là đủ).
  co_mt := l.frontage_m is not null or (f ? 'mat_tien')
           or l.property_type in ('chung_cu', 'phong_tro')
           or coalesce(f->>'dien_tich_dat', f->>'dien_tich', '') ~ '\d\s*[xX×]\s*\d';
  if l.area_m2 is not null then
    d_dt := 12 + (case when co_mt then 8 else 0 end);
    if not co_mt then thieu := array_append(thieu, 'chiều ngang mặt tiền'); end if;
  else
    thieu := array_append(thieu, 'diện tích');
  end if;

  -- 3. Kết cấu & công năng (15): tầng 8 · phòng ngủ 7. Loại không có tầng/
  --    phòng thì tiêu chí đổi nghĩa: đất = thổ cư/quy hoạch; phòng trọ = nội
  --    thất; mặt bằng = tầng hoặc ngành hàng; nhà cấp 4 = hiện trạng thay tầng.
  if l.property_type = 'dat' then
    d_kc := case when (f ? 'tho_cu') or l.planning_status is not null then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, 'thổ cư bao nhiêu, quy hoạch ra sao'); end if;
  elsif l.property_type = 'phong_tro' then
    d_kc := case when l.furnishing is not null or (f ? 'noi_that') then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, 'nội thất có gì'); end if;
  elsif l.property_type = 'mat_bang' then
    d_kc := case when l.floors is not null or (f ? 'ket_cau') or (f ? 'nganh_hang_phu_hop') then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, 'mấy tầng, hợp ngành gì'); end if;
  else
    co_kc := l.floors is not null or coalesce(btrim(l.floors_text), '') <> ''
             or (f ? 'ket_cau') or l.floor is not null or (f ? 'tang')
             or (l.property_type = 'nha_cap4' and (f ? 'hien_trang'));
    co_pn := l.bedrooms is not null or (f ? 'so_phong_ngu');
    d_kc := (case when co_kc then 8 else 0 end) + (case when co_pn then 7 else 0 end);
    if not co_kc then thieu := array_append(thieu, 'mấy tầng'); end if;
    if not co_pn then thieu := array_append(thieu, 'mấy phòng ngủ'); end if;
  end if;

  -- 4. Pháp lý (10). Phòng trọ cho thuê không hỏi sổ.
  if l.legal_status is not null or (f ? 'phap_ly') or l.property_type = 'phong_tro' then d_pl := 10;
  else thieu := array_append(thieu, 'pháp lý (sổ hồng riêng/chung, hoàn công)'); end if;

  -- 5. Giá (10).
  if l.price_vnd is not null then d_gia := 10; else thieu := array_append(thieu, 'giá'); end if;

  -- 6. Tiềm năng sử dụng (20): chủ/bot đã nêu rõ → 20; suy được từ dữ liệu
  --    (nhà nhiều tầng/phòng, hẻm xe hơi hay mặt tiền, loại hình cho thuê,
  --    mô tả có nói mục đích) → 10.
  if f ? 'tiem_nang' then d_tn := 20;
  elsif coalesce(l.floors, 0) >= 3 or coalesce(l.bedrooms, 0) >= 3
     or l.access_type = 'mat_tien' or coalesce(l.alley_width_m, 0) >= 4
     or l.property_type in ('chung_cu', 'mat_bang', 'phong_tro', 'biet_thu') or (f ? 'san_vuon')
     or mo_ta ~ '(kinh doanh|cho thue|chdv|dau tu|van phong|o ngay|buon ban|mo shop|mo quan)'
  then d_tn := 10; thieu := array_append(thieu, 'tiềm năng sử dụng (ở, cho thuê hay kinh doanh)');
  else thieu := array_append(thieu, 'tiềm năng sử dụng (ở, cho thuê hay kinh doanh)'); end if;

  -- 7. Lời gọi hành động (10): tin có mã → khách nhắn Zalo #mã (DH-02).
  if l.code is not null then d_cta := 10; end if;

  return jsonb_build_object(
    'diem', d_vi_tri + d_dt + d_kc + d_pl + d_gia + d_tn + d_cta,
    'chi_tiet', jsonb_build_object(
      'vi_tri_hem', d_vi_tri, 'dien_tich', d_dt, 'ket_cau', d_kc, 'phap_ly', d_pl,
      'gia', d_gia, 'tiem_nang', d_tn, 'goi_hanh_dong', d_cta),
    'thieu', to_jsonb(thieu),
    'co_anh', co_anh);
end $function$;

create or replace function public.diem_tin(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.diem_tin(l) from public.listings l where l.id = p_listing_id;
$function$;

revoke all on function public.diem_tin(public.listings) from public, anon, authenticated;
grant execute on function public.diem_tin(public.listings) to service_role;
revoke all on function public.diem_tin(uuid) from public, anon, authenticated;
grant execute on function public.diem_tin(uuid) to service_role;

comment on function public.diem_tin(public.listings) is
  'FR-177 d: điểm đầy đủ tin 0–100, 7 tiêu chí (15/20/15/10/10/20/10), tiền định từ cột + fact. Trả {diem, chi_tiet, thieu[], co_anh}. Bản nhận ROW để trigger chấm trên NEW.';
comment on function public.diem_tin(uuid) is
  'FR-177 d: diem_tin theo id — chat-reply gọi qua RPC để soạn bản nháp ("tin mình 85/100").';

-- ── 4. Lên kệ: tin từ chat cần điểm ≥ 70 + chủ gật ──────────────────────────
alter table public.listings
  add column if not exists can_chu_duyet boolean not null default false,
  add column if not exists chu_duyet_at timestamptz;

comment on column public.listings.can_chu_duyet is
  'FR-177 c/d: true = tin tạo từ chat, chỉ lên kệ khi diem_tin ≥ 70 VÀ chu_duyet_at có. false (Excel, admin) = luật cũ giá+diện tích+phường.';
comment on column public.listings.chu_duyet_at is
  'FR-177 c: lúc chủ nhà gật bản nháp tin ("như vậy được chưa?" → đồng ý theo AGREE_RULES).';

create or replace function public.listings_quyet_dinh_dang_tin()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare v_du boolean := public.listing_du_dang_tin(new.price_vnd, new.area_m2, new.ward);
begin
  -- FR-177 d: tin từ chat còn phải đủ điểm và được chủ nhà gật bản nháp.
  if v_du and new.can_chu_duyet then
    v_du := new.chu_duyet_at is not null
        and coalesce((public.diem_tin(new)->>'diem')::int, 0) >= 70;
  end if;
  if v_du and new.status = 'cho_thong_tin' then
    new.status := 'dang_ban';
  elsif not v_du and new.status = 'dang_ban' then
    new.status := 'cho_thong_tin';
  end if;
  return new;
end $function$;

comment on function public.listings_quyet_dinh_dang_tin() is
  'FR-164/FR-177: cho_thong_tin ↔ dang_ban. Đủ = giá + diện tích + phường; tin từ chat (can_chu_duyet) thêm diem_tin ≥ 70 và chu_duyet_at.';
