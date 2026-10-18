// nap-giao-lo.mjs — nạp bảng GIAO LỘ `giao_lo` (20261018f, SRS-5.1zzzzzzz40) từ OpenStreetMap, theo từng phường mới của TP.HCM.
//
// Chủ dự án 18/10/2026: "Bảng giao lộ đường – phường có thì quá tốt làm đi, bot sẽ biết bds gần ngã tư bao nhiêu mét các kiểu,
// ở đường này gần đường kia".
//
// LẤY GÌ: mỗi phường một truy vấn Overpass — các way `highway` có tên trong đa giác phường (`admin_level=6`, tên khớp
// `wards.ten_day_du`, cùng hộp bao với nap-duong.mjs) + các NÚT của chúng NẰM TRONG phường. `lib/giao-lo.mjs` tìm nút mà hai
// đường khác tên cùng đi qua, gom nút sát nhau thành một ngã tư. Bỏ lối đi bộ / bậc thang / đường đang xây.
//
//   node scripts/nap-giao-lo.mjs                       # cả TP.HCM (168 phường, đi chậm ~1 truy vấn / 3 giây)
//   node scripts/nap-giao-lo.mjs --phuong "Phường Chợ Quán"
//   node scripts/nap-giao-lo.mjs --thieu               # chỉ phường chưa có dòng nào (chạy bù)
//   node scripts/nap-giao-lo.mjs --dry
//
// Cần SUPABASE_SERVICE_ROLE_KEY trong scripts/.env. Chạy lại được: upsert theo (osm_node, duong_a, duong_b). Cuối cùng đối chiếu
// số phường có dòng ↔ số phường đã tra rồi mới báo xong (NFR-18).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { timGiaoLo } from "./lib/giao-lo.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(HERE, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const URL_DB = env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error("Thiếu SUPABASE_SERVICE_ROLE_KEY trong scripts/.env"); process.exit(2); }
const OVERPASS_DS = env.OVERPASS_URL ? [env.OVERPASS_URL]
  : ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const UA = "nhadat.cc nap-giao-lo (lien he: explore@nhadat.company)";
const NGAY = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const co = (t) => args.includes(t);
const lay = (t) => { const i = args.indexOf(t); return i >= 0 ? args[i + 1] : null; };
const DRY = co("--dry");
const CHI_PHUONG = lay("--phuong");
const CHI_THIEU = co("--thieu");
// Cùng hộp bao với nap-duong.mjs (chặn phường trùng tên ở tỉnh khác).
const BBOX_HCM = "10.30,106.30,11.50,107.70";
const BBOX_RIENG = { "Đặc khu Côn Đảo": "8.55,106.45,8.85,106.75" };
const BO_LOAI = "^(footway|path|steps|cycleway|bridleway|construction|proposed|platform|corridor|elevator|raceway|bus_stop)$";

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, lan = 0) {
  const url = OVERPASS_DS[lan % OVERPASS_DS.length];
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (r.status === 429 || r.status === 504 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
    if (!r.ok) { console.error(`  ! Overpass ${r.status}`); return null; }
    return await r.json();
  } catch (e) {
    if (lan >= 4) { console.error(`  ! ${e.message} — bỏ qua lượt này`); return null; }
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

async function tatCa(path) {
  const ra = [];
  for (let tu = 0; ; tu += 1000) {
    const trang = await rest(path, { headers: { Range: `${tu}-${tu + 999}` } });
    ra.push(...trang);
    if (trang.length < 1000) return ra;
  }
}

async function ghi(rows) {
  if (!rows.length || DRY) return rows.length;
  for (let i = 0; i < rows.length; i += 500) {
    await rest("giao_lo?on_conflict=osm_node,duong_a,duong_b", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
  }
  return rows.length;
}

const wards = await rest("wards?select=ten_day_du,quan_cu&order=ten_day_du");
const daCo = CHI_THIEU ? new Set((await tatCa("giao_lo?select=phuong&order=id")).map((d) => d.phuong)) : new Set();
let daTra = 0, coDong = 0, tongDong = 0;

for (const w of wards) {
  if (CHI_PHUONG && w.ten_day_du !== CHI_PHUONG) continue;
  if (CHI_THIEU && daCo.has(w.ten_day_du)) continue;
  const q = `[out:json][timeout:240];area["admin_level"="6"]["name"="${w.ten_day_du}"]->.a;` +
    `way(area.a)(${BBOX_RIENG[w.ten_day_du] ?? BBOX_HCM})["highway"]["name"]["highway"!~"${BO_LOAI}"]->.d;` +
    `.d out body qt;node(w.d)(area.a);out skel qt;.a out ids;`;
  const kq = await overpass(q); daTra++;
  if (kq == null) {
    console.log(`  ✗ ${w.ten_day_du}: không có trả lời`);
    // Ba phường đầu đều hỏng thì gần như chắc là câu truy vấn hay máy chủ — dừng, đừng đốt 168 × thử lại (hàng giờ).
    if (daTra >= 3 && coDong === 0) { console.error("Dừng: 3 phường đầu không có trả lời."); process.exit(1); }
    await nghi(3000); continue;
  }
  const soArea = (kq.elements ?? []).filter((e) => e.type === "area").length;
  if (soArea !== 1) { console.log(`  ✗ ${w.ten_day_du}: ${soArea} đa giác cùng tên — bỏ, cần soi tay`); await nghi(3000); continue; }
  const gl = timGiaoLo(kq.elements);
  const n = await ghi(gl.map((g) => ({
    ...g, phuong: w.ten_day_du, quan_cu: w.quan_cu, tinh: "TP.HCM",
    nguon: `OSM Overpass ${NGAY} (nút chung của way highway+name trong area phường)`,
  })));
  if (n) coDong++; tongDong += n;
  const hem = gl.filter((g) => g.loai_a === "hem" || g.loai_b === "hem").length;
  console.log(`  ${w.ten_day_du} (${w.quan_cu}): ${n} giao lộ — ${n - hem} giữa đường, ${hem} có hẻm`);
  await nghi(3000);
}

if (!DRY) {
  const phuongCo = new Set((await tatCa("giao_lo?select=phuong&order=id")).map((d) => d.phuong));
  console.log(`\nĐã tra ${daTra} phường, ${coDong} có giao lộ, ghi/cập nhật ${tongDong} dòng.`);
  console.log(`Trong DB: ${phuongCo.size}/${wards.length} phường có ít nhất một giao lộ.`);
  if (!CHI_PHUONG && phuongCo.size < wards.length) console.log("→ CHƯA XONG: còn phường chưa có giao lộ — chạy lại với --thieu.");
} else {
  console.log(`\n[dry] đã tra ${daTra} phường, sẽ ghi ${tongDong} dòng.`);
}
