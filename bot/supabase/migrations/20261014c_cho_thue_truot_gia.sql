-- 20261014c — tin CHO THUÊ căn hộ / nhà cấp 4 / biệt thự hỏi bù trượt giá thuê như nhà phố (SRS-5.1zzzzzzz5).
--
-- Soát required_facts 14/10/2026: nhánh cho thuê có `truot_gia` (giá thuê tăng mỗi năm mấy %) cho nhà phố, mặt bằng, kho xưởng nhưng
-- KHÔNG có cho chung_cu, nha_cap4, biet_thu — cùng một câu hỏi người thuê nào cũng hỏi, chỉ thiếu vì seed 20260909h/i viết theo
-- từng loại bằng tay. Thêm vào nhóm `sau_dang` (hỏi bù sau khi lên kệ, không chặn bản nháp), ngay sau câu thời hạn thuê.
insert into public.required_facts (property_type, fact_key, priority, nhom, deal)
select v.pt::public.property_type, 'truot_gia', v.p, 'sau_dang', 'cho_thue'::public.listing_deal
  from (values ('chung_cu', 47), ('nha_cap4', 42), ('biet_thu', 47)) as v(pt, p)
 where not exists (select 1 from public.required_facts r
                    where r.property_type = v.pt::public.property_type and r.fact_key = 'truot_gia' and r.deal = 'cho_thue');
