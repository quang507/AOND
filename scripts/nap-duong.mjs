// nap-duong.mjs — nạp TỪ ĐIỂN TÊN ĐƯỜNG `duong` (FR-212, migration 20260921b) từ OpenStreetMap.
//
// Chủ dự án 21/09/2026: "giờ khách viết tên đường ko dấu hoặc sai 1 vài kí tự nhận ra
// dc ko" → "ok làm bảng duong đi, hẻm bỏ".
//
// LẤY GÌ: `way["highway"]["name"]` trên Overpass API, theo từng PHƯỜNG/XÃ MỚI trong bảng
// `wards` (đa giác `admin_level=6`, tên khớp `wards.ten_day_du`) → mỗi tên đường có phường
// mới + quận cũ + tỉnh cũ. Tây Ninh mới (gồm Long An) và Đồng Nai mới tra theo đa giác
// tỉnh (`admin_level=4`), chưa gán phường (`phuong = ''`).
//
// LỌC — 30/09/2026 đổi (chủ dự án: "còn mấy hẻm khác còn nhiều / nhỏ và nhỏ hơn nữa … kết hợp với vị trí nữa, để
// biết đường nào gần đường nào"): GIỮ đường số ("Đường số 59", "Đường N1") và hẻm ("Hẻm 137 Lê Văn Sỹ", "Hẻm 137/28")
// với cột loai / so_hem / duong_me, kèm TOẠ ĐỘ tâm (trung bình tâm các đoạn cùng tên trong phường). Luật phân loại ở
// scripts/lib/phan-loai-duong.mjs (bài kiểm bot/tests/phan-loai-duong.mjs). Vẫn bỏ cầu / lối / nhánh / tên rác.
// Tây Ninh / Đồng Nai (tra theo tỉnh, không gán phường): chỉ giữ tên riêng như trước — đường số, hẻm không có phường
// đi kèm thì đúng là mơ hồ.
//
//   node scripts/nap-duong.mjs                 # cả ba tỉnh
//   node scripts/nap-duong.mjs --tinh "TP.HCM" # một tỉnh
//   node scripts/nap-duong.mjs --phuong "Phường Phú Định"   # một phường (thử / vá)
//   node scripts/nap-duong.mjs --dry           # xem trước, không ghi DB
//   node scripts/nap-duong.mjs --thieu         # chỉ tra phường / tỉnh chưa có dòng nào (chạy bù; workflow dùng cờ này)
//
// Cần SUPABASE_SERVICE_ROLE_KEY trong scripts/.env (bảng chỉ service_role đọc/ghi). Đi
// chậm có chủ đích: 1 truy vấn / 2 giây, lỗi 429/504 thì chờ rồi thử lại tối đa 4 lần —
// Overpass công cộng từ chối khi bị đấm dồn (lượt 21/09: bắn 168 phường một lúc, 101 hỏng).
// Chạy lại được: upsert theo khoá (ten, tinh, phuong).
// Cuối cùng ĐỐI CHIẾU số phường có dòng ↔ số phường đã tra rồi mới báo xong (NFR-18: một
// lượt PUT trả 200 không có nghĩa là dữ liệu nằm trong bảng).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gomDuong, locTheoTamPhuong } from "./lib/phan-loai-duong.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(HERE, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const URL_DB = env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error("Thiếu SUPABASE_SERVICE_ROLE_KEY trong scripts/.env"); process.exit(2); }
// 08/10/2026: kumi trả 500 hàng loạt (100/170 đa giác hụt) — lượt hụt ở máy này thì lượt thử lại đổi sang máy kế.
const OVERPASS_DS = env.OVERPASS_URL ? [env.OVERPASS_URL]
  : ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const UA = "nhadat.cc nap-duong (lien he: explore@nhadat.company)";
const NGAY = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const co = (t) => args.includes(t);
const lay = (t) => { const i = args.indexOf(t); return i >= 0 ? args[i + 1] : null; };
const DRY = co("--dry");
const CHI_TINH = lay("--tinh");
const CHI_PHUONG = lay("--phuong");
const CHI_THIEU = co("--thieu"); // chỉ tra phường/tỉnh chưa có dòng nào trong DB (chạy bù sau lượt hụt)
// Hộp bao TP.HCM mới (gồm Bình Dương + Bà Rịa – Vũng Tàu) — chặn phường trùng tên ở tỉnh khác.
const BBOX_HCM = "10.30,106.30,11.50,107.70";
// 12/10/2026 (SRS-5.1zzzzzf): Đặc khu Côn Đảo (~8,7°N) nằm ngoài hộp bao đất liền → lượt 12/10 ra 0 dòng, 167/168 phường. Phường
// nằm ngoài hộp chung có hộp riêng; vẫn giữ phép "đúng một đa giác cùng tên" bên dưới.
const BBOX_RIENG = { "Đặc khu Côn Đảo": "8.55,106.45,8.85,106.75" };
const TINH_LON = [["Tây Ninh", "Tỉnh Tây Ninh"], ["Đồng Nai", "Thành phố Đồng Nai"]];

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, lan = 0) {
  const url = `${OVERPASS_DS[lan % OVERPASS_DS.length]}?data=${encodeURIComponent(query)}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.status === 429 || r.status === 504 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
    if (!r.ok) { console.error(`  ! Overpass ${r.status}`); return null; }
    return await r.text();
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
  // Prefer return=minimal trả 201 thân rỗng (không chỉ 204) — đọc chữ trước, rỗng thì thôi.
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function ghi(rows) {
  if (!rows.length) return 0;
  if (DRY) return rows.length;
  for (let i = 0; i < rows.length; i += 500) {
    await rest("duong?on_conflict=ten,tinh,phuong", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
  }
  return rows.length;
}

// PostgREST trả tối đa 1.000 dòng một lượt (max-rows): đọc theo trang, không thì đếm ra đúng 1.000 (lượt 08/10 báo
// "591 + 267 + 142" — tổng tròn 1.000 trong khi đã ghi 16.614 dòng).
async function tatCa(path) {
  const ra = [];
  for (let tu = 0; ; tu += 1000) {
    const trang = await rest(path, { headers: { Range: `${tu}-${tu + 999}` } });
    ra.push(...trang);
    if (trang.length < 1000) return ra;
  }
}
const wards = await rest("wards?select=ten_day_du,quan_cu,tinh_cu,lat,lng&order=ten_day_du");
const daCo = CHI_THIEU ? await tatCa("duong?select=tinh,phuong&order=id") : [];
const phuongDaCo = new Set(daCo.filter((d) => d.phuong).map((d) => d.phuong));
const tinhDaCo = new Set(daCo.filter((d) => !d.phuong).map((d) => d.tinh));
let daTra = 0, coDong = 0, tongDong = 0;

// 1) TP.HCM mới — từng phường/xã trong `wards`.
if (!CHI_TINH || CHI_TINH === "TP.HCM") {
  for (const w of wards) {
    if (CHI_PHUONG && w.ten_day_du !== CHI_PHUONG) continue;
    if (CHI_THIEU && phuongDaCo.has(w.ten_day_du)) continue;
    const q = `[out:csv(name,::type,::lat,::lon;false)][timeout:180];area["admin_level"="6"]["name"="${w.ten_day_du}"]->.a;way(area.a)(${BBOX_RIENG[w.ten_day_du] ?? BBOX_HCM})["highway"]["name"];out center tags;.a out;`;
    const csv = await overpass(q); daTra++;
    if (csv == null) { console.log(`  ✗ ${w.ten_day_du}: không có trả lời`); await nghi(2000); continue; }
    const { dong, soArea } = gomDuong(csv);
    if (soArea !== 1) { console.log(`  ✗ ${w.ten_day_du}: ${soArea} đa giác cùng tên trong hộp bao — bỏ, cần soi tay`); await nghi(2000); continue; }
    // SRS-5.1zzzzzzz186: đa giác trùng tên ở tỉnh khác (Phường Tân Phú vs huyện Tân Phú, Đồng Nai) kéo đường cách tâm phường ~100 km vào.
    const { giu, bo } = locTheoTamPhuong(dong, w);
    if (bo.length) console.log(`  ! ${w.ten_day_du}: bỏ ${bo.length} dòng cách tâm phường > 50 km (${bo.slice(0, 3).map((x) => x.ten).join("; ")}…)`);
    const n = await ghi(giu.map((x) => ({ ...x, tinh: "TP.HCM", tinh_cu: w.tinh_cu, phuong: w.ten_day_du, quan_cu: w.quan_cu, nguon: `OSM Overpass ${NGAY} (way highway+name trong area phường, out center)` })));
    if (n) coDong++; tongDong += n;
    const dem = (l) => giu.filter((x) => x.loai === l).length;
    console.log(`  ${w.ten_day_du} (${w.quan_cu}): ${n} dòng — ${dem("duong")} đường, ${dem("so")} đường số, ${dem("hem")} hẻm`);
    await nghi(2000);
  }
}
// 2) Tây Ninh mới, Đồng Nai mới — theo đa giác tỉnh, chưa gán phường.
for (const [tinh, tenOsm] of TINH_LON) {
  if (CHI_PHUONG || (CHI_TINH && CHI_TINH !== tinh) || (CHI_THIEU && tinhDaCo.has(tinh))) continue;
  const q = `[out:csv(name,::type,::lat,::lon;false)][timeout:900];area["admin_level"="4"]["name"="${tenOsm}"]->.a;way(area.a)["highway"]["name"];out center tags;.a out;`;
  const csv = await overpass(q); daTra++;
  if (csv == null) { console.log(`  ✗ ${tenOsm}: không có trả lời`); continue; }
  const { dong } = gomDuong(csv);
  const n = await ghi(dong.filter((x) => x.loai === "duong").map((x) => ({ ...x, tinh, tinh_cu: null, phuong: "", quan_cu: null, nguon: `OSM Overpass ${NGAY} (way highway+name trong area tỉnh, out center)` })));
  if (n) coDong++; tongDong += n;
  console.log(`  ${tenOsm}: ${n} tên đường`);
}

// 3) Đối chiếu: đếm trong DB theo tỉnh và số phường có dòng.
if (!DRY) {
  const dem = await tatCa("duong?select=tinh,phuong&order=id");
  const theoTinh = {}; const phuongCo = new Set();
  for (const d of dem) { theoTinh[d.tinh] = (theoTinh[d.tinh] ?? 0) + 1; if (d.phuong) phuongCo.add(d.phuong); }
  console.log(`\nĐã tra ${daTra} đa giác, ${coDong} có dữ liệu, ghi/cập nhật ${tongDong} dòng.`);
  console.log(`Trong DB: ${JSON.stringify(theoTinh)}; ${phuongCo.size}/${wards.length} phường của wards có ít nhất một tên đường.`);
  if (phuongCo.size < wards.length) console.log("→ CHƯA XONG: còn phường không có dòng nào — chạy lại với --phuong \"<tên>\" hoặc soi tay.");
} else {
  console.log(`\n[dry] đã tra ${daTra} đa giác, sẽ ghi ${tongDong} dòng.`);
}
