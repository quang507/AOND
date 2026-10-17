#!/usr/bin/env bun
// khoa-gemini.mjs — nhungCauTim nhiều khoá (30/09/2026, 20260930e): khoá trước 429 thì thử khoá sau; lỗi khác ném luôn.
// fetch giả, không mạng.
import { nhungCauTim } from "../supabase/functions/_shared/ai/nhung.ts";

let dat = 0, hong = 0;
const ok = (ten, dk, ct = "") => { if (dk) { dat++; console.log(`✓ ${ten}`); } else { hong++; console.log(`✗ ${ten}${ct ? `\n     → ${ct}` : ""}`); } };
const vec = Array.from({ length: 768 }, () => 0.1);
let goi = [];
const traVe = (m) => { globalThis.fetch = async (_u, init) => { const k = init.headers["x-goog-api-key"]; goi.push(k); const [st, body] = m[k]; return new Response(JSON.stringify(body), { status: st }); }; };

goi = []; traVe({ k1: [429, { error: { code: 429 } }], k2: [200, { embedding: { values: vec } }] });
const v = await nhungCauTim(["k1", "k2"], "nhà quận 5");
ok("khoá 1 hết hạn mức (429) → dùng khoá 2", v.length === 768 && goi.join() === "k1,k2", goi.join());

goi = []; traVe({ k1: [200, { embedding: { values: vec } }], k2: [200, { embedding: { values: vec } }] });
await nhungCauTim(["k1", "k2"], "nhà quận 5");
ok("khoá 1 còn → không đụng khoá 2", goi.join() === "k1", goi.join());

goi = []; traVe({ k1: [400, { error: { code: 400 } }], k2: [200, { embedding: { values: vec } }] });
let loi = null; try { await nhungCauTim(["k1", "k2"], "x"); } catch (e) { loi = e; }
ok("lỗi khác 429 (400) → ném luôn, không thử khoá 2", /Gemini embed 400/.test(loi?.message ?? "") && goi.join() === "k1", `${loi?.message} ${goi.join()}`);

goi = []; traVe({ k1: [429, {}], k2: [429, {}] });
loi = null; try { await nhungCauTim(["k1", "k2"], "x"); } catch (e) { loi = e; }
ok("cả hai khoá 429 → ném 429", /Gemini embed 429/.test(loi?.message ?? "") && goi.join() === "k1,k2", `${loi?.message} ${goi.join()}`);

goi = []; traVe({ k1: [200, { embedding: { values: vec } }] });
ok("một khoá dạng chuỗi (cách gọi cũ) vẫn chạy", (await nhungCauTim("k1", "x")).length === 768);

console.log(hong ? `\nKHOÁ GEMINI: ${hong} CA HỎNG` : `\nKHOÁ GEMINI: ${dat}/${dat} CA ĐẠT`);
process.exit(hong ? 1 : 0);
