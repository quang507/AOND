-- 20261026c — Bản đồ web tìm THEO KHUNG ĐANG XEM + lớp dự án + lớp đường (SRS-5.1zzzzzzz206, chủ dự án 26/10/2026: "giữ OpenStreetMap, làm
-- tìm theo khung + lớp dự án đường đi", rồi chọn "Đổi sang MapLibre + OpenFreeMap"; tham chiếu cozrum.com: tick "Tìm kiếm khi tôi di chuyển
-- bản đồ", URL mang `bounds=`).
-- Trước: /ban-do kéo cố định 300 tin mới nhất (bắt buộc có phường + giá), không có dự án / đường. Nay MỘT hàm trả cả ba lớp trong khung,
-- mỗi lớp tối đa 300 điểm — trình duyệt gọi lại khi kéo / phóng bản đồ (một request cho mọi lớp, đỡ egress).
-- Bảng `duong` không mở cho anon (RLS bật, không policy — cố ý) nên hàm là SECURITY DEFINER và CHỈ trả cột công khai: tên, loại, phường, quận cũ,
-- toạ độ cấp đường (mỗi dòng một điểm đại diện, không phải số nhà). Khung rộng có hơn 300 điểm thì lấy theo băm tên (rải đều, cố định). Lớp đường bỏ `hem` (25k dòng, quá dày, tên hẻm không giúp người xem).
-- Tin: đúng tập trạng thái web hiện (`TRANG_THAI_HIEN` ở lib/supabase.ts) — không theo policy anon (policy còn `da_chot`, web không hiện).
create or replace function public.ban_do_khung(p_tay double precision, p_nam double precision, p_dong double precision, p_bac double precision,
                                               p_lop text[] default array['can'])
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'can', case when 'can' = any(p_lop) then coalesce((
      select jsonb_agg(to_jsonb(t)) from (
        -- đúng CARD_COLS + lat, lng (lib/supabase.ts) — đủ cho ListingCard, không kéo mô tả
        select l.id, l.code, l.deal, l.district, l.ward, l.street, l.location_raw, l.area_m2, l.price_vnd, l.price_raw, l.property_type,
               l.bedrooms, l.bathrooms, l.floors, l.access_type, l.status, l.created_at, l.lat, l.lng
          from public.listings l
         where l.status in ('dang_ban', 'dang_quan_tam', 'da_coc')
           and l.lat between least(p_nam, p_bac) and greatest(p_nam, p_bac)
           and l.lng between least(p_tay, p_dong) and greatest(p_tay, p_dong)
         order by l.created_at desc
         limit 300) t), '[]'::jsonb) else '[]'::jsonb end,
    'du_an', case when 'du_an' = any(p_lop) then coalesce((
      select jsonb_agg(to_jsonb(t)) from (
        select p.slug, p.name, p.developer, p.district, p.status_text, p.lat::double precision as lat, p.lng::double precision as lng
          from public.projects p
         where p.lat is not null and p.lng is not null
           and p.lat between least(p_nam, p_bac) and greatest(p_nam, p_bac)
           and p.lng between least(p_tay, p_dong) and greatest(p_tay, p_dong)
         order by hashtext(coalesce(p.slug, p.name))   -- khung rộng quá 300: rải đều, không dồn tên A–C (thứ tự cố định)
         limit 300) t), '[]'::jsonb) else '[]'::jsonb end,
    -- Lớp đường CHỈ khi khung nhỏ (≤ 0,08° mỗi chiều ≈ zoom 15): khung cả TP.HCM quét hết bảng `duong` (dòng nặng vì cột vector) mất ~5 s
    -- (đo 26/10), khung 0,02° × 0,03° đi chỉ mục `duong_lat_lng` ~36 ms. Chặn ở đây vì hàm mở cho anon — web cũng chỉ xin lớp này từ zoom 15.
    'duong', case when 'duong' = any(p_lop)
                   and greatest(p_nam, p_bac) - least(p_nam, p_bac) <= 0.08
                   and greatest(p_tay, p_dong) - least(p_tay, p_dong) <= 0.08 then coalesce((
      select jsonb_agg(to_jsonb(t)) from (
        select d.ten, d.loai, d.phuong, d.quan_cu, d.lat, d.lng
          from public.duong d
         where d.loai in ('duong', 'so')
           and d.lat between least(p_nam, p_bac) and greatest(p_nam, p_bac)
           and d.lng between least(p_tay, p_dong) and greatest(p_tay, p_dong)
         order by hashtext(d.ten || coalesce(d.phuong, ''))
         limit 300) t), '[]'::jsonb) else '[]'::jsonb end);
$function$;

comment on function public.ban_do_khung(double precision, double precision, double precision, double precision, text[]) is
  '[HỆ THỐNG] Bản đồ web /ban-do: tin đang hiện + dự án + đường (bỏ hẻm) trong khung tây/nam/đông/bắc, mỗi lớp ≤ 300. Chỉ cột công khai. SRS-5.1zzzzzzz206.';

revoke all on function public.ban_do_khung(double precision, double precision, double precision, double precision, text[]) from public;
grant execute on function public.ban_do_khung(double precision, double precision, double precision, double precision, text[])
  to anon, authenticated, service_role;
