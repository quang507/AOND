-- 20261010b — cột street không nhận cụm "căn hộ <tên dự án>" (SRS-5.1zzzzt).
--
-- Bắn production 10/10/2026 (thu-thuong16): khách trả lời câu địa chỉ "căn hộ sunrise city quận 7" → location_raw
-- "căn hộ sunrise city" → trigger listings_boc_thong_so suy street = boc_ten_duong(location_raw) = "căn hộ sunrise city".
-- boc_ten_duong đã loại cụm mở đầu bằng "dự án / chung cư / toà / khu…" (không phải tên đường) nhưng chưa có "căn hộ".
-- Thân hàm chép NGUYÊN từ schema.sql (bản DB), chỉ thêm `căn hộ|can ho|chcc` vào bộ lọc cụm không phải tên đường.

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
               -- 20261003b: số nhà ĐỨNG TRƯỚC chữ hẻm / đường ("88 hẻm 6m Tân Kỳ Tân Quý", "156/12/4 đường 59") bỏ TRƯỚC, để bước gọt chạy được.
               regexp_replace(regexp_replace(seg, '^(?:(?:số|so)\s*)?[0-9]+[a-z]?(?:/[0-9]+[a-z]?)*\s+(?=(?:hẻm|hem|hxh|ngõ|ngo|kiệt|kiet|đường|duong|phố|pho)(?![[:alpha:]]))', '', 'i'),
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
      and btrim(s) !~* '^(?:dự án|du an|chung cư|căn hộ|can ho|chcc|cc |toà|tòa|toa|khu|kdc|cư xá|cu xa)'
      and btrim(s) !~* '^(?:phường|phuong|p\.|p\d|quận|quan|q\.|q\d|tp|thành phố|hồ chí minh|ho chi minh|việt nam)'
      and btrim(s) <> ''
    order by i limit 1
  ) x
$function$
;
