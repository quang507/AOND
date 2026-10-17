-- 20260911e — vá tầng bóc tách SQL theo lượt bắn 42 câu thử ngày 11/09/2026.
--
-- Chủ dự án 11/09/2026: "bắn thêm mấy chục loại câu … xem logic bóc tách có gì".
-- 42 kịch bản (người thử `thu-cau-01` … `thu-cau-42`, cron 21:00 đã dọn) đọc
-- lại DB bằng bong bóng 💾 lòi ra các lỗi dưới đây — mỗi mục ghi đúng câu gây lỗi.
-- Bản TS của luật tiền (`_shared/extraction/luat-tien.ts`) sửa CÙNG lượt; hai
-- bản chạy chung bảng ca `bot/tests/luat/tien.json` (bài doi-chieu-tien.mjs).
--
--   1. parse_vnd
--      · "75 triệu/m2, diện tích 50m2" → price_vnd = 75 triệu cho CẢ căn. Giá mỗi
--        m² nay trả NULL (chat-reply tự nhân với diện tích nếu có).
--      · "3tr5 một tháng" → không đọc được. "tr" kẹp giữa hai số = 3,5 triệu.
--      · "3 triệu 5" → 3 triệu. Phần lẻ sau triệu nay được đọc (trừ khi số sau
--        là số lượng: "cọc 3 triệu 2 tháng", "15 triệu 2 phòng ngủ").
--   2. chuan_hoa_gia_raw — "4 tỷ rưỡi" bị gọt còn "4 tỷ" TRƯỚC khi parse_vnd
--      chạy (trigger chuan_hoa_cot đứng trước price_vnd theo tên) → căn 4,5 tỷ
--      lên web giá 4 tỷ. Cụm giá nay giữ "rưỡi".
--   3. guess_property_type — "bán căn 2PN Sunrise City Q7 tầng 15" thành NHÀ PHỐ.
--      "căn + số phòng ngủ" nay là chung cư.
--   4. boc_thong_so — số dính SAU chữ cái bị đọc thành số tầng: "q5 tầm 5 tỷ" →
--      "5 tam" → floors = 5; "Q7 tầng 15" → floors = 7. Ba luật tầng/lầu/tấm nay
--      đòi con số đứng ĐẦU TỪ (\m). Vá tại chỗ trên định nghĩa đang chạy (hàm dài
--      ~11.500 ký tự; chép lại cả hàm vào đây là mời lệch một chữ): không thấy
--      đoạn cần vá thì DỪNG, đã vá rồi thì bỏ qua — chạy lại không hại gì.
--   5. doc_gap — `\mvoi\M` trên chữ đã bỏ dấu: "với" = "vội", nên "để anh bàn
--      với vợ" thành gap = true. Nay chỉ nhận "vội" CÒN DẤU ("không vội" vẫn là
--      false như cũ, vì nhánh phủ định đứng trước).
--
--   6. trg_vi_tri_vao_cot — địa chỉ chủ nhà nhắn SAU không đè được địa chỉ rác đã
--      ghi trước (Zalo thật, dự án ehome 3). Xem mục 6 cuối file.
--
-- KHÔNG sửa ở đây: `match_projects` bị statement timeout khi ~20 tin vào cùng
-- lúc (20 dòng bot_errors lúc bắn thử) — cần dựng bảng từ khoá có chỉ mục, để
-- lượt riêng.

-- ── 1. parse_vnd ────────────────────────────────────────────────────────────
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
  -- Gia MOI m2 khong phai gia ca can (luat-tien.ts GIA_THEO_M2).
  if t ~ '(tỷ|tỉ|tỏi|triệu|trieu|tr|củ|cu|ty|ti)\s*(/|mỗi|moi|một|mot|1)\s*(m2|m²|mét|met|m\M)' then
    return null;
  end if;
  ruoi := t ~ 'rưỡi|rươi|ruoi';

  t := regexp_replace(t, 'tỏi|tỷ|tỉ|tị|tỹ', ' _ty ', 'g');
  t := regexp_replace(t, 'triệu|trieu|củ',  ' _trieu ', 'g');

  t := regexp_replace(t, '([0-9])\s*ty\s*([0-9])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*tr\s*([0-9])', '\1 _trieu \2', 'g');
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

  -- Phan le sau trieu: "3 trieu 5" = 3,5 trieu | "3 trieu 500" = 3,5 trieu.
  -- So dung sau ma la so LUONG (thang, phong, m2...) thi khong phai phan le.
  m := regexp_match(t, '([0-9]+)\s*_trieu\s*([0-9]{1,3})(?![0-9.,]|\s*(m2|m²|mét|met|m\M|phòng|phong|pn|lầu|lau|tầng|tang|tấm|tam|wc|tháng|thang|năm|nam|người|nguoi|căn|can))');
  if m is not null then
    return (m[1]::numeric * 1e6
            + case when length(m[2]) = 1
                   then m[2]::numeric * 1e5
                   else m[2]::numeric * 1e3 end)::bigint;
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

-- ── 2. chuan_hoa_gia_raw: giữ "rưỡi" trong cụm giá ──────────────────────────
create or replace function public.chuan_hoa_gia_raw(p_text text)
 returns text
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  s   text := btrim(coalesce(p_text, ''));
  goc bigint := public.parse_vnd(p_text);
  t   text;
  m   text[];
  cum text;
begin
  if s = '' then return null; end if;

  t := public.bo_dau(s);
  m := regexp_match(t, '([0-9][0-9.,]*\s*(?:ty|ti|toi|trieu|tr|cu)\y(?:\s*[0-9]+)?(?:\s*ruoi)?(?:\s*/\s*(?:thang|nam|m2))?)');
  if m is not null then
    cum := btrim(substring(s from position(m[1] in t) for length(m[1])));
    if cum <> '' and public.parse_vnd(cum) is not null then
      return cum;
    end if;
  end if;

  loop
    t := public.bo_dau(s);
    m := regexp_match(
      t,
      '([[:space:],]+(nha|nhe|nhen|nhak|nho|a|ah|oi|em|anh|chi|do|day|luon|thoi|ok|nghen|he))$'
    );
    exit when m is null;
    s := btrim(substring(s from 1 for length(s) - length(m[1])));
    exit when s = '';
  end loop;

  if s = '' then return btrim(p_text); end if;
  if public.parse_vnd(s) is distinct from goc then return btrim(p_text); end if;
  return s;
end;
$function$;

-- ── 3. guess_property_type: "căn 2PN" là chung cư ───────────────────────────
create or replace function public.guess_property_type(p_text text)
 returns property_type
 language sql
 immutable
 set search_path to 'public'
as $function$
  with t as (select public.bo_dau(coalesce(p_text, '')) as s)
  select (case
    when (select btrim(s) from t) = '' then null
    when (select s from t) ~ '(kho bai|kho xuong|nha xuong|nha kho|\mkho\M|\mxuong\M)'                     then 'kho_xuong'
    when (select s from t) ~ '(dat nong nghiep|dat vuon|dat lua|dat trong cay|dat ruong|\mcln\M|dat ray|dat trang trai)' then 'dat_nong_nghiep'
    when (select s from t) ~ '(dat skc|dat tmd|thuong mai dich vu|san xuat kinh doanh|dat kinh doanh|dat thuong mai)' then 'dat_kinh_doanh'
    when (select s from t) ~ '(can ho dich vu|\mchdv\M|khach san|toa nha|\mbuilding\M|nha nghi|day phong cho thue|toa nha van phong)' then 'toa_nha'
    when (select s from t) ~ '(phong tro|nha tro|day tro|khu tro|phong cho thue)'   then 'phong_tro'
    when (select s from t) ~ '(biet thu|villa|\mbt\M)'                              then 'biet_thu'
    when (select s from t) ~ '(mat bang|\mmb\M)'                                    then 'mat_bang'
    when (select s from t) ~ '(chung cu|can ho|canho|penthouse|duplex|officetel|\mcc\M|\mch\M|\mcan\M ?[0-9]+ ?(pn|phong ngu))' then 'chung_cu'
    when (select s from t) ~ '(cap 4|cap bon|c4)'                                   then 'nha_cap4'
    when (select s from t) ~ '(dat nen|lo dat|nen dat|ban dat|dat tho cu|dat trong|\mdn\M)'
         and (select s from t) !~ '(tret|lau|tang|phong ngu|\mpn\M|\mwc\M)'         then 'dat'
    when (select s from t) ~ '(\mnha\M|nha pho|\mnp\M|tret|\mlau\M|tang|\mhem\M|mat tien|\mhxh\M|\mmt\M)' then 'nha_pho'
    else null
  end)::property_type
$function$;

-- ── 4. boc_thong_so: số tầng/lầu/tấm phải đứng đầu từ ───────────────────────
do $d$
declare
  d   text := pg_get_functiondef('public.boc_thong_so(text, text)'::regprocedure);
  cu  text[] := array[
    $q$regexp_match(k, '(\d+)\s*tam(\s*ruoi)?\M')$q$,
    $q$regexp_match(k, '(\d+)\s*lau\M')$q$,
    $q$regexp_match(k, '(\d+)\s*tang\M')$q$];
  moi text[] := array[
    $q$regexp_match(k, '\m(\d+)\s*tam(\s*ruoi)?\M')$q$,
    $q$regexp_match(k, '\m(\d+)\s*lau\M')$q$,
    $q$regexp_match(k, '\m(\d+)\s*tang\M')$q$];
  i   int;
begin
  for i in 1..3 loop
    continue when position(moi[i] in d) > 0;         -- đã vá ở lượt trước
    if position(cu[i] in d) = 0 then
      raise exception 'boc_thong_so: không thấy đoạn cần vá: %', cu[i];
    end if;
    d := replace(d, cu[i], moi[i]);
  end loop;
  execute d;
end
$d$;

-- ── 5. doc_gap: "với" không phải "vội" ──────────────────────────────────────
create or replace function public.doc_gap(p_text text)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when p_text is null or btrim(p_text) = '' then null
    when public.bo_dau(p_text) ~ '\m(khong|ko|k|chua|chang|dau co)\s*(can\s*)?(gap|voi)\M|\mduoc gia thi thoi\M|\mkhong voi\M|\mtu tu\M|\mban duoc gia\M' then false
    when public.bo_dau(p_text) ~ '\mgap\s*(doi|ba|lan|ruoi|[0-9])' then null
    when public.bo_dau(p_text) ~ '\mgap\M|\mcan tien\M|\m(ban|di|ra)\s*nhanh\M' or lower(p_text) ~ 'vội' then true
    else null end;
$function$;

-- ── 6. trg_vi_tri_vao_cot: địa chỉ MỚI của chủ nhà đè địa chỉ cũ của chủ nhà ──
-- 11/09/2026 (Zalo thật, dự án ehome 3): câu "Bạn phải ghi dự án chung cư ehome 3
-- chứ ở hồ ngọc lãm" vào location_raw (và street) nguyên câu. Lượt sau chủ nhà nhắn
-- địa chỉ đúng "Đường hồ ngọc lãm quận 8 phường 6", nhưng trigger chỉ ghi khi
-- location_raw còn TRỐNG → rác kẹt vĩnh viễn. Nay địa chỉ mới của chủ nhà đè bản
-- cũ, trừ khi admin/CTV đã ghi địa chỉ (bậc cao hơn). Street nào tự bóc từ
-- location_raw cũ thì xoá, để listings_boc_thong_so bóc lại từ bản mới; street do
-- người sửa tay (khác bản tự bóc) thì giữ.
create or replace function public.trg_vi_tri_vao_cot()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.question = 'vi_tri' and coalesce(btrim(new.answer), '') <> '' then
    update public.listings
       set location_raw = btrim(new.answer),
           street = case when street is not distinct from public.boc_ten_duong(location_raw) then null else street end
     where id = new.listing_id
       and (coalesce(btrim(location_raw), '') = ''
            or new.source ilike 'admin%' or new.source ilike 'ctv%'
            or not exists (
              select 1 from public.listing_facts f
               where f.listing_id = new.listing_id and f.question = 'vi_tri' and f.id <> new.id
                 and (f.source ilike 'admin%' or f.source ilike 'ctv%')));
  end if;
  return null;
end $function$;
