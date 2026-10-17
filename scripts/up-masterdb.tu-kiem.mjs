#!/usr/bin/env node
// Tự kiểm up-masterdb.mjs — dựng Supabase Storage GIẢ, không chạm bucket thật,
// không cần khoá. Chạy offline, nên vào được `bun run kiem` và CI.
//
// Vì sao cần: đẩy 179 MB lên kho là loại việc chỉ được kiểm đúng một lần trong
// đời — hôm mất dữ liệu. Bài này bơm sáu cách hỏng đã biết vào rồi soi mã thoát
// và sổ tay. Cái phải chứng minh KHÔNG phải "đẩy được", mà là "biết khi nào
// mình đẩy hụt".

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const HERE = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "up-masterdb.mjs");
const GOC_REPO = resolve(HERE, "..");

let dat = 0, hong = 0;
const ok = (t, d, ghi = "") => { d ? dat++ : hong++; console.log(`  ${d ? "✓" : "✗"} ${t}${ghi ? " — " + ghi : ""}`); };

// ── Storage giả ─────────────────────────────────────────────────────────────
// Chép NGHĨA của hai đầu API mà script dùng: POST /object/list/<bucket> và
// POST /object/<bucket>/<path>. Kho nằm trong bộ nhớ.

function moKho({ tuChoiList = false, tuChoiUp = null, nuotIm = null } = {}) {
  const kho = new Map(); // "duong" → byte
  const sv = createServer((req, res) => {
    let than = [];
    req.on("data", (c) => than.push(c));
    req.on("end", () => {
      const body = Buffer.concat(than);
      const u = new URL(req.url, "http://x");
      const tra = (code, obj) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };

      if (u.pathname.startsWith("/storage/v1/object/list/")) {
        if (tuChoiList) return tra(500, { message: "list sập" });
        const { prefix = "", limit = 100, offset = 0 } = JSON.parse(body.toString() || "{}");
        // Storage chỉ trả MỘT tầng dưới prefix — chép đúng nghĩa đó.
        const ra = [];
        for (const [d, cd] of kho) {
          const cha = d.includes("/") ? d.slice(0, d.lastIndexOf("/")) : "";
          if (cha !== prefix) continue;
          ra.push({ name: d.slice(prefix ? prefix.length + 1 : 0), metadata: { size: cd } });
        }
        ra.sort((a, b) => a.name.localeCompare(b.name));
        return tra(200, ra.slice(offset, offset + limit));
      }

      const m = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(u.pathname);
      if (m && req.method === "POST") {
        const duong = decodeURIComponent(m[2]).split("/").map(decodeURIComponent).join("/");
        if (tuChoiUp && tuChoiUp.test(duong)) return tra(500, { message: "up sập" });
        // "nuốt im": trả 200 nhưng KHÔNG cất — đúng hình lỗi nguy nhất, vì vòng
        // lặp báo thành công mà bucket thì thiếu.
        if (!(nuotIm && nuotIm.test(duong))) kho.set(duong, body.length);
        return tra(200, { Key: duong });
      }
      tra(404, { message: "không có đường này" });
    });
  });
  return new Promise((res) => sv.listen(0, "127.0.0.1", () => res({ sv, kho, cong: sv.address().port })));
}

function dungKho(src, cay) {
  for (const [duong, noiDung] of Object.entries(cay)) {
    const p = join(src, duong);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, noiDung);
  }
}

// spawnSync CHẶN event loop tiến trình cha → server HTTP giả trong CÙNG tiến
// trình không bao giờ accept được. Phải spawn bất đồng bộ. (Bài xuat-ro-hang
// từng treo đúng 120 giây vì lẽ này.)
function chay(args, env) {
  return new Promise((res) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, ...env }, cwd: GOC_REPO,
    });
    let ra = "", loi = "";
    p.stdout.on("data", (d) => (ra += d));
    p.stderr.on("data", (d) => (loi += d));
    p.on("close", (ma) => res({ ma, ra, loi, het: ra + loi }));
  });
}

const soTayCua = (goc) => {
  const cha = resolve(goc, "..");
  const f = readdirSync(cha).find((x) => x.startsWith("masterdb-raw-so-tay-"));
  return f ? JSON.parse(readFileSync(join(cha, f), "utf8")) : null;
};

console.log("TỰ KIỂM up-masterdb.mjs — Storage giả, không chạm bucket thật\n");

// ── Ca 1: đường suôn ────────────────────────────────────────────────────────
{
  const { sv, kho, cong } = await moKho();
  const tmp = mkdtempSync(join(tmpdir(), "mdb-"));
  const src = join(tmp, "masterDB");
  dungKho(src, { "photos/1/1.jpg": "aaa", "photos/1/2.jpg": "bbbb", "photos/2/1.jpg": "c", "excel/kho.csv": "x,y" });
  const r = await chay([src], { SUPABASE_URL: `http://127.0.0.1:${cong}`, SUPABASE_SERVICE_ROLE_KEY: "gia" });
  const s = soTayCua(src);
  ok("đường suôn: thoát 0", r.ma === 0, `mã ${r.ma}`);
  ok("đường suôn: 4 file lên bucket", kho.size === 4, `${kho.size} file`);
  ok("đường suôn: sổ tay day_du", s?.trang_thai === "day_du", s?.trang_thai);
  ok("đường suôn: giữ nguyên cấu trúc thư mục", kho.has("photos/1/2.jpg") && kho.has("excel/kho.csv"));
  ok("đường suôn: KHÔNG nén — byte y hệt đĩa", kho.get("photos/1/2.jpg") === 4, `${kho.get("photos/1/2.jpg")} byte`);
  sv.close();
}

// ── Ca 2: chạy lại thì bỏ qua file đã có ────────────────────────────────────
{
  const { sv, kho, cong } = await moKho();
  const tmp = mkdtempSync(join(tmpdir(), "mdb-"));
  const src = join(tmp, "masterDB");
  dungKho(src, { "photos/1/1.jpg": "aaa", "photos/1/2.jpg": "bbbb" });
  const env = { SUPABASE_URL: `http://127.0.0.1:${cong}`, SUPABASE_SERVICE_ROLE_KEY: "gia" };
  await chay([src], env);
  const r2 = await chay([src], env);
  const s = soTayCua(src);
  ok("chạy lại: thoát 0", r2.ma === 0, `mã ${r2.ma}`);
  ok("chạy lại: bỏ qua cả 2 file đã có", s?.bo_qua_da_co === 2 && s?.da_len === 0,
     `bỏ qua ${s?.bo_qua_da_co}, lên ${s?.da_len}`);
  sv.close();
}

// ── Ca 3: bucket NUỐT IM (trả 200 mà không cất) → phải bắt được ─────────────
// Đây là ca quan trọng nhất: vòng lặp chạy hết, mọi lượt đều 200, mà bucket
// thiếu file. Không có bước đối chiếu cuối thì script báo "xong" trong khi hụt.
{
  const { sv, kho, cong } = await moKho({ nuotIm: /photos\/1\/2\.jpg/ });
  const tmp = mkdtempSync(join(tmpdir(), "mdb-"));
  const src = join(tmp, "masterDB");
  dungKho(src, { "photos/1/1.jpg": "aaa", "photos/1/2.jpg": "bbbb" });
  const r = await chay([src], { SUPABASE_URL: `http://127.0.0.1:${cong}`, SUPABASE_SERVICE_ROLE_KEY: "gia" });
  const s = soTayCua(src);
  ok("nuốt im: thoát KHÁC 0", r.ma !== 0, `mã ${r.ma}`);
  ok("nuốt im: nói ra file nào thiếu", /THIẾU 1 file/.test(r.het) && /photos\/1\/2\.jpg/.test(r.het));
  ok("nuốt im: sổ tay ghi thieu", s?.trang_thai === "thieu" && s?.thieu?.length === 1, s?.trang_thai);
  ok("nuốt im: bucket đúng là chỉ có 1 file", kho.size === 1, `${kho.size}`);
  sv.close();
}

// ── Ca 4: một file lỗi khi đẩy ──────────────────────────────────────────────
{
  const { sv, cong } = await moKho({ tuChoiUp: /2\.jpg/ });
  const tmp = mkdtempSync(join(tmpdir(), "mdb-"));
  const src = join(tmp, "masterDB");
  dungKho(src, { "photos/1/1.jpg": "aaa", "photos/1/2.jpg": "bbbb" });
  const r = await chay([src], { SUPABASE_URL: `http://127.0.0.1:${cong}`, SUPABASE_SERVICE_ROLE_KEY: "gia" });
  const s = soTayCua(src);
  ok("file lỗi: thoát KHÁC 0", r.ma !== 0, `mã ${r.ma}`);
  ok("file lỗi: sổ tay ghi lại đường dẫn hỏng", (s?.hong?.length ?? 0) >= 1 || (s?.thieu?.length ?? 0) >= 1);
  sv.close();
}

// ── Ca 5: không liệt kê được bucket → coi như chưa xong ─────────────────────
{
  const { sv, cong } = await moKho({ tuChoiList: true });
  const tmp = mkdtempSync(join(tmpdir(), "mdb-"));
  const src = join(tmp, "masterDB");
  dungKho(src, { "photos/1/1.jpg": "aaa" });
  const r = await chay([src], { SUPABASE_URL: `http://127.0.0.1:${cong}`, SUPABASE_SERVICE_ROLE_KEY: "gia" });
  ok("list sập: thoát KHÁC 0", r.ma !== 0, `mã ${r.ma}`);
  ok("list sập: nói rõ không đối chiếu được", /liệt kê|đối chiếu/i.test(r.het));
  sv.close();
}

// ── Ca 6: nguồn nằm TRONG repo → từ chối, không gọi mạng ────────────────────
{
  const r = await chay([join(GOC_REPO, "scripts")], { SUPABASE_SERVICE_ROLE_KEY: "gia" });
  ok("nguồn trong repo: từ chối, thoát khác 0", r.ma !== 0, `mã ${r.ma}`);
  ok("nguồn trong repo: nhắc CLAUDE.md §5", /TỪ CHỐI/.test(r.het) && /§5/.test(r.het));
}

// ── Ca 7: --dry không đẩy gì ────────────────────────────────────────────────
{
  const { sv, kho, cong } = await moKho();
  const tmp = mkdtempSync(join(tmpdir(), "mdb-"));
  const src = join(tmp, "masterDB");
  dungKho(src, { "photos/1/1.jpg": "aaa" });
  const r = await chay([src, "--dry"], { SUPABASE_URL: `http://127.0.0.1:${cong}` });
  const s = soTayCua(src);
  ok("--dry: thoát 0", r.ma === 0, `mã ${r.ma}`);
  ok("--dry: KHÔNG đẩy file nào", kho.size === 0, `${kho.size} file trên bucket`);
  ok("--dry: chạy được mà không cần khoá", !/SERVICE_ROLE/.test(r.het));
  ok("--dry: sổ tay ghi chi_xem", s?.trang_thai === "chi_xem", s?.trang_thai);
  sv.close();
}

// ── Ca 8: bỏ rác OneDrive/Windows ───────────────────────────────────────────
{
  const { sv, kho, cong } = await moKho();
  const tmp = mkdtempSync(join(tmpdir(), "mdb-"));
  const src = join(tmp, "masterDB");
  dungKho(src, {
    "photos/1/1.jpg": "aaa", "photos/1/Thumbs.db": "rác",
    "photos/1/desktop.ini": "rác", "photos/.DS_Store": "rác",
  });
  const r = await chay([src], { SUPABASE_URL: `http://127.0.0.1:${cong}`, SUPABASE_SERVICE_ROLE_KEY: "gia" });
  ok("bỏ rác: thoát 0", r.ma === 0, `mã ${r.ma}`);
  ok("bỏ rác: chỉ 1 file thật lên bucket", kho.size === 1 && kho.has("photos/1/1.jpg"), `${kho.size} file`);
  sv.close();
}

// ── Ca 9: sổ tay nói rõ nó KHÔNG phải bản sao dữ liệu ───────────────────────
{
  const { sv, cong } = await moKho();
  const tmp = mkdtempSync(join(tmpdir(), "mdb-"));
  const src = join(tmp, "masterDB");
  dungKho(src, { "photos/1/1.jpg": "aaa" });
  await chay([src], { SUPABASE_URL: `http://127.0.0.1:${cong}`, SUPABASE_SERVICE_ROLE_KEY: "gia" });
  const s = soTayCua(src);
  ok("sổ tay: có chữ KHONG_PHAI_BAN_SAO_DU_LIEU",
     typeof s?.KHONG_PHAI_BAN_SAO_DU_LIEU === "string" && /KHÔNG chứa bảng nào của Postgres/.test(s.KHONG_PHAI_BAN_SAO_DU_LIEU));
  sv.close();
}

console.log(`\n${"═".repeat(60)}\nĐẠT ${dat} · HỎNG ${hong}`);
if (hong) { console.error("\nTỰ KIỂM HỎNG"); process.exit(1); }
console.log("\n\x1b[32mTỰ KIỂM ĐẠT\x1b[0m — script không nén, chạy lại được, và biết khi nào mình đẩy hụt.");
