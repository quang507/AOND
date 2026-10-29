-- 20261029d_duong_chi_muc_ten — SRS-5.1zzzzzzz272: log lõi lặp "tim_duong lỗi: The read operation timed out" / "tim_dia_danh lỗi: …" (lõi chờ
-- rpc 5 giây, `dia_danh.TraDiaDanh.tu_cau_hinh`). Đo 29/10: `tim_duong('Mã Lò')` 30 ms … 1,4 s … 6,08 s tuỳ lúc — hàm quét CẢ bảng `duong`
-- (39 nghìn dòng, 78 MB vì mỗi dòng mang vector `nhung`) trên gói Free có ít bộ nhớ đệm và các lịch nhúng vector chạy 2 phút một lần.
-- Sửa: chỉ mục gọn chỉ các cột tên / quận / phường (không vector) cho dòng không phải hẻm; `tim_duong` lọc độ dài tên theo khoảng (dùng được
-- chỉ mục) thay cho abs(...) — cùng kết quả. Chữ ký hàm không đổi (lõi đang chạy dùng được ngay).
create index if not exists duong_ten_gon on public.duong (length(ten_khong_dau))
  include (ten_khong_dau, ten, loai, quan_cu, phuong, tinh)
  where loai <> 'hem';
comment on index public.duong_ten_gon is
  'SRS-5.1zzzzzzz272: tra tên đường (tim_duong / tim_dia_danh) không quét cả bảng duong (cột nhung làm bảng nặng 78 MB).';

CREATE OR REPLACE FUNCTION public.tim_duong(p_ten text, p_quan text DEFAULT NULL::text, p_toi_da integer DEFAULT 2)
 RETURNS TABLE(ten text, khoang_cach integer, quan_cu text[], phuong text[], tinh text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with q as (
    select public.bo_dau(regexp_replace(btrim(coalesce(p_ten, '')), '\s+', ' ', 'g')) as k,
           greatest(coalesce(p_toi_da, 0), 0) as n
  ), c as (
    select d.ten, d.quan_cu, d.phuong, d.tinh,
           levenshtein_less_equal(d.ten_khong_dau, (select k from q), (select n from q)) as kc
      from public.duong d
     where d.loai <> 'hem'
       and (select length(k) from q) between 4 and 200
       -- SRS-5.1zzzzzzz272: khoảng độ dài (dùng chỉ mục duong_ten_gon) thay cho abs(length(...) - length(k)) <= n — cùng tập dòng
       and length(d.ten_khong_dau) between (select length(k) - n from q) and (select length(k) + n from q)
  )
  select c.ten,
         min(c.kc)::integer,
         array_remove(array_agg(distinct c.quan_cu), null),
         array_remove(array_agg(distinct c.phuong), ''),
         array_agg(distinct c.tinh)
    from c
   where c.kc <= (select n from q)
   group by c.ten
   order by min(c.kc),
            (p_quan is not null and bool_or(public.cung_quan_cu(c.quan_cu, p_quan))) desc,
            c.ten
   limit 8;
$function$;

analyze public.duong;
