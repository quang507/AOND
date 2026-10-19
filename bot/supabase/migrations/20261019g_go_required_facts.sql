-- 20261019g — gỡ bảng `required_facts` (docs/07 SRS-5.1zzzzzzz68; chủ dự án 19/10/2026: "có nguồn duy nhất là dc").
-- Bảng là bộ câu bot hỏi theo loại BĐS mà bot TypeScript đọc qua view `listing_missing_facts` (gỡ 20261019f). Lõi Python hỏi
-- theo `src/aioi/schema.py` (`IDENTITY_FIELDS`, `CORE_FIELDS`, `CORE_THEO_LOAI`, `RENTAL_FIELDS`) — nguồn duy nhất từ nay.
-- Soát 19/10: không view / khoá ngoại / lịch cron nào dựa vào bảng; chỉ hàm trigger của chính nó và một dòng chú thích trong
-- `soat_db_cong_khai`. 278 dòng chép sang luu_tru trước khi gỡ (ý toà nhà / phòng trọ đã chép vào CORE_THEO_LOAI).
create table if not exists luu_tru.required_facts_20261019 as select * from public.required_facts where false;
insert into luu_tru.required_facts_20261019 select * from public.required_facts;
drop table public.required_facts;
drop function if exists public.required_facts_khong_trung;
