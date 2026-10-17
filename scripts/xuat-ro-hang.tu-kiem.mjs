#!/usr/bin/env node
// xuat-ro-hang.tu-kiem.mjs — bắt `xuat-ro-hang.mjs` tự chứng minh, bằng một
// PostgREST GIẢ. Không chạm DB thật, không cần khoá, chạy offline.
//
//   node scripts/xuat-ro-hang.tu-kiem.mjs
//
// ═══════════════ VÌ SAO CÓ FILE NÀY ═══════════════
// Script xuất có hai cách hỏng mà NHÌN VÀO KHÔNG THẤY:
//   1. Ghi vào trong repo → SĐT thật + địa chỉ nhà dân vào repo PUBLIC.
//   2. Kéo thiếu dòng (proxy cắt / db_max_rows) → thư mục THIẾU TIN nhìn y hệt
//      thư mục đủ, và người đọc tưởng rổ hàng chỉ có ngần đó.
// Cả hai đều im lặng. Nên phải bơm chúng vào rồi soi mã thoát, không được tin
// vào việc "chạy thử thấy ra file là được".

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const HERE = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
const SCRIPT = path.join(HERE, "xuat-ro-hang.mjs");

let dat = 0, hong = 0;
const ok = (m) => { dat++; console.log(`\x1b[32m✓\x1b[0m ${m}`); };
const no = (m, chiTiet) => {
  hong++; console.log(`\x1b[31m✗\x1b[0m ${m}`);
  if (chiTiet) console.log(chiTiet.split("\n").slice(-12).map((l) => `      ${l}`).join("\n"));
};

// ── PostgREST giả ───────────────────────────────────────────────────────────
const TIN = (i, thua = {}) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  code: `BDS-Q5-${String(i).padStart(4, "0")}`,
  deal: "ban", status: "dang_ban", property_type: "nha_pho",
  property_type_source: "suy_doan", specs_source: "boc_mo_ta",
  price_source: "admin", ward_source: "admin",
  ward: "Phường 4", district: "Quận 5", street: "Trần Hưng Đạo",
  location_raw: "Số 12 Trần Hưng Đạo", price_raw: "5 tỷ", price_vnd: 5e9,
  area_m2: 60, price_per_m2_vnd: 83333333, frontage_m: 4, length_m: 15,
  floors: 3, floors_text: "trệt + 2 lầu", bedrooms: 3, bathrooms: 3,
  access_type: "hem_xe_hoi", alley_width_m: 6, legal_status: "so_hong_rieng",
  has_completion: true, direction: "Đông", created_at: "2026-08-21T08:32:09Z",
  description: "Bán nhà HXH 6m, 4x15, sổ hồng riêng.\n- Liên hệ 0903111222",
  ...thua,
});

// spawnSync CHẶN event loop của tiến trình cha → server HTTP giả trong CÙNG
// tiến trình không bao giờ accept được kết nối, và tiến trình con chờ mãi.
// Bài này treo đúng 120 giây ở lượt chạy đầu vì lẽ đó. Phải spawn bất đồng bộ.
function chay(args, env) {
  return new Promise((giai) => {
    const c = spawn("node", args, { env });
    let out = "";
    c.stdout.on("data", (d) => { out += d; });
    c.stderr.on("data", (d) => { out += d; });
    c.on("close", (ma) => giai({ status: ma, out }));
  });
}

function moServer({ listings, media = [], facts = [], tongGia = null }) {
  const bang = { listings, media, listing_facts: facts };
  const sv = createServer((req, res) => {
    const ten = req.url.split("?")[0].replace("/rest/v1/", "");
    const rows = bang[ten] ?? [];
    // `tongGia` = số DB TỰ BÁO. Đặt khác rows.length để giả cảnh kéo thiếu.
    const tong = ten === "listings" && tongGia != null ? tongGia : rows.length;
    res.setHeader("content-type", "application/json");
    res.setHeader("content-range", `0-${Math.max(rows.length - 1, 0)}/${tong}`);
    res.end(JSON.stringify(rows));
  });
  return new Promise((giai) => sv.listen(0, "127.0.0.1", () => giai(sv)));
}

const rac = [];
async function canh(ten, { listings, media, facts, tongGia, dichLa, themArgv = [] }, maMong, dauHieu) {
  if (!dauHieu) throw new Error(`ca "${ten}" thiếu dauHieu — mã thoát một mình không chứng minh được gì`);
  const sv = await moServer({ listings, media, facts, tongGia });
  const cong = sv.address().port;
  const dich = dichLa ?? mkdtempSync(path.join(tmpdir(), "rohang-"));
  if (!dichLa) rac.push(dich);
  const r = await chay([SCRIPT, dich, ...themArgv], {
    ...process.env,
    SUPABASE_URL: `http://127.0.0.1:${cong}`,
    SUPABASE_SERVICE_ROLE_KEY: "khoa-gia-khong-that",
  });
  sv.closeAllConnections?.();
  sv.close();
  const out = r.out;
  const ma = r.status ?? -1;
  const maDung = ma === maMong;
  const chuDung = out.includes(dauHieu);
  if (maDung && chuDung) { ok(`${ten}  →  thoát ${ma}`); return { dich, out }; }
  no(`${ten}  →  thoát ${ma} (mong ${maMong})${chuDung ? "" : `, thiếu dấu hiệu "${dauHieu}"`}`, out);
  return { dich, out };
}

console.log("TỰ KIỂM xuat-ro-hang.mjs — PostgREST giả, không chạm DB thật\n");

// ══ 1. ĐỐI CHỨNG DƯƠNG: dữ liệu lành → XONG ══
// Không có ca này thì mọi ca "phải hỏng" bên dưới có thể chỉ đang chứng minh
// script luôn đỏ.
const { dich: d1 } = await canh(
  "[đc] 2 tin lành → xuất XONG",
  { listings: [TIN(1), TIN(2)], media: [], facts: [] },
  0, "XONG",
);

// ══ 2. Cấu trúc ra đúng chưa ══
{
  const co = (p) => existsSync(path.join(d1, p));
  const du = co("README.md") && co("ro-hang.csv") && co("manifest.json") &&
    co(path.join("tin", "BDS-Q5-0001", "tin.md")) && co(path.join("tin", "BDS-Q5-0002", "tin.md"));
  du ? ok("đủ README.md + ro-hang.csv + manifest.json + tin/<mã>/tin.md")
     : no("thiếu file trong thư mục ra", readdirSync(d1).join("\n"));

  const csv = readFileSync(path.join(d1, "ro-hang.csv"), "utf8");
  csv.startsWith("﻿")
    ? ok("ro-hang.csv có BOM — Excel mở không vỡ tiếng Việt")
    : no("ro-hang.csv THIẾU BOM → Excel hiện 'BÃ¡n'");

  const md = readFileSync(path.join(d1, "tin", "BDS-Q5-0001", "tin.md"), "utf8");
  md.includes("máy đoán")
    ? ok("tin.md CẢNH BÁO loại BĐS là máy đoán (property_type_source=suy_doan)")
    : no("tin.md không cảnh báo gì về số liệu máy đoán");
  md.includes("0903111222")
    ? ok("tin.md giữ NGUYÊN VĂN mô tả (không tự ý sửa lời người rao — FR-91/153)")
    : no("tin.md đã sửa mô tả gốc");

  const mf = JSON.parse(readFileSync(path.join(d1, "manifest.json"), "utf8"));
  mf.trang_thai === "day_du" && mf.so_tin === 2
    ? ok("manifest ghi trang_thai=day_du, so_tin=2")
    : no(`manifest sai: ${JSON.stringify(mf).slice(0, 160)}`);
  String(mf.KHONG_PHAI_BAN_SAO_LUU ?? "").includes("Không dựng lại được DB")
    ? ok("manifest nói rõ ĐÂY KHÔNG PHẢI bản sao lưu")
    : no("manifest không cảnh báo — người ta sẽ tưởng đây là backup");
}

// ══ 3. Cách hỏng IM LẶNG số 1: kéo thiếu dòng ══
// DB báo 5, chỉ kéo về 2. Bản trước kiểu này sẽ ghi ra 2 thư mục tin và in
// "XONG" — thư mục thiếu 3 tin nhìn y hệt thư mục đủ.
await canh(
  "DB báo 5 dòng nhưng chỉ kéo về 2 → HỎNG, không ghi 'XONG'",
  { listings: [TIN(1), TIN(2)], tongGia: 5 },
  1, "DB báo 5",
);

// ══ 4. Cách hỏng IM LẶNG số 2: ghi vào trong repo ══
const TRONG_REPO = path.join(HERE, "..", "docs");
// `dichLa` BẮT BUỘC ở ca này. Lượt viết đầu tao quên truyền nó, `canh` rơi về
// thư mục tmp ngẫu nhiên — nằm NGOÀI repo, nên script xuất bình thường và ca
// báo đỏ. Bài kiểm sai chứ không phải script sai. Không có `dichLa` thì ca này
// không kiểm gì hết.
await canh(
  "đích nằm TRONG repo → TỪ CHỐI (SĐT thật vào repo public)",
  { listings: [TIN(1)], dichLa: TRONG_REPO },
  1, "TỪ CHỐI",
);
{
  const trongRepo = TRONG_REPO;
  const truoc = existsSync(trongRepo) ? readdirSync(trongRepo).length : -1;
  const sv = await moServer({ listings: [TIN(1)] });
  const r = await chay([SCRIPT, trongRepo], {
    ...process.env, SUPABASE_URL: `http://127.0.0.1:${sv.address().port}`, SUPABASE_SERVICE_ROLE_KEY: "gia",
  });
  sv.closeAllConnections?.();
  sv.close();
  const sau = existsSync(trongRepo) ? readdirSync(trongRepo).length : -1;
  r.status === 1 && sau === truoc
    ? ok("[đc] từ chối rồi thì KHÔNG ghi gì vào repo (docs/ không đổi số file)")
    : no(`đã ghi vào repo! trước ${truoc} file, sau ${sau}`);
}

// ══ 5. Hỏng thì manifest phải nói ra ══
{
  const { dich } = await canh(
    "kéo thiếu → manifest vẫn ghi ra đĩa với trang_thai='hong'",
    { listings: [TIN(1)], tongGia: 9 },
    1, "manifest.json đã ghi",
  );
  const p = path.join(dich, "manifest.json");
  if (existsSync(p)) {
    const mf = JSON.parse(readFileSync(p, "utf8"));
    mf.trang_thai === "hong" && mf.loi
      ? ok("manifest.json trên đĩa: trang_thai='hong' + lý do")
      : no(`manifest không ghi hỏng: ${JSON.stringify(mf).slice(0, 140)}`);
  } else no("không có manifest.json sau khi hỏng — lần sau không ai biết vì sao");
}

// ══ 6. Thiếu khoá thì nói thẳng, không xuất thư mục rỗng ══
{
  const dich = mkdtempSync(path.join(tmpdir(), "rohang-"));
  rac.push(dich);
  // ĐẶT RỖNG chứ không `delete`: script tự nạp `scripts/.env`, mà máy người làm
  // thì có file đó — xoá biến khỏi env là nó nạp lại khoá THẬT rồi xuất rổ hàng
  // thật ra thư mục tạm, ca kiểm thành vô nghĩa (bắt 10/09: ca này "thoát 0" và
  // in ra 6 tin). Khoá rỗng thì nhánh nạp bỏ qua (tên biến đã có trong env).
  const env = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: "" };
  const r = spawnSync("node", [SCRIPT, dich], { encoding: "utf8", env });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  r.status === 1 && out.includes("SUPABASE_SERVICE_ROLE_KEY")
    ? ok("thiếu khoá → thoát 1, chỉ đúng chỗ đặt khoá")
    : no(`thiếu khoá xử lý sai (thoát ${r.status})`, out);
}

// ══ 7. Mã tin có ký tự Windows cấm → tên thư mục vẫn tạo được ══
{
  const { dich } = await canh(
    'mã tin có ký tự cấm (BDS/Q5:001?) → tên thư mục an toàn',
    { listings: [TIN(1, { code: "BDS/Q5:001?" })] },
    0, "XONG",
  );
  const ds = existsSync(path.join(dich, "tin")) ? readdirSync(path.join(dich, "tin")) : [];
  ds.length === 1 && !/[<>:"/\\|?*]/.test(ds[0])
    ? ok(`tên thư mục đã làm sạch → "${ds[0]}"`)
    : no(`tên thư mục còn ký tự cấm: ${JSON.stringify(ds)}`);
}

// ══ 8. --anh trỏ chỗ không có file → đếm thiếu, KHÔNG sập ══
{
  const gocAnh = mkdtempSync(path.join(tmpdir(), "anh-"));
  rac.push(gocAnh);
  mkdirSync(path.join(gocAnh, "masterDB", "photos", "1"), { recursive: true });
  writeFileSync(path.join(gocAnh, "masterDB", "photos", "1", "1.jpg"), "gia-lam-anh");
  const { dich } = await canh(
    "--anh: 1 ảnh có thật + 1 ảnh mất → chép 1, đếm thiếu 1, không sập",
    {
      listings: [TIN(1)],
      media: [
        { listing_id: TIN(1).id, storage_path: "masterDB/photos/1/1.jpg", approved: true },
        { listing_id: TIN(1).id, storage_path: "masterDB/photos/1/999.jpg", approved: true },
      ],
      themArgv: ["--anh", gocAnh],
    },
    0, "XONG",
  );
  const mf = JSON.parse(readFileSync(path.join(dich, "manifest.json"), "utf8"));
  mf.so_anh_chep === 1 && mf.so_anh_thieu === 1
    ? ok("manifest: chép 1, thiếu 1 — ảnh mất được ĐẾM chứ không nuốt")
    : no(`đếm ảnh sai: chép=${mf.so_anh_chep} thiếu=${mf.so_anh_thieu}`);
  existsSync(path.join(dich, "tin", "BDS-Q5-0001", "anh", "01.jpg"))
    ? ok("ảnh chép vào tin/<mã>/anh/01.jpg")
    : no("không thấy ảnh đã chép");
}

for (const d of rac) rmSync(d, { recursive: true, force: true });

console.log(`\n${"═".repeat(60)}`);
console.log(`ĐẠT ${dat} · HỎNG ${hong}`);
if (hong > 0) {
  console.log("\n\x1b[31mBẢN XUẤT KHÔNG ĐÁNG TIN.\x1b[0m Sửa trước khi đưa ai đọc.");
  process.exit(1);
}
console.log("\n\x1b[32mTỰ KIỂM ĐẠT\x1b[0m — bản xuất không ghi vào repo, không nuốt dòng thiếu, không nhận nhầm là backup.");
