-- 20260928i — FR-241 l (tiếp): nhà cấp 4 và biệt thự cũng hỏi phòng ngủ SAU giá và pháp lý, như nhà phố (20260928f).
-- Chủ dự án 28/09/2026: "sao cứ hỏi phòng ngủ ko z để sau rồi hỏi đi" — 20260928f mới đổi nhà phố; nhà cấp 4 (id 39) và
-- biệt thự (id 102) vẫn priority 5, hỏi ngay sau kết cấu / hiện trạng. Căn hộ giữ nguyên (phòng ngủ là thông số chính).
update public.required_facts set priority = 21
 where property_type in ('nha_cap4', 'biet_thu') and fact_key = 'so_phong_ngu' and priority = 5;
