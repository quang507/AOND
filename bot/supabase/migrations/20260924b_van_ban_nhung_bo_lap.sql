-- 20260924b — FR-216 j: văn bản nhúng vector tin BỎ thông số lặp, GỘP mọi fact chữ tự do.
--
-- Chủ dự án 24/09/2026 duyệt ("làm 1-5 đi", mục 2): đo thật 24/09 — 5 căn test cùng Quận 5, 6,3–6,8 tỷ, hẻm 4m chênh
-- nhau 0,005 điểm cosine vì văn bản lặp diện tích / giá / phòng ngủ 2–3 lần (câu rao + cột + fact); chi tiết riêng
-- ("phòng ngủ ngay tầng trệt") chỉ là mẩu nhỏ. Và fact lấy câu MỚI NHẤT mỗi khoá nên bo_sung "sân thượng" đè mất
-- "có 1 phòng ngủ ngay tầng trệt". Nay: giữ loại, địa chỉ, câu rao gốc, dự án, kết cấu chữ, đường vào, pháp lý, hướng,
-- nhãn…; bỏ diện tích, ngang dài, giá, phòng ngủ, WC (đã lọc cứng bằng cột); fact: mọi câu trả lời của khoá chữ tự do,
-- bỏ khoá thông số đã có cột. md5 đổi → nhung-tick tự nhúng lại các tin đang lên kệ.

CREATE OR REPLACE FUNCTION public.van_ban_nhung(p_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.che_sdt(concat_ws('. ',
    (case l.deal when 'cho_thue' then 'Cho thuê ' else 'Bán ' end) ||
      case l.property_type
        when 'nha_pho' then 'nhà phố' when 'nha_cap4' then 'nhà cấp 4' when 'chung_cu' then 'căn hộ chung cư'
        when 'dat' then 'đất' when 'biet_thu' then 'biệt thự' when 'phong_tro' then 'phòng trọ'
        when 'mat_bang' then 'mặt bằng' when 'toa_nha' then 'toà nhà, căn hộ dịch vụ'
        when 'dat_nong_nghiep' then 'đất nông nghiệp' when 'dat_kinh_doanh' then 'đất kinh doanh'
        when 'kho_xuong' then 'kho xưởng' else 'bất động sản' end,
    nullif(concat_ws(', ', l.location_raw, l.street, l.ward, l.district), ''),
    -- 20260923g: câu rao GỐC của người bán — chi tiết bot không lưu vào ô nào ("sau nhà có đất trống cho chó mèo
    -- chạy", "phòng nào cũng có cửa sổ") vẫn vào vector. SĐT che bởi che_sdt() bọc ngoài cả đoạn.
    case when coalesce(btrim(l.description), '') <> '' then 'Người bán tả: ' || left(l.description, 3000) end,
    (select 'Dự án ' || p.name from public.projects p where p.id = l.project_id),
    -- 20260924b: bỏ diện tích / ngang dài / giá / phòng ngủ / WC — đã LỌC CỨNG bằng cột, và lặp lại 2–3 lần (câu rao +
    -- cột + fact) làm các căn cùng khoảng giá, cùng kiểu nhà giống nhau tới 0,99; chi tiết riêng từng căn mới là nghĩa.
    l.floors_text,
    case l.access_type
      when 'mat_tien' then 'Mặt tiền đường' when 'hem_xe_tai' then 'Hẻm xe tải'
      when 'hem_xe_hoi' then 'Hẻm xe hơi' when 'hem_xe_may' then 'Hẻm xe máy' when 'hem' then 'Trong hẻm' end ||
      case when l.alley_width_m is not null then ' rộng ' || trim_scale(l.alley_width_m) || ' m' else '' end,
    case l.legal_status
      when 'so_hong_rieng' then 'Sổ hồng riêng' when 'so_hong_chung' then 'Sổ hồng chung' when 'so_hong' then 'Có sổ'
      when 'hdmb' then 'Hợp đồng mua bán' when 'giay_tay' then 'Giấy tay' end ||
      case when l.has_completion then ', đã hoàn công' else '' end,
    case when l.direction is not null then 'Hướng ' || l.direction end,
    case when l.floor is not null then 'Tầng ' || l.floor end,
    case when l.car_in_house then 'Xe hơi vào tận nhà' end,
    case when l.corner_lot then 'Căn góc' end,
    case when l.has_elevator then 'Có thang máy' end,
    case when coalesce(array_length(l.nhan, 1), 0) > 0
      then 'Đặc điểm: ' || array_to_string(array(select replace(x, '_', ' ') from unnest(l.nhan) x), ', ') end,
    -- 20260924b: fact CHỮ TỰ DO — MỌI câu trả lời (bản trước lấy câu mới nhất mỗi khoá: "sân thượng" đè mất
    -- "có 1 phòng ngủ ngay tầng trệt" cùng khoá bo_sung); khoá thông số đã có cột thì bỏ (lặp).
    (select string_agg(replace(f.question, '_', ' ') || ': ' || f.answer, '. ' order by f.question, f.dau)
       from (select question, answer, min(created_at) as dau
               from public.listing_facts
              where listing_id = l.id and coalesce(btrim(answer), '') <> ''
                and question not in ('hinh_anh', 'duyet_tin', 'danh_gia', 'xac_nhan_lich', 'con_ban', 'nhan',
                  'vi_tri', 'phuong', 'quan', 'dien_tich', 'dien_tich_dat', 'dien_tich_san', 'dien_tich_tim_tuong',
                  'gia', 'gia_raw', 'so_phong_ngu', 'so_wc', 'so_phong', 'ket_cau', 'do_rong_hem', 'do_rong_duong',
                  'phap_ly', 'mat_tien', 'huong', 'tang', 'loai_giao_dich', 'loai_bds')
              group by question, answer) f)
  ))
  from public.listings l where l.id = p_id;
$function$;
