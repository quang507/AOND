// SRS-5.1zzzv (08/10/2026, chủ dự án chat thử …hua2): "trên kia nói hẻm xe hơi xong xuống dưới nó hỏi hẻm xe hơi". AI ghi đúng
// fact `loai_duong_vao` = "hẻm xe hơi", trigger thật `listing_facts_sync_cols` đổ nó vào cột `access_type` — nhưng DB GIẢ (mock
// e2e + trang chat thử) chưa từng chép nhánh đó, nên bản nháp / điểm tin trên trang thử hỏi lại thứ khách vừa nói. Lớp lỗi: mock
// chép tay trigger DB, nhánh mới ở DB không ai bắt chép theo. Bài này đọc danh sách khoá fact trigger thật xử lý (schema.sql) và
// đòi DB giả có xử lý cùng khoá. Thêm nhánh vào trigger thật mà chưa chép sang `mock-supabase.mjs` là đỏ.
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const dau = schema.indexOf("CREATE OR REPLACE FUNCTION public.listing_facts_sync_cols()");
// Chỉ chuỗi if / elsif theo khoá (trước `perform ap_thong_so` — danh sách khoá ở đó chỉ quyết quyền ghi đè của bộ đọc chung).
const than = schema.slice(dau, schema.indexOf("perform public.ap_thong_so", dau));
const khoaThat = new Set();
for (const m of than.matchAll(/new\.question\s*=\s*'([a-z_]+)'/g)) khoaThat.add(m[1]);
for (const m of than.matchAll(/new\.question\s+in\s*\(([^)]*)\)/g)) for (const k of m[1].matchAll(/'([a-z_]+)'/g)) khoaThat.add(k[1]);

const mock = readFileSync(new URL("./e2e/mock-supabase.mjs", import.meta.url), "utf8");
const doanMock = mock.slice(mock.indexOf('case "ghi_fact_listing"'), mock.indexOf('case "diem_tin"'));
const khoaMock = new Set();
for (const m of doanMock.matchAll(/p_question\s*===\s*"([a-z_]+)"/g)) khoaMock.add(m[1]);
for (const m of doanMock.matchAll(/\[([^\]]*)\]\.includes\(a\.p_question\)/g)) for (const k of m[1].matchAll(/"([a-z_]+)"/g)) khoaMock.add(k[1]);

const thieu = [...khoaThat].filter((k) => !khoaMock.has(k));
let hong = 0;
const ok = (ten, dk, ct = "") => { console.log(`${dk ? "✓" : "✗"} ${ten}${dk ? "" : `  → ${ct}`}`); if (!dk) hong++; };
ok("đọc được trigger thật (≥ 20 khoá)", khoaThat.size >= 20, String(khoaThat.size));
ok("mọi khoá trigger listing_facts_sync_cols có nhánh trong DB giả", thieu.length === 0, thieu.join(", "));
console.log(hong ? `\nMOCK ↔ TRIGGER: ${hong} CA HỎNG` : `\nMOCK ↔ TRIGGER: ĐẠT (${khoaThat.size} khoá)`);
process.exit(hong ? 1 : 0);
