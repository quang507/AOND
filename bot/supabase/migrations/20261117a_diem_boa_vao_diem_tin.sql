-- 20261117a (SRS-5.1zzzzzzz520) · Điểm chất lượng bốn mảng BOA vào `diem_tin` — 17/11/2026
--
-- Bộ `docs/agents/` của anh Luận (boa.md §3): "Mỗi chuyên môn trả về một điểm chất lượng (ảnh / pháp lý / vị thế / giá) → cộng vào Điểm uy
-- tín của tin". Trước bản này `diem_tin` chỉ xét CÓ hay KHÔNG: có ô pháp lý là trọn 10, có giá là trọn 10, đủ 3 ảnh là trọn 10 — giấy tay
-- ngang điểm sổ hồng riêng đã gửi ảnh sổ. Điểm chấm ảnh (SRS-424) mới vào điểm tin bot nói ở lượt chat, chưa vào hàm này (tức chưa vào hạng).
--
-- Nay lõi Python tính bộ điểm 0–1 cho từng mảng (`src/aioi/diem_boa.py`) và ghi theo tin ở `listings.boc_tach._diem_boa` (chuỗi JSON).
-- `diem_tin` nhân bốn mục 10 điểm tương ứng với 0,75 + 0,25 × điểm — cùng cơ chế "chỉnh nhẹ, không về 0" của điểm ảnh (chủ dự án 12/11:
-- "đừng khó quá"): pháp lý ← phap_ly · giá ← gia · tiềm năng ← vi_the · ảnh ← anh. Mỗi mục mất tối đa 2,5 điểm. Tin chưa có `_diem_boa`
-- (tin nạp sẵn, tin tạo ngoài chat) hoặc mảng chưa chấm thì giữ nguyên điểm cũ.

create or replace function public.diem_boa(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  v := (p->>'_diem_boa')::jsonb;
  if v is null or jsonb_typeof(v) <> 'object' then return '{}'::jsonb; end if;
  return coalesce((select jsonb_object_agg(e.key, least(1, greatest(0, (e.value #>> '{}')::numeric)))
                     from jsonb_each(v) e where jsonb_typeof(e.value) = 'number'), '{}'::jsonb);
exception when others then
  return '{}'::jsonb;   -- chuỗi hỏng thì coi như chưa chấm, không làm hỏng điểm tin
end $function$;
comment on function public.diem_boa(jsonb) is
  'SRS-5.1zzzzzzz520: điểm chất lượng bốn mảng BOA của một tin, đọc từ boc_tach._diem_boa → {anh, phap_ly, vi_the, gia: 0–1}. Thiếu / hỏng → {}.';
revoke all on function public.diem_boa(jsonb) from public, anon, authenticated;
grant execute on function public.diem_boa(jsonb) to service_role;

do $$
declare
  def text;
  cu text;
begin
  -- Thay một đoạn, đòi trúng (như 20261019f).
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.oid = 'public.diem_tin(listings)'::regprocedure;
  cu := def;
  def := replace(def, E'  tn_biet  boolean;\nbegin', E'  tn_biet  boolean;\n  cl       jsonb;\nbegin');
  if def = cu then raise exception 'diem_tin: không thấy chỗ khai biến'; end if;
  cu := def;
  def := replace(def, E'  return jsonb_build_object(\n    ''diem'', d_vi_tri',
    E'  -- SRS-5.1zzzzzzz520: điểm chất lượng BOA chỉnh bốn mục trong khoảng 0,75–1; mảng chưa chấm giữ nguyên.\n'
    || E'  cl := public.diem_boa(l.boc_tach);\n'
    || E'  d_pl  := round(d_pl  * (0.75 + 0.25 * coalesce((cl->>''phap_ly'')::numeric, 1)))::int;\n'
    || E'  d_gia := round(d_gia * (0.75 + 0.25 * coalesce((cl->>''gia'')::numeric, 1)))::int;\n'
    || E'  d_tn  := round(d_tn  * (0.75 + 0.25 * coalesce((cl->>''vi_the'')::numeric, 1)))::int;\n'
    || E'  d_anh := round(d_anh * (0.75 + 0.25 * coalesce((cl->>''anh'')::numeric, 1)))::int;\n\n'
    || E'  return jsonb_build_object(\n    ''diem'', d_vi_tri');
  if def = cu then raise exception 'diem_tin: không thấy chỗ trả kết quả'; end if;
  cu := def;
  def := replace(def, E'    ''so_anh'', so_anh);', E'    ''so_anh'', so_anh,\n    ''chat_luong'', cl);');
  if def = cu then raise exception 'diem_tin: không thấy khoá so_anh'; end if;
  execute def;
end $$;
