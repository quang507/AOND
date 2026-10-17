-- 20260911g — TOẠ ĐỘ TIN + TIỆN ÍCH QUANH NHÀ (11/09/2026)
--
-- Người dùng 11/09: "Từ địa chỉ khách gửi gắn vào geocode để xem lưu vào, sau
-- nếu có khách hỏi tôi muốn tìm nhà gần bệnh viện cách 1 km thì có thể tìm
-- kiếm ra được".
--
-- Đo trước khi sửa (11/09): 0/37 tin có lat/lng. geocode-listings có từ 25/08
-- nhưng KHÔNG có cron ("gọi tay khi có tin mới" — không ai gọi), và mọi câu tra
-- của nó dán đuôi "<quận>, Thành phố Hồ Chí Minh": từ 07/2025 OSM bỏ ranh giới
-- quận ở TP.HCM, nên Nominatim trả rỗng. "Ho Ngoc Lam, Ho Chi Minh City" thì ra
-- 10.7229, 106.6107 ngay.
--
-- Bản này:
--   1. listings: toa_do_muc (duong | phuong | du_an | tay), geocode_at (lần thử
--      cuối), tien_ich_gan (gần nhất mỗi loại), tien_ich_at.
--   2. tien_ich: điểm OSM (bệnh viện, trường, chợ, siêu thị, công viên) trong
--      3 km quanh các tin đã định vị. Nạp theo từng tin, không nạp cả thành phố.
--   3. khoang_cach_m, kd_ten, moc_khop, co_moc, tin_gan_moc: "tin nào trong X m
--      quanh một MỐC" — mốc là tiện ích OSM, dự án có toạ độ, hoặc địa danh
--      chat-reply vừa tra được. Người dùng 11/09: bot phải "hiểu nghĩa", không
--      chỉ câu "gần bệnh viện" — ý khách do model đọc (_shared/ai/boc-gan.ts),
--      còn mốc và khoảng cách thì SQL tính ở đây.
--   4. Địa chỉ đổi → xoá toạ độ cũ để tick tra lại (trigger zz_toa_do).
--   5. tin_can_geocode + geocode_tick + cron 10 phút: chỉ gọi function khi CÓ
--      tin cần làm, nên tick rảnh chỉ tốn một câu EXISTS.
--   6. projects.geocode_at + du_an_can_geocode: 1639 dự án, 0 có toạ độ — làm
--      dần sau tin rao, dự án có tin trong kho đi trước.
--
-- Toạ độ chỉ tới MỨC ĐƯỜNG: geocode-listings bỏ số nhà trước khi tra. /ban-do
-- công khai đã hứa "chấm theo đường/hẻm, chưa tới số nhà" — giữ đúng lời đó.
-- Tin chỉ có toạ độ mức PHƯỜNG (tâm phường) KHÔNG được dùng để đo "cách 1 km":
-- sai số cỡ cả km, trả lời "gần bệnh viện" theo nó là nói bừa.

-- ── 1. Cột ──────────────────────────────────────────────────────────────────
alter table public.listings
  add column if not exists toa_do_muc   text,
  add column if not exists geocode_at   timestamptz,
  add column if not exists tien_ich_gan jsonb,
  add column if not exists tien_ich_at  timestamptz;

alter table public.listings drop constraint if exists listings_toa_do_muc_check;
alter table public.listings add constraint listings_toa_do_muc_check
  check (toa_do_muc is null or toa_do_muc in ('duong', 'phuong', 'du_an', 'tay'));

comment on column public.listings.toa_do_muc is
  'Toạ độ chính xác tới đâu: duong (tâm đoạn đường, không số nhà), phuong (tâm phường — không dùng đo khoảng cách), du_an (toạ độ dự án), tay (admin đặt).';
comment on column public.listings.tien_ich_gan is
  'Tiện ích gần nhất mỗi loại trong 3 km: [{loai, ten, m}] — m là đường chim bay.';

-- ── 2. Bảng tien_ich ────────────────────────────────────────────────────────
create table if not exists public.tien_ich (
  osm_id      text primary key,            -- 'node/123', 'way/456'
  -- dia_diem: địa danh chat-reply tra Nominatim theo lời khách (Landmark 81…), nhớ lại cho lần sau
  loai        text not null check (loai in ('benh_vien', 'truong_hoc', 'cho', 'sieu_thi', 'cong_vien', 'dia_diem')),
  ten         text not null,
  ten_kd      text not null,               -- bỏ dấu, thường, bỏ ký tự lạ (kdTen)
  lat         double precision not null,
  lng         double precision not null,
  cap_nhat_at timestamptz not null default now()
);
create index if not exists tien_ich_loai_lat_lng_idx on public.tien_ich (loai, lat, lng);

alter table public.tien_ich enable row level security;
revoke all on public.tien_ich from public, anon, authenticated;
grant select on public.tien_ich to authenticated;
grant all on public.tien_ich to service_role;
drop policy if exists tien_ich_admin_read on public.tien_ich;
create policy tien_ich_admin_read on public.tien_ich
  for select to authenticated
  using (public.la_admin());

-- ── 3. Khoảng cách + tìm tin gần tiện ích ───────────────────────────────────
-- Haversine, mét. Cùng công thức với `khoangCachM` (_shared/geocode.ts).
create or replace function public.khoang_cach_m(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) returns double precision
language sql immutable parallel safe
set search_path = public
as $$
  select 6371000 * 2 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2))))
$$;

-- Chuẩn tên để so — cùng luật `kdTen` (tien-ich.ts): bỏ dấu, thường, bỏ ký tự lạ.
create or replace function public.kd_ten(p text)
returns text
language sql immutable parallel safe
set search_path = public
as $$
  select btrim(regexp_replace(
    regexp_replace(lower(public.bo_dau(coalesce(p, ''))), '[^a-z0-9 ]+', '', 'g'),
    '\s+', ' ', 'g'))
$$;

-- Mốc khớp ý khách, từ hai nguồn trong kho mình:
--   · tien_ich (OSM + địa danh đã tra): theo LOẠI ("gần bệnh viện") và/hoặc
--     TÊN ("gần Coopmart", "gần bv Chợ Rẫy");
--   · projects đã có toạ độ, khớp TÊN ("gần Ehome 3", "gần Landmark 81").
-- Tên so trên kd_ten, khớp NGUYÊN CHỮ: "ehome 3" không dính "ehome 30".
-- p_loai du_an / dia_diem mà không có tên thì không có mốc nào.
create or replace function public.moc_khop(p_loai text, p_ten_re text default null)
returns table (ten text, lat double precision, lng double precision)
language sql stable
set search_path = public
as $$
  with a as (
    select coalesce(p_loai, 'dia_diem') as loai,
           case when coalesce(p_ten_re, '') = '' then null
                else '(^| )(' || p_ten_re || ')( |$)' end as re
  )
  select t.ten, t.lat, t.lng
  from tien_ich t, a
  where (a.loai not in ('benh_vien', 'truong_hoc', 'cho', 'sieu_thi', 'cong_vien') or t.loai = a.loai)
    and case when a.re is null then a.loai in ('benh_vien', 'truong_hoc', 'cho', 'sieu_thi', 'cong_vien')
             else t.ten_kd ~ a.re end
  union all
  select pr.name, pr.lat::double precision, pr.lng::double precision
  from projects pr, a
  where a.re is not null and a.loai in ('du_an', 'dia_diem')
    and pr.lat is not null and pr.lng is not null
    and public.kd_ten(pr.name) ~ a.re
$$;

-- Kho mình có mốc nào khớp không — tim-moc.ts hỏi trước khi tra Nominatim.
create or replace function public.co_moc(p_loai text, p_ten_re text default null)
returns boolean
language sql stable
set search_path = public
as $$
  select exists (select 1 from public.moc_khop(p_loai, p_ten_re))
$$;

-- Tin đang lên kệ trong p_ban_kinh_m quanh một mốc (moc_khop, cộng thêm một
-- điểm cho sẵn p_lat/p_lng — địa danh chat-reply vừa tra). Mỗi tin một dòng:
-- mốc GẦN NHẤT. Chỉ tin có toạ độ mức đường/dự án/tay — mức phường bị loại
-- (xem đầu file). Bán kính kẹp [100, 3000]: tien_ich chỉ nạp 3 km quanh tin.
create or replace function public.tin_gan_moc(
  p_loai       text,
  p_ten_re     text default null,
  p_lat        double precision default null,
  p_lng        double precision default null,
  p_ten        text default null,
  p_ban_kinh_m integer default 1000,
  p_deal       text default null
) returns table (listing_id uuid, code text, moc text, khoang_cach_m integer)
language sql stable
set search_path = public
as $$
  with r as (select least(3000, greatest(100, coalesce(p_ban_kinh_m, 1000)))::double precision as m),
  moc as (
    select mk.ten, mk.lat, mk.lng from public.moc_khop(p_loai, p_ten_re) mk
    union all
    select coalesce(nullif(btrim(p_ten), ''), 'địa điểm khách nói'), p_lat, p_lng
    where p_lat is not null and p_lng is not null
  ),
  l as (
    select li.id, li.code, li.lat::double precision as lat, li.lng::double precision as lng
    from listings li
    where li.lat is not null and li.lng is not null
      and li.toa_do_muc in ('duong', 'du_an', 'tay')
      and li.status in ('dang_ban', 'dang_quan_tam')
      and (p_deal is null or li.deal::text = p_deal)
  ),
  cap as (
    select l.id, l.code, moc.ten, public.khoang_cach_m(l.lat, l.lng, moc.lat, moc.lng) as d
    from l cross join r
    join moc
      on moc.lat between l.lat - r.m / 111320.0 and l.lat + r.m / 111320.0
     and moc.lng between l.lng - r.m / (111320.0 * cos(radians(l.lat)))
                     and l.lng + r.m / (111320.0 * cos(radians(l.lat)))
  )
  select distinct on (cap.id) cap.id, cap.code, cap.ten, round(cap.d)::integer
  from cap cross join r
  where cap.d <= r.m
  order by cap.id, cap.d
$$;

-- ── 4. Địa chỉ đổi → toạ độ cũ hết giá trị ─────────────────────────────────
-- Chủ nhà sửa "hẻm 12 Hồ Ngọc Lãm" thành "Nguyễn Trãi" mà toạ độ vẫn nằm ở Hồ
-- Ngọc Lãm thì "gần bệnh viện" trả sai căn. Xoá để tick tra lại. Cùng lệnh
-- UPDATE có đặt lat/lng mới (admin kéo ghim) thì giữ; toạ độ admin đặt tay
-- (toa_do_muc = 'tay') thì không động.
create or replace function public.listings_xoa_toa_do_khi_doi_dia_chi()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.location_raw is distinct from old.location_raw
      or new.street    is distinct from old.street
      or new.ward      is distinct from old.ward
      or new.district  is distinct from old.district
      or new.project_id is distinct from old.project_id)
     and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng
     and coalesce(old.toa_do_muc, '') <> 'tay' then
    new.lat          := null;
    new.lng          := null;
    new.toa_do_muc   := null;
    new.geocode_at   := null;
    new.tien_ich_gan := null;
    new.tien_ich_at  := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_listings_zz_toa_do on public.listings;
create trigger trg_listings_zz_toa_do
  before update of location_raw, street, ward, district, project_id on public.listings
  for each row execute function public.listings_xoa_toa_do_khi_doi_dia_chi();

-- ── 5. Việc cho geocode-listings + tick ─────────────────────────────────────
-- Tin cần làm: (a) chưa toạ độ mà có gì để tra, hoặc (b) có toạ độ mà chưa nạp
-- tiện ích. Lần thử hỏng thì 12 giờ sau mới thử lại — địa chỉ không tra được
-- đừng đốt Nominatim mỗi 10 phút.
create or replace function public.tin_can_geocode(p_limit integer default 40)
returns table (
  id uuid, location_raw text, street text, ward text, district text,
  quan_mac_dinh boolean, lat double precision, lng double precision, toa_do_muc text,
  du_an_lat double precision, du_an_lng double precision
)
language sql stable
set search_path = public
as $$
  select l.id, l.location_raw, l.street, l.ward, l.district,
         coalesce((l.boc_tach ->> 'quan_mac_dinh')::boolean, false),
         l.lat::double precision, l.lng::double precision, l.toa_do_muc,
         p.lat::double precision, p.lng::double precision
  from listings l
  left join projects p on p.id = l.project_id
  where (
          (l.lat is null and (coalesce(btrim(l.location_raw), '') <> ''
                              or coalesce(btrim(l.street), '') <> ''
                              or coalesce(btrim(l.ward), '') <> ''
                              or p.lat is not null))
          or (l.lat is not null and l.tien_ich_at is null)
        )
    and (l.geocode_at is null or l.geocode_at < now() - interval '12 hours')
  order by l.geocode_at nulls first, l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 200))
$$;

-- ── 6. Toạ độ dự án ─────────────────────────────────────────────────────────
-- 1639 dự án, 0 có toạ độ (11/09). Khách nói "gần Ehome 3", "gần Landmark 81"
-- thì mốc là dự án — phải có toạ độ. geocode-listings làm dần SAU tin rao:
-- dự án có tin trong kho đi trước, dự án nhà mình phân phối kế đó. Tra hỏng
-- thì 7 ngày sau mới thử lại.
alter table public.projects add column if not exists geocode_at timestamptz;

create or replace function public.du_an_can_geocode(p_limit integer default 30)
returns table (id uuid, name text, location_raw text, ward text, district text)
language sql stable
set search_path = public
as $$
  select p.id, p.name, p.location_raw, p.ward, p.district
  from projects p
  where p.lat is null
    and (p.geocode_at is null or p.geocode_at < now() - interval '7 days')
  order by exists (select 1 from listings l where l.project_id = p.id) desc,
           p.is_partner desc nulls last,
           p.geocode_at nulls first
  limit greatest(1, least(coalesce(p_limit, 30), 200))
$$;

create or replace function public.geocode_tick()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.tin_can_geocode(1))
     and not exists (select 1 from public.du_an_can_geocode(1)) then
    return;
  end if;
  perform net.http_post(
    url := public.cau_hinh('functions_base_url') || '/geocode-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_zmJBmEgFPn3bBKx_1ve6Pg_dXdo4haX',
      'x-bridge-secret', public.get_secret('BRIDGE_SECRET')),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
end $$;

revoke execute on function public.khoang_cach_m(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.khoang_cach_m(double precision, double precision, double precision, double precision) to authenticated, service_role;
revoke execute on function public.kd_ten(text) from public, anon;
grant execute on function public.kd_ten(text) to authenticated, service_role;
revoke execute on function public.moc_khop(text, text) from public, anon, authenticated;
grant execute on function public.moc_khop(text, text) to service_role;
revoke execute on function public.co_moc(text, text) from public, anon, authenticated;
grant execute on function public.co_moc(text, text) to service_role;
revoke execute on function public.tin_gan_moc(text, text, double precision, double precision, text, integer, text) from public, anon, authenticated;
grant execute on function public.tin_gan_moc(text, text, double precision, double precision, text, integer, text) to service_role;
revoke execute on function public.du_an_can_geocode(integer) from public, anon, authenticated;
grant execute on function public.du_an_can_geocode(integer) to service_role;
revoke execute on function public.tin_can_geocode(integer) from public, anon, authenticated;
grant execute on function public.tin_can_geocode(integer) to service_role;
revoke execute on function public.geocode_tick() from public, anon, authenticated;
revoke execute on function public.listings_xoa_toa_do_khi_doi_dia_chi() from public, anon, authenticated;

-- Mỗi 10 phút, cả ngày: tin rao vào lúc nào cũng có. Tick rảnh = một EXISTS.
select cron.schedule('geocode-tick', '*/10 * * * *', 'select public.geocode_tick()');
