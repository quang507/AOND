-- 20260928f — FR-241: sửa phía DB cho lượt bắn 10 ca làm khó (28/09/2026, lx-70..79).
--
-- 1. parse_vnd đọc số viết bằng CHỮ trước đơn vị tiền ("chín tỷ rưỡi", "hai trăm triệu", "mười hai tỷ", "chín tỷ hai").
--    Cùng luật với luat-tien.ts soChuThanhSo; ca ở bot/tests/luat/tien.json (cổng doi-chieu:tien).
-- 2. boc_thong_so: tin đất không bóc kết cấu; "lâu năm/lâu đời/lâu dài…" không phải "lầu".
-- 3. ghi_fact_listing: đáp án câu vi_tri chỉ là "xã/phường/thị trấn …" thì ghi là phuong.
-- 4. nha_pho: câu số phòng ngủ lùi ra sau giá và pháp lý (chủ dự án 28/09: "để sau rồi hỏi").

CREATE OR REPLACE FUNCTION public.parse_vnd(p text)
 RETURNS bigint
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  t    text;
  m    text[];
  v    numeric;
  ruoi boolean;
  -- 20260928f (FR-241): so viet bang CHU — cung bang, cung thu tu voi luat-tien.ts SO_CHU / soChuThanhSo.
  so_chu text[] := array['một','mốt','mot','hai','ba','bốn','bon','tư','năm','nam','lăm','sáu','sau','bảy','bẩy','bay','tám','tam','chín','chin'];
  so_so  text[] := array['1','1','1','2','3','4','4','4','5','5','5','6','6','7','7','7','8','8','9','9'];
  don_vi text := '(?=\s*(tỷ|tỏi|tỉ|ty|triệu|trieu|củ|trăm|tram)(?![[:alpha:]]))';
  i int;
begin
  if p is null or btrim(p) = '' then return null; end if;
  t := lower(p);
  -- Gia MOI m2 khong phai gia ca can (luat-tien.ts GIA_THEO_M2).
  if t ~ '(tỷ|tỉ|tỏi|triệu|trieu|tr|củ|cu|ty|ti)\s*(/|mỗi|moi|một|mot|1)\s*(m2|m²|mét|met|m\M)' then
    return null;
  end if;
  -- 20260928f (FR-241, bắn thật lx-72 "giá chín tỷ rưỡi"): chữ số → chữ số CHỈ khi đứng ngay trước đơn vị tiền,
  -- hoặc trơ cuối câu ngay sau "tỷ" ("chín tỷ hai"). "năm 2020", "bán năm căn" giữ nguyên.
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![[:alnum:]])(mười|muoi)\s+' || so_chu[i] || don_vi, '1' || so_so[i], 'g');
    t := regexp_replace(t, '(?<![[:alnum:]])' || so_chu[i] || '\s+(mươi|muoi)(?![[:alpha:]])', so_so[i] || '0', 'g');
  end loop;
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![0-9])([1-9])0\s+' || so_chu[i] || don_vi, '\1' || so_so[i], 'g');
  end loop;
  t := regexp_replace(t, '(?<![[:alnum:]])(mười|muoi)' || don_vi, '10', 'g');
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![[:alnum:]])' || so_chu[i] || don_vi, so_so[i], 'g');
  end loop;
  t := regexp_replace(t, '([0-9])\s*(trăm|tram)(?![[:alpha:]])', '\100', 'g');
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(tỷ|tỏi|tỉ)\s+' || so_chu[i] || '(?!\s*[[:alnum:]])', '\1 ' || so_so[i], 'g');
  end loop;
  ruoi := t ~ 'rưỡi|rươi|ruoi';

  t := regexp_replace(t, 'tỏi|tỷ|tỉ|tị|tỹ', ' _ty ', 'g');
  t := regexp_replace(t, 'triệu|trieu|củ',  ' _trieu ', 'g');

  t := regexp_replace(t, '([0-9])\s*t[yi]\s*([0-9])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*tr\s*([0-9])', '\1 _trieu \2', 'g');
  -- 13/09/2026: "1t2l" / "1t 2l" la 1 tret 2 lau, khong phai 1,2 ty (luat-tien.ts).
  t := regexp_replace(t, '([0-9])\s*t\s*([0-9]{1,3})(?![0-9[:alpha:]])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*t[yi]\M',         '\1 _ty ',   'g');
  t := regexp_replace(t, '([0-9])\s*tr\M',         '\1 _trieu ', 'g');
  t := regexp_replace(t, '([0-9])\s*t\M(?!\s*[0-9]+\s*(l|lầu|lau)\M)', '\1 _ty ', 'g');

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

  -- 20260927b: số đồng viết đủ ("8.000.000.000", "8000000000"), không mở bằng 0, không phải số đo; 1 triệu..10 nghìn tỷ.
  m := regexp_match(t, '(?<![0-9.,])([1-9][0-9]{0,2}(?:[.,][0-9]{3}){2,}|[1-9][0-9]{6,12})(?![0-9.,]*[0-9])(?!\s*(m2|m²|mét|met|m\M))');
  if m is not null then
    v := regexp_replace(m[1], '[.,]', '', 'g')::numeric;
    if v >= 1e6 and v <= 1e13 then return v::bigint; end if;
  end if;

  return null;
exception when others then
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION public.boc_thong_so(p_text text, p_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  k text;
  k_ngang text;
  m text[];
  j jsonb := '{}'::jsonb;
  n_lau int; co_tret bool; co_lung bool; co_st bool; co_ham bool; co_apmai bool;
  parts text[];
  chung_cu bool := coalesce(p_type = 'chung_cu', false);
  -- 20260928f (FR-241): tin ĐẤT không có kết cấu — "còn lại cây lâu năm" từng thành "trệt + 1 lầu".
  la_dat bool := coalesce(p_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh'), false);
begin
  if p_text is null or btrim(p_text) = '' then return j; end if;
  k := public.bo_dau(p_text);
  k := regexp_replace(k, '(\d),(\d)', '\1.\2', 'g');
  k := regexp_replace(k, '\s+', ' ', 'g');
  k := replace(k, 'm²', 'm2');
  k := regexp_replace(k, '(\d)\s*m ?2\M', '\1m2', 'g');
  k := replace(k, 'm2', 'mv');
  k := regexp_replace(k, '(\d)m(\d)', '\1.\2', 'g');
  k := replace(k, 'mv', 'm2');
  k := regexp_replace(k, '(\d)\s*\*\s*(\d)', '\1 x \2', 'g');
  k := replace(k, 'hem hong', 'hemhong');
  k := regexp_replace(k, '\m2 ?mt\M', '2 mat tien', 'g');
  k_ngang := regexp_replace(k, '(cach|ra|toi|den|gan|sat|buoc ra|ke)\s*(mat tien|\mmt\M)\s*(?:chi|khoang|tam|hon|gan|duong)?[^,;.]{0,25}?\d+(?:\.\d+)?\s*m\M', ' ', 'g');

  m := regexp_match(k, '(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?');
  if m is not null and m[1]::numeric between 1.5 and 40 and m[2]::numeric between 3 and 150 then
    j := j || jsonb_build_object('frontage_m', m[1]::numeric, 'length_m', m[2]::numeric);
  end if;
  if j->>'frontage_m' is null then
    m := regexp_match(k_ngang, '(?:ngang|mat tien|chieu ngang|be ngang)\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)\s*m?\M');
    if m is not null and m[1]::numeric between 1.5 and 40 then j := j || jsonb_build_object('frontage_m', m[1]::numeric); end if;
  end if;
  if j->>'length_m' is null then
    m := regexp_match(k, '(?:dai|chieu dai|chieu sau)\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)\s*m?\M');
    if m is not null and m[1]::numeric between 3 and 150 then j := j || jsonb_build_object('length_m', m[1]::numeric); end if;
  end if;
  if j->>'frontage_m' is null and j->>'length_m' is not null then
    m := regexp_match(k, '(\d+(?:\.\d+)?)\s*m?\s*,?\s*(?:dai|chieu dai)\s*(?:hon|gan|:)?\s*\d');
    if m is not null and m[1]::numeric between 1.5 and 40 then j := j || jsonb_build_object('frontage_m', m[1]::numeric); end if;
  end if;
  m := regexp_match(k, 'no hau\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)');
  if m is not null and m[1]::numeric between 1.5 and 40 then j := j || jsonb_build_object('rear_width_m', m[1]::numeric); end if;

  m := regexp_match(k, '(?:cong nhan|dtcn|dt cn|so|so hong)\s*(?:thuc te|du)?\s*:?\s*(\d+(?:\.\d+)?)\s*m2');
  if m is not null and m[1]::numeric between 5 and 5000 then j := j || jsonb_build_object('legal_area_m2', m[1]::numeric); end if;
  m := regexp_match(k, '(?:dtxd|dt xd|dien tich xay dung|dt xay dung|dien tich san|dt san|dtsd|dt sd|dien tich su dung|dt su dung|tong dien tich san)\s*:?\s*(\d+(?:\.\d+)?)\s*m(?:2|\M)');
  if m is not null and m[1]::numeric between 5 and 20000 then j := j || jsonb_build_object('built_area_m2', m[1]::numeric); end if;

  if la_dat then
    null;
  elsif not chung_cu then
    co_tret  := k ~ '\mtret\M';
    co_lung  := k ~ '\mlung\M';
    co_st    := k ~ '(san thuong|\mst\M|mai tum)';
    co_ham   := k ~ '\mham\M';
    co_apmai := k ~ 'ap mai';
    n_lau := null;
    m := regexp_match(k, '(?:tong )?so tang\s*:?\s*(\d+)');
    if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('floors', m[1]::int); end if;
    if j->>'floors' is null
       and k !~ '(duoc xay|xay duoc|cho xay|co the xay|xay len|xay them|nang len|len duoc|len toi)\s*(?:len|toi|den|them|toi da)?\s*\d+\s*tam'
       and k !~ '(cap 4|nha c4|\mc4\M)' then
      m := regexp_match(k, '\m(\d+)\s*tam(\s*ruoi)?\M');
      if m is not null and m[1]::int between 1 and 30 then
        j := j || jsonb_build_object('floors', m[1]::int);
        if m[2] is not null then co_lung := true; end if;
      end if;
    end if;
    m := regexp_match(k, '\m(\d+)\s*lau\M');
    if m is not null and m[1]::int between 1 and 30 and j->>'floors' is null then n_lau := m[1]::int; end if;
    if n_lau is null then
      -- BỎ |t ở đây kẻo "7t" (7 tỷ) thành 7 tầng
      m := regexp_match(k, '\m(\d+)\s*tang\M');
      if m is not null and m[1]::int between 1 and 30 and j->>'floors' is null then
        j := j || jsonb_build_object('floors', m[1]::int);
      end if;
      if j->>'floors' is null and (k ~ '\mlau\M(?!\s*(nam|doi|dai|roi|qua|lam|ngay|nay))' or co_tret) then
        j := j || jsonb_build_object('floors', case when k ~ '\mlau\M(?!\s*(nam|doi|dai|roi|qua|lam|ngay|nay))' then 2 else 1 end);
      end if;
      if j->>'floors' is null and k ~ '(cap 4|nha c4|\mc4\M)' then j := j || jsonb_build_object('floors', 1); end if;
    else
      j := j || jsonb_build_object('floors', n_lau + 1);
    end if;
    if j->>'floors' is not null then
      parts := array[]::text[];
      if co_ham then parts := array_append(parts, 'hầm'); end if;
      parts := array_append(parts, 'trệt');
      if co_lung then parts := array_append(parts, 'lửng'); end if;
      if n_lau is not null then parts := array_append(parts, n_lau || ' lầu');
      elsif (j->>'floors')::int > 1 then parts := array_append(parts, ((j->>'floors')::int - 1) || ' lầu'); end if;
      if co_apmai then parts := array_append(parts, 'áp mái'); end if;
      if co_st then parts := array_append(parts, 'sân thượng'); end if;
      j := j || jsonb_build_object('floors_text', array_to_string(parts, ' + '));
    end if;
  else
    m := regexp_match(k, '(?:tang|lau)\s*(\d{1,2})\M');
    if m is not null and m[1]::int between 1 and 80 then j := j || jsonb_build_object('floor', m[1]::int); end if;
  end if;

  m := regexp_match(k, '(\d+)\s*(?:pn|phong ngu|p\.ngu)\M');
  if m is null then m := regexp_match(k, 'so phong ngu\s*:?\s*(\d+)'); end if;
  if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('bedrooms', m[1]::int); end if;
  m := regexp_match(k, '(\d+)\s*(?:wc|toilet|nha ve sinh|nvs|ve sinh|phong tam)\M');
  if m is null then m := regexp_match(k, '(?:so )?(?:phong ve sinh|phong tam|wc)\s*:?\s*(\d+)\M'); end if;
  if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('bathrooms', m[1]::int); end if;

  if k ~ '(nha|ban nha|can nha|can|ban|thue|cho thue)\s*(?:pho|rieng|dep|gap|nguyen can|moi)?\s*(hem|\mhxh\M|\mhxt\M)' then
    null;
  elsif k ~ '(cach|gan|sat|ra|toi|den|buoc ra|ke|ngay|\d+\s*m) (mat tien|\mmt\M)' and k !~ '(nha|ban|ban nha|can|lo)\s*(\d\s*)?mat tien' then
    null;
  elsif k ~ '(mat tien|\mmt\M|mat pho|mat duong|co via he|via he rong|le duong)' then
    j := j || jsonb_build_object('access_type', 'mat_tien');
  end if;
  if j->>'access_type' is null then
    if k ~ '(xe hoi|o ?to|xe tai|xe 4 banh)\s*(khong|ko|k|kg|chua)\s*(vo|vao|toi|den|duoc|lot|qua)' or k ~ '(khong|ko|k|kg|chua)\s*(co\s*)?(xe hoi|o ?to|xe tai)\s*(nao\s*)?(vo|vao|toi|duoc)' then j := j || jsonb_build_object('access_type', 'hem_xe_may');
    elsif k ~ '(hem xe tai|\mhxt\M|xe tai)' then j := j || jsonb_build_object('access_type', 'hem_xe_tai');
    elsif k ~ '(hem xe hoi|\mhxh\M|hem o ?to|hem xe con|xe hoi(?! (?:vo |vao |ngu |de |dau )?trong nha)|o ?to (vo|vao|dau|toi|do)|hem 7 cho|xe 7 cho)' then j := j || jsonb_build_object('access_type', 'hem_xe_hoi');
    elsif k ~ '(\mhxm\M|hem xe may|hem nho|hem ba gac|hem 3 gac|hem xe 3 banh|xe may)' then j := j || jsonb_build_object('access_type', 'hem_xe_may');
    elsif k ~ '\mhem\M' then j := j || jsonb_build_object('access_type', 'hem');
    end if;
  end if;
  m := regexp_match(k, '(?:hem|hxh|hxt|hxm|duong truoc nha|duong)\s*(?:xe hoi|xe tai|xe may|truoc nha|rong|thong)?\s*(?:rong)?\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)\s*m\M');
  if m is not null and m[1]::numeric between 1 and 40 then
    j := j || jsonb_build_object('alley_width_m', m[1]::numeric);
    if j->>'access_type' = 'hem' then
      j := j || jsonb_build_object('access_type', case when m[1]::numeric >= 6 then 'hem_xe_tai' when m[1]::numeric >= 3 then 'hem_xe_hoi' else 'hem_xe_may' end);
    end if;
  end if;
  m := regexp_match(k, '(?:cach|ra)\s*(?:mat tien|\mmt\M)\s*(?:chi|khoang|tam|hon|gan|duong)?\s*(?:[a-z ]{0,25}?)\s*(\d+(?:\.\d+)?)\s*m\M');
  if m is null then m := regexp_match(k, 'cach\s*(?:chi|khoang|tam)?\s*(\d+(?:\.\d+)?)\s*m\s*(?:la )?(?:ra|toi|den)\s*(?:mat tien|\mmt\M|duong)'); end if;
  if m is not null and m[1]::numeric between 5 and 500 then j := j || jsonb_build_object('distance_to_street_m', m[1]::numeric); end if;

  -- 20260923a: "chưa có sổ" / "không có sổ" / "đang làm sổ" là KHÔNG có sổ — bản cũ khớp "co so" ở giữa câu phủ định.
  if k ~ '(chua|khong|\mko\M|chang|dang cho|dang lam|chua ra)\s+(co\s+|ra\s+|lam\s+)?(so|shr|shc)\M' then null;
  elsif k ~ '(so hong rieng|\mshr\M|so rieng|so do rieng)' then j := j || jsonb_build_object('legal_status', 'so_hong_rieng');
  elsif k ~ '(so hong chung|\mshc\M|so chung|dong so huu)' then j := j || jsonb_build_object('legal_status', 'so_hong_chung');
  elsif k ~ '(hop dong mua ban|\mhdmb\M)' then j := j || jsonb_build_object('legal_status', 'hdmb');
  elsif k ~ '(giay tay|vi bang)' then j := j || jsonb_build_object('legal_status', 'giay_tay');
  elsif k ~ '(so hong|so do|\mshcc\M|so chinh chu|so dep|so vuong|so sach|so cam tay|\mso\M (day du|ro rang|chuan)|co so)' then j := j || jsonb_build_object('legal_status', 'so_hong');
  end if;
  if k ~ 'chua hoan cong' then j := j || jsonb_build_object('has_completion', false);
  elsif k ~ 'hoan cong' then j := j || jsonb_build_object('has_completion', true); end if;
  if k ~ '(khong lo gioi|khong dinh lo gioi|khong bi lo gioi|da bo lo gioi)' then j := j || jsonb_build_object('planning_status', 'khong_lo_gioi');
  elsif k ~ '(khong quy hoach|khong dinh quy hoach|khong quy hoach treo)' then j := j || jsonb_build_object('planning_status', 'khong_quy_hoach');
  elsif k ~ '(dinh lo gioi|co lo gioi|lo gioi \d|dinh quy hoach)' then j := j || jsonb_build_object('planning_status', 'dinh_lo_gioi');
  end if;

  if k ~ 'thang may' then j := j || jsonb_build_object('has_elevator', true); end if;
  if k ~ '(xe hoi (vo|vao|ngu|de) (trong )?nha|o ?to (vo|vao|ngu|dau) (trong |tan )?nha|dau (o ?to|xe hoi|xe oto) trong nha|san dau (o ?to|xe hoi)|\mgarage\M|ga ?ra ?ge|\mgara\M|xe hoi ngu trong nha|(o ?to|xe hoi) (vo|vao|toi) tan (cua|nha)|\d+ (xe hoi|o ?to|xe oto) (vo |vao |ngu |de |dau )?trong nha)' then
    j := j || jsonb_build_object('car_in_house', true);
  end if;
  if k ~ '(can goc|lo goc|nha goc|2 mat tien|hai mat tien|2 mat hem|hai mat hem|goc 2 mat|2 mat thoang)' then j := j || jsonb_build_object('corner_lot', true); end if;
  if k ~ '(full noi that|noi that day du|day du noi that|tang (toan bo |het |full |tat ca )?noi that|noi that cao cap|full nt|tang nt|nt cao cap|nt day du|noi that sang trong)' then j := j || jsonb_build_object('furnishing', 'full');
  elsif k ~ '(noi that co ban|nt co ban)' then j := j || jsonb_build_object('furnishing', 'co_ban');
  elsif k ~ '(khong noi that|nha trong(?!\s+(hem|ngo|kiet|ngach|khu|duong|xom|day|toa|chung cu|du an|kdc|so|lo))|khong co noi that)' then j := j || jsonb_build_object('furnishing', 'khong');
  end if;
  m := regexp_match(k, '(?:xay|xay dung|xd|hoan cong)\s*(?:nam|moi|tu|vao)?\s*(?:giua|dau|cuoi)?\s*(?:nam)?\s*((?:19|20)\d\d)\M');
  if m is null then m := regexp_match(k, 'nam xay\s*(?:dung)?\s*:?\s*((?:19|20)\d\d)\M'); end if;
  if m is not null then j := j || jsonb_build_object('year_built', m[1]::int); end if;

  m := regexp_match(k, 'huong\s*(?:nha|cua|chinh|ban cong)?\s*:?\s*(dong nam|dong bac|tay nam|tay bac|dong|tay|nam|bac)\M');
  if m is not null then
    j := j || jsonb_build_object('direction',
      replace(replace(replace(initcap(m[1]), 'Dong', 'Đông'), 'Tay', 'Tây'), 'Bac', 'Bắc'));
  end if;

  if k ~ '(khong tl|khong thuong luong|gia chot|mien tl|mien thuong luong)' then j := j || jsonb_build_object('negotiable', false);
  elsif k ~ '(\mtl\M|thuong luong|thoa thuan|con tl)' then j := j || jsonb_build_object('negotiable', true); end if;
  m := regexp_match(k, '(?:dang|hien|hien dang|co hop dong)\s*(?:cho )?thue\s*(?:duoc|voi gia|gia|:)?\s*(\d+(?:\.\d+)?)\s*(?:tr|trieu)\M');
  if m is null then m := regexp_match(k, '(?:cho thue|thue)\s*(\d+(?:\.\d+)?)\s*(?:tr|trieu)\s*/?\s*(?:thang|th)\M'); end if;
  if m is not null and m[1]::numeric between 1 and 2000 then j := j || jsonb_build_object('rent_income_vnd', (m[1]::numeric * 1000000)::bigint); end if;

  return j;
end $function$
;

CREATE OR REPLACE FUNCTION public.ghi_fact_listing(p_listing_id uuid, p_question text, p_answer text, p_source text DEFAULT 'seller_chat'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_q text := btrim(p_question);
begin
  if p_listing_id is null or coalesce(btrim(p_answer), '') = '' then
    return null;
  end if;
  -- 20260928f (FR-241, bắn thật lx-77): hỏi địa chỉ mà khách chỉ đáp "xã Vĩnh Lộc A" — đó là PHƯỜNG/XÃ, không phải
  -- đường; ghi vào vi_tri thì tên xã thành tên đường và câu địa chỉ không bao giờ được hỏi lại.
  if v_q = 'vi_tri'
     and public.bo_dau(btrim(p_answer)) ~* '^(xa|phuong|thi tran)\s+\S'
     and public.bo_dau(btrim(p_answer)) !~* '(duong|\mhem\M|\mngo\M|\mkiet\M|\mso\s*[0-9]|[0-9]+\s*/|,\s*[0-9])' then
    v_q := 'phuong';
  end if;
  insert into listing_facts (listing_id, question, answer, source)
  values (p_listing_id, v_q, btrim(p_answer),
          coalesce(nullif(btrim(p_source), ''), 'seller_chat'))
  returning id into v_id;
  if v_q not in ('bo_sung', 'kien_thuc') then
    update info_requests
       set status = 'answered', answer = btrim(p_answer), answered_at = now()
     where listing_id = p_listing_id
       and buyer_id is null
       and question = v_q
       and status = 'pending';
  end if;
  return v_id;
end $function$
;

-- Chủ dự án 28/09/2026: rao bán nhà phố mà bot cứ hỏi phòng ngủ ngay sau kết cấu — "để sau rồi hỏi". Dải 16–21 (sau giá,
-- sau pháp lý, trước phường/gấp/ảnh); LIEN_QUAN ket_cau → so_phong_ngu không kéo được câu qua dải (chonCauKe, FR-219).
update public.required_facts set priority = 21
 where property_type = 'nha_pho' and fact_key = 'so_phong_ngu' and priority = 5;
