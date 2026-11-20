-- 20/11/2026 (SRS-5.1zzzzzzz530, bắn thử lại sau 20261120c): (1) vùng Bình Dương / Bà Rịa – Vũng Tàu cũ: bảng `duong` và `wards` ghi
-- quan_cu = TÊN TỈNH ("Bình Dương"), quận / thành phố cũ chỉ nằm trong `wards.don_vi_cu` ("…thuộc thành phố Thuận An") → "Nguyễn Văn Tiết,
-- Thành phố Thuận An" không khớp, tin kẹt. Nay khớp quận theo quan_cu của đường HOẶC don_vi_cu của phường. (2) Long An: khách nói "xã Đức Hòa"
-- nằm trong ô địa chỉ, AI không tách ra ô xã / phường → trigger không thấy. Nay tìm tên xã / phường ba tỉnh ngay trong chữ địa chỉ khi chữ đó
-- có nhắc tên tỉnh (Long An / Tây Ninh / Đồng Nai) và khớp đúng MỘT đơn vị của tỉnh đó.

create or replace function public.phuong_tu_quan_duong(p_quan text, p_duong text) returns text
language plpgsql stable set search_path to 'public' as $$
declare
  v_duong text := public.bo_dau(btrim(regexp_replace(coalesce(p_duong, ''), '^\s*(đường|duong|đ\.)\s*', '', 'i')));
  v_quan text := public.bo_tien_to_quan(p_quan);
  v_ds text[]; v_lat double precision; v_lng double precision; v_n int; v text;
begin
  if v_duong = '' or v_quan = '' then return null; end if;
  select array_agg(d.phuong), avg(d.lat), avg(d.lng) into v_ds, v_lat, v_lng
  from public.duong d left join public.wards w on w.ten_day_du = d.phuong
  where d.ten_khong_dau = v_duong and d.loai = 'duong' and d.phuong is not null and d.lat is not null
    and (public.bo_tien_to_quan(d.quan_cu) = v_quan
         or public.bo_dau(coalesce(w.don_vi_cu, '')) ~ ('(thanh pho|thi xa|huyen|quan) ' || v_quan || '([^a-z0-9]|$)'));
  select count(distinct x) into v_n from unnest(coalesce(v_ds, '{}')) x;
  if coalesce(v_n, 0) = 0 then return null; end if;
  if v_n = 1 then return public.chuan_hoa_phuong(v_ds[1]); end if;
  v := public.phuong_tai_diem(v_lat, v_lng);
  if v is not null and v = any (v_ds) then
    return v;
  end if;
  select x into v from unnest(v_ds) x group by x order by count(*) desc, x limit 1;
  return public.chuan_hoa_phuong(v);
end $$;

create or replace function public.xa_tinh_khac_trong_chu(p text) returns text
language sql stable set search_path to 'public' as $$
  with t as (select public.bo_dau(coalesce(p, '')) as s),
  ung as (
    select distinct x.ten_day_du from public.xa_tinh_khac x, t
    where t.s ~ 'long an|tay ninh|dong nai'
      -- Long An gộp vào Tây Ninh từ 01/07/2025: khách vẫn gõ "Long An", bảng ghi tỉnh mới Tây Ninh (tinh_cu trống).
      and (t.s like '%' || public.bo_dau(x.tinh) || '%' or t.s like '%' || public.bo_dau(coalesce(x.tinh_cu, '#')) || '%'
           or (x.tinh = 'Tây Ninh' and t.s like '%long an%'))
      and t.s ~ ('(^|[^a-z0-9])' || public.bo_dau(x.ten_day_du) || '([^a-z0-9]|$)')
      and not exists (select 1 from public.wards w where public.bo_dau(w.ten) = public.bo_dau(x.ten)))
  select ten_day_du from ung where (select count(*) from ung) = 1;
$$;

create or replace function public.listings_phuong_tu_duong() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if new.ward is null then
    begin
      new.ward := coalesce(public.xa_tinh_khac_tu_chu(coalesce(nullif(new.boc_tach->>'xa', ''), new.boc_tach->>'phuong')),
                           public.xa_tinh_khac_trong_chu(coalesce(nullif(new.boc_tach->>'dia_chi', ''), new.location_raw)),
                           public.phuong_tu_quan_duong(new.district, new.street));
      if new.ward is not null then
        new.ward_source := 'suy_doan';
      end if;
    exception when others then
      null;
    end;
  end if;
  return new;
end $$;

-- Bản cuối của trigger (áp 20/11 sau bắn thử): lần lưu sau của lõi gửi ward_source rỗng → phường có mà nguồn trống thì ghi suy_doan.
create or replace function public.listings_phuong_tu_duong() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if new.ward is null then
    begin
      new.ward := coalesce(public.xa_tinh_khac_tu_chu(coalesce(nullif(new.boc_tach->>'xa', ''), new.boc_tach->>'phuong')),
                           public.xa_tinh_khac_trong_chu(coalesce(nullif(new.boc_tach->>'dia_chi', ''), new.location_raw)),
                           public.phuong_tu_quan_duong(new.district, new.street));
    exception when others then
      null;
    end;
  end if;
  if new.ward is not null and new.ward_source is null then
    new.ward_source := 'suy_doan';
  end if;
  return new;
end $$;
