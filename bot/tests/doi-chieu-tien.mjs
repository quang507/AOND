#!/usr/bin/env node
// doi-chieu-tien.mjs — HAI BẢN LUẬT TIỀN PHẢI RA CÙNG MỘT SỐ (tầng bốn, 11/09).
//
// Luật tiền phía TS đã gom về một nguồn (`luat-tien.ts`). Phía SQL, `parse_vnd`
// là bản riêng và sẽ LUÔN là bản riêng — Postgres không import được TypeScript.
// Nên "một nguồn" cho hai ngôn ngữ nghĩa là: một BẢNG CA (`luat/tien.json`),
// cả hai bản cùng chạy trên đó, và:
//   · mỗi bản phải ra đúng `mong` (khi ca có ghi `mong`)
//   · hai bản phải ra CÙNG MỘT SỐ trên mọi ca — kể cả ca chưa ai ghi `mong`
// Lệch nhau là đỏ, và dòng đỏ nói luôn bản nào lệch.
//
// Không cần secret: phía SQL gọi `doi_chieu_tien_cong_khai()` (`20260911a`) —
// hàm thuần, không đọc bảng, mở cho khoá công khai. Không gọi được thì thoát 2
// ("chưa kiểm được"), KHÔNG phải "đạt" — cùng luật với TS-SEC.
//
//     bun bot/tests/doi-chieu-tien.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { docTien } from "../supabase/functions/_shared/extraction/luat-tien.ts";

const HERE = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const { ca } = JSON.parse(readFileSync(join(HERE, "luat", "tien.json"), "utf8"));

const URL_DB = process.env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const tLib = readFileSync(join(HERE, "..", "..", "lib", "supabase.ts"), "utf8");
const KHOA = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? /(?:sb_publishable_|eyJ)[A-Za-z0-9._-]{20,}/.exec(tLib)?.[0];

let sqlKq = null;
try {
  const r = await fetch(`${URL_DB}/rest/v1/rpc/doi_chieu_tien_cong_khai`, {
    method: "POST",
    headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_cau: ca.map((c) => c.cau) }),
  });
  if (r.ok) sqlKq = new Map((await r.json()).map((x) => [x.cau, x.vnd === null ? null : Number(x.vnd)]));
  else console.error(`rpc/doi_chieu_tien_cong_khai: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
} catch (e) {
  console.error(`Không gọi được DB: ${e.message}`);
}
if (!sqlKq) {
  console.error("→ CHƯA KIỂM ĐƯỢC phía SQL (không phải 'đạt'). Hàm ở migration 20260911a.");
  process.exit(2);
}

console.log(`ĐỐI CHIẾU LUẬT TIỀN — ${ca.length} ca · TS docTien ↔ SQL parse_vnd\n`);
const fmt = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("vi-VN"));
let hong = 0;
for (const c of ca) {
  const ts = docTien(c.cau);
  const sql = sqlKq.get(c.cau) ?? null;
  const loi = [];
  if (ts !== sql) loi.push(`TS ${fmt(ts)} ≠ SQL ${fmt(sql)}`);
  if ("mong" in c && ts !== c.mong) loi.push(`TS ${fmt(ts)} ≠ mong ${fmt(c.mong)}`);
  if ("mong" in c && sql !== c.mong) loi.push(`SQL ${fmt(sql)} ≠ mong ${fmt(c.mong)}`);
  const nhan = `"${c.cau}"`.padEnd(22);
  if (loi.length) {
    hong++;
    console.log(`\x1b[31m✗\x1b[0m ${nhan} ${loi.join(" · ")}${c.vi_sao ? `  (${c.vi_sao})` : ""}`);
  } else {
    console.log(`\x1b[32m✓\x1b[0m ${nhan} ${fmt(ts)}`);
  }
}
console.log(`\n${ca.length - hong}/${ca.length} ca: hai bản khớp nhau và khớp mong`);
if (hong) {
  console.log("\x1b[31mĐỐI CHIẾU TIỀN HỎNG\x1b[0m — luật tiền TS và SQL đã trôi xa nhau.");
  process.exitCode = 1;
} else {
  console.log("\x1b[32mĐỐI CHIẾU TIỀN ĐẠT\x1b[0m");
}
