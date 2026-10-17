-- 20260928c — tin ĐẤT hỏi giá ngay sau diện tích (FR-239 k).
--
-- Chủ dự án 28/09/2026 ("đất hỏi giá sớm hơn luôn"), sau khi phát lại test đất Cần Đước: bot hỏi diện tích → đường →
-- hướng → hạ tầng → thổ cư rồi mới tới giá (ưu tiên 12); khách bảo "đăng đi" thì tin thiếu giá, không lên kệ được.
-- Ba loại đất: giá lên ưu tiên 4 (ngay sau diện tích 3), các câu cơ bản 4–11 lùi một bậc. Loại khác không đổi.
update public.required_facts
   set priority = priority + 1
 where property_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh')
   and fact_key <> 'gia'
   and priority between 4 and 11;

update public.required_facts
   set priority = 4
 where property_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh')
   and fact_key = 'gia';
