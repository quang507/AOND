-- SRS-5.1zzzzzzz412 (11/11/2026, chủ dự án: "còn dự án nào gần trùng ko, làm chuẩn luôn, gộp hết đi").
-- Kho `projects` (2.924 dòng, nạp từ nhiều nguồn) có cùng một dự án hai–ba dòng: "HaDo / Hà Đô", "Saigon / Sài Gòn", "Citi Soho / Citisoho",
-- "Cao ốc BMC / Chung cư BMC", "Sakura Valey / Valley"… → bot hỏi khách "anh đang hỏi dự án nào" giữa hai tên của CÙNG một dự án.
--
-- Luật gộp (bảo thủ — không gộp giai đoạn 1/2/3, không gộp khác quận, không gộp chung cư với khu dân cư cùng tên):
--  A. Cùng KHOÁ TÊN (bỏ dấu, chữ thường, bỏ ngoặc, bỏ tiền tố loại, bỏ ký tự không phải chữ/số) + cùng QUẬN đã chuẩn hoá
--     ("Quận 2 (TP. Thủ Đức)" = "Quận 2" = "Quận 2 - TP. Thủ Đức"; "Bình Thạnh" = "Quận Bình Thạnh") + tiền tố cùng NHÓM
--     (căn hộ: chung cư / căn hộ / khu căn hộ / cao ốc / toà nhà; khu dân cư: khu dân cư / KDC / khu đô thị / KĐT / khu nhà ở; không tiền tố hợp cả hai).
--  B. Cặp gần trùng soát tay (khoảng cách vector nhúng < 0,036 cùng quận, đã loại các cặp giai đoạn).
-- Dòng GIỮ: nhiều tin nhất → nhiều kiến thức nhất → dữ liệu dày nhất (thong_tin + amenities + unit_types + description). Ô trống của dòng giữ
-- lấy từ dòng bỏ; tin / kiến thức trỏ sang dòng giữ; dòng bỏ xoá (nhung_viec_du_an tự xoá theo FK cascade).

create temp table _du_an on commit drop as
select p.id, p.name,
       regexp_replace(regexp_replace(regexp_replace(public.bo_dau(lower(p.name)), '\(.*?\)', '', 'g'),
         '^(chung cu|can ho|khu can ho|khu dan cu|kdc|kdt|du an|khu do thi|cao oc|toa nha|khu nha o)\s+', ''), '[^a-z0-9]', '', 'g') as khoa,
       regexp_replace(regexp_replace(regexp_replace(public.bo_dau(lower(coalesce(p.district, ''))), '\(.*?\)|\s-\s.*$', '', 'g'),
         '^(quan|huyen|thanh pho|tp\.?|thi xa|tx)\s+', ''), '[^a-z0-9]', '', 'g') as quan,
       case when public.bo_dau(lower(p.name)) ~ '^(chung cu|can ho|khu can ho|cao oc|toa nha)\s' then 'can_ho'
            when public.bo_dau(lower(p.name)) ~ '^(khu dan cu|kdc|kdt|khu do thi|khu nha o)\s' then 'khu_dan_cu' end as nhom,
       (select count(*) from public.listings l where l.project_id = p.id) as so_tin,
       (select count(*) from public.du_an_kien_thuc k where k.project_id = p.id) as so_kt,
       length(coalesce(p.thong_tin::text, '')) + length(coalesce(p.amenities::text, '')) + length(coalesce(p.unit_types::text, ''))
         + length(coalesce(p.description, '')) as do_day
  from public.projects p;

-- Nhóm A: cùng khoá + cùng quận, tiền tố không lẫn hai nhóm.
create temp table _nhom on commit drop as
select khoa || '|' || quan as ma, id
  from _du_an d
 where quan <> '' and khoa <> ''
   and (khoa, quan) in (select khoa, quan from _du_an where quan <> '' and khoa <> '' group by 1, 2
                        having count(*) > 1 and count(distinct nhom) <= 1);

-- Nhóm B: cặp soát tay (tên → cùng mã nhóm).
insert into _nhom (ma, id)
select 'tay|' || c.ma, d.id
  from (values
    ('kieu', 'Kiều', '5'), ('kieu', 'Kiều by KITA', '5'),
    ('centa', 'Centa Park Tân Bình', 'tanbinh'), ('centa', 'Căn hộ Centa Park', 'tanbinh'),
    ('greenhills', 'Green Hills Bình Tân', 'binhtan'), ('greenhills', 'Green Hills Apartment', 'binhtan'),
    ('oriental', 'Oriental Plaza Âu Cơ', 'tanphu'), ('oriental', 'Oriental Plaza', 'tanphu'),
    ('sakura', 'Sakura Valey', 'trangbom'), ('sakura', 'Sakura Valley', 'trangbom'),
    ('4s', '4S Riverside Bình Triệu', 'thuduc'), ('4s', '4S Riverside Garden Bình Triệu', 'thuduc'),
    ('greenview7', 'Khu Căn Hộ Cao Cấp Green View', '7'), ('greenview7', 'Green View', '7'),
    ('sarica', 'Sarica Condominium', '2'), ('sarica', 'Sarica', '2'),
    ('gc1', 'Garden Court I', '7'), ('gc1', 'Căn Hộ Garden Court 1', '7'),
    ('gc2', 'Căn Hộ Garden Court 2', '7'), ('gc2', 'Garden Court II', '7'),
    ('conic', 'Conic - Đông Nam Á', 'binhchanh'), ('conic', 'Conic Đông Nam Á', 'binhchanh'), ('conic', 'Chung Cư CONIC &#8211; Đông Nam Á', 'binhchanh'),
    ('chateau', 'Chateau', '7'), ('chateau', 'Khu Biệt Thự Chateau', '7'),
    ('valora', 'Valora Mizuki', 'binhchanh'), ('valora', 'Nhà phố Valora (Valora Mizuki)', 'binhchanh'),
    ('greentown', 'Green Town', 'binhtan'), ('greentown', 'Green Town Bình Tân', 'binhtan'),
    ('hagl1', 'Khu Căn Hộ Hoàng Anh 1', '7'), ('hagl1', 'Hoàng Anh Gia Lai 1', '7'),
    ('monrei', 'MONREI SÀI GÒN', null), ('monrei', 'Monrei SaiGon', null)
  ) as c(ma, ten, quan)
  join _du_an d on d.name = c.ten and (c.quan is null or d.quan = c.quan)
 where d.id not in (select id from _nhom);
-- Dòng đã ở nhóm A mà cũng nằm trong cặp tay (vd "Conic Đông Nam Á"): kéo cả nhóm A của nó về nhóm tay.
update _nhom n set ma = t.ma
  from (select distinct a.ma as ma_a, 'tay|' || c.ma as ma
          from _nhom a join _du_an d on d.id = a.id
          join (values ('conic', 'Conic Đông Nam Á'), ('conic', 'Conic - Đông Nam Á')) as c(ma, ten) on c.ten = d.name
         where a.ma not like 'tay|%') t
 where n.ma = t.ma_a;

-- Dòng giữ của mỗi nhóm.
create temp table _gop on commit drop as
select n.id as bo, first_value(n.id) over w as giu, n.ma
  from _nhom n join _du_an d on d.id = n.id
window w as (partition by n.ma order by d.so_tin desc, d.so_kt desc, d.do_day desc, d.id);
-- Tên hiển thị của nhóm: không viết HOA toàn bộ, không mã HTML, không lỗi chính tả đã biết ("Valey"); còn lại giữ tên của dòng giữ.
create temp table _ten on commit drop as
select distinct on (g.giu) g.giu, d.name
  from _gop g join _du_an d on d.id = g.bo
 order by g.giu, (d.name = upper(d.name)) asc, (d.name ~ '&#') asc, (d.name ~* 'valey') asc, (d.id = g.giu) desc;
delete from _gop where bo = giu;

-- Ô trống của dòng giữ lấy từ dòng bỏ (dòng bỏ dày nhất trước).
update public.projects g set
  developer     = coalesce(nullif(g.developer, ''), b.developer),
  district      = coalesce(nullif(g.district, ''), b.district),
  ward          = coalesce(nullif(g.ward, ''), b.ward),
  location_raw  = coalesce(nullif(g.location_raw, ''), b.location_raw),
  lat           = coalesce(g.lat, b.lat),
  lng           = coalesce(g.lng, b.lng),
  legal_status  = coalesce(nullif(g.legal_status, ''), b.legal_status),
  handover_date = coalesce(g.handover_date, b.handover_date),
  handover      = coalesce(nullif(g.handover, ''), b.handover),
  province      = coalesce(nullif(g.province, ''), b.province),
  price_min     = coalesce(g.price_min, b.price_min),
  price_max     = coalesce(g.price_max, b.price_max),
  images        = case when coalesce(jsonb_array_length(case when jsonb_typeof(g.images) = 'array' then g.images end), 0) = 0 then b.images else g.images end,
  description   = coalesce(nullif(g.description, ''), b.description),
  updated_at    = now()
  from (select distinct on (x.giu) x.giu, p.*
          from _gop x join public.projects p on p.id = x.bo join _du_an d on d.id = x.bo
         order by x.giu, d.do_day desc) b
 where g.id = b.giu;

update public.listings l set project_id = x.giu from _gop x where l.project_id = x.bo;
update public.du_an_kien_thuc k set project_id = x.giu from _gop x where k.project_id = x.bo;
delete from public.projects p using _gop x where p.id = x.bo;
update public.projects p set name = t.name, updated_at = now() from _ten t where p.id = t.giu and p.name <> t.name;

-- Tên dự án còn mã HTML ("&#8211;" → "–", "&amp;" → "&").
update public.projects
   set name = replace(replace(replace(replace(name, '&#8211;', '–'), '&#8217;', '’'), '&amp;', '&'), '&#038;', '&'), updated_at = now()
 where name ~ '&(#[0-9]+|amp);';

-- Vòng 2 (cùng ngày): hai cặp chỉ lộ ra SAU khi sửa mã HTML trong tên ("Ehome 5 &#8211; The Bridgeview" → "Ehome 5 – The Bridgeview").
-- Kết quả trên DB thật 11/11: 2.924 → 2.839 dự án. Còn cố ý để riêng: An Sương, Tam Bình (chung cư khác khu dân cư cùng tên).
create temp table _g on commit drop as
select b.id bo, g.id giu from public.projects g join public.projects b on b.id <> g.id
 where (g.name, b.name) in (('E-home 5 The Bridgeview', 'Ehome 5 – The Bridgeview'), ('Hưng Phúc – Happy Residence', 'Hưng Phúc - Happy Residence'));
update public.projects g set developer = coalesce(nullif(g.developer, ''), b.developer), ward = coalesce(nullif(g.ward, ''), b.ward),
  location_raw = coalesce(nullif(g.location_raw, ''), b.location_raw), lat = coalesce(g.lat, b.lat), lng = coalesce(g.lng, b.lng),
  legal_status = coalesce(nullif(g.legal_status, ''), b.legal_status), description = coalesce(nullif(g.description, ''), b.description), updated_at = now()
  from _g x join public.projects b on b.id = x.bo where g.id = x.giu;
update public.listings l set project_id = x.giu from _g x where l.project_id = x.bo;
update public.du_an_kien_thuc k set project_id = x.giu from _g x where k.project_id = x.bo;
delete from public.projects p using _g x where p.id = x.bo;
