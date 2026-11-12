-- SRS-5.1zzzzzzz456 (13/11/2026) — LQC 4.3/4.4: giá chốt thật do CHỦ báo trong chat khi căn đã cọc / đã bán (bot hỏi một lần, ô riêng
-- `gia_chot` ở listing_noi_bo). `price_vnd` của deals giữ nguyên nghĩa = giá RAO lúc chốt; cột mới = giá chốt (đồng, qua parse_vnd).
-- Hai cột cạnh nhau cho ra mức chênh rao / chốt theo khu — dữ liệu riêng, không lên trang công khai.
alter table public.deals add column if not exists gia_chot_vnd bigint;
comment on column public.deals.gia_chot_vnd is 'Giá chốt thật chủ báo trong chat (SRS-5.1zzzzzzz456); price_vnd = giá rao lúc chốt.';
