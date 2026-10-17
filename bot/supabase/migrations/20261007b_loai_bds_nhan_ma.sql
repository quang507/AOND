-- 20261007b — fact `loai_bds` ghi bằng MÃ loại ("nha_cap4") cũng đổi được cột `property_type` (SRS-5.1zzzc).
--
-- Chủ dự án chat thử 07/10/2026: "là nhà cấp 4" → 🤖 "loại bất động sản: nha_cap4", tin vẫn là nha_pho, bot hỏi tiếp "trệt
-- mấy lầu" cho nhà cấp 4. AI bóc tách trả loại BĐS dạng MÃ (`boc-rao.ts`: chung_cu | nha_pho | nha_cap4 …) và code ghi nguyên mã
-- đó vào fact; trigger `listing_facts` gọi `guess_property_type_answer`, vốn chỉ đọc CHỮ NGƯỜI ("nhà cấp 4"). Gạch dưới là ký tự
-- của từ trong regex Postgres nên "nha_cap4" không khớp '\mnha\M' lẫn 'cap 4' → NULL → cột không đổi. Mọi mã trừ `dat` đều rơi.
-- Sửa ở MỘT chỗ cuối đường ghi (41 chỗ gọi ghi_fact_listing trong chat-reply): chuỗi đúng bằng một mã enum thì nhận thẳng mã đó.
CREATE OR REPLACE FUNCTION public.guess_property_type_answer(p_text text)
 RETURNS property_type
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  with t as (select public.bo_dau(coalesce(p_text, '')) as s)
  select (case
    when (select btrim(s) from t) = '' then null
    when (select btrim(s) from t) ~ '^(chung_cu|nha_pho|nha_cap4|dat|biet_thu|phong_tro|mat_bang|toa_nha|dat_nong_nghiep|dat_kinh_doanh|kho_xuong)$'
                                                                                          then (select btrim(s) from t)
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
$function$;

comment on function public.guess_property_type_answer(text) is
  '[RỔ HÀNG] Đọc loại BĐS từ câu trả lời — nhận cả MÃ enum AI ghi ("nha_cap4", 20261007b) lẫn chữ người ("nhà cấp 4").';
