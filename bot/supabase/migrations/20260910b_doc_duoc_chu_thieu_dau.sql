-- 20260910b — ĐỌC ĐƯỢC CHỮ THIẾU DẤU / VIẾT TẮT (FR-193).
--
-- BẮT TẠI TRẬN 10/09/2026, chủ dự án nhắn thật vào Zalo OA:
--   "Chào bạn tôi cần bán căn ho ở Hà đô centrosa garden"
-- Bot hỏi lại "Nhà mình là nhà phố, chung cư hay đất vậy?" — tức là KHÔNG hiểu
-- "căn ho" là căn hộ, dù bảng luật có sẵn cả hai lối viết.
--
-- VÌ SAO. `guess_property_type` chia đôi bằng một câu hỏi TOÀN CHUỖI:
--   when lower(p_text) is distinct from bo_dau(p_text)  → nhánh CÓ DẤU
--   else                                                → nhánh KHÔNG DẤU
-- Câu trên có dấu ở chỗ khác ("Chào bạn", "Hà đô") nên rơi vào nhánh CÓ DẤU, mà
-- ở đó luật viết "căn hộ" — người ta gõ "căn ho" thì trượt. Người thật gõ LẪN
-- LỘN: có dấu chỗ này, thiếu dấu chỗ kia, viết tắt chỗ khác. Một câu hỏi
-- toàn-chuỗi không mô tả nổi chuyện đó.
--
-- CÁCH SỬA. Bỏ hẳn hai nhánh: luôn so trên `bo_dau(p_text)`. Bỏ dấu là phép
-- CHIẾU — "căn hộ" và "căn ho" cùng ra "can ho" — nên một bảng luật không dấu
-- bắt được cả hai, và không có ca nào cần dấu để phân biệt (không có cặp từ nào
-- trong bảng chỉ khác nhau ở dấu). Thêm luôn các lối viết tắt người ta hay gõ:
-- "cc" (chung cư), "ch" / "căn hộ" viết liền, "nhà phố" viết tắt "np", "bt"
-- (biệt thự), "đn" (đất nền), "mb" (mặt bằng), "kho xuong" viết rời.
--
-- KHÔNG đụng tầng model: đây là tầng tiền định, chạy và kiểm được không tốn tiền
-- (luật ranh giới ở `bot/tests/ranh-gioi.mjs`). Model chết — như sáng nay khi hết
-- số dư — thì tầng này vẫn phải đọc được câu của khách.

create or replace function public.guess_property_type(p_text text)
returns property_type
language sql
immutable
set search_path to 'public'
as $$
  with t as (select public.bo_dau(coalesce(p_text, '')) as s)
  select (case
    when (select btrim(s) from t) = '' then null
    when (select s from t) ~ '(kho bai|kho xuong|nha xuong|nha kho|\mkho\M|\mxuong\M)'                     then 'kho_xuong'
    when (select s from t) ~ '(dat nong nghiep|dat vuon|dat lua|dat trong cay|dat ruong|\mcln\M|dat ray|dat trang trai)' then 'dat_nong_nghiep'
    when (select s from t) ~ '(dat skc|dat tmd|thuong mai dich vu|san xuat kinh doanh|dat kinh doanh|dat thuong mai)' then 'dat_kinh_doanh'
    when (select s from t) ~ '(can ho dich vu|\mchdv\M|khach san|toa nha|\mbuilding\M|nha nghi|day phong cho thue|toa nha van phong)' then 'toa_nha'
    when (select s from t) ~ '(phong tro|nha tro|day tro|khu tro|phong cho thue)'   then 'phong_tro'
    when (select s from t) ~ '(biet thu|villa|\mbt\M)'                              then 'biet_thu'
    when (select s from t) ~ '(mat bang|\mmb\M)'                                    then 'mat_bang'
    when (select s from t) ~ '(chung cu|can ho|canho|penthouse|duplex|officetel|\mcc\M|\mch\M)' then 'chung_cu'
    when (select s from t) ~ '(cap 4|cap bon|c4)'                                   then 'nha_cap4'
    when (select s from t) ~ '(dat nen|lo dat|nen dat|ban dat|dat tho cu|dat trong|\mdn\M)'
         and (select s from t) !~ '(tret|lau|tang|phong ngu|\mpn\M|\mwc\M)'         then 'dat'
    when (select s from t) ~ '(\mnha\M|nha pho|\mnp\M|tret|\mlau\M|tang|\mhem\M|mat tien|\mhxh\M|\mmt\M)' then 'nha_pho'
    else null
  end)::property_type
$$;

comment on function public.guess_property_type(text) is
  'Đoán loại BĐS từ câu rao. FR-193 (10/09): luôn so trên bo_dau() — người thật gõ '
  'lẫn lộn có dấu / thiếu dấu / viết tắt trong CÙNG một câu ("bán căn ho ở Hà đô '
  'centrosa"), nên chia hai nhánh theo toàn chuỗi là trượt.';

-- Câu TRẢ LỜI cho câu hỏi "nhà mình là nhà phố, chung cư hay đất": cùng bệnh.
create or replace function public.guess_property_type_answer(p_text text)
returns property_type
language sql
immutable
set search_path to 'public'
as $$
  with t as (select public.bo_dau(coalesce(p_text, '')) as s)
  select (case
    when (select btrim(s) from t) = '' then null
    when (select s from t) ~ '(kho|xuong)'                                          then 'kho_xuong'
    when (select s from t) ~ '(nong nghiep|dat vuon|dat lua|dat ray|\mcln\M)'        then 'dat_nong_nghiep'
    when (select s from t) ~ '(skc|tmd|thuong mai|san xuat|kinh doanh)'              then 'dat_kinh_doanh'
    when (select s from t) ~ '(chdv|dich vu|khach san|toa nha|building|nha nghi)'    then 'toa_nha'
    when (select s from t) ~ '(tro)'                                                 then 'phong_tro'
    when (select s from t) ~ '(biet thu|villa|\mbt\M)'                               then 'biet_thu'
    when (select s from t) ~ '(mat bang|\mmb\M)'                                     then 'mat_bang'
    when (select s from t) ~ '(chung cu|can ho|canho|penthouse|duplex|officetel|\mcc\M|\mch\M)' then 'chung_cu'
    when (select s from t) ~ '(cap 4|cap bon|c4)'                                    then 'nha_cap4'
    when (select s from t) ~ '(\mdat\M|dat nen|lo dat|nen)'                          then 'dat'
    when (select s from t) ~ '(nha pho|\mnha\M|\mnp\M|pho)'                          then 'nha_pho'
    else null
  end)::property_type
$$;

comment on function public.guess_property_type_answer(text) is
  'Đọc câu trả lời loại BĐS ("chung cư", "cc", "can ho", "nha pho"). FR-193: so trên bo_dau().';
