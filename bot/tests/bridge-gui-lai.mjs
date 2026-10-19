// bridge-gui-lai.mjs — SRS-5.1zzzzzzz76: lõi đang khởi động lại (cổng 8000 từ chối kết nối) thì bridge gửi lại tin, không bỏ.
// Ca gốc 19/10 15:29: "diện tích đất, diện tích sàn là 240m" rơi đúng lúc cài lõi, khách không được trả lời. Bài này cắt `postJson`
// từ index.mjs (file đó đăng nhập Zalo khi nạp nên không import được), rút ngắn bảng chờ, rồi bật máy chủ giả SAU 2 giây — bản cũ
// (một lần thử lại sau 1,5 giây) trượt. Lượt hết giờ chờ vẫn chỉ thử lại một lần (lõi có thể đang chạy lượt đó).
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const src = readFileSync(new URL("../bridge-zca/index.mjs", import.meta.url), "utf8");
const dau = src.indexOf("const CHO_LOI_KHOI_DONG");
const cuoi = src.indexOf("\n  throw last;\n}", dau);
if (dau < 0 || cuoi < 0) { console.error("✗ không thấy bảng chờ lõi khởi động / postJson trong index.mjs"); process.exit(1); }
const than = src.slice(dau, cuoi + "\n  throw last;\n}".length).replace(/\[2_000, 4_000, 8_000, 15_000, 30_000\]/, "[100, 200, 400, 800, 1600]");
const postJson = new Function(`${than}\nreturn postJson;`)();

const mo = (port, xuLy) => new Promise((ok) => { const s = createServer(xuLy); s.listen(port, "127.0.0.1", () => ok(s)); });
let loi = 0;
const kiem = (ten, dat) => { console.log(`${dat ? "✓" : "✗"} ${ten}`); if (!dat) loi = 1; };
const port = 38000 + Math.floor(Math.random() * 1000);

// 1. Lõi chưa nghe — 2 giây sau mới lên.
let sv;
setTimeout(async () => { sv = await mo(port, (_q, r) => { r.setHeader("content-type", "application/json"); r.end('{"reply":"ok"}'); }); }, 2000);
try {
  const out = await postJson(`http://127.0.0.1:${port}/chat-reply`, {}, { text: "x" }, 2000);
  kiem("lõi lên sau 2 giây: tin vẫn được trả lời", out?.reply === "ok");
} catch (e) { kiem(`lõi lên sau 2 giây: tin vẫn được trả lời (${e?.cause?.code || e?.name})`, false); }
sv?.close();

// 2. Lõi treo (hết giờ chờ): chỉ gửi tối đa 2 lần như cũ.
let dem = 0;
const treo = await mo(port + 1, () => { dem++; });
try { await postJson(`http://127.0.0.1:${port + 1}/chat-reply`, {}, { text: "x" }, 300); } catch { /* đúng: hết giờ */ }
treo.closeAllConnections?.(); treo.close();
kiem(`lõi treo: gửi ${dem} lần (≤ 2)`, dem <= 2);
process.exit(loi);
