#!/usr/bin/env node
// xuat-mau-cau.mjs — FR-180: xuất MẪU CÂU CHUẨN (bảng `mau_cau`) ra JSONL để
// fine-tune (chủ dự án 09/09/2026: "đủ 300 mẫu thì thử Qwen2.5 bằng Unsloth
// trên 4060, ưng thì Gemini Flash tuning hoặc VPS GPU").
//
// Chạy:  node scripts/xuat-mau-cau.mjs [thư-mục-đích]
// Cần SUPABASE_SERVICE_ROLE_KEY trong scripts/.env — bảng
// mau_cau chỉ admin/service_role đọc được.
// Đích mặc định: train/out/mau-cau/ (đã gitignore — ngữ cảnh là chat THẬT,
// có tên khách, có thể có SĐT; KHÔNG commit). Trước 11/09/2026 là
// nhadat-backup/mau-cau/ — thư mục đó bỏ cùng sao lưu.
//
// Ra hai file:
//   mau-cau.sharegpt.jsonl — {"conversations":[{from:system|human|gpt, value}]}
//                            đúng khuôn Unsloth/ShareGPT; system = TONE_RULES
//                            đang chạy (bot_prompts) để model học cùng luật.
//   mau-cau.gemini.jsonl   — {"systemInstruction":{…},"contents":[{role:user|model,parts:[{text}]}]}
//                            khuôn Gemini supervised tuning (Vertex/AI Studio).
// Và in số mẫu theo phía; dưới 300 thì nói rõ "chưa đủ" (không phải lỗi).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(HERE, ".env");
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const val = m[2].trim().replace(/^(['"])(.*)\1$/, "$2").replace(/^<(.*)>$/, "$1");
    if (val && !(m[1] in process.env)) process.env[m[1]] = val;
  }
}
const URL_DU_AN = process.env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KHOA = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KHOA) { console.error("Thiếu SUPABASE_SERVICE_ROLE_KEY (scripts/.env)."); process.exit(1); }
const MUC_TIEU = 300;
const DICH = resolve(process.argv[2] ?? join(HERE, "..", "train", "out", "mau-cau"));

const H = { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" };
async function keo(duong) {
  const r = await fetch(`${URL_DU_AN}/rest/v1/${duong}`, { headers: { ...H, "Range-Unit": "items", Range: "0-9999" } });
  if (!r.ok) throw new Error(`${duong}: HTTP ${r.status} ${await r.text()}`);
  return await r.json();
}

const mau = await keo("mau_cau?select=*&dung_lam=in.(fine_tune,ca_hai)&order=updated_at.desc");
const [tone] = await keo("bot_prompts?select=content&key=eq.tone_rules");
// FR-181: tone viết "{ten}" — khi xuất mẫu huấn luyện dùng một tên cố định để
// mô hình học GIỌNG, không học tên (tên gán lúc chạy theo từng khách).
const SYS = (tone?.content ?? "Bạn là {ten}, trợ lý của AI Ơi Nhà Đất.").trim().replace(/\{ten\}/g, "T•ai");

const luot = (m) => {
  // human/gpt xen kẽ từ ngữ cảnh; kết bằng gpt = câu chuẩn.
  const conv = [];
  for (const x of m.ngu_canh ?? []) {
    const from = x.ai === "bot" ? "gpt" : "human";
    const last = conv[conv.length - 1];
    if (last && last.from === from) last.value += "\n" + x.noi_dung; else conv.push({ from, value: x.noi_dung });
  }
  if (!conv.length || conv[conv.length - 1].from === "gpt") conv.push({ from: "human", value: "(khách im)" });
  conv.push({ from: "gpt", value: m.cau_chuan });
  return conv;
};

mkdirSync(DICH, { recursive: true });
const sharegpt = mau.map((m) => JSON.stringify({
  id: m.id, phia: m.phia,
  conversations: [{ from: "system", value: SYS }, ...luot(m)],
}));
const gemini = mau.map((m) => JSON.stringify({
  systemInstruction: { role: "system", parts: [{ text: SYS }] },
  contents: luot(m).map((t) => ({ role: t.from === "gpt" ? "model" : "user", parts: [{ text: t.value }] })),
}));
writeFileSync(join(DICH, "mau-cau.sharegpt.jsonl"), sharegpt.join("\n") + "\n");
writeFileSync(join(DICH, "mau-cau.gemini.jsonl"), gemini.join("\n") + "\n");

const ban = mau.filter((m) => m.phia === "ban").length;
const mua = mau.length - ban;
console.log(`${mau.length} mẫu (bán ${ban} · mua ${mua}) → ${DICH}`);
console.log(mau.length >= MUC_TIEU
  ? `Đủ ${MUC_TIEU}. Bước kế: train/README.md (Unsloth trên 4060).`
  : `Chưa đủ ${MUC_TIEU} (còn ${MUC_TIEU - mau.length}). Sửa tiếp ở /admin/mau-cau.`);
