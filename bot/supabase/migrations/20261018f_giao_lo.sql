-- 20261018f (SRS-5.1zzzzzzz40): bảng GIAO LỘ thật từ OpenStreetMap. Chủ dự án 18/10: "Bảng giao lộ đường – phường có thì quá tốt
-- làm đi, bot sẽ biết bds gần ngã tư bao nhiêu mét các kiểu, ở đường này gần đường kia".
--
-- Vì sao không dùng `phuong_giao_hai_duong` / `duong_gan_duong` (20260930a): hai hàm đó so TÂM của từng tên đường trong một phường
-- (`duong.lat/lng` = trung bình tâm các đoạn) — một con đường dài 2 km thì tâm có thể cách ngã tư cả cây số. Giao lộ thật là NÚT
-- OSM mà hai đường khác tên cùng đi qua; `scripts/nap-giao-lo.mjs` tải đường + nút theo từng phường, gom các nút cùng một cặp tên
-- nằm sát nhau (đại lộ hai chiều, vòng xoay) thành một ngã tư, ghi toạ độ + phường.
create table if not exists public.giao_lo (
  id          bigint generated always as identity primary key,
  duong_a     text not null,
  duong_b     text not null,
  a_khong_dau text generated always as (public.bo_dau(duong_a)) stored,
  b_khong_dau text generated always as (public.bo_dau(duong_b)) stored,
  loai_a      text not null check (loai_a in ('duong', 'so', 'hem')),
  loai_b      text not null check (loai_b in ('duong', 'so', 'hem')),
  lat         double precision not null,
  lng         double precision not null,
  phuong      text not null,
  quan_cu     text,
  tinh        text not null default 'TP.HCM',
  osm_node    bigint not null,
  so_nut      integer not null default 1,
  nguon       text not null,
  created_at  timestamptz not null default now(),
  -- Một nút có ba đường đi qua sinh ba cặp cùng osm_node → khoá gồm cả cặp tên. Không CHECK duong_a < duong_b: thứ tự chữ của
  -- collation DB khác thứ tự JS sắp (script là chủ quy ước), một ràng buộc lệch là cả mẻ ghi bị từ chối.
  constraint giao_lo_nut_cap_key unique (osm_node, duong_a, duong_b)
);
create index if not exists giao_lo_a_idx on public.giao_lo (a_khong_dau);
create index if not exists giao_lo_b_idx on public.giao_lo (b_khong_dau);
create index if not exists giao_lo_lat_lng_idx on public.giao_lo (lat, lng);

comment on table public.giao_lo is '[RỔ HÀNG] Giao lộ thật (nút OSM hai đường khác tên cùng đi qua) theo phường mới — "ngã tư Lê Văn Sỹ – Trần Huy Liệu", "đầu hẻm 137 Lê Văn Sỹ". Tra: giao_lo_cua(đường 1, đường 2), giao_lo_gan(lat, lng). Chỉ service_role. Nạp lại: node scripts/nap-giao-lo.mjs (20261018f).';
comment on column public.giao_lo.duong_a is 'Tên đường thứ nhất (script sắp theo thứ tự chữ) — cùng cách viết với bảng duong.';
comment on column public.giao_lo.duong_b is 'Tên đường thứ hai.';
comment on column public.giao_lo.a_khong_dau is 'bo_dau(duong_a) — khoá tra.';
comment on column public.giao_lo.b_khong_dau is 'bo_dau(duong_b) — khoá tra.';
comment on column public.giao_lo.loai_a is 'Loại đường thứ nhất: duong | so (đường số) | hem.';
comment on column public.giao_lo.loai_b is 'Loại đường thứ hai.';
comment on column public.giao_lo.lat is 'Vĩ độ ngã tư (tâm các nút gom lại).';
comment on column public.giao_lo.lng is 'Kinh độ ngã tư.';
comment on column public.giao_lo.phuong is 'Phường/xã MỚI (wards.ten_day_du) có đa giác chứa ngã tư.';
comment on column public.giao_lo.quan_cu is 'Quận/huyện CŨ của phường (wards.quan_cu).';
comment on column public.giao_lo.tinh is 'Tỉnh MỚI (sau 01/07/2025).';
comment on column public.giao_lo.osm_node is 'Nút OSM đại diện (id nhỏ nhất trong cụm); (osm_node, duong_a, duong_b) là khoá upsert — ngã tư trên ranh hai phường chỉ một dòng.';
comment on column public.giao_lo.so_nut is 'Số nút OSM gom vào ngã tư này (đại lộ hai chiều / vòng xoay > 1).';
comment on column public.giao_lo.nguon is 'Nguồn: "OSM Overpass <ngày>" + cách lấy.';

alter table public.giao_lo enable row level security;
revoke all on table public.giao_lo from public, anon, authenticated;
grant all on table public.giao_lo to service_role;

-- Giao lộ của HAI đường (thứ tự bất kỳ, không dấu, bỏ tiền tố "đường"). Trả ≤ 5 ngã tư, gần p_lat/p_lng trước nếu có.
create or replace function public.giao_lo_cua(p_duong1 text, p_duong2 text, p_lat double precision default null,
                                              p_lng double precision default null)
returns table(duong_a text, duong_b text, phuong text, quan_cu text, lat double precision, lng double precision, cach_m double precision)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with k as (
    select regexp_replace(public.bo_dau(btrim(regexp_replace(coalesce(p_duong1, ''), '\s+', ' ', 'g'))), '^duong ', '') as k1,
           regexp_replace(public.bo_dau(btrim(regexp_replace(coalesce(p_duong2, ''), '\s+', ' ', 'g'))), '^duong ', '') as k2
  )
  select g.duong_a, g.duong_b, g.phuong, g.quan_cu, g.lat, g.lng,
         case when p_lat is not null and p_lng is not null then public.khoang_cach_m(p_lat, p_lng, g.lat, g.lng) end
    from public.giao_lo g, k
   where length(k.k1) >= 2 and length(k.k2) >= 2
     and ((g.a_khong_dau = k.k1 and g.b_khong_dau = k.k2) or (g.a_khong_dau = k.k2 and g.b_khong_dau = k.k1))
   order by 7 nulls last, g.phuong
   limit 5;
$function$;

-- Ngã tư gần một điểm (vd toạ độ tin rao): ≤ p_limit ngã tư trong p_ban_kinh_m, gần trước. Lọc hộp bao trước để dùng chỉ mục.
create or replace function public.giao_lo_gan(p_lat double precision, p_lng double precision,
                                              p_ban_kinh_m double precision default 300, p_limit integer default 5,
                                              p_bo_hem boolean default true)
returns table(duong_a text, duong_b text, loai_a text, loai_b text, phuong text, cach_m double precision)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with r as (select greatest(20, least(coalesce(p_ban_kinh_m, 300), 3000)) as m)
  select g.duong_a, g.duong_b, g.loai_a, g.loai_b, g.phuong, public.khoang_cach_m(p_lat, p_lng, g.lat, g.lng) as cach_m
    from public.giao_lo g, r
   where p_lat is not null and p_lng is not null
     and g.lat between p_lat - r.m / 111000.0 and p_lat + r.m / 111000.0
     and g.lng between p_lng - r.m / 109000.0 and p_lng + r.m / 109000.0
     and (not coalesce(p_bo_hem, true) or (g.loai_a <> 'hem' and g.loai_b <> 'hem'))
     and public.khoang_cach_m(p_lat, p_lng, g.lat, g.lng) <= r.m
   order by cach_m
   limit greatest(1, least(coalesce(p_limit, 5), 20));
$function$;

revoke all on function public.giao_lo_cua(text, text, double precision, double precision) from public, anon, authenticated;
grant execute on function public.giao_lo_cua(text, text, double precision, double precision) to service_role;
revoke all on function public.giao_lo_gan(double precision, double precision, double precision, integer, boolean) from public, anon, authenticated;
grant execute on function public.giao_lo_gan(double precision, double precision, double precision, integer, boolean) to service_role;

comment on function public.giao_lo_cua(text, text, double precision, double precision) is
  '[RỔ HÀNG] Ngã tư của hai đường (không dấu, thứ tự bất kỳ) → phường, quận cũ, toạ độ; có p_lat/p_lng thì gần trước (20261018f).';
comment on function public.giao_lo_gan(double precision, double precision, double precision, integer, boolean) is
  '[RỔ HÀNG] Các ngã tư quanh một điểm trong bán kính (mặc định 300 m, bỏ hẻm), gần trước — "cách ngã tư A – B 120 m" (20261018f).';
