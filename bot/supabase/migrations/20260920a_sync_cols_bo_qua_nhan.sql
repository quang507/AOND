-- 20260920a — fact `nhan` (FR-211) KHÔNG đi qua boc_thong_so / ap_thong_so.
-- Bắn thật 20/09/2026 (mau-y-A, "can 1 so hong rieng hoan cong du, can 2 tho cu 100% 2 mat tien"):
-- fact `nhan` = "căn góc / 2 mặt tiền · đã hoàn công · thổ cư 100%" ghi vào căn 2, trigger
-- listing_facts_sync_cols đem CHỮ TÊN NHÃN đi boc_thong_so → has_completion = true, corner_lot =
-- true trên căn 2 dù "hoàn công" là của căn 1. Tên nhãn là nhãn, không phải câu chủ nhà nói về
-- căn đó; cột thông số đã được chính câu gốc ghi rồi. Nhãn vẫn vào boc_tach (trg_fact_vao_boc_tach).
create or replace function public.listing_facts_sync_cols()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  perform public.ap_thong_so(new.listing_id, j, bac, de);
  return null;
end;
$function$;
