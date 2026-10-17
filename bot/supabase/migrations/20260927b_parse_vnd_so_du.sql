-- 20260927b — parse_vnd đọc số ĐỒNG viết đủ chữ số ("Giá 8.000.000.000") (FR-231 b).
--
-- Chủ dự án test Zalo 27/09/2026: "Giá 8.000.000.000" rơi vào "thông tin bổ sung" — luật tiền chỉ biết tỷ / triệu / tr / t.
-- Cùng luật với `docTien` (luat-tien.ts), cùng bảng ca `bot/tests/luat/tien.json` (cổng `doi-chieu:tien`): có dấu nhóm
-- nghìn (. hoặc ,) hoặc ≥ 7 chữ số liền, không mở bằng 0 (số điện thoại), không phải số đo (m2 / mét), từ 1 triệu tới
-- 10 nghìn tỷ. Chỉ là nhánh CUỐI — câu có đơn vị tỷ / triệu vẫn đi đường cũ.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.parse_vnd(text)'::regprocedure);
  if strpos(d, $a$    if ruoi then v := v + 5e5; end if;
    return v::bigint;
  end if;

  return null;
exception when others then$a$) = 0 then
    raise exception 'parse_vnd: không thấy đoạn cuối cần vá';
  end if;
  execute replace(d, $a$    if ruoi then v := v + 5e5; end if;
    return v::bigint;
  end if;

  return null;
exception when others then$a$, $b$    if ruoi then v := v + 5e5; end if;
    return v::bigint;
  end if;

  -- 20260927b: số đồng viết đủ ("8.000.000.000", "8000000000"), không mở bằng 0, không phải số đo; 1 triệu..10 nghìn tỷ.
  m := regexp_match(t, '(?<![0-9.,])([1-9][0-9]{0,2}(?:[.,][0-9]{3}){2,}|[1-9][0-9]{6,12})(?![0-9.,]*[0-9])(?!\s*(m2|m²|mét|met|m\M))');
  if m is not null then
    v := regexp_replace(m[1], '[.,]', '', 'g')::numeric;
    if v >= 1e6 and v <= 1e13 then return v::bigint; end if;
  end if;

  return null;
exception when others then$b$);
end $$;
