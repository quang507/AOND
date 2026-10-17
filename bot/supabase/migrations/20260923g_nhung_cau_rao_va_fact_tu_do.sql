-- 20260923g — bắn thật 23/09/2026 (5 tin + 4 khách mua, chủ dự án: "chuẩn rồi đó … triển đi"):
-- (1) van_ban_nhung đưa câu rao GỐC (description, SĐT che) vào văn bản nhúng vector (FR-216 f): chi tiết người bán nói
--     mà bot không lưu vào ô nào vẫn tìm lại được theo nghĩa. Mọi tin đổi md5 → nhung-tick nhúng lại một lần.
-- (2) listing_facts_sync_cols: fact chữ tự do (bo_sung, tiem_nang, hien_trang…) chỉ ĐIỀN ô trống — "có 1 phòng ngủ
--     ngay tầng trệt" từng đè bedrooms 3 → 1 và floors_text "trệt + 2 lầu" → "trệt".
-- (3) ap_thong_so: cùng số tầng thì không để chữ gọn hơn ("3 tầng") xoá lửng / sân thượng / áp mái / hầm.

CREATE OR REPLACE FUNCTION public.ap_thong_so(p_listing_id uuid, j jsonb, p_bac text, p_de boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k text; typ text; n int := 0; r int; v_deal text;
begin
  if p_listing_id is null or j is null or j = '{}'::jsonb then return 0; end if;
  select deal into v_deal from listings where id = p_listing_id;
  for k in select jsonb_object_keys(j) loop
    typ := case k
      when 'frontage_m' then 'numeric' when 'length_m' then 'numeric' when 'rear_width_m' then 'numeric'
      when 'legal_area_m2' then 'numeric' when 'built_area_m2' then 'numeric'
      when 'alley_width_m' then 'numeric' when 'distance_to_street_m' then 'numeric'
      when 'floors' then 'int' when 'floor' then 'int' when 'bedrooms' then 'int'
      when 'bathrooms' then 'int' when 'year_built' then 'int'
      when 'has_completion' then 'boolean' when 'has_elevator' then 'boolean'
      when 'car_in_house' then 'boolean' when 'corner_lot' then 'boolean' when 'negotiable' then 'boolean'
      when 'access_type' then 'text' when 'legal_status' then 'text' when 'planning_status' then 'text'
      when 'furnishing' then 'text' when 'direction' then 'text'
      when 'rent_income_vnd' then 'bigint'
      else null end;
    if typ is null then continue; end if;
    if k = 'rent_income_vnd' and coalesce(v_deal, '') <> 'ban' then continue; end if;
    if k = 'floors' then
      -- 20260923g: "3 tầng" (AI gọn lại) không được xoá "trệt + lửng + 2 lầu + sân thượng" đã đọc từ câu rao —
      -- cùng số tầng mà chữ cũ có lửng / sân thượng / áp mái / hầm còn chữ mới không có thì giữ chữ cũ.
      update listings set floors = (j->>'floors')::int,
             floors_text = case
               when floors = (j->>'floors')::int and coalesce(floors_text, '') ~ '(lửng|sân thượng|áp mái|hầm)'
                    and coalesce(j->>'floors_text', '') !~ '(lửng|sân thượng|áp mái|hầm)' then floors_text
               else j->>'floors_text' end,
             specs_source = p_bac
       where id = p_listing_id and (floors is null or p_de);
    else
      execute format('update listings set %I = ($1)::%s, specs_source = $2 where id = $3 and (%I is null or $4)', k, typ, k)
        using j->>k, p_bac, p_listing_id, p_de;
    end if;
    get diagnostics r = row_count;
    n := n + r;
  end loop;
  return n;
end $function$
;

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
  -- 20260920a (FR-211): nhãn tìm kiếm là TÊN NHÃN, không phải câu tả căn — không đọc thông số từ nó.
  if new.question = 'nhan' then return null; end if;
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

  -- 22/09/2026 (kịch bản C, bắn thật): "3pn 2wc" → fact `so_wc` có, cột `bathrooms` trống — chưa từng có nhánh.
  elsif new.question = 'so_wc' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 1 and 20 then
      update listings set bathrooms = v_num::int, specs_source = bac
       where id = new.listing_id and (bathrooms is null or de);
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

  -- 22/09/2026 (bắn lại kịch bản D): "nở hậu 4m5" → fact no_hau "4.5m" nhưng cột trống — boc_thong_so chỉ đọc khi câu có chữ "nở hậu".
  elsif new.question = 'no_hau' and not (j ? 'rear_width_m') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num between 1.5 and 40 then
      update listings set rear_width_m = v_num, specs_source = bac
       where id = new.listing_id and (rear_width_m is null or de);
    end if;

  -- 22/09/2026 (kịch bản D): "đang cho thuê 30 triệu/tháng" → fact doanh_thu; tin BÁN thì đó là dòng tiền đang thu.
  elsif new.question = 'doanh_thu' then
    v_vnd := public.parse_vnd(v_txt);
    if v_vnd is not null and v_vnd between 1000000 and 10000000000 and l.deal is distinct from 'cho_thue' then
      update listings set rent_income_vnd = v_vnd, specs_source = bac
       where id = new.listing_id and (rent_income_vnd is null or de);
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
  -- 14/09/2026 (bắn 14 tin bán): "cách mặt tiền 50m" vào fact nhưng cột distance_to_street_m
  -- vẫn trống — boc_thong_so chỉ đọc số khi câu CÓ chữ "cách mặt tiền", đáp án đã cắt là "50m".
  elsif new.question = 'cach_mat_tien' and not (j ? 'distance_to_street_m') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num between 1 and 2000 then
      update listings set distance_to_street_m = v_num, specs_source = bac
       where id = new.listing_id and (distance_to_street_m is null or de);
    end if;
  -- "đường Lạc Long Quân p5": địa chỉ kèm phường số — phường trống thì ghi luôn, khỏi hỏi lại
  -- "nhà mình phường mấy" (lượt bắn đó hỏi 3 lần).
  elsif new.question = 'vi_tri' and l.ward is null
        and public.bo_dau(v_txt) ~ '(?:phuong|\mp)\s*\.?\s*[0-9]{1,2}\M' then
    v_ward := public.chuan_hoa_phuong(substring(public.bo_dau(v_txt) from '(?:phuong|\mp)\s*\.?\s*[0-9]{1,2}'));
    if v_ward is not null then
      update listings set ward = v_ward, ward_source = bac
       where id = new.listing_id and ward is null;
    end if;
  elsif new.question = 'mat_tien' and not (j ? 'frontage_m') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num between 1.5 and 40 then
      update listings set frontage_m = v_num, specs_source = bac
       where id = new.listing_id and (frontage_m is null or de);
    end if;
  end if;

  -- 20260923g (bắn thật 23/09): fact CHỮ TỰ DO ("bổ sung", tiềm năng, hiện trạng…) chỉ được ĐIỀN ô trống, không đè.
  -- "có 1 phòng ngủ ngay tầng trệt tiện cho ông bà" từng đè 3 phòng ngủ → 1 và "trệt + 2 lầu" → "trệt".
  -- Chỉ fact đúng ô thông số (kết cấu, số phòng, diện tích, pháp lý, hẻm, hướng…) mới được sửa giá trị đã có.
  perform public.ap_thong_so(new.listing_id, j, bac, de and new.question in (
    'ket_cau', 'so_phong_ngu', 'so_wc', 'so_phong', 'dien_tich', 'dien_tich_dat', 'dien_tich_san', 'dien_tich_tim_tuong',
    'phap_ly', 'do_rong_hem', 'do_rong_duong', 'mat_tien', 'huong', 'tang', 'no_hau', 'nam_xay', 'chieu_cao', 'tho_cu',
    'noi_that', 'cach_mat_tien'));
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.van_ban_nhung(p_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.che_sdt(concat_ws('. ',
    (case l.deal when 'cho_thue' then 'Cho thuê ' else 'Bán ' end) ||
      case l.property_type
        when 'nha_pho' then 'nhà phố' when 'nha_cap4' then 'nhà cấp 4' when 'chung_cu' then 'căn hộ chung cư'
        when 'dat' then 'đất' when 'biet_thu' then 'biệt thự' when 'phong_tro' then 'phòng trọ'
        when 'mat_bang' then 'mặt bằng' when 'toa_nha' then 'toà nhà, căn hộ dịch vụ'
        when 'dat_nong_nghiep' then 'đất nông nghiệp' when 'dat_kinh_doanh' then 'đất kinh doanh'
        when 'kho_xuong' then 'kho xưởng' else 'bất động sản' end,
    nullif(concat_ws(', ', l.location_raw, l.street, l.ward, l.district), ''),
    -- 20260923g: câu rao GỐC của người bán — chi tiết bot không lưu vào ô nào ("sau nhà có đất trống cho chó mèo
    -- chạy", "phòng nào cũng có cửa sổ") vẫn vào vector. SĐT che bởi che_sdt() bọc ngoài cả đoạn.
    case when coalesce(btrim(l.description), '') <> '' then 'Người bán tả: ' || left(l.description, 3000) end,
    (select 'Dự án ' || p.name from public.projects p where p.id = l.project_id),
    case when l.area_m2 is not null then 'Diện tích ' || trim_scale(l.area_m2) || ' m2' end,
    case when l.frontage_m is not null and l.length_m is not null
      then 'Ngang ' || trim_scale(l.frontage_m) || ' m, dài ' || trim_scale(l.length_m) || ' m' end,
    case when l.price_raw is not null then 'Giá ' || l.price_raw end,
    coalesce(l.floors_text, case when l.floors is not null then l.floors || ' tầng' end),
    case when l.bedrooms is not null then l.bedrooms || ' phòng ngủ' end,
    case when l.bathrooms is not null then l.bathrooms || ' WC' end,
    case l.access_type
      when 'mat_tien' then 'Mặt tiền đường' when 'hem_xe_tai' then 'Hẻm xe tải'
      when 'hem_xe_hoi' then 'Hẻm xe hơi' when 'hem_xe_may' then 'Hẻm xe máy' when 'hem' then 'Trong hẻm' end ||
      case when l.alley_width_m is not null then ' rộng ' || trim_scale(l.alley_width_m) || ' m' else '' end,
    case l.legal_status
      when 'so_hong_rieng' then 'Sổ hồng riêng' when 'so_hong_chung' then 'Sổ hồng chung' when 'so_hong' then 'Có sổ'
      when 'hdmb' then 'Hợp đồng mua bán' when 'giay_tay' then 'Giấy tay' end ||
      case when l.has_completion then ', đã hoàn công' else '' end,
    case when l.direction is not null then 'Hướng ' || l.direction end,
    case when l.floor is not null then 'Tầng ' || l.floor end,
    case when l.car_in_house then 'Xe hơi vào tận nhà' end,
    case when l.corner_lot then 'Căn góc' end,
    case when l.has_elevator then 'Có thang máy' end,
    case when coalesce(array_length(l.nhan, 1), 0) > 0
      then 'Đặc điểm: ' || array_to_string(array(select replace(x, '_', ' ') from unnest(l.nhan) x), ', ') end,
    (select string_agg(replace(f.question, '_', ' ') || ': ' || f.answer, '. ' order by f.question)
       from (select distinct on (question) question, answer
               from public.listing_facts
              where listing_id = l.id and coalesce(answer, '') <> ''
                and question not in ('hinh_anh', 'duyet_tin', 'danh_gia', 'xac_nhan_lich', 'con_ban', 'nhan')
              order by question, created_at desc) f)
  ))
  from public.listings l where l.id = p_id;
$function$
;
