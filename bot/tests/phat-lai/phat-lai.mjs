// phat-lai.mjs — PHÁT LẠI hội thoại khách mô phỏng trên code HIỆN TẠI bằng đầu ra model THẬT đã ghi (SRS-5.1zzzzzd, TS-PHAT-LAI-01).
//
// Vì sao (chủ dự án 11/10/2026: "sao sửa lỗi này vẫn lòi ra lỗi kia"): bộ e2e dùng model GIẢ trả đúng điều người viết ca đặt sẵn, nên nó
// kiểm giả định của người sửa chứ không kiểm model thật. Khách mô phỏng dùng model thật nhưng mỗi lần một mẫu, tốn tiền. Ở đây: mỗi ca
// trong `ca/` là một hội thoại khách mô phỏng đã chạy trên production, kèm NGUYÊN đầu ra model của từng lượt (chat-reply ghi vào
// `ai_ghi_thu`, mo-phong in dòng `PHAT_LAI_JSON`, `lay-tu-log.mjs` cắt ra file). Bộ này bơm lại đúng tin khách + đúng đầu ra model đó
// qua handler chat-reply thật (DB giả của e2e), rồi soát `ky_vong` người sửa ghi cho lỗi đã thấy. Không gọi mạng, không tốn tiền.
//
// Ghép đầu ra theo LOẠI lượt (`loaiLuotAi`, cùng hàm chat-reply dùng lúc ghi) và thứ tự trong lượt. Code mới gọi một lượt AI mà bản ghi
// không có → model "hỏng" ở lượt đó (parse trả null, create ném lỗi) — đường đỡ của code chạy, và bộ này đếm "thiếu đầu ra" để người đọc
// biết ca đã cũ so với code. Ca cũ không âm thầm trả nhầm đầu ra của lượt khác.
//
//   bash bot/tests/e2e/chay.sh   # dựng bundle chat-reply (test:bot chạy sẵn trước bộ này)
//   bun bot/tests/phat-lai/phat-lai.mjs [--ca ten] [--in]   # --in: in lời bot từng lượt
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeDB, napPhuongThat } from "../e2e/mock-supabase.mjs";
import { loaiLuotAi } from "../../supabase/functions/_shared/ai/ghi-luot-ai.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, "..", "e2e", "chat-reply.bundle.mjs");
if (!existsSync(BUNDLE)) { console.error("Chưa có bundle chat-reply — chạy `bash bot/tests/e2e/chay.sh` trước. CHƯA KIỂM ĐƯỢC."); process.exit(2); }
const args = process.argv.slice(2);
const chiCa = args.includes("--ca") ? args[args.indexOf("--ca") + 1] : null;
const inLoi = args.includes("--in");
const tuKiem = args.includes("--tu-kiem");

/** Đọc ca: thư mục `ca/` (ca thật), hoặc `tu-kiem.json` (ca tự dựng để kiểm chính bộ phát lại). */
function docCa() {
  if (tuKiem) return [JSON.parse(readFileSync(join(HERE, "tu-kiem.json"), "utf8"))];
  const thuMuc = join(HERE, "ca");
  if (!existsSync(thuMuc)) return [];
  return readdirSync(thuMuc).filter((f) => f.endsWith(".json")).sort()
    .map((f) => ({ ...JSON.parse(readFileSync(join(thuMuc, f), "utf8")), _file: f }))
    .filter((c) => !chiCa || c.ten === chiCa || c._file === chiCa);
}

const ENV = { SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc", BRIDGE_SECRET: "s3cret", ANTHROPIC_API_KEY: "test-key" };
globalThis.Deno = { serve: (h) => { globalThis.__handler = h; }, env: { get: (k) => ENV[k] } };
globalThis.__calls = []; globalThis.__db = new FakeDB(); globalThis.__choAlbumMs = 0;
// Không gọi mạng: mọi fetch ra ngoài là 404 (Nominatim, ảnh) — như mặc định e2e.
globalThis.fetch = async () => new Response("", { status: 404 });
await import(BUNDLE);
const H = globalThis.__handler;

let msgN = 0;
async function gui(body) {
  const tho = JSON.stringify({ msg_id: `pl${++msgN}`, channel: "zalo_personal_test", ...body });
  const hdr = { "content-length": String(tho.length), "x-bridge-secret": "s3cret" };
  const res = await H({ method: "POST", headers: { get: (k) => hdr[k.toLowerCase()] ?? null }, text: async () => tho, json: async () => JSON.parse(tho) });
  return { status: res.status, body: await res.json() };
}

/** Model giả phát lại: mỗi loại lượt một hàng đợi theo thứ tự đã ghi. */
function dungModel(aiLuot, thieu) {
  const hang = new Map();
  for (const d of aiLuot ?? []) { if (!hang.has(d.loai)) hang.set(d.loai, []); hang.get(d.loai).push(d.ra ?? {}); }
  const lay = (kind, p) => {
    const loai = loaiLuotAi(kind, p);
    const ra = hang.get(loai)?.shift();
    if (!ra) thieu.push(loai);
    return ra;
  };
  let choPo = null;
  return {
    // mock-anthropic gọi parseChu trước parse trong CÙNG lượt: lấy đầu ra một lần, cất phần `po` cho parse.
    parseChu: (p) => {
      const ra = lay("parse", p);
      if (ra?.loi) throw new Error("model hỏng (bản ghi)");
      if (typeof ra?.chu === "string") return ra.chu;
      choPo = ra ?? null;
      return undefined;
    },
    parse: () => { const ra = choPo; choPo = null; return ra?.po ?? null; },
    create: (p) => {
      const ra = lay("create", p);
      if (!ra || ra.loi) throw new Error("model hỏng / thiếu đầu ra (bản ghi)");
      return ra.chu ?? "";
    },
    troLy: (p) => {
      const ra = lay("create", p);
      if (!ra || ra.loi) throw new Error("trợ lý hỏng / thiếu đầu ra (bản ghi)");
      return { content: ra.content ?? [], stop_reason: ra.stop_reason ?? "end_turn" };
    },
  };
}

/** Kỳ vọng sau một lượt. `loai`: loi_co / loi_khong (regex trên lời bot lượt đó) · cot (cột tin thứ `tin`, mặc định 0) · fact. */
function soat(kv, uid, loi) {
  const db = globalThis.__db;
  const s = db.t.sellers.find((x) => x.zalo_user_id === uid);
  const tins = s ? db.t.listings.filter((l) => l.seller_id === s.id) : [];
  const L = tins[kv.tin ?? 0];
  const re = kv.mau ? new RegExp(kv.mau, "iu") : null;
  switch (kv.loai) {
    case "loi_co": return re.test(loi) ? null : `lời bot không có /${kv.mau}/`;
    case "loi_khong": return re.test(loi) ? `lời bot có /${kv.mau}/` : null;
    case "cot": {
      if (!L) return `không có tin thứ ${kv.tin ?? 0}`;
      const v = L[kv.cot];
      if ("bang" in kv) return v === kv.bang ? null : `${kv.cot} = ${JSON.stringify(v)}, cần ${JSON.stringify(kv.bang)}`;
      return re.test(String(v ?? "")) ? null : `${kv.cot} = ${JSON.stringify(v)} không khớp /${kv.mau}/`;
    }
    case "fact": {
      if (!L) return `không có tin thứ ${kv.tin ?? 0}`;
      const fs = db.t.listing_facts.filter((f) => f.listing_id === L.id && f.question === kv.hoi).map((f) => f.answer);
      if (kv.khong) return fs.some((a) => !re || re.test(String(a))) ? `có fact ${kv.hoi}: ${JSON.stringify(fs)}` : null;
      return fs.some((a) => re.test(String(a))) ? null : `fact ${kv.hoi} = ${JSON.stringify(fs)} không khớp /${kv.mau}/`;
    }
    default: return `loại kỳ vọng lạ: ${kv.loai}`;
  }
}

const dsCa = docCa();
let hong = 0, tongKv = 0;
for (const [ic, ca] of dsCa.entries()) {
  globalThis.__db = new FakeDB();
  globalThis.__db.t.wards = napPhuongThat().map((w) => ({ ...w }));
  globalThis.__calls = []; globalThis.__rpc = {}; globalThis.__treTruyVan = null;
  // Công tắc production lúc ghi ca; "hello" không xoá người giữa chừng.
  globalThis.__cauHinh = { luat_loi_bot: "gon", ...(ca.cau_hinh ?? {}), test_reset_hello: "0" };
  const uid = `thu-pl-${ic + 1}`;
  const thieuCa = [];
  const loiCa = [];
  for (const [i, l] of (ca.luot ?? []).entries()) {
    const thieu = [];
    globalThis.__model = dungModel(l.ai, thieu);
    let r;
    try { r = await gui({ external_user_id: uid, text: l.khach }); } catch (e) { r = { status: 0, body: { error: String(e) } }; }
    const loi = (r.body?.replies ?? []).join(" | ");
    if (r.status !== 200) loiCa.push(`lượt ${i + 1}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    if (thieu.length) thieuCa.push(`lượt ${i + 1}: ${thieu.join(", ")}`);
    if (inLoi) console.log(`  [${ca.ten}] ${i + 1} KHÁCH: ${l.khach}\n     BOT: ${loi.replace(/\n/g, " ⏎ ")}`);
    for (const kv of (ca.ky_vong ?? []).filter((k) => k.sau_luot === i + 1)) {
      tongKv++;
      const sai = soat(kv, uid, loi);
      if (sai) loiCa.push(`lượt ${i + 1} · ${kv.ghi_chu ?? kv.loai}: ${sai}`);
    }
  }
  const nhan = `${ca.ten}${ca._file ? ` (${ca._file})` : ""} · ${(ca.luot ?? []).length} lượt · ${(ca.ky_vong ?? []).length} kỳ vọng`;
  if (loiCa.length) { hong++; console.log(`✗ ${nhan}\n${loiCa.map((x) => `    - ${x}`).join("\n")}`); } else console.log(`✓ ${nhan}`);
  if (thieuCa.length) console.log(`    (thiếu đầu ra model — ca cũ hơn code: ${thieuCa.join(" · ")})`);
}
console.log(dsCa.length ? `\nPHÁT LẠI: ${dsCa.length - hong}/${dsCa.length} ca đạt, ${tongKv} kỳ vọng` : "\nPHÁT LẠI: chưa có ca nào trong bot/tests/phat-lai/ca/");
process.exit(hong ? 1 : 0);
