-- 20260828e — Ghim search_path cho ba hàm mới + dọn bảng test bỏ quên (FR-164)
--
-- Security advisor sau khi áp 20260828b báo hai thứ, cả hai đều do đợt này gây
-- ra, nên chữa ngay chứ không để lẫn vào đống cảnh báo cũ:
--
-- (1) `bac_nguon`, `chuan_hoa_phuong`, `listing_du_dang_tin` chưa ghim
--     `search_path`. Chúng được gọi TỪ BÊN TRONG `listing_facts_sync_cols` và
--     `listings_quyet_dinh_dang_tin` — hai hàm `security definer` — nên một
--     `search_path` do người gọi đặt có thể trỏ `bo_dau`/`parse_vnd` sang hàm
--     giả trong schema khác. Cùng luật đã áp cho các hàm guard ở phần (10)
--     của 20260828a.
--
-- (2) Bảng `public.ts5_kq` là bảng tạm của đợt kiểm TS-TOANVEN, tạo bằng
--     `create table` (không phải `create temp table`) nên nó ở lại thật, nằm
--     trong schema `public` mà PostgREST phơi ra, lại không bật RLS — advisor
--     xếp mức ERROR. Không có dữ liệu thật trong đó, nhưng rác test không được
--     phép sống trong schema production.

alter function public.bac_nguon(text)            set search_path to 'public';
alter function public.chuan_hoa_phuong(text)     set search_path to 'public';
alter function public.listing_du_dang_tin(bigint, numeric, text)
                                                  set search_path to 'public';

drop table if exists public.ts5_kq;
drop table if exists public.ts3_kq;
