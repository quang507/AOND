-- 20260913a — ba lỗi ghi cột lộ ra ở lượt bắn 20 tin thật 12/09/2026
--
-- 1. listing_facts_sync_cols: căn hộ "tầng 15 view sông" → floors = 15, bản
--    nháp in "trệt + 14 lầu". Nhánh `tang` ghi `floors` bất kể loại BĐS. Nay
--    chung_cu ghi `floor` (tầng căn nằm), không bao giờ đụng `floors`.
-- 2. chuan_hoa_gia_raw: "18 triệu một tháng" (TS đổi "một" → "1") → price_raw
--    "18 triệu 1" — số lẻ sau đơn vị nuốt mất chữ "1" của "1 tháng". Nay số lẻ
--    không được đứng ngay trước tháng/năm, và "một/mỗi/1/ / tháng" gom thành
--    "/tháng" ("18 triệu/tháng", "12 triệu 5/tháng"). Gắn kỳ hạn mà parse_vnd
--    ra số khác ("1 tỷ 1 năm") thì bỏ, đi đường cũ.
-- 3. boc_ten_duong: "hẻm 5m Nguyễn Trãi" → "m Nguyễn Trãi" (luật cũ cắt "hẻm 5"
--    rồi để lại chữ "m"); "hẻm xe hơi 5m Nguyễn Trãi" giữ nguyên cả cụm tả
--    đường. Nay bỏ chữ tả đường (xe hơi, thông, nhựa…), bề rộng "5m" và số
--    hẻm "12/3" sau hẻm/ngõ/kiệt; sau "đường" chỉ bỏ chữ tả đường và bề rộng
--    có "m" — KHÔNG bỏ số trần, vì "đường 3 Tháng 2" là tên đường.
--
-- Đã chạy thử trên DB bằng bản pg_temp (13/09): 14 câu giá, 16 câu địa chỉ.

CREATE OR REPLACE FUNCTION public.listing_facts_sync_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_txt   text := coalesce(new.answer, '');
  v_num   numeric;
  v_vnd   bigint;
  v_raw   text;
  v_ward  text;
  v_pt    public.property_type;
  j       jsonb;
  -- Bậc nguồn theo FR-164/173: admin nhập tay hoặc CTV trả lời là `admin` (2);
  -- còn lại coi như lời chủ nhà `chu_xac_nhan` (3).
  bac     text := case when new.source ilike 'admin%' or new.source ilike 'ctv%'
                       then 'admin' else 'chu_xac_nhan' end;
  l       listings%rowtype;
  de      boolean;
begin
  select * into l from listings where id = new.listing_id;
  if not found then return null; end if;
  -- Cụm thông số (FR-172): được đè khi bậc của fact ≥ bậc cụm đang giữ.
  de := public.bac_nguon(bac) >= public.bac_nguon(coalesce(l.specs_source, 'boc_mo_ta'));
  j := public.boc_thong_so(v_txt, l.property_type::text);

  if new.question = 'so_phong_ngu' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 1 and 20 then
      update listings set bedrooms = v_num::int, specs_source = bac
       where id = new.listing_id and (bedrooms is null or de);
    end if;

  -- Diện tích đất / diện tích chung. KHÔNG khớp `dien_tich_tim_tuong` (FR-163).
  elsif new.question in ('dien_tich', 'dien_tich_dat') then
    -- "6x11" là NGANG x DÀI, không phải 6 m2. Bản trước lấy SỐ ĐẦU TIÊN nên
    -- diện tích thành 6 — qua lọt vì 6 > 5 (bắt 08/09/2026, bàn giao §7).
    -- `boc_thong_so` đã tách đúng hai chiều rồi; ở đây chỉ việc nhân.
    if (j ? 'frontage_m') and (j ? 'length_m') then
      v_num := round((j->>'frontage_m')::numeric * (j->>'length_m')::numeric, 1);
    else
      v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    end if;
    if v_num is not null and v_num > 5 and v_num < 5000 then
      update listings set area_m2 = v_num, specs_source = bac
       where id = new.listing_id and (area_m2 is null or de)
         and area_m2 is distinct from v_num;
    end if;

  -- Tim tường chỉ là diện tích CỦA chung cư; nhà đất thì đó là sàn, không phải đất.
  elsif new.question = 'dien_tich_tim_tuong' then
    if l.property_type = 'chung_cu' then
      v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
      if v_num is not null and v_num > 5 and v_num < 5000 then
        update listings set area_m2 = v_num, specs_source = bac
         where id = new.listing_id and (area_m2 is null or de)
           and area_m2 is distinct from v_num;
      end if;
    end if;

  -- Giá: validate bằng parse_vnd, ghi NGUYÊN VĂN đã cắt tiểu từ (20260828d),
  -- bậc riêng `price_source`; trigger `trg_listings_price_vnd` tự tính lại price_vnd.
  elsif new.question = 'gia' then
    v_vnd := public.parse_vnd(v_txt);
    if v_vnd is not null and (
         (l.deal = 'cho_thue' and v_vnd between 1000000 and 10000000000)
      or (l.deal is distinct from 'cho_thue' and v_vnd between 100000000 and 1000000000000)
    ) then
      v_raw := public.chuan_hoa_gia_raw(v_txt);
      update listings set price_raw = v_raw, price_source = bac
       where id = new.listing_id
         and public.bac_nguon(bac) >= public.bac_nguon(price_source)
         and (price_raw is distinct from v_raw or price_source is distinct from bac);
    end if;

  elsif new.question = 'phuong' then
    v_ward := public.chuan_hoa_phuong(v_txt);
    if v_ward is not null then
      update listings set ward = v_ward, ward_source = bac
       where id = new.listing_id
         and public.bac_nguon(bac) >= public.bac_nguon(ward_source)
         and (ward is distinct from v_ward or ward_source is distinct from bac);
    end if;

  elsif new.question = 'loai_bds' then
    v_pt := public.guess_property_type_answer(v_txt);
    if v_pt is not null then
      update listings set property_type = v_pt, property_type_source = bac
       where id = new.listing_id
         and public.bac_nguon(bac) >= public.bac_nguon(property_type_source)
         and (property_type is distinct from v_pt or property_type_source is distinct from bac);
    end if;

  -- 13/09/2026: căn hộ "tầng 15" là TẦNG CĂN NẰM (cột `floor`, `boc_thong_so` +
  -- `ap_thong_so` đã ghi đúng), không phải nhà 15 tầng. Bản trước ghi luôn
  -- `floors` = 15 và bản nháp in "trệt + 14 lầu" cho một căn hộ Sunrise City.
  elsif new.question in ('tang', 'ket_cau') then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if l.property_type = 'chung_cu' then
      if new.question = 'tang' and v_num is not null and v_num between 0 and 80 and not (j ? 'floor') then
        update listings set floor = v_num::int, specs_source = bac
         where id = new.listing_id and (floor is null or de);
      end if;
    elsif v_num is not null and v_num between 0 and 80 and not (j ? 'floors') and not (j ? 'floor') then
      update listings set floors = v_num::int,
             floors_text = coalesce(floors_text,
               case when v_num::int <= 1 then 'trệt'
                    else 'trệt + ' || (v_num::int - 1) || ' lầu' end),
             specs_source = bac
       where id = new.listing_id and (floors is null or de);
    end if;
  elsif new.question = 'huong' and not (j ? 'direction') and length(btrim(v_txt)) between 2 and 40 then
    update listings set direction = btrim(v_txt), specs_source = bac
     where id = new.listing_id and (direction is null or de);
  elsif new.question in ('do_rong_hem', 'do_rong_duong') and not (j ? 'alley_width_m') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num between 1 and 40 then
      update listings set alley_width_m = v_num,
             access_type = coalesce(access_type, case when v_num >= 6 then 'hem_xe_tai' when v_num >= 3.5 then 'hem_xe_hoi' else 'hem_xe_may' end),
             specs_source = bac
       where id = new.listing_id and (alley_width_m is null or de);
    end if;
  elsif new.question = 'quy_hoach' and not (j ? 'planning_status') and public.bo_dau(v_txt) ~ '(khong|ko|k co|k dinh)' then
    update listings set planning_status = 'khong_quy_hoach', specs_source = bac
     where id = new.listing_id and (planning_status is null or de);
  elsif new.question = 'nam_xay' and not (j ? 'year_built') then
    v_num := nullif(substring(v_txt, '(?:19|20)[0-9]{2}'), '')::numeric;
    if v_num is not null then
      update listings set year_built = v_num::int, specs_source = bac
       where id = new.listing_id and (year_built is null or de);
    end if;
  elsif new.question = 'noi_that' and not (j ? 'furnishing') then
    update listings set furnishing = case when public.bo_dau(v_txt) ~ '(full|day du|cao cap)' then 'full'
                                          when public.bo_dau(v_txt) ~ '(khong|trong|ko)' then 'khong'
                                          when public.bo_dau(v_txt) ~ '(co ban)' then 'co_ban' end, specs_source = bac
     where id = new.listing_id and (furnishing is null or de)
       and public.bo_dau(v_txt) ~ '(full|day du|cao cap|khong|trong|ko|co ban)';
  elsif new.question = 'mat_tien' and not (j ? 'frontage_m') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num between 1.5 and 40 then
      update listings set frontage_m = v_num, specs_source = bac
       where id = new.listing_id and (frontage_m is null or de);
    end if;
  end if;

  perform public.ap_thong_so(new.listing_id, j, bac, de);
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.chuan_hoa_gia_raw(p_text text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  s   text := btrim(coalesce(p_text, ''));
  goc bigint := public.parse_vnd(p_text);
  t   text;
  m   text[];
  cum text;
begin
  if s = '' then return null; end if;

  t := public.bo_dau(s);
  m := regexp_match(t, '([0-9][0-9.,]*\s*(?:ty|ti|toi|trieu|tr|cu)\y(?:\s*[0-9]+(?![0-9])(?!\s*(?:thang|nam)\y))?(?:\s*ruoi)?)(?:\s*(?:/|mot|moi|1)\s*(thang|nam|m2)\y)?');
  if m is not null then
    cum := btrim(substring(s from position(m[1] in t) for length(m[1])));
    if m[2] is not null then
      cum := cum || '/' || case m[2] when 'thang' then 'tháng' when 'nam' then 'năm' else 'm2' end;
      -- "1 tỷ 1 năm" đọc được thành 1,1 tỷ: gắn kỳ hạn làm lệch số thì bỏ, đi đường cũ.
      if public.parse_vnd(cum) is distinct from goc then cum := ''; end if;
    end if;
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

CREATE OR REPLACE FUNCTION public.boc_ten_duong(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select nullif(btrim(
           regexp_replace(
             regexp_replace(
               regexp_replace(seg,
                 '^(?:hẻm|hem|hxh|ngõ|ngo|kiệt|kiet)(?:\s+|(?=\d))(?:(?:xe\s*hơi|xe\s*hoi|xe\s*tải|xe\s*tai|xe\s*máy|xe\s*may|ba\s*gác|ba\s*gac|thông|thong|cụt|cut|nhựa|nhua|bê\s*tông|be\s*tong|rộng|rong|lớn|lon|nhỏ|nho|xh)(?![[:alpha:]])\s*|[0-9]+(?:[.,][0-9]+)?\s*m(?![[:alpha:]])\s*|[0-9]+[a-z]?(?:/[0-9]+[a-z]?)*(?![[:alpha:]0-9])\s*)*',
                 '', 'i'),
               '^(?:đường|duong|phố|pho|đ\.|đ )\s*', '', 'i'),
             '^(?:(?:nhựa|nhua|bê\s*tông|be\s*tong|rộng|rong|lớn|lon|nhỏ|nho)(?![[:alpha:]])\s*|[0-9]+(?:[.,][0-9]+)?\s*m(?![[:alpha:]])\s*)+',
             '', 'i')), '')
  from (
    select s as seg
    from unnest(string_to_array(coalesce(p, ''), ',')) with ordinality as t(s, i)
    where btrim(s) !~* '^(?:số|so)?\s*\d+[a-z]?(?:/\d+[a-z]?)*$'
      and btrim(s) !~* '^(?:hẻm|hem|hxh)\s*[\d/]+\s*$'
      and btrim(s) !~* '^(?:dự án|du an|chung cư|cc |toà|tòa|toa|khu|kdc|cư xá|cu xa)'
      and btrim(s) !~* '^(?:phường|phuong|p\.|p\d|quận|quan|q\.|q\d|tp|thành phố|hồ chí minh|ho chi minh|việt nam)'
      and btrim(s) <> ''
    order by i limit 1
  ) x
$function$;

-- Sửa dữ liệu đã ghi sai (13/09 soát: 0 dòng chung_cu có floors, 0 price_raw
-- "triệu 1", 0 street "m …" — chạy lại cho chắc, không đổi gì nếu sạch).
update listings set floor = coalesce(floor, floors), floors = null, floors_text = null
 where property_type = 'chung_cu' and floors is not null and floors_text like 'trệt + %';
update listings set street = public.boc_ten_duong(location_raw)
 where street ~ '^m ' and location_raw is not null;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260913a', 'tang_can_ho_gia_thang_ten_duong') on conflict do nothing;
