-- 20260928b — câu xin ảnh của điểm tin theo loại BĐS (FR-237).
--
-- Chủ dự án 28/09/2026 ("Sửa đi") sau bắn thật lx-44: tin ĐẤT lên kệ vẫn gợi ý "vài tấm ảnh (nhà, sổ, hẻm — ảnh nào cũng
-- được)" — đất không có nhà, đường vào không phải hẻm. Câu nằm trong `thieu` của `diem_tin`, bot đọc nguyên văn. Nay theo
-- loại: đất → lô đất, sổ, đường vào; căn hộ → căn hộ, sổ, view; phòng trọ → phòng, lối vào; kho xưởng → kho, sổ, đường vào;
-- còn lại giữ như cũ. Thân hàm chép từ schema.sql (khớp DB theo md5), chỉ đổi dòng đó.
create or replace function public.diem_tin(l listings)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f        jsonb;
  co_anh   boolean;
  co_hem   boolean;
  co_mt    boolean;
  co_kc    boolean;
  co_pn    boolean;
  d_vi_tri int := 0;
  d_dt     int := 0;
  d_kc     int := 0;
  d_pl     int := 0;
  d_gia    int := 0;
  d_tn     int := 0;
  d_cta    int := 0;
  d_anh    int := 0;
  so_anh   int := 0;
  thieu    text[] := '{}';
  mo_ta    text := public.bo_dau(coalesce(l.description, ''));
  la_dat   boolean := l.property_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh');
  tn_biet  boolean;
begin
  if l.id is null then return null; end if;
  select coalesce(jsonb_object_agg(x.question, x.answer), '{}'::jsonb) into f
    from (select distinct on (question) question, answer
            from public.listing_facts where listing_id = l.id
           order by question, created_at desc) x;
  select (select count(*) from public.listing_facts x
           where x.listing_id = l.id and x.question = 'hinh_anh')
       + (select count(*) from public.listing_media m where m.listing_id = l.id)
    into so_anh;
  co_anh := so_anh > 0;

  co_hem := l.alley_width_m is not null or l.access_type is not null
            or (f ? 'do_rong_hem') or (f ? 'do_rong_duong') or (f ? 'duong_vao') or (f ? 'duong_container')
            or l.property_type in ('chung_cu', 'phong_tro');
  d_vi_tri := (case when coalesce(btrim(l.location_raw), '') <> '' then 7 else 0 end)
            + (case when coalesce(btrim(l.ward), '') <> '' then 4 else 0 end)
            + (case when co_hem then 4 else 0 end);
  if not co_hem then thieu := array_append(thieu, case when la_dat or l.property_type = 'kho_xuong' then 'đường vào rộng mấy mét' else 'hẻm rộng mấy mét, xe hơi vào được không' end); end if;

  co_mt := l.frontage_m is not null or (f ? 'mat_tien')
           or l.property_type in ('chung_cu', 'phong_tro', 'toa_nha', 'kho_xuong', 'dat_nong_nghiep')
           or coalesce(f->>'dien_tich_dat', f->>'dien_tich', '') ~ '\d\s*[xX×]\s*\d';
  if l.area_m2 is not null then
    d_dt := 12 + (case when co_mt then 8 else 0 end);
    if not co_mt then thieu := array_append(thieu, 'chiều ngang mặt tiền'); end if;
  else
    thieu := array_append(thieu, 'diện tích');
  end if;

  if la_dat then
    d_kc := case when (f ? 'tho_cu') or l.planning_status is not null or (f ? 'quy_hoach') or (f ? 'thoi_han_su_dung') or (f ? 'len_tho_cu') then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, case l.property_type when 'dat_nong_nghiep' then 'quy hoạch, có lên thổ cư được không' when 'dat_kinh_doanh' then 'thời hạn sử dụng đất' else 'thổ cư bao nhiêu, quy hoạch ra sao' end); end if;
  elsif l.property_type = 'phong_tro' then
    d_kc := case when l.furnishing is not null or (f ? 'noi_that') then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, 'nội thất có gì'); end if;
  elsif l.property_type = 'mat_bang' then
    d_kc := case when l.floors is not null or (f ? 'ket_cau') or (f ? 'nganh_hang_phu_hop') then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, 'mấy tầng, hợp ngành gì'); end if;
  elsif l.property_type = 'toa_nha' then
    d_kc := (case when (f ? 'so_phong') or l.floors is not null or (f ? 'ket_cau') then 8 else 0 end)
          + (case when (f ? 'doanh_thu') or l.rent_income_vnd is not null or (f ? 'ty_le_lap_day') then 7 else 0 end);
    if not ((f ? 'so_phong') or l.floors is not null or (f ? 'ket_cau')) then thieu := array_append(thieu, 'bao nhiêu phòng, mấy tầng'); end if;
    if not ((f ? 'doanh_thu') or l.rent_income_vnd is not null or (f ? 'ty_le_lap_day')) then thieu := array_append(thieu, 'doanh thu mỗi tháng, tỷ lệ lấp đầy'); end if;
  elsif l.property_type = 'kho_xuong' then
    d_kc := (case when (f ? 'chieu_cao') or (f ? 'ket_cau') then 8 else 0 end)
          + (case when (f ? 'tai_trong_san') or (f ? 'tram_bien_ap') then 7 else 0 end);
    if not ((f ? 'chieu_cao') or (f ? 'ket_cau')) then thieu := array_append(thieu, 'chiều cao thông thủy'); end if;
    if not ((f ? 'tai_trong_san') or (f ? 'tram_bien_ap')) then thieu := array_append(thieu, 'tải trọng sàn, trạm biến áp'); end if;
  else
    co_kc := l.floors is not null or coalesce(btrim(l.floors_text), '') <> ''
             or (f ? 'ket_cau') or l.floor is not null or (f ? 'tang')
             or (l.property_type = 'nha_cap4' and (f ? 'hien_trang'));
    co_pn := l.bedrooms is not null or (f ? 'so_phong_ngu');
    d_kc := (case when co_kc then 8 else 0 end) + (case when co_pn then 7 else 0 end);
    if not co_kc then thieu := array_append(thieu, 'mấy tầng'); end if;
    if not co_pn then thieu := array_append(thieu, 'mấy phòng ngủ'); end if;
  end if;

  if l.legal_status is not null or (f ? 'phap_ly') or l.property_type = 'phong_tro' then d_pl := 10;
  else thieu := array_append(thieu, 'pháp lý (sổ hồng riêng/chung, hoàn công)'); end if;

  if l.price_vnd is not null then d_gia := 10; else thieu := array_append(thieu, 'giá'); end if;

  -- 20260924g: nhà ĐANG cho thuê / kinh doanh thì tiềm năng sử dụng đã rõ — không đòi chủ nói thêm.
  tn_biet := l.rent_income_vnd is not null or (f ? 'doanh_thu') or (f ? 'han_hop_dong_thue')
             or exists (select 1 from public.listing_facts x
                         where x.listing_id = l.id
                           and public.bo_dau(coalesce(x.answer, '')) ~ '(dang cho thue|dang thue|dang kinh doanh|de kinh doanh|hop dong thue|khach thue|cho [a-z0-9 ]{1,30} thue)')
             or mo_ta ~ '(dang cho thue|dang thue|dang kinh doanh|hop dong thue|khach thue)';
  if f ? 'tiem_nang' or f ? 'muc_dich' or f ? 'nganh_hang_phu_hop' or tn_biet then d_tn := 10;
  elsif coalesce(l.floors, 0) >= 3 or coalesce(l.bedrooms, 0) >= 3
     or l.access_type = 'mat_tien' or coalesce(l.alley_width_m, 0) >= 4
     or l.property_type in ('chung_cu', 'mat_bang', 'phong_tro', 'biet_thu', 'toa_nha', 'kho_xuong', 'dat_kinh_doanh') or (f ? 'san_vuon')
     or mo_ta ~ '(kinh doanh|cho thue|chdv|dau tu|van phong|o ngay|buon ban|mo shop|mo quan)'
  then d_tn := 5; thieu := array_append(thieu, 'tiềm năng sử dụng (ở, cho thuê hay kinh doanh)');
  else thieu := array_append(thieu, 'tiềm năng sử dụng (ở, cho thuê hay kinh doanh)'); end if;

  if l.code is not null then d_cta := 10; end if;

  d_anh := case when so_anh >= 3 then 10 when so_anh = 2 then 7 when so_anh = 1 then 4 else 0 end;
  if so_anh = 0 then thieu := array_append(thieu, case
      when la_dat then 'vài tấm ảnh (lô đất, sổ, đường vào — ảnh nào cũng được)'
      when l.property_type = 'chung_cu' then 'vài tấm ảnh (căn hộ, sổ, view — ảnh nào cũng được)'
      when l.property_type = 'phong_tro' then 'vài tấm ảnh (phòng, lối vào — ảnh nào cũng được)'
      when l.property_type = 'kho_xuong' then 'vài tấm ảnh (kho, sổ, đường vào — ảnh nào cũng được)'
      else 'vài tấm ảnh (nhà, sổ, hẻm — ảnh nào cũng được)' end);
  elsif so_anh < 3 then thieu := array_append(thieu, format('thêm ảnh cho đủ 3 tấm (đang có %s)', so_anh)); end if;

  return jsonb_build_object(
    'diem', d_vi_tri + d_dt + d_kc + d_pl + d_gia + d_tn + d_cta + d_anh,
    'chi_tiet', jsonb_build_object(
      'vi_tri_hem', d_vi_tri, 'dien_tich', d_dt, 'ket_cau', d_kc, 'phap_ly', d_pl,
      'gia', d_gia, 'tiem_nang', d_tn, 'goi_hanh_dong', d_cta, 'anh', d_anh),
    'thieu', to_jsonb(thieu),
    'co_anh', co_anh,
    'so_anh', so_anh);
end $function$
;
