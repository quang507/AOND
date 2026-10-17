-- 20260910c — NHẬN RA TÊN DỰ ÁN DÙ THIẾU DẤU / VIẾT LIỀN / SAI DẤU CÂU (FR-193 c).
--
-- ĐO ĐƯỢC 10/09/2026 trên DB thật, bản cũ khớp bằng một câu duy nhất:
--     position(lower(name) in lower(p_text)) > 0
-- tức là chuỗi tên phải nằm NGUYÊN VĂN trong câu khách, kể cả dấu tiếng Việt và
-- dấu nháy. Kết quả đo:
--     "bán căn hộ ở Ny'ah Phú Định 8x20 giá 18 tỷ"  → NHẬN RA
--     "ban can ho o Nyah Phu Dinh gia 18 ty"        → KHÔNG nhận ra
-- Cùng một dự án, cùng một người, chỉ khác chỗ gõ dấu. Khách nhắn Zalo bằng điện
-- thoại thì thiếu dấu là chuyện thường; đây là cùng cái bệnh đã sửa cho
-- `guess_property_type` ở `20260910b`.
--
-- CÁCH SỬA. So trên chuỗi ĐÃ BỎ DẤU và ĐÃ BỎ DẤU CÂU, hai lối:
--   (1) theo TỪ: bọc hai đầu bằng khoảng trắng để "an" không khớp trong "sân";
--   (2) VIẾT LIỀN: bỏ hết khoảng trắng hai bên rồi so — bắt được "Nyah" khi tên
--       thật là "Ny'ah", "Vinhomes GrandPark" khi tên là "Vinhomes Grand Park".
--       Chỉ dùng khi tên đủ dài (≥ 6 ký tự sau khi nén) để không khớp bừa.
-- Thêm: khớp cả `slug` (vốn đã không dấu) — người ta hay gõ đúng kiểu slug.
--
-- KHÔNG đổi hợp đồng: vẫn `returns setof projects`, vẫn `limit 2`, thứ tự vẫn
-- `priority` rồi tên. Bên gọi (`chat-reply` khối rao, khối người mua) không sửa gì.

create or replace function public.match_projects(p_text text)
returns setof projects
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with t as (
    select
      ' ' || btrim(regexp_replace(public.bo_dau(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g')) || ' ' as tu,
      regexp_replace(public.bo_dau(coalesce(p_text, '')), '[^a-z0-9]+', '', 'g')                       as lien
  )
  select p.*
  from projects p, t
  where length(p.name) >= 4
    and (
      position(' ' || btrim(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', ' ', 'g')) || ' ' in t.tu) > 0
      or (
        length(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', '', 'g')) >= 6
        and position(regexp_replace(public.bo_dau(p.name), '[^a-z0-9]+', '', 'g') in t.lien) > 0
      )
      or (
        p.slug is not null
        and length(regexp_replace(p.slug, '[^a-z0-9]+', '', 'g')) >= 6
        and position(regexp_replace(p.slug, '[^a-z0-9]+', '', 'g') in t.lien) > 0
      )
    )
  order by p.priority asc nulls last, p.name
  limit 2;
$$;

comment on function public.match_projects(text) is
  'Tìm dự án được nhắc trong câu khách. FR-193 c (10/09): so trên chuỗi đã bỏ dấu và '
  'bỏ dấu câu, theo TỪ hoặc VIẾT LIỀN (tên ≥6 ký tự nén), khớp cả slug — khách nhắn '
  'Zalo thiếu dấu ("Nyah Phu Dinh") vẫn phải ra đúng dự án.';
