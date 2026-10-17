-- 20260914c — guess_property_type_answer so chữ KHÔNG ranh giới từ (bắn lại 14 tin bán, 14/09/2026).
-- Chủ nhà sửa "à anh nói lại, là đất trống chưa xây" → fact loai_bds "đất trống" → hàm đọc
-- "trống" chứa "tro" → tin thành PHÒNG TRỌ. Cùng một kiểu: "không" chứa "kho" (kho xưởng),
-- "phòng" chứa "pho" (nhà phố), "nhà phố kinh doanh" thành đất kinh
-- doanh. Bản đọc MÔ TẢ (guess_property_type) đã có \m…\M từ trước; bản đọc CÂU TRẢ LỜI thì chưa.
CREATE OR REPLACE FUNCTION public.guess_property_type_answer(p_text text)
 RETURNS property_type
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  with t as (select public.bo_dau(coalesce(p_text, '')) as s)
  select (case
    when (select btrim(s) from t) = '' then null
    when (select s from t) ~ '(\mkho\M|\mxuong\M|nha kho|kho bai)'                        then 'kho_xuong'
    when (select s from t) ~ '(nong nghiep|dat vuon|dat lua|dat ray|\mcln\M)'             then 'dat_nong_nghiep'
    when (select s from t) ~ '(\mskc\M|\mtmd\M|dat thuong mai|dat san xuat|dat kinh doanh)' then 'dat_kinh_doanh'
    when (select s from t) ~ '(\mchdv\M|dich vu|khach san|toa nha|building|nha nghi)'      then 'toa_nha'
    when (select s from t) ~ '(\mtro\M|\mphong tro\M|\mnha tro\M|\mday tro\M)' then 'phong_tro'
    when (select s from t) ~ '(biet thu|villa|\mbt\M)'                                    then 'biet_thu'
    when (select s from t) ~ '(mat bang|\mmb\M)'                                          then 'mat_bang'
    when (select s from t) ~ '(chung cu|can ho|canho|penthouse|duplex|officetel|\mcc\M|\mch\M)' then 'chung_cu'
    when (select s from t) ~ '(cap 4|cap bon|\mc4\M)'                                     then 'nha_cap4'
    when (select s from t) ~ '(\mdat\M|dat nen|lo dat|nen dat)'                         then 'dat'
    when (select s from t) ~ '(nha pho|\mnha\M|\mnp\M|\mpho\M)'                           then 'nha_pho'
    else null
  end)::property_type
$function$
;
