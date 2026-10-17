#!/usr/bin/env node
// Tự kiểm bộ TS-SEC: chứng minh `ts-sec-anon.mjs` KHÔNG thể báo xanh giả.
//
// ====================== VÌ SAO PHẢI CÓ CÁI NÀY ======================
// Bản đầu của `ts-sec-anon.mjs` coi "HTTP ≥ 400 = bị chặn = đạt". Chạy trong
// sandbox nó báo 24/24 ĐẠT trong khi không một request nào tới được Supabase
// (proxy trả 403 chữ trần). Một bộ kiểm bảo mật báo xanh khi mất mạng thì tệ
// hơn là không có bộ nào: nó tạo ra lòng tin sai.
//
// Bản vá phân biệt "PostgREST từ chối" (JSON có `message`) với "không tới
// được" (mọi thứ khác). Nhưng lời vá đó cũng chỉ là lời — file này bắt nó
// chứng minh, bằng một PostgREST GIẢ dựng tại chỗ. Không cần mạng, nên chạy
// được ở mọi nơi kể cả sandbox không có đường ra Internet.
//
// Bốn cảnh, mỗi cảnh một mã thoát bắt buộc:
//   1. DB khoẻ, RLS đúng          → 0
//   2. RLS thủng (bảng nội bộ ra dòng) → 1
//   3. Proxy chặn (403 chữ trần)  → 2  ← cảnh đã lừa được bản đầu
//   4. Siết quá tay (agents_public rỗng) → 1  ← lỗi /moi-gioi trắng 8 ngày
//
//     node bot/tests/ts-sec-anon.tu-kiem.mjs

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const BO_TEST = join(HERE, "ts-sec-anon.mjs");

const NOI_BO = [
  "reminders", "sellers", "ctvs", "messages", "conversations", "viewings",
  "deals", "buyers", "info_requests", "bot_errors", "inbound_ledger",
  "curated_lists", "ratings_log", "property_events", "public_listings",
];
const RPC_KHOA = ["get_secret", "seller_drip_tick", "ctv_report_tick",
                  "xuat_schema", "liet_ke_migration", // liet_ke_bang: xoá ở 20260911h cùng sao lưu
                  // FR-192: mock phải khoá y như DB thật, không thì bộ e2e đo sai
                  // đúng chỗ đó (bài học `phu` 07/09 ở CLAUDE.md).
                  "quota_tieu_hao"];

// Hình lỗi thật của PostgREST khi RLS/GRANT chặn.
const TU_CHOI = { code: "42501", details: null, hint: null, message: "permission denied" };

function dungServer(canh) {
  return new Promise((res) => {
    const sv = createServer((req, r) => {
      const u = new URL(req.url, "http://x");
      const bang = u.pathname.replace(/^\/rest\/v1\//, "");
      const json = (ma, than) => {
        r.writeHead(ma, { "Content-Type": "application/json" });
        r.end(JSON.stringify(than));
      };
      const chuTran = (ma, t) => { r.writeHead(ma, { "Content-Type": "text/plain" }); r.end(t); };

      // Cảnh 3: mọi thứ bị chặn bởi một tầng KHÔNG PHẢI PostgREST.
      if (canh === "proxy") return chuTran(403, "Host not in allowlist: x.supabase.co");

      if (bang.startsWith("rpc/")) {
        const ten = bang.slice(4);
        // 15/09: số NMG — cảnh "khong-nmg" trả 0 (view rỗng là đúng), cảnh siết quá tay trả 3
        // (có NMG mà view rỗng → phải hỏng).
        if (ten === "so_nmg_cong_khai") return json(200, canh === "khong-nmg" ? 0 : 3);
        return RPC_KHOA.includes(ten) ? json(403, TU_CHOI) : json(200, {});
      }
      if (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE") {
        return json(403, TU_CHOI);
      }
      if (bang === "listings") {
        if (u.searchParams.get("status") === "eq.cho_thong_tin") return json(200, []);
        return json(200, [{ code: "BDS-Q5-0001" }]);
      }
      if (bang === "agents_public") {
        // Cảnh 4: view trả rỗng — đúng kiểu hỏng của 27/08.
        return json(200, canh === "siet-qua-tay" || canh === "khong-nmg" ? [] : [{ id: 1 }, { id: 2 }, { id: 3 }]);
      }
      if (["projects", "listing_facts", "listing_photos_v"].includes(bang)) return json(200, []);
      if (NOI_BO.includes(bang)) {
        // Cảnh 2: bảng nội bộ ra dòng thật.
        return canh === "rls-thung" ? json(200, [{ id: 1, phone: "0903xxxxxx" }]) : json(403, TU_CHOI);
      }
      return json(200, []);
    });
    sv.listen(0, "127.0.0.1", () => res(sv));
  });
}

async function chay(canh) {
  const sv = await dungServer(canh);
  const cong = sv.address().port;
  const ma = await new Promise((res) => {
    const p = spawn(process.execPath, [BO_TEST], {
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${cong}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    p.stdout.resume(); p.stderr.resume();
    p.on("close", (c) => res(c));
  });
  sv.close();
  return ma;
}

const CANH = [
  ["khoe",         0, "DB khoẻ, RLS đúng → phải ĐẠT"],
  ["rls-thung",    1, "bảng nội bộ ra dòng → phải HỎNG"],
  ["proxy",        2, "403 chữ trần từ proxy → phải báo KHÔNG TỚI ĐƯỢC, không phải đạt"],
  ["siet-qua-tay", 1, "agents_public rỗng mà DB có 3 NMG → phải HỎNG (lỗi /moi-gioi)"],
  ["khong-nmg",    0, "agents_public rỗng và DB có 0 NMG (sau xoá hàng loạt) → phải ĐẠT"],
];

let hong = 0;
for (const [canh, mong, mo_ta] of CANH) {
  const that = await chay(canh);
  if (that === mong) console.log(`✓ ${mo_ta}  (thoát ${that})`);
  else { hong++; console.log(`✗ ${mo_ta}\n    mong thoát ${mong}, thật ${that}`); }
}

console.log(`\n${CANH.length - hong}/${CANH.length} cảnh đúng`);
if (hong) {
  console.log("TỰ KIỂM HỎNG — bộ TS-SEC có thể báo sai, đừng tin nó.");
  process.exit(1);
}
console.log("TỰ KIỂM ĐẠT — bộ TS-SEC phân biệt được 'DB từ chối' với 'không tới được'.");
