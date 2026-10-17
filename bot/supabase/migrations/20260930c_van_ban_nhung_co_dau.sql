-- 20260930c: văn bản NHÚNG của tin rao (van_ban_nhung) ra tiếng Việt CÓ DẤU (30/09/2026).
--
-- Bắn thử vector 30/09 (ban-thu `soi_vector`, nhà phố Trần Bình Trọng + nhà cấp 4 Lê Văn Sỹ): văn bản gửi Gemini có
-- "bo sung: …", "nguon nuoc: …", "Đặc điểm: yen tinh, san vuon" (khoá snake_case bỏ gạch), và địa chỉ lặp
-- "Trần Bình Trọng, Trần Bình Trọng, Quận 5" (location_raw + street). Nay:
--   · tên ô fact đọc qua nhan_fact() (đã có sẵn, tiếng Việt);
--   · nhãn tìm kiếm đọc qua ten_nhan() — SINH TỪ bot/supabase/functions/_shared/extraction/nhan.ts (TU_DIEN_NHAN[k].ten);
--     bot/tests/ten-nhan-sql.mjs đỏ khi hai bên lệch (thêm nhãn ở nhan.ts là thêm dòng ở đây bằng migration mới);
--   · street / ward / district đã nằm trong location_raw thì không lặp.
-- Văn bản đổi → md5 đổi → nhung-tick nhúng lại các tin trên kệ ở lượt kế (tối đa 10 tin / 2 phút).

create or replace function public.ten_nhan(p_khoa text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_khoa
    when 'yen_tinh' then 'yên tĩnh'
    when 'an_ninh' then 'an ninh'
    when 'dan_tri_cao' then 'dân trí cao'
    when 'gan_cho' then 'gần chợ'
    when 'gan_truong' then 'gần trường học'
    when 'gan_benh_vien' then 'gần bệnh viện'
    when 'gan_sieu_thi' then 'gần siêu thị'
    when 'gan_cong_vien' then 'gần công viên'
    when 'gan_metro' then 'gần metro'
    when 'gan_trung_tam' then 'gần trung tâm'
    when 'moi_sua' then 'mới sửa / mới xây'
    when 'hem_thong' then 'hẻm thông'
    when 'hem_cut' then 'hẻm cụt'
    when 'khong_ngap' then 'không ngập'
    when 'xe_hoi_vao_nha' then 'xe hơi vào nhà'
    when 'xe_hoi_quay_dau' then 'xe hơi quay đầu'
    when 'thang_may' then 'có thang máy'
    when 'san_thuong' then 'sân thượng'
    when 'san_vuon' then 'sân vườn'
    when 'gac_lung' then 'có gác lửng'
    when 'noi_that_full' then 'full nội thất'
    when 'kinh_doanh' then 'kinh doanh được'
    when 'dong_tien' then 'đang cho thuê, có dòng tiền'
    when 'view_song' then 'view sông'
    when 'view_cong_vien' then 'view công viên'
    when 'can_goc' then 'căn góc / 2 mặt tiền'
    when 'ho_boi' then 'có hồ bơi'
    when 'nha_hoan_cong' then 'đã hoàn công'
    when 'tho_cu_100' then 'thổ cư 100%'
    else replace(coalesce(p_khoa, ''), '_', ' ') end;
$$;
comment on function public.ten_nhan(text) is
  'Tên tiếng Việt của nhãn tìm kiếm (listings.nhan) — bản SQL của TU_DIEN_NHAN trong _shared/extraction/nhan.ts; bot/tests/ten-nhan-sql.mjs canh lệch.';
revoke all on function public.ten_nhan(text) from public, anon, authenticated;
grant execute on function public.ten_nhan(text) to service_role;

create or replace function public.van_ban_nhung(p_id uuid)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select public.che_sdt(concat_ws('. ',
    (case l.deal when 'cho_thue' then 'Cho thuê ' else 'Bán ' end) ||
      case l.property_type
        when 'nha_pho' then 'nhà phố' when 'nha_cap4' then 'nhà cấp 4' when 'chung_cu' then 'căn hộ chung cư'
        when 'dat' then 'đất' when 'biet_thu' then 'biệt thự' when 'phong_tro' then 'phòng trọ'
        when 'mat_bang' then 'mặt bằng' when 'toa_nha' then 'toà nhà, căn hộ dịch vụ'
        when 'dat_nong_nghiep' then 'đất nông nghiệp' when 'dat_kinh_doanh' then 'đất kinh doanh'
        when 'kho_xuong' then 'kho xưởng' else 'bất động sản' end,
    -- 20260930c: street / ward / district đã nằm trong location_raw thì không lặp ("Trần Bình Trọng, Trần Bình Trọng").
    nullif(concat_ws(', ', l.location_raw,
      case when position(lower(l.street) in lower(coalesce(l.location_raw, ''))) = 0 then l.street end,
      case when position(lower(l.ward) in lower(coalesce(l.location_raw, ''))) = 0 then l.ward end,
      case when position(lower(l.district) in lower(coalesce(l.location_raw, ''))) = 0 then l.district end), ''),
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
    -- 20260930c: nhãn ra tên tiếng Việt (ten_nhan), không còn "yen tinh, san vuon".
    case when coalesce(array_length(l.nhan, 1), 0) > 0
      then 'Đặc điểm: ' || array_to_string(array(select public.ten_nhan(x) from unnest(l.nhan) x), ', ') end,
    -- 20260924b: fact CHỮ TỰ DO — MỌI câu trả lời (bản trước lấy câu mới nhất mỗi khoá: "sân thượng" đè mất
    -- "có 1 phòng ngủ ngay tầng trệt" cùng khoá bo_sung); khoá thông số đã có cột thì bỏ (lặp).
    -- 20260930c: tên ô qua nhan_fact() ("thông tin bổ sung", "sân vườn"), không còn "bo sung", "san vuon".
    (select string_agg(public.nhan_fact(f.question) || ': ' || f.answer, '. ' order by f.question, f.dau)
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
$$;
