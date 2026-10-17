-- 20260924h — listing_facts_sync_cols: đất / kho xưởng / toà nhà được ghi diện tích từ 5.000 m² trở lên.
--
-- Bắn 10 tin 24/09/2026 (ID giả): "Bán đất SKC 5000m2 khu công nghiệp Tân Tạo" — fact `dien_tich` = "5000m2" mà cột
-- `area_m2` trống, bản nháp gợi ý "thêm diện tích" dù khách đã nói. Trần cũ `< 5000` đặt cho nhà phố (chặn số nhầm);
-- đất nông nghiệp, đất SKC, kho xưởng thường vượt. Chỉ đổi đúng điều kiện đó (thay chuỗi trong thân hàm đang chạy),
-- phần còn lại giữ nguyên. (Chuỗi đó có hai chỗ — nhánh tim tường của chung cư cũng được thay, không đổi hành vi vì chung cư không nằm trong danh sách.)
do $$
declare
  d text := pg_get_functiondef('public.listing_facts_sync_cols()'::regprocedure);
  cu text := 'if v_num is not null and v_num > 5 and v_num < 5000 then';
  moi text := 'if v_num is not null and v_num > 5 and (v_num < 5000 or (l.property_type in (''dat'', ''dat_nong_nghiep'', ''dat_kinh_doanh'', ''kho_xuong'', ''toa_nha'') and v_num < 1000000)) then';
begin
  if position(cu in d) = 0 then raise exception 'listing_facts_sync_cols: không thấy điều kiện diện tích cũ'; end if;
  execute replace(d, cu, moi);
end $$;
