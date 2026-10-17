-- 20261009b — Cột phường chỉ mang tên phường MỚI có thật (SRS-5.1zzzzj, bắn production 09/10/2026).
--
-- "Cần bán nhà MTKD đường Võ Văn Tần phường 6 quận 3 cũ…" → listings.ward = "Phường 6", bản nháp gửi khách "Phường 6, Quận 3".
-- Bảng `wards` (168 phường / xã mới) không có tên đó; `phuong_cu` cũng không có (Phường 6 Quận 3 gộp vào Võ Thị Sáu năm 2020).
-- Lớp lỗi: mỗi đường ghi phường tự chuẩn hoá một kiểu — `chuan_hoa_phuong` (hàm này) ghép "Phường " + số bất kể quận, viết hoa
-- chữ gõ thường, và cho QUA mọi chuỗi 2–50 ký tự. Từ nay:
--   • Code (edge function) là chỗ DUY NHẤT chuẩn hoá: `tenPhuongCot` (khop-phuong.ts) — tên mới / cũ / số cũ + quận cũ → tên mới
--     có thật hoặc null; mọi lượt ghi fact qua `ghiFact` (_shared/ghi-fact.ts), mọi `ward:` qua `tenPhuongCot` (bot/tests/ghi-phuong-mot-cua.mjs).
--   • DB không chuẩn hoá nữa, chỉ CHẶN LẦN CUỐI: `chuan_hoa_phuong` trả đúng `wards.ten_day_du` hoặc null. Chữ lạ lọt tới cột là
--     LỖI CODE (không phải đường đi bình thường) → cột để trống (bot hỏi lại phường, không hỏng cả lượt) VÀ ghi sổ lỗi (`log_loi`).
--     Hai chỗ: trigger cột `listings_chuan_hoa_cot` (ghi thẳng cột) và trigger soát fact `phuong` (đường fact → cột).
--   • Nhánh `vi_tri` của `listing_facts_sync_cols` ("đường Lạc Long Quân p5" → "Phường 5") tự hết tác dụng: số không bao giờ là tên
--     chuẩn. Giữ nguyên thân hàm đó (không chép lại 300 dòng), phường kèm địa chỉ do code đọc (`phuongNhacTrongCau` → `ghiFact`).
--   • Dữ liệu cũ: dòng nào cột phường không phải tên chuẩn thì đổi sang tên chuẩn khi tra được CHẮC (tên mới viết khác, hay tên cũ
--     + quận cũ của dòng về đúng MỘT phường mới), không thì để trống.

-- (1) Chặn lần cuối: đúng tên đầy đủ trong `wards` → giữ; còn lại → null. KHÔNG tra tên cũ, KHÔNG ghép số.
create or replace function public.chuan_hoa_phuong(p_text text)
 returns text
 language sql
 stable
 set search_path to 'public'
as $function$
  select w.ten_day_du from public.wards w where w.ten_day_du = btrim(p_text) limit 1;
$function$;
comment on function public.chuan_hoa_phuong(text) is
  '[RỔ HÀNG] Chặn lần cuối cột phường (20261009b): trả đúng wards.ten_day_du khi chuỗi là tên đầy đủ có thật, không thì null. Không chuẩn hoá — code (tenPhuongCot, khop-phuong.ts) là chỗ duy nhất chuẩn hoá.';

-- (2) Trigger cột: thân lấy nguyên từ schema.sql (bản DB thật, 20260925d), chỉ đổi dòng `new.ward`.
CREATE OR REPLACE FUNCTION public.listings_chuan_hoa_cot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_ward text;
begin
  new.price_raw := public.chuan_hoa_gia_raw(new.price_raw);
  -- 20261009b: chỉ xét khi phường ĐỔI (dòng cũ đã sửa ở bước dữ liệu bên dưới). Không phải tên chuẩn → để trống + sổ lỗi.
  if new.ward is not null and (tg_op = 'INSERT' or new.ward is distinct from old.ward) then
    v_ward := public.chuan_hoa_phuong(new.ward);
    if v_ward is null then
      perform public.log_loi('listings.ward khong chuan', left(coalesce(new.code, new.id::text) || ': "' || new.ward || '"', 300), null::integer);
    end if;
    new.ward := v_ward;
  end if;
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
          and public.bo_dau(coalesce(f.answer, '')) !~ '\d\s*x\s*\d+([.,]\d+)?\s*(m2|m²|m\M|met)'
     ) then
    new.area_m2 := round(((new.frontage_m + new.rear_width_m) / 2 * new.length_m)::numeric, 1);
  end if;
  if new.location_raw is not null then
    new.location_raw := btrim(regexp_replace(regexp_replace(new.location_raw, '\s*,(\s*,)+', ',', 'g'), '^[\s,]+|[\s,]+$', '', 'g'));
  end if;
  return new;
end;
$function$;

-- (3) Soát fact `phuong`: `listing_facts_sync_cols` đổ fact này vào cột qua `chuan_hoa_phuong` — chữ lạ thì cột không đổi, nhưng
-- câu phường đã bị `ghi_fact_listing` đóng. Code (`ghiFact`) không bao giờ ghi fact phường không chuẩn; tới được đây là lỗi code → sổ.
create or replace function public.listing_facts_soat_phuong()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.question = 'phuong' and public.chuan_hoa_phuong(new.answer) is null then
    perform public.log_loi('fact phuong khong chuan', left(new.listing_id::text || ': "' || coalesce(new.answer, '') || '" (' || coalesce(new.source, '?') || ')', 300), null::integer);
  end if;
  return null;
end $function$;
revoke all on function public.listing_facts_soat_phuong() from public, anon, authenticated;
comment on function public.listing_facts_soat_phuong() is
  '[RỔ HÀNG] 20261009b: fact phuong mang chữ không phải wards.ten_day_du → ghi bot_errors (lỗi code: mọi lượt ghi fact của bot qua ghiFact/tenPhuongCot).';
drop trigger if exists trg_listing_facts_soat_phuong on public.listing_facts;
create trigger trg_listing_facts_soat_phuong after insert on public.listing_facts
  for each row when (new.question = 'phuong') execute function public.listing_facts_soat_phuong();

-- (4) Dữ liệu cũ. Tên đúng chữ → giữ; tên mới viết khác (không dấu / thiếu tiền tố) → tên đầy đủ; tên cũ + quận cũ của dòng về
-- đúng MỘT phường mới (hoặc chỉ một phần "toàn bộ") → phường đó; còn lại → null (bot hỏi lại khi người bán nhắn).
with ung as (
  select l.id,
         coalesce(
           (select w.ten_day_du from public.wards w
             where public.bo_dau(w.ten_day_du) = public.bo_dau(btrim(l.ward))
                or public.bo_dau(w.ten) = regexp_replace(public.bo_dau(btrim(l.ward)), '^(phuong|xa|thi tran|dac khu)\s+', '')
             order by w.ten limit 1),
           (select case when count(distinct p.phuong_moi) = 1 then min(w.ten_day_du)
                        when count(distinct p.phuong_moi) filter (where p.toan_bo) = 1 then min(w.ten_day_du) filter (where p.toan_bo)
                   end
              from public.phuong_cu p join public.wards w on w.ten = p.phuong_moi
             where public.bo_dau(p.ten) = public.bo_dau(btrim(l.ward)) and p.quan_cu = l.district)
         ) as moi
    from public.listings l
   where l.ward is not null and not exists (select 1 from public.wards w where w.ten_day_du = l.ward)
)
update public.listings l set ward = u.moi from ung u where u.id = l.id;

comment on column public.listings.ward is
  '[RỔ HÀNG] Phường / xã MỚI (sau 07/2025): null hoặc đúng một wards.ten_day_du (20261009b). Code chuẩn hoá ở MỘT cửa (tenPhuongCot); trigger listings_chuan_hoa_cot chặn lần cuối + ghi sổ lỗi.';
