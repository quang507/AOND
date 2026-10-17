#!/usr/bin/env bun
// ten-nhan-sql.mjs — `ten_nhan()` trên DB (schema.sql) phải trả đúng tên nhãn của TU_DIEN_NHAN (nhan.ts) (30/09/2026, 20260930c).
// Nhãn tìm kiếm có MỘT từ điển ở nhan.ts; văn bản nhúng vector đọc tên tiếng Việt qua ten_nhan() trong SQL — hai bên lệch
// là vector lại ra "yen tinh, san vuon". Thêm nhãn ở nhan.ts thì thêm dòng `when` bằng một migration mới.
import { readFileSync } from "node:fs";
import { TU_DIEN_NHAN } from "../supabase/functions/_shared/extraction/nhan.ts";

const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const than = /FUNCTION public\.ten_nhan\(p_khoa text\)[\s\S]*?\$function\$([\s\S]*?)\$function\$/.exec(sql)?.[1] ?? "";
const db = Object.fromEntries([...than.matchAll(/when '([a-z0-9_]+)' then '((?:[^']|'')*)'/g)].map((m) => [m[1], m[2].replace(/''/g, "'")]));
let hong = 0;
if (!than) { hong++; console.log("✗ schema.sql không có hàm ten_nhan(p_khoa text) — áp 20260930c rồi sinh lại schema.sql"); }
for (const [k, v] of Object.entries(TU_DIEN_NHAN)) {
  if (db[k] === v.ten) continue;
  hong++; console.log(`✗ nhãn ${k}: nhan.ts "${v.ten}" ≠ DB ${db[k] == null ? "(thiếu)" : `"${db[k]}"`}`);
}
for (const k of Object.keys(db)) if (!(k in TU_DIEN_NHAN)) { hong++; console.log(`✗ DB có nhãn ${k} mà nhan.ts không có`); }
const n = Object.keys(TU_DIEN_NHAN).length;
console.log(hong ? `\nTÊN NHÃN SQL: ${hong} CHỖ LỆCH` : `\nTÊN NHÃN SQL: ${n}/${n} KHỚP nhan.ts`);
process.exit(hong ? 1 : 0);
