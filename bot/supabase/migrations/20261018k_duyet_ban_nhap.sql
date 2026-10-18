-- 20261018k — tin tạo từ chat chỉ lên web khi chủ nhà ĐỒNG Ý bản nháp (chủ dự án 18/10/2026: thêm nhánh "không đồng ý", ẩn tin
-- khỏi web cho tới khi khách duyệt; docs/07 SRS-5.1zzzzzzz47).
-- Lõi Python nay đặt `can_chu_duyet = true` lúc tạo tin từ chat và ghi `chu_duyet_at` khi lượt AI đọc ra khách đồng ý (xoá khi
-- khách không đồng ý). Bỏ điều kiện `diem_tin ≥ 70` của 20260907h (giả định BA, FR-177 d): `diem_tin` chấm theo `listing_facts`
-- mà lõi Python không ghi (tin thật 18/10 đủ giá + diện tích vẫn chỉ 42 điểm), nên giữ nó là tin đã duyệt KHÔNG BAO GIỜ lên.
-- "Đủ để ra bản nháp" giờ do lõi Python quyết (ngưỡng 0,70 + ô bắt buộc theo loại, schema.blocking_fields) — một chủ, một chỗ.
create or replace function public.listings_quyet_dinh_dang_tin()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare v_du boolean := public.listing_du_dang_tin(new.price_vnd, new.area_m2, new.ward);
begin
  if v_du and new.can_chu_duyet then
    v_du := new.chu_duyet_at is not null;
  end if;
  if v_du and new.status = 'cho_thong_tin' then
    new.status := 'dang_ban';
  elsif not v_du and new.status = 'dang_ban' then
    new.status := 'cho_thong_tin';
  end if;
  return new;
end $function$;

comment on column public.listings.can_chu_duyet is
  'true = tin tạo từ chat (lõi Python đặt lúc tạo): chỉ lên kệ khi đủ giá + diện tích + phường VÀ chu_duyet_at có (20261018k bỏ điều kiện diem_tin ≥ 70). false (Excel, admin) = luật giá + diện tích + phường.';
comment on column public.listings.chu_duyet_at is
  'Lúc chủ nhà đồng ý bản nháp tin (lượt AI đọc ý, code kiểm trích dẫn — SRS-5.1zzzzzzz47); null khi khách không đồng ý.';
