#!/usr/bin/env node
// sinh-schema.mjs — sinh lại bot/supabase/schema.sql từ DB đang chạy.
//
//     node scripts/sinh-schema.mjs
//
// Gọi `xuat_schema()` bằng khoá service_role đọc từ scripts/.env (máy người làm —
// KHÔNG bao giờ trong CI: repo đang public). Chạy thật lần đầu 13/09/2026 (review
// code): schema.sql lúc đó lệch DB 9 hàm, gồm `parse_vnd` bản trước vá 42 ca.
// Cổng CI thứ 7 (`soat-migration.mjs`) so md5 từng thân hàm schema.sql ↔ DB và đỏ
// khi lệch — thấy đỏ thì chạy lệnh này rồi commit.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const ENV = join(HERE, ".env");
const env = existsSync(ENV)
  ? Object.fromEntries(readFileSync(ENV, "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }))
  : {};
const KHOA = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!KHOA) {
  console.error("Thiếu SUPABASE_SERVICE_ROLE_KEY (scripts/.env).");
  process.exit(1);
}
const URL_DB = process.env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const r = await fetch(`${URL_DB}/rest/v1/rpc/xuat_schema`, {
  method: "POST",
  headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" },
  body: "{}",
});
const t = await r.text();
if (!r.ok) {
  console.error(`rpc/xuat_schema: HTTP ${r.status} ${t.slice(0, 300)}`);
  process.exit(1);
}
const sql = JSON.parse(t);
if (typeof sql !== "string" || !sql.includes("CREATE OR REPLACE FUNCTION")) {
  console.error("xuat_schema() trả về thứ không giống ảnh chụp schema — KHÔNG ghi đè.");
  process.exit(1);
}
// Repo public: không bao giờ ghi một file có dáng khoá bí mật.
if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sb_secret_|sk-ant-|gsk_[A-Za-z0-9]{10}/.test(sql)) {
  console.error("Ảnh chụp có chuỗi giống khoá bí mật — KHÔNG ghi. Soát lại hàm/cron nào đang nhúng khoá.");
  process.exit(1);
}
const DICH = join(HERE, "..", "bot", "supabase", "schema.sql");
writeFileSync(DICH, sql);
console.log(`✓ Ghi ${DICH} (${sql.length} ký tự). Chạy node scripts/soat-migration.mjs để kiểm rồi commit.`);
