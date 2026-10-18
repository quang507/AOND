-- 20261018i — gỡ tàn dư bot TypeScript khỏi DB (chủ dự án 18/10/2026: "thời typescript xóa"; docs/07 SRS-5.1zzzzzzz46).
-- Bộ não là lõi Python src/aioi (ghi sellers / conversations / messages / listings, gọi match_projects / chuan_dia_ban /
-- boc_thong_so / giao_lo_cua). Các bảng, view, hàm dưới đây chỉ edge function chat-reply / nudge / ask-seller / ctv-report /
-- inbound-sweep (đã gỡ) đọc ghi; soát 18/10 không còn code web / edge function / bridge / script / lõi Python nào gọi tới.
-- Trigger `listing_insert_drip` còn đang chạy: mỗi tin mới bắn net.http_post tới /ask-seller đã xoá.
-- GIỮ (còn hàm sống dùng): listing_facts (diem_tin, van_ban_nhung, trigger listings), project_facts + boc_tach_bong (RPC xoá /
-- khôi phục của admin), required_facts + listing_missing_facts (soat_db_cong_khai, dung-lai-db), deals, ratings_log.
-- Nội dung chủ dự án tự soạn (bot_prompts 12 dòng, mau_cau 2 dòng, du_an_tai_lieu 1 dòng) chép sang schema luu_tru trước khi
-- xoá — cùng DB, KHÔNG phải sao lưu (OPEN-25); anon / authenticated không có quyền vào luu_tru.

create schema if not exists luu_tru;  -- có sẵn từ 20260929b; dòng này cho DB dựng lại từ schema.sql
create table if not exists luu_tru.ts_bot_prompts_20261018 as select * from public.bot_prompts;
create table if not exists luu_tru.ts_mau_cau_20261018 as select * from public.mau_cau;
create table if not exists luu_tru.ts_du_an_tai_lieu_20261018 as select * from public.du_an_tai_lieu;

-- 1. Trigger trên bảng còn giữ, trỏ tới hàm sắp gỡ.
drop trigger if exists listing_insert_drip on public.listings;

-- 2. View đọc bảng sắp gỡ.
drop view if exists public.bot_do_tre;
drop view if exists public.job_suc_khoe;
drop view if exists public.van_kich_7_ngay;

-- 3. Bảng (trigger trên chính bảng tự đi theo). du_an_can trước du_an_tai_lieu (khoá ngoại).
drop table if exists public.ai_ghi_thu;
drop table if exists public.ctv_daily_reports;
drop table if exists public.van_kich;
drop table if exists public.inbound_events;
drop table if exists public.inbound_ledger;
drop table if exists public.du_an_can;
drop table if exists public.du_an_tai_lieu;
drop table if exists public.project_fact_phieu;
drop table if exists public.bot_prompts;
drop table if exists public.mau_cau;

-- 4. Hàm chỉ phục vụ bot TypeScript (mọi chữ ký). Không CASCADE: còn gì phụ thuộc là lỗi lộ ra, không lặng lẽ kéo theo.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'ghi_ai_thu', 'ai_ghi_thu_che_so', 'don_van_kich',
         'ghi_su_kien_inbound', 'viec_inbound_bo_roi', 'bao_hong_inbound', 'claim_inbound', 'giu_luot_gui',
         'inbound_ledger_giu_completed', 'nha_luot_gui',
         'can_du_an', 'ghi_fact_du_an', 'xet_dong_thuan_du_an',
         'doc_bot_prompts', 'doc_prompt_khac', 'sua_bot_prompt',
         'mau_cau_fewshot', 'mau_cau_cham_moc',
         'trg_listing_drip', 'seller_drip_tick', 'seller_hoi_bu_tick', 'seller_keep_alive_tick', 'ask_seller_drip',
         'ctv_report_tick', 'inbound_sweep_tick', 'nudge_tick'])
     order by (p.proname = 'ask_seller_drip'), (p.proname = 'viec_inbound_bo_roi'), (p.proname = 'xet_dong_thuan_du_an')
  loop
    execute 'drop function ' || r.f;
  end loop;
end $$;
