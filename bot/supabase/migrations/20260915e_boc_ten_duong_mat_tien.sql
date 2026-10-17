-- 20260915e — `boc_ten_duong()` bỏ tiền tố "mặt tiền / mat tien / mt" (15/09/2026, bắn thật N1).
--
-- Vì sao. `bocViTriRao` (TS) nay nhận "mặt tiền Nguyễn Chí Thanh" là địa chỉ và ghi
-- vi_tri; trigger `trg_vi_tri_vao_cot` gọi hàm này để lấy tên đường vào cột `street`,
-- nhưng hàm chỉ bỏ "đường/phố/hẻm…" nên `street` thành "mặt tiền Nguyễn Chí Thanh".
-- Thân hàm giữ nguyên, chỉ thêm ba lựa chọn vào regexp tiền tố thứ hai.

create or replace function public.boc_ten_duong(p text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select nullif(btrim(
           -- 14/09/2026 (bắn 14 tin bán): "đường Lạc Long Quân p5", "hxh Nguyễn Kiệm Phú Nhuận" —
           -- phường/quận viết liền sau tên đường (không dấu phẩy) từng dính vào cột street.
           -- 15/09/2026 (bắn thật N1): "mặt tiền Nguyễn Chí Thanh" / "mt X" — bỏ chữ mặt tiền.
           regexp_replace(regexp_replace(
             regexp_replace(
               regexp_replace(seg,
                 '^(?:hẻm|hem|hxh|ngõ|ngo|kiệt|kiet)(?:\s+|(?=\d))(?:(?:xe\s*hơi|xe\s*hoi|xe\s*tải|xe\s*tai|xe\s*máy|xe\s*may|ba\s*gác|ba\s*gac|thông|thong|cụt|cut|nhựa|nhua|bê\s*tông|be\s*tong|rộng|rong|lớn|lon|nhỏ|nho|xh)(?![[:alpha:]])\s*|[0-9]+(?:[.,][0-9]+)?\s*m(?![[:alpha:]])\s*|[0-9]+[a-z]?(?:/[0-9]+[a-z]?)*(?![[:alpha:]0-9])\s*)*',
                 '', 'i'),
               '^(?:đường|duong|phố|pho|đ\.|đ |mặt tiền|mat tien|mt(?![[:alpha:]]))\s*', '', 'i'),
             '^(?:(?:nhựa|nhua|bê\s*tông|be\s*tong|rộng|rong|lớn|lon|nhỏ|nho)(?![[:alpha:]])\s*|[0-9]+(?:[.,][0-9]+)?\s*m(?![[:alpha:]])\s*)+',
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

-- Sửa lại cột street của hai tin thử vừa mở với "mặt tiền X" (tin thử, không phải rổ hàng thật).
update public.listings set street = public.boc_ten_duong(location_raw)
 where location_raw ~* '^(?:mặt tiền|mat tien|mt)\s' and street ~* '^(?:mặt tiền|mat tien|mt)\s';
