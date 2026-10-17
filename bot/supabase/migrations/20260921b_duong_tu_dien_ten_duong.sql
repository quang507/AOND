-- 20260921b — FR-212: bảng `duong` — TỪ ĐIỂN TÊN ĐƯỜNG của địa bàn (TP.HCM mới gồm
-- Bình Dương + Bà Rịa – Vũng Tàu cũ; Tỉnh Tây Ninh mới gồm Long An cũ; TP. Đồng Nai
-- mới) + hàm tra gần `tim_duong()`. Chủ dự án 21/09/2026: "giờ khách viết tên đường
-- ko dấu hoặc sai 1 vài kí tự nhận ra dc ko" → "ok làm bảng duong đi, hẻm bỏ".
--
-- VÌ SAO CẦN: AI đọc tên đường có dấu từ chữ không dấu (FR-208 h) là ĐOÁN — "Pham The
-- Hien" ra "Phạm Thế Hiển" đúng vì model biết đường đó, nhưng gõ sai 1–2 ký tự
-- ("Pham The Hier") thì model bịa hoặc giữ nguyên chữ sai. Từ điển cho hai việc:
--   · khớp ĐÚNG sau bỏ dấu → viết lại đúng dấu theo từ điển, không hỏi (cùng chữ cái);
--   · khớp GẦN (Levenshtein ≤ 2 trên chữ bỏ dấu, một ứng viên) → HỎI XÁC NHẬN rồi mới
--     ghi (RSK-03, cùng cách FR-209 hỏi phường). Không khớp → giữ nguyên chữ khách gõ.
--
-- NGUỒN: OpenStreetMap qua Overpass API (dữ liệu mở, ODbL) — `way["highway"]["name"]`
-- trong đa giác từng phường/xã MỚI (`admin_level=6`, tên khớp `wards.ten_day_du`), nên
-- mỗi tên đường có phường mới + quận cũ (qua `wards`). Tây Ninh và Đồng Nai tra theo
-- đa giác tỉnh (`admin_level=4`), chưa gán phường. Lượt nạp đầu 21/09/2026 chạy NGAY
-- TRONG DB bằng pg_net (`net.http_get` → `net._http_response`) vì máy làm việc không ra
-- được Overpass; lần sau chạy `node scripts/nap-duong.mjs` (cùng luật lọc).
--
-- LỌC (cùng một luật ở SQL nạp lần đầu và ở scripts/nap-duong.mjs):
--   · bỏ tiền tố "Đường "/"Phố " khi sau nó là tên riêng viết hoa ("Đường Lý Thường Kiệt"
--     → "Lý Thường Kiệt"); giữ "Đường tỉnh 824", "Quốc lộ 50", "Xa lộ Hà Nội";
--   · BỎ hẻm/ngõ/kiệt/nhánh/lối/cầu (chủ dự án: "hẻm bỏ" — 24.765 tên hẻm chỉ gây nhiễu,
--     tên đường mẹ đã có); BỎ đường số ("Số 7", "N1", "D2" — trùng khắp thành phố,
--     `duongTraDuoc()` phía bot cũng không tra loại này); bỏ tên dưới 3 hay trên 60 ký tự.
--
-- `ten_khong_dau` sinh từ `bo_dau()` (đã có, IMMUTABLE) — cùng phép bỏ dấu với
-- `boc_thong_so()`; phía TS dùng `boDau()` (NFD) — hai bên ra cùng chuỗi với chữ Việt.
--
-- Bảng CHỈ service_role đọc (bot tra trong chat-reply qua `tim_duong`). Repo public +
-- "view/bảng mới mặc định LỘ" (alter default privileges) → revoke TRƯỚC.
-- `xuat_schema()` KHÔNG xuất DỮ LIỆU: dựng lại từ số không phải chạy
-- `node scripts/nap-duong.mjs` (bot/README.md §Dựng lại từ số không).

create extension if not exists fuzzystrmatch with schema extensions;

create table if not exists public.duong (
  id            uuid primary key default gen_random_uuid(),
  ten           text not null check (length(ten) between 2 and 80),
  ten_khong_dau text generated always as (public.bo_dau(ten)) stored,
  tinh          text not null check (tinh in ('TP.HCM', 'Tây Ninh', 'Đồng Nai')),
  tinh_cu       text check (tinh_cu in ('TP.HCM', 'Bình Dương', 'Bà Rịa – Vũng Tàu')),
  phuong        text not null default '',
  quan_cu       text,
  nguon         text not null,
  created_at    timestamptz not null default now(),
  constraint duong_ten_tinh_phuong_key unique (ten, tinh, phuong)
);
create index if not exists duong_ten_khong_dau_idx on public.duong (ten_khong_dau);

comment on table  public.duong is '[RỔ HÀNG] FR-212: từ điển TÊN ĐƯỜNG (không hẻm, không đường số) của TP.HCM mới, Tỉnh Tây Ninh mới, TP. Đồng Nai mới — nguồn OpenStreetMap (Overpass) theo từng phường mới. Bot tra qua tim_duong(): khớp đúng sau bỏ dấu → viết đúng dấu; gõ sai 1–2 ký tự → hỏi xác nhận rồi mới ghi. Chỉ service_role đọc. Nạp lại: node scripts/nap-duong.mjs.';
comment on column public.duong.ten is 'Tên đường CÓ DẤU, không tiền tố "Đường" ("Phạm Thế Hiển"; giữ "Quốc lộ 50", "Đường tỉnh 824").';
comment on column public.duong.ten_khong_dau is 'bo_dau(ten) — khoá tra: khách gõ "pham the hien" khớp đúng, Levenshtein ≤ 2 khớp gần.';
comment on column public.duong.tinh is 'Tỉnh MỚI (sau 01/07/2025): TP.HCM | Tây Ninh | Đồng Nai.';
comment on column public.duong.tinh_cu is 'Tỉnh CŨ khi biết: TP.HCM | Bình Dương | Bà Rịa – Vũng Tàu (lấy từ wards.tinh_cu); null khi chưa gán phường.';
comment on column public.duong.phuong is 'Phường/xã MỚI đủ tiền tố (wards.ten_day_du) — đa giác OSM chứa đoạn đường; '''' = chưa gán (tra theo tỉnh).';
comment on column public.duong.quan_cu is 'Quận/huyện CŨ dân gọi (wards.quan_cu, chuỗi bocQuan/mã tin) — null khi chưa gán phường.';
comment on column public.duong.nguon is 'Nguồn dòng này: "OSM Overpass <ngày>" + cách lấy.';

alter table public.duong enable row level security;
revoke all on table public.duong from public, anon, authenticated;
grant select on table public.duong to service_role;

-- Tra tên đường: khớp đúng (khoang_cach 0) và khớp gần (≤ p_toi_da phép sửa) trên chữ bỏ
-- dấu; mỗi tên một dòng, gom phường/quận/tỉnh của mọi đoạn mang tên đó. Ưu tiên khoảng
-- cách nhỏ rồi tới tên có quận trùng `p_quan` (tin đã biết quận). Chuỗi tra dưới 4 ký tự
-- không tra (quá ngắn, khớp gần thành đoán mò).
create or replace function public.tim_duong(p_ten text, p_quan text default null, p_toi_da integer default 2)
returns table(ten text, khoang_cach integer, quan_cu text[], phuong text[], tinh text[])
language sql
stable
set search_path = 'public', 'extensions'
as $$
  with q as (
    select public.bo_dau(regexp_replace(btrim(coalesce(p_ten, '')), '\s+', ' ', 'g')) as k
  ), c as (
    select d.ten, d.quan_cu, d.phuong, d.tinh,
           levenshtein_less_equal(d.ten_khong_dau, q.k, greatest(coalesce(p_toi_da, 0), 0)) as kc
      from public.duong d, q
     where length(q.k) between 4 and 200
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
comment on function public.tim_duong(text, text, integer) is 'FR-212: tra tên đường trong từ điển `duong` — khớp đúng và khớp gần (Levenshtein ≤ p_toi_da trên chữ bỏ dấu), gom phường/quận/tỉnh theo tên; bot chat-reply gọi (service_role).';
revoke all on function public.tim_duong(text, text, integer) from public, anon, authenticated;
grant execute on function public.tim_duong(text, text, integer) to service_role;
