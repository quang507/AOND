#!/usr/bin/env bun
// chay.mjs — BỘ ĐO BÓC TÁCH (TS-DO-BOC-01, 23/09/2026).
//
// Đo bot ghi ĐÚNG bao nhiêu phần trăm trên một bộ câu cố định (`ca.jsonl`, 110 ca, 9 nhóm): mỗi ca là
// chuỗi tin nhắn của MỘT người (Zalo mới), kỳ vọng là thứ một môi giới giỏi sẽ ghi — số tin, loại, quận,
// phường, giá, diện tích, phòng ngủ, pháp lý, số tầng, hồ sơ mua. Chấm ở `cham.mjs`.
//
// Ba đường chạy, chấm chung một hàm:
//   bun bot/tests/do-boc/chay.mjs                    # LUẬT MỘT MÌNH: model giả trả rỗng → chỉ tầng tiền định.
//                                                    #   Miễn phí, không mạng — con số sàn, chạy được ở CI.
//   bun bot/tests/do-boc/chay.mjs --that             # DB giả + MODEL THẬT (cần ANTHROPIC_API_KEY, env hoặc scripts/.env)
//   bun bot/tests/do-boc/chay.mjs --tu-trang-thai f.json   # chấm trạng thái đổ từ DB PRODUCTION (xem README.md)
//   --chi B01,N03   chỉ vài ca · --nhom mua   một nhóm · --nen   so với bản nền `nen.json` (đỏ khi TỤT)
//
// Kết quả vào `train/out/do-boc/<mốc>/` (gitignore): ket-qua.jsonl (mỗi ca: trạng thái đọc ra, lỗi từng
// trường, replies) + tom-tat.json. KHÔNG phải cổng xanh/đỏ theo từng ca: bộ câu cố ý có ca bot chưa làm
// được — con số là để so giữa hai phiên bản, không phải để đạt 100%.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeDB } from "../e2e/mock-supabase.mjs";
import { chamCa, tongHop } from "./cham.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOC = join(HERE, "..", "..", "..");
const args = process.argv.slice(2);
const giaTri = (k, mac) => { const i = args.findIndex((a) => a === k || a.startsWith(k + "=")); if (i < 0) return mac; return args[i].includes("=") ? args[i].split("=")[1] : (args[i + 1] ?? mac); };
const THAT = args.includes("--that");
const TU_FILE = giaTri("--tu-trang-thai", "");
const CHI = giaTri("--chi", "") ? giaTri("--chi", "").split(",") : null;
const NHOM = giaTri("--nhom", "");
const SO_NEN = args.includes("--nen");
const HAN_MS = 90_000;

const CA = readFileSync(join(HERE, "ca.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
  .filter((c) => (!CHI || CHI.includes(c.id)) && (!NHOM || c.nhom === NHOM));

/** Trạng thái đọc từ DB (giả hoặc thật) của một người: tin bán + hồ sơ mua. */
const TRUONG_TIN = ["code", "property_type", "district", "ward", "price_vnd", "area_m2", "built_area_m2", "bedrooms", "legal_status", "floors", "frontage_m", "deal", "status"];
const gonTin = (l) => Object.fromEntries(TRUONG_TIN.map((k) => [k, l[k] ?? null]));

const moc = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
const cheDo = TU_FILE ? "production" : THAT ? "that" : "luat";
const RA = join(GOC, "train", "out", "do-boc", `${moc}-${cheDo}`);
mkdirSync(RA, { recursive: true });
const F_KQ = join(RA, "ket-qua.jsonl");
writeFileSync(F_KQ, "");

const ketQua = [];
// Log của chat-reply (`_ms`, "model JSON hong"…) làm rối bảng kết quả — tắt khi bot chạy, in bằng `log`.
const log = console.log;
function ghi(ca, tt, replies = null, loiChay = null) {
  const r = loiChay ? { dat: false, truong: { dung: 0, tong: 1 }, loi: [loiChay] } : chamCa(ca.ky_vong, tt);
  const row = { id: ca.id, nhom: ca.nhom, luot: ca.luot, dat: r.dat, truong: r.truong, loi: r.loi, trang_thai: tt, replies };
  ketQua.push(row);
  appendFileSync(F_KQ, JSON.stringify(row) + "\n");
  log(`  ${r.dat ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${ca.id} ${r.truong.dung}/${r.truong.tong}${r.dat ? "" : `  → ${r.loi.join("; ").slice(0, 220)}`}`);
}

if (TU_FILE) {
  // Trạng thái production: { "<id ca>": { tin: [...], mua: {...}|null } } — dựng bằng SQL trong README.md.
  const tat = JSON.parse(readFileSync(TU_FILE, "utf8"));
  console.log(`BỘ ĐO BÓC TÁCH — ${CA.length} ca · chấm trạng thái PRODUCTION từ ${TU_FILE}\n`);
  for (const ca of CA) {
    const tt = tat[ca.id];
    if (!tt) { ghi(ca, null, null, "không có trạng thái (chưa bắn?)"); continue; }
    ghi(ca, { tin: (tt.tin ?? []).map(gonTin), mua: tt.mua ?? null });
  }
} else {
  // ── Khoá API cho --that: env trước, rồi scripts/.env (như giong/chay.mjs). KHÔNG in ra. ──
  const envF = (() => {
    const p = join(GOC, "scripts", ".env");
    if (!existsSync(p)) return {};
    return Object.fromEntries(readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
  })();
  const API_KEY = process.env.ANTHROPIC_API_KEY ?? envF.ANTHROPIC_API_KEY ?? null;
  const MODEL = process.env.ANTHROPIC_MODEL ?? envF.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"; // như _shared/claude.ts
  if (THAT && !API_KEY) {
    console.error("Thiếu ANTHROPIC_API_KEY (env hoặc scripts/.env). Bỏ --that để đo luật một mình. Thoát 2 = CHƯA ĐO ĐƯỢC.");
    process.exit(2);
  }
  // Đóng gói chat-reply như e2e/chay.sh; SDK thật khi --that.
  const SRC = join(GOC, "bot", "supabase", "functions", "chat-reply", "index.ts");
  // Bundle đặt cạnh suite e2e: CI chỉ `bun install` trong bot/tests/e2e (zod, SDK) — để ở đây là không tìm thấy gói.
  const BUNDLE = join(HERE, "..", "e2e", "chat-reply.do-boc.bundle.mjs");
  const b = Bun.spawnSync(["bun", "build", SRC, "--target=node", "--external", "npm:*", "--outfile", BUNDLE]);
  if (b.exitCode !== 0) { console.error(new TextDecoder().decode(b.stderr)); process.exit(1); }
  writeFileSync(BUNDLE, readFileSync(BUNDLE, "utf8")
    .replaceAll('"npm:@supabase/supabase-js@2"', '"./mock-supabase.mjs"')
    .replaceAll('"npm:@anthropic-ai/sdk/helpers/zod"', '"@anthropic-ai/sdk/helpers/zod"')
    .replaceAll('"npm:@anthropic-ai/sdk"', THAT ? '"../giong/that-anthropic.mjs"' : '"./mock-anthropic.mjs"')
    .replaceAll('"npm:zod@4"', '"zod"'));

  // Bootstrap như giong/chay.mjs (cấu hình như production 23/09: AI bóc tách `chinh`).
  globalThis.__calls = []; globalThis.__db = new FakeDB();
  globalThis.__cauHinh = { test_reset_hello: "1", boc_tach_ai: "chinh", bao_lai_da_luu: "thay_doi" };
  globalThis.__mauCau = { ban: "", mua: "" };
  globalThis.__anhTaiDuoc = true;
  if (!THAT) globalThis.fetch = async () => new Response("", { status: 404 }); // Nominatim/OSM tắt: đo chữ, không đo mạng
  const ENV = { SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc", BRIDGE_SECRET: "s3cret", ANTHROPIC_API_KEY: THAT ? API_KEY : "test-key", ANTHROPIC_MODEL: MODEL };
  globalThis.Deno = { serve: (h) => { globalThis.__handler = h; }, env: { get: (k) => ENV[k] } };
  await import(BUNDLE);
  const H = globalThis.__handler;
  let msgN = 0;
  const send = async (body) => {
    const bd = { msg_id: `db${++msgN}`, channel: "zalo_personal_test", ...body };
    const tho = JSON.stringify(bd);
    const hdrs = { "content-length": String(tho.length), "x-bridge-secret": "s3cret" };
    const res = await H({ method: "POST", headers: { get: (k) => hdrs[k.toLowerCase()] ?? null }, text: async () => tho, json: async () => bd });
    return { status: res.status, body: await res.json() };
  };

  console.log(`BỘ ĐO BÓC TÁCH — ${CA.length} ca · ${THAT ? `DB giả + model THẬT ${MODEL}` : "LUẬT MỘT MÌNH (model giả trả rỗng)"} · ra ${RA.replace(GOC + "/", "")}\n`);
  for (const ca of CA) {
    globalThis.__db = new FakeDB(); globalThis.__calls = []; globalThis.__nominatim = undefined; globalThis.__fetches = [];
    globalThis.__rpc = {}; globalThis.__treTruyVan = null; globalThis.__anh = undefined; globalThis.__storageHong = false;
    globalThis.__model = undefined; // luật: parse → null (AI "chết"), create → câu mặc định
    const uid = `db-${ca.id.toLowerCase()}`;
    const replies = [];
    let loiChay = null;
    const [cw, ce] = [console.warn, console.error];
    console.log = console.warn = console.error = () => {};
    for (const t of ca.luot) {
      try {
        const r = await Promise.race([send({ external_user_id: uid, text: t }), new Promise((_, rej) => setTimeout(() => rej(new Error(`quá ${HAN_MS / 1000}s`)), HAN_MS))]);
        if (r.status !== 200) { loiChay = `HTTP ${r.status}`; break; }
        replies.push(r.body?.replies ?? []);
      } catch (e) { loiChay = `lỗi chạy: ${String(e).slice(0, 120)}`; break; }
    }
    console.log = log; console.warn = cw; console.error = ce;
    const d = globalThis.__db;
    const sel = d.t.sellers.find((x) => x.zalo_user_id === uid);
    const buy = d.t.buyers.find((x) => x.zalo_user_id === uid);
    const tt = { tin: sel ? d.t.listings.filter((l) => l.seller_id === sel.id).map(gonTin) : [], mua: buy?.preferences ?? null };
    ghi(ca, tt, replies, loiChay);
  }
}

const tt = tongHop(ketQua);
tt.moc = moc; tt.che_do = cheDo;
writeFileSync(join(RA, "tom-tat.json"), JSON.stringify(tt, null, 2));
console.log(`\nĐẠT CẢ CA: ${tt.ca_dat}/${tt.so_ca} (${(tt.ty_le_ca * 100).toFixed(1)}%) · ĐÚNG TRƯỜNG: ${tt.truong_dung}/${tt.truong_tong} (${(tt.ty_le_truong * 100).toFixed(1)}%)`);
for (const [n, v] of Object.entries(tt.theo_nhom)) console.log(`  ${n.padEnd(20)} ca ${v.ca_dat}/${v.ca} · trường ${v.dung}/${v.tong} (${((v.dung / v.tong) * 100).toFixed(0)}%)`);

// ── So với bản nền (chỉ chế độ luật: con số tiền định, không lắc) ──
if (SO_NEN) {
  const pNen = join(HERE, "nen.json");
  if (cheDo !== "luat" || CHI || NHOM) { console.error("--nen chỉ so ở chế độ luật, đủ bộ câu."); process.exit(2); }
  if (!existsSync(pNen)) { console.error("Chưa có nen.json."); process.exit(2); }
  const nen = JSON.parse(readFileSync(pNen, "utf8"));
  const tut = ketQua.filter((r) => nen.ca_dat?.includes(r.id) && !r.dat).map((r) => r.id);
  const moiDat = ketQua.filter((r) => r.dat && !nen.ca_dat?.includes(r.id)).map((r) => r.id);
  if (moiDat.length) console.log(`\nCa mới đạt (thêm vào nen.json): ${moiDat.join(", ")}`);
  if (tut.length || tt.truong_dung < nen.truong_dung) {
    console.error(`\n\x1b[31mTỤT so với nen.json\x1b[0m: ca từng đạt nay rớt ${tut.join(", ") || "(không)"} · trường đúng ${tt.truong_dung} < ${nen.truong_dung}?`);
    process.exit(1);
  }
  console.log(`\nKhông tụt so với nen.json (${nen.ca_dat.length} ca, ${nen.truong_dung} trường).`);
}
