-- 20261018j — nối tiếp 20261018i (docs/07 SRS-5.1zzzzzzz46). (1) Bốn hàm trigger mồ côi sau khi gỡ bảng: không trigger nào gọi
-- (soát pg_trigger 18/10), không code nào gọi — bot_prompts_touch / du_an_can_doc_gia / van_kich_che_so là trigger của bảng đã
-- gỡ; listings_autopublish là bản cũ trước listings_quyet_dinh_dang_tin. (2) Ghi TÊN 26 hàm 20261018i đã gỡ bằng vòng lặp động
-- thành lệnh `drop function if exists` trần, để scripts/soat-truy-vet.sh (soi chữ `drop function <tên>`) biết chúng cố ý vắng mặt
-- trong schema.sql. Trên DB đã áp 20261018i các dòng (2) là no-op.
drop function if exists public.bot_prompts_touch();
drop function if exists public.du_an_can_doc_gia();
drop function if exists public.van_kich_che_so();
drop function if exists public.listings_autopublish();

drop function if exists public.ghi_ai_thu;
drop function if exists public.ai_ghi_thu_che_so;
drop function if exists public.don_van_kich;
drop function if exists public.ghi_su_kien_inbound;
drop function if exists public.viec_inbound_bo_roi;
drop function if exists public.bao_hong_inbound;
drop function if exists public.claim_inbound;
drop function if exists public.giu_luot_gui;
drop function if exists public.inbound_ledger_giu_completed;
drop function if exists public.nha_luot_gui;
drop function if exists public.can_du_an;
drop function if exists public.ghi_fact_du_an;
drop function if exists public.xet_dong_thuan_du_an;
drop function if exists public.doc_bot_prompts;
drop function if exists public.doc_prompt_khac;
drop function if exists public.sua_bot_prompt;
drop function if exists public.mau_cau_fewshot;
drop function if exists public.mau_cau_cham_moc;
drop function if exists public.trg_listing_drip;
drop function if exists public.seller_drip_tick;
drop function if exists public.seller_hoi_bu_tick;
drop function if exists public.seller_keep_alive_tick;
drop function if exists public.ask_seller_drip;
drop function if exists public.ctv_report_tick;
drop function if exists public.inbound_sweep_tick;
drop function if exists public.nudge_tick;
