-- SRS-5.1zzzzzh (12/10/2026, bắn production 3 kịch bản — thu-kb-thue): "căn hộ Sunrise City quận 7" → cột street = "Sunrise City".
-- Trigger `listings_boc_thong_so` điền street bằng `boc_ten_duong(location_raw)` khi street trống; với căn hộ, location_raw là TÊN DỰ ÁN
-- (W3: tên dự án = vị trí căn hộ), nên tên dự án thành tên đường. Chữ đọc ra trùng tên dự án tin đang gắn → street để trống.
-- Chỉ đổi đoạn đầu hàm; phần còn lại chép nguyên từ schema.sql (bản DB hiện hành).
create or replace function public.listings_boc_thong_so()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  j jsonb;
  de boolean;
  co boolean := false;
begin
  -- 20261012c (SRS-5.1zzzzzh, bắn production 12/10 thu-kb-thue): căn hộ "Sunrise City" → location_raw "Sunrise City" → street "Sunrise City".
  -- Tên DỰ ÁN không phải tên ĐƯỜNG: chữ đọc ra trùng tên dự án tin đang gắn thì cột street để trống.
  if new.street is null then
    new.street := public.boc_ten_duong(new.location_raw);
    if new.street is not null and new.project_id is not null and exists (
      select 1 from public.projects p where p.id = new.project_id and lower(btrim(p.name)) = lower(btrim(new.street))
    ) then new.street := null; end if;
  end if;
  if new.description is null then return new; end if;
  -- 20261002a (đợt 1 chuyển luật sang AI): tin do AI quyết thông số (dấu `_thong_so_ai`, chat-reply chế độ `ai`) → KHÔNG đọc
  -- câu rao bằng regex. Bắn thử lx-t5-05: "nằm trong khu công nghiệp nên không có hẻm" → `\mhem\M` → access_type = 'hem'.
  if coalesce(new.boc_tach->>'_thong_so_ai', '') = 'true' then return new; end if;
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
end $function$
;
