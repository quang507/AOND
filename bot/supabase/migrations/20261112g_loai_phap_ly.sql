-- 20261112g (SRS-5.1zzzzzzz435, chủ dự án 12/11/2026 "sửa hết từ gốc"): loại giấy tờ MỘT nguồn.
-- Bắn thử production 12/11: sổ chung thừa kế rao thành "đã có sổ", đất thuê nhà nước lên cột "Có sổ", mua bằng hợp đồng ủy quyền không có mã,
-- sổ đang làm của nhà phố không có câu hỏi theo sau. Gốc: lõi đọc loại giấy theo 7 mã thô (co_so…), cột `legal_status` 5 mã CHECK đoán bằng
-- regex trên chữ khách, nhãn viết tay ở hàm này. Nay bảng `loai_phap_ly` (nạp từ lõi `src/aioi/schema.py` LOAI_PHAP_LY — sửa ở đó rồi thêm
-- dòng ở đây) là nơi duy nhất định nghĩa mã + nhãn; cột là khoá ngoại tới bảng; lõi ghi thẳng mã AI đọc vào cột.
create table if not exists public.loai_phap_ly (
  ma text primary key,
  nhan text not null,
  la_so boolean not null,
  thu_tu integer not null
);
alter table public.loai_phap_ly enable row level security;
drop policy if exists loai_phap_ly_doc on public.loai_phap_ly;
create policy loai_phap_ly_doc on public.loai_phap_ly for select to anon, authenticated using (true);
grant select on public.loai_phap_ly to anon, authenticated;

insert into public.loai_phap_ly (ma, nhan, la_so, thu_tu) values
  ('so_hong_rieng', 'Sổ hồng riêng', true, 1),
  ('so_hong_chung', 'Sổ hồng chung', true, 2),
  ('so_hong', 'Có sổ', true, 3),
  ('hdmb', 'Hợp đồng mua bán', false, 4),
  ('dat_thue', 'Đất thuê', false, 5),
  ('uy_quyen', 'Hợp đồng ủy quyền', false, 6),
  ('giay_tay', 'Giấy tay / vi bằng', false, 7),
  ('dang_lam', 'Sổ đang làm', false, 8),
  ('chua_co', 'Chưa có sổ', false, 9)
on conflict (ma) do update set nhan = excluded.nhan, la_so = excluded.la_so, thu_tu = excluded.thu_tu;

alter table public.listings drop constraint if exists listings_legal_status_check;
alter table public.listings drop constraint if exists listings_legal_status_fkey;
alter table public.listings add constraint listings_legal_status_fkey foreign key (legal_status) references public.loai_phap_ly (ma);

-- Mã AI cũ `co_so` (có sổ, không phân riêng / chung) → mã cột tương ứng; cột trống thì "so_hong" (có sổ, chưa rõ riêng / chung).
update public.listings
   set boc_tach = jsonb_set(boc_tach, '{_phap_ly_trang_thai}',
         to_jsonb(case when legal_status in ('so_hong_rieng', 'so_hong_chung') then legal_status else 'so_hong' end))
 where boc_tach->>'_phap_ly_trang_thai' = 'co_so';

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
    -- 20260930c: street / ward / district đã nằm trong location_raw thì không lặp ("Trần Bình Trọng, Trần Bình Trọng").
    nullif(concat_ws(', ', l.location_raw,
      case when position(lower(l.street) in lower(coalesce(l.location_raw, ''))) = 0 then l.street end,
      case when position(lower(l.ward) in lower(coalesce(l.location_raw, ''))) = 0 then l.ward end,
      case when position(lower(l.district) in lower(coalesce(l.location_raw, ''))) = 0 then l.district end), ''),
    -- 20260923g: câu rao GỐC của người bán — chi tiết bot không lưu vào ô nào ("sau nhà có đất trống cho chó mèo
    -- chạy", "phòng nào cũng có cửa sổ") vẫn vào vector. SĐT che bởi che_sdt() bọc ngoài cả đoạn.
    -- 20261022h (SRS-5.1zzzzzzz142): tin nhắn GỐC của người bán (lõi ghi `listing_noi_bo.du_lieu->'tin_goc'`, đã che SĐT, nguyên văn không
    -- chuẩn hoá) đứng thay bản tin AI viết lại — bản đó cùng một khuôn nên vector các căn giống nhau, còn lời gốc giữ chi tiết riêng.
    -- Tin không có tin gốc (admin / Excel tạo) vẫn dùng `description` như cũ.
    (select 'Người bán nhắn: ' || left(n.du_lieu->>'tin_goc', 3000) from public.listing_noi_bo n
      where n.listing_id = l.id and coalesce(btrim(n.du_lieu->>'tin_goc'), '') <> ''),
    case when coalesce(btrim(l.description), '') <> ''
          and not exists (select 1 from public.listing_noi_bo n where n.listing_id = l.id and coalesce(btrim(n.du_lieu->>'tin_goc'), '') <> '')
      then 'Người bán tả: ' || left(l.description, 3000) end,
    (select 'Dự án ' || p.name from public.projects p where p.id = l.project_id),
    -- 20260924b: bỏ diện tích / ngang dài / giá / phòng ngủ / WC — đã LỌC CỨNG bằng cột, và lặp lại 2–3 lần (câu rao +
    -- cột + fact) làm các căn cùng khoảng giá, cùng kiểu nhà giống nhau tới 0,99; chi tiết riêng từng căn mới là nghĩa.
    l.floors_text,
    case l.access_type
      when 'mat_tien' then 'Mặt tiền đường' when 'hem_xe_tai' then 'Hẻm xe tải'
      when 'hem_xe_hoi' then 'Hẻm xe hơi' when 'hem_xe_may' then 'Hẻm xe máy' when 'hem' then 'Trong hẻm' end ||
      case when l.alley_width_m is not null then ' rộng ' || trim_scale(l.alley_width_m) || ' m' else '' end,
    -- 20261112g (SRS-5.1zzzzzzz435): nhãn loại giấy đọc bảng `loai_phap_ly` (một nguồn với lõi `schema.LOAI_PHAP_LY`).
    (select t.nhan from public.loai_phap_ly t where t.ma = l.legal_status) ||
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
    (select string_agg(public.nhan_fact(f.key) || ': ' || f.value, '. ' order by f.key)
       from jsonb_each_text(public.o_boc_tach(l.boc_tach)) f
      where f.key not in ('hinh_anh', 'duyet_tin', 'danh_gia', 'xac_nhan_lich', 'con_ban', 'nhan',
                  'vi_tri', 'phuong', 'quan', 'dien_tich', 'dien_tich_dat', 'dien_tich_san', 'dien_tich_tim_tuong',
                  'gia', 'gia_raw', 'so_phong_ngu', 'so_wc', 'so_phong', 'ket_cau', 'do_rong_hem', 'do_rong_duong',
                  'phap_ly', 'mat_tien', 'huong', 'tang', 'loai_giao_dich', 'loai_bds',
                  'loai_hinh', 'dia_chi', 'du_an', 'ma_so_can', 'gan_nga_tu', 'dien_tich_nha', 'kich_thuoc', 'lo_gioi_hem',
                  'phap_ly_hoan_cong', 'phap_ly_so_do', 'phap_ly_so_hong', 'tang_toa'))
  ))
  from public.listings l where l.id = p_id;
$function$
;
