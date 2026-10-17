-- 20261001c — phòng ngủ hỏi SAU câu gấp (nhà phố, nhà cấp 4, biệt thự).
-- Chủ dự án 01/10/2026: "phòng ngủ tao nghĩ hỏi nó sau sau tí đi". Bắn thật cùng ngày (lx-tam-01/02/03): phòng ngủ (21) vẫn
-- hỏi ngay sau pháp lý (16), trước phường (22) và gấp (23). Nay: … pháp lý → phường → gấp → PHÒNG NGỦ → bản nháp. Ảnh 24 → 25
-- cho ba loại này để phòng ngủ (24) đứng ngay trước ảnh (câu kế là ảnh = gửi bản nháp). Căn hộ giữ nguyên (phòng ngủ là thông số
-- chính, priority 4). Chỉ đổi dòng còn đúng số cũ — ai đã chỉnh tay ở Table Editor thì giữ.
update public.required_facts set priority = 25
 where property_type in ('nha_pho', 'nha_cap4', 'biet_thu') and fact_key = 'hinh_anh' and priority = 24;
update public.required_facts set priority = 24
 where property_type in ('nha_pho', 'nha_cap4', 'biet_thu') and fact_key = 'so_phong_ngu' and priority = 21;
