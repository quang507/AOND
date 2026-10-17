-- 20260911d — BỎ HẲN còi ntfy "[TIN MỚI]" mỗi khi có dòng listings mới.
--
-- Chủ dự án 11/09/2026: "xóa hẳn bắn notice ntfy đi". Đảo lại mục 3b của
-- 20260908e ("có tin BĐS đang được tạo" thì hú còi; sửa ép enum ở 20260908g).
--
-- Lý do thấy ngay trong ngày: trigger hú cho MỌI dòng insert, kể cả người thử
-- (`thu-`, `e2e-`… mà don_du_lieu_thu dọn lúc 21:00) — một lượt kịch bản hành
-- vi 40 ca là 40 thông báo về điện thoại admin. Tin mới vẫn thấy trên CRM (Bàn
-- làm việc, Rổ hàng); việc cần NGƯỜI thật vẫn qua các còi còn lại.
--
-- CÒN GIỮ (không đụng): canh_bao_ngoai; trg_info_request_thong_bao_khach_hoi
-- (khách MUA hỏi); bot_health_tick (bridge chết); email_admin.
-- Muốn bật lại: lấy nguyên hàm + trigger ở 20260908g mục 2.

drop trigger if exists trg_listing_thong_bao_tao_tin on public.listings;
drop function if exists public.trg_listing_thong_bao_tao_tin();
