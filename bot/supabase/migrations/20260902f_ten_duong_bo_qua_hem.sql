-- 20260902f — FR-172: boc_ten_duong bỏ qua đoạn chỉ là "Hẻm xx/" (02/09/2026)
--
-- Bản 20260902e chọn ĐOẠN ĐẦU hợp lệ rồi mới gọt tiền tố "Hẻm xx/", nên
-- "Hẻm xx/, Đường Hồ Thành Biên, Phường 4" gọt xong còn rỗng → street NULL
-- (8/164 tin). Nay đoạn chỉ có "hẻm + số" bị loại ngay ở bước chọn, đoạn kế
-- ("Đường Hồ Thành Biên") mới là tên đường.
create or replace function public.boc_ten_duong(p text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(btrim(regexp_replace(regexp_replace(seg,
           '^(?:hẻm|hem|hxh)\s*[\d/]+\s*', '', 'i'),
           '^(?:đường|duong|phố|pho|đ\.|đ )\s*', '', 'i')), '')
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
$$;

update public.listings set street = public.boc_ten_duong(location_raw)
 where street is null and location_raw is not null;
