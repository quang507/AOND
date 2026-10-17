#!/usr/bin/env node
// Ranh giới BÓC TÁCH ⟂ AI — kiểm tĩnh, không mạng, không DB.
//
// Vì sao cần: hôm nay ranh giới này ĐÚNG nhưng chỉ đúng do may. `boc_thong_so()`
// nằm trong SQL nên không thể gọi model được, còn `regexProfileFallback()` thì
// nằm NGAY TRONG chat-reply/index.ts, cách chỗ gọi model hơn hai nghìn dòng.
// Không có gì ngăn lượt sửa sau nối hai thứ lại, và khi đã nối thì mỗi tin
// khách là một lượt đốt tiền model kể cả câu regex bóc được.
//
// Hai luật, ngược chiều nhau:
//
//   BÓC TÁCH  không được chạm model, không được chạm DB.
//             → nó phải chạy được, và kiểm được, mà không tốn một đồng nào.
//
//   AI        không được ghi bảng NGHIỆP VỤ.
//             → model đề nghị, chỗ khác quyết định ghi. Ngoại lệ đã khai tên:
//               get_secret (đọc khoá), log_loi (sổ lỗi — FR-152 bắt buộc),
//               cong_token (đếm tiền). Ba cái đó KHÔNG phải dữ liệu nghiệp vụ.
//
// Bài này tự chứng minh nó bắt được: mỗi luật kèm ca ÂM (một file giả vi phạm)
// và ca DƯƠNG (một file giả hợp lệ). Luật hỏng thì ca âm lọt, và ca âm lọt thì
// bài thoát khác 0. Không có ca âm thì "0 vi phạm" chỉ có nghĩa là regex sai.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HAM = join(GOC, "bot", "supabase", "functions");

// ── Luật ─────────────────────────────────────────────────────────────────────

const LUAT_BOC_TACH = {
  ten: "BÓC TÁCH không chạm model, không chạm DB",
  // Thêm file vào đây khi rút thêm mã bóc tách ra khỏi chat-reply. Thư mục
  // _shared/extraction/ (nếu dựng sau này) tự động thuộc luật này.
  thuoc: (p) =>
    p === "_shared/thong_so.ts" ||
    p === "_shared/dia_ban.ts" ||
    p.startsWith("_shared/extraction/"),
  cam: [
    [/@anthropic-ai\/sdk/, "import SDK Anthropic"],
    [/from\s+["'][^"']*\/claude\.ts["']/, "import _shared/claude.ts"],
    [/\bnew\s+Anthropic\b/, "dựng client Anthropic"],
    [/\.rpc\s*\(/, "gọi RPC — bóc tách phải là hàm thuần"],
    [/\bcreateClient\s*\(/, "dựng client Supabase"],
  ],
};

// Ba RPC được phép ở tầng AI, khai tên tường minh. Muốn thêm thì phải sửa file
// này — tức là phải có người đọc lại câu hỏi "cái này có phải dữ liệu nghiệp vụ
// không?" chứ không lặng lẽ trôi vào.
// `beat` thêm 10/09/2026 cùng FR-192 b: đóng dấu `bot_health(model_chinh)` khi
// lượt gọi model chính trả về, để băng "hết số dư" ở /admin biết model đã sống
// lại thay vì đỏ suốt 24 giờ theo mấy dòng lỗi cũ. Đây là NHỊP TIM vận hành,
// một dòng một khoá, không phải dữ liệu nghiệp vụ — cùng loại với `log_loi`.
const RPC_DUOC_PHEP = ["get_secret", "log_loi", "cong_token", "beat"];

const LUAT_AI = {
  ten: "AI không ghi bảng nghiệp vụ",
  thuoc: (p) => p === "_shared/claude.ts" || p.startsWith("_shared/ai/"),
  cam: [
    [/\.from\s*\(/, "truy vấn bảng trực tiếp — đi qua tầng db"],
    [/\.(insert|update|upsert|delete)\s*\(/, "ghi bảng trực tiếp"],
  ],
  // Kiểm thêm: mọi .rpc("x") phải nằm trong RPC_DUOC_PHEP.
  rpcTrongDanhSach: true,
};

const LUAT = [LUAT_BOC_TACH, LUAT_AI];

/** Soát MỘT file. Thuần: nhận chữ, trả danh sách vi phạm — nhờ vậy ca giả ở
 *  dưới chạy qua đúng đường mà file thật chạy qua. */
export function soat(duongDan, noiDung, luat) {
  if (!luat.thuoc(duongDan)) return [];
  const dong = noiDung.split("\n");
  const viPham = [];
  for (let i = 0; i < dong.length; i++) {
    const d = dong[i];
    if (/^\s*(\/\/|\*|\/\*)/.test(d)) continue; // chú thích không phải mã
    for (const [re, vi] of luat.cam) {
      if (re.test(d)) viPham.push({ duongDan, dong: i + 1, vi, ma: d.trim() });
    }
    if (luat.rpcTrongDanhSach) {
      const m = d.match(/\.rpc\s*\(\s*["'`]([a-z_]+)["'`]/i);
      if (m && !RPC_DUOC_PHEP.includes(m[1])) {
        viPham.push({
          duongDan, dong: i + 1,
          vi: `RPC "${m[1]}" chưa khai trong RPC_DUOC_PHEP`,
          ma: d.trim(),
        });
      }
    }
  }
  return viPham;
}

// ── Ca giả: chứng minh luật bắt được ─────────────────────────────────────────

const CA = [
  { ten: "bóc tách import SDK", luat: LUAT_BOC_TACH, p: "_shared/extraction/gia.ts",
    ma: `import Anthropic from "npm:@anthropic-ai/sdk";`, phaiBat: true },
  { ten: "bóc tách import claude.ts", luat: LUAT_BOC_TACH, p: "_shared/thong_so.ts",
    ma: `import { goiModel } from "./claude.ts";`, phaiBat: true },
  { ten: "bóc tách gọi RPC", luat: LUAT_BOC_TACH, p: "_shared/dia_ban.ts",
    ma: `const { data } = await db.rpc("boc_thong_so", { p: s });`, phaiBat: true },
  { ten: "bóc tách hàm thuần — hợp lệ", luat: LUAT_BOC_TACH, p: "_shared/thong_so.ts",
    ma: `export function thongSoNgan(l) { return l.frontage_m + "x" + l.length_m; }`, phaiBat: false },
  { ten: "bóc tách nhắc anthropic TRONG chú thích — hợp lệ", luat: LUAT_BOC_TACH,
    p: "_shared/thong_so.ts",
    ma: `// KHÔNG được import @anthropic-ai/sdk ở đây, xem bot/tests/ranh-gioi.mjs`,
    phaiBat: false },
  { ten: "AI ghi bảng", luat: LUAT_AI, p: "_shared/claude.ts",
    ma: `await db.from("listings").insert({ code });`, phaiBat: true },
  { ten: "AI gọi RPC lạ", luat: LUAT_AI, p: "_shared/ai/output.ts",
    ma: `await db.rpc("tao_tin_rao", { p_code: code });`, phaiBat: true },
  { ten: "AI gọi log_loi — hợp lệ", luat: LUAT_AI, p: "_shared/claude.ts",
    ma: `await db.rpc("log_loi", { p_source: source, p_detail: text });`, phaiBat: false },
  { ten: "file ngoài phạm vi luật", luat: LUAT_AI, p: "chat-reply/index.ts",
    ma: `await db.from("listings").insert({ code });`, phaiBat: false },
];

// ── Chạy ─────────────────────────────────────────────────────────────────────

function moiFileTs(thuMuc) {
  const ra = [];
  for (const ten of readdirSync(thuMuc)) {
    const p = join(thuMuc, ten);
    if (statSync(p).isDirectory()) ra.push(...moiFileTs(p));
    else if (ten.endsWith(".ts")) ra.push(p);
  }
  return ra;
}

let hong = 0;

console.log("TỰ KIỂM ranh-gioi.mjs — ca giả trước, file thật sau\n");
for (const c of CA) {
  const bat = soat(c.p, c.ma, c.luat).length > 0;
  const dat = bat === c.phaiBat;
  if (!dat) hong++;
  console.log(`  ${dat ? "ĐẠT " : "HỎNG"}  ${c.phaiBat ? "phải bắt " : "phải bỏ qua"}  ${c.ten}`);
}
if (hong) {
  console.error(`\n${hong} ca tự kiểm HỎNG — luật không còn bắt được cái nó phải bắt.`);
  process.exit(1);
}

console.log("\nSOÁT FILE THẬT\n");
const file = moiFileTs(HAM);
let viPhamThat = 0;
let soFileThuocLuat = 0;
for (const luat of LUAT) {
  const thuoc = file.filter((p) => luat.thuoc(relative(HAM, p).split("\\").join("/")));
  soFileThuocLuat += thuoc.length;
  console.log(`  ${luat.ten} — ${thuoc.length} file`);
  for (const p of thuoc) {
    const rel = relative(HAM, p).split("\\").join("/");
    for (const v of soat(rel, readFileSync(p, "utf8"), luat)) {
      viPhamThat++;
      console.error(`    VI PHẠM ${v.duongDan}:${v.dong} — ${v.vi}\n      ${v.ma}`);
    }
  }
}

// Luật không phủ file nào là luật chết: đổi tên thư mục một cái là bộ này báo
// xanh vĩnh viễn mà chẳng soát gì. Đúng cái bẫy "trông như đủ" của sao lưu.
if (soFileThuocLuat === 0) {
  console.error("\nKHÔNG file nào rơi vào luật nào — đường dẫn đã trôi, bộ soát đang soát rỗng.");
  process.exit(1);
}

if (viPhamThat) {
  console.error(`\n${viPhamThat} vi phạm ranh giới. Xem CLAUDE.md §6 và docs/07-srs.md.`);
  process.exit(1);
}
console.log(`\nĐẠT — ${CA.length} ca tự kiểm, ${soFileThuocLuat} file thật, 0 vi phạm.`);
