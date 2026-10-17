-- 20260828f — Chuẩn hoá `price_raw`/`ward` ở TẦNG CỘT, không ở từng cửa ghi (FR-164)
--
-- BỆNH phát hiện khi thử `admin_dang_tin` cuối đợt: form admin nhập
-- `ward='phường 8'`, `price_raw='7 tỷ nha em'` thì hai giá trị đó vào cột
-- NGUYÊN XI. Cửa fact thì có chuẩn hoá (`chuan_hoa_phuong`,
-- `chuan_hoa_gia_raw`), cửa admin thì không — nghĩa là cùng một cột đang có
-- HAI luật trình bày tuỳ theo ai ghi. Đúng cái "nhiều nhà chức trách" mà cả
-- FR-164 sinh ra để dẹp; vá riêng `admin_dang_tin` thì cửa thứ ba sau này lại
-- thủng tiếp.
--
-- CHỮA Ở CHỖ KHÔNG AI ĐI VÒNG ĐƯỢC: một trigger BEFORE trên chính `listings`.
-- Ghi bằng RPC, bằng form admin, bằng SQL tay hay bằng trigger fact thì cũng
-- một luật. Cùng chỗ mà `price_vnd` đã dẫn xuất (FR-163c) — giá trị trình bày
-- và giá trị tìm kiếm nay sinh ra từ cùng một chặng.
--
-- THỨ TỰ. Trigger cùng timing/sự kiện chạy theo THỨ TỰ TÊN, nên tên bắt đầu
-- bằng `trg_listings_chuan_hoa_cot` để đứng TRƯỚC `trg_listings_price_vnd`
-- ('c' < 'p'): `price_vnd` dẫn xuất từ `price_raw` ĐÃ gọt. Thực ra không đổi
-- kết quả — `chuan_hoa_gia_raw` chỉ nhận bản cắt khi `parse_vnd` giữ nguyên
-- con số — nhưng để thứ tự đọc xuôi theo đúng chặng của đường ống.
--
-- AN TOÀN VỚI DỮ LIỆU ĐANG CÓ (đếm trên bản live 28/08/2026):
--   * 173/173 giá trị `ward` đã đúng chuẩn, kể cả phường có TÊN CHỮ
--     ("Phường Nguyễn Cư Trinh") — hàm trả nguyên văn, không cắt gì.
--   * chỉ 9 dòng `price_raw` đổi, cả 9 là chuỗi RỖNG → NULL. Đó là 9 tin nháp
--     `cho_thong_tin`; `price_vnd` của chúng vốn đã NULL nên không tin nào đổi
--     trạng thái, và truy vấn kho phía người mua vốn loại cả '' lẫn NULL.
--   * Không backfill. Trigger chỉ bắn khi dòng được ghi lại — không khoá bảng,
--     không viết lại 173 dòng chỉ để đổi 9 chuỗi rỗng.

create or replace function public.listings_chuan_hoa_cot()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.price_raw := public.chuan_hoa_gia_raw(new.price_raw);
  new.ward      := public.chuan_hoa_phuong(new.ward);
  return new;
end;
$$;

comment on function public.listings_chuan_hoa_cot() is
  'FR-164: chuẩn hoá bản trình bày của price_raw và ward ngay tại cột, để mọi '
  'cửa ghi (fact, form admin, SQL tay) cho ra cùng một giá trị.';

drop trigger if exists trg_listings_chuan_hoa_cot on public.listings;
create trigger trg_listings_chuan_hoa_cot
before insert or update on public.listings
for each row execute function public.listings_chuan_hoa_cot();
