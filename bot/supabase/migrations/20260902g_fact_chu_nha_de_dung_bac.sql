-- 20260902g — FR-172 c: fact chủ nhà đè đúng BẬC NGUỒN (02/09/2026, soát truy vết)
--
-- Bản 20260902e viết `de := specs_source = 'boc_mo_ta'` — tức lời chủ nhà chỉ
-- đè được số bóc từ mô tả. Hai hệ quả ngược luật đã có:
--   * FR-164 a: chu_xac_nhan (3) > admin (2) — nhưng cột admin nhập tay thì chủ
--     nhà nói gì cũng không sửa được.
--   * FR-163 a: câu trả lời MỚI NHẤT của chủ nhà thắng — nhưng chủ nhà trả lời
--     lần 2 ("à 4 tầng chứ không phải 3") không đè được lần 1.
-- Nay dùng đúng `bac_nguon()` (20260828b): ghi khi cột trống HOẶC bậc của fact
-- ≥ bậc đang giữ. `boc_mo_ta` rơi vào nhánh else của bac_nguon = 1 = suy_doan.
-- Thêm CHECK cho specs_source để ba giá trị này là tất cả.

alter table public.listings drop constraint if exists listings_specs_source_check;
alter table public.listings add constraint listings_specs_source_check
  check (specs_source is null or specs_source in ('boc_mo_ta', 'admin', 'chu_xac_nhan'));

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
  -- Được đè khi bậc của fact ≥ bậc cụm cột đang giữ (chu_xac_nhan ≥ chu_xac_nhan:
  -- câu mới nhất thắng — FR-163 a; chu_xac_nhan > admin > boc_mo_ta — FR-164 a).
  de := public.bac_nguon(bac) >= public.bac_nguon(coalesce(l.specs_source, 'boc_mo_ta'));
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
  'FR-153 + FR-172: đổ fact nhỏ giọt sang cột listings. Đè khi bac_nguon(fact) >= bac_nguon(specs_source): chủ nhà > admin > bóc mô tả; câu chủ nhà mới nhất thắng.';
