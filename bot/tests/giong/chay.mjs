#!/usr/bin/env bun
// chay.mjs — BỘ ĐO GIỌNG BOT (FR-180 f, trả lời OPEN-54 bằng số).
//
// Chạy handler `chat-reply` THẬT với DB giả (`../e2e/mock-supabase.mjs`) và MODEL THẬT
// (`./that-anthropic.mjs`), mỗi ca là một lượt có ngữ cảnh dựng sẵn (hồ sơ, tin, câu treo,
// lịch sử chat) như tình huống thật. Không đụng DB production, không tốn lượt Zalo.
//
//   bun bot/tests/giong/chay.mjs              # model thật — cần ANTHROPIC_API_KEY (env hoặc scripts/.env)
//   bun bot/tests/giong/chay.mjs --gia        # model giả trả câu ĐÚNG mẫu: kiểm dây (oracle, phải đạt cao)
//   bun bot/tests/giong/chay.mjs --gia=xau    # model giả trả câu SAI mẫu: kiểm luật (null, phải rớt)
//   --lap 2            chạy mỗi ca 2 lần (đo độ lệch giữa các lần)
//   --chi B01,M03      chỉ chạy vài ca
//   --nhom ban|mua     chỉ một nhánh
//
// Kết quả vào `train/out/giong/<mốc>/` (gitignore): results.jsonl (mỗi dòng một (ca, lần)
// có đủ replies, lời bot, cờ từng luật, usage, model đã phục vụ), errors.jsonl (lượt KHÔNG ra
// được câu trả lời — lỗi API, quá giờ, model phục vụ lệch — KHÔNG tính là rớt), tom-tat.json.
// Tầng 2 (model chấm 4 tính chất) ở `cham.mjs`, chạy trên results.jsonl.
//
// Khác e2e ở đâu: e2e đo LUỒNG bằng model giả; bộ này đo GIỌNG bằng model thật. Prompt lấy
// từ CODE (`_shared/prompts.ts`); production đè bằng bảng `bot_prompts` — chạy `bun run prompt`
// để chắc hai bên khớp trước khi tin số đo. `mau_cau_fewshot` (mẫu sửa tay ở /admin/mau-cau)
// để rỗng ở đây: bộ đo đo prompt trong repo, không đo mẫu ngoài repo.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeDB } from "../e2e/mock-supabase.mjs";
import { OUT } from "../e2e/mock-anthropic.mjs";
import { chamGiong } from "./kiem-giong.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOC = join(HERE, "..", "..", "..");
const args = process.argv.slice(2);
const co = (k) => args.includes(k);
const giaTri = (k, mac) => { const i = args.findIndex((a) => a === k || a.startsWith(k + "=")); if (i < 0) return mac; return args[i].includes("=") ? args[i].split("=")[1] : (args[i + 1] ?? mac); };
const GIA = args.find((a) => a.startsWith("--gia")) ? (giaTri("--gia", "tot") || "tot") : null; // null = model thật
const LAP = Number(giaTri("--lap", "1"));
const CHI = giaTri("--chi", "") ? giaTri("--chi", "").split(",") : null;
const NHOM = giaTri("--nhom", "");
const HAN_MS = 90_000;

// ── Khoá API: env trước, rồi scripts/.env (như sinh-schema.mjs). KHÔNG in ra. ──
function docEnvScripts() {
  const p = join(GOC, "scripts", ".env");
  if (!existsSync(p)) return {};
  return Object.fromEntries(readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
}
const envF = docEnvScripts();
const API_KEY = process.env.ANTHROPIC_API_KEY ?? envF.ANTHROPIC_API_KEY ?? null;
const MODEL = process.env.ANTHROPIC_MODEL ?? envF.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"; // như _shared/claude.ts
if (!GIA && !API_KEY) {
  console.error("Thiếu ANTHROPIC_API_KEY (env hoặc scripts/.env). Chạy `--gia` để kiểm dây không tốn tiền. Thoát 2 = CHƯA ĐO ĐƯỢC, không phải đạt.");
  process.exit(2);
}

// ── Đóng gói chat-reply như e2e/chay.sh, nhưng SDK thật khi đo thật ──────────
const SRC = join(GOC, "bot", "supabase", "functions", "chat-reply", "index.ts");
const BUNDLE = join(HERE, "chat-reply.giong.bundle.mjs");
{
  const r = Bun.spawnSync(["bun", "build", SRC, "--target=node", "--external", "npm:*", "--outfile", BUNDLE]);
  if (r.exitCode !== 0) { console.error(new TextDecoder().decode(r.stderr)); process.exit(1); }
  let s = readFileSync(BUNDLE, "utf8");
  s = s.replaceAll('"npm:@supabase/supabase-js@2"', '"../e2e/mock-supabase.mjs"')
    .replaceAll('"npm:@anthropic-ai/sdk/helpers/zod"', '"@anthropic-ai/sdk/helpers/zod"')
    .replaceAll('"npm:@anthropic-ai/sdk"', GIA ? '"../e2e/mock-anthropic.mjs"' : '"./that-anthropic.mjs"')
    .replaceAll('"npm:zod@4"', '"zod"');
  writeFileSync(BUNDLE, s);
}

// ── Bootstrap giống ../e2e/run.mjs (chép có chủ ý: run.mjs là kịch bản chạy ngay khi import,
// không tách được thành thư viện; đổi bootstrap bên đó thì soát lại đây) ────────────────
globalThis.__calls = []; globalThis.__db = new FakeDB();
globalThis.__cauHinh = { test_reset_hello: "1", boc_tach_ai: "chinh", bao_lai_da_luu: "thay_doi" }; // như production 21/09
globalThis.__mauCau = { ban: "", mua: "" };
globalThis.__anhTaiDuoc = true;
globalThis.fetch = GIA ? (async () => new Response("", { status: 404 })) : globalThis.fetch; // model thật cần fetch thật; Nominatim/Zalo không gọi trong các ca này
const ENV = { SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc", BRIDGE_SECRET: "s3cret", ANTHROPIC_API_KEY: GIA ? "test-key" : API_KEY, ANTHROPIC_MODEL: MODEL };
globalThis.Deno = { serve: (h) => { globalThis.__handler = h; }, env: { get: (k) => ENV[k] } };
await import(BUNDLE);
const H = globalThis.__handler;

const CAU_TOT = "Dạ em ghi rồi ạ. Nhà mình xây mấy tầng rồi anh?";
const CAU_XAU = "Tuyệt vời! Hệ thống đã ghi nhận thông tin của anh/chị. Anh/chị cho em xin kết cấu (số tầng, phòng), pháp lý và giá nha? Mã tin BDS-NP-Q5-0001.";
function modelGia() {
  const cau = GIA === "xau" ? CAU_XAU : CAU_TOT;
  // Nhánh mua gọi `create` và tự parse CHỮ JSON (14/09) — prompt nhánh đó có khoá "replies".
  const laMua = (p) => /"replies"|replies:/.test(JSON.stringify(p?.system ?? ""));
  return { create: (p) => laMua(p) ? JSON.stringify(OUT({ replies: [cau] })) : cau, parse: () => OUT({ replies: [cau] }) };
}

let msgN = 0;
async function send(body) {
  const b = { msg_id: `g${++msgN}`, channel: "zalo_personal_test", ...body };
  const tho = JSON.stringify(b);
  const hdrs = { "content-length": String(tho.length), "x-bridge-secret": "s3cret" };
  const req = { method: "POST", headers: { get: (k) => hdrs[k.toLowerCase()] ?? null }, text: async () => tho, json: async () => b };
  const res = await H(req);
  return { status: res.status, body: await res.json() };
}

// ── Dựng cảnh từ `seed` của ca ───────────────────────────────────────────────
const NHA_PHO = { code: "BDS-NP-Q5-0001", deal: "ban", status: "cho_thong_tin", property_type: "nha_pho", location_raw: "Trần Bình Trọng", street: "Trần Bình Trọng", ward: "Phường 2", district: "Quận 5", price_raw: "7 tỷ 2", price_vnd: 7.2e9, area_m2: 60, frontage_m: 4, length_m: 15, alley_width_m: 4, access_type: "hem_xe_hoi", can_chu_duyet: true, boc_tach: { loai_giao_dich: "ban", phuong: "Phường 2" } };
const DU = { floors: 3, floors_text: "trệt + 2 lầu", bedrooms: 3, legal_status: "so_hong_rieng", has_completion: true }; // diem_tin 85 ≥ 70
const CHUNG_CU = { code: "BDS-CH-Q7-0001", deal: "ban", status: "cho_thong_tin", property_type: "chung_cu", location_raw: null, ward: "Phường Tân Hưng", district: "Quận 7", price_raw: "5 tỷ 8", price_vnd: 5.8e9, area_m2: 76, floor: 15, bedrooms: 2, can_chu_duyet: true, boc_tach: { loai_giao_dich: "ban" } };
function dungCanh(ca) {
  const d = globalThis.__db;
  const uid = `g-${ca.id.toLowerCase()}`;
  const s = ca.seed ?? {};
  let convId = null;
  if (s.seller) {
    const sel = d.insert("sellers", { zalo_user_id: uid, seller_type: s.seller.seller_type ?? "ccrb", name: s.seller.name ?? null, xung_ho: s.seller.xung_ho ?? null, active_listing_id: null }).data;
    if (s.listing) {
      let l = s.listing.chung_cu ? { ...CHUNG_CU } : { ...NHA_PHO };
      if (s.listing.du) l = { ...l, ...DU };
      if (s.listing.dang_ban) l = { ...l, status: "dang_ban", chu_duyet_at: new Date().toISOString() };
      if (s.listing.chung_cu) { const p = d.insert("projects", { name: "Sunrise City", district: "Quận 7", ward: "Phường Tân Hưng" }).data; l.project_id = p.id; }
      const row = d.insert("listings", { ...l, seller_id: sel.id }).data;
      sel.active_listing_id = row.id;
      if (s.pending) d.insert("info_requests", { listing_id: row.id, question: s.pending, status: "pending" });
    }
    convId = d.insert("conversations", { seller_id: sel.id, channel: "zalo_personal_test", started_at: new Date().toISOString(), human_touch_at: null }).data.id;
  }
  if (s.kho) {
    const chu = d.insert("sellers", { zalo_user_id: "g-kho-chu", seller_type: "ccrb", name: "Chị D.", active_listing_id: null }).data;
    d.insert("listings", { code: "BDS-Q5-0001", seller_id: chu.id, deal: "ban", status: "dang_ban", property_type: "nha_pho", location_raw: "12 Trần Hưng Đạo", street: "Trần Hưng Đạo", ward: "Phường 4", district: "Quận 5", price_raw: "5,8 tỷ", price_vnd: 5.8e9, area_m2: 60, frontage_m: 4, length_m: 12.5, floors: 3, floors_text: "trệt + 2 lầu", bedrooms: 3, access_type: "hem_xe_hoi", alley_width_m: 6, legal_status: "so_hong_rieng", description: "Nhà hẻm 6m xe hơi vào tới cửa, gần chợ Hoà Bình, sổ hồng riêng." });
    d.insert("listings", { code: "BDS-Q5-0002", seller_id: chu.id, deal: "ban", status: "dang_ban", property_type: "nha_pho", location_raw: "99 Nguyễn Trãi", street: "Nguyễn Trãi", ward: "Phường 3", district: "Quận 5", price_raw: "7 tỷ", price_vnd: 7e9, area_m2: 55, floors: 4, bedrooms: 4, access_type: "hem_xe_hoi", alley_width_m: 5, legal_status: "so_hong_rieng", description: "Nhà hẻm 5m, 4 lầu, gần chợ An Đông." });
    d.insert("listings", { code: "BDS-Q5-0004", seller_id: chu.id, deal: "ban", status: "dang_ban", property_type: "nha_pho", location_raw: "5 An Dương Vương", street: "An Dương Vương", ward: "Phường 8", district: "Quận 5", price_raw: "6 tỷ", price_vnd: 6e9, area_m2: 70, floors: 2, bedrooms: 2, access_type: "mat_tien", legal_status: "so_hong_rieng", description: "Mặt tiền đường lớn, tiện kinh doanh." });
  }
  if (s.buyer) {
    const b = d.insert("buyers", { zalo_user_id: uid, name: null, preferences: s.buyer.preferences ?? {}, last_contact_at: new Date().toISOString() }).data;
    convId = d.insert("conversations", { buyer_id: b.id, channel: "zalo_personal_test", started_at: new Date().toISOString(), human_touch_at: null }).data.id;
  }
  for (const [ai, body] of s.lich_su ?? []) {
    if (!convId) throw new Error(`${ca.id}: lich_su cần seller hoặc buyer`);
    d.insert("messages", { conversation_id: convId, sender: ai, body });
  }
  return uid;
}

function fresh() {
  globalThis.__db = new FakeDB(); globalThis.__calls = []; globalThis.__nominatim = undefined; globalThis.__fetches = [];
  globalThis.__rpc = {}; globalThis.__treTruyVan = null; globalThis.__anh = undefined; globalThis.__storageHong = false;
  globalThis.__model = GIA ? modelGia() : undefined;
}

// ── Chạy ─────────────────────────────────────────────────────────────────────
const CA = readFileSync(join(HERE, "ca.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
  .filter((c) => (!CHI || CHI.includes(c.id)) && (!NHOM || c.nhom === NHOM));
const moc = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
const RA = join(GOC, "train", "out", "giong", `${moc}${GIA ? `-gia-${GIA}` : ""}`);
mkdirSync(RA, { recursive: true });
const F_KQ = join(RA, "results.jsonl"), F_LOI = join(RA, "errors.jsonl");
writeFileSync(F_KQ, ""); writeFileSync(F_LOI, "");
const tienTo = MODEL.replace(/-\d{8}$/, "");
console.log(`BỘ ĐO GIỌNG — ${CA.length} ca × ${LAP} lần · model ${GIA ? `GIẢ (${GIA})` : MODEL} · ra ${RA.replace(GOC + "/", "")}\n`);

let nDat = 0, nRot = 0, nLoi = 0;
const theoLuat = {};
for (const ca of CA) {
  for (let lan = 1; lan <= LAP; lan++) {
    fresh();
    let uid;
    try { uid = dungCanh(ca); } catch (e) { appendFileSync(F_LOI, JSON.stringify({ id: ca.id, lan, loai: "dung_canh", loi: String(e) }) + "\n"); nLoi++; continue; }
    const t0 = Date.now();
    let r;
    try {
      r = await Promise.race([send({ external_user_id: uid, text: ca.tin }), new Promise((_, rej) => setTimeout(() => rej(new Error(`quá ${HAN_MS / 1000}s`)), HAN_MS))]);
    } catch (e) {
      appendFileSync(F_LOI, JSON.stringify({ id: ca.id, lan, loai: "goi", loi: String(e), calls: globalThis.__calls.length }) + "\n"); nLoi++;
      console.log(`  \x1b[33m!\x1b[0m ${ca.id} lỗi: ${String(e).slice(0, 120)}`); continue;
    }
    const ms = Date.now() - t0;
    if (r.status !== 200 || !Array.isArray(r.body?.replies)) {
      appendFileSync(F_LOI, JSON.stringify({ id: ca.id, lan, loai: "http", status: r.status, body: r.body }) + "\n"); nLoi++;
      console.log(`  \x1b[33m!\x1b[0m ${ca.id} HTTP ${r.status}`); continue;
    }
    const calls = globalThis.__calls.map((c) => ({ kind: c.kind, model: c.model_phuc_vu ?? null, usage: c.usage ?? null, ms: c.ms ?? null, stop_reason: c.stop_reason ?? null }));
    // Model phục vụ phải là model yêu cầu (đề phòng fallback/route lệch): lệch → errors, không chấm.
    const lech = !GIA && calls.some((c) => c.model && !c.model.startsWith(tienTo));
    if (lech) { appendFileSync(F_LOI, JSON.stringify({ id: ca.id, lan, loai: "model_lech", calls }) + "\n"); nLoi++; console.log(`  \x1b[33m!\x1b[0m ${ca.id} model phục vụ lệch: ${calls.map((c) => c.model).join(",")}`); continue; }
    const truncated = calls.some((c) => c.stop_reason === "max_tokens");
    // Model giả trả một câu cố định nên luật `phai` (đòi nội dung) chỉ có nghĩa với model thật.
    const cham = chamGiong(r.body.replies, { xung_ho: ca.xung_ho ?? ca.seed?.seller?.xung_ho ?? null, phai: GIA ? [] : ca.phai, khong: ca.khong });
    for (const [k, v] of Object.entries(cham.luat)) { theoLuat[k] ??= { dat: 0, tong: 0 }; theoLuat[k].tong++; if (v) theoLuat[k].dat++; }
    const row = { id: ca.id, nhom: ca.nhom, lan, mo_ta: ca.mo_ta, tin: ca.tin, xung_ho: ca.xung_ho ?? ca.seed?.seller?.xung_ho ?? null, replies: r.body.replies, loi_bot: cham.loi_bot, dat: cham.dat, luat: cham.luat, loi: cham.loi, status: truncated ? "truncated" : "ok", model_yeu_cau: GIA ? `gia:${GIA}` : MODEL, calls, ms };
    appendFileSync(F_KQ, JSON.stringify(row) + "\n");
    if (cham.dat) nDat++; else nRot++;
    console.log(`  ${cham.dat ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${ca.id}${LAP > 1 ? `#${lan}` : ""} ${ms}ms · ${cham.loi_bot.map((x) => JSON.stringify(x)).join(" | ").slice(0, 160)}${cham.dat ? "" : `\n      → ${cham.loi.join("; ")}`}`);
  }
}
const tong = nDat + nRot;
const tomTat = { moc, model: GIA ? `gia:${GIA}` : MODEL, so_ca: CA.length, lap: LAP, cham_duoc: tong, dat: nDat, rot: nRot, loi_khong_cham: nLoi, ty_le_dat: tong ? +(nDat / tong).toFixed(3) : null, theo_luat: theoLuat,
  usage: (() => { const u = { input: 0, output: 0, cache_read: 0, cache_write: 0 }; for (const l of readFileSync(F_KQ, "utf8").trim().split("\n").filter(Boolean)) for (const c of JSON.parse(l).calls) if (c.usage) { u.input += c.usage.input_tokens ?? 0; u.output += c.usage.output_tokens ?? 0; u.cache_read += c.usage.cache_read_input_tokens ?? 0; u.cache_write += c.usage.cache_creation_input_tokens ?? 0; } return u; })() };
writeFileSync(join(RA, "tom-tat.json"), JSON.stringify(tomTat, null, 2));
console.log(`\nTẦNG 1 (luật máy): ${nDat}/${tong} lượt đạt mọi luật · ${nLoi} lượt lỗi không chấm · token vào ${tomTat.usage.input} (cache đọc ${tomTat.usage.cache_read}) ra ${tomTat.usage.output}`);
console.log("Theo luật: " + Object.entries(theoLuat).filter(([, v]) => v.dat < v.tong).map(([k, v]) => `${k} ${v.dat}/${v.tong}`).join(" · ") || "(đạt hết)");
console.log(`Tầng 2: bun bot/tests/giong/cham.mjs ${RA.replace(GOC + "/", "")}`);
