-- 20260928h — FR-241 n: "không cần bán gấp" là KHÔNG gấp.
--
-- Bắn lại 10 ca 28/09 (lx-81): khách nhắn "ko gap", AI chuẩn hoá đáp án thành "không cần bán gấp" (fact đúng), nhưng
-- doc_gap chỉ nhận "không (cần) gấp" liền nhau — chữ "bán" chen giữa làm vế phủ định trượt, rơi xuống vế `\mgap\M` → true.
-- Cột gap = true, bản nháp in "cần bán gấp" ngược ý khách. Nay cho phép "bán / cho thuê / ra hàng / ra / đi" chen giữa.

CREATE OR REPLACE FUNCTION public.doc_gap(p_text text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_text is null or btrim(p_text) = '' then null
    when public.bo_dau(p_text) ~ '\m(khong|ko|k|chua|chang|dau co)\s*(can\s*)?((ban|cho thue|ra hang|ra|di)\s*)?(gap|voi)\M|\mduoc gia thi thoi\M|\mkhong voi\M|\mtu tu\M|\mban duoc gia\M' then false
    when public.bo_dau(p_text) ~ '\mgap\s*(doi|ba|lan|ruoi|[0-9])' then null
    when public.bo_dau(p_text) ~ '\mgap\M|\mcan tien\M|\m(ban|di|ra)\s*nhanh\M' or lower(p_text) ~ 'vội' then true
    else null end;
$function$
;
