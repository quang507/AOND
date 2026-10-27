-- 20261027g_tim_moc_tinh_va_toa_do_duong — hai lỗi bản đồ chủ dự án gặp 27/10 với tin D4F12F75 (Dương Bá Trạc, Phường Chánh Hưng) (SRS-5.1zzzzzzz224).
-- (1) Ô "Quanh địa danh": gõ "Dương Bá Trạc" thì dòng ĐẦU là đường cùng tên ở Đồng Nai — dòng `duong` của Tây Ninh / Đồng Nai lưu
--     `phuong = ''` nên nhãn chỉ còn "Dương Bá Trạc", và luật "tên ngắn trước" (20261027f) đẩy nó lên trên. Nay nhãn kèm tỉnh khi không có
--     phường, và đường TP.HCM xếp trước đường tỉnh khác cùng mức khớp.
-- (2) Tin có đường + phường khớp từ điển `duong` mà vẫn ở mức tâm phường (Nominatim chưa biết tên phường mới): lấy toạ độ cấp đường từ
--     `duong` cho các tin đó một lần; từ nay `geocode-listings` tra `duong` trước Nominatim. Đặt lại `tien_ich_at` để tiện ích quanh căn
--     tính lại theo điểm mới.
create or replace function public.tim_moc(p_tim text)
returns table(ten text, loai text, lat double precision, lng double precision)
language sql
stable
security definer
set search_path to 'public'
as $$
  with q as (select public.bo_dau(btrim(coalesce(p_tim, ''))) as t)
  select ten, loai, lat, lng from (
    select ti.ten, ti.loai, ti.lat, ti.lng, (ti.ten_kd ilike q.t || '%') as dau, 0 as ngoai, 0 as phu, length(ti.ten) as dai
      from public.tien_ich ti, q
     where length(q.t) >= 3 and ti.ten_kd ilike '%' || q.t || '%' and ti.lat is not null and ti.lng is not null
    union all
    select p.name, 'du_an', p.lat, p.lng, (public.bo_dau(p.name) ilike q.t || '%'), 0, 0, length(p.name)
      from public.projects p, q
     where length(q.t) >= 3 and public.bo_dau(p.name) ilike '%' || q.t || '%' and p.lat is not null and p.lng is not null
    union all
    select d.ten || coalesce(', ' || coalesce(nullif(d.phuong, ''), nullif(d.tinh, '')), ''),
           case when d.loai = 'hem' then 'hem' else 'duong' end, d.lat, d.lng,
           (d.ten_khong_dau ilike q.t || '%' or d.ten_khong_dau ilike 'duong ' || q.t || '%'),
           (coalesce(d.tinh, '') <> 'TP.HCM')::int, (d.loai = 'hem')::int, length(d.ten)
      from public.duong d, q
     where length(q.t) >= 3 and d.ten_khong_dau ilike '%' || q.t || '%' and d.lat is not null and d.lng is not null
  ) x
  order by dau desc, ngoai, phu, dai, ten
  limit 10;
$$;
comment on function public.tim_moc(text) is
  'Bản đồ web: tìm địa danh theo tên (tiện ích OSM 5 loại + dự án + đường / hẻm kèm phường hoặc tỉnh) — chỉ tên, loại, toạ độ; tối đa 10 dòng (SRS-5.1zzzzzzz217/221/224).';
revoke all on function public.tim_moc(text) from public, anon, authenticated;
grant execute on function public.tim_moc(text) to anon;
grant execute on function public.tim_moc(text) to authenticated;
grant execute on function public.tim_moc(text) to service_role;

with khop as (
  select l.id, (select array[dd.lat, dd.lng] from public.duong dd
                 where dd.loai = 'duong' and lower(dd.ten) = lower(btrim(l.street)) and dd.phuong = l.ward and dd.lat is not null
                 limit 1) as d
    from public.listings l
   where l.toa_do_muc in ('phuong', 'quan') and coalesce(btrim(l.street), '') <> '' and l.ward is not null)
update public.listings l
   set lat = k.d[1], lng = k.d[2], toa_do_muc = 'duong', tien_ich_at = null
  from khop k
 where k.id = l.id and k.d is not null;
