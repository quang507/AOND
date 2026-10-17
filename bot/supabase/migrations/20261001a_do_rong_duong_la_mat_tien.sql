-- 20261001a: listing_facts_sync_cols() — fact `do_rong_duong` (độ rộng đường trước nhà / đất) → access_type 'mat_tien' (01/10/2026).
--
-- Bắn thử bán lx-ban-293c (v293): "bán đất thổ cư 5x20 đường nhựa 6m xã Tân Thạnh Đông" → bản tin "Đường vào: hẻm xe tải 6m".
-- Trigger xếp loại đường vào theo bề rộng cho cả `do_rong_hem` lẫn `do_rong_duong`; đường ≥ 6m thành "hẻm xe tải". Độ rộng ĐƯỜNG
-- (không phải hẻm) là mặt tiền đường. Thân hàm lấy nguyên bản DB (schema.sql), chỉ đổi một dòng; access_type đã có thì giữ.

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
  -- 20260925e: "nhà cấp 4" (câu trả lời bất kỳ) mà tin đang là nhà phố / chưa rõ → nhà cấp 4.
  if l.property_type in ('nha_pho', 'chua_ro') and public.bo_dau(v_txt) ~ '\m(cap 4|cap bon|nha c4)\M'
     and public.bo_dau(v_txt) !~ '(khong|ko|chua)\s*(phai\s*)?(la\s*)?(nha\s*)?cap' then
    update listings set property_type = 'nha_cap4' where id = new.listing_id and property_type in ('nha_pho', 'chua_ro');
  end if;
  -- 20260927a: "căn chung cư ở Botanic", "chung cư mà em", "căn hộ tầng 6" → căn hộ (tin nhà phố chưa có số tầng / chưa rõ).
  if l.property_type in ('nha_pho', 'chua_ro') and l.floors is null
     and public.bo_dau(v_txt) ~ '(^\s*|\m(can|la|ban|o|dang|co|toi|minh|anh|chi|em|chu|cua)\s+)(chung cu|can ho|cc mini|chung cu mini)\M'
     and public.bo_dau(v_txt) !~ '(gan|canh|doi dien|sat|ke|ben|view|nhin ra|cach)\s+(cac\s+)?(chung cu|can ho)'
     and public.bo_dau(v_txt) !~ '(khong|ko|chua)\s*(phai\s*)?(la\s*)?(chung cu|can ho)' then
    update listings set property_type = 'chung_cu' where id = new.listing_id and property_type in ('nha_pho', 'chua_ro') and floors is null;
  end if;

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
    if v_num is not null and v_num > 5 and (v_num < 5000 or (l.property_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh', 'kho_xuong', 'toa_nha') and v_num < 1000000)) then
      update listings set area_m2 = v_num, specs_source = bac
       where id = new.listing_id and (area_m2 is null or de)
         and area_m2 is distinct from v_num;
    end if;

  -- Tim tường chỉ là diện tích CỦA chung cư; nhà đất thì đó là sàn, không phải đất.
  elsif new.question = 'dien_tich_tim_tuong' then
    if l.property_type = 'chung_cu' then
      v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
      if v_num is not null and v_num > 5 and (v_num < 5000 or (l.property_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh', 'kho_xuong', 'toa_nha') and v_num < 1000000)) then
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
             -- 20261001a: "đường nhựa 6m" (độ rộng ĐƯỜNG trước nhà / đất) là mặt tiền đường, không phải hẻm xe tải.
             access_type = coalesce(access_type, case when new.question = 'do_rong_duong' then 'mat_tien'
                                                      when v_num >= 6 then 'hem_xe_tai' when v_num >= 3 then 'hem_xe_hoi' else 'hem_xe_may' end),
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
