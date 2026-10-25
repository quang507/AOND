-- 20261025h — Dọn hàm / trigger DB mồ côi (SRS-5.1zzzzzzz180 mục 2, chủ dự án 25/10/2026: "ko dùng dc thì xóa, dùng dc thì để lại").
-- Soát bằng pg_proc / pg_trigger / pg_views / cron.job + grep toàn bộ code (src, app, lib, edge function, bridge, script): các hàm dưới
-- KHÔNG có hàm, trigger, view, cron hay code nào gọi.
-- - tim_phuong_theo_nghia / tim_du_an_theo_nghia / tim_tin_theo_nghia: tìm theo vector đời đầu, từng bảng một. Nay vector Gemini vẫn dùng,
--   nhưng qua MỘT hàm chung `tim_dia_danh_theo_nghia` (phường mới / phường cũ / quận cũ / đường / dự án) và `tim_nha(p_vec)` cho tin.
-- - tin_gan_moc + moc_khop: công cụ "tìm tin gần mốc" của trợ lý TypeScript đã gỡ 18/10 (SRS-5.1zzzzzzz46).
-- - ensure_buyer_conversation / ensure_seller_conversation: lõi tự tạo hội thoại chung (SRS-5.1zzzzzzz149), không ai gọi từ 23/10.
-- - trg_listings_bao_tin_moi_khop + listings_bao_tin_moi_khop (FR-64 cũ): chạy mỗi insert / update `listings`, đọc khoá nhu cầu mà lõi
--   không ghi nên không bao giờ khớp ai (CLAUDE.md: "đừng sửa nó cho khớp rồi bật nudge lại"); báo căn mới nay là lõi `bao_can_moi`.
-- GIỮ (có người gọi): can_cung_khu + khu_khop (bao_can_da_chot), du_an_co_phap_ly (điểm tin), nhan_fact_cu (nhan_fact), seller_rank +
-- hang_theo_diem (view seller_ranks), thu_muc_dau_uuid + url_kho_anh (policy / view Storage), các trigger và hàm cron còn lại.
drop trigger if exists trg_listings_bao_tin_moi_khop on public.listings;
drop function if exists public.listings_bao_tin_moi_khop();
drop function if exists public.tim_phuong_theo_nghia(double precision[], integer);
drop function if exists public.tim_du_an_theo_nghia(double precision[], integer);
drop function if exists public.tim_tin_theo_nghia(double precision[], text[], integer);
drop function if exists public.tin_gan_moc(text, text, double precision, double precision, text, integer, text);
drop function if exists public.moc_khop(text, text);
drop function if exists public.ensure_buyer_conversation(text, text);
drop function if exists public.ensure_seller_conversation(uuid, text);
-- `bao_tin_moi_khop(uuid)` chỉ có trigger trên gọi (đọc `buyers.preferences` khoá area / budget lõi không ghi) → dọn cùng.
drop function if exists public.bao_tin_moi_khop(uuid);
