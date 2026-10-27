-- 20261027f_tim_moc_duong — Ô "Quanh địa danh" tìm được cả TÊN ĐƯỜNG / HẺM (SRS-5.1zzzzzzz221, chủ dự án 27/10/2026: "cho cái này tìm được tên
-- đường đi"). Bảng `duong` (từ điển đường OSM theo phường mới, ~39 nghìn dòng, 100% có toạ độ cấp đường — SRS-5.1zzzzzzz186) gộp vào cùng
-- `tien_ich` + `projects` của 20261027d. Mỗi dòng đường là MỘT điểm theo phường nên tên kèm phường để phân biệt ("Minh Phụng, Phường Bình Tây").
-- Xếp: khớp từ đầu trước, đường trước hẻm, tên ngắn trước; tối đa 10 dòng. Chỉ tên + loại + toạ độ (dữ liệu công cộng OSM). Mở cho anon như cũ.
create or replace function public.tim_moc(p_tim text)
returns table(ten text, loai text, lat double precision, lng double precision)
language sql
stable
security definer
set search_path to 'public'
as $$
  with q as (select public.bo_dau(btrim(coalesce(p_tim, ''))) as t)
  select ten, loai, lat, lng from (
    select ti.ten, ti.loai, ti.lat, ti.lng, (ti.ten_kd ilike q.t || '%') as dau, 0 as phu, length(ti.ten) as dai
      from public.tien_ich ti, q
     where length(q.t) >= 3 and ti.ten_kd ilike '%' || q.t || '%' and ti.lat is not null and ti.lng is not null
    union all
    select p.name, 'du_an', p.lat, p.lng, (public.bo_dau(p.name) ilike q.t || '%'), 0, length(p.name)
      from public.projects p, q
     where length(q.t) >= 3 and public.bo_dau(p.name) ilike '%' || q.t || '%' and p.lat is not null and p.lng is not null
    union all
    select d.ten || coalesce(', ' || nullif(d.phuong, ''), ''), case when d.loai = 'hem' then 'hem' else 'duong' end, d.lat, d.lng,
           (d.ten_khong_dau ilike q.t || '%' or d.ten_khong_dau ilike 'duong ' || q.t || '%'), (d.loai = 'hem')::int, length(d.ten)
      from public.duong d, q
     where length(q.t) >= 3 and d.ten_khong_dau ilike '%' || q.t || '%' and d.lat is not null and d.lng is not null
  ) x
  order by dau desc, phu, dai, ten
  limit 10;
$$;
comment on function public.tim_moc(text) is
  'Bản đồ web: tìm địa danh theo tên (tiện ích OSM 5 loại + dự án + đường / hẻm) — chỉ tên, loại, toạ độ; tối đa 10 dòng (SRS-5.1zzzzzzz217/221).';
revoke all on function public.tim_moc(text) from public, anon, authenticated;
grant execute on function public.tim_moc(text) to anon;
grant execute on function public.tim_moc(text) to authenticated;
grant execute on function public.tim_moc(text) to service_role;
