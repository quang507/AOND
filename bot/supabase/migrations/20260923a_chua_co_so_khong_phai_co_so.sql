-- 20260923a — "chưa có sổ" không được thành legal_status = 'so_hong' (23/09/2026, bắn 26 tin kịch bản bán/mua).
--
-- "nhượng lại căn chung cư mini … chưa có sổ" → tin lưu "có sổ": luật `boc_thong_so` khớp chuỗi "co so"
-- nằm GIỮA câu phủ định. Người mua đọc tin sẽ thấy sai pháp lý — lỗi phá dữ liệu nặng nhất lượt bắn.
-- Nay câu phủ định (chưa/không/ko/chẳng/đang chờ/đang làm/chưa ra + [có|ra|làm] + sổ/shr/shc) đi trước
-- mọi nhánh pháp lý và không ghi gì; fact `phap_ly` vẫn giữ nguyên chữ khách nói.
-- Áp lên DB bằng khối thay đúng một dòng trong thân hàm (giữ nguyên phần còn lại); `schema.sql` vá cùng chữ.

do $mig$
declare
  d text := pg_get_functiondef('public.boc_thong_so(text,text)'::regprocedure);
  cu text := $q$  if k ~ '(so hong rieng|\mshr\M|so rieng|so do rieng)' then j := j || jsonb_build_object('legal_status', 'so_hong_rieng');$q$;
  moi text := $q$  -- 20260923a: "chưa có sổ" / "không có sổ" / "đang làm sổ" là KHÔNG có sổ — bản cũ khớp "co so" ở giữa câu phủ định.
  if k ~ '(chua|khong|\mko\M|chang|dang cho|dang lam|chua ra)\s+(co\s+|ra\s+|lam\s+)?(so|shr|shc)\M' then null;
  elsif k ~ '(so hong rieng|\mshr\M|so rieng|so do rieng)' then j := j || jsonb_build_object('legal_status', 'so_hong_rieng');$q$;
begin
  if position(cu in d) = 0 then raise exception 'khong thay dong phap ly trong boc_thong_so'; end if;
  d := replace(d, cu, moi);
  execute d;
end $mig$;
