-- 20260928g — parse_vnd: lọc trước vòng đổi chữ số (vá hiệu năng cho 20260928f).
--
-- 20260928f thêm ~100 lượt regexp_replace cho MỌI lần gọi (đo 28/09: 200 lần = 2,75 giây, ~13,7 ms/lần). parse_vnd nằm trong
-- can_cung_khu, bao_tin_moi_khop, trigger giá… nên lượt bắn lại 10 ca làm DB Free huỷ câu lệnh vì quá giờ
-- (match_projects, ghi_fact_listing trong bot_errors 16:33–16:35). Nay chỉ chạy vòng khi câu có chữ số sát đơn vị tiền.
-- Kết quả không đổi: doi-chieu:tien (TS luat-tien.ts cùng phép lọc CO_SO_CHU) phải vẫn 65/65.

CREATE OR REPLACE FUNCTION public.parse_vnd(p text)
 RETURNS bigint
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  t    text;
  m    text[];
  v    numeric;
  ruoi boolean;
  -- 20260928f (FR-241): so viet bang CHU — cung bang, cung thu tu voi luat-tien.ts SO_CHU / soChuThanhSo.
  so_chu text[] := array['một','mốt','mot','hai','ba','bốn','bon','tư','năm','nam','lăm','sáu','sau','bảy','bẩy','bay','tám','tam','chín','chin'];
  so_so  text[] := array['1','1','1','2','3','4','4','4','5','5','5','6','6','7','7','7','8','8','9','9'];
  don_vi text := '(?=\s*(tỷ|tỏi|tỉ|ty|triệu|trieu|củ|trăm|tram)(?![[:alpha:]]))';
  i int;
begin
  if p is null or btrim(p) = '' then return null; end if;
  t := lower(p);
  -- Gia MOI m2 khong phai gia ca can (luat-tien.ts GIA_THEO_M2).
  if t ~ '(tỷ|tỉ|tỏi|triệu|trieu|tr|củ|cu|ty|ti)\s*(/|mỗi|moi|một|mot|1)\s*(m2|m²|mét|met|m\M)' then
    return null;
  end if;
  -- 20260928f (FR-241, bắn thật lx-72 "giá chín tỷ rưỡi"): chữ số → chữ số CHỈ khi đứng ngay trước đơn vị tiền,
  -- hoặc trơ cuối câu ngay sau "tỷ" ("chín tỷ hai"). "năm 2020", "bán năm căn" giữ nguyên.
  -- 20260928g: lọc trước — vòng đổi tốn ~100 lượt regex, mà parse_vnd bị gọi trong hàm quét nhiều dòng; chạy cho mọi câu
  -- làm DB Free quá giờ (bắn lại 28/09). Chỉ chạy khi có chữ số sát đơn vị tiền / sau "tỷ" / "<số> trăm" (luat-tien.ts CO_SO_CHU).
  if t ~ '(một|mốt|mot|hai|ba|bốn|bon|tư|năm|nam|lăm|sáu|sau|bảy|bẩy|bay|tám|tam|chín|chin|mười|muoi|mươi)\s*(tỷ|tỏi|tỉ|ty|triệu|trieu|củ|trăm|tram)(?![[:alpha:]])'
     or t ~ '(tỷ|tỏi|tỉ)\s+(một|mốt|mot|hai|ba|bốn|bon|tư|năm|nam|lăm|sáu|sau|bảy|bẩy|bay|tám|tam|chín|chin|mười|muoi|mươi)(?!\s*[[:alnum:]])'
     or t ~ '[0-9]\s*(trăm|tram)(?![[:alpha:]])' then
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![[:alnum:]])(mười|muoi)\s+' || so_chu[i] || don_vi, '1' || so_so[i], 'g');
    t := regexp_replace(t, '(?<![[:alnum:]])' || so_chu[i] || '\s+(mươi|muoi)(?![[:alpha:]])', so_so[i] || '0', 'g');
  end loop;
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![0-9])([1-9])0\s+' || so_chu[i] || don_vi, '\1' || so_so[i], 'g');
  end loop;
  t := regexp_replace(t, '(?<![[:alnum:]])(mười|muoi)' || don_vi, '10', 'g');
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(?<![[:alnum:]])' || so_chu[i] || don_vi, so_so[i], 'g');
  end loop;
  t := regexp_replace(t, '([0-9])\s*(trăm|tram)(?![[:alpha:]])', '\100', 'g');
  for i in 1 .. array_length(so_chu, 1) loop
    t := regexp_replace(t, '(tỷ|tỏi|tỉ)\s+' || so_chu[i] || '(?!\s*[[:alnum:]])', '\1 ' || so_so[i], 'g');
  end loop;
  end if;
  ruoi := t ~ 'rưỡi|rươi|ruoi';

  t := regexp_replace(t, 'tỏi|tỷ|tỉ|tị|tỹ', ' _ty ', 'g');
  t := regexp_replace(t, 'triệu|trieu|củ',  ' _trieu ', 'g');

  t := regexp_replace(t, '([0-9])\s*t[yi]\s*([0-9])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*tr\s*([0-9])', '\1 _trieu \2', 'g');
  -- 13/09/2026: "1t2l" / "1t 2l" la 1 tret 2 lau, khong phai 1,2 ty (luat-tien.ts).
  t := regexp_replace(t, '([0-9])\s*t\s*([0-9]{1,3})(?![0-9[:alpha:]])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*t[yi]\M',         '\1 _ty ',   'g');
  t := regexp_replace(t, '([0-9])\s*tr\M',         '\1 _trieu ', 'g');
  t := regexp_replace(t, '([0-9])\s*t\M(?!\s*[0-9]+\s*(l|lầu|lau)\M)', '\1 _ty ', 'g');

  -- Phan le sau don vi: "5 ty 5" = 5,5 ty | "3 ty 200" = 3,2 ty.
  -- Chan hai kieu bat nham: "5 ty 50m2" (dien tich) va viec cat bot chu so
  -- ("50" bi lui ve "5" cho khop) — nen cam ca chu so lan m dung ngay sau.
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

  -- Phan le sau trieu: "3 trieu 5" = 3,5 trieu | "3 trieu 500" = 3,5 trieu.
  -- So dung sau ma la so LUONG (thang, phong, m2...) thi khong phai phan le.
  m := regexp_match(t, '([0-9]+)\s*_trieu\s*([0-9]{1,3})(?![0-9.,]|\s*(m2|m²|mét|met|m\M|phòng|phong|pn|lầu|lau|tầng|tang|tấm|tam|wc|tháng|thang|năm|nam|người|nguoi|căn|can))');
  if m is not null then
    return (m[1]::numeric * 1e6
            + case when length(m[2]) = 1
                   then m[2]::numeric * 1e5
                   else m[2]::numeric * 1e3 end)::bigint;
  end if;

  m := regexp_match(t, '([0-9]+[.,]?[0-9]*)\s*_trieu');
  if m is not null then
    v := replace(m[1], ',', '.')::numeric * 1e6;
    if ruoi then v := v + 5e5; end if;
    return v::bigint;
  end if;

  -- 20260927b: số đồng viết đủ ("8.000.000.000", "8000000000"), không mở bằng 0, không phải số đo; 1 triệu..10 nghìn tỷ.
  m := regexp_match(t, '(?<![0-9.,])([1-9][0-9]{0,2}(?:[.,][0-9]{3}){2,}|[1-9][0-9]{6,12})(?![0-9.,]*[0-9])(?!\s*(m2|m²|mét|met|m\M))');
  if m is not null then
    v := regexp_replace(m[1], '[.,]', '', 'g')::numeric;
    if v >= 1e6 and v <= 1e13 then return v::bigint; end if;
  end if;

  return null;
exception when others then
  return null;
end
$function$
;
