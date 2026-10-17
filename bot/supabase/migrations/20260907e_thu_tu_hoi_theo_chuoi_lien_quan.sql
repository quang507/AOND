-- 20260907e — thứ tự hỏi người bán theo chuỗi LIÊN QUAN, và hỏi GIÁ + PHƯỜNG
-- (FR-176 b/c — bản kịch bản cuối của sếp, Gemini "AI Ơi Nhà Đất" lượt 93).
--
-- HAI VẤN ĐỀ THẬT, cùng bảng `required_facts`:
--
-- 1. THỨ TỰ HỎI LÀ NGẪU NHIÊN. Nhà phố có 4 câu cùng priority 1 (dien_tich_dat,
--    do_rong_hem, ket_cau, phap_ly); view `listing_missing_facts` xếp theo
--    priority rồi fact_key A→Z, nên lượt 07/09 hỏi diện tích → kết cấu → pháp lý
--    → hướng. Sếp chốt chuỗi khác hẳn, mỗi câu nối từ câu trước: hẻm rộng mấy
--    mét, xe vào được không → mấy lầu mấy phòng → sổ/diện tích → pháp lý → giá.
--    Hỏi theo chuỗi thì câu sau mới "bám" được câu trước (đọc "hẻm 5m xe hơi
--    tới cửa" rồi hỏi "mấy lầu" là tự nhiên; đọc "168m2" rồi hỏi "hướng" thì
--    không bám vào đâu).
--
-- 2. KHÔNG AI HỎI GIÁ. `listings_autopublish` cần price_vnd + ward, nhưng
--    `gia`/`phuong` KHÔNG có trong required_facts và `ask-seller` cũng không
--    hỏi — tin #BDS-Q5-0174 rao từ chat không có giá, và sẽ nằm cho_thong_tin
--    vĩnh viễn mà không ai hỏi câu quyết định. Cửa fact đã xử lý được 'gia' và
--    'phuong' (listing_facts_sync_cols), chỉ thiếu người HỎI. Thêm hai khoá đó
--    cho MỌI loại BĐS, đặt cuối chuỗi (sếp: giá hỏi sau khi đã có sổ; quyết định
--    cũ "câu đầu không phải giá/phường" — e2e V1.3b — vẫn giữ).
--
-- View phải biết "đã có giá/phường" qua CỘT (tin nhập Excel có price_vnd mà
-- không có fact 'gia'), không thì hỏi giá cả căn đã có giá.

-- ── Nhà phố: chuỗi của sếp ─────────────────────────────────────────────────
update public.required_facts set priority = 1 where property_type = 'nha_pho' and fact_key = 'do_rong_hem';
update public.required_facts set priority = 2 where property_type = 'nha_pho' and fact_key = 'ket_cau';
update public.required_facts set priority = 3 where property_type = 'nha_pho' and fact_key = 'dien_tich_dat';
update public.required_facts set priority = 4 where property_type = 'nha_pho' and fact_key = 'phap_ly';
update public.required_facts set priority = 7 where property_type = 'nha_pho' and fact_key = 'huong';
update public.required_facts set priority = 8 where property_type = 'nha_pho' and fact_key = 'quy_hoach';
update public.required_facts set priority = 9 where property_type = 'nha_pho' and fact_key = 'nam_xay';

-- ── Giá + phường cho mọi loại: sau các câu chuyên môn, trước câu phụ ────────
-- Nhà phố: 5 = phường, 6 = giá (chèn giữa pháp lý và hướng). Loại khác: nối
-- vào sau câu cuối hiện có.
insert into public.required_facts (property_type, fact_key, priority)
select 'nha_pho'::property_type, 'phuong', 5 union all select 'nha_pho'::property_type, 'gia', 6
on conflict (property_type, fact_key) do update set priority = excluded.priority;

insert into public.required_facts (property_type, fact_key, priority)
select t.property_type, k.fact_key, coalesce(max(r.priority), 0) + k.them
from unnest(enum_range(null::property_type)) as t(property_type)
cross join (values ('phuong', 1), ('gia', 2)) as k(fact_key, them)
left join public.required_facts r on r.property_type = t.property_type
where t.property_type <> 'nha_pho'
group by t.property_type, k.fact_key, k.them
on conflict (property_type, fact_key) do nothing;

-- ── View: "đã có" giá/phường đọc từ cột, không chỉ từ fact ──────────────────
-- CREATE OR REPLACE giữ nguyên quyền (chỉ service_role — soát 29/08).
create or replace view public.listing_missing_facts as
 select l.id as listing_id,
        rf.fact_key,
        rf.priority
   from public.listings l
   join public.required_facts rf
     on rf.property_type = coalesce(l.property_type, 'chua_ro'::property_type)
   left join public.listing_facts lf
     on lf.listing_id = l.id and lf.question = rf.fact_key
  where lf.id is null
    and not (
         (rf.fact_key = 'ket_cau' and l.floors is not null)
      or (rf.fact_key in ('do_rong_hem', 'do_rong_duong')
          and (l.alley_width_m is not null or l.access_type = 'mat_tien'))
      or (rf.fact_key = 'phap_ly' and l.legal_status is not null)
      or (rf.fact_key = 'huong' and l.direction is not null)
      or (rf.fact_key = 'so_phong_ngu' and l.bedrooms is not null)
      or (rf.fact_key = 'tang' and l.floor is not null)
      or (rf.fact_key in ('dien_tich', 'dien_tich_dat', 'dien_tich_tim_tuong')
          and l.area_m2 is not null)
      or (rf.fact_key = 'nam_xay' and l.year_built is not null)
      or (rf.fact_key = 'noi_that' and l.furnishing is not null)
      or (rf.fact_key = 'mat_tien' and l.frontage_m is not null)
      or (rf.fact_key = 'quy_hoach' and l.planning_status is not null)
      -- FR-176: giá / phường đã có ở cột (nhập Excel, form admin) thì không hỏi.
      or (rf.fact_key = 'gia' and l.price_vnd is not null)
      or (rf.fact_key = 'phuong' and l.ward is not null)
    )
  order by l.id, rf.priority, rf.fact_key;

comment on view public.listing_missing_facts is
  '[RỔ HÀNG] Câu còn thiếu của từng tin, xếp theo priority của required_facts — đây là THỨ TỰ BOT HỎI. Nhà phố theo chuỗi sếp chốt 07/09/2026: hẻm → kết cấu → diện tích → pháp lý → phường → giá → hướng → quy hoạch → năm xây. "Đã có" đọc từ cả fact lẫn cột. FR-144/FR-176.';
