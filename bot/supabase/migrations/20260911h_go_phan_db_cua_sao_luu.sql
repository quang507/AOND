-- 20260911h — gỡ phần DB chỉ sao lưu mới cần (11/09/2026)
--
-- Chủ dự án bỏ sao lưu ("bỏ hết sạch", PR #105), rồi dặn tiếp: "xóa code về
-- sao lưu đi". Phần script đã gỡ ở PR #105; còn hai chỗ trên DB:
--
--   1. liet_ke_bang() — sinh ra (20260905b) chỉ để `sao-luu.mjs` tự biết nó
--      đang bỏ sót bảng nào. Script đó không còn, không chỗ nào khác gọi → xoá.
--   2. xuat_schema() — GIỮ: nó vẫn là cách sinh lại `bot/supabase/schema.sql`
--      (CLAUDE.md). Chỉ sửa dòng đầu nó in ra, "Sinh lại: node
--      scripts/sao-luu.mjs", vốn trỏ tới một script đã xoá. Sửa TẠI CHỖ trên
--      định nghĩa đang chạy (đọc pg_get_functiondef, thay đúng một dòng, chạy
--      lại) để không phải chép lại cả hàm dài và lỡ tay đổi phần khác.

drop function if exists public.liet_ke_bang();

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.xuat_schema()'::regprocedure);
  if position('node scripts/sao-luu.mjs' in v_def) > 0 then
    v_def := replace(v_def,
      '-- Sinh lại: node scripts/sao-luu.mjs (ghi đè file này).',
      '-- Sinh lại: gọi rpc xuat_schema() rồi ghi đè file này (CLAUDE.md).');
    execute v_def;
  end if;
end $$;
