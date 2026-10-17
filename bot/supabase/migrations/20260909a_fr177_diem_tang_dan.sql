-- 20260909a — FR-177 f/g/h: điểm tin tăng dần qua nhiều ngày (09/09/2026)
--
-- Chủ dự án 09/09/2026 ("theo khuyến nghị, làm đi"): sau khi chủ nhà gật bản
-- nháp, tin lên kệ NGAY với điểm hiện có; 5 phút sau bot hỏi bù MỘT thông tin
-- quan trọng, rồi hỏi tiếp theo nhịp nhỏ giọt trong vài ngày cho tới khi hết
-- thứ để hỏi hoặc chủ nhà nói "đủ rồi". Có ảnh thì cộng điểm. Kèm ba yêu cầu
-- về dữ liệu: bóc tách được gì thì LƯU NGAY dạng JSON (bỏ trường null, chưa
-- cần bàn tới cột), còn loại giao dịch / vị trí / tình trạng GẤP phải có cột.
--
-- 1. Cột mới trên `listings`:
--    chu_noi_du_at — chủ nhà nói "đủ rồi / vậy thôi / đừng hỏi nữa" → vòng hỏi
--                    bù DỪNG. Điểm KHÔNG nhảy lên 100, vẫn đo theo dữ liệu thật.
--    gap           — tình trạng gấp: true / false / null (chưa rõ).
--    boc_tach      — ảnh chụp JSON những gì bóc tách được từ câu rao + mọi fact
--                    chủ nhà trả lời; jsonb_strip_nulls nên KHÔNG liệt kê cột
--                    trống. Ghi TRƯỚC, không phụ thuộc cột nào tồn tại.
--    (Loại giao dịch = `deal`, vị trí = `district`/`ward`/`location_raw`/`street`
--     đã là cột từ trước — chỉ cần nhắc, không thêm.)
-- 2. `ghi_boc_tach(uuid, jsonb)` — chat-reply gọi lúc tạo tin; trigger trên
--    `listing_facts` gộp từng fact mới vào cùng chỗ. "Bóc được gì thì lưu."
-- 3. `diem_tin`: ẢNH vào thang điểm. 7 tiêu chí của sếp đã đủ 100, nên lấy 10
--    điểm từ "tiềm năng sử dụng" (20 → 10: nêu rõ 10, suy được 5) cho ảnh 10.
--    Đếm TẤM, không đếm loại: 1 tấm 4 · 2 tấm 7 · ≥3 tấm 10 — "có 3 ảnh thì
--    tính đủ, ảnh nào cũng được" [chủ dự án 09/09/2026]. `thieu[]` tự nói còn
--    thiếu mấy tấm (trước đây chat-reply tự nối "ảnh sổ, mặt tiền, hẻm").
-- 7. Fact `vi_tri` (vị trí cụ thể: đường, số nhà, hẻm) vào nhóm CƠ BẢN cho mọi
--    loại BĐS, ngay sau phường; đồng bộ sang `listings.location_raw` (street
--    tự bóc theo trigger cũ). Chủ dự án 09/09: "chỉ cần rao và hỏi vị trí cụ
--    thể thì tốt hơn". Câu rao đã nói đường/hẻm thì chat-reply ghi fact ngay.
-- 8. Bỏ "định giá": câu mẫu / few-shot không còn "để em xem giá khu đó trước"
--    — `bot_prompts.seller_fewshot` sửa cùng `_shared/prompts.ts` (md5 khớp,
--    TS-KYGUI-16).
-- 4. `seller_drip_tick`: hỏi bù CẢ tin ĐÃ ĐĂNG (dang_ban) tạo từ chat
--    (can_chu_duyet) còn thiếu fact, trừ tin chủ đã nói đủ. Tin nhập
--    Excel/admin (can_chu_duyet = false) để yên — OPEN-50 phương án (1).
--    Trần cũ giữ nguyên: ≤ 3 câu / 24h / tin, ≤ 2 căn / người / 24h.
-- 5. `seller_hoi_bu_tick()` + cron 5 phút (giờ làm việc): câu hỏi bù ĐẦU TIÊN
--    đúng 5 phút sau khi chủ gật; các câu sau đi nhịp drip 30 phút. Cửa sổ
--    5–20 phút và điều kiện "chưa có câu nào mở sau lúc gật" làm nó chạy lại
--    được mà không hỏi hai lần (ask-seller mở info_requests là dấu đã hỏi).
-- 6. `so.ro_hang` thêm cột `gap` (đọc bằng mắt người).

-- ── 1. Cột mới ────────────────────────────────────────────────────────────────
alter table public.listings
  add column if not exists chu_noi_du_at timestamptz,
  add column if not exists gap boolean,
  add column if not exists boc_tach jsonb;

comment on column public.listings.chu_noi_du_at is
  'FR-177 g: lúc chủ nhà nói "đủ rồi / vậy thôi / đừng hỏi nữa" (laDuRoi, tiền định). Có dấu là vòng hỏi bù DỪNG; điểm diem_tin giữ nguyên theo dữ liệu thật, không nhảy lên 100.';
comment on column public.listings.gap is
  'Tình trạng gấp (chủ dự án 09/09/2026): true = chủ nói bán/thuê gấp, cần tiền, thanh lý; false = nói rõ không gấp; null = chưa rõ. Bóc bằng laGap() từ câu rao / câu chat.';
comment on column public.listings.boc_tach is
  'FR-177 h: ảnh chụp JSON những gì bóc tách được — câu rao (deal, quận, phường, giá thô, diện tích, phòng ngủ, gấp, dự án…) + mọi fact chủ nhà trả lời (khoá = question). Không có trường null (jsonb_strip_nulls). `_cap_nhat` = lần ghi cuối. Ghi TRƯỚC khi bàn tới cột: mai kia thêm cột thì đọc lại từ đây, không phải hỏi lại chủ nhà.';

-- ── 2. Ghi bóc tách ───────────────────────────────────────────────────────────
create or replace function public.ghi_boc_tach(p_listing_id uuid, p jsonb)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.listings
     set boc_tach = coalesce(boc_tach, '{}'::jsonb)
                 || jsonb_strip_nulls(coalesce(p, '{}'::jsonb))
                 || jsonb_build_object('_cap_nhat', now())
   where id = p_listing_id;
$$;

revoke all on function public.ghi_boc_tach(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ghi_boc_tach(uuid, jsonb) to service_role;
comment on function public.ghi_boc_tach(uuid, jsonb) is
  'FR-177 h: gộp một mẻ bóc tách vào listings.boc_tach (bỏ null, đóng dấu _cap_nhat). chat-reply gọi lúc tạo tin từ câu rao.';

create or replace function public.trg_fact_vao_boc_tach()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Mọi fact đều đáng giữ, kể cả `bo_sung` (câu lệch không nhận ra fact nào):
  -- đó chính là thứ "bóc được mà chưa có cột".
  update public.listings
     set boc_tach = coalesce(boc_tach, '{}'::jsonb)
                 || jsonb_build_object(new.question, new.answer, '_cap_nhat', now())
   where id = new.listing_id;
  return null;
end $$;

revoke all on function public.trg_fact_vao_boc_tach() from public, anon, authenticated;
grant execute on function public.trg_fact_vao_boc_tach() to service_role;
comment on function public.trg_fact_vao_boc_tach() is
  'FR-177 h: mỗi listing_facts mới gộp vào listings.boc_tach (khoá = question). Bóc được gì thì lưu, không đợi có cột.';

drop trigger if exists trg_zz_fact_vao_boc_tach on public.listing_facts;
create trigger trg_zz_fact_vao_boc_tach
  after insert on public.listing_facts
  for each row execute function public.trg_fact_vao_boc_tach();

-- ── 3. diem_tin: ảnh 10, tiềm năng 10 ────────────────────────────────────────
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
  d_anh    int := 0;
  so_anh   int := 0;
  thieu    text[] := '{}';
  mo_ta    text := public.bo_dau(coalesce(l.description, ''));
begin
  if l.id is null then return null; end if;
  select coalesce(jsonb_object_agg(x.question, x.answer), '{}'::jsonb) into f
    from (select distinct on (question) question, answer
            from public.listing_facts where listing_id = l.id
           order by question, created_at desc) x;
  -- Đếm TẤM ảnh: mỗi fact hinh_anh là một tấm chủ gửi qua chat + ảnh trong kho.
  select (select count(*) from public.listing_facts x
           where x.listing_id = l.id and x.question = 'hinh_anh')
       + (select count(*) from public.listing_media m where m.listing_id = l.id)
    into so_anh;
  co_anh := so_anh > 0;

  -- 1. Vị trí & hẻm (15): địa chỉ 7 · phường 4 · hẻm/mặt tiền 4.
  co_hem := l.alley_width_m is not null or l.access_type = 'mat_tien'
            or (f ? 'do_rong_hem') or (f ? 'do_rong_duong')
            or l.property_type in ('chung_cu', 'phong_tro');
  d_vi_tri := (case when coalesce(btrim(l.location_raw), '') <> '' then 7 else 0 end)
            + (case when coalesce(btrim(l.ward), '') <> '' then 4 else 0 end)
            + (case when co_hem then 4 else 0 end);
  if not co_hem then thieu := array_append(thieu, 'hẻm rộng mấy mét, xe hơi vào được không'); end if;

  -- 2. Thông số diện tích (20): diện tích 12 · ngang/dài 8.
  co_mt := l.frontage_m is not null or (f ? 'mat_tien')
           or l.property_type in ('chung_cu', 'phong_tro')
           or coalesce(f->>'dien_tich_dat', f->>'dien_tich', '') ~ '\d\s*[xX×]\s*\d';
  if l.area_m2 is not null then
    d_dt := 12 + (case when co_mt then 8 else 0 end);
    if not co_mt then thieu := array_append(thieu, 'chiều ngang mặt tiền'); end if;
  else
    thieu := array_append(thieu, 'diện tích');
  end if;

  -- 3. Kết cấu & công năng (15): tầng 8 · phòng ngủ 7 (loại khác đổi nghĩa).
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

  -- 6. Tiềm năng sử dụng (10, trước 20 — nhường 10 cho ảnh, 09/09/2026):
  --    chủ/bot nêu rõ → 10; suy được từ dữ liệu → 5.
  if f ? 'tiem_nang' then d_tn := 10;
  elsif coalesce(l.floors, 0) >= 3 or coalesce(l.bedrooms, 0) >= 3
     or l.access_type = 'mat_tien' or coalesce(l.alley_width_m, 0) >= 4
     or l.property_type in ('chung_cu', 'mat_bang', 'phong_tro', 'biet_thu') or (f ? 'san_vuon')
     or mo_ta ~ '(kinh doanh|cho thue|chdv|dau tu|van phong|o ngay|buon ban|mo shop|mo quan)'
  then d_tn := 5; thieu := array_append(thieu, 'tiềm năng sử dụng (ở, cho thuê hay kinh doanh)');
  else thieu := array_append(thieu, 'tiềm năng sử dụng (ở, cho thuê hay kinh doanh)'); end if;

  -- 7. Lời gọi hành động (10): tin có mã → khách nhắn Zalo (DH-02).
  if l.code is not null then d_cta := 10; end if;

  -- 8. Ảnh (10) — "có 3 ảnh thì tính đủ, ảnh nào cũng được" (chủ dự án 09/09/2026).
  d_anh := case when so_anh >= 3 then 10 when so_anh = 2 then 7 when so_anh = 1 then 4 else 0 end;
  if so_anh = 0 then thieu := array_append(thieu, 'vài tấm ảnh (nhà, sổ, hẻm — ảnh nào cũng được)');
  elsif so_anh < 3 then thieu := array_append(thieu, format('thêm ảnh cho đủ 3 tấm (đang có %s)', so_anh)); end if;

  return jsonb_build_object(
    'diem', d_vi_tri + d_dt + d_kc + d_pl + d_gia + d_tn + d_cta + d_anh,
    'chi_tiet', jsonb_build_object(
      'vi_tri_hem', d_vi_tri, 'dien_tich', d_dt, 'ket_cau', d_kc, 'phap_ly', d_pl,
      'gia', d_gia, 'tiem_nang', d_tn, 'goi_hanh_dong', d_cta, 'anh', d_anh),
    'thieu', to_jsonb(thieu),
    'co_anh', co_anh,
    'so_anh', so_anh);
end $function$;

comment on function public.diem_tin(public.listings) is
  'FR-177 d/f: điểm đầy đủ 0–100 TIỀN ĐỊNH. 8 mục: vị trí & hẻm 15 · diện tích 20 · kết cấu 15 · pháp lý 10 · giá 10 · tiềm năng 10 (nêu rõ 10 / suy được 5) · gọi hành động 10 · ẢNH 10 theo số tấm 1/2/≥3 = 4/7/10, ảnh nào cũng tính (09/09/2026, lấy từ tiềm năng). Trả {diem, chi_tiet, thieu[], co_anh, so_anh}; thieu[] tự nói còn thiếu mấy tấm.';

-- ── 4. Drip hỏi bù cả tin đã đăng (tạo từ chat, chủ chưa nói đủ) ─────────────
create or replace function public.seller_drip_tick()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; n int := 0;
begin
  for r in
    with asked as (
      select l2.seller_id, count(distinct q.listing_id) as c
      from info_requests q join listings l2 on l2.id = q.listing_id
      where q.created_at > now() - interval '24 hours'
      group by l2.seller_id
    ),
    cand as (
      select l.id, l.seller_id, l.created_at, coalesce(a.c, 0) as asked24,
             row_number() over (partition by l.seller_id order by l.created_at desc) as rn
      from listings l
      join sellers s on s.id = l.seller_id
      left join asked a on a.seller_id = l.seller_id
      where (l.status = 'cho_thong_tin'
             -- FR-177 f: tin ĐÃ ĐĂNG tạo từ chat vẫn được hỏi bù cho tới khi hết
             -- thứ để hỏi hoặc chủ nói đủ. Tin Excel/admin để yên (OPEN-50 (1)).
             or (l.status = 'dang_ban' and l.can_chu_duyet))
        and l.chu_noi_du_at is null
        and (s.zalo_user_id is not null or l.created_at > now() - interval '7 days')
        and exists (select 1 from listing_missing_facts m where m.listing_id = l.id)
        and not exists (select 1 from info_requests q
                          where q.listing_id = l.id and q.status = 'pending')
        and (select count(*) from info_requests q
               where q.listing_id = l.id and q.created_at > now() - interval '24 hours') < 3
    )
    -- rn + asked24 <= 2: một người bán không bị hỏi quá 2 căn trong 24h
    select id from cand where rn + asked24 <= 2 order by created_at desc limit 10
  loop
    perform ask_seller_drip(r.id);
    n := n + 1;
  end loop;
  return n;
end $function$;

comment on function public.seller_drip_tick() is
  'FR-129/144/177 f: nhịp hỏi nhỏ giọt (cron seller-drip-tick 30 phút, 8h–20h VN). Từ 09/09/2026 hỏi bù cả tin dang_ban tạo từ chat (can_chu_duyet) còn thiếu fact và chủ chưa nói đủ (chu_noi_du_at null). Trần: 3 câu/24h/tin, 2 căn/người/24h, 10 tin/nhịp.';

-- ── 5. Câu hỏi bù đầu tiên 5 phút sau khi gật ────────────────────────────────
create or replace function public.seller_hoi_bu_tick()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; n int := 0;
begin
  for r in
    select l.id
      from listings l
      join sellers s on s.id = l.seller_id
     where l.can_chu_duyet
       and l.chu_duyet_at between now() - interval '20 minutes' and now() - interval '5 minutes'
       and l.chu_noi_du_at is null
       and l.status in ('dang_ban', 'cho_thong_tin')
       and exists (select 1 from listing_missing_facts m where m.listing_id = l.id)
       -- ask-seller mở info_requests là dấu "đã hỏi": chạy lại không hỏi hai lần.
       and not exists (select 1 from info_requests q
                         where q.listing_id = l.id and q.created_at > l.chu_duyet_at)
     order by l.chu_duyet_at
     limit 10
  loop
    perform ask_seller_drip(r.id);
    n := n + 1;
  end loop;
  return n;
end $function$;

revoke all on function public.seller_hoi_bu_tick() from public, anon, authenticated;
grant execute on function public.seller_hoi_bu_tick() to service_role;
comment on function public.seller_hoi_bu_tick() is
  'FR-177 f: 5 phút sau khi chủ gật bản nháp (chu_duyet_at), hỏi bù MỘT thông tin còn thiếu qua ask_seller_drip. Cửa sổ 5–20 phút + "chưa có info_request nào sau lúc gật" → chạy lại được, không hỏi trùng. Cron seller-hoi-bu-tick */5 1-13 UTC.';

-- `cron.schedule` với jobname đã có thì cập nhật lịch, giữ jobid (20260902c).
select cron.schedule('seller-hoi-bu-tick', '*/5 1-13 * * *', $$select seller_hoi_bu_tick()$$);

-- ── 6. so.ro_hang: thêm cột gấp (cuối bảng — view chỉ cho thêm cột ở đuôi) ───
create or replace view so.ro_hang
  with (security_invoker = true) as
select
  l.legacy_sst                                            as stt,
  case l.deal when 'ban' then 'Bán' else 'Cho thuê' end   as ban_hay_thue,
  regexp_replace(
    regexp_replace(trim(l.location_raw), E'\\r?\\n', ' — ', 'g'),
    E'(,\\s*Quận 5)?,\\s*(tp\\.?|thành phố)?\\s*Hồ Chí Minh\\.?\\s*$', '', 'i')
                                                          as vi_tri,
  replace(l.area_m2::text, '.', ',') || ' m²'             as dien_tich,
  coalesce(l.price_raw,
           replace(round(l.price_vnd::numeric / 1e9, 2)::text, '.', ',') || ' tỷ')
                                                          as gia,
  regexp_replace(
    regexp_replace(trim(both E' \r\n\t' from l.description),
                   E'\\s*\\r?\\n\\s*[-•+*]?\\s*', ' · ', 'g'),
    E'^[-•+*]\\s*', '')                                    as mo_ta,
  s.phone                                                 as so_dien_thoai,
  s.name                                                  as nguoi_ban,
  l.code                                                  as ma_tin,
  case l.property_type
    when 'nha_pho'   then 'nhà phố'   when 'nha_cap4'  then 'nhà cấp 4'
    when 'chung_cu'  then 'chung cư'  when 'dat'       then 'đất'
    when 'biet_thu'  then 'biệt thự'  when 'phong_tro' then 'phòng trọ'
    when 'mat_bang'  then 'mặt bằng'  else 'chưa rõ' end  as loai,
  case l.status
    when 'cho_thong_tin' then 'chờ thông tin' when 'dang_ban'      then 'đang bán'
    when 'dang_quan_tam' then 'đang quan tâm' when 'da_chot'       then 'đã chốt'
    when 'an'            then 'ẩn'            else l.status end     as trang_thai,
  (select count(*) from public.media m where m.listing_id = l.id)
  + (select count(*) from public.listing_media lm where lm.listing_id = l.id)
                                                          as so_anh,
  'https://nhadat.cc/nha-dat/' || l.code                  as link_web,
  l.source_url                                            as nguon,
  l.created_at::date                                      as ngay_vao,
  l.id,
  case l.gap when true then 'gấp' when false then 'không gấp' else '' end as gap
from public.listings l
left join public.sellers s on s.id = l.seller_id
order by l.legacy_sst nulls last, l.created_at;

comment on column so.ro_hang.gap is
  'listings.gap: "gấp" / "không gấp" / trống = chưa rõ (chủ dự án 09/09/2026).';

-- ── 7. Fact vi_tri (vị trí cụ thể) — nhóm cơ bản, mọi loại BĐS ───────────────
insert into public.required_facts (property_type, fact_key, priority, nhom)
select pt, 'vi_tri', 3, 'co_ban'
  from unnest(enum_range(null::public.property_type)) as pt
on conflict (property_type, fact_key) do nothing;

-- Xếp lại priority nhóm cơ bản (cùng cách 20260907h), vi_tri đứng ngay sau phường.
with xep as (
  select property_type, fact_key,
         case nhom
           when 'co_ban' then array_position(
             array['loai_bds', 'phuong', 'vi_tri', 'dien_tich', 'dien_tich_dat', 'dien_tich_tim_tuong', 'mat_tien', 'tho_cu', 'gia'],
             fact_key)
           when 'chuyen_mon' then 9 + row_number() over (partition by property_type, nhom order by priority, fact_key)
           else 19 + row_number() over (partition by property_type, nhom order by priority, fact_key)
         end as p
    from public.required_facts
)
update public.required_facts rf set priority = xep.p
  from xep where xep.property_type = rf.property_type and xep.fact_key = rf.fact_key
    and xep.p is not null;

-- View: "đã có vị trí" khi location_raw có chữ (tin Excel/admin không bị hỏi lại).
-- Cùng tập cột → create or replace giữ quyền đã cấp (chỉ service_role, 20260908a).
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
      -- 20260909a: vị trí cụ thể đã có trong cột thì không hỏi.
      or (rf.fact_key = 'vi_tri' and coalesce(btrim(l.location_raw), '') <> '')
      or (rf.fact_key = 'hinh_anh'
          and exists (select 1 from public.listing_media m where m.listing_id = l.id))
    )
  order by l.id, rf.priority, rf.fact_key;

comment on view public.listing_missing_facts is
  '[RỔ HÀNG] Câu còn thiếu của từng tin, xếp theo priority của required_facts — đây là THỨ TỰ BOT HỎI. FR-177: nhóm co_ban (loại, phường, VỊ TRÍ CỤ THỂ, diện tích, giá) trước, rồi chuyen_mon (hẻm → kết cấu → pháp lý → ảnh); phu (hướng, quy hoạch, năm xây) bị lọc hẳn (20260908a). Không lọc status: tin dang_ban tạo từ chat vẫn được hỏi bù (20260909a). "Đã có" đọc từ cả fact lẫn cột lẫn listing_media.';

-- Fact vi_tri → listings.location_raw (street tự bóc ở listings_boc_thong_so).
create or replace function public.trg_vi_tri_vao_cot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.question = 'vi_tri' and coalesce(btrim(new.answer), '') <> '' then
    update public.listings
       set location_raw = btrim(new.answer)
     where id = new.listing_id
       and (coalesce(btrim(location_raw), '') = ''
            or new.source ilike 'admin%' or new.source ilike 'ctv%');
  end if;
  return null;
end $$;

revoke all on function public.trg_vi_tri_vao_cot() from public, anon, authenticated;
grant execute on function public.trg_vi_tri_vao_cot() to service_role;
comment on function public.trg_vi_tri_vao_cot() is
  'FR-177 (09/09/2026): fact vi_tri (vị trí cụ thể chủ nhà trả lời) → listings.location_raw khi cột trống, hoặc khi nguồn là admin/CTV.';

drop trigger if exists trg_zz_vi_tri_vao_cot on public.listing_facts;
create trigger trg_zz_vi_tri_vao_cot
  after insert on public.listing_facts
  for each row execute function public.trg_vi_tri_vao_cot();

-- nhan_fact: nhãn tiếng người cho vi_tri (tin báo CTV/admin "cần: …").
create or replace function public.nhan_fact(p_key text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case p_key
    when 'gia' then 'giá mong muốn'
    when 'phuong' then 'phường'
    when 'vi_tri' then 'vị trí cụ thể (đường, số nhà, hẻm)'
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

-- ── 9. Luật giọng người bán: hiểu ngữ cảnh, không nịnh, xuống dòng, xin chấm điểm ──
-- (chủ dự án 09/09/2026). Cùng chữ với SELLER_SCRIPT_RULES trong _shared/prompts.ts.
update public.bot_prompts
   set content = replace(content,
       E'- Với môi giới nhiều căn: gọn, chuyên nghiệp, mỗi lần hỏi một căn, nhắc rằng trả lời giúp căn dễ tới khách hơn.',
       E'- Với môi giới nhiều căn: gọn, chuyên nghiệp, mỗi lần hỏi một căn, nhắc rằng trả lời giúp căn dễ tới khách hơn.\n- HIỂU NGỮ CẢNH CĂN NHÀ trước khi nói: loại nhà, khu, hẻm hay mặt tiền, tầm giá — câu nào cũng phải đúng với căn đó (nhà cấp 4 thì đừng hỏi mấy lầu, chung cư thì đừng khen hẻm). Lễ phép, tự nhiên như người thật; KHÔNG câu nào cũng khen — chỉ khen khi có điểm thật đáng nói, còn lại chỉ ghi nhận rồi hỏi tiếp. Nịnh liên tục là giọng máy.\n- XUỐNG DÒNG khi tin có từ hai ý trở lên: mỗi ý một dòng, câu hỏi đứng dòng cuối. Một ý ngắn thì một dòng.\n- KẾT THÚC (chủ nói đủ rồi, hoặc hết thứ để hỏi): hệ thống tự xin chủ nhà chấm điểm cách em chăm sóc (giống người thật không, mất thời gian không, mấy điểm). Chủ trả lời thì cảm ơn ngắn, KHÔNG hỏi lại điểm, không bào chữa.'),
       updated_at = now()
 where key = 'seller_script_rules'
   and content not like '%HIỂU NGỮ CẢNH CĂN NHÀ%';

-- ── 8. Bỏ "định giá" trong few-shot người bán (cùng chữ với _shared/prompts.ts) ──
update public.bot_prompts
   set content = replace(content,
       'Nhà mình ở đường nào, quận mấy để em xem giá khu đó trước ạ?',
       'Nhà mình ở đường nào, số mấy hay hẻm nào, quận mấy ạ?'),
       updated_at = now()
 where key = 'seller_fewshot'
   and content like '%để em xem giá khu đó trước ạ?%';
