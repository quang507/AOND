-- 20260928d — tên phường gõ chữ thường được viết đúng (FR-239 j).
--
-- Phát lại test 27/09: "Ở cầu kho em ơi" → cột ward = "cầu kho", bản nháp in "Trần Hưng Đạo cầu kho Q.1". Hàm chỉ chuẩn hoá
-- phường ĐÁNH SỐ. Nay tên chữ ngắn gõ thường (≤ 4 chữ, không tiểu từ chat): có trong bảng `wards` (phường / xã mới) thì lấy tên
-- đầy đủ, không có thì "Phường " + viết hoa đầu chữ; có sẵn tiền tố phường / xã / thị trấn thì chỉ viết hoa. Tên đã có chữ hoa
-- giữ nguyên như cũ. Đọc bảng `wards` nên hàm thành STABLE (trước IMMUTABLE; không index nào dùng hàm này).
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
    when btrim(p_text) = lower(btrim(p_text))
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
