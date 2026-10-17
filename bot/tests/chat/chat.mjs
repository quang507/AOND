#!/usr/bin/env bun
// chat.mjs — CHAT THỬ VỚI BOT NGAY TRONG TERMINAL (FR-246 e, 29/09/2026).
//
// Chủ dự án: "tạo ra một môi trường test chạy terminal để tao pull về máy xong chạy trên máy tính".
// Gõ một câu như khách Zalo, bot trả lời ngay dưới. Hai chế độ:
//
//   bun run chat                 # MÁY: chat-reply THẬT + DB GIẢ trong bộ nhớ (../e2e/mock-supabase.mjs).
//                                #   Có ANTHROPIC_API_KEY (env hoặc scripts/.env) → model thật; không có → model giả
//                                #   im lặng (chỉ thấy phần luật). Không đụng production. Kho có sẵn 5 căn mẫu Quận 5.
//   bun run chat -- --that       # PRODUCTION: bắn vào chat-reply đang chạy bằng ID THỬ (qua `la_id_thu`), đọc/ghi DB
//                                #   thật. Cần SUPABASE_SERVICE_ROLE_KEY trong scripts/.env. Dọn người thử khi thoát.
//   bun run chat -- --that --id thu-chat-01   # tự chọn ID (phải là ID thử: thu- b15- hoi- z- e2e- b- lx- do-)
//   bun run chat -- --that --giu              # thoát KHÔNG dọn (để mở /admin xem lại)
//   bun run chat < cau.txt       # mỗi dòng một tin nhắn, chạy tuần tự (dán kịch bản dài)
//   bun run chat -- --log        # chế độ MÁY: in cả log nội bộ của chat-reply (_ms, lỗi model…)
//   bun run chat -- --web        # chế độ MÁY nhưng chat trên TRANG WEB (http://localhost:3000, đổi bằng --port).
//                                #   Mỗi trình duyệt một cuộc chat riêng (nhiều người thử cùng lúc), không đăng nhập. Muốn mở từ máy khác: `ngrok http 3000`
//                                #   hoặc workflow `chat-web.yml` (chạy trên GitHub + đường hầm Cloudflare, không cần pull).
//   bun bot/tests/chat/keo-that.mjs   # (cần SUPABASE_ACCESS_TOKEN) kéo công tắc + mẫu câu + bot_prompts production → that.json;
//                                #   chế độ MÁY tự nạp file đó. `--prompt db` = dùng bot_prompts production (DB đè code), mặc định
//                                #   `code` = bản sẽ deploy. `--web` có trang /prompt sửa prompt + công tắc, lưu vào sua-prompt.json.
//
// Lệnh trong lúc chat:  /tin  xem tin + hồ sơ người đang chat   /moi  làm lại từ đầu (người mới)
//                       /giup  in lại hướng dẫn                   /thoat  thoát (Ctrl+C cũng được)
//
// Khác chế độ MÁY và PRODUCTION: DB giả không có trigger / constraint / RLS / vector, không tính diện tích từ
// ngang × dài như trigger SQL, và tìm theo nghĩa (FR-216) tắt. Thấy lỗi ở chế độ máy mà nghi do mock thì bắn lại
// bằng `--that` trước khi báo lỗi. Khoá không bao giờ được in ra; tên thật / SĐT thật đừng gõ vào (repo PUBLIC,
// log hội thoại thử vẫn nằm trong DB tới khi dọn).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOC = join(HERE, "..", "..", "..");
const args = process.argv.slice(2);
const co = (k) => args.includes(k);
const giaTri = (k) => { const i = args.findIndex((a) => a === k || a.startsWith(k + "=")); if (i < 0) return null; return args[i].includes("=") ? args[i].split("=")[1] : (args[i + 1] ?? null); };
const THAT = co("--that");
const LOG = co("--log"); // in cả log nội bộ của chat-reply (chế độ MÁY)
const GIU = co("--giu");
const WEB = co("--web"); // 07/10/2026: chat trên trang web thay cho terminal (chế độ MÁY)
const TTY = process.stdin.isTTY;

const XANH = (s) => `\x1b[32m${s}\x1b[0m`, VANG = (s) => `\x1b[33m${s}\x1b[0m`, XAM = (s) => `\x1b[90m${s}\x1b[0m`, DO = (s) => `\x1b[31m${s}\x1b[0m`;

// ── Khoá: env trước, rồi scripts/.env (như sinh-schema.mjs). KHÔNG in ra. ──
function docEnvScripts() {
  const p = join(GOC, "scripts", ".env");
  if (!existsSync(p)) return {};
  return Object.fromEntries(readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
}
const envF = docEnvScripts();
const layEnv = (k) => (process.env[k] ?? envF[k] ?? "").trim() || null;

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
const ngauNhien = () => Math.random().toString(36).slice(2, 6);

// ─────────────────────────────────────────────────────────────────────────────
// Hai "máy chủ" cùng một giao diện: gui(uid, text) → replies[], tin(uid) → in tình trạng, xoa(uid).
// ─────────────────────────────────────────────────────────────────────────────
async function mayChuThat() {
  const URL_DB = layEnv("SUPABASE_URL") ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
  const KHOA = layEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!KHOA) {
    console.error(DO("Thiếu SUPABASE_SERVICE_ROLE_KEY. Chép scripts/.env.example thành scripts/.env rồi dán khoá vào (hoặc chạy không có --that để chat trên máy)."));
    process.exit(2);
  }
  const H = { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" };
  async function rest(path, opt = {}) {
    const r = await fetch(`${URL_DB}/rest/v1/${path}`, { headers: H, ...opt });
    if (!r.ok) throw new Error(`${path.split("?")[0]}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  const rpc = (ten, body = {}) => rest(`rpc/${ten}`, { method: "POST", body: JSON.stringify(body) });
  // Bí mật cổng đọc từ Vault bằng service_role (như kich-ban-hanh-vi.mjs), KHÔNG ghi vào file nào.
  const GATE = await rpc("get_secret", { secret_name: "BRIDGE_SECRET" });
  let dem = 0, mocLoi = new Date().toISOString();
  return {
    ten: `PRODUCTION (${URL_DB.replace(/^https:\/\//, "").split(".")[0]})`,
    async kiemId(uid) { return (await rpc("la_id_thu", { p: uid })) === true; },
    async gui(uid, text) {
      for (let lan = 0; lan < 8; lan++) {
        const r = await fetch(`${URL_DB}/functions/v1/chat-reply`, {
          method: "POST",
          headers: { Authorization: `Bearer ${KHOA}`, "x-bridge-secret": GATE, "Content-Type": "application/json" },
          body: JSON.stringify({ external_user_id: uid, text, msg_id: `chat-${uid}-${Date.now()}-${++dem}`, channel: "zalo_personal_test" }),
        });
        let j;
        try { j = await r.json(); } catch { j = { error: `HTTP ${r.status}` }; }
        if (j.in_flight || j.deduped) { await nghi(2500); continue; }
        if (!r.ok) throw new Error(`chat-reply HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
        // Sổ lỗi chat-reply từ lượt trước (lượt model hỏng vẫn trả 200 và trả lời bằng luật). Sổ chung cả hệ thống:
        // dòng in ra có thể của khách khác nhắn cùng lúc — log_loi đã che SĐT, chỉ in nguồn + 200 ký tự.
        try {
          const loi = await rest(`bot_errors?select=at,source,detail&source=like.chat-reply*&at=gt.${encodeURIComponent(mocLoi)}&order=at.asc&limit=20`);
          for (const x of loi) console.log(DO(`  sổ lỗi · ${x.source}: ${String(x.detail ?? "").slice(0, 200)}`));
          if (loi.length) mocLoi = loi[loi.length - 1].at;
        } catch { /* đọc sổ lỗi hỏng không được làm hỏng lượt chat */ }
        return j.replies ?? (j.reply ? [j.reply] : []);
      }
      throw new Error("chat-reply kẹt in_flight sau 8 lượt");
    },
    async tin(uid) {
      const s = await rest(`sellers?select=id,seller_type,xung_ho,active_listing_id&zalo_user_id=eq.${encodeURIComponent(uid)}`);
      const b = await rest(`buyers?select=id,preferences&zalo_user_id=eq.${encodeURIComponent(uid)}`);
      const ls = s.length ? await rest(`listings?select=*&seller_id=eq.${s[0].id}&order=created_at.asc`) : [];
      const facts = ls.length ? await rest(`listing_facts?select=listing_id,question,answer&listing_id=in.(${ls.map((l) => l.id).join(",")})`) : [];
      const treo = ls.length ? await rest(`info_requests?select=listing_id,question&status=eq.pending&listing_id=in.(${ls.map((l) => l.id).join(",")})`) : [];
      return { nguoiBan: s[0] ?? null, nguoiMua: b[0] ?? null, tin: ls, facts, treo };
    },
    async xoa(uid) { return rpc("reset_nguoi_test", { p_zalo: uid }).catch((e) => ({ ok: false, loi: String(e).slice(0, 160) })); },
  };
}

// Kho mẫu cho chế độ MÁY: 5 căn Quận 5 dựng tay (không phải dữ liệu khách thật), đủ để thử nhánh MUA có ra căn.
const KHO_MAU = [
  { code: "BDS-NP-Q5-9001", street: "Trần Hưng Đạo", ward: "Phường 1", price_raw: "5,2 tỷ", price_vnd: 5.2e9, area_m2: 48, frontage_m: 4, length_m: 12, floors: 3, floors_text: "trệt + 2 lầu", bedrooms: 3, access_type: "hem_xe_hoi", alley_width_m: 5, description: "Nhà hẻm 5m xe hơi vào tới cửa, gần chợ, sổ hồng riêng." },
  { code: "BDS-NP-Q5-9002", street: "Nguyễn Trãi", ward: "Phường 2", price_raw: "6 tỷ 3", price_vnd: 6.3e9, area_m2: 55, frontage_m: 4, length_m: 13.8, floors: 4, floors_text: "trệt + 3 lầu", bedrooms: 4, access_type: "hem_xe_hoi", alley_width_m: 4, description: "Nhà 4 tầng hẻm 4m, gần trường học." },
  { code: "BDS-NP-Q5-9003", street: "An Dương Vương", ward: "Phường 8", price_raw: "7 tỷ", price_vnd: 7e9, area_m2: 70, frontage_m: 5, length_m: 14, floors: 2, floors_text: "trệt + 1 lầu", bedrooms: 2, access_type: "mat_tien", description: "Mặt tiền đường lớn, tiện kinh doanh." },
  { code: "BDS-NP-Q5-9004", street: "Hùng Vương", ward: "Phường 4", price_raw: "4 tỷ 5", price_vnd: 4.5e9, area_m2: 36, frontage_m: 3.5, length_m: 10.3, floors: 3, floors_text: "trệt + 2 lầu", bedrooms: 2, access_type: "hem_xe_may", alley_width_m: 2.5, description: "Nhà hẻm xe máy, yên tĩnh, dọn vào ở ngay." },
  { code: "BDS-NP-Q5-9005", street: "Châu Văn Liêm", ward: "Phường 10", price_raw: "8 tỷ 8", price_vnd: 8.8e9, area_m2: 80, frontage_m: 4.5, length_m: 17.8, floors: 5, floors_text: "trệt + 4 lầu", bedrooms: 5, access_type: "hem_xe_hoi", alley_width_m: 6, description: "Nhà 5 tầng hẻm 6m, có thang máy." },
];

async function mayChuMay() {
  const API_KEY = layEnv("ANTHROPIC_API_KEY");
  const MODEL = layEnv("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6"; // như _shared/claude.ts
  // Cài SDK lần đầu (bun tìm node_modules từ vị trí file bundle, tức thư mục này).
  if (!existsSync(join(HERE, "node_modules", "@anthropic-ai", "sdk"))) {
    console.log(XAM("Cài gói lần đầu (bun install)…"));
    const r = Bun.spawnSync([process.execPath, "install"], { cwd: HERE, stdout: "inherit", stderr: "inherit" });
    if (r.exitCode !== 0) { console.error(DO("bun install lỗi")); process.exit(1); }
  }
  // Đóng gói chat-reply như e2e/chay.sh — mã bot THẬT trong repo, chỉ thay DB và (nếu không có khoá) model.
  const SRC = join(GOC, "bot", "supabase", "functions", "chat-reply", "index.ts");
  const BUNDLE = join(HERE, "chat-reply.chat.bundle.mjs");
  {
    const r = Bun.spawnSync([process.execPath, "build", SRC, "--target=node", "--external", "npm:*", "--outfile", BUNDLE]);
    if (r.exitCode !== 0) { console.error(new TextDecoder().decode(r.stderr)); process.exit(1); }
    const s = readFileSync(BUNDLE, "utf8")
      .replaceAll('"npm:@supabase/supabase-js@2"', '"../e2e/mock-supabase.mjs"')
      .replaceAll('"npm:@anthropic-ai/sdk/helpers/zod"', '"@anthropic-ai/sdk/helpers/zod"')
      .replaceAll('"npm:@anthropic-ai/sdk"', API_KEY ? '"@anthropic-ai/sdk"' : '"../e2e/mock-anthropic.mjs"')
      .replaceAll('"npm:zod@4"', '"zod"');
    // 08/10/2026 (chủ dự án: "đưa chỗ thêm ảnh ở trang test"): ảnh khách thử tải lên nằm ở trang thử (https://….trycloudflare.com/anh/…),
    // không ở CDN Zalo — CHỈ bản đóng gói cho trang thử cho thêm tên miền đó vào danh sách ảnh hợp lệ (SEC-08). Code bot / production
    // không đổi. Không tìm thấy danh sách thì dừng, không âm thầm chạy với ảnh bị chặn.
    const s2 = s.replace(/(HOST_ANH\s*=\s*\[\s*)"zalo\.me",/, '$1"zalo.me", "trycloudflare.com",');
    if (s2 === s) { console.error(DO("Không tìm thấy HOST_ANH trong bundle — trang thử không nhận được ảnh.")); process.exit(1); }
    writeFileSync(BUNDLE, s2);
  }
  const { FakeDB, napPhuongThat, napPhuongCuThat, createClient } = await import("../e2e/mock-supabase.mjs");
  const PHUONG_CU = await napPhuongCuThat();
  // 07/10/2026: bản kéo từ production (keo-that.mjs → that.json): công tắc app_config + mẫu câu luôn dùng; bot_prompts chỉ
  // đè code khi `--prompt db` (mặc định `code` = bản sẽ deploy — production chỉ lệch ở khoá keo-that.mjs in ra).
  const pDuLieu = giaTri("--du-lieu") ?? join(HERE, "that.json");
  const DL = existsSync(pDuLieu) ? JSON.parse(readFileSync(pDuLieu, "utf8")) : null;
  const CHE_DO_PROMPT = giaTri("--prompt") === "db" && DL ? "db" : "code";
  // Bảng bot_prompts của DB giả — trang sửa prompt ghi vào đây, `moi()` chép lại khi dựng DB mới.
  const DUONG = DL?.duong ?? []; // chỉ đọc, dùng chung giữa các lần `moi()`
  const PROMPT_DB = CHE_DO_PROMPT === "db" ? (DL.bot_prompts ?? []).map((r) => ({ key: r.key, content: r.content })) : [];
  const fetchThat = globalThis.fetch;
  // Chỉ cho model đi ra ngoài; Nominatim / ảnh Zalo / mọi URL khác trả 404 (chat-reply coi là đường đi bình thường).
  // 07/10/2026 : có `CHAT_LOG_BAM` thì mỗi lượt model ghi vào nhật ký — loại lượt (dòng đầu system) + đầu ra (JSON
  // bóc tách / lời trả lời), để đọc được AI đã đọc ra gì khi một ô bị mất. Không ghi header (khoá API), cắt 1.500 chữ.
  globalThis.fetch = async (url, opt) => {
    // Ảnh khách thử tải lên trang (`/anh/<id>`) → trả thẳng từ bộ nhớ, không đi vòng qua đường hầm.
    const mAnh = /^https:\/\/[^/]+\/anh\/([a-z0-9]{8,20})(?:\.[a-z]+)?$/.exec(String(url));
    if (mAnh && globalThis.__khoAnhThu?.has(mAnh[1])) {
      const a = globalThis.__khoAnhThu.get(mAnh[1]);
      return new Response(a.bytes, { status: 200, headers: { "content-type": a.mime, "content-length": String(a.bytes.byteLength) } });
    }
    if (!/api\.anthropic\.com/.test(String(url))) return new Response("", { status: 404 });
    // Ảnh trang thử gửi model theo URL thì model phải tự tải qua đường hầm — trycloudflare chặn bằng robots.txt (thử thật 08/10:
    // "URL is disallowed by the website's robots.txt"). Đổi nguồn ảnh của CHÍNH trang thử sang base64 lấy từ bộ nhớ trước khi gửi.
    if (globalThis.__khoAnhThu?.size && typeof opt?.body === "string" && opt.body.includes("/anh/")) {
      try {
        const req = JSON.parse(opt.body);
        let doi = false;
        const duyet = (x) => {
          if (Array.isArray(x)) return x.forEach(duyet);
          if (!x || typeof x !== "object") return;
          const m = x.type === "image" && x.source?.type === "url" ? /\/anh\/([a-z0-9]{8,20})(?:\.[a-z]+)?$/.exec(String(x.source.url)) : null;
          const a = m ? globalThis.__khoAnhThu.get(m[1]) : null;
          if (a) { x.source = { type: "base64", media_type: a.mime, data: Buffer.from(a.bytes).toString("base64") }; doi = true; return; }
          for (const v of Object.values(x)) duyet(v);
        };
        duyet(req.messages);
        if (doi) {
          // Thân đổi độ dài → bỏ content-length cũ (nếu SDK có đặt) để fetch tự tính lại.
          let hd = opt.headers;
          if (hd instanceof Headers) { hd = new Headers(hd); hd.delete("content-length"); }
          else if (hd && typeof hd === "object") hd = Object.fromEntries(Object.entries(hd).filter(([k]) => k.toLowerCase() !== "content-length"));
          opt = { ...opt, headers: hd, body: JSON.stringify(req) };
        }
      } catch { /* không đổi được thì gửi nguyên */ }
    }
    const res = await fetchThat(url, opt);
    if (globalThis.__ghiAi) {
      try {
        const req = JSON.parse(String(opt?.body ?? "{}"));
        const sys = Array.isArray(req.system) ? req.system.map((x) => x?.text ?? "").join(" ") : String(req.system ?? "");
        const loai = (/CHẾ ĐỘ CHỐT TIN/.test(sys) ? "chot " : "") + sys.replace(/\s+/g, " ").slice(0, 60);
        const body = await res.clone().json().catch(() => null);
        // 08/10/2026 (SRS-5.1zzzu): API trả lỗi (vd 400 grammar quá lớn) thì `content` không có — ghi mã + lời lỗi, đừng để dòng rỗng.
        const ra = body?.error ? `[LỖI API ${res.status}] ${body.error.type ?? ""}: ${body.error.message ?? ""}`
          : (body?.content ?? []).map((c) => c?.type === "tool_use" ? JSON.stringify(c.input) : c?.text ?? "").join(" ");
        globalThis.__ghiAi(loai, ra.slice(0, 1500));
      } catch { /* vết chỉ để đọc, hỏng thì bỏ */ }
    }
    return res;
  };
  const moi = () => {
    globalThis.__db = new FakeDB(); globalThis.__calls = []; globalThis.__rpc = {}; globalThis.__treTruyVan = null;
    const d = globalThis.__db;
    // 30/09/2026: bảng `wards` thật (168 phường) — như DB production, để chốt phường chạy đúng khi chat thử.
    d.t.wards = napPhuongThat().map((w) => ({ ...w }));
    d.t.phuong_cu = PHUONG_CU.map((c) => ({ ...c }));
    d.t.bot_prompts = PROMPT_DB.map((r) => ({ ...r }));
    // 07/10/2026: từ điển tên đường production (keo-that.mjs) + danh sách quận cũ — như run.mjs dựng cho ca tra phường.
    if (DUONG.length) d.t.duong = DUONG;
    d.t.quan_cu = [...new Set(d.t.wards.map((w) => w.quan_cu).filter(Boolean))].map((ten) => ({ ten }));
    const chu = d.insert("sellers", { zalo_user_id: "may-kho-chu", seller_type: "ccrb", name: null, active_listing_id: null }).data;
    for (const l of KHO_MAU) {
      d.insert("listings", { ...l, seller_id: chu.id, deal: "ban", status: "dang_ban", property_type: "nha_pho", district: "Quận 5", location_raw: l.street, legal_status: "so_hong_rieng" });
    }
  };
  moi();
  // Công tắc như production (boc_tach_ai 'chinh' từ 21/09). `test_reset_hello`: gõ "hello" là làm lại người đó.
  globalThis.__cauHinh = { boc_tach_ai: "chinh", bao_lai_da_luu: "thay_doi", luat_loi_bot: "gon", ...(DL?.cau_hinh ?? {}), test_reset_hello: "1" };
  globalThis.__mauCau = { ban: DL?.mau_cau?.ban ?? "", mua: DL?.mau_cau?.mua ?? "" };
  // Trang web sửa prompt / công tắc giữa chừng: đọc lại mỗi lượt thay vì nhớ 60 s (như bộ e2e).
  if (WEB) globalThis.__khongNhoCauHinh = true;
  const ENV = { SUPABASE_URL: "http://may", SUPABASE_SERVICE_ROLE_KEY: "svc", BRIDGE_SECRET: "s3cret", ANTHROPIC_API_KEY: API_KEY ?? "test-key", ANTHROPIC_MODEL: MODEL };
  globalThis.Deno = { serve: (h) => { globalThis.__handler = h; }, env: { get: (k) => ENV[k] } };
  await import(BUNDLE);
  const H = globalThis.__handler;
  let n = 0, daInLoi = 0;
  return {
    ten: `MÁY (DB giả · ${API_KEY ? `model thật ${MODEL}` : "model GIẢ — không có ANTHROPIC_API_KEY, chỉ thấy phần luật"} · prompt ${CHE_DO_PROMPT === "db" ? "production" : "code"} · công tắc ${DL ? "production" : "mặc định"}${DUONG.length ? ` · ${DUONG.length} tên đường` : ""})`,
    // Trang sửa prompt (chỉ --web): đọc / ghi bảng bot_prompts + công tắc của DB giả, có hiệu lực từ lượt kế.
    prompt: () => PROMPT_DB,
    suaPrompt(key, content) {
      const r = PROMPT_DB.find((x) => x.key === key);
      if (r) r.content = content; else PROMPT_DB.push({ key, content });
      const t = globalThis.__db.t.bot_prompts, r2 = t.find((x) => x.key === key);
      if (r2) r2.content = content; else t.push({ key, content });
    },
    cauHinh: () => globalThis.__cauHinh,
    async kiemId() { return true; },
    async gui(uid, text, imageUrl = null) {
      const b = { msg_id: `c${++n}`, channel: "zalo_personal_test", external_user_id: uid, text, ...(imageUrl ? { image_url: imageUrl } : {}) };
      const tho = JSON.stringify(b);
      const hdrs = { "content-length": String(Buffer.byteLength(tho)), "x-bridge-secret": "s3cret" };
      // chat-reply in log vận hành (_ms, lỗi JSON của model giả…) ra console — tắt trong lúc gọi cho màn hình gọn.
      const [l, w, e] = [console.log, console.warn, console.error];
      if (!LOG) console.log = console.warn = console.error = () => {};
      let res, j;
      try {
        res = await H({ method: "POST", headers: { get: (k) => hdrs[k.toLowerCase()] ?? null }, text: async () => tho, json: async () => b });
        j = await res.json();
      } finally { [console.log, console.warn, console.error] = [l, w, e]; }
      if (res.status !== 200) throw new Error(`chat-reply HTTP ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
      // Lượt model hỏng thì bot vẫn trả lời bằng luật — không in sổ lỗi ra là người chạy tưởng model đang chạy.
      const loi = globalThis.__db.t.bot_errors ?? [];
      for (const x of loi.slice(daInLoi)) console.log(DO(`  sổ lỗi · ${x.source}: ${String(x.detail ?? "").slice(0, 200)}`));
      daInLoi = loi.length;
      return j.replies ?? (j.reply ? [j.reply] : []);
    },
    async tin(uid) {
      const t = globalThis.__db.t;
      const s = (t.sellers ?? []).find((x) => x.zalo_user_id === uid) ?? null;
      const b = (t.buyers ?? []).find((x) => x.zalo_user_id === uid) ?? null;
      const ls = s ? (t.listings ?? []).filter((l) => l.seller_id === s.id) : [];
      const ids = new Set(ls.map((l) => l.id));
      return {
        nguoiBan: s, nguoiMua: b, tin: ls,
        facts: (t.listing_facts ?? []).filter((f) => ids.has(f.listing_id)),
        treo: (t.info_requests ?? []).filter((q) => ids.has(q.listing_id) && q.status === "pending"),
      };
    },
    async xoa() { moi(); daInLoi = 0; return { ok: true }; },
    // 08/10/2026 (chủ dự án: "sửa luôn trên link… để link được lâu"): trang tự nạp code mới thì tiến trình bật lại — chụp DB giả
    // + công tắc + prompt sửa tay để nạp lại. Bảng tĩnh (phường, tên đường) không chụp: `moi()` dựng lại từ nguồn.
    chup() {
      const d = globalThis.__db, TINH = new Set(["wards", "phuong_cu", "quan_cu", "duong"]);
      return { t: Object.fromEntries(Object.entries(d.t).filter(([k]) => !TINH.has(k))), seq: d.seq, storage: d.storage, n, daInLoi, cauHinh: globalThis.__cauHinh, prompt: PROMPT_DB };
    },
    nap(s) {
      const d = globalThis.__db;
      Object.assign(d.t, s.t ?? {});
      d.seq = s.seq ?? d.seq; d.storage = s.storage ?? [];
      n = s.n ?? 0; daInLoi = s.daInLoi ?? 0;
      if (s.cauHinh) globalThis.__cauHinh = s.cauHinh;
      PROMPT_DB.splice(0, PROMPT_DB.length, ...(s.prompt ?? []));
      d.t.bot_prompts = PROMPT_DB.map((r) => ({ ...r }));
    },
    // Trang web nhiều người: chỉ xoá dữ liệu của MỘT người (như reset_nguoi_test thật), kho mẫu và người khác giữ nguyên.
    async xoaMot(uid) { return (await createClient().rpc("reset_nguoi_test", { p_zalo: uid })).data; },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
const COT_TIN = ["code", "status", "deal", "property_type", "district", "ward", "street", "location_raw", "price_raw", "price_vnd", "area_m2", "frontage_m", "length_m", "floors", "floors_text", "bedrooms", "access_type", "alley_width_m", "legal_status", "direction", "diem_tin"];
function inTinhTrang(k) {
  if (!k.nguoiBan && !k.nguoiMua) { console.log(XAM("  (chưa có hồ sơ nào cho người này)")); return; }
  if (k.nguoiMua) console.log(`  ${VANG("Hồ sơ mua:")} ${JSON.stringify(k.nguoiMua.preferences ?? {})}`);
  if (k.nguoiBan) console.log(`  ${VANG("Người bán:")} ${k.nguoiBan.seller_type ?? "?"}${k.nguoiBan.xung_ho ? ` · xưng "${k.nguoiBan.xung_ho}"` : ""}`);
  for (const l of k.tin) {
    const dong = COT_TIN.filter((c) => l[c] !== null && l[c] !== undefined && l[c] !== "").map((c) => `${c}=${typeof l[c] === "object" ? JSON.stringify(l[c]) : l[c]}`);
    console.log(`  ${VANG(`Tin ${l.code ?? l.id}${k.nguoiBan?.active_listing_id === l.id ? " (đang nói)" : ""}:`)} ${dong.join(" · ")}`);
    const fs = k.facts.filter((f) => f.listing_id === l.id);
    if (fs.length) console.log(`    facts: ${fs.map((f) => `${f.question}=${String(f.answer).slice(0, 40)}`).join(" · ")}`);
    const tq = k.treo.filter((q) => q.listing_id === l.id);
    if (tq.length) console.log(`    đang hỏi: ${tq.map((q) => q.question).join(", ")}`);
  }
}

const HUONG_DAN = `Gõ như khách nhắn Zalo rồi Enter. Lệnh: ${VANG("/tin")} xem tin + hồ sơ · ${VANG("/moi")} làm lại người mới · ${VANG("/giup")} · ${VANG("/thoat")}`;

const may = THAT ? await mayChuThat() : await mayChuMay();
let uid = giaTri("--id") ?? (THAT ? `thu-chat-${ngauNhien()}` : "may-khach");
if (!/^[a-z0-9-]{3,40}$/.test(uid) || !(await may.kiemId(uid))) {
  console.error(DO(`"${uid}" không phải ID thử (la_id_thu) — không chat bằng ID có thể là khách thật.`));
  process.exit(2);
}
if (THAT) {
  const r = await may.xoa(uid);
  if (r?.ok === false) console.log(VANG(`  (dọn trước: ${r.ly_do ?? r.loi ?? "không dọn được"})`));
}
console.log(`${XANH("Chat thử bot")} — ${may.ten} · ID ${uid}`);
console.log(XAM(HUONG_DAN));

if (WEB) {
  if (THAT) { console.error(DO("--web chỉ chạy chế độ MÁY (DB giả), không bắn production.")); process.exit(2); }
  // 07/10/2026 (chủ dự án: "vài người test 1 lúc dc ko"): mỗi trình duyệt tự sinh một mã khách `web-xxxxxxxx` (lưu ở máy
  // người thử) và gửi kèm mỗi lượt — mỗi mã là một người riêng trong DB giả, chung kho 5 căn mẫu. Lượt của mọi người vẫn
  // xử lý TUẦN TỰ (chat-reply dùng biến toàn cục + DB giả trong bộ nhớ, hai lượt chen nhau là rối): đông người thì chờ vài
  // giây. Trần lượt chung cho cả lần chạy để link lỡ lộ ra cũng không đốt quá nhiều credit model.
  const TRAN = Number(giaTri("--tran") ?? 300) || 300;
  let soLuot = 0, hang = Promise.resolve();
  const lichSuCua = new Map();
  const lichSu = (id) => { if (!lichSuCua.has(id)) lichSuCua.set(id, []); return lichSuCua.get(id); };
  // 07/10/2026 (chủ dự án: "muốn m đọc liên tục như test trước kia"): NHẬT KÝ chung mọi người thử, chỉ thêm không xoá (nút
  // "Xoá chat" chỉ làm người đó mới lại, nhật ký giữ dòng `xoa`) — để Claude đọc trong lúc đang test qua GET /nhat-ky.
  // Khoá: chỉ nhận khi có CHAT_LOG_BAM = sha256 của khoá đọc (workflow nhận MÃ BĂM, không bao giờ nhận khoá — log Actions
  // công khai); không đặt thì /nhat-ky trả 404. Nhật ký chỉ ở bộ nhớ runner, tắt trang là mất (như lịch sử chat).
  const BAM_LOG = String(process.env.CHAT_LOG_BAM ?? "").trim().toLowerCase();
  const nhatKy = [];
  const ghiNhatKy = (id, ai, text, them = {}) => { nhatKy.push({ i: nhatKy.length, luc: new Date().toISOString(), id, ai, text, ...them }); if (nhatKy.length > 20000) nhatKy.splice(0, 5000); };
  let idDangChay = null;
  if (BAM_LOG) globalThis.__ghiAi = (loai, ra) => { if (idDangChay) ghiNhatKy(idDangChay, "ai", ra, { loai }); };
  const dungKhoa = (req) => !!BAM_LOG && /^[0-9a-f]{64}$/.test(BAM_LOG) &&
    createHash("sha256").update(String(req.headers.get("x-khoa") ?? "")).digest("hex") === BAM_LOG;
  const maKhach = (req) => { const m = String(req.headers.get("x-khach") ?? ""); return /^web-[a-z0-9]{6,16}$/.test(m) ? m : null; };
  const tuanTu = (fn) => { const p = hang.then(fn, fn); hang = p.catch(() => {}); return p; };
  const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "content-type": "application/json; charset=utf-8" } });
  // 08/10/2026: kho ảnh khách thử tải lên — chỉ trong bộ nhớ runner (tắt trang là mất), trần 8 MB / ảnh, 300 ảnh.
  const KHO_ANH = new Map();
  globalThis.__khoAnhThu = KHO_ANH;
  const DUOI = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic" };
  const port = Number(giaTri("--port") ?? process.env.PORT ?? 3000) || 3000;
  // 07/10/2026 (chủ dự án: "test là cái chuẩn nhất và có thể sửa ở đây lun"): trang /prompt sửa prompt + công tắc của DB giả
  // — bot dùng ngay từ lượt kế, cho MỌI người trên link. Mỗi lần lưu ghi `sua-prompt.json` (chỉ khoá khác bản lúc bật trang);
  // chat-web.yml cất file đó vào nhánh `chat-web/sua-prompt-<run>` khi tắt, để gộp vào prompts.ts bằng PR rồi `dong-bo-prompt --day`.
  const P = await import(join(GOC, "bot", "supabase", "functions", "_shared", "prompts.ts"));
  const CODE = {
    loi_chao: P.LOI_CHAO, tone_rules: P.TONE_RULES, seller_script_rules: P.SELLER_SCRIPT_RULES, seller_fewshot: P.SELLER_FEWSHOT,
    fee_rules: P.FEE_RULES, cau_hoi_mau: P.CAU_HOI_MAU_TEXT, cau_tien_dinh: P.CAU_TIEN_DINH_TEXT, human_chat_rules: P.HUMAN_CHAT_RULES,
    buyer_fewshot: P.BUYER_FEWSHOT, slang_notes: P.SLANG_NOTES, agree_rules: P.AGREE_RULES,
  };
  const CONG_TAC = ["boc_tach_ai", "bao_lai_da_luu", "luat_loi_bot", "tro_ly", "nhip_go", "lenh_json"];
  const dangDung = (k) => may.prompt().find((r) => r.key === k)?.content ?? CODE[k];
  const BAN_DAU = Object.fromEntries(Object.keys(CODE).map((k) => [k, dangDung(k)]));
  const CH_DAU = Object.fromEntries(CONG_TAC.map((k) => [k, may.cauHinh()[k] ?? ""]));
  const pSua = giaTri("--luu-sua") ?? join(HERE, "sua-prompt.json");
  const ghiSua = () => {
    const prompt = Object.fromEntries(Object.keys(CODE).filter((k) => dangDung(k) !== BAN_DAU[k]).map((k) => [k, dangDung(k)]));
    const cau_hinh = Object.fromEntries(CONG_TAC.filter((k) => (may.cauHinh()[k] ?? "") !== CH_DAU[k]).map((k) => [k, may.cauHinh()[k] ?? ""]));
    writeFileSync(pSua, JSON.stringify({ luc: new Date().toISOString(), prompt, cau_hinh }, null, 2));
    return { prompt: Object.keys(prompt), cau_hinh: Object.keys(cau_hinh) };
  };
  // 08/10/2026: `--luu-trang <file>` — chat-web.yml tắt trang (SIGTERM) để nạp code mới khi nhánh có commit mới, đường hầm giữ
  // nguyên nên link không đổi. Tắt thì cất mọi thứ người thử thấy (lịch sử, nhật ký, DB giả, ảnh, bản sửa prompt); bật lại thì
  // nạp. Mốc "bản đầu" của trang sửa prompt (BAN_DAU / CH_DAU ở trên) tính TRƯỚC khi nạp, nên bản sửa tay vẫn hiện là bản sửa.
  const pTrang = giaTri("--luu-trang");
  if (pTrang && existsSync(pTrang)) {
    try {
      const s = JSON.parse(readFileSync(pTrang, "utf8"));
      may.nap(s.db ?? {});
      for (const [k, v] of s.lichSu ?? []) lichSuCua.set(k, v);
      nhatKy.push(...(s.nhatKy ?? []));
      soLuot = s.soLuot ?? 0;
      for (const [k, a] of s.anh ?? []) KHO_ANH.set(k, { mime: a.mime, bytes: new Uint8Array(Buffer.from(a.b64, "base64")) });
      ghiSua();
      ghiNhatKy("he-thong", "nap", `nạp code mới (${process.env.CHAT_PHIEN ?? "?"}) — giữ ${lichSuCua.size} người, ${soLuot} lượt`);
      console.log(XAM(`Nạp lại trang: ${lichSuCua.size} người, ${nhatKy.length} dòng nhật ký, ${KHO_ANH.size} ảnh`));
    } catch (e) { console.error(DO(`Không nạp được ${pTrang}: ${e?.message ?? e} — bật trang trắng`)); }
  }
  if (pTrang) {
    const cat = (sig) => {
      // Chờ lượt đang chạy xong rồi mới cất (một lượt model ≤ vài chục giây); workflow đợi tối đa 90 s.
      hang.finally(() => {
        try {
          writeFileSync(pTrang, JSON.stringify({
            luc: new Date().toISOString(), db: may.chup(), lichSu: [...lichSuCua], nhatKy, soLuot,
            anh: [...KHO_ANH].map(([k, a]) => [k, { mime: a.mime, b64: Buffer.from(a.bytes).toString("base64") }]),
          }));
          console.log(XAM(`Đã cất trang (${sig}) vào ${pTrang}`));
          process.exit(0);
        } catch (e) { console.error(DO(`Không cất được trang: ${e?.message ?? e}`)); process.exit(1); }
      });
    };
    process.on("SIGTERM", () => cat("SIGTERM"));
    process.on("SIGINT", () => cat("SIGINT"));
  }
  Bun.serve({
    port,
    // VPS (cai-vps.sh): `--host 127.0.0.1` — chỉ đường hầm cloudflared vào được, không mở cổng thẳng ra Internet.
    hostname: giaTri("--host") ?? "0.0.0.0",
    async fetch(req) {
      const u = new URL(req.url);
      if (req.method === "GET" && u.pathname === "/") return new Response(TRANG_WEB_HTML().replace("__TEN__", may.ten), { headers: { "content-type": "text/html; charset=utf-8" } });
      if (req.method === "GET" && u.pathname === "/prompt") return new Response(TRANG_PROMPT_HTML(), { headers: { "content-type": "text/html; charset=utf-8" } });
      if (req.method === "GET" && u.pathname === "/prompt/du-lieu") {
        return json({
          prompt: Object.keys(CODE).map((k) => ({ key: k, noi_dung: dangDung(k), ban_dau: BAN_DAU[k], khac_code: dangDung(k) !== CODE[k] })),
          cau_hinh: CONG_TAC.map((k) => ({ key: k, gia_tri: may.cauHinh()[k] ?? "", ban_dau: CH_DAU[k] })),
        });
      }
      if (req.method === "POST" && u.pathname === "/prompt/luu") {
        const b = await req.json().catch(() => ({}));
        return tuanTu(async () => {
          if (b?.loai === "prompt" && b.key in CODE && typeof b.noi_dung === "string" && b.noi_dung.length <= 60000) may.suaPrompt(b.key, b.noi_dung);
          else if (b?.loai === "cau_hinh" && CONG_TAC.includes(b.key) && typeof b.noi_dung === "string" && b.noi_dung.length <= 40) may.cauHinh()[b.key] = b.noi_dung.trim();
          else return json({ loi: "khoá hoặc nội dung không hợp lệ" }, 400);
          return json({ ok: true, da_sua: ghiSua() });
        });
      }
      if (req.method === "GET" && u.pathname === "/nhat-ky") {
        if (!dungKhoa(req)) return new Response("không có", { status: 404 });
        const tu = Math.max(0, Number(u.searchParams.get("tu") ?? 0) || 0);
        const dong = nhatKy.filter((d) => d.i >= tu);
        // ?tin=1: kèm tình trạng tin + hồ sơ hiện tại của từng người có dòng mới (như lệnh /tin).
        const tin = u.searchParams.get("tin") === "1"
          ? Object.fromEntries(await Promise.all([...new Set(dong.map((d) => d.id))].map(async (k) => [k, await may.tin(k)])))
          : undefined;
        return json({ den: nhatKy.length, conLai: TRAN - soLuot, dong, ...(tin ? { tin } : {}) });
      }
      // Ảnh công khai: model (Anthropic) tự tải theo URL nên đường này không đòi mã khách.
      if (req.method === "GET" && u.pathname.startsWith("/anh/")) {
        const a = KHO_ANH.get(u.pathname.slice(5).replace(/\.[a-z]+$/, ""));
        return a ? new Response(a.bytes, { headers: { "content-type": a.mime, "cache-control": "no-store" } }) : new Response("không có", { status: 404 });
      }
      if (u.pathname === "/") return new Response("không có", { status: 404 });
      const id = maKhach(req);
      if (!id) return json({ loi: "thiếu mã khách" }, 400);
      if (req.method === "GET" && u.pathname === "/lich-su") return json({ lichSu: lichSu(id), conLai: TRAN - soLuot, nguoi: lichSuCua.size });
      if (req.method === "GET" && u.pathname === "/tin") return json(await may.tin(id));
      if (req.method === "POST" && u.pathname === "/moi") return tuanTu(async () => { await may.xoaMot(id); lichSu(id).length = 0; ghiNhatKy(id, "xoa", "(bấm Xoá chat)"); return json({ ok: true }); });
      if (req.method === "POST" && u.pathname === "/anh") {
        const mime = String(req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (!DUOI[mime]) return json({ loi: "chỉ nhận ảnh jpg / png / webp / gif / heic" }, 400);
        const bytes = new Uint8Array(await req.arrayBuffer());
        if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) return json({ loi: "ảnh rỗng hoặc quá 8 MB" }, 400);
        if (KHO_ANH.size >= 300) KHO_ANH.delete(KHO_ANH.keys().next().value);
        const ma = Math.random().toString(36).slice(2, 12).padEnd(10, "0");
        KHO_ANH.set(ma, { bytes, mime });
        // Host công khai (cloudflared chuyển nguyên Host) — model đi lấy ảnh qua đúng URL này.
        return json({ url: `https://${req.headers.get("host")}/anh/${ma}.${DUOI[mime]}` });
      }
      if (req.method === "POST" && u.pathname === "/gui") {
        const b = await req.json().catch(() => ({}));
        const text = String(b?.text ?? "").trim().slice(0, 2000);
        const anh = /^https:\/\/[^/]+\/anh\/([a-z0-9]{8,20})\.[a-z]+$/.exec(String(b?.image_url ?? ""));
        const imageUrl = anh && KHO_ANH.has(anh[1]) ? String(b.image_url) : null;
        if (!text && !imageUrl) return json({ loi: "trống" }, 400);
        if (soLuot >= TRAN) return json({ loi: `hết ${TRAN} lượt của lần chạy này — chạy lại lệnh để chat tiếp` }, 429);
        return tuanTu(async () => {
          soLuot++;
          const ls = lichSu(id);
          ls.push({ ai: "khach", text, ...(imageUrl ? { anh: imageUrl } : {}) });
          ghiNhatKy(id, "khach", imageUrl ? `${text}${text ? " " : ""}[ảnh] ${imageUrl}` : text);
          const t0 = Date.now();
          idDangChay = id;
          try {
            const replies = (await may.gui(id, text, imageUrl)).map(String);
            for (const r of replies) ls.push({ ai: "bot", text: r });
            for (const r of replies) ghiNhatKy(id, "bot", r, { ms: Date.now() - t0 });
            return json({ replies, ms: Date.now() - t0, conLai: TRAN - soLuot });
          } catch (e) {
            const loi = String(e?.message ?? e).slice(0, 300);
            ls.push({ ai: "loi", text: loi });
            ghiNhatKy(id, "loi", loi);
            return json({ loi }, 500);
          } finally {
            idDangChay = null;
          }
        });
      }
      return new Response("không có", { status: 404 });
    },
  });
  console.log(`${XANH("Trang chat:")} http://localhost:${port}  ${XAM(`(Ctrl+C để tắt · trần ${TRAN} lượt)`)}`);
} else {
let dangDon = false;
async function thoat(ma = 0) {
  if (dangDon) return;
  dangDon = true;
  if (THAT && !GIU) {
    const r = await may.xoa(uid);
    console.log(XAM(`\nĐã dọn người thử ${uid}: ${JSON.stringify(r)}`));
  } else if (THAT) {
    console.log(XAM(`\nGiữ nguyên dữ liệu ${uid} (--giu). Dọn sau: bun run chat -- --that --id ${uid}, rồi /thoat.`));
  }
  process.exit(ma);
}
process.on("SIGINT", () => { thoat(0); });

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: TTY });
const nhac = () => { if (TTY) { rl.setPrompt(XANH("Bạn › ")); rl.prompt(); } };
nhac();
for await (const dongVao of rl) {
  const text = dongVao.trim();
  if (!text) { nhac(); continue; }
  if (!TTY) console.log(`${XANH("Bạn › ")}${text}`);
  try {
    if (text === "/thoat" || text === "/q") break;
    if (text === "/giup") console.log(XAM(HUONG_DAN));
    else if (text === "/tin") inTinhTrang(await may.tin(uid));
    else if (text === "/moi") {
      await may.xoa(uid);
      if (THAT && !giaTri("--id")) uid = `thu-chat-${ngauNhien()}`;
      console.log(XAM(`  Làm lại từ đầu · ID ${uid}`));
    } else {
      const t0 = Date.now();
      const replies = await may.gui(uid, text);
      if (!replies.length) console.log(XAM("  (bot không trả lời lượt này)"));
      for (const r of replies) console.log(`${VANG("Bot  › ")}${String(r).replace(/\n/g, "\n       ")}`);
      console.log(XAM(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`));
    }
  } catch (e) {
    console.log(DO(`  Lỗi: ${String(e?.message ?? e).slice(0, 300)}`));
  }
  nhac();
}
await thoat(0);
}

// Trang chat một khung, dáng Zalo. Không thư viện ngoài, không lưu gì phía trình duyệt; lịch sử giữ ở máy chạy lệnh.
function TRANG_WEB_HTML() {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chat thử bot</title><style>
:root{--nen:#e9ebef;--ban:#fff;--khach:#dbeafe;--chu:#0f172a;--mo:#64748b;--vien:#d0d5dd;--chinh:#0068ff}
@media (prefers-color-scheme:dark){:root{--nen:#0f141a;--ban:#1c232c;--khach:#163a6b;--chu:#e6e9ee;--mo:#94a3b8;--vien:#2c3540;--chinh:#4d9bff}}
*{box-sizing:border-box}body{margin:0;background:var(--nen);color:var(--chu);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;height:100dvh;display:flex;flex-direction:column}
header{background:var(--ban);border-bottom:1px solid var(--vien);padding:10px 16px;display:flex;gap:10px;align-items:center}
header b{flex:1}header small{color:var(--mo);display:block;font-weight:400}
button{font:inherit;border:1px solid var(--vien);background:var(--ban);color:var(--chu);border-radius:8px;padding:6px 10px;cursor:pointer}
#khung{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:6px}
.b{max-width:min(78%,640px);padding:9px 12px;border-radius:10px;white-space:pre-wrap;word-wrap:break-word;box-shadow:0 1px 1px rgba(0,0,0,.06)}
.bot{background:var(--ban);align-self:flex-start}.khach{background:var(--khach);align-self:flex-end}
.loi{background:#fee2e2;color:#991b1b;align-self:center;font-size:13px}.mo{color:var(--mo);font-size:12px;align-self:center}
form{display:flex;gap:8px;padding:10px 16px;background:var(--ban);border-top:1px solid var(--vien)}
textarea{flex:1;resize:none;font:inherit;padding:9px 12px;border-radius:10px;border:1px solid var(--vien);background:var(--nen);color:var(--chu);max-height:140px}
form button{background:var(--chinh);color:#fff;border:0;padding:0 18px}
#nutAnh{background:var(--ban);color:var(--chu);border:1px solid var(--vien);padding:0 12px;font-size:18px}
.b img{display:block;max-width:220px;max-height:260px;border-radius:8px;margin-bottom:4px}
pre{white-space:pre-wrap;font-size:12px;background:var(--ban);border:1px solid var(--vien);border-radius:10px;padding:10px;margin:0;align-self:stretch}
</style></head><body>
<header><b>Chat thử bot<small>__TEN__</small></b><a href="prompt" target="_blank"><button type="button">Sửa prompt</button></a><button id="xemTin" type="button">Xem tin</button><button id="lamLai" type="button">Làm lại</button></header>
<div id="khung"></div>
<form id="f"><input id="fa" type="file" accept="image/*" hidden><button type="button" id="nutAnh" title="Gửi ảnh">📷</button><textarea id="o" rows="1" placeholder="Nhắn như khách Zalo… (Enter để gửi, Shift+Enter xuống dòng)"></textarea><button>Gửi</button></form>
<script>
let MA='';try{MA=localStorage.getItem('ma-khach')||'';}catch(e){}
if(!/^web-[a-z0-9]{6,16}$/.test(MA)){MA='web-'+Math.random().toString(36).slice(2,10).padEnd(8,'0');try{localStorage.setItem('ma-khach',MA);}catch(e){}}
const H={'x-khach':MA};
const khung=document.getElementById('khung'),o=document.getElementById('o');
const them=(ai,text,anh)=>{const d=document.createElement(ai==='tin'?'pre':'div');d.className=ai==='tin'?'':'b '+ai;if(ai==='mo')d.className='mo';
 if(anh){const i=document.createElement('img');i.src=anh;i.alt='ảnh';d.appendChild(i);if(text)d.appendChild(document.createTextNode(text));}else d.textContent=text;
 khung.appendChild(d);khung.scrollTop=khung.scrollHeight;return d;};
fetch('lich-su',{headers:H}).then(r=>r.json()).then(j=>{for(const m of j.lichSu)them(m.ai,m.text,m.anh);them('mo','Bạn là khách '+MA+' · còn '+j.conLai+' lượt chung');}).catch(()=>{});
let dang=false;
// Ảnh: tải lên trang trước (POST anh), rồi gửi cùng chữ đang gõ (nếu có) như Zalo gửi ảnh kèm lời.
document.getElementById('nutAnh').onclick=()=>{if(!dang)document.getElementById('fa').click();};
document.getElementById('fa').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f||dang)return;
 if(f.size>8*1024*1024){them('loi','Ảnh quá 8 MB');return;}
 dang=true;const tai=them('mo','đang tải ảnh…');
 try{const r=await fetch('anh',{method:'POST',headers:{...H,'content-type':f.type||'image/jpeg'},body:f});const j=await r.json();tai.remove();
  if(j.loi){them('loi',j.loi);dang=false;return;}dang=false;await gui(j.url);}
 catch(err){tai.remove();them('loi','Không tải được ảnh: '+err);dang=false;}};
async function gui(anh){const text=o.value.trim();if((!text&&!anh)||dang)return;dang=true;o.value='';them('khach',text,anh);const cho=them('mo','bot đang gõ…');
 try{const r=await fetch('gui',{method:'POST',headers:{...H,'content-type':'application/json'},body:JSON.stringify({text,...(anh?{image_url:anh}:{})})});const j=await r.json();cho.remove();
  if(j.loi)them('loi',j.loi);else{if(!j.replies.length)them('mo','(bot không trả lời lượt này)');for(const x of j.replies)them('bot',x);them('mo',(j.ms/1000).toFixed(1)+'s');}}
 catch(e){cho.remove();them('loi','Mất kết nối: '+e);}dang=false;o.focus();}
document.getElementById('f').onsubmit=e=>{e.preventDefault();gui();};
o.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();gui();}};
document.getElementById('lamLai').onclick=async()=>{if(!confirm('Xoá cuộc chat, làm lại như khách mới?'))return;await fetch('moi',{method:'POST',headers:H});khung.innerHTML='';them('mo','Đã làm lại từ đầu');};
document.getElementById('xemTin').onclick=async()=>{const j=await fetch('tin',{headers:H}).then(r=>r.json());
 const dong=[];if(j.nguoiMua)dong.push('Hồ sơ mua: '+JSON.stringify(j.nguoiMua.preferences||{}));if(j.nguoiBan)dong.push('Người bán: '+(j.nguoiBan.seller_type||'?'));
 for(const l of j.tin){const c=Object.entries(l).filter(([k,v])=>v!==null&&v!==''&&typeof v!=='object'&&!/(_id|^id|_at)$/.test(k)).map(([k,v])=>k+'='+v);dong.push('Tin: '+c.join(' · '));
  const fs=j.facts.filter(f=>f.listing_id===l.id);if(fs.length)dong.push('  facts: '+fs.map(f=>f.question+'='+String(f.answer).slice(0,40)).join(' · '));
  const tq=j.treo.filter(q=>q.listing_id===l.id);if(tq.length)dong.push('  đang hỏi: '+tq.map(q=>q.question).join(', '));}
 them('tin',dong.length?dong.join('\\n'):'(chưa có hồ sơ nào)');};
o.focus();
</script></body></html>`;
}

// Trang sửa prompt + công tắc (chỉ --web). Sửa ở đây là sửa DB GIẢ của lần chạy này: bot dùng từ lượt kế, mất khi tắt trang
// (chat-web.yml cất bản sửa vào nhánh git). Production KHÔNG đổi cho tới khi gộp vào prompts.ts và `dong-bo-prompt --day`.
function TRANG_PROMPT_HTML() {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sửa prompt</title><style>
:root{--nen:#e9ebef;--ban:#fff;--chu:#0f172a;--mo:#64748b;--vien:#d0d5dd;--chinh:#0068ff;--sua:#b45309}
@media (prefers-color-scheme:dark){:root{--nen:#0f141a;--ban:#1c232c;--chu:#e6e9ee;--mo:#94a3b8;--vien:#2c3540;--chinh:#4d9bff;--sua:#f59e0b}}
*{box-sizing:border-box}body{margin:0;background:var(--nen);color:var(--chu);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:960px;margin:0 auto;padding:16px}h1{font-size:20px;margin:0 0 4px}p{color:var(--mo);margin:0 0 14px;font-size:13px}
.the{background:var(--ban);border:1px solid var(--vien);border-radius:10px;padding:12px;margin-bottom:12px}
.hang{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.hang b{flex:1}
select,input,textarea,button{font:inherit;color:var(--chu);background:var(--nen);border:1px solid var(--vien);border-radius:8px;padding:6px 10px}
textarea{width:100%;min-height:55vh;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;margin-top:8px}
button{cursor:pointer;background:var(--ban)}button.chinh{background:var(--chinh);color:#fff;border:0}
.nhan{font-size:12px;color:var(--sua)}#bao{font-size:13px;color:var(--mo);min-height:1.4em}
.ct{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}.ct label{font-size:13px;color:var(--mo)}.ct input{width:100%}
</style></head><body><main>
<h1>Sửa prompt bot</h1>
<p>Bấm Lưu thì bot dùng bản mới từ tin nhắn kế tiếp, áp cho mọi người đang chat trên link này. Production KHÔNG đổi. Bản sửa được cất vào git khi tắt trang, để gộp vào code rồi đẩy lên sau ngày mở khoá.</p>
<div class="the"><div class="hang"><b>Prompt</b><select id="k"></select><span id="nhan" class="nhan"></span></div>
<textarea id="nd" spellcheck="false"></textarea>
<div class="hang" style="margin-top:8px"><button class="chinh" id="luu">Lưu</button><button id="goc">Về bản lúc bật trang</button><span id="bao"></span></div></div>
<div class="the"><div class="hang"><b>Công tắc (app_config)</b></div><div class="ct" id="ct"></div>
<div class="hang" style="margin-top:8px"><button id="luuCt">Lưu công tắc</button></div></div>
</main><script>
let D={prompt:[],cau_hinh:[]};const k=document.getElementById('k'),nd=document.getElementById('nd'),bao=document.getElementById('bao');
const cur=()=>D.prompt.find(x=>x.key===k.value);
function ve(){const p=cur();if(!p)return;nd.value=p.noi_dung;document.getElementById('nhan').textContent=(p.noi_dung!==p.ban_dau?'đã sửa · ':'')+(p.khac_code?'khác bản code':'');}
async function tai(giu){D=await fetch('prompt/du-lieu').then(r=>r.json());const chon=giu||k.value;
 k.innerHTML=D.prompt.map(p=>'<option value="'+p.key+'">'+p.key+(p.noi_dung!==p.ban_dau?' *':'')+'</option>').join('');if(chon)k.value=chon;ve();
 document.getElementById('ct').innerHTML=D.cau_hinh.map(c=>'<div><label>'+c.key+(c.gia_tri!==c.ban_dau?' *':'')+'</label><input data-k="'+c.key+'" value="'+c.gia_tri.replace(/"/g,'&quot;')+'"></div>').join('');}
async function luu(loai,key,noi_dung){const r=await fetch('prompt/luu',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({loai,key,noi_dung})});const j=await r.json();
 bao.textContent=j.loi?('Lỗi: '+j.loi):('Đã lưu · đang khác bản đầu: '+([...j.da_sua.prompt,...j.da_sua.cau_hinh].join(', ')||'không'));}
k.onchange=ve;
document.getElementById('luu').onclick=async()=>{await luu('prompt',k.value,nd.value);await tai(k.value);};
document.getElementById('goc').onclick=async()=>{const p=cur();if(!p||!confirm('Bỏ bản sửa của '+p.key+'?'))return;await luu('prompt',p.key,p.ban_dau);await tai(p.key);};
document.getElementById('luuCt').onclick=async()=>{for(const i of document.querySelectorAll('#ct input')){const c=D.cau_hinh.find(x=>x.key===i.dataset.k);if(c&&i.value.trim()!==c.gia_tri)await luu('cau_hinh',c.key,i.value);}await tai(k.value);};
tai();
</script></body></html>`;
}
