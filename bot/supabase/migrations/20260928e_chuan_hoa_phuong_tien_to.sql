-- 20260928e — chuẩn hoá phường xét PHẦN TÊN sau tiền tố (FR-239 j, sửa 20260928d).
--
-- 20260928d chỉ viết lại khi CẢ chuỗi gõ thường; e2e bắt: khách "phường cầu kho em" → luật ghi "Phường cầu kho" (tiền tố đã
-- hoa) → hàm cho qua nguyên. Nay xét phần tên sau "phường / xã / thị trấn": tên gõ thường thì viết hoa đầu chữ (tiền tố giữ
-- đúng loại), có trong bảng `wards` thì lấy tên đầy đủ. Tên đã có chữ hoa giữ nguyên như cũ.
create or replace function public.chuan_hoa_phuong(p_text text)
 returns text
 language sql
 stable
 set search_path to 'public'
as $function$
  select case
    when p_text is null or btrim(p_text) = '' then null
    when (regexp_match(public.bo_dau(p_text), '(?:phuong|p)\s*\.?\s*([0-9]{1,2})'))[1] is not null
     and ((regexp_match(public.bo_dau(p_text), '(?:phuong|p)\s*\.?\s*([0-9]{1,2})'))[1])::int between 1 and 25
      then 'Phường ' || ((regexp_match(public.bo_dau(p_text), '(?:phuong|p)\s*\.?\s*([0-9]{1,2})'))[1])::int
    when btrim(p_text) ~ '^[0-9]{1,2}$' and btrim(p_text)::int between 1 and 25
      then 'Phường ' || btrim(p_text)::int
    when regexp_replace(btrim(p_text), '^(?:phường|xã|thị trấn)\s+', '', 'i')
           = lower(regexp_replace(btrim(p_text), '^(?:phường|xã|thị trấn)\s+', '', 'i'))
     and public.bo_dau(btrim(p_text)) ~ '^(?:(?:phuong|xa|thi tran)\s+)?[a-z]+(?:\s[a-z]+){0,3}$'
     and public.bo_dau(btrim(p_text)) !~ '\m(?:em|anh|chi|nha|nhe|a|oi|o|do|day|nhen|luon)\M'
      then coalesce(
        (select w.ten_day_du from public.wards w
          where public.bo_dau(w.ten) = regexp_replace(public.bo_dau(btrim(p_text)), '^(?:phuong|xa|thi tran)\s+', '')
          limit 1),
        case when public.bo_dau(btrim(p_text)) ~ '^(?:phuong|xa|thi tran)\s' then initcap(btrim(p_text))
             else 'Phường ' || initcap(btrim(p_text)) end)
    when length(btrim(p_text)) between 2 and 50 then btrim(p_text)
    else null
  end;
$function$;
