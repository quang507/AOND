-- 20260902e — FR-172: tin rao CÓ CẤU TRÚC chuẩn sàn (02/09/2026)
--
-- Số đo trước khi sửa (DB thật, 173 tin): listing_facts RỖNG (0 dòng), cột
-- direction/floor 0/173, bedrooms 79/173 — mà mô tả của 164 tin lại chứa đủ
-- ngang×dài, kết cấu tầng, WC, hẻm/mặt tiền, pháp lý, hoàn công. Tức là dữ
-- liệu có, chỉ nằm trong một cục chữ; web không lọc được, bot không tra được,
-- và vòng hỏi nhỏ giọt sẽ hỏi lại đúng thứ chủ nhà vừa viết.
--
-- Đối chiếu mogi.vn + radanhadat.vn (02/09, docs/01 INS-11): bộ trường bắt
-- buộc phổ biến = diện tích, giá, (giá/m²), ngang×dài, số tầng, PN, WC, hướng,
-- đường vào, pháp lý, dự án, ảnh. SRS-3.1 đã đặc tả gần hết từ đầu — bảng thật
-- chưa bao giờ có. Bản này đưa bảng thật về đúng đặc tả, thêm hàm bóc từ mô tả
-- (bậc `suy_doan`, thấp nhất — FR-164), nối fact chủ nhà vào cột mới, và cho
-- view thiếu-thông-tin biết "cột đã có = khỏi hỏi".

-- ── 1. Cột ──────────────────────────────────────────────────────────────────
alter table public.listings
  add column if not exists street               text,      -- tên đường (từ location_raw)
  add column if not exists access_type          text check (access_type in ('mat_tien','hem_xe_tai','hem_xe_hoi','hem_xe_may','hem')),
  add column if not exists alley_width_m        numeric,   -- hẻm/đường trước nhà rộng
  add column if not exists distance_to_street_m numeric,   -- cách mặt tiền
  add column if not exists frontage_m           numeric,   -- ngang
  add column if not exists length_m             numeric,   -- dài
  add column if not exists rear_width_m         numeric,   -- nở hậu
  add column if not exists legal_area_m2        numeric,   -- diện tích công nhận (sổ)
  add column if not exists built_area_m2        numeric,   -- diện tích xây dựng / sàn
  add column if not exists floors               int,       -- tổng số tầng kể cả trệt (lửng, sân thượng, hầm không tính)
  add column if not exists floors_text          text,      -- "trệt + lửng + 3 lầu + sân thượng"
  add column if not exists bathrooms            int,
  add column if not exists legal_status         text check (legal_status in ('so_hong_rieng','so_hong_chung','so_hong','hdmb','giay_tay')),
  add column if not exists has_completion       boolean,   -- hoàn công
  add column if not exists planning_status      text,      -- khong_lo_gioi | khong_quy_hoach | dinh_lo_gioi
  add column if not exists has_elevator         boolean,
  add column if not exists car_in_house         boolean,   -- xe hơi vô nhà
  add column if not exists corner_lot           boolean,   -- căn góc / 2 mặt tiền
  add column if not exists furnishing           text check (furnishing in ('full','co_ban','khong')),
  add column if not exists year_built           int,
  add column if not exists negotiable           boolean,   -- còn thương lượng
  add column if not exists rent_income_vnd      bigint,    -- đang cho thuê X/tháng (tin bán)
  add column if not exists specs_source         text,      -- boc_mo_ta | chu_xac_nhan | admin
  add column if not exists price_per_m2_vnd     bigint generated always as
    (case when price_vnd is not null and area_m2 > 0 then (price_vnd / area_m2)::bigint end) stored;

comment on column public.listings.floors is 'FR-172: trệt + số lầu; "1 trệt 3 lầu" = 4, "5 tầng" = 5. Lửng/sân thượng/hầm chỉ nằm trong floors_text.';
comment on column public.listings.specs_source is 'FR-172: bậc nguồn của cụm cột thông số — boc_mo_ta (regex, thấp nhất) < admin < chu_xac_nhan (FR-164).';

-- Bộ lọc web: đường vào, số tầng, pháp lý đi cùng deal+status như các lọc cũ.
create index if not exists listings_access_idx on public.listings (deal, status, access_type);
create index if not exists listings_floors_idx on public.listings (deal, status, floors);

-- ── 2. Tên đường từ location_raw ───────────────────────────────────────────
-- "Số 1xx, Đường Trần Hưng Đạo, Phường 7, Quận 5" → "Trần Hưng Đạo";
-- "Dự án Tản Đà Court, Đường Tản Đà, Phường 11" → "Tản Đà". Chỉ lấy tên, không
-- lấy số nhà (FR-104: web không phơi số nhà, đó là việc của lúc hẹn xem).
create or replace function public.boc_ten_duong(p text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(btrim(regexp_replace(regexp_replace(seg,
           '^(?:hẻm|hem|hxh)\s*[\d/]+\s*', '', 'i'),
           '^(?:đường|duong|phố|pho|đ\.|đ )\s*', '', 'i')), '')
  from (
    select s as seg
    from unnest(string_to_array(coalesce(p, ''), ',')) with ordinality as t(s, i)
    where btrim(s) !~* '^(?:số|so)?\s*\d+[a-z]?(?:/\d+[a-z]?)*$'
      and btrim(s) !~* '^(?:dự án|du an|chung cư|cc |toà|tòa|toa|khu|kdc|cư xá|cu xa)'
      and btrim(s) !~* '^(?:phường|phuong|p\.|p\d|quận|quan|q\.|q\d|tp|thành phố|hồ chí minh|ho chi minh|việt nam)'
      and btrim(s) <> ''
    order by i limit 1
  ) x
$$;

-- ── 3. Bóc thông số từ mô tả ───────────────────────────────────────────────
-- Trả jsonb chỉ chứa khoá BẮT ĐƯỢC; giá trị ngoài dải hợp lý thì bỏ, không đoán.
-- Chạy trên bản không dấu (`bo_dau`) nên "hẻm xe hơi" / "hem xe hoi" / "HXH" là
-- một. Đo 02/09 trên 164 tin có mô tả: ngang 121, số tầng 140, đường vào 128,
-- pháp lý 76, WC 66 (xem TS-THONGSO).
create or replace function public.boc_thong_so(p_text text, p_type text default null)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  k text;                 -- bản không dấu, chữ thường, "4,5" → "4.5"
  m text[];
  j jsonb := '{}'::jsonb;
  n_lau int; co_tret bool; co_lung bool; co_st bool; co_ham bool; co_apmai bool;
  parts text[];
  chung_cu bool := p_type = 'chung_cu';
begin
  if p_text is null or btrim(p_text) = '' then return j; end if;
  k := public.bo_dau(p_text);
  k := regexp_replace(k, '(\d),(\d)', '\1.\2', 'g');
  k := regexp_replace(k, '\s+', ' ', 'g');
  k := regexp_replace(k, 'm²|m2|m 2', 'm2', 'g');
  k := replace(k, 'm2', 'mv');                                  -- giữ "m2" khỏi luật "3m6"
  k := regexp_replace(k, '(\d)m(\d)', '\1.\2', 'g');             -- "3m6" = 3.6
  k := replace(k, 'mv', 'm2');
  k := regexp_replace(k, '(\d)\s*\*\s*(\d)', '\1 x \2', 'g');    -- "4*15" = 4 x 15
  k := replace(k, 'hem hong', 'hemhong');                       -- hẻm hông ≠ đường vào
  k := regexp_replace(k, '\m2 ?mt\M', '2 mat tien', 'g');         -- "2MT"

  -- ── Kích thước: "4x16m", "4m x 15m", "ngang 4.6m", "dài 16.95m", "mặt tiền 4.15x17m"
  m := regexp_match(k, '(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?');
  if m is not null and m[1]::numeric between 1.5 and 40 and m[2]::numeric between 3 and 150 then
    j := j || jsonb_build_object('frontage_m', m[1]::numeric, 'length_m', m[2]::numeric);
  end if;
  if j->>'frontage_m' is null then
    m := regexp_match(k, '(?:ngang|mat tien|chieu ngang|be ngang)\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)\s*m?\M');
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

  -- ── Diện tích công nhận / xây dựng
  m := regexp_match(k, '(?:cong nhan|dtcn|dt cn|so|so hong)\s*(?:thuc te|du)?\s*:?\s*(\d+(?:\.\d+)?)\s*m2');
  if m is not null and m[1]::numeric between 5 and 5000 then j := j || jsonb_build_object('legal_area_m2', m[1]::numeric); end if;
  m := regexp_match(k, '(?:dtxd|dt xd|dien tich xay dung|dt xay dung|dien tich san|dt san|dtsd|dt sd|dien tich su dung|dt su dung|tong dien tich san)\s*:?\s*(\d+(?:\.\d+)?)\s*m(?:2|\M)');
  if m is not null and m[1]::numeric between 5 and 20000 then j := j || jsonb_build_object('built_area_m2', m[1]::numeric); end if;

  -- ── Kết cấu tầng (nhà); chung cư thì "tầng 25" là vị trí căn, không phải số tầng
  if not chung_cu then
    co_tret  := k ~ '\mtret\M';
    co_lung  := k ~ '\mlung\M';
    co_st    := k ~ '(san thuong|\mst\M|mai tum)';
    co_ham   := k ~ '\mham\M';
    co_apmai := k ~ 'ap mai';
    n_lau := null;
    m := regexp_match(k, '(?:tong )?so tang\s*:?\s*(\d+)');
    if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('floors', m[1]::int); end if;
    m := regexp_match(k, '(\d+)\s*lau\M');
    if m is not null and m[1]::int between 1 and 30 and j->>'floors' is null then n_lau := m[1]::int; end if;
    if n_lau is null then
      m := regexp_match(k, '(\d+)\s*(?:tang|t)\M');
      if m is not null and m[1]::int between 1 and 30 and j->>'floors' is null then
        j := j || jsonb_build_object('floors', m[1]::int);
      end if;
      if j->>'floors' is null and (k ~ '\mlau\M' or co_tret) then
        -- "trệt, lầu" không số: trệt + 1 lầu
        j := j || jsonb_build_object('floors', case when k ~ '\mlau\M' then 2 else 1 end);
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

  -- ── Phòng
  m := regexp_match(k, '(\d+)\s*(?:pn|phong ngu|p\.ngu)\M');
  if m is null then m := regexp_match(k, 'so phong ngu\s*:?\s*(\d+)'); end if;
  if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('bedrooms', m[1]::int); end if;
  m := regexp_match(k, '(\d+)\s*(?:wc|toilet|nha ve sinh|nvs|ve sinh|phong tam)\M');
  if m is null then m := regexp_match(k, '(?:so )?(?:phong ve sinh|phong tam|wc)\s*:?\s*(\d+)\M'); end if;
  if m is not null and m[1]::int between 1 and 30 then j := j || jsonb_build_object('bathrooms', m[1]::int); end if;

  -- ── Đường vào: mặt tiền / hẻm xe tải / hẻm xe hơi / hẻm xe máy
  if k ~ '(nha|ban nha|can nha|can|ban|thue|cho thue)\s*(?:pho|rieng|dep|gap|nguyen can|moi)?\s*(hem|\mhxh\M|\mhxt\M)' then
    null; -- "nhà hẻm …": có nhắc mặt tiền sau đó cũng là kể vị trí
  elsif k ~ '(cach|gan|sat|ra|toi|den|buoc ra|ke|ngay|\d+\s*m) (mat tien|\mmt\M)' and k !~ '(nha|ban|ban nha|can|lo)\s*(\d\s*)?mat tien' then
    null; -- gần mặt tiền = nhà trong hẻm
  elsif k ~ '(mat tien|\mmt\M|mat pho|mat duong|co via he|via he rong|le duong)' then
    j := j || jsonb_build_object('access_type', 'mat_tien');
  end if;
  if j->>'access_type' is null then
    if k ~ '(hem xe tai|\mhxt\M|xe tai)' then j := j || jsonb_build_object('access_type', 'hem_xe_tai');
    elsif k ~ '(hem xe hoi|\mhxh\M|hem o ?to|hem xe con|xe hoi|o ?to (vo|vao|dau|toi|do)|hem 7 cho|xe 7 cho)' then j := j || jsonb_build_object('access_type', 'hem_xe_hoi');
    elsif k ~ '(hem xe may|hem nho|hem ba gac|hem 3 gac|hem xe 3 banh)' then j := j || jsonb_build_object('access_type', 'hem_xe_may');
    elsif k ~ '\mhem\M' then j := j || jsonb_build_object('access_type', 'hem');
    end if;
  end if;
  m := regexp_match(k, '(?:hem|hxh|hxt|duong truoc nha|duong)\s*(?:xe hoi|xe tai|xe may|truoc nha|rong|thong)?\s*(?:rong)?\s*(?:hon|gan|:)?\s*(\d+(?:\.\d+)?)\s*m\M');
  if m is not null and m[1]::numeric between 1 and 40 then
    j := j || jsonb_build_object('alley_width_m', m[1]::numeric);
    if j->>'access_type' = 'hem' then
      j := j || jsonb_build_object('access_type', case when m[1]::numeric >= 6 then 'hem_xe_tai' when m[1]::numeric >= 3.5 then 'hem_xe_hoi' else 'hem_xe_may' end);
    end if;
  end if;
  m := regexp_match(k, '(?:cach|ra)\s*(?:mat tien|\mmt\M)\s*(?:chi|khoang|tam|hon|gan|duong)?\s*(?:[a-z ]{0,25}?)\s*(\d+(?:\.\d+)?)\s*m\M');
  if m is null then m := regexp_match(k, 'cach\s*(?:chi|khoang|tam)?\s*(\d+(?:\.\d+)?)\s*m\s*(?:la )?(?:ra|toi|den)\s*(?:mat tien|\mmt\M|duong)'); end if;
  if m is not null and m[1]::numeric between 5 and 500 then j := j || jsonb_build_object('distance_to_street_m', m[1]::numeric); end if;

  -- ── Pháp lý
  if k ~ '(so hong rieng|\mshr\M|so rieng|so do rieng)' then j := j || jsonb_build_object('legal_status', 'so_hong_rieng');
  elsif k ~ '(so hong chung|\mshc\M|so chung|dong so huu)' then j := j || jsonb_build_object('legal_status', 'so_hong_chung');
  elsif k ~ '(hop dong mua ban|\mhdmb\M)' then j := j || jsonb_build_object('legal_status', 'hdmb');
  elsif k ~ '(giay tay|vi bang)' then j := j || jsonb_build_object('legal_status', 'giay_tay');
  elsif k ~ '(so hong|so do|\mshcc\M|so chinh chu|so dep|so vuong|so sach|so cam tay|\mso\M (day du|ro rang|chuan)|co so)' then j := j || jsonb_build_object('legal_status', 'so_hong');
  end if;
  if k ~ 'chua hoan cong' then j := j || jsonb_build_object('has_completion', false);
  elsif k ~ 'hoan cong' then j := j || jsonb_build_object('has_completion', true); end if;
  if k ~ '(khong lo gioi|khong dinh lo gioi|khong bi lo gioi|da bo lo gioi)' then j := j || jsonb_build_object('planning_status', 'khong_lo_gioi');
  elsif k ~ '(khong quy hoach|khong dinh quy hoach|khong quy hoach|khong quy hoạch|khong quy hoach treo|khong quy hoach gi)' then j := j || jsonb_build_object('planning_status', 'khong_quy_hoach');
  elsif k ~ '(dinh lo gioi|co lo gioi|lo gioi \d|dinh quy hoach)' then j := j || jsonb_build_object('planning_status', 'dinh_lo_gioi');
  end if;

  -- ── Tiện ích trong nhà
  if k ~ 'thang may' then j := j || jsonb_build_object('has_elevator', true); end if;
  if k ~ '(xe hoi (vo|vao|ngu|de) (trong )?nha|o ?to (vo|vao|ngu|dau) (trong |tan )?nha|dau (o ?to|xe hoi|xe oto) trong nha|san dau (o ?to|xe hoi)|\mgarage\M|ga ?ra ?ge|gara\M|xe hoi ngu trong nha|(o ?to|xe hoi) (vo|vao|toi) tan (cua|nha))' then
    j := j || jsonb_build_object('car_in_house', true);
  end if;
  if k ~ '(can goc|lo goc|nha goc|2 mat tien|hai mat tien|2 mat hem|hai mat hem|goc 2 mat|2 mat thoang)' then j := j || jsonb_build_object('corner_lot', true); end if;
  if k ~ '(full noi that|noi that day du|day du noi that|tang (toan bo |het |full |tat ca )?noi that|noi that cao cap|full nt|tang nt|nt cao cap|nt day du|noi that sang trong)' then j := j || jsonb_build_object('furnishing', 'full');
  elsif k ~ '(noi that co ban|nt co ban|co ban)' then j := j || jsonb_build_object('furnishing', 'co_ban');
  elsif k ~ '(khong noi that|nha trong|khong co noi that)' then j := j || jsonb_build_object('furnishing', 'khong');
  end if;
  m := regexp_match(k, '(?:xay|xay dung|xd|hoan cong)\s*(?:nam|moi|tu|vao)?\s*(?:giua|dau|cuoi)?\s*(?:nam)?\s*((?:19|20)\d\d)\M');
  if m is null then m := regexp_match(k, 'nam xay\s*(?:dung)?\s*:?\s*((?:19|20)\d\d)\M'); end if;
  if m is not null then j := j || jsonb_build_object('year_built', m[1]::int); end if;

  -- ── Hướng: chỉ nhận chữ la bàn ngay sau "hướng"
  m := regexp_match(k, 'huong\s*(?:nha|cua|chinh|ban cong)?\s*:?\s*(dong nam|dong bac|tay nam|tay bac|dong|tay|nam|bac)\M');
  if m is not null then
    j := j || jsonb_build_object('direction',
      replace(replace(replace(replace(initcap(m[1]), 'Dong', 'Đông'), 'Tay', 'Tây'), 'Bac', 'Bắc'), 'Nam', 'Nam'));
  end if;

  -- ── Giá: thương lượng + thu nhập cho thuê hiện tại
  if k ~ '(khong tl|khong thuong luong|gia chot|mien tl|mien thuong luong)' then j := j || jsonb_build_object('negotiable', false);
  elsif k ~ '(\mtl\M|thuong luong|thoa thuan|\mtl cc\M|con tl)' then j := j || jsonb_build_object('negotiable', true); end if;
  m := regexp_match(k, '(?:dang|hien|hien dang|co hop dong)\s*(?:cho )?thue\s*(?:duoc|voi gia|gia|:)?\s*(\d+(?:\.\d+)?)\s*(?:tr|trieu)\M');
  if m is null then m := regexp_match(k, '(?:cho thue|thue)\s*(\d+(?:\.\d+)?)\s*(?:tr|trieu)\s*/?\s*(?:thang|th)\M'); end if;
  if m is not null and m[1]::numeric between 1 and 2000 then j := j || jsonb_build_object('rent_income_vnd', (m[1]::numeric * 1000000)::bigint); end if;

  return j;
end $$;

-- ── 4. Trigger: điền cột còn trống từ mô tả (bậc suy_doan) ──────────────────
-- Chỉ điền cột NULL — không bao giờ đè lời chủ nhà/admin. Khi mô tả ĐỔI mà cụm
-- thông số vẫn là bậc boc_mo_ta thì bóc lại và đè (cùng bậc, bản mới thắng).
create or replace function public.listings_boc_thong_so()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  j jsonb;
  de boolean;   -- được phép đè (mô tả đổi, cụm cột đang ở bậc thấp nhất)
  co boolean := false;
begin
  if new.street is null then new.street := public.boc_ten_duong(new.location_raw); end if;
  if new.description is null then return new; end if;
  de := tg_op = 'UPDATE' and new.description is distinct from old.description
        and coalesce(new.specs_source, 'boc_mo_ta') = 'boc_mo_ta';
  j := public.boc_thong_so(new.description, new.property_type::text);

  if j ? 'frontage_m'           and (de or new.frontage_m is null)           then new.frontage_m := (j->>'frontage_m')::numeric; co := true; end if;
  if j ? 'length_m'             and (de or new.length_m is null)             then new.length_m := (j->>'length_m')::numeric; co := true; end if;
  if j ? 'rear_width_m'         and (de or new.rear_width_m is null)         then new.rear_width_m := (j->>'rear_width_m')::numeric; co := true; end if;
  if j ? 'legal_area_m2'        and (de or new.legal_area_m2 is null)        then new.legal_area_m2 := (j->>'legal_area_m2')::numeric; co := true; end if;
  if j ? 'built_area_m2'        and (de or new.built_area_m2 is null)        then new.built_area_m2 := (j->>'built_area_m2')::numeric; co := true; end if;
  if j ? 'floors'               and (de or new.floors is null)               then new.floors := (j->>'floors')::int; new.floors_text := j->>'floors_text'; co := true; end if;
  if j ? 'floor'                and (de or new.floor is null)                then new.floor := (j->>'floor')::int; co := true; end if;
  if j ? 'bedrooms'             and (de or new.bedrooms is null)             then new.bedrooms := (j->>'bedrooms')::int; co := true; end if;
  if j ? 'bathrooms'            and (de or new.bathrooms is null)            then new.bathrooms := (j->>'bathrooms')::int; co := true; end if;
  if j ? 'access_type'          and (de or new.access_type is null)          then new.access_type := j->>'access_type'; co := true; end if;
  if j ? 'alley_width_m'        and (de or new.alley_width_m is null)        then new.alley_width_m := (j->>'alley_width_m')::numeric; co := true; end if;
  if j ? 'distance_to_street_m' and (de or new.distance_to_street_m is null) then new.distance_to_street_m := (j->>'distance_to_street_m')::numeric; co := true; end if;
  if j ? 'legal_status'         and (de or new.legal_status is null)         then new.legal_status := j->>'legal_status'; co := true; end if;
  if j ? 'has_completion'       and (de or new.has_completion is null)       then new.has_completion := (j->>'has_completion')::boolean; co := true; end if;
  if j ? 'planning_status'      and (de or new.planning_status is null)      then new.planning_status := j->>'planning_status'; co := true; end if;
  if j ? 'has_elevator'         and (de or new.has_elevator is null)         then new.has_elevator := true; co := true; end if;
  if j ? 'car_in_house'         and (de or new.car_in_house is null)         then new.car_in_house := true; co := true; end if;
  if j ? 'corner_lot'           and (de or new.corner_lot is null)           then new.corner_lot := true; co := true; end if;
  if j ? 'furnishing'           and (de or new.furnishing is null)           then new.furnishing := j->>'furnishing'; co := true; end if;
  if j ? 'year_built'           and (de or new.year_built is null)           then new.year_built := (j->>'year_built')::int; co := true; end if;
  if j ? 'direction'            and (de or new.direction is null)            then new.direction := j->>'direction'; co := true; end if;
  if j ? 'negotiable'           and (de or new.negotiable is null)           then new.negotiable := (j->>'negotiable')::boolean; co := true; end if;
  if j ? 'rent_income_vnd' and new.deal = 'ban' and (de or new.rent_income_vnd is null) then new.rent_income_vnd := (j->>'rent_income_vnd')::bigint; co := true; end if;

  if co and new.specs_source is null then new.specs_source := 'boc_mo_ta'; end if;
  return new;
end $$;

-- Đứng SAU trg_listings_fill_property_type (thứ tự chữ cái: "boc" > "fill"?
-- KHÔNG — Postgres chạy trigger cùng loại theo tên; đặt tên bắt đầu bằng "trg_y_"
-- để chạy sau "trg_listings_fill_property_type" và trước "trg_z_…" / "trg_zz_…").
drop trigger if exists trg_y_listings_boc_thong_so on public.listings;
create trigger trg_y_listings_boc_thong_so
  before insert or update of description, location_raw, property_type on public.listings
  for each row execute function public.listings_boc_thong_so();

-- ── 5. Fact chủ nhà chảy vào cột mới (mở rộng FR-153) ───────────────────────
-- Lời chủ nhà thắng regex: ghi khi cột trống HOẶC cụm cột đang ở bậc boc_mo_ta;
-- ghi xong nâng specs_source lên bậc của fact. Dùng chung boc_thong_so() để
-- đọc câu trả lời ("1 trệt 2 lầu", "hẻm 4m", "sổ hồng riêng") — một bộ luật.
create or replace function public.listing_facts_sync_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txt  text := coalesce(new.answer, '');
  v_num  numeric;
  j      jsonb;
  -- Bậc nguồn theo FR-164: chat chủ nhà (`seller_chat`) là chu_xac_nhan; admin
  -- nhập tay là admin; còn lại coi như lời chủ.
  bac    text := case when new.source ilike 'admin%' then 'admin' else 'chu_xac_nhan' end;
  l      listings%rowtype;
  de     boolean;
begin
  select * into l from listings where id = new.listing_id;
  if not found then return null; end if;
  de := coalesce(l.specs_source, 'boc_mo_ta') = 'boc_mo_ta';
  j := public.boc_thong_so(v_txt, l.property_type::text);

  if new.question = 'so_phong_ngu' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 1 and 20 then
      update listings set bedrooms = v_num::int, specs_source = bac
       where id = new.listing_id and (bedrooms is null or de);
    end if;

  elsif new.question like 'dien_tich%' then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num > 5 and v_num < 5000 then
      update listings set area_m2 = v_num where id = new.listing_id and area_m2 is null;
    end if;
    -- "4x15" trong câu trả lời diện tích → ngang/dài luôn
    if j ? 'frontage_m' then
      update listings set frontage_m = (j->>'frontage_m')::numeric, length_m = (j->>'length_m')::numeric, specs_source = bac
       where id = new.listing_id and (frontage_m is null or de);
    end if;

  elsif new.question = 'tang' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 0 and 80 then
      update listings set floor = v_num::int, specs_source = bac
       where id = new.listing_id and (floor is null or de);
    end if;

  elsif new.question = 'huong' then
    if j ? 'direction' then
      update listings set direction = j->>'direction', specs_source = bac
       where id = new.listing_id and (direction is null or de);
    elsif length(btrim(v_txt)) between 2 and 40 then
      update listings set direction = btrim(v_txt), specs_source = bac
       where id = new.listing_id and (direction is null or de);
    end if;

  elsif new.question in ('ket_cau', 'hien_trang') and j ? 'floors' then
    update listings set floors = (j->>'floors')::int, floors_text = j->>'floors_text',
           bathrooms = coalesce((j->>'bathrooms')::int, bathrooms),
           bedrooms  = case when bedrooms is null or de then coalesce((j->>'bedrooms')::int, bedrooms) else bedrooms end,
           specs_source = bac
     where id = new.listing_id and (floors is null or de);

  elsif new.question in ('do_rong_hem', 'do_rong_duong') then
    if j ? 'alley_width_m' or j ? 'access_type' then
      update listings set alley_width_m = coalesce((j->>'alley_width_m')::numeric, alley_width_m),
             access_type = coalesce(j->>'access_type', access_type), specs_source = bac
       where id = new.listing_id and (alley_width_m is null or access_type is null or de);
    else
      -- "4m", "3,5" trần
      v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
      if v_num is not null and v_num between 1 and 40 then
        update listings set alley_width_m = v_num,
               access_type = coalesce(access_type, case when v_num >= 6 then 'hem_xe_tai' when v_num >= 3.5 then 'hem_xe_hoi' else 'hem_xe_may' end),
               specs_source = bac
         where id = new.listing_id and (alley_width_m is null or de);
      end if;
    end if;

  elsif new.question = 'phap_ly' and j ? 'legal_status' then
    update listings set legal_status = j->>'legal_status',
           has_completion = coalesce((j->>'has_completion')::boolean, has_completion), specs_source = bac
     where id = new.listing_id and (legal_status is null or de);

  elsif new.question = 'quy_hoach' then
    update listings set planning_status = coalesce(j->>'planning_status',
             case when public.bo_dau(v_txt) ~ '(khong|ko|k co|k dinh)' then 'khong_quy_hoach' end), specs_source = bac
     where id = new.listing_id and (planning_status is null or de)
       and (j ? 'planning_status' or public.bo_dau(v_txt) ~ '(khong|ko|k co|k dinh)');

  elsif new.question = 'nam_xay' then
    v_num := nullif(substring(v_txt, '(?:19|20)[0-9]{2}'), '')::numeric;
    if v_num is not null then
      update listings set year_built = v_num::int, specs_source = bac
       where id = new.listing_id and (year_built is null or de);
    end if;

  elsif new.question = 'noi_that' then
    update listings set furnishing = coalesce(j->>'furnishing',
             case when public.bo_dau(v_txt) ~ '(full|day du|cao cap)' then 'full'
                  when public.bo_dau(v_txt) ~ '(khong|trong|ko)' then 'khong'
                  when public.bo_dau(v_txt) ~ '(co ban)' then 'co_ban' end), specs_source = bac
     where id = new.listing_id and (furnishing is null or de)
       and (j ? 'furnishing' or public.bo_dau(v_txt) ~ '(full|day du|cao cap|khong|trong|ko|co ban)');

  elsif new.question = 'mat_tien' then
    v_num := coalesce((j->>'frontage_m')::numeric, nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric);
    if v_num is not null and v_num between 1.5 and 40 then
      update listings set frontage_m = v_num, specs_source = bac
       where id = new.listing_id and (frontage_m is null or de);
    end if;
  end if;

  return null;
end;
$$;

comment on function public.listing_facts_sync_cols() is
  'FR-153 + FR-172: đổ fact nhỏ giọt sang cột listings (phòng ngủ, diện tích, tầng, hướng, kết cấu, hẻm, pháp lý, quy hoạch, năm xây, nội thất, mặt tiền). Lời chủ nhà đè bậc boc_mo_ta.';

-- ── 6. View thiếu-thông-tin: cột đã có = đã trả lời ──────────────────────────
-- Trước: chỉ nhìn listing_facts, nên chủ nhà viết "hẻm xe hơi 6m, sổ hồng riêng,
-- 1 trệt 3 lầu" trong câu rao mà bot vẫn hỏi đủ ba câu đó (đúng kiểu mất mặt
-- FR-144/FR-170 h sinh ra để tránh). Nay fact_key nào có cột tương ứng đã điền
-- (bất kể bậc) thì không còn "thiếu".
create or replace view public.listing_missing_facts as
select l.id as listing_id, rf.fact_key, rf.priority
from listings l
join required_facts rf on rf.property_type = coalesce(l.property_type, 'chua_ro'::property_type)
left join listing_facts lf on lf.listing_id = l.id and lf.question = rf.fact_key
where lf.id is null
  and not (
       (rf.fact_key = 'ket_cau'       and l.floors is not null)
    or (rf.fact_key in ('do_rong_hem','do_rong_duong') and (l.alley_width_m is not null or l.access_type = 'mat_tien'))
    or (rf.fact_key = 'phap_ly'       and l.legal_status is not null)
    or (rf.fact_key = 'huong'         and l.direction is not null)
    or (rf.fact_key = 'so_phong_ngu'  and l.bedrooms is not null)
    or (rf.fact_key = 'tang'          and l.floor is not null)
    or (rf.fact_key in ('dien_tich','dien_tich_dat','dien_tich_tim_tuong') and l.area_m2 is not null)
    or (rf.fact_key = 'nam_xay'       and l.year_built is not null)
    or (rf.fact_key = 'noi_that'      and l.furnishing is not null)
    or (rf.fact_key = 'mat_tien'      and l.frontage_m is not null)
    or (rf.fact_key = 'quy_hoach'     and l.planning_status is not null)
  )
order by l.id, rf.priority, rf.fact_key;

-- ── 7. Backfill 173 tin đang có ─────────────────────────────────────────────
-- UPDATE OF description bắn trigger kể cả khi giá trị không đổi.
update public.listings set description = description;
