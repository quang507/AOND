-- 20260924e — FR-185 d: thêm loại ảnh chủ nhà gửi.
--
-- Chủ dự án 24/09/2026 ("Thêm nhiều loại ảnh cho các trường hợp ảnh khác nữa hoặc ảnh ko liên quan thì nhận xét luôn
-- bảo à anh có gửi nhầm ảnh ko"): ảnh sân thượng từng bị xếp "mặt tiền" (chỉ có mat_tien / trong_nha / hem / so_do /
-- giay_to / khac) và bot nói "Em nhận được ảnh mặt tiền". Thêm phòng ngủ, bếp, WC, sân thượng (cả ban công / sân
-- vườn), view. Ảnh KHÔNG LIÊN QUAN tới nhà không vào kho nên không có loại riêng ở đây.
alter table public.listing_media drop constraint if exists listing_media_media_type_check;
alter table public.listing_media add constraint listing_media_media_type_check CHECK ((media_type = ANY (ARRAY[
  'mat_tien'::text, 'trong_nha'::text, 'phong_ngu'::text, 'bep'::text, 'wc'::text, 'san_thuong'::text, 'view'::text,
  'hem'::text, 'so_do'::text, 'giay_to'::text, 'khac'::text])));
