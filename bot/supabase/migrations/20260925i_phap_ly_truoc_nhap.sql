-- 20260925i — pháp lý hỏi TRƯỚC bản nháp (FR-229 a).
--
-- Chủ dự án 25/09/2026 gửi danh sách câu hỏi người bán 5 nhóm, nhóm 2 "Pháp lý (đây là phần quan trọng nhất)": ai đứng tên
-- sổ, đồng sở hữu, thế chấp, diện tích xây khớp sổ / hoàn công, quy hoạch / lộ giới / tranh chấp; chọn "Pháp lý hỏi trước
-- nháp". Trước bản này: `the_chap` chỉ hỏi bù SAU khi lên kệ, `quy_hoach` nhóm `phu` (không bao giờ hỏi), ba câu còn lại
-- chưa có. Hoàn công / đồng sở hữu đã là câu nhánh sau câu sổ (FR-223, `re-nhanh.ts`).
--
-- Chỉ tin BÁN; tin THUÊ giữ như cũ. Dải ưu tiên (chonCauKe): pháp lý 16–21 → phường 22 → gấp 23 → ảnh 24 (trước 17–19).

-- (1) Dời phường / gấp / ảnh ra sau dải pháp lý.
update public.required_facts set priority = priority + 5
 where fact_key in ('phuong', 'gap', 'hinh_anh') and priority between 17 and 19;

-- (2) the_chap / quy_hoach đang dùng chung cho mọi giao dịch (deal null): tách — dòng cũ thành câu của tin BÁN, hỏi trước
--     nháp; bản sao cho THUÊ giữ nhóm và thứ tự cũ. Phải đổi dòng cũ TRƯỚC rồi mới chép: trigger `required_facts_khong_trung`
--     chặn một dòng riêng theo giao dịch nằm cạnh dòng chung.
create temp table _chung_cu on commit drop as
select property_type, fact_key, priority, nhom
  from public.required_facts
 where fact_key in ('the_chap', 'quy_hoach') and deal is null
   and property_type in ('nha_pho', 'nha_cap4', 'biet_thu', 'chung_cu', 'dat', 'toa_nha', 'dat_nong_nghiep', 'dat_kinh_doanh', 'kho_xuong');
update public.required_facts r
   set deal = 'ban', nhom = 'co_ban',
       priority = case when r.nhom = 'co_ban' then r.priority when r.fact_key = 'the_chap' then 18 else 19 end  -- đất NN giữ 14
  from _chung_cu c
 where r.property_type = c.property_type and r.fact_key = c.fact_key and r.deal is null;
insert into public.required_facts (property_type, fact_key, priority, nhom, deal)
select property_type, fact_key, priority, nhom, 'cho_thue'::public.listing_deal from _chung_cu;

-- (3) Câu mới + câu cũ chưa có ở loại đó. Căn hộ không hỏi quy hoạch / khớp sổ; đất (mọi loại) không hỏi khớp sổ.
insert into public.required_facts (property_type, fact_key, priority, nhom, deal)
select v.loai::public.property_type, v.khoa, v.uu_tien, 'co_ban', 'ban'::public.listing_deal
  from (values
    ('nha_pho', 'nguoi_dung_ten', 17), ('nha_cap4', 'nguoi_dung_ten', 17), ('biet_thu', 'nguoi_dung_ten', 17),
    ('chung_cu', 'nguoi_dung_ten', 17), ('dat', 'nguoi_dung_ten', 17), ('toa_nha', 'nguoi_dung_ten', 17),
    ('dat_nong_nghiep', 'nguoi_dung_ten', 17), ('dat_kinh_doanh', 'nguoi_dung_ten', 17), ('kho_xuong', 'nguoi_dung_ten', 17),
    ('dat_kinh_doanh', 'the_chap', 18),
    ('biet_thu', 'quy_hoach', 19), ('toa_nha', 'quy_hoach', 19), ('kho_xuong', 'quy_hoach', 19),
    ('nha_pho', 'tranh_chap', 20), ('nha_cap4', 'tranh_chap', 20), ('biet_thu', 'tranh_chap', 20),
    ('chung_cu', 'tranh_chap', 20), ('dat', 'tranh_chap', 20), ('toa_nha', 'tranh_chap', 20),
    ('dat_nong_nghiep', 'tranh_chap', 20), ('dat_kinh_doanh', 'tranh_chap', 20), ('kho_xuong', 'tranh_chap', 20),
    ('nha_pho', 'dien_tich_khop_so', 21), ('nha_cap4', 'dien_tich_khop_so', 21), ('biet_thu', 'dien_tich_khop_so', 21),
    ('toa_nha', 'dien_tich_khop_so', 21), ('kho_xuong', 'dien_tich_khop_so', 21)
  ) as v(loai, khoa, uu_tien)
 where not exists (
   select 1 from public.required_facts r
    where r.property_type = v.loai::public.property_type and r.fact_key = v.khoa and r.deal = 'ban'
 );

-- (4) "Sổ đứng tên ai" / "đồng sở hữu với ai" mang TÊN NGƯỜI THẬT (CLAUDE.md §5), mà trang tin in mọi fact anon đọc được
--     (`app/nha-dat/[code]/page.tsx`) — chặn cả hai khỏi anon. `dong_so_huu_voi` (FR-223) đã hở từ 24/09.
drop policy if exists anon_read_listing_facts on public.listing_facts;
create policy anon_read_listing_facts on public.listing_facts
  for select to anon, authenticated
  using (
    question <> all (array['hinh_anh', 'dia_chi_chi_tiet', 'vi_tri', 'dia_chi', 'so_nha', 'lien_he', 'so_dien_thoai',
                           'nguoi_dung_ten', 'dong_so_huu_voi'])
    and exists (
      select 1 from listings l
       where l.id = listing_facts.listing_id
         and l.status = any (array['dang_ban', 'dang_quan_tam', 'da_chot'])
    )
  );

comment on policy anon_read_listing_facts on public.listing_facts is
  'FR-104/NFR-07: anon đọc fact của tin ĐANG LÊN KỆ, trừ ảnh, mọi khoá mang địa chỉ chính xác hay liên hệ, và tên người '
  'đứng sổ / đồng sở hữu (FR-229). Bản cũ chặn "dia_chi_chi_tiet" — một khoá chưa từng tồn tại — trong khi khoá thật là '
  '"vi_tri" (review 10/09).';
