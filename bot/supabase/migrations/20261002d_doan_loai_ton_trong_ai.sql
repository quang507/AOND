-- 20261002d — trigger đoán LOẠI BĐS tôn trọng dấu "AI đã quyết" (SRS-5.1zb, đối chiếu AI ↔ code 02/10/2026).
--
-- `listings_fill_property_type` (BEFORE INSERT/UPDATE OF description, location_raw, property_type) điền loại cho tin `chua_ro`
-- bằng regex `guess_property_type` trên mô tả. Đợt 1 (20261002a) đã cho `listings_fill_specs` thôi đọc mô tả khi tin mang dấu
-- `boc_tach._thong_so_ai`, nhưng trigger loại thì quên: AI đọc tin rồi mà không thấy loại (để `chua_ro` cho bot HỎI), regex lại
-- tự điền — "Bán nhà 1 trệt 1 lầu, có kho chứa đồ" → kho_xuong (`kho` xét trước), "bán nhà gần chung cư Ehome" → chung_cu.
-- Tin có dấu thì loại do AI hoặc chủ nhà nói; trống thì bot hỏi.
create or replace function public.listings_fill_property_type()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  g public.property_type;
begin
  if coalesce(new.boc_tach->>'_thong_so_ai', '') = 'true' then return new; end if;
  if new.property_type is null or new.property_type = 'chua_ro' then
    g := public.guess_property_type(
      coalesce(new.description, '') || ' ' || coalesce(new.location_raw, '')
    );
    if g is not null then
      new.property_type := g;
    end if;
  end if;
  return new;
end;
$function$;
