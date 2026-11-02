// nap-ranh-gioi.mjs — nạp ĐA GIÁC ranh giới phường / xã MỚI vào `ranh_gioi_phuong` (SRS-5.1zzzzzzz360, migration 20261103b) từ OSM.
// Chạy trên GitHub Actions (container phiên Claude bị chặn mạng tới Overpass): `apply-migration.yml` ô `dung_lai = nap-ranh-gioi`.
// CHỈ chạy sau khi đã áp 20261103b.
//
// LẤY GÌ: relation `boundary=administrative` `admin_level=6` có `name` = `wards.ten_day_du` (cùng khoá `nap-duong.mjs` đã dùng — phường /
// xã sau sáp nhập 2025 trên OSM là cấp 6, ngay dưới tỉnh), `out geom`, ghép way thành vành (`scripts/lib/ghep-vanh.mjs`).
// Hai relation cùng tên trong hộp bao (Phường Tân Phú / Long Bình — SRS-5.1zzzzzzz187) → chọn relation có tâm khung gần tâm `wards` nhất.
// PHẠM VI: chỉ các phường có trong `wards` (168 phường / xã TP.HCM mới). Năm tỉnh còn lại của vùng nhận tin CHƯA có dòng `wards` — và
// `wards.ten` là khoá chính một cột, tên phường trùng giữa các tỉnh sẽ đụng khoá → thêm tỉnh khác cần đổi khoá `wards`, việc riêng.
// Giấy phép: ODbL 1.0 — © OpenStreetMap contributors (ghi ở mỗi dòng).
//
//   node scripts/nap-ranh-gioi.mjs            # mọi phường chưa có đa giác
//   node scripts/nap-ranh-gioi.mjs --tat-ca   # nạp lại cả 168
//   node scripts/nap-ranh-gioi.mjs --phuong "Phường Bến Thành"
//   node scripts/nap-ranh-gioi.mjs --dry      # tra Overpass, không ghi DB
//
// Cuối lượt: ĐỘ PHỦ (số phường có đa giác / số dòng `wards`) và KIỂM 20 ĐIỂM BIẾT TRƯỚC — tâm `wards.lat/lng` (nguồn khác OSM) của 20
// phường phải ra đúng phường qua chính RPC `phuong_tai_diem`. Cần SUPABASE_SERVICE_ROLE_KEY trong scripts/.env.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { relationThanhVong } from "./lib/ghep-vanh.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(HERE, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const URL_DB = env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error("Thiếu SUPABASE_SERVICE_ROLE_KEY trong scripts/.env"); process.exit(2); }
// Overpass trả 406 khi thiếu User-Agent; máy hụt thì lượt thử lại đổi sang máy kế (như nap-duong).
const OVERPASS_DS = env.OVERPASS_URL ? [env.OVERPASS_URL]
  : ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const UA = "nhadat.cc nap-ranh-gioi (lien he: explore@nhadat.company)";
const NGAY = new Date().toISOString().slice(0, 10);
const BBOX_HCM = "10.30,106.30,11.50,107.70";
const BBOX_RIENG = { "Đặc khu Côn Đảo": "8.55,106.45,8.85,106.75" };

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const TAT_CA = args.includes("--tat-ca");
const CHI = (() => { const i = args.indexOf("--phuong"); return i >= 0 ? args[i + 1] : null; })();
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, lan = 0) {
  try {
    const r = await fetch(OVERPASS_DS[lan % OVERPASS_DS.length], {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: "data=" + encodeURIComponent(query),
    });
    if (r.status === 429 || r.status === 504 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
    if (!r.ok) { console.error(`  ! Overpass ${r.status}`); return null; }
    return await r.json();
  } catch (e) {
    if (lan >= 4) { console.error(`  ! ${e.message} — bỏ lượt này`); return null; }
    await nghi(15000 * (lan + 1));
    return overpass(query, lan + 1);
  }
}

async function rest(path, init = {}) {
  const r = await fetch(`${URL_DB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const wards = await rest("wards?select=ten,ten_day_du,lat,lng&order=ten");
const daCo = new Set((await rest("ranh_gioi_phuong?select=ten")).map((r) => r.ten));
let tra = 0, ghiDuoc = 0;
const hong = [];

// 03/11 (lượt đầu từng phường kẹt ở Overpass: 12/168 sau 18 phút): MỘT truy vấn lấy mọi relation admin_level=6 trong hộp bao TP.HCM
// (+ hộp riêng Côn Đảo), khớp tên tại máy; phường thiếu mới tra riêng từng cái.
const theoTen = new Map();
for (const hop of [BBOX_HCM, ...Object.values(BBOX_RIENG)]) {
  const kq = await overpass(`[out:json][timeout:600][maxsize:1073741824];rel["boundary"="administrative"]["admin_level"="6"](${hop});out geom;`);
  tra++;
  for (const rel of kq?.elements?.filter((e) => e.type === "relation") ?? []) {
    const ten = rel.tags?.name;
    if (!ten) continue;
    if (!theoTen.has(ten)) theoTen.set(ten, []);
    theoTen.get(ten).push(rel);
  }
  console.log(`  hộp ${hop}: ${kq?.elements?.length ?? "không trả lời"} relation`);
}

async function relCua(w) {
  if (theoTen.has(w.ten_day_du)) return theoTen.get(w.ten_day_du);
  const hop = BBOX_RIENG[w.ten_day_du] ?? BBOX_HCM;
  const kq = await overpass(`[out:json][timeout:120];rel["boundary"="administrative"]["admin_level"="6"]["name"="${w.ten_day_du}"](${hop});out geom;`);
  tra++;
  await nghi(2000);
  return kq?.elements?.filter((e) => e.type === "relation") ?? [];
}

for (const w of wards) {
  if (CHI && w.ten_day_du !== CHI) continue;
  if (!CHI && !TAT_CA && daCo.has(w.ten)) continue;
  const rels = await relCua(w);
  if (!rels.length) { hong.push(`${w.ten_day_du}: không có relation admin_level=6`); continue; }
  const ung = rels.map((rel) => ({ rel, kq: relationThanhVong(rel) })).filter((x) => x.kq);
  if (!ung.length) { hong.push(`${w.ten_day_du}: ${rels.length} relation, không ghép được vành kín`); continue; }
  const tam = (k) => [(k.min_lat + k.max_lat) / 2, (k.min_lng + k.max_lng) / 2];
  const xa = (x) => (w.lat == null ? 0 : (tam(x.kq.khung)[0] - w.lat) ** 2 + (tam(x.kq.khung)[1] - w.lng) ** 2);
  const chon = ung.sort((a, b) => xa(a) - xa(b))[0];
  if (rels.length > 1) console.log(`  ~ ${w.ten_day_du}: ${rels.length} relation cùng tên, chọn ${chon.rel.id} (gần tâm wards nhất)`);
  const dong = {
    ten: w.ten, vong: chon.kq.vong, ...chon.kq.khung,
    nguon: `OSM relation ${chon.rel.id}, Overpass ${NGAY}`, giay_phep: "ODbL 1.0 — © OpenStreetMap contributors", nap_luc: new Date().toISOString(),
  };
  if (!DRY) {
    await rest("ranh_gioi_phuong?on_conflict=ten", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([dong]),
    });
  }
  ghiDuoc++;
}

console.log(`\nĐã gọi Overpass ${tra} lượt, ${DRY ? "sẽ ghi" : "ghi"} ${ghiDuoc}, hỏng ${hong.length}.`);
for (const h of hong) console.log(`  ✗ ${h}`);
if (DRY) process.exit(0);

// Độ phủ + 20 điểm biết trước (tâm `wards`, nguồn khác OSM) qua chính RPC.
const coVong = (await rest("ranh_gioi_phuong?select=ten")).length;
console.log(`\nĐỘ PHỦ: ${coVong} / ${wards.length} phường có đa giác (${Math.round((100 * coVong) / wards.length)}%).`);
const mau = wards.filter((w) => w.lat != null && w.lng != null);
const buoc = Math.max(1, Math.floor(mau.length / 20));
let dung = 0, n = 0;
for (let i = 0; i < mau.length && n < 20; i += buoc, n++) {
  const w = mau[i];
  const ra = await rest("rpc/phuong_tai_diem", { method: "POST", body: JSON.stringify({ p_lat: Number(w.lat), p_lng: Number(w.lng) }) });
  const khop = ra === w.ten_day_du;
  if (khop) dung++;
  console.log(`  ${khop ? "✓" : "✗"} (${w.lat}, ${w.lng}) ${w.ten_day_du} → ${ra ?? "null"}`);
}
console.log(`KIỂM 20 ĐIỂM: ${dung} / ${n} ra đúng phường.`);
process.exit(hong.length ? 1 : 0);
