-- 20261101a_che_sdt_mot_mau — SRS-5.1zzzzzzz317 (audit Đợt 1, AU-01). Bản cũ '(\+84|\m84|\m0)(\d{3})\d{5,7}\M' chỉ bắt chữ số liền nhau,
-- nên SĐT viết "0900 000 123" / "0900.000.123" / "+84 900 000 123" lọt vào sổ lỗi (log_loi) và văn bản nhúng vector.
-- Mẫu dưới đây chép NGUYÊN chuỗi `MAU_SDT` của src/aioi/sdt.py (bài tests/test_sdt_317.py so chuỗi). Bảng ca chung:
-- bot/tests/luat/sdt.json, chạy `bun run doi-chieu:sdt`. Giữ cách trả cũ: '0' + ba số đầu + 'xxxxxx' (quy ước 0903xxxxxx, CLAUDE.md §5).
-- Ranh giới cũ (\m…\M, chống ăn vào UUID / epoch) nay là hai nhìn-sau / nhìn-trước không cho chữ số hay '.,-' + chữ số đứng sát.
-- create or replace giữ nguyên quyền đã cấp — không revoke / grant lại.
create or replace function public.che_sdt(p text)
returns text language sql immutable set search_path to 'public'
as $$
  select regexp_replace(coalesce(p, ''), '(?<![0-9])(?<![0-9][.,-])(?![0-9]{1,3}(?:[.,][0-9]{3}){2,}(?![0-9]))(\+84|84|0)[ .-]?([1-9])[ .-]?([0-9])[ .-]?([0-9])(?:[ .-]?[0-9]){6,7}(?![0-9])(?![.,-][0-9])', '0\2\3\4xxxxxx', 'g')
$$;

comment on function public.che_sdt(text) is 'Che SĐT VN (+84 / 84 / 0, 9–10 số, có dấu cách · chấm · gạch) → 0903xxxxxx. Mẫu chép từ src/aioi/sdt.py MAU_SDT; bảng ca bot/tests/luat/sdt.json (doi-chieu:sdt). SRS-5.1zzzzzzz317';
