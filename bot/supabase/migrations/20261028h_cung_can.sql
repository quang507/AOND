-- 20261028h_cung_can — SRS-5.1zzzzzzz241 (chủ dự án 28/10/2026, OPEN-59 phương án a): một căn vừa BÁN vừa CHO THUÊ = HAI tin (một bán, một
-- thuê), hai giá riêng, gắn chung căn. `cung_can_id` của tin trỏ sang tin kia (lõi Python ghi khi khách nói căn này bán hay thuê đều được).
-- Liên kết mềm, không khoá ngoại: hai tin tạo ở hai lượt khác nhau, tin kia có thể chưa có dòng lúc ghi; xoá tin kia thì trang tin chỉ
-- thôi hiện dòng "Căn này cũng …" (truy vấn lọc theo trạng thái đang hiện).
alter table public.listings add column if not exists cung_can_id uuid;
create index if not exists listings_cung_can_id_idx on public.listings (cung_can_id) where cung_can_id is not null;
comment on column public.listings.cung_can_id is
  'Tin cùng căn ở loại giao dịch kia (bán ↔ cho thuê), OPEN-59 / SRS-5.1zzzzzzz241. Liên kết mềm, không khoá ngoại.';
