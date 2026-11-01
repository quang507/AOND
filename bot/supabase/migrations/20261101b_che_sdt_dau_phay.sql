-- 20261101b_che_sdt_dau_phay — SRS-5.1zzzzzzz317 (review PR #241, sau khi 20261101a đã áp 01/11). Hai SĐT nối bằng dấu phẩy / chấm không cách
-- ("0900000123,0911222333", "0900000123.0911222333") lọt cả hai: ranh giới cũ coi mọi "." "," sát chữ số là tiền. Nay trước đầu số chỉ cấm chữ số
-- (giá bắt đầu giữa con số vẫn do nhánh dạng tiền chặn); sau số chỉ cấm ".," + một nhóm 1–3 số đứng riêng.
-- Mẫu chép NGUYÊN `MAU_SDT` của src/aioi/sdt.py (tests/test_sdt_317.py so chuỗi với migration mới nhất). Bảng ca: bot/tests/luat/sdt.json
-- (`bun run doi-chieu:sdt`). create or replace giữ nguyên quyền đã cấp — không revoke / grant lại.
create or replace function public.che_sdt(p text)
returns text language sql immutable set search_path to 'public'
as $$
  select regexp_replace(coalesce(p, ''), '(?<![0-9])(?![0-9]{1,3}(?:[.,][0-9]{3}){2,}(?![0-9]))(\(\+84\)[ .-]?0?|\+84[ .-]?0?|84[ .-]?0?|0)[ .-]?([1-9])[ .-]?([0-9])[ .-]?([0-9])(?:[ .-]?[0-9]){6,7}(?![0-9])(?![.,][0-9]{1,3}(?![0-9]))', '0\2\3\4xxxxxx', 'g')
$$;

comment on function public.che_sdt(text) is 'Che SĐT VN ((+84) / +84 / 84 / 0, 9–10 số, có dấu cách · chấm · gạch; hai số nối "," "." "-" "/" ";" đều che) → 0903xxxxxx. Mẫu chép từ src/aioi/sdt.py MAU_SDT; bảng ca bot/tests/luat/sdt.json (doi-chieu:sdt). SRS-5.1zzzzzzz317';
