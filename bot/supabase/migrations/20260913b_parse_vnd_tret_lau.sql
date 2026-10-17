-- 20260913b — parse_vnd đọc "1t2l" thành 1,2 tỷ (review code 13/09/2026)
--
-- "1t2l" / "1t 2l" là 1 trệt 2 lầu. TS `TIEN_T_KEP` đã có chốt, còn `docTien` và
-- `parse_vnd` thì không — hai hàm được tuyên bố là chỗ "cần MỘT con số giá thì
-- dùng", tức bẫy cho lời gọi kế tiếp. Vá cả hai bản cùng một luật:
--   · "t" kẹp giữa hai số chỉ là tỷ khi số sau KHÔNG dính chữ ("9t5" có, "1t2l" không);
--   · "t" trơ trọi chỉ là tỷ khi phía sau không phải "<số> l/lầu".
-- Bảng ca chung: bot/tests/luat/tien.json (+4 ca). Đã chạy bản pg_temp trên DB:
-- mọi ca cũ ra y như bản đang chạy, chỉ bốn ca mới đổi.

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
begin
  if p is null or btrim(p) = '' then return null; end if;
  t := lower(p);
  -- Gia MOI m2 khong phai gia ca can (luat-tien.ts GIA_THEO_M2).
  if t ~ '(tỷ|tỉ|tỏi|triệu|trieu|tr|củ|cu|ty|ti)\s*(/|mỗi|moi|một|mot|1)\s*(m2|m²|mét|met|m\M)' then
    return null;
  end if;
  ruoi := t ~ 'rưỡi|rươi|ruoi';

  t := regexp_replace(t, 'tỏi|tỷ|tỉ|tị|tỹ', ' _ty ', 'g');
  t := regexp_replace(t, 'triệu|trieu|củ',  ' _trieu ', 'g');

  t := regexp_replace(t, '([0-9])\s*ty\s*([0-9])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*tr\s*([0-9])', '\1 _trieu \2', 'g');
  -- 13/09/2026: "1t2l" / "1t 2l" la 1 tret 2 lau, khong phai 1,2 ty (luat-tien.ts).
  t := regexp_replace(t, '([0-9])\s*t\s*([0-9]{1,3})(?![0-9[:alpha:]])', '\1 _ty \2', 'g');
  t := regexp_replace(t, '([0-9])\s*ty\M',         '\1 _ty ',   'g');
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

  return null;
exception when others then
  return null;
end
$function$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260913b', 'parse_vnd_tret_lau') on conflict do nothing;
