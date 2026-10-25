// Bridge zca-js — CHẠY TRÊN MÁY LOCAL, KHÔNG deploy đâu cả.
// Quét QR bằng ACC ZALO CLONE (đừng dùng acc chính — zca-js là API không chính
// thức, Zalo có thể khoá acc). Tin nhắn đến → gọi edge function chat-reply
// (bộ não) → gửi câu trả lời (kèm hình nếu có) lại. Cài & chạy:
//   cd bot/bridge-zca && npm init -y && npm i zca-js@2.2.0 && node index.mjs   (ghim phiên bản — SRS-5.1zzzzzzz177)
// Lần đầu cần quét QR: zca-js KHÔNG in QR ra terminal (nó ghi qr.png — bắt
// 08/09/2026 khi dựng VPS, tài liệu cũ nói sai), nên bridge nhận ảnh QR qua
// callback rồi PHÁT TẠM qua http ở một đường dẫn ngẫu nhiên; mở link đó trên
// điện thoại/trình duyệt → Zalo app (acc clone) → quét. Cookie lưu
// ./zalo-session.json, lần sau khỏi quét lại.
// Từ 11/09 (FR-203): ảnh QR còn hiện ngay trên /admin, và phiên chết (lỗi
// `zpw_sek`) thì bridge tự cất phiên sang bên + thoát để systemd dựng lại vào
// luồng QR — khỏi ssh vào VPS.
import * as zca from "zca-js";
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kichThuocAnh } from "./kich-thuoc-anh.mjs";

// Nạp bot/bridge-zca/.env — KHÔNG cần thư viện nào.
// Vì sao cần: BRIDGE_SECRET (FR-151) phải có trong env, mà `set BRIDGE_SECRET=…`
// trong cmd chỉ sống đúng cửa sổ đó — đóng cửa sổ hay reboot là mất, chạy
// `node index.mjs` từ cửa sổ mới là dính ngay "bridge secret sai" (401/403).
// Đọc theo đường dẫn của CHÍNH FILE NÀY, không theo thư mục đang đứng: chạy
// `node bot/bridge-zca/index.mjs` từ gốc repo thì cwd khác, mà .env vẫn phải tìm ra.
// Biến đã có sẵn trong env thật thì KHÔNG đè — máy chủ/CI đặt gì thì thắng.
// `import.meta.dirname` chỉ có từ Node 20.11. Đường lùi phải đi qua
// fileURLToPath: trên Windows, `new URL(...).pathname` trả "/C:/qc/..." — cái
// dấu / thừa đằng trước làm fs không mở được file.
const HERE = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(HERE, ".env");
if (fs.existsSync(ENV_FILE)) {
  const tuFile = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    const val = m[2].trim()
      // Bỏ nháy bao ngoài — dán từ Dashboard hay dính thêm nháy hoặc dấu cách
      // vô hình, mà secret lệch một ký tự là 401.
      .replace(/^(['"])(.*)\1$/, "$2")
      // Bỏ ngoặc nhọn bao ngoài: hướng dẫn viết "BRIDGE_SECRET=<dán giá trị>"
      // nên người ta gõ luôn cả cặp <>. Base64 không bao giờ có < hay > nên
      // cắt là an toàn. (Lỗi này xảy ra thật 27/08.)
      .replace(/^<(.*)>$/, "$1");
    // DÒNG SAU ĐÈ DÒNG TRƯỚC, và giá trị RỖNG thì bỏ qua hẳn. Bản đầu lấy
    // "dòng đầu thắng" nên `.env` chép từ `.env.example` — vốn có sẵn một dòng
    // `BRIDGE_SECRET=` trống ở trên — khoá luôn biến thành chuỗi rỗng, dòng
    // thật gõ bên dưới không bao giờ tới lượt. Im lặng và rất khó đoán.
    if (val) tuFile[m[1]] = val;
  }
  // env thật của máy vẫn thắng .env — máy chủ/CI đặt gì thì giữ nguyên.
  for (const [k, v] of Object.entries(tuFile)) {
    if (!(k in process.env)) process.env[k] = v;
  }
  console.log(`Đã nạp ${ENV_FILE} (${Object.keys(tuFile).join(", ") || "không có biến nào"})`);
}

// Bộ não là lõi Python AOND (`src/aioi/server.py`, `aond-core.service` cổng 8000 trên cùng VPS — README). 18/10/2026: từng đổi
// nhầm sang chat-reply TypeScript trên Supabase; chủ dự án chốt lõi Python, bỏ lõi TypeScript.
const CHAT_REPLY_URL =
  process.env.CHAT_REPLY_URL || "http://127.0.0.1:8000/chat-reply";
const ANON_KEY =
  "sb_publishable_f4wNO8jQcCDWn1QmNZQ7-g_BXDtYM3Y"; // key công khai, chỉ gọi được function

// Nói thẳng lúc khởi động thay vì để nó chết lặng ở lượt gọi đầu. Cổng
// BRIDGE_SECRET bật ở phía server rồi mà bridge không có secret thì mọi request
// đều 401/403 — không có tin nào tới khách, mà terminal chỉ hiện một dòng
// "bridge secret sai" giữa đống log khác.
if (!process.env.BRIDGE_SECRET) {
  console.log(
    "⚠ CHƯA CÓ BRIDGE_SECRET. Cổng FR-151 đang bật trên Supabase nên bridge sẽ\n" +
    "  bị chặn 401/403 ở MỌI lượt gọi. Cách sửa (làm một lần):\n" +
    `  1. Supabase Dashboard → Project Settings → Vault → copy giá trị BRIDGE_SECRET\n` +
    `  2. Trong file ${ENV_FILE}, điền vào dòng BRIDGE_SECRET= giá trị vừa copy.\n` +
    "     Dán TRẦN, không ngoặc nhọn, không nháy. Ví dụ đúng:\n" +
    "       BRIDGE_SECRET=aB3xY9...=\n" +
    "  3. Chạy lại `node index.mjs`. (File .env đã nằm trong .gitignore.)",
  );
}

// FR-203: báo trạng thái đăng nhập acc clone (kèm ảnh QR khi chờ quét) lên
// /admin qua escalation-feed. Đặt TRƯỚC khối đăng nhập vì callback QR chạy
// ngay trong lúc đăng nhập — các hằng khai báo phía dưới lúc đó chưa tồn tại.
// KHÔNG BAO GIỜ ném: mất mạng thì vẫn còn link http tạm + qr.png như cũ.
const FEED_URL_DN =
  "https://rqxmmqmctpklqcmbfxuj.supabase.co/functions/v1/escalation-feed";
async function baoDangNhap(trang_thai, qr_png = null, ghi_chu = null) {
  // Giờ SỰ KIỆN, chụp trước khi gửi: server xếp các lệnh theo giờ này chứ không
  // theo giờ request tới — hai lệnh gửi sát nhau có thể tới ngược thứ tự.
  const luc = new Date().toISOString();
  try {
    await fetch(FEED_URL_DN, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        ...(process.env.BRIDGE_SECRET ? { "x-bridge-secret": process.env.BRIDGE_SECRET } : {}),
      },
      body: JSON.stringify({ action: "qr", trang_thai, qr_png, ghi_chu, luc }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { /* còn đường http tạm + qr.png */ }
}

// Bám theo thư mục của script, không theo cwd: chạy từ gốc repo cũng phải tìm
// ra đúng session cũ, đừng bắt quét QR lại vô cớ.
const SESSION_FILE = path.join(HERE, "zalo-session.json");

const { Zalo, ThreadType } = zca;
// SRS-5.1zzzzzzz177 (25/10/2026): zca-js ≥ 2.0 bắt buộc `imageMetadataGetter` khi gửi ảnh theo đường dẫn file — thiếu thì MỌI tấm hỏng
// ("Missing imageMetadataGetter", sổ lỗi 23–24/10 ×9) trong khi lõi vẫn nói "ảnh em gửi ngay sau tin này". Đọc tay JPEG / PNG / GIF /
// WebP (kich-thuoc-anh.mjs), không thêm thư viện; không đọc ra thì gửi 0×0 (zca-js chỉ cần số). Phiên bản zca-js ghim ở cai-vps.sh.
async function imageMetadataGetter(filePath) {
  const data = await fs.promises.readFile(filePath);
  const kt = kichThuocAnh(data) || { width: 0, height: 0 };
  return { width: kt.width, height: kt.height, size: data.length };
}
const zalo = new Zalo({ imageMetadataGetter });
let api;
if (fs.existsSync(SESSION_FILE)) {
  try {
    api = await zalo.login(JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")));
    console.log("Đăng nhập lại bằng session đã lưu.");
  } catch {
    console.log("Session cũ hết hạn — quét QR lại.");
  }
}
if (!api) {
  // Ảnh QR đi ra bằng HAI đường: file qr.png cạnh index.mjs, và một http server
  // tạm (cổng QR_PORT, mặc định 8787) ở đường dẫn có token ngẫu nhiên — chỉ ai
  // đọc được log mới biết link, và server đóng ngay khi đăng nhập xong. Chạy
  // dưới systemd thì link nằm trong `journalctl -u nhadat-bridge`, không cần
  // tmux. Tên sự kiện lấy từ enum của zca-js, có số dự phòng nếu bản mới
  // không export enum (0 = sinh QR, 1 = hết hạn, 2 = đã quét, 3 = từ chối).
  const EV = zca.LoginQRCallbackEventType ?? {};
  const QR_FILE = path.join(HERE, "qr.png");
  const QR_PORT = Number(process.env.QR_PORT || 8787);
  const token = crypto.randomBytes(6).toString("hex");
  const ipMay = () =>
    Object.values(os.networkInterfaces()).flat()
      .find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? "<IP máy này>";
  let qrPng = null;
  let qrServer = null;
  const dongQr = () => {
    try { qrServer?.close(); } catch { /* đã đóng */ }
    qrServer = null;
    try { fs.unlinkSync(QR_FILE); } catch { /* không có file */ }
  };
  api = await zalo.loginQR({ qrPath: QR_FILE }, (ev) => {
    const type = ev?.type;
    if (type === (EV.QRCodeGenerated ?? 0) && ev?.data?.image) {
      qrPng = Buffer.from(String(ev.data.image).replace(/^data:image\/png;base64,/, ""), "base64");
      try { fs.writeFileSync(QR_FILE, qrPng); } catch { /* đĩa chỉ đọc thì còn đường http */ }
      // FR-203: đẩy ảnh lên /admin — quét ngay trên CRM.
      void baoDangNhap("cho_quet", `data:image/png;base64,${qrPng.toString("base64")}`);
      if (!qrServer) {
        qrServer = http.createServer((req, res) => {
          if (req.url === `/qr-${token}.png` && qrPng) {
            res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
            res.end(qrPng);
          } else {
            res.writeHead(404);
            res.end();
          }
        });
        qrServer.on("error", (e) =>
          console.log(`Không mở được cổng ${QR_PORT} (${e.message}) — tải file ${QR_FILE} về máy mà quét.`));
        qrServer.listen(QR_PORT);
      }
      console.log(
        `\n▶ QUÉT QR bằng acc Zalo CLONE:\n` +
        `  1. Mở trên điện thoại hoặc trình duyệt:  http://${ipMay()}:${QR_PORT}/qr-${token}.png\n` +
        `     (không mở được thì mở cổng ${QR_PORT} ở Firewall của nhà cung cấp, hoặc tải ${QR_FILE} về máy)\n` +
        `  2. Zalo app → biểu tượng QR ở thanh tìm kiếm → quét ảnh đó.\n` +
        `  QR hết hạn thì bridge sinh mã mới ở cùng link — tải lại trang (hoặc xem ở /admin).`,
      );
    } else if (type === (EV.QRCodeScanned ?? 2)) {
      console.log("Đã quét — xác nhận đăng nhập trên điện thoại.");
      void baoDangNhap("da_quet");
    } else if (type === (EV.QRCodeExpired ?? 1)) {
      // zca-js 2.x KHÔNG tự sinh mã mới khi mình có callback: nó chỉ gọi
      // callback kèm `actions.retry`. Bản trước in "đang sinh mã mới" rồi đứng
      // im mãi — ai mở link sau 100 giây là gặp mã chết (đọc
      // dist/apis/loginQR.js bản 2.1.2 trên VPS, 11/09).
      console.log("QR hết hạn, sinh mã mới…");
      // BÁO XONG rồi mới sinh mã mới. Bắn song song thì hai lệnh chạy đua: 11/09
      // 09:27 mã mới lên DB lúc :26.7, rồi lệnh "het_han" (gửi TRƯỚC, tới SAU)
      // lúc :27.9 xoá mất ảnh — /admin trống QR suốt 100 giây tới lượt sau.
      void baoDangNhap("het_han", null, "mã QR hết hạn, đang sinh mã mới")
        .finally(() => ev?.actions?.retry?.());
    } else if (type === (EV.QRCodeDeclined ?? 3)) {
      console.log("Điện thoại từ chối đăng nhập — sinh QR mới.");
      void baoDangNhap("tu_choi").finally(() => ev?.actions?.retry?.());
    }
  });
  dongQr();
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(api.getContext?.() ?? {}));
  } catch { /* zca-js đổi API thì bỏ qua, chỉ mất tính năng nhớ session */ }
}
await baoDangNhap("dang_nhap");
console.log("Bridge sẵn sàng — nhắn thử vào acc clone từ một acc khác.");

const brainHeaders = {
  Authorization: `Bearer ${ANON_KEY}`,
  "Content-Type": "application/json",
  // Đặt BRIDGE_SECRET ở CẢ hai nơi (Vault của Supabase + env máy chạy bridge)
  // là chat-reply chỉ còn nhận request từ bridge. Chưa đặt thì vẫn chạy như cũ.
  ...(process.env.BRIDGE_SECRET ? { "x-bridge-secret": process.env.BRIDGE_SECRET } : {}),
};

// FR-141: phân biệt tin bot vừa gửi vs NGƯỜI THẬT gõ tay trên acc clone —
// nhớ ~80 tin bot gửi gần nhất (10 phút); tin đi ra không nằm trong đó = người thật.
const botSent = [];
const rememberSent = (t) => {
  botSent.push({ t, at: Date.now() });
  if (botSent.length > 80) botSent.shift();
};
const wasBotSent = (t) =>
  botSent.some((b) => b.t === t && Date.now() - b.at < 10 * 60e3);

// undici chỉ ném "fetch failed"; mã lỗi thật (ENOTFOUND/ECONNRESET/UND_ERR_*,
// lỗi chứng thư TLS…) nằm ở e.cause — không in ra thì không cách nào chẩn đoán.
const errDetail = (e) => {
  const c = e?.cause;
  const code = c?.code ?? c?.errno ?? c?.name;
  return [e?.message ?? String(e), code, c?.message !== e?.message ? c?.message : null]
    .filter(Boolean).join(" · ");
};

const FEED_URL = FEED_URL_DN;
const feedHeaders = brainHeaders; // brainHeaders đã kèm x-bridge-secret

// FR-152: đẩy lỗi lên sổ chung `bot_errors` (xem ở /admin). console.error chỉ
// sống trong cửa sổ terminal đang mở — đóng cửa sổ là mất, mà bridge thì chạy
// nền hàng tuần. Dùng luôn cổng escalation-feed đã có secret, khỏi mở cửa mới.
// KHÔNG BAO GIỜ ném: mọi nơi gọi hàm này đều đang trong catch.
async function ghiLoi(source, detail) {
  console.error(`${source}:`, detail);
  try {
    await fetch(FEED_URL, {
      method: "POST",
      headers: feedHeaders,
      body: JSON.stringify({ action: "log", source, detail: String(detail) }),
    });
  } catch { /* mất mạng thì thôi, đừng làm hỏng thêm luồng đang lỗi */ }
}

// FR-203: PHIÊN ZALO CHẾT — cookie `zpw_sek` hết hiệu lực (Zalo đá phiên khi
// acc đăng nhập nơi khác, hoặc để lâu). Bản trước cứ thế gửi: mỗi phút một
// dòng lỗi cho từng việc, từ chiều 10/09 tới sáng 11/09, mà không có gì nói
// ra "phải quét QR lại". Nay: cất phiên chết sang bên, báo /admin, thoát —
// systemd (Restart=always) dựng lại, không còn phiên thì vào luồng QR và ảnh
// QR hiện trên /admin. Cất sang bên chứ không xoá: còn soi được; lượt QR sau
// ghi file phiên mới.
let dangThoat = false;
async function phienChet(lyDo) {
  if (dangThoat) return;
  dangThoat = true;
  console.log(`Phiên Zalo chết (${lyDo}) — bỏ phiên, khởi động lại để quét QR.`);
  try { fs.renameSync(SESSION_FILE, path.join(HERE, "zalo-session.het-han.json")); } catch { /* không có file */ }
  await baoDangNhap("het_han", null, String(lyDo).slice(0, 200));
  await ghiLoi("phien zalo", `phiên chết: ${lyDo} — quét QR lại ở /admin`);
  process.exit(1);
}
const laPhienChet = (e) => /zpw_sek/i.test(errDetail(e));

// Mạng nhà/VPS rớt vài giây là chuyện thường: hết giờ thì thử lại 1 lần trước
// khi kêu lỗi, để một cú nghẽn không làm mất luôn lượt trả lời khách.
//
// HẠN CHỜ PHẢI DÀI HƠN VIỆC PHÍA SERVER, nếu không là tự đá vào chân mình.
// Bản trước để cứng 20 giây cho MỌI lượt gọi. Nhưng lượt gọi bộ não có kèm
// gọi model với prompt to (giọng + luật + từ điển lóng + ví dụ + kho tin), chậm
// hơn 20 giây là chuyện thường. Khi đó: client cắt ngang → thử lại → lượt thử
// lại đụng đúng lượt đầu vẫn đang chạy nên nhận `in_flight` → rơi vào vòng chờ
// 3 lần × 5 giây. Cộng dồn xấu nhất là KHOẢNG BA PHÚT khách ngồi nhìn màn hình
// trống, trong khi server đã trả lời xong từ giây thứ 25.
// Nay tách hạn chờ theo loại việc: lượt gọi bộ não được 90 giây (đủ cho model),
// còn lượt hỏi-lại và lượt ghi sổ chỉ 10 giây vì chúng trả về ngay.
//
// 19/10/2026 (SRS-5.1zzzzzzz76): lõi đang khởi động lại (cài code) thì cổng 8000 TỪ CHỐI kết nối vài giây đến vài chục giây — một lần
// thử lại sau 1,5 giây không đủ, tin khách rơi mất (ca 15:29 "diện tích đất, diện tích sàn là 240m" không được trả lời). Kết nối bị
// từ chối nghĩa là request CHƯA tới lõi nên gửi lại an toàn: thử tới khoảng một phút. Hết giờ chờ thì vẫn chỉ thử lại một lần như cũ
// (lõi có thể đang chạy lượt đó).
const CHO_LOI_KHOI_DONG = [2_000, 4_000, 8_000, 15_000, 30_000];
const laTuChoiKetNoi = (e) => e?.cause?.code === "ECONNREFUSED";

async function postJson(url, headers, payload, hanCho = 20_000) {
  let last;
  let lanTuChoi = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST", headers, body: JSON.stringify(payload),
        signal: AbortSignal.timeout(hanCho),
      });
      return await res.json();
    } catch (e) {
      last = e;
      if (laTuChoiKetNoi(e) && lanTuChoi < CHO_LOI_KHOI_DONG.length) {
        console.warn(`[Bridge] Lõi chưa nhận kết nối (${e.cause.code}) — chờ ${CHO_LOI_KHOI_DONG[lanTuChoi] / 1000}s rồi gửi lại`);
        await new Promise((r) => setTimeout(r, CHO_LOI_KHOI_DONG[lanTuChoi++]));
        attempt--;
        continue;
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw last;
}

const HAN_CHO_BO_NAO = 90_000; // lượt gọi có kèm model
const HAN_CHO_NGAN = 10_000;   // hỏi lại / ghi sổ — trả về ngay

// G?i m?t tin (k?m ?nh n?u b? n?o tr? v?) ? d?ng chung cho tin nh?n v? reaction
const userProfileCache = new Map();
// SRS-5.1zzzzzzz163: giới tính trên hồ sơ Zalo ("nam" / "nu") — gợi ý gọi khách anh / chị từ câu chào đầu; không có thì không gửi.
const userGenderCache = new Map();
async function layTenZalo(tid) {
  if (userProfileCache.has(tid)) return userProfileCache.get(tid);
  try {
    const res = await api.getUserInfo(String(tid));
    const p = res?.changed_profiles?.[tid] || res?.unchanged_profiles?.[tid];
    const ten = p?.displayName || p?.zaloName || "";
    // Ghi GIÁ TRỊ THÔ (chỉ con số / null, không dữ liệu khác) để biết Zalo trả gì cho tài khoản ẩn giới tính — chưa kiểm được (SRS-5.1zzzzzzz164).
    console.log(`[Bridge] hồ sơ Zalo ${tid}: gender=${JSON.stringify(p?.gender ?? null)}`);
    if (p?.gender === 0 || p?.gender === 1) userGenderCache.set(tid, p.gender === 1 ? "nu" : "nam");
    if (ten) {
      userProfileCache.set(tid, ten);
      return ten;
    }
  } catch (e) {
    console.warn(`[Bridge] Kh?ng l?y ???c t?n Zalo ${tid}:`, e?.message);
  }
  return "";
}

// Trạng thái "đang soạn" của Zalo (zca-js `sendTypingEvent`) tắt sau vài giây nên nhắc lại mỗi 4 giây tới khi có lời. Hỏng thì
// chỉ ghi sổ lỗi LẦN ĐẦU của tiến trình — đây là tô điểm, không chặn lượt trả lời, ghi mỗi 4 giây là thành tiếng ồn.
const NHAC_DANG_SOAN_MS = 4000;
let daGhiLoiDangSoan = false;
function batDangSoan(threadId) {
  if (typeof api.sendTypingEvent !== "function") return () => {};
  const go = () =>
    api.sendTypingEvent(String(threadId), ThreadType.User).catch(async (e) => {
      if (daGhiLoiDangSoan) return;
      daGhiLoiDangSoan = true;
      await ghiLoi("đang soạn", errDetail(e));
    });
  go();
  const t = setInterval(go, NHAC_DANG_SOAN_MS);
  return () => clearInterval(t);
}

// SRS-5.1zzzzzzz163: thả tim lên tin khách (lời chào / duyệt tin / "ok" / vừa cho địa chỉ — lõi trả `tha_tim`). zca-js addReaction cần cả
// msgId lẫn cliMsgId của tin; thiếu thì thôi. Là tô điểm: hỏng chỉ ghi sổ LẦN ĐẦU của tiến trình, không chặn lượt trả lời.
let daGhiLoiThaTim = false;
async function thaTim(threadId, dich) {
  if (!dich?.msgId || !dich?.cliMsgId) return;
  try {
    if (typeof api.addReaction !== "function" || !zca.Reactions?.HEART) return;
    await api.addReaction(zca.Reactions.HEART, {
      data: { msgId: String(dich.msgId), cliMsgId: String(dich.cliMsgId) },
      threadId: String(threadId),
      type: ThreadType.User,
    });
  } catch (e) {
    if (daGhiLoiThaTim) return;
    daGhiLoiThaTim = true;
    await ghiLoi("thả tim", errDetail(e));
  }
}

async function handleIncoming(threadId, text, imageUrls, msgId, tep, sticker, cliMsgId) {
  const imgList = Array.isArray(imageUrls) ? imageUrls : (imageUrls ? [imageUrls] : []);
  const imgDesc = imgList.length > 1 ? `[${imgList.length} ?nh]` : (imgList.length === 1 ? "[?nh]" : "");
  console.log(`? [${threadId}] ${text || (tep ? `[file ${tep.ten ?? ""}]` : (imgDesc || "[tin nh?n]"))}`);
  const zaloName = await layTenZalo(String(threadId));
  const payload = {
    external_user_id: String(threadId),
    sender_name: zaloName || undefined,
    user_name: zaloName || undefined,
    text: typeof text === "string" ? text : "",
    image_urls: imgList,
    image_url: imgList[0] || null,
    // SRS-5.1zzj (05/10/2026): file (PDF / CSV / XLSX) ng??i b?n g?i qua Zalo c? nh?n ? b? n?o t?i v? v? ??c.
    file_url: tep?.url,
    file_name: tep?.ten,
    // SRS-5.1zzzzzzz122 (22/10/2026): link ảnh sticker để bộ não ĐỌC nghĩa (khách gửi sticker "HI!" = lời chào).
    sticker_url: sticker?.url,
    sticker_text: sticker?.text,
    gioi_tinh: userGenderCache.get(String(threadId)),
    msg_id: msgId,
    channel: "zalo_personal_test",
  };

  // 20/10/2026 (đánh giá UX: lượt bot 9–25 giây im lặng, khách tưởng treo): hiện "đang soạn" từ lúc gửi bộ não tới lúc có lời.
  const tatDangSoan = batDangSoan(threadId);
  let out;
  try {
    out = await postJson(CHAT_REPLY_URL, brainHeaders, payload, HAN_CHO_BO_NAO);
    // FR-162: in_flight = một bản sao của CÙNG tin này đang được xử lý — thường
    // là chính lượt đầu của postJson bị timeout 20s nên lượt thử lại chạm mặt nó.
    // Đừng bỏ đi tay không: chờ rồi hỏi lại (tối đa 3 lần), lượt kia xong là
    // server PHÁT LẠI câu trả lời đã lưu trong sổ — không gọi model lần hai.
    for (let i = 0; i < 3 && out?.in_flight; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      out = await postJson(CHAT_REPLY_URL, brainHeaders, payload, HAN_CHO_NGAN);
    }
  } finally {
    tatDangSoan();
  }
  const { reply, replies, photos, error, replayed, already_sent } = out ?? {};
  if (error) return await ghiLoi("chat-reply", error);

  // FR-162: cùng `msg_id` giao lần hai VÀ lần trước đã gửi đủ → im.
  // `zalo-webhook` kiểm đúng cặp cờ này từ lâu, bridge thì không — nên riêng
  // kênh acc clone, một tin giao trùng là khách nhận lại y nguyên loạt bong
  // bóng. Chạm được thật: hai lượt thả tim trên cùng một tin đều quy về
  // `react-<tid>-<gMsgID>`, tức CÙNG một msg_id.
  if (replayed && already_sent) {
    console.log(`↩ [${threadId}] ${msgId} đã trả lời và đã gửi xong — bỏ bản trùng`);
    return;
  }

  if (out?.tha_tim) await thaTim(threadId, { msgId, cliMsgId });

  const bubbles = Array.isArray(replies) && replies.length ? replies : reply ? [reply] : [];

  // Quyết định 25/08: KHÔNG delay nhân tạo — bong bóng đầu đi ngay lập tức,
  // giữa các bong bóng chỉ chừa 300ms cho Zalo giao đúng thứ tự.
  // SRS-5.1zzm (05/10/2026): bộ não trả `nhip_go[]` khi `app_config.nhip_go = bat` → nghỉ "đang gõ" theo độ dài tin trước;
  // không có thì 300 ms như cũ. Bridge không tự tính nhịp — cùng một nhịp với webhook OA.
  const nhipGo = Array.isArray(out?.nhip_go) ? out.nhip_go.map((x) => Math.min(3000, Math.max(0, Number(x) || 0))) : [];
  let daGui = 0;
  try {
    for (const [i, bubble] of bubbles.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, nhipGo[i] ?? 300));
      rememberSent(bubble);
      await api.sendMessage(bubble, String(threadId), ThreadType.User);
      daGui = i + 1;
      console.log(`→ ${bubble.slice(0, 80)}…`);
    }
  } finally {
    // Ghi vào sổ là ĐÃ GỬI. Không có bước này thì `already_sent` bên trên vĩnh
    // viễn false và cái cổng vừa thêm là chữ chết: bridge không cầm service key
    // nên phải nhờ `chat-reply` ghi hộ (cửa `mark_sent`, cùng bí mật cổng).
    // Đặt trong `finally` để tin gửi hụt GIỮA CHỪNG cũng kịp ghi được đã đi tới
    // đâu — ném ra mà không ghi thì sổ nói "chưa gửi gì" trong khi khách đã cầm
    // ba bong bóng đầu.
    // Hạn còn lại, biết mà chưa vá: bridge chưa TIẾP TỤC từ `sent_bubbles`, nên
    // gửi hụt giữa chừng rồi giao lại vẫn phát từ bong bóng đầu. Muốn hết thì
    // `claim_inbound` phải trả thêm `sent_bubbles` — đổi chữ ký hàm DB, để dịp
    // khác chứ không nhét vào bản vá này.
    if (msgId && bubbles.length) {
      try {
        await postJson(CHAT_REPLY_URL, brainHeaders, {
          mark_sent: msgId, sent_bubbles: daGui, done: daGui === bubbles.length,
        }, HAN_CHO_NGAN);
      } catch (e) {
        await ghiLoi("mark_sent", errDetail(e));
      }
    }
  }

  // FR-143: đính kèm hình thật (URL chính chủ gửi, bộ não chọn) — tải về file
  // tạm rồi gửi như ảnh đính kèm; lỗi một tấm thì bỏ qua tấm đó.
  for (const url of Array.isArray(photos) ? photos : []) await guiAnhQuaUrl(threadId, url);

  // SRS-5.1zzzzzzz26 (18/10/2026): bỏ lượt POST `sync_turn` gửi sau mỗi lượt — chat-reply đã ghi lời khách và lời bot vào
  // `messages` ngay trong lượt chính, lượt đồng bộ thêm làm mỗi câu bot nằm hai lần trong sổ hội thoại (CRM + lịch sử model).
}


// --- BỘ ĐỆM GOM TIN NHẮN GIẬT CỤC (Debounce Buffer) ---
// Khách gõ nhiều tin ngắn liên tiếp: chờ 2.5s gom thành 1 tin trọn vẹn trước khi chuyển AI xử lý.
const bufferTin = new Map();
const DEBOUNCE_MS = 2500;

function queueIncoming(threadId, text, imageUrl, msgId, tep, sticker, cliMsgId) {
  const tid = String(threadId);
  const hienTai = bufferTin.get(tid) || {
    texts: [],
    imageUrls: [],
    timer: null,
    tep: null,
    sticker: null,
    lastMsgId: null,
    lastCliMsgId: null,
  };
  if (text) hienTai.texts.push(text.trim());
  if (imageUrl && !hienTai.imageUrls.includes(imageUrl)) {
    hienTai.imageUrls.push(imageUrl);
  }
  if (tep) hienTai.tep = tep;
  if (sticker?.url) hienTai.sticker = sticker;
  hienTai.lastMsgId = msgId || hienTai.lastMsgId;
  hienTai.lastCliMsgId = cliMsgId || hienTai.lastCliMsgId;

  if (hienTai.timer) clearTimeout(hienTai.timer);

  hienTai.timer = setTimeout(async () => {
    bufferTin.delete(tid);
    const textGom = hienTai.texts.filter(Boolean).join("\n");
    if (!textGom && !hienTai.imageUrls.length && !hienTai.tep) return;
    try {
      await handleIncoming(tid, textGom, hienTai.imageUrls, hienTai.lastMsgId, hienTai.tep, hienTai.sticker, hienTai.lastCliMsgId);
    } catch (e) {
      if (laPhienChet(e)) return await phienChet(errDetail(e));
      await ghiLoi("xử lý tin gom", errDetail(e));
    }
  }, DEBOUNCE_MS);

  bufferTin.set(tid, hienTai);
}

api.listener.on("message", async (message) => {
  try {
    if (message.type !== ThreadType.User) return; // chỉ chat 1-1, bỏ qua nhóm

    // FR-141: tin ĐI RA từ acc clone mà không phải bot vừa gửi = CTV/admin đang
    // gõ tay → báo bộ não ghi log + nhường sân 30 phút, đừng trả lời chen ngang.
    if (message.isSelf) {
      const selfText = typeof message.data?.content === "string" ? message.data.content : "";
      if (!selfText || wasBotSent(selfText)) return;
      // Ghi hụt chỗ này KHÔNG được nuốt. Đây là tin báo "người thật đã vào
      // cuộc"; mất nó là bot không biết mà nhường sân, rồi chen ngang đúng lúc
      // cộng tác viên đang thương lượng giá với khách. Bản trước dùng
      // `.catch(() => {})` — hỏng hoàn toàn im lặng.
      try {
        await postJson(CHAT_REPLY_URL, brainHeaders, {
          external_user_id: String(message.threadId),
          text: selfText,
          human_note: true,
          channel: "zalo_personal_test",
        }, HAN_CHO_NGAN);
      } catch (e) {
        await ghiLoi("bao nguoi that vao cuoc", errDetail(e));
      }
      console.log(`👤 người thật nhắn [${message.threadId}] — bot nhường sân 30 phút`);
      return;
    }

    let text = message.data?.content;
    let sticker;
    let imageUrl;
    let tep; // SRS-5.1zzj: file đính kèm {url, ten}
    const msgType = String(message.data?.msgType ?? "");

    // 1. Phân tích tin nhắn Vị trí (Location / GPS / Bản đồ)
    if (/location|map/i.test(msgType) || (text && typeof text === "object" && (text.lat != null || text.latitude != null))) {
      const lat = text?.lat ?? text?.latitude;
      const lon = text?.lon ?? text?.lng ?? text?.longitude;
      const diaChi = text?.address ?? text?.title ?? text?.description ?? "";
      if (lat != null && lon != null) {
        text = `[Vị trí GPS]: ${diaChi ? diaChi + " " : ""}(tọa độ: ${lat}, ${lon})`;
      } else if (diaChi) {
        text = `[Vị trí đã chia sẻ]: ${diaChi}`;
      }
    }
    // 2. Phân tích tin nhắn Thoại (Voice / Audio)
    else if (/voice|audio/i.test(msgType) || (text && typeof text === "object" && (text.voiceUrl || (text.href && /\.(m4a|aac|mp3|wav|ogg)$/i.test(text.href))))) {
      const voiceUrl = text?.voiceUrl || text?.href || message.data?.voiceUrl || message.data?.url || (typeof text === 'string' && text.startsWith('http') ? text : '');
      console.log(`[Bridge Voice] Nhan tin nhan thoai tu ${message.threadId}: url=${voiceUrl || '(chua co link)'}`);
      text = "[Khách gửi tin nhắn thoại/ghi âm]";
      if (voiceUrl) {
        tep = { url: voiceUrl, ten: "tin_nhan_thoai.m4a" };
      }
    }
    // 3. Phân tích tệp hoặc ảnh thông thường
    else if (text && typeof text === "object") {
      if (text.href && (/file/i.test(msgType) || /\.(pdf|csv|xlsx?|docx?)$/i.test(String(text.title ?? text.fileName ?? "")))) {
        // zca-js: file chia sẻ cũng mang `href` + `title` — trước đây bị coi là ảnh, phân loại hỏng rồi rơi thành URL tạm.
        tep = { url: text.href, ten: String(text.title ?? text.fileName ?? "").slice(0, 200) || undefined };
        text = "";
      } else if (text.href) { // FR-134: ảnh có href
        imageUrl = text.href;
        text = text.title ?? "";
      } else if (text.catId != null || text.id != null) {
        // 18/10/2026 (SRS-5.1zzzzzzz22) — STICKER KHÔNG tự coi là ĐỒNG Ý. Lớp lỗi: mọi sticker (vui, giận, buồn, khóc)
        // đều bị gán "[sticker cảm xúc]" → khớp `EMOJI_VUI` (`\[sticker`) → `laDongY`/AGREE_RULES hiểu là
        // GẬT: chủ nhà gửi sticker bực lúc bot hỏi duyệt tin là tin tự lên kệ. zca-js KHÔNG cho sắc thái
        // sticker tin cậy được, nên gán chuỗi TRUNG TÍNH `[khách gửi sticker]` (không khớp EMOJI_VUI,
        // không khớp `laThaCamXuc`); chat-reply nhận nó bằng `laStickerTrungTinh`: không gật, không ghi vào tin. Tim / like THẬT đi
        // qua listener `reaction` riêng (bên dưới) với icon rõ ràng, vẫn là tín hiệu đồng ý như cũ.
        const stickerId = text.id;
        text = "[khách gửi sticker]";
        // SRS-5.1zzzzzzz122: lấy link ảnh sticker (zca-js getStickersDetail) cho bộ não đọc nghĩa; hụt / quá 4 giây thì thôi,
        // vẫn là chuỗi trung tính — sticker không được làm chậm hay hỏng lượt chat.
        try {
          const sid = Number(stickerId);
          if (Number.isFinite(sid) && typeof api.getStickersDetail === "function") {
            const ct = await Promise.race([api.getStickersDetail(sid), new Promise((_, rj) => setTimeout(() => rj(new Error("quá 4 giây")), 4000))]);
            const d = Array.isArray(ct) ? ct[0] : ct;
            const url = d?.stickerUrl || d?.stickerWebpUrl || d?.stickerSpriteUrl;
            if (url) sticker = { url: String(url), text: d?.text ? String(d.text).slice(0, 60) : undefined };
          }
        } catch (e) {
          console.log(`[Bridge Sticker] không lấy được chi tiết sticker: ${errDetail(e)}`);
        }
      } else {
        text = "";
      }
    }
    if ((typeof text !== "string" || !text.trim()) && !imageUrl && !tep) return;
    queueIncoming(
      message.threadId,
      text,
      imageUrl,
      message.data?.msgId ? String(message.data.msgId) : undefined,
      tep,
      sticker,
      message.data?.cliMsgId ? String(message.data.cliMsgId) : undefined,
    );
  } catch (e) {
    if (laPhienChet(e)) return await phienChet(errDetail(e));
    await ghiLoi("xử lý tin", errDetail(e));
  }
});

// FR-142: khách thả cảm xúc (tim/like) lên tin nhắn — cũng là tín hiệu đồng ý.
// zca-js bản cũ không có event này thì try/catch bỏ qua, không sao.
try {
  api.listener.on("reaction", async (r) => {
    try {
      if (r?.isSelf) return;
      const tid = String(r?.threadId ?? r?.data?.threadId ?? "");
      if (!tid) return;
      const icon = r?.data?.content?.rIcon ?? r?.data?.rIcon ?? "❤️";
      // msg_id BẮT BUỘC có: postJson() thử lại khi mạng nghẽn, mà chat-reply
      // chống trả lời hai lần bằng khoá trùng zalo_msg_id. Đường tin nhắn
      // thường có sẵn msgId; đường reaction thì phải tự dựng.
      // Id phải vừa GIỐNG nhau giữa hai lượt thử của CÙNG cú thả tim (nên tính
      // MỘT lần ở đây, ngoài postJson), vừa KHÁC nhau giữa hai cú thả tim khác
      // nhau — lấy icon làm khoá là khách thả tim lần hai bị bot ngó lơ vĩnh
      // viễn, vì khoá trùng nằm vĩnh viễn trong DB.
      const rMsgId = r?.data?.content?.rMsg?.[0]?.gMsgID ?? r?.data?.msgId ??
        r?.data?.content?.rMsgId ?? Date.now();
      await handleIncoming(
        tid,
        `[khách thả cảm xúc ${icon}]`,
        undefined,
        `react-${tid}-${rMsgId}`,
      );
    } catch (e) {
      // FR-152 d: `console.error` một mình là MẤT — bridge chạy nền hàng tuần,
      // đóng cửa sổ terminal là hết dấu vết. Khách thả tim mà bot ngó lơ là
      // một lượt tương tác rơi, phải nhìn thấy được ở /admin như mọi lỗi khác.
      await ghiLoi("reaction", errDetail(e));
    }
  });
} catch { /* phiên bản zca-js không hỗ trợ reaction */ }

// FR-140/144: mỗi phút kéo việc "hỏi chính chủ / báo CTV/admin" từ
// escalation-feed, resolve SĐT → uid Zalo rồi nhắn từ acc clone, xong ack.
// OA duyệt xong thì nudge tự gửi phía server, vòng này tự hết việc.
const uidCache = new Map(); // SĐT → uid, khỏi findUser lặp lại

// CHỐNG CHỒNG LƯỢT. `setInterval` cứ 60 giây là bắn một lượt, KHÔNG cần biết
// lượt trước xong chưa. Mỗi việc phải đi ba lượt mạng (tìm người → nhắn → báo
// đã xong), nên khi hàng đợi dồn (đang 85 việc) hoặc mạng chậm, một lượt vượt
// 60 giây là chuyện thường → hai lượt chạy chồng nhau.
// Mà cửa `pull` chỉ SELECT theo trạng thái `pending`, KHÔNG giành việc. Hai lượt
// chồng nhau thấy đúng cùng một danh sách và CÙNG GỬI → cộng tác viên nhận tin
// đúp. Đây đúng là cảnh mà bên `nudge` đã phải dựng cơ chế giành việc để chặn;
// đường này chưa có, nên chặn tạm bằng một cái cờ ngay trong tiến trình.
let dangKeoViec = false;

// LÙI DẦN KHI RỖNG (FR-171 c). Kéo mỗi 60 giây bất kể có việc hay không là
// 1.440 lượt lambda/ngày, mỗi lượt 3 câu SQL, trong khi hàng đợi trống 99%
// thời gian. Nay: có việc → 60 s; rỗng → nhân đôi tới trần 5 phút; có việc trở
// lại → về 60 s. Trần 5 phút chứ không 10 vì `bot_health_tick` coi bridge là
// chết khi 15 phút không thấy nhịp tim (nhịp tim đi kèm mỗi lượt kéo) — phải
// còn dư hai lượt trước ngưỡng đó.
const NHIP_NHANH = 60_000;
const NHIP_TRAN = 5 * 60_000;
let nhipKeo = NHIP_NHANH;

async function pumpEscalations() {
  if (dangKeoViec) return;
  dangKeoViec = true;
  try {
    const { items, error, quet_lai } = await postJson(FEED_URL, feedHeaders, { action: "pull" });
    if (error) return await ghiLoi("escalation-feed", error);
    // FR-203: admin bấm "Đăng nhập lại" ở /admin.
    if (quet_lai) return await phienChet("admin yêu cầu đăng nhập lại từ /admin");
    nhipKeo = items?.length ? NHIP_NHANH : Math.min(nhipKeo * 2, NHIP_TRAN);
    for (const it of items ?? []) {
      try {
        let uid = it.zalo_user_id;
        if (!uid && it.phone) {
          // CHỈ NHỚ KHI TÌM RA. Bản trước nhớ cả kết quả thất bại: `findUser`
          // hụt một lần vì mạng chớp hay Zalo chặn tần suất là số đó bị ghim
          // `null` VĨNH VIỄN tới lúc khởi động lại tiến trình. Từ đó mỗi phút
          // ghi một dòng "không resolve được", còn lời nhắc thì nằm `pending`
          // mãi mãi. Nhiều khả năng đây là lý do việc dồn ứ ngay cả lúc cầu
          // nối còn sống.
          if (uidCache.has(it.phone)) {
            uid = uidCache.get(it.phone);
          } else {
            const u = await api.findUser(it.phone).catch(() => null);
            uid = u?.uid ?? u?.userId ?? null;
            if (uid) uidCache.set(it.phone, uid);
          }
        }
        if (!uid) { await ghiLoi("escalation", `${it.id}: không resolve được ${it.name}`); continue; }
        // SRS-5.1zzzzzzz134 (22/10/2026): tin NỘI BỘ (admin / CTV: 🙋 khách cần người thật, ⭐ chấm sao thấp, 🩺 sức khoẻ, 📊 báo cáo)
        // mở bằng "$$$$$ " như tin phụ chế độ test — chủ dự án: "tin nào là tin debug tin nào là tin cho khách thật phải phân tách rõ".
        // Tin cho khách thật (chủ nhà / người mua) không có tiền tố. Cờ do escalation-feed quyết theo đích (`noi_bo`).
        const msg = (it.noi_bo ? "$$$$$ " : "") + (it.text ?? `🔔 nhadat.cc: ${it.note}. Anh/chị check giúp rồi trả lời khách sớm nha.`);
        rememberSent(msg);
        await api.sendMessage(msg, String(uid), ThreadType.User);
        // Gửi kèm uid vừa resolve từ SĐT: server ghi ngược vào sellers/ctvs/admins
        // để lần sau bot nhận ra người này ngay từ tin đầu (khỏi điền tay).
        await postJson(FEED_URL, feedHeaders, {
          action: "ack", id: it.id, zalo_user_id: String(uid),
        });
        console.log(`🔔 đã nhắn ${it.name}: ${String(it.note).slice(0, 70)}…`);
      } catch (e) {
        if (laPhienChet(e)) return await phienChet(errDetail(e));
        await ghiLoi("escalation", `${it.id}: ${errDetail(e)}`); // giữ pending, vòng sau thử lại
      }
    }
  } catch (e) {
    await ghiLoi("pumpEscalations", errDetail(e));
  } finally {
    // Phải nằm trong `finally`: nhánh `return` giữa chừng ở trên mà không hạ cờ
    // là kẹt cứng, từ đó không lượt nào chạy nữa và hàng đợi đứng im mãi.
    dangKeoViec = false;
  }
}
// `setTimeout` xích nhau thay cho `setInterval`: nhịp đọc lại sau MỖI lượt,
// và một lượt kéo dài không bao giờ bị lượt sau đè lên (cờ `dangKeoViec` vẫn
// giữ làm lưới thứ hai).
async function vongKeo() {
  await pumpEscalations();
  setTimeout(vongKeo, nhipKeo);
}
// Kiểm phiên NGAY lúc khởi động (FR-203): `login(session)` qua được KHÔNG có
// nghĩa là gửi được — 10/09 nó qua, rồi mọi lượt gửi đều "zpw_sek bị thiếu".
// Lỗi khác (mạng, zca-js đổi tên hàm) thì bỏ qua: đừng bắt quét QR lại vô cớ.
try {
  await api.fetchAccountInfo?.();
} catch (e) {
  if (laPhienChet(e)) await phienChet(errDetail(e));
}

vongKeo();


// Tải một ảnh theo URL về file tạm rồi gửi như ảnh đính kèm. Dùng chung cho lượt chat (`photos` của chat-reply, FR-143) và tin chủ động
// (`photos` của /send, SRS-5.1zzzzzzz151). Trả true nếu đã gửi; lỗi thì ghi sổ và trả false — một tấm hỏng không chặn các tấm sau.
async function guiAnhQuaUrl(threadId, url) {
  try {
    // Hạn chờ BẮT BUỘC: một URL ảnh treo mà không có hạn là kẹt luôn cả vòng
    // gửi ảnh, khách chờ mãi không thấy tấm nào.
    const img = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!img.ok) return false;
    const f = path.join(
      os.tmpdir(),
      `nhadat-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
    );
    fs.writeFileSync(f, Buffer.from(await img.arrayBuffer()));
    await api.sendMessage({ msg: "", attachments: [f] }, String(threadId), ThreadType.User);
    fs.unlinkSync(f);
    console.log(`→ 📷 ${String(url).slice(0, 70)}…`);
    return true;
  } catch (e) {
    await ghiLoi("gửi ảnh", errDetail(e));
    return false;
  }
}

// Local HTTP Send API on 127.0.0.1:5005 for proactive messages (follow-up, reminders)
const SEND_PORT = process.env.SEND_PORT || 5005;
try {
  const sendServer = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/send') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const { threadId, message, photos } = JSON.parse(body || '{}');
          if (threadId && message) {
            rememberSent(message);
            if (/^\d{6,}$/.test(String(threadId))) {
              await api.sendMessage(message, String(threadId), ThreadType.User);
            } else {
              console.log('📡 [Proactive Mock Test] -> [' + threadId + ']: ' + message.slice(0, 80));
            }
            console.log(`📡 [Proactive Send] -> [${threadId}]: ${message.slice(0, 80)}…`);
            // SRS-5.1zzzzzzz151: ảnh kèm tin chủ động (báo căn mới) — chỉ https, tối đa 4, sau bong bóng chữ.
            let anhDaGui = 0;
            if (/^\d{6,}$/.test(String(threadId))) {
              const anh = (Array.isArray(photos) ? photos : []).filter((u) => typeof u === 'string' && u.startsWith('https://')).slice(0, 4);
              for (const u of anh) if (await guiAnhQuaUrl(threadId, u)) anhDaGui++;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, anh_da_gui: anhDaGui }));
            return;
          }
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing threadId or message' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }
    res.writeHead(404).end();
  });
  sendServer.listen(SEND_PORT, '127.0.0.1', () => {
    console.log(`📡 Local Send API listening on 127.0.0.1:${SEND_PORT}`);
  });
} catch (e) {
  console.error('Failed to start sendServer:', e);
}

api.listener.start();
