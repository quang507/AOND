// bridge-dang-soan.mjs — 20/10/2026 (SRS-5.1zzzzzzz82): bot im 9–25 giây mỗi lượt, khách tưởng treo. Bridge bật "đang soạn"
// (zca-js `sendTypingEvent`) từ lúc gửi bộ não tới lúc có lời, nhắc lại vì Zalo tự tắt sau vài giây. Cắt `batDangSoan` từ index.mjs
// (file đó đăng nhập Zalo khi nạp nên không import được), thay `api` giả. Đỏ khi bỏ hàm, khi không nhắc lại, khi không tắt, khi lỗi
// ghi sổ mỗi lần, hoặc khi `handleIncoming` không bọc lượt gọi bộ não.
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../bridge-zca/index.mjs", import.meta.url), "utf8");
const dau = src.indexOf("const NHAC_DANG_SOAN_MS");
const cuoi = src.indexOf("\n  return () => clearInterval(t);\n}", dau);
if (dau < 0 || cuoi < 0) { console.error("✗ không thấy batDangSoan trong index.mjs"); process.exit(1); }
const than = src.slice(dau, cuoi + "\n  return () => clearInterval(t);\n}".length).replace("= 4000", "= 50");

let loi = 0;
const kiem = (ten, dat) => { console.log(`${dat ? "✓" : "✗"} ${ten}`); if (!dat) loi = 1; };
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

const goi = [], soLoi = [];
const tao = (hong) => new Function("api", "ThreadType", "ghiLoi", "errDetail", `${than}\nreturn batDangSoan;`)(
  { sendTypingEvent: async (tid, kieu) => { goi.push([tid, kieu]); if (hong) throw new Error("x"); return { status: 0 }; } },
  { User: 0 }, async (nguon) => { soLoi.push(nguon); }, (e) => String(e));

const tat = tao(false)("123");
await ngu(180);
const truocTat = goi.length;
tat();
await ngu(150);
kiem(`bật ngay và nhắc lại khi chờ (${truocTat} lần)`, truocTat >= 3 && goi[0][0] === "123" && goi[0][1] === 0);
kiem("tắt xong thì không gửi thêm", goi.length === truocTat);

const tatHong = tao(true)("9");
await ngu(180);
tatHong();
await ngu(20);
kiem(`lỗi chỉ ghi sổ một lần (${soLoi.length})`, soLoi.length === 1 && soLoi[0] === "đang soạn");

const bocLuot = /const tatDangSoan = batDangSoan\(threadId\);[\s\S]{0,200}try \{[\s\S]*?postJson\(CHAT_REPLY_URL[\s\S]*?\} finally \{\s*tatDangSoan\(\);/;
kiem("handleIncoming bọc lượt gọi bộ não bằng đang soạn, tắt trong finally", bocLuot.test(src));
process.exit(loi);
