-- 20260925g — "hxm" là chữ khách nói RÕ hẻm xe máy (FR-227 b).
--
-- Chủ dự án 25/09/2026: "nếu khách nói hxh, hxm thì nhận luôn". Soát ngay sau 20260925f: `boc_thong_so('hxm 3m')` trả
-- access_type NULL — bản SQL nhận hxh/hxt nhưng quên hxm (bản TS `khop-cau-tra-loi.ts` đã có). Thêm `hxm` vào nhánh hẻm
-- xe máy và vào cụm bắt số mét; chữ rõ vẫn xét TRƯỚC số mét, nên "hxm 3m" là hẻm xe máy chứ không thành hẻm xe hơi.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.boc_thong_so(text, text)'::regprocedure);
  if strpos(d, 'elsif k ~ ''(hem xe may|hem nho|') = 0 then raise exception 'boc_thong_so: không thấy nhánh hẻm xe máy'; end if;
  if strpos(d, '(?:hem|hxh|hxt|duong truoc nha|duong)') = 0 then raise exception 'boc_thong_so: không thấy cụm số mét'; end if;
  d := replace(d, 'elsif k ~ ''(hem xe may|hem nho|', 'elsif k ~ ''(\mhxm\M|hem xe may|hem nho|');
  d := replace(d, '(?:hem|hxh|hxt|duong truoc nha|duong)', '(?:hem|hxh|hxt|hxm|duong truoc nha|duong)');
  execute d;
end $$;
