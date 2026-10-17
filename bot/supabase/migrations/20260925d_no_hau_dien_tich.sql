-- 20260925d — nở hậu CỘNG vào diện tích (FR-225 b).
--
-- Chủ dự án 25/09/2026 (test Zalo: "5x12" rồi "nở hậu nhé" → bot bịa "nở hậu 4.5", diện tích vẫn 60 m²): "nở hậu nhiu
-- cộng vào diện tích nhà luôn". Diện tích do HỆ THỐNG nhân ngang × dài (không phải số m² khách nói) mà biết chiều ngang
-- hậu LỚN hơn ngang trước → tính lại theo hình thang: (ngang + hậu) / 2 × dài.
-- [giả định BA] Hậu NHỎ hơn hoặc bằng ngang thì không đụng: "nở hậu 1m" có thể là "rộng hơn 1m" chứ không phải hậu 1m.
-- Khách đã nói số m² ("60m2", "60 mét vuông") thì giữ số đó — đó là số trên sổ.
create or replace function public.listings_chuan_hoa_cot()
 returns trigger
 language plpgsql
 set search_path to 'public'
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
  -- 20260925d: nở hậu → diện tích hình thang, chỉ khi diện tích đang là ngang × dài do hệ thống nhân.
  if new.rear_width_m is not null and new.frontage_m is not null and new.length_m is not null
     and new.rear_width_m > new.frontage_m and new.rear_width_m <= new.frontage_m * 3
     and new.area_m2 = round((new.frontage_m * new.length_m)::numeric, 1)
     and not exists (
       select 1 from public.listing_facts f
        where f.listing_id = new.id and f.question in ('dien_tich', 'dien_tich_dat')
          and public.bo_dau(coalesce(f.answer, '')) ~ '\d\s*(m2|m²|met vuong|m vuong)'
     ) then
    new.area_m2 := round(((new.frontage_m + new.rear_width_m) / 2 * new.length_m)::numeric, 1);
  end if;
  if new.location_raw is not null then
    new.location_raw := btrim(regexp_replace(regexp_replace(new.location_raw, '\s*,(\s*,)+', ',', 'g'), '^[\s,]+|[\s,]+$', '', 'g'));
  end if;
  return new;
end;
$function$;
