-- 20260925b — câu HẺM không bao giờ được hỏi khi tin chưa có loại đường vào (lỗi NULL ba trị) — FR-223 (q).
--
-- Chủ dự án 25/09/2026: "xét lại các tin mày bắn xem còn lỗi gì ko". Bắn thật lx-10 ("105/12 Trần Bình Trọng quận 5 …"):
-- bot đi phường → gấp → gửi bản nháp, KHÔNG hỏi hẻm lần nào, và dòng "còn thiếu" của nháp cũng không nhắc hẻm.
--
-- Gốc: view `listing_missing_facts` loại câu đã có dữ liệu bằng `NOT ( … OR (fact_key IN (do_rong_hem, do_rong_duong)
-- AND (alley_width_m IS NOT NULL OR access_type = 'mat_tien')) OR … )`. `access_type` NULL → `access_type = 'mat_tien'`
-- là NULL → cả khối OR là NULL → `NOT NULL` là NULL → WHERE loại dòng. Nghĩa là tin nào chưa có access_type thì câu hẻm
-- biến mất khỏi danh sách thiếu. `diem_tin` dính cùng gốc: `co_hem := … or l.access_type = 'mat_tien' or …` ra NULL,
-- `if not co_hem` không chạy → không kể "hẻm rộng mấy mét" là thiếu. Mock e2e chạy bằng JS nên không thấy (NULL của JS
-- khác NULL của SQL). Soát 25/09: 3/8 tin trong kho đang mất câu hẻm vì vậy.
--
-- Sửa: `IS NOT DISTINCT FROM` (NULL → false) ở đúng hai chỗ. Thay chữ trong định nghĩa đang chạy (pg_get_viewdef /
-- pg_get_functiondef) để không chép tay 2.400 ký tự view; chữ không thấy thì dừng, không âm thầm bỏ qua.
do $$
declare d text;
begin
  d := pg_get_viewdef('public.listing_missing_facts'::regclass);
  if strpos(d, '(l.access_type = ''mat_tien''::text)') = 0 then
    raise exception 'listing_missing_facts: không thấy điều kiện access_type cần sửa';
  end if;
  execute 'create or replace view public.listing_missing_facts as ' ||
    replace(d, '(l.access_type = ''mat_tien''::text)', '(l.access_type IS NOT DISTINCT FROM ''mat_tien''::text)');

  d := pg_get_functiondef('public.diem_tin(public.listings)'::regprocedure);
  if strpos(d, 'co_hem := l.alley_width_m is not null or l.access_type = ''mat_tien''') = 0 then
    raise exception 'diem_tin: không thấy dòng co_hem cần sửa';
  end if;
  execute replace(d, 'co_hem := l.alley_width_m is not null or l.access_type = ''mat_tien''',
                     'co_hem := l.alley_width_m is not null or l.access_type is not distinct from ''mat_tien''');
end $$;
