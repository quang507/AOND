-- 20260925e — câu hẻm đã rõ loại thì không hỏi số mét; "5x12m2" không phải số m² khách nói; "cấp 4" đổi loại (FR-225 b, FR-226 a).
-- (b) Rao đã nói "hẻm xe hơi" (access_type có, chưa có số mét) mà bot vẫn hỏi "hẻm rộng mấy mét" (bắn thật lx-20 25/09;
-- chủ dự án 25/09 trước đó: "nếu hẻm xe hơi thì … nó phải tự nhận biết được"). Loại đường vào đã rõ = câu hẻm đã có
-- câu trả lời; số mét hỏi bù thì không chặn bản nháp. Thay chữ trong định nghĩa đang chạy như 20260925b.
do $$
declare d text;
begin
  d := pg_get_viewdef('public.listing_missing_facts'::regclass);
  -- PG lưu `IS NOT DISTINCT FROM` dưới dạng `NOT (… IS DISTINCT FROM …)`.
  if strpos(d, '(NOT (l.access_type IS DISTINCT FROM ''mat_tien''::text))') = 0 then
    raise exception 'listing_missing_facts: không thấy điều kiện access_type cần sửa';
  end if;
  execute 'create or replace view public.listing_missing_facts as ' ||
    replace(d, '(NOT (l.access_type IS DISTINCT FROM ''mat_tien''::text))', '(l.access_type IS NOT NULL)');

  d := pg_get_functiondef('public.diem_tin(public.listings)'::regprocedure);
  if strpos(d, 'co_hem := l.alley_width_m is not null or l.access_type is not distinct from ''mat_tien''') = 0 then
    raise exception 'diem_tin: không thấy dòng co_hem cần sửa';
  end if;
  execute replace(d, 'co_hem := l.alley_width_m is not null or l.access_type is not distinct from ''mat_tien''',
                     'co_hem := l.alley_width_m is not null or l.access_type is not null');

  -- (c) FR-225 b: fact diện tích "5x12m2" là NGANG × DÀI, không phải khách nói số m² — nở hậu vẫn cộng vào diện tích.
  d := pg_get_functiondef('public.listings_chuan_hoa_cot()'::regprocedure);
  if strpos(d, $a$          and public.bo_dau(coalesce(f.answer, '')) ~ '\d\s*(m2|m²|met vuong|m vuong)'$a$) = 0 then
    raise exception 'listings_chuan_hoa_cot: không thấy điều kiện số m² cần sửa';
  end if;
  execute replace(d, $a$          and public.bo_dau(coalesce(f.answer, '')) ~ '\d\s*(m2|m²|met vuong|m vuong)'$a$,
    $b$          and public.bo_dau(coalesce(f.answer, '')) ~ '\d\s*(m2|m²|met vuong|m vuong)'
          and public.bo_dau(coalesce(f.answer, '')) !~ '\d\s*x\s*\d+([.,]\d+)?\s*(m2|m²|m\M|met)'$b$);

  -- (d) FR-226 a (chủ dự án 25/09/2026, chọn "không hỏi, tự suy sau"): khách chỉ nói "bán nhà" thì tin giữ nhóm NHÀ
  -- (không lẫn với đất), bot hiện "Nhà" chứ không "Nhà phố"; khách nói "cấp 4" ở bất kỳ câu trả lời nào → nhà cấp 4.
  d := pg_get_functiondef('public.listing_facts_sync_cols()'::regprocedure);
  if strpos(d, $a$  j := public.boc_thong_so(v_txt, l.property_type::text);
$a$) = 0 then
    raise exception 'listing_facts_sync_cols: không thấy dòng boc_thong_so';
  end if;
  execute replace(d, $a$  j := public.boc_thong_so(v_txt, l.property_type::text);
$a$, $b$  j := public.boc_thong_so(v_txt, l.property_type::text);
  -- 20260925e: "nhà cấp 4" (câu trả lời bất kỳ) mà tin đang là nhà phố / chưa rõ → nhà cấp 4.
  if l.property_type in ('nha_pho', 'chua_ro') and public.bo_dau(v_txt) ~ '\m(cap 4|cap bon|nha c4)\M'
     and public.bo_dau(v_txt) !~ '(khong|ko|chua)\s*(phai\s*)?(la\s*)?(nha\s*)?cap' then
    update listings set property_type = 'nha_cap4' where id = new.listing_id and property_type in ('nha_pho', 'chua_ro');
  end if;
$b$);
end $$;
