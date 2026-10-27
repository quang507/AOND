-- 20261027d_tim_moc — Tìm địa danh cho bản đồ web (SRS-5.1zzzzzzz217, chủ dự án 27/10/2026: "làm cho cái bản đồ nó nhảy như vầy nè",
-- tham khảo hifriendz.com/tim-kiem?landmark=…: chọn một trường / bệnh viện / chợ thì bản đồ bay tới đó và cắm ghim có tên).
-- `tien_ich` (OSM, 5 loại) chỉ admin đọc được; hàm này chỉ trả TÊN + LOẠI + TOẠ ĐỘ (dữ liệu công cộng OSM, không có gì riêng tư) và
-- gộp thêm dự án trong kho (`projects` có toạ độ). Tối đa 8 dòng, tên ngắn xếp trước (khớp sát hơn). Mở cho anon như `ban_do_khung`.
create or replace function public.tim_moc(p_tim text)
returns table(ten text, loai text, lat double precision, lng double precision)
language sql
stable
security definer
set search_path to 'public'
as $$
  with q as (select public.bo_dau(btrim(coalesce(p_tim, ''))) as t)
  select ten, loai, lat, lng from (
    select ti.ten, ti.loai, ti.lat, ti.lng, length(ti.ten) as dai
      from public.tien_ich ti, q
     where length(q.t) >= 3 and ti.ten_kd ilike '%' || q.t || '%' and ti.lat is not null and ti.lng is not null
    union all
    select p.name, 'du_an', p.lat, p.lng, length(p.name)
      from public.projects p, q
     where length(q.t) >= 3 and public.bo_dau(p.name) ilike '%' || q.t || '%' and p.lat is not null and p.lng is not null
  ) x
  order by dai, ten
  limit 8;
$$;
comment on function public.tim_moc(text) is
  'Bản đồ web: tìm địa danh theo tên (tiện ích OSM 5 loại + dự án) — chỉ tên, loại, toạ độ; tối đa 8 dòng (SRS-5.1zzzzzzz217).';
revoke all on function public.tim_moc(text) from public, anon, authenticated;
grant execute on function public.tim_moc(text) to anon;
grant execute on function public.tim_moc(text) to authenticated;
grant execute on function public.tim_moc(text) to service_role;
