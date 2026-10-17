#!/usr/bin/env node
// up-masterdb.mjs — đẩy BẢN GỐC `masterDB/` lên bucket `masterdb-raw`.
//
// CHẠY TRÊN MÁY MÀY, không deploy. `masterDB/` nằm ngoài git (CLAUDE.md §5) và
// script này chỉ ĐỌC nó, không bao giờ ghi vào nó, không bao giờ copy vào repo.
//
// ══════════════ NÓ KHÁC `up-anh.mjs` Ở CHỖ NÀO ══════════════
//
//   up-anh.mjs      → nén ảnh (sharp ≤2500px q80) → bucket `listing-public`
//                     → CÔNG KHAI, phục vụ web, có dòng `listing_media` đi kèm
//   up-masterdb.mjs → KHÔNG nén gì cả  → bucket `masterdb-raw`
//                     → RIÊNG TƯ, không phục vụ ai, không ghi bảng nào
//
// Đây là TỦ HỒ SƠ, không phải CDN. Nén là làm hỏng mục đích: bản gốc phải còn
// nguyên byte để mai kia dựng lại được thứ khác từ nó. Ai định thêm `sharp` vào
// file này thì đọc lại câu trên.
//
// VÌ SAO CÓ: OPEN-47 — bucket `listing-public` (1005 file / 148 MB) không nằm
// trong bản sao lưu nào, và dựng lại được CHỈ VÌ `masterDB/` còn trên một ổ đĩa
// cá nhân. Đó là may, không phải quy trình. Đẩy bản gốc lên đây thì cái ổ đĩa
// kia thôi làm mắt xích duy nhất.
//
// ══════════════ CÁCH DÙNG ══════════════
//   Khoá đặt MỘT LẦN vào scripts/.env (đã gitignore):
//       SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
//   rồi:
//       node scripts/up-masterdb.mjs "D:\masterDB" --dry   ← xem trước, KHÔNG đẩy
//       node scripts/up-masterdb.mjs "D:\masterDB"         ← đẩy thật
//       node scripts/up-masterdb.mjs "D:\masterDB" --lai   ← đẩy lại cả file đã có
//   PHẢI có chữ `node` ở đầu. Gõ mỗi tên file thì Windows mở Notepad.
//
// CHẠY LẠI ĐƯỢC: mặc định BỎ QUA file đã có trên bucket đúng kích thước. 179 MB
// qua mạng nhà thì đứt giữa chừng là chuyện thường — chạy lại là nó đi tiếp chỗ
// dở, không đẩy lại từ đầu. `--lai` để ép ghi đè.
//
// KẾT THÚC PHẢI ĐỐI CHIẾU: đếm file dưới đĩa so với đếm file trên bucket, lệch
// một cái là thoát khác 0. Không có bước này thì "đẩy xong" chỉ là "vòng lặp
// chạy hết", mà một thư mục hụt trông y hệt một thư mục đủ.

import { readdirSync, statSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, relative, sep, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const GOC_REPO = resolve(HERE, "..");

// Nạp scripts/.env.
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
const BUCKET = process.env.MASTERDB_BUCKET ?? "masterdb-raw";
const TRAN_FILE = 50 * 1024 * 1024; // khớp file_size_limit của bucket (20260907b)

const argv = process.argv.slice(2);
const kho = argv.find((a) => !a.startsWith("--"));
const chi_xem = argv.includes("--dry");
const day_lai = argv.includes("--lai");

// Rác của Windows/OneDrive/macOS. Đẩy lên chỉ tốn chỗ và làm bẩn bản gốc.
const RAC = /^(\.DS_Store|Thumbs\.db|desktop\.ini|~\$.*|\.tmp.*)$/i;

const MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic",
  ".pdf": "application/pdf", ".csv": "text/csv", ".txt": "text/plain",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel", ".json": "application/json",
};

function chet(msg, soTay) {
  console.error(`\n✗ ${msg}`);
  if (soTay) ghiSoTay(soTay);
  process.exit(1);
}

// manifest ghi ra ĐĨA, cạnh masterDB, kể cả trên đường hỏng — "không thấy" và
// "cố ý bỏ" nhìn giống hệt nhau lúc đang chữa cháy.
let DUONG_SO_TAY = null;
function ghiSoTay(s) {
  if (!DUONG_SO_TAY) return;
  try {
    writeFileSync(DUONG_SO_TAY, JSON.stringify(s, null, 2), "utf8");
    console.error(`  sổ tay: ${DUONG_SO_TAY}`);
  } catch (e) {
    console.error(`  KHÔNG ghi được sổ tay: ${e.message}`);
  }
}

if (!kho) {
  console.error("Thiếu đường dẫn masterDB.\n" +
    '  node scripts/up-masterdb.mjs "D:\\masterDB" --dry');
  process.exit(1);
}
const GOC = resolve(kho);
if (!existsSync(GOC) || !statSync(GOC).isDirectory()) {
  chet(`Không thấy thư mục ${GOC}`);
}
// masterDB nằm ngoài git; nếu ai đó trỏ vào trong repo thì hoặc là nhầm, hoặc là
// masterDB đã bị copy vào repo — cả hai đều phải dừng (CLAUDE.md §5).
if (GOC === GOC_REPO || GOC.startsWith(GOC_REPO + sep)) {
  chet(`TỪ CHỐI: nguồn nằm TRONG repo (${GOC}).\n` +
    "  masterDB phải ở ngoài git — repo này đang PUBLIC (CLAUDE.md §5).");
}
if (!chi_xem && !KHOA) {
  chet("Thiếu SUPABASE_SERVICE_ROLE_KEY (đặt trong scripts/.env). Muốn xem trước thì thêm --dry.");
}

// ── Quét đĩa ────────────────────────────────────────────────────────────────

/** Duyệt đệ quy, trả về [{ duong (tương đối, dấu /), that (tuyệt đối), cd }] */
function quet(thuMuc) {
  const ra = [];
  for (const m of readdirSync(thuMuc, { withFileTypes: true })) {
    const p = join(thuMuc, m.name);
    if (m.isDirectory()) { ra.push(...quet(p)); continue; }
    if (!m.isFile()) continue;
    if (RAC.test(m.name)) continue;
    ra.push({
      duong: relative(GOC, p).split(sep).join("/"),
      that: p,
      cd: statSync(p).size,
    });
  }
  return ra;
}

const file = quet(GOC).sort((a, b) => a.duong.localeCompare(b.duong));
if (!file.length) chet(`Không thấy file nào trong ${GOC}`);

const tongCd = file.reduce((s, f) => s + f.cd, 0);
const qua = file.filter((f) => f.cd > TRAN_FILE);
const mb = (n) => (n / 1048576).toFixed(1) + " MB";

console.log(`masterDB → bucket ${BUCKET}${chi_xem ? "  (CHỈ XEM, không đẩy)" : ""}`);
console.log(`  nguồn:  ${GOC}`);
console.log(`  file:   ${file.length} · ${mb(tongCd)}`);
if (qua.length) {
  console.log(`  QUÁ TRẦN 50 MB: ${qua.length} file — sẽ KHÔNG đẩy, liệt kê ở sổ tay`);
  for (const f of qua.slice(0, 5)) console.log(`     ${f.duong}  ${mb(f.cd)}`);
}

DUONG_SO_TAY = join(GOC, "..", `masterdb-raw-so-tay-${new Date().toISOString().slice(0, 10)}.json`);

const soTay = {
  chay_luc: new Date().toISOString(),
  nguon: GOC, bucket: BUCKET, che_do: chi_xem ? "chi_xem" : (day_lai ? "day_lai" : "tiep_tuc"),
  tong_file_dia: file.length, tong_byte_dia: tongCd,
  trang_thai: "dang_chay",
  KHONG_PHAI_BAN_SAO_DU_LIEU:
    "Đây là bản gốc FILE của masterDB. Nó KHÔNG chứa bảng nào của Postgres — " +
    "dự án không còn sao lưu DB (bỏ 11/09/2026).",
  qua_tran: qua.map((f) => ({ duong: f.duong, byte: f.cd })),
  da_len: 0, bo_qua_da_co: 0, hong: [],
};

if (chi_xem) {
  soTay.trang_thai = "chi_xem";
  ghiSoTay(soTay);
  console.log("\n--dry: chưa đẩy gì. Bỏ --dry để đẩy thật.");
  process.exit(0);
}

// ── Storage REST ────────────────────────────────────────────────────────────

const dau = { Authorization: `Bearer ${KHOA}`, apikey: KHOA };

/** Liệt kê object dưới một tiền tố. Trả về Map(tên → byte). Có phân trang. */
async function lietKe(tienTo) {
  const ra = new Map();
  for (let offset = 0; ; offset += 100) {
    const r = await fetch(`${URL_DU_AN}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { ...dau, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: tienTo, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) throw new Error(`liệt kê "${tienTo}" → HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const ds = await r.json();
    if (!Array.isArray(ds) || !ds.length) break;
    for (const o of ds) {
      // Thư mục ảo không có metadata; chỉ đếm file thật.
      if (o?.metadata?.size != null) ra.set(o.name, o.metadata.size);
    }
    if (ds.length < 100) break;
  }
  return ra;
}

/** Danh sách thư mục cần hỏi bucket = tập thư mục cha của mọi file. */
const thuMuc = [...new Set(file.map((f) => f.duong.includes("/") ? f.duong.slice(0, f.duong.lastIndexOf("/")) : ""))];

let daCo = new Map(); // "duong tương đối" → byte
if (!day_lai) {
  process.stdout.write(`  hỏi bucket đã có gì (${thuMuc.length} thư mục)… `);
  try {
    for (const t of thuMuc) {
      const m = await lietKe(t);
      for (const [ten, cd] of m) daCo.set(t ? `${t}/${ten}` : ten, cd);
    }
  } catch (e) {
    soTay.trang_thai = "hong";
    soTay.ly_do = `không liệt kê được bucket: ${e.message}`;
    chet(`Không liệt kê được bucket ${BUCKET}: ${e.message}`, soTay);
  }
  console.log(`${daCo.size} file`);
}

// ── Đẩy ─────────────────────────────────────────────────────────────────────

let n = 0;
for (const f of file) {
  n++;
  if (f.cd > TRAN_FILE) continue; // đã ghi ở qua_tran

  if (!day_lai && daCo.get(f.duong) === f.cd) { soTay.bo_qua_da_co++; continue; }

  const mime = MIME[extname(f.duong).toLowerCase()] ?? "application/octet-stream";
  try {
    const r = await fetch(
      `${URL_DU_AN}/storage/v1/object/${BUCKET}/${f.duong.split("/").map(encodeURIComponent).join("/")}`,
      { method: "POST", headers: { ...dau, "Content-Type": mime, "x-upsert": "true" }, body: readFileSync(f.that) },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    soTay.da_len++;
  } catch (e) {
    soTay.hong.push({ duong: f.duong, loi: String(e.message ?? e) });
    console.error(`  ✗ ${f.duong}: ${e.message}`);
  }
  if (n % 50 === 0 || n === file.length) {
    process.stdout.write(`\r  ${n}/${file.length} · lên ${soTay.da_len} · bỏ qua ${soTay.bo_qua_da_co} · hỏng ${soTay.hong.length}   `);
  }
}
console.log();

// ── Đối chiếu: đếm dưới đĩa so với đếm trên bucket ──────────────────────────
//
// Đây là bước quyết định. Không có nó thì "đẩy xong" chỉ nghĩa là vòng lặp đã
// chạy hết — mà một thư mục hụt trông y hệt một thư mục đủ.

let tren = new Map();
try {
  for (const t of thuMuc) {
    const m = await lietKe(t);
    for (const [ten, cd] of m) tren.set(t ? `${t}/${ten}` : ten, cd);
  }
} catch (e) {
  soTay.trang_thai = "hong";
  soTay.ly_do = `không đối chiếu được: ${e.message}`;
  chet(`Đẩy xong nhưng KHÔNG đối chiếu được — coi như chưa xong: ${e.message}`, soTay);
}

const canCo = file.filter((f) => f.cd <= TRAN_FILE);
const thieu = canCo.filter((f) => tren.get(f.duong) !== f.cd);

soTay.tren_bucket = tren.size;
soTay.thieu = thieu.map((f) => ({ duong: f.duong, byte_dia: f.cd, byte_bucket: tren.get(f.duong) ?? null }));
soTay.trang_thai = (thieu.length || soTay.hong.length || qua.length) ? "thieu" : "day_du";
ghiSoTay(soTay);

console.log(`\nĐĩa ${canCo.length} file (trong trần) · bucket ${tren.size} · lên mới ${soTay.da_len} · bỏ qua ${soTay.bo_qua_da_co}`);

if (thieu.length) {
  console.error(`\n✗ THIẾU ${thieu.length} file trên bucket:`);
  for (const t of thieu.slice(0, 10)) console.error(`   ${t.duong}  đĩa ${t.byte_dia} · bucket ${t.byte_bucket ?? "không có"}`);
  process.exit(1);
}
if (soTay.hong.length) { console.error(`\n✗ ${soTay.hong.length} file lỗi khi đẩy.`); process.exit(1); }
if (qua.length) {
  console.error(`\n✗ ${qua.length} file QUÁ TRẦN 50 MB nên chưa lên. Nới file_size_limit của bucket rồi chạy lại.`);
  process.exit(1);
}

console.log(`\n✓ ĐỦ — ${canCo.length} file khớp cả tên lẫn kích thước giữa đĩa và bucket ${BUCKET}.`);
console.log("  Nhắc: đây là bản gốc FILE, không có bảng Postgres nào.");
