-- 20260908g — vá ba lỗi lộ ra khi soát 20260908c/d/e trên DB thật (08/09/2026),
-- và ghi lại vào repo hai hàm đã bị sửa thân ngoài migration.
--
-- 1. next_listing_code(text,text,text): chuỗi if/elsif thử 'QUAN1|^Q1' TRƯỚC
--    'QUAN10' và không neo cuối, nên Quận 10 / 11 / 12 đều thành 'Q1' — mã tin
--    Q10 đẻ ra là BDS-NP-Q1-0001 và dùng chung bộ đếm với Quận 1 thật. Quận
--    không có trong danh sách (Q4, Q7, Q9…) thì rơi thẳng chữ thô 'QUAN4' vào mã.
--    Nay: quận số đi qua MỘT nhánh neo hai đầu '^(QUAN|Q)?([0-9]{1,2})$' → 'Q<n>'.
--    Thu hồi EXECUTE của authenticated luôn (20260908c chỉ thu hồi public, anon;
--    default privileges cấp lại cho authenticated) — cùng lý do 20260829d thu
--    hồi bản 0 tham số: hàm giữ advisory lock, chạy definer, chỉ trigger gọi.
--
-- 2. trg_listing_thong_bao_tao_tin(): `coalesce(new.property_type, 'BĐS')` —
--    property_type là ENUM, chuỗi 'BĐS' không phải nhãn hợp lệ, Postgres ném
--    22P02 ngay lúc chạy câu format, TRƯỚC khi gọi canh_bao_ngoai. Khối
--    `exception when others then return new` nuốt sạch. Đo: `select
--    coalesce(null::property_type,'BĐS')` → "invalid input value for enum
--    property_type". Tức mục 4 của 20260908e ("báo khi có tin mới") CHƯA TỪNG
--    chạy được một lần, và không dòng nào trong bot_errors nói ra. Nay ép ::text
--    và nhánh exception ghi log_loi (CLAUDE.md §6: catch mới phải nối dây vào sổ).
--
-- 3. trg_info_request_thong_bao_khach_hoi(): bắn còi cho MỌI dòng info_requests,
--    kể cả hàng đợi hỏi chủ nhà của chính bot (source = 'seller_chat',
--    buyer_id null, question là TÊN CỘT như 'dien_tich'). 24 giờ qua: 12 dòng
--    seller_chat, 0 dòng buyer_ask → 12 tin "[KHÁCH HỎI BĐS] Khách vừa hỏi về
--    căn : "dien_tich"" mà không có khách nào. Đúng lỗi 20260908a §2 vừa vá cho
--    notify_info_request_escalation (lọc source = 'buyer_ask'). Nay lọc y hệt.
--
-- 4. mark_listing_interest (2 chữ ký): thân hàm trên DB có `or legacy_code =
--    any(p_codes)` (đi cùng 20260908c) nhưng KHÔNG file migration nào chứa —
--    chỉ schema.sql chụp lại. soat-migration.mjs so DANH SÁCH, soat-truy-vet so
--    TÊN hàm, nên thân hàm trôi là vô hình với cả hai lưới. Ghi lại nguyên văn
--    bản đang chạy để repo dựng lại được (OPEN-46).
--
-- 5. Quyền + chú thích còn thiếu của 20260908d/e: hai hàm trigger thu hồi
--    EXECUTE khỏi anon/authenticated (advisor 0028/0029, cùng cách 20260905e);
--    comment on cho 5 hàm mới.

-- ── 1. next_listing_code ────────────────────────────────────────────────────
create or replace function public.next_listing_code(p_property_type text default null, p_district text default null, p_province text default null)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_type text;
  v_loc text;
  v_so text;
  v_prefix text;
  v_num int;
begin
  perform pg_advisory_xact_lock(hashtext('listing_code'));

  -- Chuẩn hoá loại BĐS
  v_type := case lower(coalesce(p_property_type, 'nha_pho'))
    when 'chung_cu' then 'CH'
    when 'can_ho' then 'CH'
    when 'dat' then 'DAT'
    when 'dat_nen' then 'DAT'
    when 'biet_thu' then 'BT'
    when 'nha_cap4' then 'C4'
    when 'mat_bang' then 'MB'
    when 'phong_tro' then 'PT'
    else 'NP'
  end;

  -- Chuẩn hoá khu vực (quận/huyện hoặc tỉnh)
  v_loc := public.bo_dau(coalesce(p_district, p_province, 'Q5'));
  v_loc := upper(regexp_replace(v_loc, '[^a-zA-Z0-9]', '', 'g'));

  -- Quận số: 'QUAN10' / 'Q10' / '10' → 'Q10'. Neo hai đầu, nên 'QUAN10' không
  -- còn khớp nhánh Quận 1 (lỗi bản 20260908c).
  v_so := (regexp_match(v_loc, '^(?:QUAN|Q)?([0-9]{1,2})$'))[1];
  if v_so is not null then
    v_loc := 'Q' || v_so::int;
  elsif v_loc ~ 'BINHTAN' then v_loc := 'BINHTAN';
  elsif v_loc ~ 'BINHTHANH' then v_loc := 'BINHTHANH';
  elsif v_loc ~ 'TANBINH' then v_loc := 'TANBINH';
  elsif v_loc ~ 'TANPHU' then v_loc := 'TANPHU';
  elsif v_loc ~ 'GOVAP' then v_loc := 'GOVAP';
  elsif v_loc ~ 'THUDUC' then v_loc := 'THUDUC';
  elsif v_loc ~ 'BINHDUONG' then v_loc := 'BINHDUONG';
  elsif v_loc ~ 'TAYNINH' then v_loc := 'TAYNINH';
  elsif v_loc ~ 'DONGNAI' then v_loc := 'DONGNAI';
  elsif v_loc ~ 'LONGAN' then v_loc := 'LONGAN';
  end if;

  if v_loc is null or v_loc = '' then v_loc := 'Q5'; end if;

  v_prefix := 'BDS-' || v_type || '-' || v_loc || '-';

  select coalesce(max((regexp_match(code, '^' || v_prefix || '([0-9]+)$'))[1]::int), 0) + 1
    into v_num
    from listings
   where code ~ ('^' || v_prefix || '[0-9]+$');

  return v_prefix || lpad(v_num::text, 4, '0');
end;
$function$;

revoke all on function public.next_listing_code(text, text, text) from public, anon, authenticated;
grant execute on function public.next_listing_code(text, text, text) to service_role;
comment on function public.next_listing_code(text, text, text) is
  'Cấp mã tin BDS-[LOẠI]-[KHUVỰC]-[SỐ] (20260908c, sửa quận số ở 20260908g). Chỉ trigger listings_fill_code gọi; giữ advisory lock listing_code.';

-- ── 2. trg_listing_thong_bao_tao_tin ────────────────────────────────────────
create or replace function public.trg_listing_thong_bao_tao_tin()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_title text;
  v_text text;
begin
  v_title := '[TIN MỚI] ' || coalesce(new.code, 'BĐS');
  v_text := format('Có tin BĐS mới vừa được tạo: %s · %s%s · Giá: %s · DT: %sm2. Trạng thái: %s',
                   coalesce(new.code, 'Chưa mã'),
                   coalesce(new.property_type::text, 'BĐS'),
                   case when new.location_raw is not null then ' tại ' || new.location_raw else '' end,
                   coalesce(new.price_raw, 'Thương lượng'),
                   coalesce(new.area_m2::text, '-'),
                   case when new.status = 'cho_thong_tin' then 'Chờ thông tin'
                        when new.status = 'dang_ban' then 'Đang bán'
                        else new.status end);
  perform public.canh_bao_ngoai(v_title, v_text, 4, false);
  return new;
exception when others then
  -- Còi hỏng không được chặn INSERT, nhưng cũng không được im: 20260908e nuốt
  -- lỗi enum ở đây suốt từ lúc áp mà không ai biết.
  perform public.log_loi('trg_listing_thong_bao_tao_tin', left(sqlerrm, 400), null::integer);
  return new;
end $function$;

revoke all on function public.trg_listing_thong_bao_tao_tin() from public, anon, authenticated;
grant execute on function public.trg_listing_thong_bao_tao_tin() to service_role;
comment on function public.trg_listing_thong_bao_tao_tin() is
  'AFTER INSERT listings → canh_bao_ngoai (ntfy) báo có tin mới (20260908e; sửa ép enum ::text ở 20260908g).';

-- ── 3. trg_info_request_thong_bao_khach_hoi ─────────────────────────────────
create or replace function public.trg_info_request_thong_bao_khach_hoi()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_bds text;
  v_buyer text;
begin
  -- Chỉ câu hỏi THẬT của người mua. Dòng source = 'seller_chat' là hàng đợi
  -- bot hỏi chủ nhà (question = tên cột), 'bot' là việc nội bộ — không phải khách.
  if new.source is distinct from 'buyer_ask' then return new; end if;

  if new.question is not null and btrim(new.question) <> '' then
    select coalesce('#' || code, '') into v_bds from listings where id = new.listing_id;
    select coalesce(name, 'Khách hàng') into v_buyer from buyers where id = new.buyer_id;

    perform public.canh_bao_ngoai(
      format('[KHÁCH HỎI BĐS] %s', coalesce(v_bds, 'Tin')),
      format('%s vừa hỏi về căn %s: "%s". Cần kiểm tra và hỗ trợ khách.',
             coalesce(v_buyer, 'Khách'),
             coalesce(v_bds, ''),
             left(new.question, 300)),
      4, false);
  end if;
  return new;
exception when others then
  perform public.log_loi('trg_info_request_thong_bao_khach_hoi', left(sqlerrm, 400), null::integer);
  return new;
end $function$;

revoke all on function public.trg_info_request_thong_bao_khach_hoi() from public, anon, authenticated;
grant execute on function public.trg_info_request_thong_bao_khach_hoi() to service_role;
comment on function public.trg_info_request_thong_bao_khach_hoi() is
  'AFTER INSERT info_requests, CHỈ source = buyer_ask → canh_bao_ngoai báo khách hỏi (20260908e; lọc source ở 20260908g).';

-- ── 4. mark_listing_interest — ghi lại thân đang chạy (có legacy_code) ──────
create or replace function public.mark_listing_interest(p_codes text[])
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  n int;
begin
  update public.listings
  set status = 'dang_quan_tam', last_interest_at = now()
  where (code = any(p_codes) or legacy_code = any(p_codes))
    and status in ('dang_ban', 'dang_quan_tam');
  get diagnostics n = row_count;
  return n;
end $function$;

create or replace function public.mark_listing_interest(p_codes text[], p_buyer_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare n int;
begin
  n := public.mark_listing_interest(p_codes);
  if p_buyer_id is not null then
    insert into interests (buyer_id, listing_id)
    select p_buyer_id, l.id from listings l
     where (l.code = any(p_codes) or l.legacy_code = any(p_codes))
       and l.status in ('dang_ban', 'dang_quan_tam', 'da_chot')
    on conflict (buyer_id, listing_id) do nothing;
  end if;
  return n;
end $function$;

-- ── 5. Chú thích còn thiếu của 20260908d ────────────────────────────────────
comment on function public.admin_gan_bds_quan_tam(uuid, text) is
  'Admin gắn BĐS khách quan tâm theo mã (code hoặc legacy_code); ghi interests, đổi trạng thái tin (20260908d).';
comment on function public.admin_xoa_bds_quan_tam(uuid, uuid) is
  'Admin bỏ một BĐS khỏi danh sách quan tâm của khách (20260908d).';
comment on function public.admin_cap_nhat_khach(uuid, jsonb, text) is
  'Admin sửa preferences/notes của người mua từ trang CRM (20260908d).';
