-- 20260911a — ĐỐI CHIẾU LUẬT TIỀN TS ↔ SQL BẰNG KHOÁ CÔNG KHAI (tầng bốn).
--
-- Chủ dự án 11/09/2026: "gom các luật đang tồn tại hai ba bản song song về một
-- nguồn". Phía TS nay gom về `_shared/extraction/luat-tien.ts`. Phía SQL thì
-- `parse_vnd` không import được file TS nào — nó là bản thứ năm, và sẽ luôn là
-- bản riêng. Cách duy nhất để nó không trôi: bắt nó trả lời CÙNG MỘT BẢNG CA
-- với bản TS (`bot/tests/luat/tien.json`), và đỏ ở CI khi hai bản lệch.
--
-- CI chỉ có khoá công khai, mà anon KHÔNG có quyền execute `parse_vnd` (đo
-- 11/09: `has_function_privilege('anon','parse_vnd(text)','EXECUTE') = false`).
-- Hàm bọc dưới đây mở đúng một việc: đưa vào danh sách CHUỖI, nhận về danh sách
-- SỐ. Không đọc bảng nào, không chạm dữ liệu khách — mở cho anon không phơi gì.
-- Trần 200 câu mỗi lượt để không thành một cái máy tính miễn phí cho ai rảnh.

create or replace function public.doi_chieu_tien_cong_khai(p_cau text[])
returns table (cau text, vnd bigint)
language plpgsql
immutable
security definer
set search_path to 'public', 'pg_catalog'
as $$
begin
  if coalesce(array_length(p_cau, 1), 0) > 200 then
    raise exception 'Toi da 200 cau moi luot' using errcode = '22023';
  end if;
  return query select c, public.parse_vnd(c) from unnest(p_cau) as c;
end $$;

comment on function public.doi_chieu_tien_cong_khai(text[]) is
  'Tầng bốn (11/09): chạy parse_vnd trên một danh sách câu để bài đối chiếu so với bản TS '
  '(luat-tien.ts) trên cùng bảng ca. Hàm thuần — không đọc bảng nào — nên mở cho anon.';

revoke execute on function public.doi_chieu_tien_cong_khai(text[]) from public;
grant execute on function public.doi_chieu_tien_cong_khai(text[]) to anon, authenticated, service_role;
