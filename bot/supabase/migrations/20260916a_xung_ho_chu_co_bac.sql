-- 20260916a — `sellers.xung_ho` nhận thêm chú / cô / bác; thêm `gioi_tinh`, `nhom_tuoi`.
--
-- VÌ SAO. Zalo thật 16/09/2026: chủ nhà nhắn "Chào cháu chú có căn nhà này cần
-- giao bán", bot đáp "Dạ em…" và gọi "anh/chị". Cột `xung_ho` (20260907d) chỉ
-- cho hai giá trị anh/chị — người xưng "chú" bị ép về "anh", bot không có cách
-- nào tự xưng "cháu". Chủ dự án: "câu đó phải bóc tách ra được là id zalo đang
-- rao bán - xưng chú - là nam lớn tuổi" (FR-176 c).
--
-- `gioi_tinh` / `nhom_tuoi` SUY từ cách gọi (chú → nam + lớn tuổi, cô → nữ + lớn
-- tuổi, bác → lớn tuổi, anh → nam, chị → nữ); bot ghi cùng lúc với `xung_ho`.
-- Không hỏi khách, không đoán từ tên. Dùng cho CRM / báo cáo, không quyết định gì.

alter table public.sellers drop constraint if exists sellers_xung_ho_check;
alter table public.sellers
  add constraint sellers_xung_ho_check
  check (xung_ho is null or xung_ho in ('anh', 'chị', 'chú', 'cô', 'bác'));

alter table public.sellers
  add column if not exists gioi_tinh text
    check (gioi_tinh is null or gioi_tinh in ('nam', 'nu')),
  add column if not exists nhom_tuoi text
    check (nhom_tuoi is null or nhom_tuoi in ('tre', 'lon_tuoi'));

comment on column public.sellers.xung_ho is
  'Cách chủ nhà dặn/tự xưng để bot gọi (anh/chị/chú/cô/bác). Chú/cô/bác → bot tự xưng "cháu". null = chưa biết, bot dùng "anh/chị". FR-176.';
comment on column public.sellers.gioi_tinh is
  'Giới tính SUY từ cách xưng hô (anh/chú → nam, chị/cô → nu; bác → null). Bot ghi cùng xung_ho, không hỏi khách. FR-176 c.';
comment on column public.sellers.nhom_tuoi is
  'Nhóm tuổi SUY từ cách xưng hô (anh/chị → tre, chú/cô/bác → lon_tuoi). Bot ghi cùng xung_ho. FR-176 c.';
