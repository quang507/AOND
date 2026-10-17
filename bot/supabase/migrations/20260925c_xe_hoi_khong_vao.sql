-- 20260925c — "xe hơi / ô tô KHÔNG vào được" là hẻm xe máy, không phải hẻm xe hơi (FR-223 s).
--
-- Chủ dự án 25/09/2026 (ảnh chat thật, đang hỏi hẻm: "hxh" → không bóc được; "hẻm xe hơi" → vào bổ sung; "ô tô vô tận nhà"
-- → vào tiềm năng): "hxh nó vẫn ko đọc được, nếu hẻm xe hơi thì hẻm rộng tầm bao nhiêu trở lên cái này nó phải tự nhận biết".
-- Phía TS sửa ở chat-reply / khop-cau-tra-loi. Phía DB: `boc_thong_so` đọc loại đường vào từ chữ, mà luật hẻm xe hơi khớp
-- chữ "xe hoi" ở bất kỳ đâu — "xe hơi không vào được" thành `hem_xe_hoi`, ngược nghĩa. Nay câu PHỦ ĐỊNH xe hơi / ô tô vào
-- được xét TRƯỚC và ra `hem_xe_may`. Thay chữ trong định nghĩa đang chạy; chữ không thấy thì dừng.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.boc_thong_so(text, text)'::regprocedure);
  if strpos(d, $a$    if k ~ '(hem xe tai|\mhxt\M|xe tai)' then j := j || jsonb_build_object('access_type', 'hem_xe_tai');$a$) = 0 then
    raise exception 'boc_thong_so: không thấy dòng hem_xe_tai cần sửa';
  end if;
  execute replace(d,
    $a$    if k ~ '(hem xe tai|\mhxt\M|xe tai)' then j := j || jsonb_build_object('access_type', 'hem_xe_tai');$a$,
    $b$    if k ~ '(xe hoi|o ?to|xe tai|xe 4 banh)\s*(khong|ko|k|kg|chua)\s*(vo|vao|toi|den|duoc|lot|qua)' or k ~ '(khong|ko|k|kg|chua)\s*(co\s*)?(xe hoi|o ?to|xe tai)\s*(nao\s*)?(vo|vao|toi|duoc)' then j := j || jsonb_build_object('access_type', 'hem_xe_may');
    elsif k ~ '(hem xe tai|\mhxt\M|xe tai)' then j := j || jsonb_build_object('access_type', 'hem_xe_tai');$b$);
end $$;
