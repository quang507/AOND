-- FR-154: bóc giá tiền tiếng Việt ra số VND — bản chép tham chiếu của hàm đang
-- chạy trên Supabase (migration parse_vnd_slang_v2b).
--
-- Bản cũ chỉ hiểu "tỷ / triệu / tr". Câu rao thật ở Quận 5 nói bằng tiếng lóng:
-- "5 tỏi rưỡi", "12 củ", "5t5", "4ty". Mỗi dạng không đọc được là một tin nằm
-- ngoài mọi bộ lọc giá của web, vì bộ lọc đọc listings.price_vnd chứ không đọc
-- price_raw. price_raw vẫn giữ NGUYÊN VĂN người rao (FR-104 / văn phong người
-- bán); cột số chỉ là bản dịch máy đọc được nằm cạnh.
--
-- Hai cái bẫy đã đâm phải và đã có test:
--  1. "giá 5 tỷ 50m2" — regex lùi {1,3} từ "50" về "5" để né lookahead `m` rồi
--     đọc thành 5,5 tỷ. Phải cấm cả CHỮ SỐ lẫn `m` đứng ngay sau phần lẻ.
--  2. "1 trệt 2 lầu" — "tr" của "trệt". Ở Postgres `\M` là biên từ CÓ hiểu chữ
--     tiếng Việt nên chặn được; đừng bê logic này sang JavaScript, `\b` bên đó
--     chỉ biết ASCII và sẽ đọc "1 trệt" thành 1 triệu.
--
-- Cố ý KHÔNG quy "cây"/"lượng" vàng ra tiền: tỷ giá đổi mỗi ngày, ghi số vào
-- là bịa. Những tin đó để price_vnd NULL, web hiện nguyên văn price_raw.

create or replace function public.parse_vnd(p text)
returns bigint
language plpgsql
immutable
as $fn$
declare
  t    text;
  m    text[];
  v    numeric;
  ruoi boolean;
begin
  if p is null or btrim(p) = '' then return null; end if;
  t := lower(p);
  ruoi := t ~ 'rưỡi|rươi|ruoi';

  -- Gộp mọi cách nói đơn vị về MỘT từ khoá ASCII rồi mới bóc số.
  t := regexp_replace(t, 'tỏi|tỷ|tỉ|tị|tỹ', ' _ty ', 'g');
  t := regexp_replace(t, 'triệu|trieu|củ',  ' _trieu ', 'g');

  -- Viết tắt kẹp giữa hai chữ số ("6ty2", "5t5") — không bao giờ là từ thật.
  t := regexp_replace(t, '([0-9])\s*ty\s*([0-9])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*t\s*([0-9])',  '\1 _ty \2', 'g');
  -- "4ty" đứng cuối; "900tr", "15tr/th".
  t := regexp_replace(t, '([0-9])\s*ty\M',         '\1 _ty ',   'g');
  t := regexp_replace(t, '([0-9])\s*tr\M',         '\1 _trieu ', 'g');

  -- "5 tỷ 5" = 5,5 tỷ | "3 tỷ 200" = 3,2 tỷ.
  m := regexp_match(t, '([0-9]+)\s*_ty\s*([0-9]{1,3})(?![0-9.,]|\s*m)');
  if m is not null then
    return (m[1]::numeric * 1e9
            + case when length(m[2]) = 1
                   then m[2]::numeric * 1e8
                   else m[2]::numeric * 1e6 end)::bigint;
  end if;

  m := regexp_match(t, '([0-9]+[.,]?[0-9]*)\s*_ty');
  if m is not null then
    v := replace(m[1], ',', '.')::numeric * 1e9;
    if ruoi then v := v + 5e8; end if;
    return v::bigint;
  end if;

  m := regexp_match(t, '([0-9]+[.,]?[0-9]*)\s*_trieu');
  if m is not null then
    v := replace(m[1], ',', '.')::numeric * 1e6;
    if ruoi then v := v + 5e5; end if;
    return v::bigint;
  end if;

  return null;
exception when others then
  return null;
end
$fn$;

comment on function public.parse_vnd(text) is
  'FR-154: boc gia tien Viet ra bigint VND — ho tro tieng long toi/cu/ruoi/5t5/4ty ngoai ty/trieu/tr.';

-- Bộ test đã chạy trên bản live (26 ca, đúng hết). Chạy lại sau mỗi lần sửa:
--   select s, parse_vnd(s) from unnest(array[
--     '5 tỏi rưỡi','5 tỏi','5 tỷ rưỡi','5,5 tỷ','5 tỷ 5','3 tỷ 200','800 triệu',
--     '12 củ','15tr/th','900tr','1 trệt 2 lầu','5t5','2 tỉ 8','giá 6ty2 TL',
--     '7 tỏi 3','nhà 4x15 giá 8 tỏi','25 củ/tháng','5 cây vàng','5 tỏi 500 triệu',
--     'tỷ lệ chốt 5%','giá 5 tỷ 50m2','đất 100m2 giá 4ty','2 tý','thuê 8 củ rưỡi',
--     '5 tỷ 120m2','1 tỷ 050'
--   ]) s;
