-- 20260922b — `boc_ten_duong()` bỏ SỐ NHÀ TRẦN đầu chuỗi (22/09/2026, bắn thật sau deploy #182).
--
-- Vì sao. `chonViTri` nay giữ số nhà trong vi_tri ("12 Trần Hưng Đạo"); trigger `trg_vi_tri_vao_cot`
-- gọi hàm này để lấy tên đường vào cột `street`, nhưng hàm chỉ bỏ số khi đứng sau "hẻm/đường",
-- nên `street` = "12 Trần Hưng Đạo" (lỗi có sẵn với "7 Hồng Bàng", nay mới lộ). Thêm MỘT lớp
-- regexp_replace bỏ "số 7 ", "12 ", "123/4 ", "12a " ở đầu — trừ khi sau số là "tháng" ("3 Tháng 2").
-- Bản TS `tenDuong` (geocode.ts) đã bỏ số nhà trần từ trước; hai bên nay cùng một kết quả.

CREATE OR REPLACE FUNCTION public.boc_ten_duong(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select nullif(btrim(
           -- 14/09/2026 (bắn 14 tin bán): "đường Lạc Long Quân p5", "hxh Nguyễn Kiệm Phú Nhuận" —
           -- phường/quận viết liền sau tên đường (không dấu phẩy) từng dính vào cột street.
           -- 15/09/2026 (bắn thật N1): "mặt tiền Nguyễn Chí Thanh" / "mt X" — bỏ chữ mặt tiền.
           regexp_replace(regexp_replace(regexp_replace(
             regexp_replace(
               regexp_replace(seg,
                 '^(?:hẻm|hem|hxh|ngõ|ngo|kiệt|kiet)(?:\s+|(?=\d))(?:(?:xe\s*hơi|xe\s*hoi|xe\s*tải|xe\s*tai|xe\s*máy|xe\s*may|ba\s*gác|ba\s*gac|thông|thong|cụt|cut|nhựa|nhua|bê\s*tông|be\s*tong|rộng|rong|lớn|lon|nhỏ|nho|xh)(?![[:alpha:]])\s*|[0-9]+(?:[.,][0-9]+)?\s*m(?![[:alpha:]])\s*|[0-9]+[a-z]?(?:/[0-9]+[a-z]?)*(?![[:alpha:]0-9])\s*)*',
                 '', 'i'),
               '^(?:đường|duong|phố|pho|đ\.|đ |mặt tiền|mat tien|mt(?![[:alpha:]]))\s*', '', 'i'),
             '^(?:(?:nhựa|nhua|bê\s*tông|be\s*tong|rộng|rong|lớn|lon|nhỏ|nho)(?![[:alpha:]])\s*|[0-9]+(?:[.,][0-9]+)?\s*m(?![[:alpha:]])\s*)+',
             '', 'i'),
             -- 22/09/2026 (bắn thật sau deploy #182): số nhà TRẦN đầu chuỗi ("12 Trần Hưng Đạo", "số 7 Hồng Bàng",
             -- "123/4 An Dương Vương") từng ở lại trong `street` — trước chỉ bỏ số khi đứng sau hẻm/đường.
             -- Giữ "3 Tháng 2", "30 Tháng 4" (số là một phần tên đường).
             '^(?:(?:số|so)\s*)?[0-9]+[a-z]?(?:/[0-9]+[a-z]?)*\s+(?!(?:tháng|thang)(?![[:alpha:]]))',
             '', 'i'),
             '\s+(?:(?:phường|phuong|p\.?)\s*\d{1,2}|(?:quận|quan|q\.?)\s*\d{1,2}|phú nhuận|phu nhuan|tân bình|tan binh|bình thạnh|binh thanh|gò vấp|go vap|tân phú|tan phu|bình tân|binh tan|thủ đức|thu duc|nhà bè|nha be|bình chánh|binh chanh|hóc môn|hoc mon|củ chi|cu chi)(?![[:alpha:]]).*$',
             '', 'i')), '')
  from (
    select s as seg
    from unnest(string_to_array(coalesce(p, ''), ',')) with ordinality as t(s, i)
    where btrim(s) !~* '^(?:số|so)?\s*\d+[a-z]?(?:/\d+[a-z]?)*$'
      and btrim(s) !~* '^(?:hẻm|hem|hxh)\s*[\d/]+\s*$'
      and btrim(s) !~* '^(?:dự án|du an|chung cư|cc |toà|tòa|toa|khu|kdc|cư xá|cu xa)'
      and btrim(s) !~* '^(?:phường|phuong|p\.|p\d|quận|quan|q\.|q\d|tp|thành phố|hồ chí minh|ho chi minh|việt nam)'
      and btrim(s) <> ''
    order by i limit 1
  ) x
$function$;
