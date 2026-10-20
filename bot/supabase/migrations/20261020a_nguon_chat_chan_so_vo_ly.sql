-- 20261020a — đánh giá DB 20/10/2026 (docs/07 SRS-5.1zzzzzzz83).
-- (1) Cột `listings.source` mặc định 'import_excel' mà lõi Python không ghi → mọi tin từ chat Zalo mang nhãn nhập Excel. Lõi nay
--     ghi 'chat_zalo' khi tạo tin; sửa các dòng cũ đến từ chat (tin chat luôn có `can_chu_duyet` = true — chỉ chat mới bật cờ này).
-- (2) Giá / diện tích không có chốt chặn số vô lý (≤ 0, ≥ 10 nghìn tỷ, ≥ 1.000 ha). Không dùng CHECK cứng: một con số hỏng sẽ làm
--     CẢ dòng tin bị từ chối (khách mất tin). Theo khuôn cột phường (CLAUDE.md §6, "DB chỉ CHẶN lần cuối"): để trống ô đó + sổ lỗi.
--     Tên trigger xếp sau `trg_listings_price_vnd` / `trg_y_listings_boc_thong_so` và trước `trg_zz_listings_dang_tin` (Postgres bắn
--     BEFORE theo thứ tự chữ cái) — số bị để trống thì tin không đủ điều kiện lên web.

update public.listings set source = 'chat_zalo' where source = 'import_excel' and can_chu_duyet;

comment on column public.listings.source is
  '[RỔ HÀNG] Nguồn tin: import_excel (mặc định — nhập Excel / admin), chat_zalo (lõi Python tạo từ chat Zalo, 20261020a).';

create or replace function public.listings_chan_so_vo_ly()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.price_vnd is not null and (new.price_vnd <= 0 or new.price_vnd >= 10000000000000) then
    perform public.log_loi('listings chan so', format('tin %s: giá %s ngoài khoảng hợp lệ — để trống', coalesce(new.code, '?'), new.price_vnd));
    new.price_vnd := null;
  end if;
  if new.area_m2 is not null and (new.area_m2 <= 0 or new.area_m2 >= 10000000) then
    perform public.log_loi('listings chan so', format('tin %s: diện tích %s ngoài khoảng hợp lệ — để trống', coalesce(new.code, '?'), new.area_m2));
    new.area_m2 := null;
  end if;
  return new;
end
$function$;

comment on function public.listings_chan_so_vo_ly() is
  'Chặn lần cuối giá / diện tích vô lý trên listings: để trống ô + log_loi, không từ chối cả dòng (20261020a, SRS-5.1zzzzzzz83).';

drop trigger if exists trg_zy_listings_chan_so on public.listings;
create trigger trg_zy_listings_chan_so before insert or update on public.listings
  for each row execute function public.listings_chan_so_vo_ly();
