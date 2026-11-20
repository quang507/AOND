-- 20/11/2026 (audit luồng rao bán, SRS-5.1zzzzzzz530; chủ dự án: "đã có quận và đường thì gắn vào map thì ra phường mới rồi"):
-- 3/5 tin chủ đã duyệt không lên web vì thiếu phường (trigger dang_tin cần ward) — Phan Xích Long (Phú Nhuận), Nguyễn Trãi (Q5), Thuận An;
-- bot không hỏi địa chỉ, chỉ báo "đang hoàn tất" và đẩy admin. Long An / Tây Ninh / Đồng Nai thì KHÔNG BAO GIỜ lên được: chuan_hoa_phuong
-- chỉ nhận tên trong `wards` (168 đơn vị TP.HCM) nên trigger chuan_hoa_cot xoá trắng mọi xã ở `xa_tinh_khac`.
-- Sửa: (1) chuan_hoa_phuong nhận cả xã / phường của ba tỉnh; (2) tin thiếu phường → nhận xã ba tỉnh từ ô khách nói, hoặc có quận + đường thì
-- "gắn vào map": các đoạn của đường đó trong quận (bảng `duong`, mỗi dòng một phường kèm toạ độ) → một phường thì lấy luôn; nhiều phường thì
-- điểm giữa → phuong_tai_diem (ranh giới phường), điểm giữa rơi ngoài các phường đường đi qua thì lấy phường có nhiều đoạn nhất. Nguồn: suy_doan.

create or replace function public.chuan_hoa_phuong(p_text text) returns text
language sql stable set search_path to 'public' as $$
  select coalesce(
    (select w.ten_day_du from public.wards w where w.ten_day_du = btrim(p_text) limit 1),
    (select x.ten_day_du from public.xa_tinh_khac x where x.ten_day_du = btrim(p_text) limit 1));
$$;

create or replace function public.bo_tien_to_quan(p text) returns text
language sql immutable set search_path to 'public' as $$
  select btrim(public.bo_dau(regexp_replace(coalesce(p, ''), '^\s*(quận|huyện|thành phố|thị xã|tp\.?|q\.)\s*', '', 'i')))
$$;

create or replace function public.phuong_tu_quan_duong(p_quan text, p_duong text) returns text
language plpgsql stable set search_path to 'public' as $$
declare
  v_duong text := public.bo_dau(btrim(regexp_replace(coalesce(p_duong, ''), '^\s*(đường|duong|đ\.)\s*', '', 'i')));
  v_quan text := public.bo_tien_to_quan(p_quan);
  v_n int; v_mot text; v_lat double precision; v_lng double precision; v text;
begin
  if v_duong = '' or v_quan = '' then return null; end if;
  select count(distinct d.phuong), min(d.phuong), avg(d.lat), avg(d.lng) into v_n, v_mot, v_lat, v_lng
  from public.duong d
  where d.ten_khong_dau = v_duong and d.loai = 'duong' and d.phuong is not null and d.lat is not null
    and public.bo_tien_to_quan(d.quan_cu) = v_quan;
  if coalesce(v_n, 0) = 0 then return null; end if;
  if v_n = 1 then return public.chuan_hoa_phuong(v_mot); end if;
  v := public.phuong_tai_diem(v_lat, v_lng);
  if v is not null and exists (select 1 from public.duong d where d.ten_khong_dau = v_duong and d.loai = 'duong' and d.phuong = v
                                  and public.bo_tien_to_quan(d.quan_cu) = v_quan) then
    return v;
  end if;
  select d.phuong into v from public.duong d
  where d.ten_khong_dau = v_duong and d.loai = 'duong' and d.phuong is not null and public.bo_tien_to_quan(d.quan_cu) = v_quan
  group by d.phuong order by count(*) desc, d.phuong limit 1;
  return public.chuan_hoa_phuong(v);
end $$;

-- Xã / phường của Long An, Tây Ninh, Đồng Nai từ chữ khách gõ ("Đức Hòa", "xã Long Chữ"): chỉ khi khớp DUY NHẤT một đơn vị và tên đó không
-- trùng một phường TP.HCM (trùng thì để đường quận + đường hoặc admin quyết).
create or replace function public.xa_tinh_khac_tu_chu(p text) returns text
language sql stable set search_path to 'public' as $$
  with ung as (
    select distinct x.ten_day_du from public.xa_tinh_khac x
    where coalesce(btrim(p), '') <> ''
      and (public.bo_dau(x.ten_day_du) = public.bo_dau(btrim(p))
           or public.bo_dau(x.ten) = public.bo_dau(btrim(regexp_replace(p, '^\s*(xã|phường|thị trấn|xa|phuong)\s+', '', 'i'))))
      and not exists (select 1 from public.wards w where public.bo_dau(w.ten) = public.bo_dau(x.ten)))
  select ten_day_du from ung where (select count(*) from ung) = 1;
$$;

create or replace function public.listings_phuong_tu_duong() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if new.ward is null then
    begin
      new.ward := coalesce(public.xa_tinh_khac_tu_chu(coalesce(nullif(new.boc_tach->>'xa', ''), new.boc_tach->>'phuong')),
                           public.phuong_tu_quan_duong(new.district, new.street));
      if new.ward is not null then
        new.ward_source := 'suy_doan';
      end if;
    exception when others then
      null;   -- suy phường hỏng thì để trống như cũ, không chặn ghi tin
    end;
  end if;
  return new;
end $$;

-- Tên trigger xếp SAU trg_listings_chuan_hoa_cot / trg_z_listings_normalize_status và TRƯỚC trg_zz_listings_dang_tin (quyết định lên web).
drop trigger if exists trg_z_listings_phuong_tu_duong on public.listings;
create trigger trg_z_listings_phuong_tu_duong before insert or update on public.listings
  for each row execute function public.listings_phuong_tu_duong();
