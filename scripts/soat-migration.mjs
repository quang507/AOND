#!/usr/bin/env node
// soat-migration.mjs — so migration ĐÃ ÁP trên DB với FILE trong repo.
//
// ====================== VÌ SAO PHẢI CÓ CÁI NÀY ======================
// CLAUDE.md §6 nói "Migration là nguồn sự thật của schema". Soát 05/09/2026
// cho thấy câu đó không đúng: DB đã áp 103 migration, repo có 59 file. 44
// migration đầu (21/08 → 27/08) áp thẳng qua MCP mà không ai lưu file lại —
// toàn bộ schema lõi (bảng, RLS, projects, conversations, reminders, CTV,
// drip) chỉ tồn tại trong project đang chạy.
//
// Không ai phát hiện suốt hai tuần vì KHÔNG CÓ GÌ ĐỐI CHIẾU HAI BÊN. Một câu
// khẳng định trong tài liệu không tự kiểm được chính nó. Đây là cái kiểm.
//
// ============================== CÁCH DÙNG ==============================
//     node scripts/soat-migration.mjs
// Cần SUPABASE_SERVICE_ROLE_KEY (đọc từ scripts/.env) vì bảng
// supabase_migrations nằm ngoài schema public, PostgREST không phơi ra —
// phải qua RPC `liet_ke_migration()` (migration 20260905c), chỉ service_role.
//
// Thoát 0 = khớp. Thoát 1 = có trôi. Chạy nó ở cổng 3 (trước deploy) và sau
// mỗi lần áp migration bằng MCP.

import { readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
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

// HAI ĐƯỜNG ĐỌC, cùng một câu trả lời:
//   · máy người làm  → service_role + `liet_ke_migration()` (đầy đủ)
//   · máy CI         → khoá CÔNG KHAI + `liet_ke_migration_cong_khai()` (chỉ
//     version + name, `20260910o`)
// Nhét service_role vào CI của một repo ĐANG PUBLIC là mở toang: khoá đó bỏ
// qua mọi RLS. Một cổng chống trôi schema không đáng đổi bằng cái đó, mà tên
// migration thì vốn đã nằm công khai trong chính thư mục này.
const KHOA_CONG_KHAI = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? process.env.SUPABASE_ANON_KEY
  ?? docKhoaCongKhaiTrongRepo();
// Khoá RỖNG cũng là không có khoá — `??` giữ nguyên chuỗi rỗng rồi đi tiếp
// bằng một khoá không dùng được, và lỗi hiện ra là 401 khó hiểu ở tận cuối.
const KHOA_SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim() || null;
const KHOA = KHOA_SERVICE ?? KHOA_CONG_KHAI;
const HAM = KHOA_SERVICE ? "liet_ke_migration" : "liet_ke_migration_cong_khai";
if (!KHOA) {
  console.error("Không có khoá nào để đọc danh sách migration (service_role hoặc khoá công khai).");
  process.exit(1);
}

/** Khoá công khai nằm sẵn trong `lib/supabase.ts` — đúng cái mọi bundle web đã phát hành. */
function docKhoaCongKhaiTrongRepo() {
  try {
    const t = readFileSync(join(HERE, "..", "lib", "supabase.ts"), "utf8");
    return /(?:sb_publishable_|eyJ)[A-Za-z0-9._-]{20,}/.exec(t)?.[0] ?? null;
  } catch {
    return null;
  }
}

const THU_MUC = join(HERE, "..", "bot", "supabase", "migrations");

const r = await fetch(`${URL_DU_AN}/rest/v1/rpc/${HAM}`, {
  method: "POST",
  headers: { apikey: KHOA, Authorization: `Bearer ${KHOA}`, "Content-Type": "application/json" },
  body: "{}",
});
if (!r.ok) {
  console.error(`rpc/${HAM}: HTTP ${r.status} ${await r.text()}`);
  process.exit(1);
}
const daAp = await r.json();

const file = (await readdir(THU_MUC)).filter((f) => f.endsWith(".sql"));
const tenFile = file.map((f) => f.replace(/\.sql$/, ""));

// Khớp lỏng: `name` trên DB đôi khi bị cắt tiền tố ngày (MCP tự đặt tên). Coi
// là khớp nếu tên file CHỨA tên migration hoặc ngược lại — thà bỏ sót một cảnh
// báo còn hơn kêu oan hàng chục dòng rồi không ai đọc nữa.
const khop = (name) =>
  tenFile.some((f) => f === name || f.endsWith(name) || f.includes(name.replace(/^\d+_/, "")));

// Hồ sơ ĐÃ ĐỐI CHIẾU: 11 file viết tay thời 21/08 → 01/09 được áp dưới TÊN
// KHÁC do MCP tự đặt, so theo tên không bắt cặp được, và nội dung gốc không còn
// để đối chiếu (OPEN-46). Ghi tên chúng vào một file CÓ NGƯỜI ĐỌC, thay vì để
// cổng kêu 11 dòng mãi mãi — cảnh báo kêu mãi thì thành tiếng ồn, rồi cái thứ
// 12 (trôi THẬT) chìm lẫn vào đó. Đúng chuyện xảy ra hôm nay.
const HO_SO = join(THU_MUC, "DA-DOI-CHIEU.json");
const hoSo = existsSync(HO_SO) ? JSON.parse(readFileSync(HO_SO, "utf8")) : { file_ap_duoi_ten_khac: [] };
const daDoiChieu = new Set(hoSo.file_ap_duoi_ten_khac ?? []);

const thieuFile = daAp.filter((m) => !khop(m.name));
const chuaApTho = tenFile.filter(
  (f) => !daAp.some((m) => f === m.name || f.endsWith(m.name) || f.includes(m.name.replace(/^\d+_/, ""))),
);
const chuaAp = chuaApTho.filter((f) => !daDoiChieu.has(f));
// Dòng trong hồ sơ mà file đã biến mất = hồ sơ cũ, phải dọn — không thì nó âm
// thầm tha thứ cho một file khác trùng tên sau này.
const hoSoThua = [...daDoiChieu].filter((f) => !tenFile.includes(f));

let loi = 0;
console.log(`DB đã áp ${daAp.length} migration · repo có ${file.length} file\n`);

if (thieuFile.length) {
  loi = 1;
  console.log(`✗ ${thieuFile.length} migration ĐÃ ÁP nhưng KHÔNG có file trong repo:`);
  for (const m of thieuFile) console.log(`    ${m.version}  ${m.name}`);
  console.log("  → Không dựng lại được từ repo. Lưới an toàn là bot/supabase/schema.sql");
  console.log("    (sinh từ RPC `xuat_schema()`, lệnh ở CLAUDE.md §6). Migration MỚI vẫn phải có file.\n");
} else {
  console.log("✓ Mọi migration đã áp đều có file trong repo\n");
}

if (chuaAp.length) {
  loi = 1;
  console.log(`✗ ${chuaAp.length} file trong repo CHƯA thấy áp trên DB:`);
  for (const f of chuaAp) console.log(`    ${f}`);
  console.log("  → Áp bằng `apply_migration` với đúng nội dung file, đừng sửa tay ở dashboard.\n");
} else {
  const ghi = daDoiChieu.size ? ` (${daDoiChieu.size} file cũ đã ghi trong DA-DOI-CHIEU.json)` : "";
  console.log(`✓ Mọi file trong repo đều đã áp trên DB${ghi}\n`);
}

if (hoSoThua.length) {
  loi = 1;
  console.log(`✗ ${hoSoThua.length} dòng trong DA-DOI-CHIEU.json trỏ tới file KHÔNG CÒN:`);
  for (const f of hoSoThua) console.log(`    ${f}`);
  console.log("  → Xoá dòng đó khỏi hồ sơ. Hồ sơ cũ là chỗ tha thứ nhầm cho file khác.\n");
}

// Ảnh chụp schema phải khớp DB TỪNG THÂN HÀM, không thì DB dựng lại từ số không
// (Supabase Free, không có sao lưu) mang lại luật đã sửa.
//
// Bản trước (tới 13/09/2026) so MTIME: schema.sql mới hơn migration mới nhất là
// xanh. Review code 13/09 chỉ ra hai lỗ: sau `git clone` — đúng việc CI làm — mọi
// file cùng mtime nên nhánh đỏ không bao giờ chạy; và lúc đó schema.sql đang mang
// `parse_vnd` bản TRƯỚC vá 42 ca. Nay so NỘI DUNG: md5 thân từng hàm trên DB
// (`ham_md5_cong_khai()`, 20260913c — chỉ tên + md5, mở cho anon) với thân hàm
// trong schema.sql. So với DB chứ không so với file migration: soát 13/09 thấy 34
// hàm có thân trong DB KHÁC file migration cuối cùng định nghĩa chúng (bản áp qua
// MCP không giống file — OPEN-46); DB là bản thật.
const SCHEMA = join(HERE, "..", "bot", "supabase", "schema.sql");
if (!existsSync(SCHEMA)) {
  loi = 1;
  console.log("✗ Chưa có bot/supabase/schema.sql — repo một mình KHÔNG dựng lại được DB.");
  console.log("  → sinh bằng RPC `xuat_schema()` (lệnh ở CLAUDE.md §6) rồi commit file đó.\n");
} else {
  const sql = readFileSync(SCHEMA, "utf8").replace(/\r/g, "");
  // Thân hàm = đúng chuỗi giữa hai dấu `$tag$` mà pg_get_functiondef in ra (= prosrc).
  const trongFile = new Map();
  const re = /CREATE OR REPLACE FUNCTION public\.([a-z_][a-z0-9_]*)\(/g;
  let m;
  while ((m = re.exec(sql))) {
    const mo = /\bAS (\$[a-z_]*\$)/.exec(sql.slice(m.index));
    if (!mo) continue;
    const dau = m.index + mo.index + mo[0].length;
    const cuoi = sql.indexOf(mo[1], dau);
    if (cuoi < 0) continue;
    const md5 = createHash("md5").update(sql.slice(dau, cuoi), "utf8").digest("hex");
    trongFile.set(m[1], [...(trongFile.get(m[1]) ?? []), md5].sort());
    re.lastIndex = cuoi;
  }
  const rh = await fetch(`${URL_DU_AN}/rest/v1/rpc/ham_md5_cong_khai`, {
    method: "POST",
    headers: { apikey: KHOA_CONG_KHAI ?? KHOA, Authorization: `Bearer ${KHOA_CONG_KHAI ?? KHOA}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!rh.ok) {
    loi = 1;
    console.log(`✗ rpc/ham_md5_cong_khai: HTTP ${rh.status} — CHƯA kiểm được schema.sql ↔ DB (không phải "đạt").\n`);
  } else {
    const trongDb = new Map();
    for (const { ten, md5 } of await rh.json()) trongDb.set(ten, [...(trongDb.get(ten) ?? []), md5].sort());
    const lech = [], thieuFile = [], thuaFile = [];
    for (const [ten, ds] of trongDb) {
      if (!trongFile.has(ten)) thieuFile.push(ten);
      else if (trongFile.get(ten).join() !== ds.join()) lech.push(ten);
    }
    for (const ten of trongFile.keys()) if (!trongDb.has(ten)) thuaFile.push(ten);
    if (lech.length || thieuFile.length || thuaFile.length) {
      loi = 1;
      if (lech.length) console.log(`✗ ${lech.length} hàm trong schema.sql KHÁC thân trên DB: ${lech.join(", ")}`);
      if (thieuFile.length) console.log(`✗ ${thieuFile.length} hàm có trên DB mà schema.sql KHÔNG có: ${thieuFile.join(", ")}`);
      if (thuaFile.length) console.log(`✗ ${thuaFile.length} hàm trong schema.sql mà DB KHÔNG còn: ${thuaFile.join(", ")}`);
      console.log("  → sinh lại bằng RPC `xuat_schema()` (lệnh ở CLAUDE.md §6) rồi commit.\n");
    } else {
      console.log(`✓ schema.sql khớp DB từng thân hàm (${trongDb.size} hàm)\n`);
    }
  }
}

// `process.exitCode` chứ KHÔNG `process.exit()`: trên Windows, cắt tiến trình
// khi còn socket của lượt gọi RPC làm libuv nổ assertion, mã thoát ra 127 thay
// vì 0/1 — cổng đọc mã thoát sẽ thấy HỎNG trong khi mọi phép so đều khớp.
process.exitCode = loi;
