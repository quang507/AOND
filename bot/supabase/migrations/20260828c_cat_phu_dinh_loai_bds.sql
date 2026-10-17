-- 20260828c — Cắt mệnh đề phủ định trước khi đoán loại BĐS (FR-164)
-- Áp lên DB: version 20260828124648, tên `cat_phu_dinh_loai_bds`.
--
-- BỆNH. `guess_property_type_answer()` duyệt danh sách nhánh theo thứ tự cố
-- định: `chung cư` đứng trước `nhà`. Người bán trả lời
--     "nhà phố chứ không phải chung cư em"
-- thì hàm gặp `chung cư` trước và trả về `chung_cu` — đúng chữ, sai nghĩa,
-- ngược hẳn ý người nói.
--
-- VÌ SAO NGUY. Trước FR-164 đây chỉ là một lần đoán sai, sửa lại được. Sau
-- FR-164, câu trả lời của chính chủ được đóng dấu `chu_xac_nhan` — bậc nguồn
-- cao nhất — nên giá trị sai đó KHOÁ luôn cột `property_type`: mọi lần suy
-- đoán hay admin sửa về sau đều bị `bac_nguon()` chặn. Một lỗi regex biến
-- thành một bản ghi hỏng vĩnh viễn.
--
-- CÁCH CHỮA. Cắt câu tại mốc phủ định đầu tiên rồi mới đoán. Phần đứng trước
-- "chứ không phải" là điều người ta khẳng định; phần sau là điều họ bác bỏ.
--
-- PHẠM VI. Chỉ áp cho `guess_property_type_answer()` — hàm đọc CÂU TRẢ LỜI
-- cho câu hỏi "loại nhà là gì", nơi cấu trúc "A chứ không phải B" là lối nói
-- thường gặp. KHÔNG áp cho `guess_property_type()` (quét MÔ TẢ tin rao): mô
-- tả là văn xuôi nhiều câu, cắt tại chữ "không phải" đầu tiên sẽ vứt mất phần
-- lớn nội dung. Nhưng lối vào `guess_property_type()` nằm bên trong
-- `guess_property_type_answer()` (đường lùi) thì vẫn phải nhận bản đã cắt,
-- nếu không câu trên lại lọt xuống đó và ra `chung_cu` như cũ.

-- (1) Bộ cắt phủ định.
create or replace function public.cat_truoc_phu_dinh(p_text text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  t   text := public.bo_dau(coalesce(p_text, ''));
  m   text;
  p   int;
  min_p int := null;
begin
  -- bo_dau dùng lower() + translate() 1-đổi-1 nên VỊ TRÍ ký tự không đổi:
  -- tìm trên bản đã bỏ dấu, cắt trên bản gốc.
  foreach m in array array['chu khong', 'chu ko', 'khong phai', 'ko phai',
                           'chang phai', 'hong phai', 'dau phai']
  loop
    p := position(m in t);
    if p > 0 and (min_p is null or p < min_p) then min_p := p; end if;
  end loop;

  if min_p is null then return p_text; end if;
  return btrim(substring(p_text from 1 for min_p - 1));
end $$;

comment on function public.cat_truoc_phu_dinh(text) is
  'FR-164: cắt câu tại mốc phủ định đầu tiên ("chứ không phải", "ko phải"…) '
  'để chỉ giữ phần người nói khẳng định. Dùng trước khi đoán loại BĐS từ câu '
  'trả lời của người bán.';

-- (2) Đoán loại BĐS từ câu trả lời — mọi nhánh đi qua bộ cắt.
-- Giữ nguyên hai chế độ đối sánh dấu của FR-161: câu CÓ dấu dùng mẫu có dấu,
-- câu không dấu mới rơi xuống mẫu đã bỏ dấu.
create or replace function public.guess_property_type_answer(p_text text)
returns property_type
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(
    (case
      when p_text is null or btrim(p_text) = '' then null
      when btrim(public.cat_truoc_phu_dinh(p_text)) = '' then null
      when lower(public.cat_truoc_phu_dinh(p_text))
             is distinct from public.bo_dau(public.cat_truoc_phu_dinh(p_text)) then (case
        when public.cat_truoc_phu_dinh(p_text) ~* '\mtrọ\M|phòng cho thuê'      then 'phong_tro'
        when public.cat_truoc_phu_dinh(p_text) ~* '(biệt thự|villa)'            then 'biet_thu'
        when public.cat_truoc_phu_dinh(p_text) ~* '(mặt bằng|\mmb\M)'           then 'mat_bang'
        when public.cat_truoc_phu_dinh(p_text) ~* '(chung cư|căn hộ|penthouse|duplex|officetel|\mcc\M)' then 'chung_cu'
        when public.cat_truoc_phu_dinh(p_text) ~* '(cấp 4|cấp bốn)'             then 'nha_cap4'
        when public.cat_truoc_phu_dinh(p_text) ~* '\m(đất|nền|thổ cư)\M'
             and public.cat_truoc_phu_dinh(p_text) !~* '(trệt|lầu|tầng|phòng ngủ|\mPN\M|\mWC\M)' then 'dat'
        when public.cat_truoc_phu_dinh(p_text) ~* '\mnhà\M|nhà phố|nhà riêng|nhà hẻm' then 'nha_pho'
        else null
      end)
      else (case
        when public.bo_dau(public.cat_truoc_phu_dinh(p_text)) ~ '\mtro\M|phong cho thue' then 'phong_tro'
        when public.bo_dau(public.cat_truoc_phu_dinh(p_text)) ~ '(biet thu|villa)'       then 'biet_thu'
        when public.bo_dau(public.cat_truoc_phu_dinh(p_text)) ~ '(mat bang|\mmb\M)'      then 'mat_bang'
        when public.bo_dau(public.cat_truoc_phu_dinh(p_text)) ~ '(chung cu|can ho|penthouse|duplex|officetel|\mcc\M)' then 'chung_cu'
        when public.bo_dau(public.cat_truoc_phu_dinh(p_text)) ~ '(cap 4|cap bon)'        then 'nha_cap4'
        when public.bo_dau(public.cat_truoc_phu_dinh(p_text)) ~ '\m(dat|nen|tho cu)\M'
             and public.bo_dau(public.cat_truoc_phu_dinh(p_text)) !~ '(tret|lau|tang|phong ngu|\mpn\M|\mwc\M)' then 'dat'
        when public.bo_dau(public.cat_truoc_phu_dinh(p_text)) ~ '\mnha\M|nha pho|nha rieng|nha hem' then 'nha_pho'
        else null
      end)
    end)::public.property_type,
    -- Đường lùi cũ: quét như mô tả. Cũng phải đi qua bộ cắt phủ định, nếu không
    -- thì "nhà phố chứ không phải chung cư" lại lọt xuống đây và ra chung_cu.
    public.guess_property_type(public.cat_truoc_phu_dinh(p_text))
  );
$$;
