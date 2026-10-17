-- FR-161 · Tầng DB cũng phải nghe được tiếng Việt KHÔNG DẤU.
--
-- Cùng gốc với OPEN-29 phía edge function: `guess_property_type` (trigger điền
-- loại BĐS từ câu rao, FR-150) và `guess_property_type_answer` (đọc câu trả
-- lời loại) chỉ biết chữ có dấu. Câu rao không dấu "ban nha hem xe hoi..." →
-- loại kẹt `chua_ro` → vòng drip hỏi thừa đúng câu mà câu rao đã trả lời.
-- (`parse_vnd` thì ĐÃ nuốt được "ty"/"trieu" từ trước — kiểm 27/08 — nên không đụng.)
--
-- Cùng luật hai chế độ với chat-reply: chữ CÓ DẤU đi bộ mẫu có dấu như cũ
-- (dấu là thông tin — "đạt" không phải "đất"); chữ KHÔNG DẤU mới rơi về bộ mẫu
-- đã bỏ dấu, chấp nhận nhập nhằng vốn có.

-- Bộ bỏ dấu dùng chung. IMMUTABLE để dùng được trong index sau này nếu cần.
-- translate() 1-đổi-1: 67 ký tự có dấu (NFC) → 67 ký tự trần. Chuỗi NFD lọt
-- lưới — dữ liệu ở đây do chính hệ ghi (NFC), chấp nhận.
create or replace function public.bo_dau(t text)
returns text
language sql
immutable
as $$
  select translate(lower(t),
    'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd')
$$;

comment on function public.bo_dau(text) is
  'FR-161: ha chu + bo dau tieng Viet (NFC) de khop mau khong phan biet dau.';

create or replace function public.guess_property_type(p_text text)
returns property_type
language sql
immutable
as $$
  select (case
    when p_text is null or btrim(p_text) = '' then null
    -- Tin CÓ DẤU: bộ mẫu cũ, không đổi hành vi
    when lower(p_text) is distinct from public.bo_dau(p_text) then (case
      when p_text ~* '(phòng trọ|nhà trọ|dãy trọ|khu trọ|phòng cho thuê)' then 'phong_tro'
      when p_text ~* '(biệt thự|villa)'                                   then 'biet_thu'
      when p_text ~* 'mặt bằng'                                            then 'mat_bang'
      when p_text ~* '(chung cư|căn hộ|penthouse|duplex|officetel)'        then 'chung_cu'
      when p_text ~* '(cấp 4|cấp bốn)'                                     then 'nha_cap4'
      when p_text ~* '(đất nền|lô đất|nền đất|bán đất|đất thổ cư|đất trống)'
           and p_text !~* '(trệt|lầu|tầng|phòng ngủ|\mPN\M|\mWC\M)'        then 'dat'
      when p_text ~* '(nhà|trệt|lầu|tầng|hẻm|mặt tiền|\mHXH\M|\mMT\M)'     then 'nha_pho'
      else null
    end)
    -- Tin KHÔNG DẤU: cùng bộ mẫu, bản trần
    else (case
      when public.bo_dau(p_text) ~ '(phong tro|nha tro|day tro|khu tro|phong cho thue)' then 'phong_tro'
      when public.bo_dau(p_text) ~ '(biet thu|villa)'                                   then 'biet_thu'
      when public.bo_dau(p_text) ~ 'mat bang'                                            then 'mat_bang'
      when public.bo_dau(p_text) ~ '(chung cu|can ho|penthouse|duplex|officetel)'        then 'chung_cu'
      when public.bo_dau(p_text) ~ '(cap 4|cap bon)'                                     then 'nha_cap4'
      when public.bo_dau(p_text) ~ '(dat nen|lo dat|nen dat|ban dat|dat tho cu|dat trong)'
           and public.bo_dau(p_text) !~ '(tret|lau|tang|phong ngu|\mpn\M|\mwc\M)'        then 'dat'
      when public.bo_dau(p_text) ~ '(\mnha\M|tret|\mlau\M|tang|\mhem\M|mat tien|\mhxh\M|\mmt\M)' then 'nha_pho'
      else null
    end)
  end)::property_type;
$$;

create or replace function public.guess_property_type_answer(p_text text)
returns property_type
language sql
immutable
as $$
  select coalesce(
    (case
      when p_text is null or btrim(p_text) = '' then null
      when lower(p_text) is distinct from public.bo_dau(p_text) then (case
        when p_text ~* '\mtrọ\M|phòng cho thuê'                          then 'phong_tro'
        when p_text ~* '(biệt thự|villa)'                                then 'biet_thu'
        when p_text ~* '(mặt bằng|\mmb\M)'                               then 'mat_bang'
        when p_text ~* '(chung cư|căn hộ|penthouse|duplex|officetel|\mcc\M)' then 'chung_cu'
        when p_text ~* '(cấp 4|cấp bốn)'                                 then 'nha_cap4'
        when p_text ~* '\m(đất|nền|thổ cư)\M'
             and p_text !~* '(trệt|lầu|tầng|phòng ngủ|\mPN\M|\mWC\M)'    then 'dat'
        when p_text ~* '\mnhà\M|nhà phố|nhà riêng|nhà hẻm'               then 'nha_pho'
        else null
      end)
      else (case
        when public.bo_dau(p_text) ~ '\mtro\M|phong cho thue'                then 'phong_tro'
        when public.bo_dau(p_text) ~ '(biet thu|villa)'                      then 'biet_thu'
        when public.bo_dau(p_text) ~ '(mat bang|\mmb\M)'                     then 'mat_bang'
        when public.bo_dau(p_text) ~ '(chung cu|can ho|penthouse|duplex|officetel|\mcc\M)' then 'chung_cu'
        when public.bo_dau(p_text) ~ '(cap 4|cap bon)'                       then 'nha_cap4'
        when public.bo_dau(p_text) ~ '\m(dat|nen|tho cu)\M'
             and public.bo_dau(p_text) !~ '(tret|lau|tang|phong ngu|\mpn\M|\mwc\M)' then 'dat'
        when public.bo_dau(p_text) ~ '\mnha\M|nha pho|nha rieng|nha hem'     then 'nha_pho'
        else null
      end)
    end)::public.property_type,
    public.guess_property_type(p_text)
  );
$$;
