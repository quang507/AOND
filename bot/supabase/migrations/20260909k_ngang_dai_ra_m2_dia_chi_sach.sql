-- 20260909k — vá sau khi chạy 12 kịch bản chat trên production (09/09/2026 tối):
--   1. "Lô đất 5x20" → boc_thong_so ghi ngang 5, dài 20 nhưng area_m2 để trống, nên
--      diem_tin báo "thiếu diện tích" và bot hỏi mãi "5x20 là trên sổ hả?". Nay
--      listings_chuan_hoa_cot suy area_m2 = ngang × dài khi chưa có diện tích.
--   2. trg_vi_tri_vao_cot ghi nguyên câu "Nhà ở hẻm 123 Trần Bình Trọng, phường 2,
--      quận 5" rồi bóc phường ra để lại ", ," — nay gọt dấu phẩy kép và đuôi
--      "quận/tp" trùng với cột district ngay lúc ghi.

create or replace function public.listings_chuan_hoa_cot()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  new.price_raw := public.chuan_hoa_gia_raw(new.price_raw);
  new.ward      := public.chuan_hoa_phuong(new.ward);
  -- 20260909k: ngang × dài → diện tích (chỉ khi chưa có; 5…5000 m² như listing_facts_sync_cols)
  if new.area_m2 is null and new.frontage_m is not null and new.length_m is not null then
    if new.frontage_m * new.length_m between 5 and 5000 then
      new.area_m2 := round((new.frontage_m * new.length_m)::numeric, 1);
    end if;
  end if;
  if new.location_raw is not null then
    new.location_raw := btrim(regexp_replace(regexp_replace(new.location_raw, '\s*,(\s*,)+', ',', 'g'), '^[\s,]+|[\s,]+$', '', 'g'));
  end if;
  return new;
end;
$function$;
comment on function public.listings_chuan_hoa_cot() is
  'Trigger BEFORE INSERT/UPDATE listings: chuẩn hoá price_raw, ward; 20260909k: area_m2 = frontage_m × length_m khi chưa có; location_raw gọt dấu phẩy kép.';

-- Dữ liệu đang có: tin nào ngang×dài đã có mà m² trống thì điền luôn (trigger chỉ chạy khi có UPDATE).
update public.listings set area_m2 = round((frontage_m * length_m)::numeric, 1)
 where area_m2 is null and frontage_m is not null and length_m is not null
   and frontage_m * length_m between 5 and 5000;
update public.listings set location_raw = btrim(regexp_replace(regexp_replace(location_raw, '\s*,(\s*,)+', ',', 'g'), '^[\s,]+|[\s,]+$', '', 'g'))
 where location_raw ~ ',\s*,';
