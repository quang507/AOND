#!/usr/bin/env node
// Cổng chat-reply khi KHÔNG CÓ BRIDGE_SECRET — ca fail-closed (SEC-02).
//
// ═════════════════ VÌ SAO PHẢI LÀ FILE RIÊNG ═════════════════
// `run.mjs` nạp bundle MỘT lần rồi chạy 117 ca trên cùng một isolate, mà
// `napCauHinh()` nhớ tạm cấu hình 60 giây ở TẦNG MODULE. Lượt gọi đầu tiên đã
// nạp `BRIDGE_SECRET` vào bộ nhớ đó, nên trong `run.mjs` không có cách nào dựng
// lại cảnh "gate = null" nữa: xoá biến môi trường cũng vô ích vì hàm không đọc
// lại. Muốn đo đúng cảnh đó thì phải có một tiến trình sạch — chính là file này.
//
// Ca này quan trọng vì nó KHÁC HẲN ca "gửi header rỗng" đã có trong run.mjs:
//   · header rỗng + secret TỒN TẠI  → 403 forbidden   (người gọi sai)
//   · secret KHÔNG tồn tại / đọc hụt → 503 gate_unavailable (hệ thống chưa sẵn sàng)
// Bản trước SEC-02, cảnh thứ hai là CHO QUA. Không có ca này thì không gì ngăn
// ai đó vô tình đưa `if (gate && …)` quay lại.
//
// Đồng thời khẳng định nửa còn lại của lời hứa: service-role VẪN phải qua kể cả
// khi không có cổng — nếu không, vá bảo mật sẽ giết luôn đường zalo-webhook.
//
//     node bot/tests/e2e/cong-thieu-bi-mat.mjs   (chạy sau khi chay.sh dựng bundle)

import { FakeDB } from "./mock-supabase.mjs";
import { OUT } from "./mock-anthropic.mjs";

globalThis.__calls = [];
globalThis.__db = new FakeDB();
globalThis.__rpc = {};
globalThis.__model = { parse: () => OUT() };

// CỐ Ý không khai BRIDGE_SECRET. `secretOf` đọc env trước rồi mới hỏi Vault;
// mock `get_secret` trả về `{data: null}`, nên `gate` sẽ là null — đúng cảnh
// "chưa đặt secret HOẶC đọc hụt Vault" mà bản cũ coi là mở cổng.
const ENV = {
  SUPABASE_URL: "http://x",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  ANTHROPIC_API_KEY: "test-key",
};
globalThis.Deno = { serve: (h) => { globalThis.__handler = h; }, env: { get: (k) => ENV[k] } };

await import("./chat-reply.bundle.mjs");
const H = globalThis.__handler;

async function goi(body, hdrs = {}) {
  const tho = JSON.stringify(body);
  const h = { "content-length": String(tho.length), ...hdrs };
  const res = await H({
    method: "POST",
    headers: { get: (k) => h[k.toLowerCase()] ?? null },
    text: async () => tho,
    json: async () => body,
  });
  return { status: res.status, body: await res.json() };
}

const R = [];
const check = (n, ok, d = "") => R.push([n, !!ok, d]);

// (1) Không có bí mật cổng, người gọi thường → PHẢI 503, KHÔNG phải 200.
{
  const r = await goi({ external_user_id: "la-1", text: "chào em" });
  check("THIẾU BÍ MẬT + người gọi thường → 503 gate_unavailable (KHÔNG fail-open)",
    r.status === 503 && r.body.error === "gate_unavailable", JSON.stringify(r));
}

// (2) Có gửi header bí mật (bịa) cũng vẫn 503 — không có gì để so thì không cho qua.
{
  const r = await goi({ external_user_id: "la-2", text: "chào em" }, { "x-bridge-secret": "doan-bua" });
  check("THIẾU BÍ MẬT + header bịa → vẫn 503, không đoán mò được",
    r.status === 503, JSON.stringify(r));
}

// (3) service-role VẪN phải qua — đây là đường zalo-webhook, không được gãy.
{
  const r = await goi({ external_user_id: "zalo-1", text: "tìm nhà quận 5 tầm 5 tỷ", channel: "zalo_oa" },
    { authorization: "Bearer svc" });
  check("THIẾU BÍ MẬT + service-role → VẪN QUA (đường zalo-webhook còn sống)",
    r.status === 200 && !r.body.error, JSON.stringify(r).slice(0, 200));
}

// (4) Sự cố phải để lại dấu vết trong sổ, không im lặng.
{
  const co = globalThis.__db.t.bot_errors.some((e) => String(e.source).includes("chat-reply CONG DONG"));
  check("THIẾU BÍ MẬT → có ghi 'chat-reply CONG DONG' vào bot_errors",
    co, JSON.stringify(globalThis.__db.t.bot_errors.map((e) => e.source)));
}

// (5) 23/09/2026 (bắn 6 tin song song): Vault HỤT hai lần liền → 503, sổ ghi rõ lỗi đọc (không gộp với "chưa đặt").
globalThis.__vault = (ten) => ten === "BRIDGE_SECRET" ? { data: null, error: { message: "timeout giả" } } : { data: null, error: null };
{
  const r = await goi({ external_user_id: "la-5", text: "chào em" }, { "x-bridge-secret": "s3" });
  const loi = globalThis.__db.t.bot_errors.filter((e) => String(e.source).includes("chat-reply CONG DONG")).at(-1);
  check("VAULT HỤT HAI LẦN → 503, sổ ghi 'hụt hai lần (timeout giả)'",
    r.status === 503 && /hụt hai lần \(timeout giả\)/.test(String(loi?.detail ?? "")), JSON.stringify({ r, loi }));
}
// (6) Lượt NGAY SAU: Vault hụt một lần rồi đọc được → QUA ngay. Bản cũ nhớ `gate = null` 60 s
// nên mọi tin trong phút đó đều 503 — tin khách thật mất theo.
{
  let n = 0;
  globalThis.__vault = (ten) => ten === "BRIDGE_SECRET"
    ? (n++ === 0 ? { data: null, error: { message: "chớp mắt" } } : { data: "s3", error: null })
    : { data: null, error: null };
  const r = await goi({ external_user_id: "la-6", text: "chào em" }, { "x-bridge-secret": "s3" });
  check("VAULT HỤT MỘT LẦN → đọc lại ngay, header đúng thì QUA (không nhớ cái hụt 60 s)",
    r.status === 200 && !r.body.error && n === 2, JSON.stringify({ status: r.status, n, body: JSON.stringify(r.body).slice(0, 200) }));
}

let hong = 0;
for (const [n, ok, d] of R) {
  if (!ok) hong++;
  console.log(`${ok ? "✓" : "✗"} ${n}${ok ? "" : "\n     → " + String(d).slice(0, 400)}`);
}
console.log(hong ? `\n${hong}/${R.length} CA HỎNG` : `\nTẤT CẢ ${R.length} CA CỔNG-THIẾU-BÍ-MẬT ĐẠT`);
process.exit(hong ? 1 : 0);
