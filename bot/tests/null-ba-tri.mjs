// null-ba-tri.mjs — 25/09/2026 (migration 20260925b, FR-223 q): câu HẺM không bao giờ được hỏi vì NULL ba trị.
//
// `listing_missing_facts` loại câu đã có dữ liệu bằng `NOT ( … OR … )`. Một phép `l.<cột> = '<giá trị>'` trong khối đó
// ra NULL khi cột trống → cả khối NULL → `NOT NULL` vẫn NULL → WHERE loại luôn dòng "còn thiếu". Mock e2e chạy bằng JS
// (NULL của JS khác SQL) nên e2e xanh không chứng minh gì — bài này soi thẳng schema.sql. So sánh bằng trên cột của
// `listings` trong khối đó phải dùng `IS NOT DISTINCT FROM` (hoặc COALESCE).
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
let hong = 0;
const ok = (ten, dk, chiTiet = "") => { console.log(`${dk ? "✓" : "✗"} ${ten}${dk ? "" : `  → ${chiTiet}`}`); if (!dk) hong++; };

const view = /create or replace view public\.listing_missing_facts as([\s\S]*?);\r?\n/.exec(sql)?.[1] ?? "";
ok("tìm thấy view listing_missing_facts trong schema.sql", view.length > 200);
const bang = [...view.matchAll(/\bl\.[a-z_]+\s*=\s*'[^']*'/g)].map((m) => m[0]);
ok("view: không có 'l.<cột> = <hằng>' trong khối NOT (…) — dùng IS NOT DISTINCT FROM", bang.length === 0, bang.join(" | "));

const diemTin = /FUNCTION public\.diem_tin\(l listings\)([\s\S]*?)\$function\$\s*;/.exec(sql)?.[1] ?? "";
ok("tìm thấy hàm diem_tin trong schema.sql", diemTin.length > 200);
const coHem = /co_hem\s*:=([\s\S]*?);/.exec(diemTin)?.[1] ?? "";
ok("diem_tin: co_hem không dùng 'access_type = …' (NULL làm co_hem NULL, không kể hẻm là thiếu)", coHem && !/access_type\s*=\s*'/.test(coHem), coHem.trim());

console.log(hong ? `\nNULL BA TRỊ: ${hong} CA HỎNG` : "\nNULL BA TRỊ: ĐẠT");
process.exit(hong ? 1 : 0);
