-- 20260930a — ĐỊA DANH: phường mới + cũ, quận cũ, đường / đường số / hẻm có TOẠ ĐỘ, tìm theo NGHĨA + VỊ TRÍ.
--
-- Chủ dự án 30/09/2026 (chat thử trên máy): "nhà chú ở 137/28 đường số 59 phường an hội tây nhé" — bot không nhận
-- phường, rồi ghi "Phường An Hội" (model cắt mất "Tây"). Hai yêu cầu nối nhau cùng ngày:
--   (1) "tra phường, quận, tên đường ở trong db, có thể vector hoá để bot có thể tìm semantic bảng wards, các data được
--       vector hoá hết để sau còn tìm kiếm cho đúng";
--   (2) "còn mấy hẻm khác còn nhiều / nhỏ và nhỏ hơn nữa … vector đường lớn phường quận mới và cũ và dự án đi, sau khi
--       người ta nhắc tới gần đúng sẽ biết cái nào đúng và sửa vào, kết hợp với vị trí nữa, để biết đường nào gần đường nào".
--
-- Làm gì:
--   · `duong` thêm loai (duong | so | hem), so_hem, duong_me, lat, lng — `scripts/nap-duong.mjs` nay giữ đường số và hẻm
--     (trước bỏ) và lấy toạ độ tâm từ OSM (`out center`). NẠP LẠI bằng script sau khi áp migration này.
--   · Bảng mới `phuong_cu` (487 phường / xã / thị trấn trước 07/2025 → phường mới, tách từ wards.don_vi_cu theo NQ 1685)
--     và `quan_cu` (quận / huyện / thành phố cũ), có toạ độ (tâm phường mới) và vector.
--   · Vector (Gemini gemini-embedding-001, 768 chiều) cho wards, phuong_cu, quan_cu, duong loại duong + so. Hẻm KHÔNG
--     nhúng: tên hẻm là số + đường mẹ ("Hẻm 137 Lê Văn Sỹ"), tra theo số + đường mẹ + toạ độ (`tim_hem`) chắc hơn vector,
--     và vài chục nghìn hẻm sẽ ngốn cả tuần hạn mức free. Dự án đã có vector từ 20260923h (projects.nhung).
--   · Cron riêng `nhung-dia-danh-tick` (KHÔNG sửa nhung_tick của tin rao): chỉ gửi khi hàng chờ tin rao + dự án trống,
--     chung công tắc `tim_theo_nghia` và mốc tạm dừng Gemini.
--   · Khoảng cách: `khoang_cach_m` (haversine, không cần PostGIS). RPC: tim_dia_danh_theo_nghia (nghĩa + gần một điểm),
--     dia_danh_gan (quanh một điểm), duong_gan_duong (đường nào gần đường nào), phuong_giao_hai_duong (phường nào có cả
--     hai đường gần nhau), tim_hem (hẻm theo số + đường mẹ). tim_duong bỏ hàng hẻm khỏi khớp tên.
--
-- Nguyên tắc cho bot: khớp CHỮ trước (chắc, miễn phí), vector sau (gõ sai / gõ lệch). Gần đúng MÀ vị trí khớp với điều
-- đã biết (cùng phường / quận cũ, hoặc gần con đường khách nhắc kèm) → sửa luôn; không có gì để đối chiếu → hỏi xác nhận.

-- ── Khoảng cách: dùng lại public.khoang_cach_m(p_lat1, p_lng1, p_lat2, p_lng2) đã có trên DB (haversine, mét).
-- KHÔNG định nghĩa lại: CREATE OR REPLACE không được đổi tên tham số, áp là lỗi (soat-migration bắt 30/09).

-- ── duong: loại, hẻm, toạ độ, vector ──────────────────────────────────────
alter table public.duong
  add column if not exists loai text not null default 'duong',
  add column if not exists so_hem text,
  add column if not exists duong_me text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists nhung extensions.vector(768),
  add column if not exists nhung_md5 text,
  add column if not exists nhung_luc timestamptz;
do $d$ begin
  alter table public.duong add constraint duong_loai_check check (loai in ('duong', 'so', 'hem'));
exception when duplicate_object then null; end $d$;
comment on column public.duong.loai is 'duong = tên riêng ("Lê Văn Sỹ"); so = đường số / mã ("Đường số 59", "Đường N1"); hem = hẻm / ngõ ("Hẻm 137 Lê Văn Sỹ").';
comment on column public.duong.so_hem is 'Hẻm: số hẻm ("137", "137/28" = hẻm nhánh 28 trong hẻm 137). Loại khác: NULL.';
comment on column public.duong.duong_me is 'Hẻm: tên đường mẹ ("Lê Văn Sỹ", "Đường số 59"), NULL khi OSM chỉ ghi "Hẻm 137".';
comment on column public.duong.lat is 'Vĩ độ tâm — trung bình tâm các đoạn OSM cùng tên trong phường (scripts/nap-duong.mjs, out center).';
comment on column public.duong.lng is 'Kinh độ tâm — như lat.';
comment on column public.duong.nhung is 'Vector nghĩa (768 chiều) của van_ban_dia_danh(''duong'', id). Chỉ loại duong + so; hẻm tra theo số + đường mẹ.';
comment on column public.duong.nhung_md5 is 'md5 văn bản đã nhúng — khác md5 hiện tại thì nhung-dia-danh-tick nhúng lại.';
comment on column public.duong.nhung_luc is 'Lúc ghi vector gần nhất.';
create index if not exists duong_nhung_hnsw on public.duong using hnsw (nhung extensions.vector_cosine_ops);
create index if not exists duong_lat_lng on public.duong (lat, lng);
create index if not exists duong_hem on public.duong (upper(so_hem), public.bo_dau(duong_me)) where loai = 'hem';

-- ── wards: vector ─────────────────────────────────────────────────────────
alter table public.wards
  add column if not exists nhung extensions.vector(768),
  add column if not exists nhung_md5 text,
  add column if not exists nhung_luc timestamptz;
comment on column public.wards.nhung is 'Vector nghĩa (768 chiều) của van_ban_dia_danh(''wards'', ten). Lưới đỡ khi khớp chữ tên phường không ra.';
comment on column public.wards.nhung_md5 is 'md5 văn bản đã nhúng — khác md5 hiện tại thì nhung-dia-danh-tick nhúng lại.';
comment on column public.wards.nhung_luc is 'Lúc ghi vector gần nhất.';
create index if not exists wards_nhung_hnsw on public.wards using hnsw (nhung extensions.vector_cosine_ops);

-- ── phuong_cu: phường / xã trước 07/2025 → phường mới ─────────────────────
create table if not exists public.phuong_cu (
  id bigint generated always as identity primary key,
  ten text not null,
  loai text not null check (loai in ('phuong', 'xa', 'thi_tran')),
  quan_cu text not null,
  phuong_moi text not null references public.wards(ten) on update cascade,
  toan_bo boolean not null,
  lat double precision,
  lng double precision,
  nhung extensions.vector(768),
  nhung_md5 text,
  nhung_luc timestamptz,
  unique (ten, quan_cu, phuong_moi)
);
comment on table public.phuong_cu is
  '[RỔ HÀNG] Phường / xã / thị trấn CŨ (trước 07/2025) → phường mới (NQ 1685, tách từ wards.don_vi_cu). Một phường cũ bị chia thì có nhiều dòng (toan_bo = false). Khách vẫn nói "phường 12 Gò Vấp", "phường Thảo Điền".';
comment on column public.phuong_cu.ten is 'Tên cũ có tiền tố: "Phường 12", "Phường Thảo Điền", "Xã Tân An Hội", "Thị trấn Củ Chi".';
comment on column public.phuong_cu.quan_cu is 'Quận / huyện / thành phố cũ chứa nó ("Quận Gò Vấp", "Thành phố Thủ Đức").';
comment on column public.phuong_cu.phuong_moi is 'wards.ten của phường mới nhận nó.';
comment on column public.phuong_cu.toan_bo is 'true = cả phường cũ vào phường mới này; false = chỉ một phần (phường cũ bị chia).';
comment on column public.phuong_cu.lat is 'Toạ độ xấp xỉ = tâm phường mới (wards.lat).';
comment on column public.phuong_cu.lng is 'Như lat.';
comment on column public.phuong_cu.nhung is 'Vector nghĩa (768 chiều) của van_ban_dia_danh(''phuong_cu'', id).';
comment on column public.phuong_cu.nhung_md5 is 'md5 văn bản đã nhúng.';
comment on column public.phuong_cu.nhung_luc is 'Lúc ghi vector gần nhất.';
alter table public.phuong_cu enable row level security;
revoke all on public.phuong_cu from anon, authenticated;
create index if not exists phuong_cu_nhung_hnsw on public.phuong_cu using hnsw (nhung extensions.vector_cosine_ops);

insert into public.phuong_cu (ten, loai, quan_cu, phuong_moi, toan_bo) values
-- Sinh bằng scripts/lib/don-vi-cu.mjs từ wards.don_vi_cu (20260915a), 487 dòng.
  ('Phường 5', 'phuong', 'Quận 5', 'An Đông', true),
  ('Phường 7', 'phuong', 'Quận 5', 'An Đông', true),
  ('Phường 9', 'phuong', 'Quận 5', 'An Đông', true),
  ('Phường 15', 'phuong', 'Quận Gò Vấp', 'An Hội Đông', true),
  ('Phường 16', 'phuong', 'Quận Gò Vấp', 'An Hội Đông', true),
  ('Phường 12', 'phuong', 'Quận Gò Vấp', 'An Hội Tây', true),
  ('Phường 14', 'phuong', 'Quận Gò Vấp', 'An Hội Tây', true),
  ('Phường Thủ Thiêm', 'phuong', 'Thành phố Thủ Đức', 'An Khánh', true),
  ('Phường An Lợi Đông', 'phuong', 'Thành phố Thủ Đức', 'An Khánh', true),
  ('Phường Thảo Điền', 'phuong', 'Thành phố Thủ Đức', 'An Khánh', true),
  ('Phường An Khánh', 'phuong', 'Thành phố Thủ Đức', 'An Khánh', true),
  ('Phường An Phú', 'phuong', 'Thành phố Thủ Đức', 'An Khánh', false),
  ('Phường Bình Trị Đông B', 'phuong', 'Quận Bình Tân', 'An Lạc', true),
  ('Phường An Lạc A', 'phuong', 'Quận Bình Tân', 'An Lạc', true),
  ('Phường An Lạc', 'phuong', 'Quận Bình Tân', 'An Lạc', true),
  ('Phường 5', 'phuong', 'Quận Gò Vấp', 'An Nhơn', true),
  ('Phường 6', 'phuong', 'Quận Gò Vấp', 'An Nhơn', true),
  ('Phường An Phú', 'phuong', 'Thành phố Thuận An', 'An Phú', true),
  ('Phường Bình Chuẩn', 'phuong', 'Thành phố Thuận An', 'An Phú', false),
  ('Phường Thạnh Lộc', 'phuong', 'Quận 12', 'An Phú Đông', true),
  ('Phường An Phú Đông', 'phuong', 'Quận 12', 'An Phú Đông', true),
  ('Phường Phước Trung', 'phuong', 'Thành phố Bà Rịa', 'Bà Rịa', true),
  ('Phường Phước Nguyên', 'phuong', 'Thành phố Bà Rịa', 'Bà Rịa', true),
  ('Phường Long Toàn', 'phuong', 'Thành phố Bà Rịa', 'Bà Rịa', true),
  ('Phường Phước Hưng', 'phuong', 'Thành phố Bà Rịa', 'Bà Rịa', true),
  ('Phường 1', 'phuong', 'Quận 3', 'Bàn Cờ', true),
  ('Phường 2', 'phuong', 'Quận 3', 'Bàn Cờ', true),
  ('Phường 3', 'phuong', 'Quận 3', 'Bàn Cờ', true),
  ('Phường 5', 'phuong', 'Quận 3', 'Bàn Cờ', true),
  ('Phường 4', 'phuong', 'Quận 3', 'Bàn Cờ', false),
  ('Phường 10', 'phuong', 'Quận Tân Bình', 'Bảy Hiền', true),
  ('Phường 11', 'phuong', 'Quận Tân Bình', 'Bảy Hiền', true),
  ('Phường 12', 'phuong', 'Quận Tân Bình', 'Bảy Hiền', true),
  ('Xã Tân Hưng', 'xa', 'Huyện Bàu Bàng', 'Bến Cát', true),
  ('Xã Lai Hưng', 'xa', 'Huyện Bàu Bàng', 'Bến Cát', true),
  ('Phường Mỹ Phước', 'phuong', 'Thành phố Bến Cát', 'Bến Cát', false),
  ('Phường Bến Thành', 'phuong', 'Quận 1', 'Bến Thành', true),
  ('Phường Phạm Ngũ Lão', 'phuong', 'Quận 1', 'Bến Thành', true),
  ('Phường Cầu Ông Lãnh', 'phuong', 'Quận 1', 'Bến Thành', false),
  ('Phường Nguyễn Thái Bình', 'phuong', 'Quận 1', 'Bến Thành', false),
  ('Phường Hội Nghĩa', 'phuong', 'Thành phố Tân Uyên', 'Bình Cơ', true),
  ('Xã Bình Mỹ', 'xa', 'Huyện Bắc Tân Uyên', 'Bình Cơ', true),
  ('Phường Phú Mỹ', 'phuong', 'Thành phố Thủ Dầu Một', 'Bình Dương', true),
  ('Phường Hòa Phú', 'phuong', 'Thành phố Thủ Dầu Một', 'Bình Dương', true),
  ('Phường Phú Tân', 'phuong', 'Thành phố Thủ Dầu Một', 'Bình Dương', true),
  ('Phường Phú Chánh', 'phuong', 'Thành phố Thủ Dầu Một', 'Bình Dương', true),
  ('Phường 6', 'phuong', 'Quận 8', 'Bình Đông', true),
  ('Phường 7', 'phuong', 'Quận 8', 'Bình Đông', false),
  ('Phường 5', 'phuong', 'Quận 8', 'Bình Đông', false),
  ('Xã An Phú Tây', 'xa', 'Huyện Bình Chánh', 'Bình Đông', false),
  ('Phường Bình Hòa', 'phuong', 'Thành phố Thuận An', 'Bình Hòa', true),
  ('Phường Vĩnh Phú', 'phuong', 'Thành phố Thuận An', 'Bình Hòa', false),
  ('Phường Bình Hưng Hòa', 'phuong', 'Quận Bình Tân', 'Bình Hưng Hòa', true),
  ('Phường Bình Hưng Hòa A', 'phuong', 'Quận Bình Tân', 'Bình Hưng Hòa', false),
  ('Phường Sơn Kỳ', 'phuong', 'Quận Tân Phú', 'Bình Hưng Hòa', false),
  ('Phường 5', 'phuong', 'Quận Bình Thạnh', 'Bình Lợi Trung', true),
  ('Phường 11', 'phuong', 'Quận Bình Thạnh', 'Bình Lợi Trung', true),
  ('Phường 13', 'phuong', 'Quận Bình Thạnh', 'Bình Lợi Trung', true),
  ('Phường 10', 'phuong', 'Quận 6', 'Bình Phú', true),
  ('Phường 11', 'phuong', 'Quận 6', 'Bình Phú', true),
  ('Phường 16', 'phuong', 'Quận 8', 'Bình Phú', false),
  ('Phường 27', 'phuong', 'Quận Bình Thạnh', 'Bình Quới', true),
  ('Phường 28', 'phuong', 'Quận Bình Thạnh', 'Bình Quới', true),
  ('Phường Bình Hưng Hòa B', 'phuong', 'Quận Bình Tân', 'Bình Tân', true),
  ('Phường Bình Trị Đông A', 'phuong', 'Quận Bình Tân', 'Bình Tân', false),
  ('Phường Tân Tạo', 'phuong', 'Quận Bình Tân', 'Bình Tân', false),
  ('Phường 2', 'phuong', 'Quận 6', 'Bình Tây', true),
  ('Phường 9', 'phuong', 'Quận 6', 'Bình Tây', true),
  ('Phường 12', 'phuong', 'Quận Bình Thạnh', 'Bình Thạnh', true),
  ('Phường 14', 'phuong', 'Quận Bình Thạnh', 'Bình Thạnh', true),
  ('Phường 26', 'phuong', 'Quận Bình Thạnh', 'Bình Thạnh', true),
  ('Phường 3', 'phuong', 'Quận 11', 'Bình Thới', true),
  ('Phường 10', 'phuong', 'Quận 11', 'Bình Thới', true),
  ('Phường 8', 'phuong', 'Quận 11', 'Bình Thới', false),
  ('Phường 1', 'phuong', 'Quận 6', 'Bình Tiên', true),
  ('Phường 7', 'phuong', 'Quận 6', 'Bình Tiên', true),
  ('Phường 8', 'phuong', 'Quận 6', 'Bình Tiên', true),
  ('Phường Bình Trị Đông', 'phuong', 'Quận Bình Tân', 'Bình Trị Đông', true),
  ('Phường Bình Hưng Hòa A', 'phuong', 'Quận Bình Tân', 'Bình Trị Đông', false),
  ('Phường Bình Trị Đông A', 'phuong', 'Quận Bình Tân', 'Bình Trị Đông', false),
  ('Phường Bình Trưng Đông', 'phuong', 'Thành phố Thủ Đức', 'Bình Trưng', true),
  ('Phường Bình Trưng Tây', 'phuong', 'Thành phố Thủ Đức', 'Bình Trưng', true),
  ('Phường An Phú', 'phuong', 'Thành phố Thủ Đức', 'Bình Trưng', false),
  ('Phường Thạnh Mỹ Lợi', 'phuong', 'Thành phố Thủ Đức', 'Cát Lái', true),
  ('Phường Cát Lái', 'phuong', 'Thành phố Thủ Đức', 'Cát Lái', true),
  ('Phường 1', 'phuong', 'Quận Phú Nhuận', 'Cầu Kiệu', true),
  ('Phường 2', 'phuong', 'Quận Phú Nhuận', 'Cầu Kiệu', true),
  ('Phường 7', 'phuong', 'Quận Phú Nhuận', 'Cầu Kiệu', true),
  ('Phường 15', 'phuong', 'Quận Phú Nhuận', 'Cầu Kiệu', false),
  ('Phường Nguyễn Cư Trinh', 'phuong', 'Quận 1', 'Cầu Ông Lãnh', true),
  ('Phường Cầu Kho', 'phuong', 'Quận 1', 'Cầu Ông Lãnh', true),
  ('Phường Cô Giang', 'phuong', 'Quận 1', 'Cầu Ông Lãnh', true),
  ('Phường Cầu Ông Lãnh', 'phuong', 'Quận 1', 'Cầu Ông Lãnh', false),
  ('Phường Định Hòa', 'phuong', 'Thành phố Thủ Dầu Một', 'Chánh Hiệp', true),
  ('Phường Tương Bình Hiệp', 'phuong', 'Thành phố Thủ Dầu Một', 'Chánh Hiệp', true),
  ('Phường Hiệp An', 'phuong', 'Thành phố Thủ Dầu Một', 'Chánh Hiệp', false),
  ('Phường Chánh Mỹ', 'phuong', 'Thành phố Thủ Dầu Một', 'Chánh Hiệp', false),
  ('Phường 4', 'phuong', 'Quận 8', 'Chánh Hưng', true),
  ('Phường Rạch Ông', 'phuong', 'Quận 8', 'Chánh Hưng', true),
  ('Phường Hưng Phú', 'phuong', 'Quận 8', 'Chánh Hưng', true),
  ('Phường 5', 'phuong', 'Quận 8', 'Chánh Hưng', false),
  ('Phường Chánh Phú Hòa', 'phuong', 'Thành phố Bến Cát', 'Chánh Phú Hòa', true),
  ('Xã Hưng Hòa', 'xa', 'Huyện Bàu Bàng', 'Chánh Phú Hòa', true),
  ('Phường 11', 'phuong', 'Quận 5', 'Chợ Lớn', true),
  ('Phường 12', 'phuong', 'Quận 5', 'Chợ Lớn', true),
  ('Phường 13', 'phuong', 'Quận 5', 'Chợ Lớn', true),
  ('Phường 14', 'phuong', 'Quận 5', 'Chợ Lớn', true),
  ('Phường 1', 'phuong', 'Quận 5', 'Chợ Quán', true),
  ('Phường 2', 'phuong', 'Quận 5', 'Chợ Quán', true),
  ('Phường 4', 'phuong', 'Quận 5', 'Chợ Quán', true),
  ('Phường 6', 'phuong', 'Quận 10', 'Diên Hồng', true),
  ('Phường 8', 'phuong', 'Quận 10', 'Diên Hồng', true),
  ('Phường 14', 'phuong', 'Quận 10', 'Diên Hồng', false),
  ('Phường An Bình', 'phuong', 'Thành phố Dĩ An', 'Dĩ An', true),
  ('Phường Dĩ An', 'phuong', 'Thành phố Dĩ An', 'Dĩ An', true),
  ('Phường Tân Đông Hiệp', 'phuong', 'Thành phố Dĩ An', 'Dĩ An', false),
  ('Phường Bình An', 'phuong', 'Thành phố Dĩ An', 'Đông Hòa', true),
  ('Phường Bình Thắng', 'phuong', 'Thành phố Dĩ An', 'Đông Hòa', true),
  ('Phường Đông Hòa', 'phuong', 'Thành phố Dĩ An', 'Đông Hòa', true),
  ('Phường Tân Thới Nhất', 'phuong', 'Quận 12', 'Đông Hưng Thuận', true),
  ('Phường Tân Hưng Thuận', 'phuong', 'Quận 12', 'Đông Hưng Thuận', true),
  ('Phường Đông Hưng Thuận', 'phuong', 'Quận 12', 'Đông Hưng Thuận', true),
  ('Phường 4', 'phuong', 'Quận Phú Nhuận', 'Đức Nhuận', true),
  ('Phường 5', 'phuong', 'Quận Phú Nhuận', 'Đức Nhuận', true),
  ('Phường 9', 'phuong', 'Quận Phú Nhuận', 'Đức Nhuận', true),
  ('Phường 1', 'phuong', 'Quận Bình Thạnh', 'Gia Định', true),
  ('Phường 2', 'phuong', 'Quận Bình Thạnh', 'Gia Định', true),
  ('Phường 7', 'phuong', 'Quận Bình Thạnh', 'Gia Định', true),
  ('Phường 17', 'phuong', 'Quận Bình Thạnh', 'Gia Định', true),
  ('Phường 10', 'phuong', 'Quận Gò Vấp', 'Gò Vấp', true),
  ('Phường 17', 'phuong', 'Quận Gò Vấp', 'Gò Vấp', true),
  ('Phường 1', 'phuong', 'Quận Gò Vấp', 'Hạnh Thông', true),
  ('Phường 3', 'phuong', 'Quận Gò Vấp', 'Hạnh Thông', true),
  ('Phường Hiệp Bình Chánh', 'phuong', 'Thành phố Thủ Đức', 'Hiệp Bình', true),
  ('Phường Hiệp Bình Phước', 'phuong', 'Thành phố Thủ Đức', 'Hiệp Bình', true),
  ('Phường Linh Đông', 'phuong', 'Thành phố Thủ Đức', 'Hiệp Bình', false),
  ('Phường 5', 'phuong', 'Quận 11', 'Hòa Bình', true),
  ('Phường 14', 'phuong', 'Quận 11', 'Hòa Bình', true),
  ('Phường 12', 'phuong', 'Quận 10', 'Hòa Hưng', true),
  ('Phường 13', 'phuong', 'Quận 10', 'Hòa Hưng', true),
  ('Phường 15', 'phuong', 'Quận 10', 'Hòa Hưng', true),
  ('Phường 14', 'phuong', 'Quận 10', 'Hòa Hưng', false),
  ('Phường Tân Định', 'phuong', 'Thành phố Bến Cát', 'Hòa Lợi', true),
  ('Phường Hòa Lợi', 'phuong', 'Thành phố Bến Cát', 'Hòa Lợi', true),
  ('Phường 8', 'phuong', 'Quận 4', 'Khánh Hội', true),
  ('Phường 9', 'phuong', 'Quận 4', 'Khánh Hội', true),
  ('Phường 2', 'phuong', 'Quận 4', 'Khánh Hội', false),
  ('Phường 4', 'phuong', 'Quận 4', 'Khánh Hội', false),
  ('Phường 15', 'phuong', 'Quận 4', 'Khánh Hội', false),
  ('Phường Bình Nhâm', 'phuong', 'Thành phố Thuận An', 'Lái Thiêu', true),
  ('Phường Lái Thiêu', 'phuong', 'Thành phố Thuận An', 'Lái Thiêu', true),
  ('Phường Vĩnh Phú', 'phuong', 'Thành phố Thuận An', 'Lái Thiêu', false),
  ('Phường Linh Trung', 'phuong', 'Thành phố Thủ Đức', 'Linh Xuân', true),
  ('Phường Linh Xuân', 'phuong', 'Thành phố Thủ Đức', 'Linh Xuân', true),
  ('Phường Linh Tây', 'phuong', 'Thành phố Thủ Đức', 'Linh Xuân', false),
  ('Phường Long Bình', 'phuong', 'Thành phố Thủ Đức', 'Long Bình', true),
  ('Phường Long Thạnh Mỹ', 'phuong', 'Thành phố Thủ Đức', 'Long Bình', false),
  ('Xã Tân Hưng', 'xa', 'Thành phố Bà Rịa', 'Long Hương', true),
  ('Phường Kim Dinh', 'phuong', 'Thành phố Bà Rịa', 'Long Hương', true),
  ('Phường Long Hương', 'phuong', 'Thành phố Bà Rịa', 'Long Hương', true),
  ('Phường An Điền', 'phuong', 'Thành phố Bến Cát', 'Long Nguyên', true),
  ('Phường Mỹ Phước', 'phuong', 'Thành phố Bến Cát', 'Long Nguyên', false),
  ('Xã Long Nguyên', 'xa', 'Huyện Bàu Bàng', 'Long Nguyên', true),
  ('Phường Trường Thạnh', 'phuong', 'Thành phố Thủ Đức', 'Long Phước', true),
  ('Phường Long Phước', 'phuong', 'Thành phố Thủ Đức', 'Long Phước', true),
  ('Phường Phú Hữu', 'phuong', 'Thành phố Thủ Đức', 'Long Trường', true),
  ('Phường Long Trường', 'phuong', 'Thành phố Thủ Đức', 'Long Trường', true),
  ('Phường 1', 'phuong', 'Quận 11', 'Minh Phụng', true),
  ('Phường 7', 'phuong', 'Quận 11', 'Minh Phụng', true),
  ('Phường 16', 'phuong', 'Quận 11', 'Minh Phụng', true),
  ('Phường 9', 'phuong', 'Quận 3', 'Nhiêu Lộc', true),
  ('Phường 11', 'phuong', 'Quận 3', 'Nhiêu Lộc', true),
  ('Phường 12', 'phuong', 'Quận 3', 'Nhiêu Lộc', true),
  ('Phường 14', 'phuong', 'Quận 3', 'Nhiêu Lộc', true),
  ('Phường Tân An', 'phuong', 'Thành phố Thủ Dầu Một', 'Phú An', true),
  ('Phường Hiệp An', 'phuong', 'Thành phố Thủ Dầu Một', 'Phú An', false),
  ('Xã Phú An', 'xa', 'Thành phố Bến Cát', 'Phú An', true),
  ('Phường 14', 'phuong', 'Quận 8', 'Phú Định', true),
  ('Phường 15', 'phuong', 'Quận 8', 'Phú Định', true),
  ('Phường Xóm Củi', 'phuong', 'Quận 8', 'Phú Định', true),
  ('Phường 16', 'phuong', 'Quận 8', 'Phú Định', false),
  ('Phường 12', 'phuong', 'Quận 6', 'Phú Lâm', true),
  ('Phường 13', 'phuong', 'Quận 6', 'Phú Lâm', true),
  ('Phường 14', 'phuong', 'Quận 6', 'Phú Lâm', true),
  ('Phường Phú Hòa', 'phuong', 'Thành phố Thủ Dầu Một', 'Phú Lợi', true),
  ('Phường Phú Lợi', 'phuong', 'Thành phố Thủ Dầu Một', 'Phú Lợi', true),
  ('Phường Hiệp Thành', 'phuong', 'Thành phố Thủ Dầu Một', 'Phú Lợi', false),
  ('Phường Phú Mỹ', 'phuong', 'Thành phố Phú Mỹ', 'Phú Mỹ', true),
  ('Phường Mỹ Xuân', 'phuong', 'Thành phố Phú Mỹ', 'Phú Mỹ', true),
  ('Phường 8', 'phuong', 'Quận Phú Nhuận', 'Phú Nhuận', true),
  ('Phường 10', 'phuong', 'Quận Phú Nhuận', 'Phú Nhuận', true),
  ('Phường 11', 'phuong', 'Quận Phú Nhuận', 'Phú Nhuận', true),
  ('Phường 13', 'phuong', 'Quận Phú Nhuận', 'Phú Nhuận', true),
  ('Phường 15', 'phuong', 'Quận Phú Nhuận', 'Phú Nhuận', false),
  ('Phường Hiệp Tân', 'phuong', 'Quận Tân Phú', 'Phú Thạnh', true),
  ('Phường Phú Thạnh', 'phuong', 'Quận Tân Phú', 'Phú Thạnh', true),
  ('Phường Tân Thới Hòa', 'phuong', 'Quận Tân Phú', 'Phú Thạnh', false),
  ('Phường 11', 'phuong', 'Quận 11', 'Phú Thọ', true),
  ('Phường 15', 'phuong', 'Quận 11', 'Phú Thọ', true),
  ('Phường 8', 'phuong', 'Quận 11', 'Phú Thọ', false),
  ('Phường Phú Thọ Hòa', 'phuong', 'Quận Tân Phú', 'Phú Thọ Hòa', true),
  ('Phường Tân Thành', 'phuong', 'Quận Tân Phú', 'Phú Thọ Hòa', false),
  ('Phường Tân Quý', 'phuong', 'Quận Tân Phú', 'Phú Thọ Hòa', false),
  ('Phường Phú Thuận', 'phuong', 'Quận 7', 'Phú Thuận', true),
  ('Phường Phú Mỹ', 'phuong', 'Quận 7', 'Phú Thuận', false),
  ('Phường Phước Bình', 'phuong', 'Thành phố Thủ Đức', 'Phước Long', true),
  ('Phường Phước Long A', 'phuong', 'Thành phố Thủ Đức', 'Phước Long', true),
  ('Phường Phước Long B', 'phuong', 'Thành phố Thủ Đức', 'Phước Long', true),
  ('Phường 11', 'phuong', 'Thành phố Vũng Tàu', 'Phước Thắng', true),
  ('Phường 12', 'phuong', 'Thành phố Vũng Tàu', 'Phước Thắng', true),
  ('Phường 10', 'phuong', 'Thành phố Vũng Tàu', 'Rạch Dừa', true),
  ('Phường Thắng Nhất', 'phuong', 'Thành phố Vũng Tàu', 'Rạch Dừa', true),
  ('Phường Rạch Dừa', 'phuong', 'Thành phố Vũng Tàu', 'Rạch Dừa', true),
  ('Phường Bến Nghé', 'phuong', 'Quận 1', 'Sài Gòn', true),
  ('Phường Đa Kao', 'phuong', 'Quận 1', 'Sài Gòn', false),
  ('Phường Nguyễn Thái Bình', 'phuong', 'Quận 1', 'Sài Gòn', false),
  ('Phường Bình Chiểu', 'phuong', 'Thành phố Thủ Đức', 'Tam Bình', true),
  ('Phường Tam Phú', 'phuong', 'Thành phố Thủ Đức', 'Tam Bình', true),
  ('Phường Tam Bình', 'phuong', 'Thành phố Thủ Đức', 'Tam Bình', true),
  ('Phường Long Tâm', 'phuong', 'Thành phố Bà Rịa', 'Tam Long', true),
  ('Xã Hòa Long', 'xa', 'Thành phố Bà Rịa', 'Tam Long', true),
  ('Xã Long Phước', 'xa', 'Thành phố Bà Rịa', 'Tam Long', true),
  ('Phường 7', 'phuong', 'Thành phố Vũng Tàu', 'Tam Thắng', true),
  ('Phường 8', 'phuong', 'Thành phố Vũng Tàu', 'Tam Thắng', true),
  ('Phường 9', 'phuong', 'Thành phố Vũng Tàu', 'Tam Thắng', true),
  ('Phường Nguyễn An Ninh', 'phuong', 'Thành phố Vũng Tàu', 'Tam Thắng', true),
  ('Phường Tân Phú', 'phuong', 'Thành phố Thủ Đức', 'Tăng Nhơn Phú', true),
  ('Phường Hiệp Phú', 'phuong', 'Thành phố Thủ Đức', 'Tăng Nhơn Phú', true),
  ('Phường Tăng Nhơn Phú A', 'phuong', 'Thành phố Thủ Đức', 'Tăng Nhơn Phú', true),
  ('Phường Tăng Nhơn Phú B', 'phuong', 'Thành phố Thủ Đức', 'Tăng Nhơn Phú', true),
  ('Phường Long Thạnh Mỹ', 'phuong', 'Thành phố Thủ Đức', 'Tăng Nhơn Phú', false),
  ('Phường 13', 'phuong', 'Quận Tân Bình', 'Tân Bình', true),
  ('Phường 14', 'phuong', 'Quận Tân Bình', 'Tân Bình', true),
  ('Phường 15', 'phuong', 'Quận Tân Bình', 'Tân Bình', false),
  ('Phường Tân Định', 'phuong', 'Quận 1', 'Tân Định', true),
  ('Phường Đa Kao', 'phuong', 'Quận 1', 'Tân Định', false),
  ('Phường Tân Bình', 'phuong', 'Thành phố Dĩ An', 'Tân Đông Hiệp', true),
  ('Phường Tân Đông Hiệp', 'phuong', 'Thành phố Dĩ An', 'Tân Đông Hiệp', false),
  ('Phường Thái Hòa', 'phuong', 'Thành phố Tân Uyên', 'Tân Đông Hiệp', false),
  ('Phường Tân Hòa', 'phuong', 'Thành phố Phú Mỹ', 'Tân Hải', true),
  ('Phường Tân Hải', 'phuong', 'Thành phố Phú Mỹ', 'Tân Hải', true),
  ('Phường Khánh Bình', 'phuong', 'Thành phố Tân Uyên', 'Tân Hiệp', true),
  ('Phường Tân Hiệp', 'phuong', 'Thành phố Tân Uyên', 'Tân Hiệp', true),
  ('Phường 6', 'phuong', 'Quận Tân Bình', 'Tân Hòa', true),
  ('Phường 8', 'phuong', 'Quận Tân Bình', 'Tân Hòa', true),
  ('Phường 9', 'phuong', 'Quận Tân Bình', 'Tân Hòa', true),
  ('Phường Tân Phong', 'phuong', 'Quận 7', 'Tân Hưng', true),
  ('Phường Tân Quy', 'phuong', 'Quận 7', 'Tân Hưng', true),
  ('Phường Tân Kiểng', 'phuong', 'Quận 7', 'Tân Hưng', true),
  ('Phường Tân Hưng', 'phuong', 'Quận 7', 'Tân Hưng', true),
  ('Phường Thạnh Phước', 'phuong', 'Thành phố Tân Uyên', 'Tân Khánh', true),
  ('Phường Tân Phước Khánh', 'phuong', 'Thành phố Tân Uyên', 'Tân Khánh', true),
  ('Phường Tân Vĩnh Hiệp', 'phuong', 'Thành phố Tân Uyên', 'Tân Khánh', true),
  ('Xã Thạnh Hội', 'xa', 'Thành phố Tân Uyên', 'Tân Khánh', true),
  ('Phường Thái Hòa', 'phuong', 'Thành phố Tân Uyên', 'Tân Khánh', false),
  ('Phường Tân Phú', 'phuong', 'Quận 7', 'Tân Mỹ', true),
  ('Phường Phú Mỹ', 'phuong', 'Quận 7', 'Tân Mỹ', false),
  ('Phường Phú Trung', 'phuong', 'Quận Tân Phú', 'Tân Phú', true),
  ('Phường Hòa Thạnh', 'phuong', 'Quận Tân Phú', 'Tân Phú', true),
  ('Phường Tân Thới Hòa', 'phuong', 'Quận Tân Phú', 'Tân Phú', false),
  ('Phường Tân Thành', 'phuong', 'Quận Tân Phú', 'Tân Phú', false),
  ('Phường Phước Hòa', 'phuong', 'Thành phố Phú Mỹ', 'Tân Phước', true),
  ('Phường Tân Phước', 'phuong', 'Thành phố Phú Mỹ', 'Tân Phước', true),
  ('Phường 15', 'phuong', 'Quận Tân Bình', 'Tân Sơn', false),
  ('Phường 1', 'phuong', 'Quận Tân Bình', 'Tân Sơn Hòa', true),
  ('Phường 2', 'phuong', 'Quận Tân Bình', 'Tân Sơn Hòa', true),
  ('Phường 3', 'phuong', 'Quận Tân Bình', 'Tân Sơn Hòa', true),
  ('Phường 4', 'phuong', 'Quận Tân Bình', 'Tân Sơn Nhất', true),
  ('Phường 5', 'phuong', 'Quận Tân Bình', 'Tân Sơn Nhất', true),
  ('Phường 7', 'phuong', 'Quận Tân Bình', 'Tân Sơn Nhất', true),
  ('Phường Tân Sơn Nhì', 'phuong', 'Quận Tân Phú', 'Tân Sơn Nhì', true),
  ('Phường Tân Quý', 'phuong', 'Quận Tân Phú', 'Tân Sơn Nhì', false),
  ('Phường Tân Thành', 'phuong', 'Quận Tân Phú', 'Tân Sơn Nhì', false),
  ('Phường Sơn Kỳ', 'phuong', 'Quận Tân Phú', 'Tân Sơn Nhì', false),
  ('Phường Tân Tạo A', 'phuong', 'Quận Bình Tân', 'Tân Tạo', false),
  ('Phường Tân Tạo', 'phuong', 'Quận Bình Tân', 'Tân Tạo', false),
  ('Xã Tân Kiên', 'xa', 'Huyện Bình Chánh', 'Tân Tạo', true),
  ('Phường Hắc Dịch', 'phuong', 'Thành phố Phú Mỹ', 'Tân Thành', true),
  ('Xã Sông Xoài', 'xa', 'Thành phố Phú Mỹ', 'Tân Thành', true),
  ('Phường Hiệp Thành', 'phuong', 'Quận 12', 'Tân Thới Hiệp', true),
  ('Phường Tân Thới Hiệp', 'phuong', 'Quận 12', 'Tân Thới Hiệp', true),
  ('Phường Bình Thuận', 'phuong', 'Quận 7', 'Tân Thuận', true),
  ('Phường Tân Thuận Đông', 'phuong', 'Quận 7', 'Tân Thuận', true),
  ('Phường Tân Thuận Tây', 'phuong', 'Quận 7', 'Tân Thuận', true),
  ('Phường Uyên Hưng', 'phuong', 'Thành phố Tân Uyên', 'Tân Uyên', true),
  ('Xã Bạch Đằng', 'xa', 'Thành phố Tân Uyên', 'Tân Uyên', true),
  ('Xã Tân Lập', 'xa', 'Huyện Bắc Tân Uyên', 'Tân Uyên', true),
  ('Xã Tân Mỹ', 'xa', 'Huyện Bắc Tân Uyên', 'Tân Uyên', false),
  ('Phường An Tây', 'phuong', 'Thành phố Bến Cát', 'Tây Nam', true),
  ('Xã Thanh Tuyền', 'xa', 'Huyện Dầu Tiếng', 'Tây Nam', false),
  ('Xã An Lập', 'xa', 'Huyện Dầu Tiếng', 'Tây Nam', false),
  ('Phường Tây Thạnh', 'phuong', 'Quận Tân Phú', 'Tây Thạnh', true),
  ('Phường Sơn Kỳ', 'phuong', 'Quận Tân Phú', 'Tây Thạnh', false),
  ('Phường 19', 'phuong', 'Quận Bình Thạnh', 'Thạnh Mỹ Tây', true),
  ('Phường 22', 'phuong', 'Quận Bình Thạnh', 'Thạnh Mỹ Tây', true),
  ('Phường 25', 'phuong', 'Quận Bình Thạnh', 'Thạnh Mỹ Tây', true),
  ('Phường 8', 'phuong', 'Quận Gò Vấp', 'Thông Tây Hội', true),
  ('Phường 11', 'phuong', 'Quận Gò Vấp', 'Thông Tây Hội', true),
  ('Phường Thạnh Xuân', 'phuong', 'Quận 12', 'Thới An', true),
  ('Phường Thới An', 'phuong', 'Quận 12', 'Thới An', true),
  ('Phường Hưng Định', 'phuong', 'Thành phố Thuận An', 'Thuận An', true),
  ('Phường An Thạnh', 'phuong', 'Thành phố Thuận An', 'Thuận An', true),
  ('Xã An Sơn', 'xa', 'Thành phố Thuận An', 'Thuận An', true),
  ('Phường Thuận Giao', 'phuong', 'Thành phố Thuận An', 'Thuận Giao', true),
  ('Phường Bình Chuẩn', 'phuong', 'Thành phố Thuận An', 'Thuận Giao', false),
  ('Phường Phú Cường', 'phuong', 'Thành phố Thủ Dầu Một', 'Thủ Dầu Một', true),
  ('Phường Phú Thọ', 'phuong', 'Thành phố Thủ Dầu Một', 'Thủ Dầu Một', true),
  ('Phường Chánh Nghĩa', 'phuong', 'Thành phố Thủ Dầu Một', 'Thủ Dầu Một', true),
  ('Phường Hiệp Thành', 'phuong', 'Thành phố Thủ Dầu Một', 'Thủ Dầu Một', false),
  ('Phường Chánh Mỹ', 'phuong', 'Thành phố Thủ Dầu Một', 'Thủ Dầu Một', false),
  ('Phường Bình Thọ', 'phuong', 'Thành phố Thủ Đức', 'Thủ Đức', true),
  ('Phường Linh Chiểu', 'phuong', 'Thành phố Thủ Đức', 'Thủ Đức', true),
  ('Phường Trường Thọ', 'phuong', 'Thành phố Thủ Đức', 'Thủ Đức', true),
  ('Phường Linh Tây', 'phuong', 'Thành phố Thủ Đức', 'Thủ Đức', false),
  ('Phường Linh Đông', 'phuong', 'Thành phố Thủ Đức', 'Thủ Đức', false),
  ('Phường Tân Chánh Hiệp', 'phuong', 'Quận 12', 'Trung Mỹ Tây', true),
  ('Phường Trung Mỹ Tây', 'phuong', 'Quận 12', 'Trung Mỹ Tây', true),
  ('Phường 1', 'phuong', 'Quận 4', 'Vĩnh Hội', true),
  ('Phường 3', 'phuong', 'Quận 4', 'Vĩnh Hội', true),
  ('Phường 2', 'phuong', 'Quận 4', 'Vĩnh Hội', false),
  ('Phường 4', 'phuong', 'Quận 4', 'Vĩnh Hội', false),
  ('Phường Vĩnh Tân', 'phuong', 'Thành phố Tân Uyên', 'Vĩnh Tân', true),
  ('Thị trấn Tân Bình', 'thi_tran', 'Huyện Bắc Tân Uyên', 'Vĩnh Tân', true),
  ('Phường 1', 'phuong', 'Thành phố Vũng Tàu', 'Vũng Tàu', true),
  ('Phường 2', 'phuong', 'Thành phố Vũng Tàu', 'Vũng Tàu', true),
  ('Phường 3', 'phuong', 'Thành phố Vũng Tàu', 'Vũng Tàu', true),
  ('Phường 4', 'phuong', 'Thành phố Vũng Tàu', 'Vũng Tàu', true),
  ('Phường 5', 'phuong', 'Thành phố Vũng Tàu', 'Vũng Tàu', true),
  ('Phường Thắng Nhì', 'phuong', 'Thành phố Vũng Tàu', 'Vũng Tàu', true),
  ('Phường Thắng Tam', 'phuong', 'Thành phố Vũng Tàu', 'Vũng Tàu', true),
  ('Phường 1', 'phuong', 'Quận 10', 'Vườn Lài', true),
  ('Phường 2', 'phuong', 'Quận 10', 'Vườn Lài', true),
  ('Phường 4', 'phuong', 'Quận 10', 'Vườn Lài', true),
  ('Phường 9', 'phuong', 'Quận 10', 'Vườn Lài', true),
  ('Phường 10', 'phuong', 'Quận 10', 'Vườn Lài', true),
  ('Phường 13', 'phuong', 'Quận 4', 'Xóm Chiếu', true),
  ('Phường 16', 'phuong', 'Quận 4', 'Xóm Chiếu', true),
  ('Phường 18', 'phuong', 'Quận 4', 'Xóm Chiếu', true),
  ('Phường 15', 'phuong', 'Quận 4', 'Xóm Chiếu', false),
  ('Phường Võ Thị Sáu', 'phuong', 'Quận 3', 'Xuân Hòa', true),
  ('Phường 4', 'phuong', 'Quận 3', 'Xuân Hòa', false),
  ('Xã An Linh', 'xa', 'Huyện Phú Giáo', 'An Long', true),
  ('Xã Tân Long', 'xa', 'Huyện Phú Giáo', 'An Long', true),
  ('Xã An Long', 'xa', 'Huyện Phú Giáo', 'An Long', true),
  ('Xã Phú Mỹ Hưng', 'xa', 'Huyện Củ Chi', 'An Nhơn Tây', true),
  ('Xã An Phú', 'xa', 'Huyện Củ Chi', 'An Nhơn Tây', true),
  ('Xã An Nhơn Tây', 'xa', 'Huyện Củ Chi', 'An Nhơn Tây', true),
  ('Xã Lý Nhơn', 'xa', 'Huyện Cần Giờ', 'An Thới Đông', true),
  ('Xã An Thới Đông', 'xa', 'Huyện Cần Giờ', 'An Thới Đông', false),
  ('Xã Xuân Thới Thượng', 'xa', 'Huyện Hóc Môn', 'Bà Điểm', true),
  ('Xã Trung Chánh', 'xa', 'Huyện Hóc Môn', 'Bà Điểm', true),
  ('Xã Bà Điểm', 'xa', 'Huyện Hóc Môn', 'Bà Điểm', true),
  ('Thị trấn Lai Uyên', 'thi_tran', 'Huyện Bàu Bàng', 'Bàu Bàng', false),
  ('Xã Tân Lâm', 'xa', 'Huyện Xuyên Mộc', 'Bàu Lâm', true),
  ('Xã Bàu Lâm', 'xa', 'Huyện Xuyên Mộc', 'Bàu Lâm', true),
  ('Thị trấn Tân Thành', 'thi_tran', 'Huyện Bắc Tân Uyên', 'Bắc Tân Uyên', true),
  ('Xã Đất Cuốc', 'xa', 'Huyện Bắc Tân Uyên', 'Bắc Tân Uyên', true),
  ('Xã Tân Định', 'xa', 'Huyện Bắc Tân Uyên', 'Bắc Tân Uyên', true),
  ('Xã Tân Quý Tây', 'xa', 'Huyện Bình Chánh', 'Bình Chánh', true),
  ('Xã Bình Chánh', 'xa', 'Huyện Bình Chánh', 'Bình Chánh', true),
  ('Xã An Phú Tây', 'xa', 'Huyện Bình Chánh', 'Bình Chánh', false),
  ('Xã Bình Trung', 'xa', 'Huyện Châu Đức', 'Bình Giã', true),
  ('Xã Quảng Thành', 'xa', 'Huyện Châu Đức', 'Bình Giã', true),
  ('Xã Bình Giã', 'xa', 'Huyện Châu Đức', 'Bình Giã', true),
  ('Xã Phong Phú', 'xa', 'Huyện Bình Chánh', 'Bình Hưng', true),
  ('Xã Bình Hưng', 'xa', 'Huyện Bình Chánh', 'Bình Hưng', true),
  ('Phường 7', 'phuong', 'Quận 8', 'Bình Hưng', false),
  ('Xã Tam Thôn Hiệp', 'xa', 'Huyện Cần Giờ', 'Bình Khánh', true),
  ('Xã Bình Khánh', 'xa', 'Huyện Cần Giờ', 'Bình Khánh', true),
  ('Xã An Thới Đông', 'xa', 'Huyện Cần Giờ', 'Bình Khánh', false),
  ('Xã Lê Minh Xuân', 'xa', 'Huyện Bình Chánh', 'Bình Lợi', true),
  ('Xã Bình Lợi', 'xa', 'Huyện Bình Chánh', 'Bình Lợi', true),
  ('Xã Bình Mỹ', 'xa', 'Huyện Củ Chi', 'Bình Mỹ', true),
  ('Xã Hòa Phú', 'xa', 'Huyện Củ Chi', 'Bình Mỹ', true),
  ('Xã Trung An', 'xa', 'Huyện Củ Chi', 'Bình Mỹ', true),
  ('Xã Long Hòa', 'xa', 'Huyện Cần Giờ', 'Cần Giờ', true),
  ('Thị trấn Cần Thạnh', 'thi_tran', 'Huyện Cần Giờ', 'Cần Giờ', true),
  ('Xã Cù Bị', 'xa', 'Huyện Châu Đức', 'Châu Đức', true),
  ('Xã Xà Bang', 'xa', 'Huyện Châu Đức', 'Châu Đức', true),
  ('Xã Tóc Tiên', 'xa', 'Thành phố Phú Mỹ', 'Châu Pha', true),
  ('Xã Châu Pha', 'xa', 'Thành phố Phú Mỹ', 'Châu Pha', true),
  ('Xã Tân Phú Trung', 'xa', 'Huyện Củ Chi', 'Củ Chi', true),
  ('Xã Tân Thông Hội', 'xa', 'Huyện Củ Chi', 'Củ Chi', true),
  ('Xã Phước Vĩnh An', 'xa', 'Huyện Củ Chi', 'Củ Chi', true),
  ('Thị trấn Dầu Tiếng', 'thi_tran', 'Huyện Dầu Tiếng', 'Dầu Tiếng', true),
  ('Xã Định An', 'xa', 'Huyện Dầu Tiếng', 'Dầu Tiếng', true),
  ('Xã Định Thành', 'xa', 'Huyện Dầu Tiếng', 'Dầu Tiếng', true),
  ('Xã Định Hiệp', 'xa', 'Huyện Dầu Tiếng', 'Dầu Tiếng', false),
  ('Thị trấn Đất Đỏ', 'thi_tran', 'Huyện Long Đất', 'Đất Đỏ', true),
  ('Xã Long Tân', 'xa', 'Huyện Long Đất', 'Đất Đỏ', true),
  ('Xã Láng Dài', 'xa', 'Huyện Long Đất', 'Đất Đỏ', true),
  ('Xã Phước Long Thọ', 'xa', 'Huyện Long Đất', 'Đất Đỏ', true),
  ('Xã Thới Tam Thôn', 'xa', 'Huyện Hóc Môn', 'Đông Thạnh', true),
  ('Xã Nhị Bình', 'xa', 'Huyện Hóc Môn', 'Đông Thạnh', true),
  ('Xã Đông Thạnh', 'xa', 'Huyện Hóc Môn', 'Đông Thạnh', true),
  ('Xã Nhơn Đức', 'xa', 'Huyện Nhà Bè', 'Hiệp Phước', true),
  ('Xã Long Thới', 'xa', 'Huyện Nhà Bè', 'Hiệp Phước', true),
  ('Xã Hiệp Phước', 'xa', 'Huyện Nhà Bè', 'Hiệp Phước', true),
  ('Xã Tân Hiệp', 'xa', 'Huyện Hóc Môn', 'Hóc Môn', true),
  ('Xã Tân Xuân', 'xa', 'Huyện Hóc Môn', 'Hóc Môn', true),
  ('Thị trấn Hóc Môn', 'thi_tran', 'Huyện Hóc Môn', 'Hóc Môn', true),
  ('Xã Hòa Hưng', 'xa', 'Huyện Xuyên Mộc', 'Hòa Hội', true),
  ('Xã Hòa Bình', 'xa', 'Huyện Xuyên Mộc', 'Hòa Hội', true),
  ('Xã Hòa Hội', 'xa', 'Huyện Xuyên Mộc', 'Hòa Hội', true),
  ('Thị trấn Phước Bửu', 'thi_tran', 'Huyện Xuyên Mộc', 'Hồ Tràm', true),
  ('Xã Phước Tân', 'xa', 'Huyện Xuyên Mộc', 'Hồ Tràm', true),
  ('Xã Phước Thuận', 'xa', 'Huyện Xuyên Mộc', 'Hồ Tràm', true),
  ('Xã Đa Phước', 'xa', 'Huyện Bình Chánh', 'Hưng Long', true),
  ('Xã Qui Đức', 'xa', 'Huyện Bình Chánh', 'Hưng Long', true),
  ('Xã Hưng Long', 'xa', 'Huyện Bình Chánh', 'Hưng Long', true),
  ('Thị trấn Kim Long', 'thi_tran', 'Huyện Châu Đức', 'Kim Long', true),
  ('Xã Bàu Chinh', 'xa', 'Huyện Châu Đức', 'Kim Long', true),
  ('Xã Láng Lớn', 'xa', 'Huyện Châu Đức', 'Kim Long', true),
  ('Thị trấn Long Điền', 'thi_tran', 'Huyện Long Đất', 'Long Điền', true),
  ('Xã Tam An', 'xa', 'Huyện Long Đất', 'Long Điền', true),
  ('Thị trấn Long Hải', 'thi_tran', 'Huyện Long Đất', 'Long Hải', true),
  ('Xã Phước Tỉnh', 'xa', 'Huyện Long Đất', 'Long Hải', true),
  ('Xã Phước Hưng', 'xa', 'Huyện Long Đất', 'Long Hải', true),
  ('Xã Long Tân', 'xa', 'Huyện Dầu Tiếng', 'Long Hòa', true),
  ('Xã Long Hòa', 'xa', 'Huyện Dầu Tiếng', 'Long Hòa', true),
  ('Xã Minh Tân', 'xa', 'Huyện Dầu Tiếng', 'Long Hòa', false),
  ('Xã Minh Thạnh', 'xa', 'Huyện Dầu Tiếng', 'Long Hòa', false),
  ('Xã Minh Hòa', 'xa', 'Huyện Dầu Tiếng', 'Minh Thạnh', true),
  ('Xã Minh Tân', 'xa', 'Huyện Dầu Tiếng', 'Minh Thạnh', false),
  ('Xã Minh Thạnh', 'xa', 'Huyện Dầu Tiếng', 'Minh Thạnh', false),
  ('Thị trấn Ngãi Giao', 'thi_tran', 'Huyện Châu Đức', 'Ngãi Giao', true),
  ('Xã Bình Ba', 'xa', 'Huyện Châu Đức', 'Ngãi Giao', true),
  ('Xã Suối Nghệ', 'xa', 'Huyện Châu Đức', 'Ngãi Giao', true),
  ('Xã Đá Bạc', 'xa', 'Huyện Châu Đức', 'Nghĩa Thành', true),
  ('Xã Nghĩa Thành', 'xa', 'Huyện Châu Đức', 'Nghĩa Thành', true),
  ('Thị trấn Nhà Bè', 'thi_tran', 'Huyện Nhà Bè', 'Nhà Bè', true),
  ('Xã Phú Xuân', 'xa', 'Huyện Nhà Bè', 'Nhà Bè', true),
  ('Xã Phước Kiển', 'xa', 'Huyện Nhà Bè', 'Nhà Bè', true),
  ('Xã Phước Lộc', 'xa', 'Huyện Nhà Bè', 'Nhà Bè', true),
  ('Xã Phạm Văn Cội', 'xa', 'Huyện Củ Chi', 'Nhuận Đức', true),
  ('Xã Trung Lập Hạ', 'xa', 'Huyện Củ Chi', 'Nhuận Đức', true),
  ('Xã Nhuận Đức', 'xa', 'Huyện Củ Chi', 'Nhuận Đức', true),
  ('Thị trấn Phước Vĩnh', 'thi_tran', 'Huyện Phú Giáo', 'Phú Giáo', true),
  ('Xã An Bình', 'xa', 'Huyện Phú Giáo', 'Phú Giáo', true),
  ('Xã Tam Lập', 'xa', 'Huyện Phú Giáo', 'Phú Giáo', false),
  ('Xã Tân Thạnh Tây', 'xa', 'Huyện Củ Chi', 'Phú Hòa Đông', true),
  ('Xã Tân Thạnh Đông', 'xa', 'Huyện Củ Chi', 'Phú Hòa Đông', true),
  ('Xã Phú Hòa Đông', 'xa', 'Huyện Củ Chi', 'Phú Hòa Đông', true),
  ('Thị trấn Phước Hải', 'thi_tran', 'Huyện Long Đất', 'Phước Hải', true),
  ('Xã Phước Hội', 'xa', 'Huyện Long Đất', 'Phước Hải', true),
  ('Xã Vĩnh Hòa', 'xa', 'Huyện Phú Giáo', 'Phước Hòa', true),
  ('Xã Phước Hòa', 'xa', 'Huyện Phú Giáo', 'Phước Hòa', true),
  ('Xã Tam Lập', 'xa', 'Huyện Phú Giáo', 'Phước Hòa', false),
  ('Xã Tân Hiệp', 'xa', 'Huyện Phú Giáo', 'Phước Thành', true),
  ('Xã An Thái', 'xa', 'Huyện Phú Giáo', 'Phước Thành', true),
  ('Xã Phước Sang', 'xa', 'Huyện Phú Giáo', 'Phước Thành', true),
  ('Thị trấn Củ Chi', 'thi_tran', 'Huyện Củ Chi', 'Tân An Hội', true),
  ('Xã Phước Hiệp', 'xa', 'Huyện Củ Chi', 'Tân An Hội', true),
  ('Xã Tân An Hội', 'xa', 'Huyện Củ Chi', 'Tân An Hội', true),
  ('Thị trấn Tân Túc', 'thi_tran', 'Huyện Bình Chánh', 'Tân Nhựt', true),
  ('Xã Tân Nhựt', 'xa', 'Huyện Bình Chánh', 'Tân Nhựt', true),
  ('Xã Tân Kiên', 'xa', 'Huyện Bình Chánh', 'Tân Nhựt', false),
  ('Phường Tân Tạo A', 'phuong', 'Quận Bình Tân', 'Tân Nhựt', false),
  ('Phường 16', 'phuong', 'Quận 8', 'Tân Nhựt', false),
  ('Xã Vĩnh Lộc B', 'xa', 'Huyện Bình Chánh', 'Tân Vĩnh Lộc', true),
  ('Xã Phạm Văn Hai', 'xa', 'Huyện Bình Chánh', 'Tân Vĩnh Lộc', false),
  ('Phường Tân Tạo', 'phuong', 'Quận Bình Tân', 'Tân Vĩnh Lộc', false),
  ('Xã Thanh An', 'xa', 'Huyện Dầu Tiếng', 'Thanh An', true),
  ('Xã Định Hiệp', 'xa', 'Huyện Dầu Tiếng', 'Thanh An', false),
  ('Xã Thanh Tuyền', 'xa', 'Huyện Dầu Tiếng', 'Thanh An', false),
  ('Xã An Lập', 'xa', 'Huyện Dầu Tiếng', 'Thanh An', false),
  ('Xã Trung Lập Thượng', 'xa', 'Huyện Củ Chi', 'Thái Mỹ', true),
  ('Xã Phước Thạnh', 'xa', 'Huyện Củ Chi', 'Thái Mỹ', true),
  ('Xã Thái Mỹ', 'xa', 'Huyện Củ Chi', 'Thái Mỹ', true),
  ('Xã Lạc An', 'xa', 'Huyện Bắc Tân Uyên', 'Thường Tân', true),
  ('Xã Hiếu Liêm', 'xa', 'Huyện Bắc Tân Uyên', 'Thường Tân', true),
  ('Xã Thường Tân', 'xa', 'Huyện Bắc Tân Uyên', 'Thường Tân', true),
  ('Xã Tân Mỹ', 'xa', 'Huyện Bắc Tân Uyên', 'Thường Tân', false),
  ('Xã Trừ Văn Thố', 'xa', 'Huyện Bàu Bàng', 'Trừ Văn Thố', true),
  ('Xã Cây Trường II', 'xa', 'Huyện Bàu Bàng', 'Trừ Văn Thố', true),
  ('Thị trấn Lai Uyên', 'thi_tran', 'Huyện Bàu Bàng', 'Trừ Văn Thố', false),
  ('Xã Vĩnh Lộc A', 'xa', 'Huyện Bình Chánh', 'Vĩnh Lộc', true),
  ('Xã Phạm Văn Hai', 'xa', 'Huyện Bình Chánh', 'Vĩnh Lộc', false),
  ('Xã Suối Rao', 'xa', 'Huyện Châu Đức', 'Xuân Sơn', true),
  ('Xã Sơn Bình', 'xa', 'Huyện Châu Đức', 'Xuân Sơn', true),
  ('Xã Xuân Sơn', 'xa', 'Huyện Châu Đức', 'Xuân Sơn', true),
  ('Xã Tân Thới Nhì', 'xa', 'Huyện Hóc Môn', 'Xuân Thới Sơn', true),
  ('Xã Xuân Thới Đông', 'xa', 'Huyện Hóc Môn', 'Xuân Thới Sơn', true),
  ('Xã Xuân Thới Sơn', 'xa', 'Huyện Hóc Môn', 'Xuân Thới Sơn', true),
  ('Xã Bông Trang', 'xa', 'Huyện Xuyên Mộc', 'Xuyên Mộc', true),
  ('Xã Bưng Riềng', 'xa', 'Huyện Xuyên Mộc', 'Xuyên Mộc', true),
  ('Xã Xuyên Mộc', 'xa', 'Huyện Xuyên Mộc', 'Xuyên Mộc', true)
on conflict (ten, quan_cu, phuong_moi) do nothing;
update public.phuong_cu p set lat = w.lat, lng = w.lng from public.wards w where w.ten = p.phuong_moi and p.lat is null;

-- ── quan_cu: quận / huyện / thành phố cũ ──────────────────────────────────
create table if not exists public.quan_cu (
  ten text primary key,
  lat double precision,
  lng double precision,
  so_phuong_moi integer not null default 0,
  nhung extensions.vector(768),
  nhung_md5 text,
  nhung_luc timestamptz
);
comment on table public.quan_cu is
  '[RỔ HÀNG] Quận / huyện / thành phố CŨ (trước 07/2025 — nay TP.HCM không còn cấp quận). Gom từ wards.quan_cu và phuong_cu.quan_cu; toạ độ = trung bình tâm các phường mới thuộc nó.';
comment on column public.quan_cu.ten is '"Quận Gò Vấp", "Quận 5", "Huyện Củ Chi", "Thành phố Thủ Đức".';
comment on column public.quan_cu.lat is 'Trung bình wards.lat của các phường mới thuộc quận cũ này.';
comment on column public.quan_cu.lng is 'Như lat.';
comment on column public.quan_cu.so_phuong_moi is 'Số phường mới có phần đất thuộc quận cũ này.';
comment on column public.quan_cu.nhung is 'Vector nghĩa (768 chiều) của van_ban_dia_danh(''quan_cu'', ten).';
comment on column public.quan_cu.nhung_md5 is 'md5 văn bản đã nhúng.';
comment on column public.quan_cu.nhung_luc is 'Lúc ghi vector gần nhất.';
alter table public.quan_cu enable row level security;
revoke all on public.quan_cu from anon, authenticated;
create index if not exists quan_cu_nhung_hnsw on public.quan_cu using hnsw (nhung extensions.vector_cosine_ops);

insert into public.quan_cu (ten, lat, lng, so_phuong_moi)
select q.ten, avg(w.lat)::double precision, avg(w.lng)::double precision, count(distinct w.ten)::int
  from (select w.quan_cu as ten, w.ten as moi from public.wards w
        union
        select p.quan_cu, p.phuong_moi from public.phuong_cu p) q
  join public.wards w on w.ten = q.moi
 group by q.ten
on conflict (ten) do update set lat = excluded.lat, lng = excluded.lng, so_phuong_moi = excluded.so_phuong_moi;

-- ── Hàng chờ nhúng ────────────────────────────────────────────────────────
create table if not exists public.nhung_viec_dia_danh (
  bang text not null check (bang in ('wards', 'duong', 'phuong_cu', 'quan_cu')),
  khoa text not null,
  request_id bigint not null,
  md5 text not null,
  gui_luc timestamptz not null default now(),
  primary key (bang, khoa)
);
comment on table public.nhung_viec_dia_danh is
  '[BOT & HÀNG ĐỢI] Địa danh (phường mới / cũ, quận cũ, đường) đang chờ Gemini trả vector (request pg_net). nhung-dia-danh-tick đọc kết quả rồi xoá dòng.';
alter table public.nhung_viec_dia_danh enable row level security;
revoke all on public.nhung_viec_dia_danh from anon, authenticated;

insert into public.app_config (key, value, ghi_chu) values
  ('nhung_dia_danh_moi_tick', '20', 'Số địa danh (phường, quận cũ, đường) gửi Gemini tối đa mỗi tick 2 phút — chỉ khi hàng chờ tin rao + dự án trống. Hạn mức free thấp thì hạ xuống.')
on conflict (key) do nothing;

-- Văn bản mô tả một địa danh để nhúng: tên + cấp trên (phường mới, quận cũ, tỉnh) + tên cũ.
create or replace function public.van_ban_dia_danh(p_bang text, p_khoa text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case p_bang
    when 'wards' then (
      select concat_ws('. ',
        w.ten_day_du || ', ' || w.quan_cu || ' (cũ), ' || w.tinh_cu,
        'Tên ngắn: ' || w.ten,
        (select 'Gồm ' || string_agg(p.ten || ' ' || p.quan_cu, ', ' order by p.ten) || ' (trước 07/2025)'
           from public.phuong_cu p where p.phuong_moi = w.ten))
        from public.wards w where w.ten = p_khoa)
    when 'phuong_cu' then (
      select p.ten || ', ' || p.quan_cu || ' (trước 07/2025). Nay thuộc ' || w.ten_day_du || case when p.toan_bo then '' else ' (một phần)' end
        from public.phuong_cu p join public.wards w on w.ten = p.phuong_moi where p.id::text = p_khoa)
    when 'quan_cu' then (
      select q.ten || ' (cũ, trước 07/2025), TP.HCM. Nay gồm các phường: '
             || coalesce((select string_agg(distinct w.ten_day_du, ', ') from public.wards w where w.quan_cu = q.ten), '')
        from public.quan_cu q where q.ten = p_khoa)
    when 'duong' then (
      select concat_ws(', ', case when d.loai = 'duong' then 'Đường ' || d.ten else d.ten end,
                       nullif(d.phuong, ''), case when d.quan_cu is not null then d.quan_cu || ' (cũ)' end, d.tinh)
        from public.duong d where d.id::text = p_khoa)
  end;
$$;
comment on function public.van_ban_dia_danh(text, text) is 'Văn bản mô tả một địa danh (wards / phuong_cu / quan_cu / duong) để nhúng vector.';
revoke execute on function public.van_ban_dia_danh(text, text) from public, anon, authenticated;
grant execute on function public.van_ban_dia_danh(text, text) to service_role;

create or replace function public.nhung_dia_danh_tick()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v record;
  r record;
  v_key text;
  v_txt text;
  v_md5 text;
  v_vals jsonb;
  v_gui int := 0;
  v_tran int;
  v_dung timestamptz;
  v_tu_choi boolean := false;
  v_ma int;
  v_mau text;
begin
  -- (1) Thu kết quả lượt trước. Chưa có phản hồi thì chờ; quá 10 phút thì bỏ, lượt sau gửi lại.
  -- "Đã gọi net.http_post" KHÔNG phải bằng chứng (NFR-18): chỉ ghi vector khi đọc được 200 + đúng 768 số.
  for v in
    select nv.bang, nv.khoa, nv.md5, nv.gui_luc, h.status_code, h.content, h.error_msg
      from public.nhung_viec_dia_danh nv left join net._http_response h on h.id = nv.request_id
  loop
    if v.status_code is null and v.error_msg is null then
      if v.gui_luc < now() - interval '10 minutes' then
        delete from public.nhung_viec_dia_danh where bang = v.bang and khoa = v.khoa;
      end if;
      continue;
    end if;
    if v.status_code = 200 then
      v_vals := (v.content::jsonb) -> 'embedding' -> 'values';
      if jsonb_typeof(v_vals) = 'array' and jsonb_array_length(v_vals) = 768 then
        if v.bang = 'wards' then
          update public.wards set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where ten = v.khoa;
        elsif v.bang = 'phuong_cu' then
          update public.phuong_cu set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where id::text = v.khoa;
        elsif v.bang = 'quan_cu' then
          update public.quan_cu set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where ten = v.khoa;
        else
          update public.duong set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where id::text = v.khoa;
        end if;
      else
        perform public.log_loi('nhung-dia-danh-tick', 'Gemini embed trả khuôn lạ cho ' || v.bang || ' ' || v.khoa, null);
      end if;
    else
      v_tu_choi := true;
      v_ma := coalesce(v_ma, v.status_code);
      v_mau := coalesce(v_mau, left(coalesce(v.error_msg, v.content, ''), 200));
    end if;
    delete from public.nhung_viec_dia_danh where bang = v.bang and khoa = v.khoa;
  end loop;

  -- Gemini từ chối → đặt mốc tạm dừng CHUNG với nhung-tick (chung hạn mức).
  if v_tu_choi then
    v_dung := now() + make_interval(mins => case when v_ma = 402 then 60 else 4 end);
    update public.app_config set value = to_char(v_dung at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
     where key = 'nhung_tam_dung_den'
       and coalesce(nullif(value, '')::timestamptz, '-infinity'::timestamptz) < v_dung;
    perform public.log_loi('nhung-dia-danh-tick', 'Gemini embed từ chối HTTP ' || coalesce(v_ma::text, '?') || '. ' || coalesce(v_mau, ''), null);
  end if;

  -- (2) Gửi mẻ mới: quận cũ → phường mới → phường cũ → đường (không nhúng hẻm). Chỉ khi tin rao + dự án không chờ.
  if coalesce(public.cau_hinh('tim_theo_nghia'), 'tat') <> 'bat' then return; end if;
  v_dung := nullif(public.cau_hinh('nhung_tam_dung_den'), '')::timestamptz;
  if v_dung is not null and v_dung > now() then return; end if;
  if exists (select 1 from public.nhung_viec) or exists (select 1 from public.nhung_viec_du_an)
     or exists (select 1 from public.nhung_viec_dia_danh) then return; end if;
  v_key := public.get_secret('GEMINI_API_KEY');
  if v_key is null then return; end if;
  v_tran := greatest(1, least(coalesce(nullif(public.cau_hinh('nhung_dia_danh_moi_tick'), '')::int, 20), 50));

  for r in
    (select 'quan_cu' as bang, q.ten as khoa, q.nhung_md5 from public.quan_cu q where q.nhung is null limit 50)
    union all
    (select 'wards', w.ten, w.nhung_md5 from public.wards w where w.nhung is null limit 50)
    union all
    (select 'phuong_cu', p.id::text, p.nhung_md5 from public.phuong_cu p where p.nhung is null limit 50)
    union all
    (select 'duong', d.id::text, d.nhung_md5 from public.duong d where d.nhung is null and d.loai <> 'hem' limit 100)
  loop
    exit when v_gui >= v_tran;
    v_txt := public.van_ban_dia_danh(r.bang, r.khoa);
    if v_txt is null or length(v_txt) < 4 then continue; end if;
    v_md5 := md5(v_txt);
    if r.nhung_md5 is not distinct from v_md5 then continue; end if;
    insert into public.nhung_viec_dia_danh (bang, khoa, request_id, md5)
    values (r.bang, r.khoa, net.http_post(
      url := 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-goog-api-key', v_key),
      body := jsonb_build_object(
        'content', jsonb_build_object('parts', jsonb_build_array(jsonb_build_object('text', left(v_txt, 1500)))),
        'taskType', 'RETRIEVAL_DOCUMENT', 'outputDimensionality', 768),
      timeout_milliseconds := 20000), v_md5);
    v_gui := v_gui + 1;
  end loop;
end $$;
comment on function public.nhung_dia_danh_tick() is 'Cron nhung-dia-danh-tick: nhúng vector cho quan_cu, wards, phuong_cu, duong (không hẻm) — sau tin rao + dự án.';
revoke execute on function public.nhung_dia_danh_tick() from public, anon, authenticated;

-- ── Tìm theo nghĩa ────────────────────────────────────────────────────────
-- Phường mới gần NGHĨA nhất (bot dùng khi khớp chữ không ra).
create or replace function public.tim_phuong_theo_nghia(p_vec double precision[], p_limit integer default 3)
returns table (ten text, ten_day_du text, quan_cu text, do_gan double precision)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select w.ten, w.ten_day_du, w.quan_cu, 1 - (w.nhung <=> (p_vec::extensions.vector(768)))
    from public.wards w
   where w.nhung is not null
   order by w.nhung <=> (p_vec::extensions.vector(768))
   limit greatest(1, least(coalesce(p_limit, 3), 10));
$$;
comment on function public.tim_phuong_theo_nghia(double precision[], integer) is 'Xếp phường mới (wards) theo độ gần nghĩa với vector câu khách.';
revoke execute on function public.tim_phuong_theo_nghia(double precision[], integer) from public, anon, authenticated;
grant execute on function public.tim_phuong_theo_nghia(double precision[], integer) to service_role;

-- MỌI địa danh gần nghĩa nhất, có thể kèm một ĐIỂM neo (toạ độ căn nhà / con đường khách nhắc) — càng xa điểm neo càng
-- bị trừ điểm (1 km = −0,01, tối đa −0,2). `p_loai` lọc: phuong_moi, phuong_cu, quan_cu, duong, so, du_an.
create or replace function public.tim_dia_danh_theo_nghia(
  p_vec double precision[], p_loai text[] default null, p_lat double precision default null, p_lng double precision default null,
  p_limit integer default 5)
returns table (loai text, khoa text, ten text, ten_day_du text, phuong text, quan_cu text, lat double precision, lng double precision,
               do_gan double precision, cach_m double precision, diem double precision)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with v as (select p_vec::extensions.vector(768) as q),
  ung as (
    (select 'phuong_moi'::text as loai, w.ten as khoa, w.ten, w.ten_day_du, w.ten_day_du as phuong, w.quan_cu,
            w.lat::double precision as lat, w.lng::double precision as lng, 1 - (w.nhung <=> v.q) as do_gan
       from public.wards w, v where w.nhung is not null and (p_loai is null or 'phuong_moi' = any(p_loai))
      order by w.nhung <=> v.q limit 20)
    union all
    (select 'phuong_cu', p.id::text, p.ten, p.ten || ', ' || p.quan_cu, ww.ten_day_du, p.quan_cu, p.lat, p.lng, 1 - (p.nhung <=> v.q)
       from public.phuong_cu p join public.wards ww on ww.ten = p.phuong_moi, v
      where p.nhung is not null and (p_loai is null or 'phuong_cu' = any(p_loai))
      order by p.nhung <=> v.q limit 20)
    union all
    (select 'quan_cu', q.ten, q.ten, q.ten, null, q.ten, q.lat, q.lng, 1 - (q.nhung <=> v.q)
       from public.quan_cu q, v where q.nhung is not null and (p_loai is null or 'quan_cu' = any(p_loai))
      order by q.nhung <=> v.q limit 10)
    union all
    (select d.loai, d.id::text, d.ten, d.ten || coalesce(', ' || nullif(d.phuong, ''), ''), nullif(d.phuong, ''), d.quan_cu, d.lat, d.lng,
            1 - (d.nhung <=> v.q)
       from public.duong d, v where d.nhung is not null and (p_loai is null or d.loai = any(p_loai))
      order by d.nhung <=> v.q limit 40)
    union all
    (select 'du_an', pr.id::text, pr.name, pr.name, pr.ward, pr.district, pr.lat::double precision, pr.lng::double precision,
            1 - (pr.nhung <=> v.q)
       from public.projects pr, v where pr.nhung is not null and (p_loai is null or 'du_an' = any(p_loai))
      order by pr.nhung <=> v.q limit 20)
  )
  select u.loai, u.khoa, u.ten, u.ten_day_du, u.phuong, u.quan_cu, u.lat, u.lng, u.do_gan, k.cach_m,
         u.do_gan - coalesce(least(k.cach_m / 1000.0 * 0.01, 0.2), 0) as diem
    from ung u
    -- khoang_cach_m có sẵn trả ~10.000 km (không phải NULL) khi thiếu toạ độ — chặn trước.
    cross join lateral (select case when p_lat is null or p_lng is null or u.lat is null or u.lng is null then null
                                    else public.khoang_cach_m(p_lat, p_lng, u.lat, u.lng) end as cach_m) k
   order by diem desc
   limit greatest(1, least(coalesce(p_limit, 5), 30));
$$;
comment on function public.tim_dia_danh_theo_nghia(double precision[], text[], double precision, double precision, integer) is
  'Địa danh (phường mới / cũ, quận cũ, đường, đường số, dự án) gần nghĩa nhất với vector câu khách, trừ điểm theo khoảng cách tới điểm neo. Kết quả là ỨNG VIÊN — bot đối chiếu vị trí đã biết rồi mới sửa, không thì hỏi.';
revoke execute on function public.tim_dia_danh_theo_nghia(double precision[], text[], double precision, double precision, integer) from public, anon, authenticated;
grant execute on function public.tim_dia_danh_theo_nghia(double precision[], text[], double precision, double precision, integer) to service_role;

-- ── Tìm theo vị trí ───────────────────────────────────────────────────────
-- Đường / đường số / hẻm / dự án quanh một điểm (lọc hộp bao trước rồi mới tính haversine).
create or replace function public.dia_danh_gan(
  p_lat double precision, p_lng double precision, p_ban_kinh_m double precision default 1000,
  p_loai text[] default array['duong', 'so'], p_limit integer default 20)
returns table (loai text, ten text, phuong text, quan_cu text, lat double precision, lng double precision, cach_m double precision)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with k as (select greatest(50, least(coalesce(p_ban_kinh_m, 1000), 10000)) as r),
  ung as (
    select d.loai, d.ten, nullif(d.phuong, '') as phuong, d.quan_cu, d.lat, d.lng
      from public.duong d, k
     where d.lat between p_lat - k.r / 111000.0 and p_lat + k.r / 111000.0
       and d.lng between p_lng - k.r / 109000.0 and p_lng + k.r / 109000.0
       and (p_loai is null or d.loai = any(p_loai))
    union all
    select 'du_an', pr.name, pr.ward, pr.district, pr.lat::double precision, pr.lng::double precision
      from public.projects pr, k
     where (p_loai is null or 'du_an' = any(p_loai)) and pr.lat is not null
       and pr.lat between p_lat - k.r / 111000.0 and p_lat + k.r / 111000.0
       and pr.lng between p_lng - k.r / 109000.0 and p_lng + k.r / 109000.0
  )
  select u.loai, u.ten, u.phuong, u.quan_cu, u.lat, u.lng, public.khoang_cach_m(p_lat, p_lng, u.lat, u.lng) as cach_m
    from ung u, k
   where public.khoang_cach_m(p_lat, p_lng, u.lat, u.lng) <= k.r
   order by cach_m
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
comment on function public.dia_danh_gan(double precision, double precision, double precision, text[], integer) is
  'Đường / đường số / hẻm / dự án trong bán kính quanh một toạ độ, gần trước.';
revoke execute on function public.dia_danh_gan(double precision, double precision, double precision, text[], integer) from public, anon, authenticated;
grant execute on function public.dia_danh_gan(double precision, double precision, double precision, text[], integer) to service_role;

-- "Đường nào gần đường nào": các đường cách con đường `p_ten` (trong phường `p_phuong` nếu biết) không quá bán kính.
create or replace function public.duong_gan_duong(
  p_ten text, p_phuong text default null, p_ban_kinh_m double precision default 1500, p_limit integer default 20)
returns table (goc_phuong text, ten text, loai text, phuong text, quan_cu text, cach_m double precision)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with goc as (
    select d.phuong, d.lat, d.lng from public.duong d
     where d.ten_khong_dau = public.bo_dau(regexp_replace(btrim(coalesce(p_ten, '')), '\s+', ' ', 'g'))
       and d.lat is not null and (p_phuong is null or d.phuong = p_phuong)
     limit 20
  )
  select distinct on (g.phuong, n.ten, n.phuong) g.phuong, n.ten, n.loai, n.phuong, n.quan_cu, n.cach_m
    from goc g
    cross join lateral public.dia_danh_gan(g.lat, g.lng, p_ban_kinh_m, array['duong', 'so'], 60) n
   where public.bo_dau(n.ten) <> public.bo_dau(coalesce(p_ten, ''))
   order by g.phuong, n.ten, n.phuong, n.cach_m
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
comment on function public.duong_gan_duong(text, text, double precision, integer) is
  'Đường nào gần đường nào: các đường cách con đường p_ten (theo toạ độ tâm) không quá bán kính.';
revoke execute on function public.duong_gan_duong(text, text, double precision, integer) from public, anon, authenticated;
grant execute on function public.duong_gan_duong(text, text, double precision, integer) to service_role;

-- Khách nói HAI con đường ("hẻm Lê Văn Sỹ gần Trần Huy Liệu", "góc Nguyễn Trãi – Trần Hưng Đạo"): phường mới nào có cả
-- hai con đường mà tâm cách nhau không quá bán kính. Đường có ở nhiều phường thì câu này thu hẹp về một, hai phường.
create or replace function public.phuong_giao_hai_duong(p_duong1 text, p_duong2 text, p_ban_kinh_m double precision default 1200)
returns table (phuong text, quan_cu text, cach_m double precision)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.phuong, a.quan_cu, min(public.khoang_cach_m(a.lat, a.lng, b.lat, b.lng)) as cach_m
    from public.duong a
    join public.duong b on b.ten_khong_dau = public.bo_dau(regexp_replace(btrim(coalesce(p_duong2, '')), '\s+', ' ', 'g'))
   where a.ten_khong_dau = public.bo_dau(regexp_replace(btrim(coalesce(p_duong1, '')), '\s+', ' ', 'g'))
     and a.phuong <> '' and a.lat is not null and b.lat is not null
     and public.khoang_cach_m(a.lat, a.lng, b.lat, b.lng) <= greatest(100, least(coalesce(p_ban_kinh_m, 1200), 5000))
   group by a.phuong, a.quan_cu
   order by cach_m
   limit 5;
$$;
comment on function public.phuong_giao_hai_duong(text, text, double precision) is
  'Phường mới có con đường 1 nằm gần con đường 2 (tâm cách nhau ≤ bán kính) — thu hẹp phường khi khách nhắc hai con đường.';
revoke execute on function public.phuong_giao_hai_duong(text, text, double precision) from public, anon, authenticated;
grant execute on function public.phuong_giao_hai_duong(text, text, double precision) to service_role;

-- Hẻm theo SỐ + đường mẹ ("137/28" + "Đường số 59"): thử hẻm nhỏ nhất trước rồi lùi ra hẻm lớn (p_cap_hem = các cấp
-- từ lớn tới nhỏ, như tachSoNhaHem().capHem). Trả phường + toạ độ của hẻm khớp.
create or replace function public.tim_hem(p_cap_hem text[], p_duong_me text, p_phuong text default null)
returns table (ten text, so_hem text, phuong text, quan_cu text, lat double precision, lng double precision)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.ten, d.so_hem, nullif(d.phuong, ''), d.quan_cu, d.lat, d.lng
    from public.duong d
    join unnest(p_cap_hem) with ordinality c(so, thu_tu) on upper(d.so_hem) = upper(c.so)
   where d.loai = 'hem'
     and public.bo_dau(coalesce(d.duong_me, '')) = public.bo_dau(regexp_replace(btrim(coalesce(p_duong_me, '')), '^(?:đường|duong)\s+(?![Ss]ố|so\s)', '', 'i'))
     and (p_phuong is null or d.phuong = p_phuong)
   order by c.thu_tu desc
   limit 10;
$$;
comment on function public.tim_hem(text[], text, text) is
  'Hẻm theo số (các cấp, hẻm nhỏ nhất trước) + đường mẹ → phường, quận cũ, toạ độ. Không khớp → rỗng.';
revoke execute on function public.tim_hem(text[], text, text) from public, anon, authenticated;
grant execute on function public.tim_hem(text[], text, text) to service_role;

-- tim_duong (FR-212) — khớp TÊN đường: bỏ hàng hẻm (nay có trong bảng) khỏi ứng viên; phần còn lại giữ nguyên.
create or replace function public.tim_duong(p_ten text, p_quan text default null, p_toi_da integer default 2)
returns table (ten text, khoang_cach integer, quan_cu text[], phuong text[], tinh text[])
language sql
stable
set search_path = public, extensions
as $$
  with q as (
    select public.bo_dau(regexp_replace(btrim(coalesce(p_ten, '')), '\s+', ' ', 'g')) as k
  ), c as (
    select d.ten, d.quan_cu, d.phuong, d.tinh,
           levenshtein_less_equal(d.ten_khong_dau, q.k, greatest(coalesce(p_toi_da, 0), 0)) as kc
      from public.duong d, q
     where length(q.k) between 4 and 200
       and d.loai <> 'hem'
       and abs(length(d.ten_khong_dau) - length(q.k)) <= greatest(coalesce(p_toi_da, 0), 0)
  )
  select c.ten,
         min(c.kc)::integer,
         array_remove(array_agg(distinct c.quan_cu), null),
         array_remove(array_agg(distinct c.phuong), ''),
         array_agg(distinct c.tinh)
    from c
   where c.kc <= greatest(coalesce(p_toi_da, 0), 0)
   group by c.ten
   order by min(c.kc),
            (p_quan is not null and p_quan = any(array_remove(array_agg(distinct c.quan_cu), null))) desc,
            c.ten
   limit 8;
$$;

select cron.schedule('nhung-dia-danh-tick', '1-59/2 * * * *', 'select public.nhung_dia_danh_tick()');
