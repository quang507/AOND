-- 20260917b — FR-208 bước 2: AI GHI CÓ KIỂM (chủ dự án 17/09/2026: "làm đi, nhanh để tao test lại").
-- Chế độ `ghi` của app_config.boc_tach_ai: trường model đọc ra, qua ba lớp kiểm bằng chứng
-- (kiem-bang-chung.ts) + kiểm khoảng (chonDeGhi), mà luật tiền định KHÔNG ghi và tin còn trống
-- → chat-reply ghi listing_facts nguồn 'ai_kiem' qua ghi_fact_listing (cửa fact duy nhất, trigger
-- DB đưa vào cột như mọi fact khác) và báo dòng 🤖 ngay sau 💾. Luật và AI lệch nhau → không ghi.
-- Tầng AI vẫn không chạm bảng (ranh-gioi.mjs): quyết định ghi nằm ở chat-reply.

alter table public.boc_tach_bong add column if not exists da_ghi jsonb not null default '{}'::jsonb;
comment on column public.boc_tach_bong.da_ghi is
  'FR-208 bước 2: {che_do, ghi:[{question, answer, khoa}], bo:[{…, ly_do}]} — chế độ ghi thì fact nào đã ghi nguồn ai_kiem, đề xuất nào bị chonDeGhi bỏ (khoa_khong_co_cho_ghi, fact_da_co, so_ngoai_khoang, dien_tich_khong_phai_dat…).';
comment on table public.boc_tach_bong is
  '[BOT & HÀNG ĐỢI] FR-208: AI bóc tách tin người bán — mỗi tin có mùi dữ liệu một dòng: model đề xuất gì (kèm trích dẫn), code kiểm cho đạt/bỏ vì sao, so với thứ luật đã ghi vào tin (trung/lech/ai_them), và (chế độ ghi) đã ghi fact nào nguồn ai_kiem. Công tắc app_config.boc_tach_ai = tat | bong | ghi.';

update public.app_config
   set value = 'ghi',
       ghi_chu = 'FR-208: tat = không chạy; bong = AI bóc tách song song, chỉ ghi boc_tach_bong; ghi (17/09) = như bong + ghi fact nguồn ai_kiem cho trường luật tiền định không ghi và tin còn trống (qua kiểm bằng chứng + kiểm khoảng), báo dòng 🤖 sau 💾. Đổi là có hiệu lực lượt kế, không cần deploy.'
 where key = 'boc_tach_ai';
