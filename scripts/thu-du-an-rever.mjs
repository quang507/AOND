// thu-du-an-rever.mjs — LÀM GIÀU kho dự án từ rever.vn (chủ dự án 02/11/2026 chọn phương án "a": crawl theo luật mogi).
//
// LUẬT (giống `thu-du-an.mjs`, OPEN-56): chỉ lấy DỮ KIỆN — tên, trạng thái, địa chỉ, chủ đầu tư, loại hình, khoảng giá, bảng thông số
// (diện tích, số block / tầng / căn, mật độ, diện tích căn, năm khởi công, giao nhà, hình thức sở hữu), danh sách tiện ích nội khu, và
// GIÁ RAO GỘP từ giỏ hàng của dự án (số tin + giá/m² thấp / giữa / cao — không giữ từng tin, không SĐT, không tên môi giới, không ảnh).
// KHÔNG chép bài giới thiệu; `description` của dự án mới VIẾT LẠI từ dữ kiện; `source_url` giữ để truy nguồn.
// Chỉ nhận dự án trong vùng (`prompts.VUNG_NHAN_TIN`).
//
// GHÉP, KHÔNG ĐÈ: dự án đã có trong kho (khớp tên bỏ dấu + tỉnh, nhiều dòng thì khớp thêm quận) → thêm `specs.rever` và chỉ điền ô
// đang TRỐNG (chủ đầu tư, phường, bàn giao, tình trạng, tiện ích, giá dòng). Khớp mơ hồ → bỏ qua, in ra để soát tay. Chưa có → dòng
// mới `source = 'rever'`.
//
//   node scripts/thu-du-an-rever.mjs --dry                 # crawl + in thống kê, không ghi DB (không cần khoá)
//   node scripts/thu-du-an-rever.mjs --dry --gioi-han 20   # thử 20 dự án đầu
//   node scripts/thu-du-an-rever.mjs                       # ghi DB (cần scripts/.env, chạy qua apply-migration ô nap-du-an-rever)
//
// Đi chậm có chủ đích: một luồng, nghỉ ~0,9 s giữa các trang.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const co = (t) => args.includes(t);
const lay = (t, m) => { const i = args.indexOf(t); return i >= 0 ? args[i + 1] : m; };
const DRY = co("--dry");
const GIOI_HAN = Number(lay("--gioi-han", "0"));
const TRANG_TOI_DA = Number(lay("--trang", "200"));
const NGHI = Number(lay("--nghi", "900"));

const env = existsSync(join(HERE, ".env")) ? Object.fromEntries(
  readFileSync(join(HERE, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
) : {};
const URL_DB = env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const GOC = "https://rever.vn";
const HOM_NAY = new Date().toISOString().slice(0, 10);

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
export const goHtml = (s) => String(s ?? "")
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/<sup>2<\/sup>/g, "2").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();
export const boDau = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

async function tai(url, lan = 0) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "vi" } });
    if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    if (lan >= 3) { console.error(`  ! ${url}: ${e.message}`); return null; }
    await nghi(2000 * (lan + 1));
    return tai(url, lan + 1);
  }
}

// ── Vùng nhận tin (một nguồn: prompts.VUNG_NHAN_TIN / _TEN_TRONG_VUNG) ─────────────────────────────────────────
const TINH_TRONG_VUNG = [
  ["ho chi minh", "Hồ Chí Minh"], ["binh duong", "Bình Dương"], ["ba ria", "Bà Rịa - Vũng Tàu"], ["vung tau", "Bà Rịa - Vũng Tàu"],
  ["long an", "Long An"], ["tay ninh", "Tây Ninh"], ["dong nai", "Đồng Nai"],
];
export const tinhTrongVung = (tinh) => TINH_TRONG_VUNG.find(([k]) => boDau(tinh).includes(k))?.[1] ?? null;

// ── Danh sách dự án ───────────────────────────────────────────────────────────────────────────────────────────
async function danhSach() {
  const ds = new Set();
  for (let p = 1; p <= TRANG_TOI_DA; p++) {
    const html = await tai(`${GOC}/du-an?page=${p}`);
    if (!html) break;
    const truoc = ds.size;
    for (const m of html.matchAll(/href="\/du-an\/([a-z0-9-]+)"/g)) ds.add(m[1]);
    process.stdout.write(`\r  danh sách: trang ${p}, ${ds.size} dự án`);
    if (ds.size === truoc) break;          // hết trang: không thêm được dự án mới
    if (GIOI_HAN && ds.size >= GIOI_HAN) break;
    await nghi(NGHI);
  }
  console.log("");
  return [...ds].slice(0, GIOI_HAN || undefined);
}

// ── Trang chi tiết → dữ kiện (hai mẫu trang Rever dùng chung khối `p.left` / `.right`) ─────────────────────────
const RONG = /^(đang cập nhật|0|0%|-)$/i;
const giaTrieu = (s) => {   // "4.6 tỷ" → 4600 (triệu); "850 triệu" → 850; "15 triệu/tháng" → 15
  const t = boDau(s).replace(/,/g, ".");
  let m = /(\d+(?:\.\d+)?)\s*ty(?:\s*(\d+)\s*trieu)?/.exec(t);
  if (m) return parseFloat(m[1]) * 1000 + (m[2] ? +m[2] : 0);
  m = /(\d+(?:\.\d+)?)\s*trieu/.exec(t);
  return m ? parseFloat(m[1]) : null;
};
const giua = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
const lam = (x) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10);

export function bocChiTiet(html, slug) {
  const ten = goHtml(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]);
  if (!ten) return null;
  const dau = /<section class="block-header">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? "";
  const nhan = [...dau.matchAll(/<span class="badge[^"]*">([\s\S]*?)<\/span>/g)].map((m) => goHtml(m[1]))
    .filter((t) => t && !/rever|xác thực|phân phối/i.test(t));
  const diaChi = goHtml(/class="block-address[^"]*">([\s\S]*?)<\/a>/.exec(html)?.[1]);
  const phan = diaChi.split(",").map((x) => x.trim()).filter(Boolean);

  const sach = html.replace(/<!--[\s\S]*?-->/g, " ");
  const thongSo = {};
  for (const m of sach.matchAll(/<p class="left">([\s\S]*?)<\/p>\s*<(p|b)[^>]*class="[^"]*\bright\b[^"]*"[^>]*>([\s\S]*?)<\/\2>/g)) {
    const k = goHtml(m[1]).replace(/:$/, "");
    const items = [...m[3].matchAll(/list-utilities-item[^>]*>([\s\S]*?)<\/(?:span|a)>/g)].map((x) => goHtml(x[1])).filter(Boolean);
    const v = items.length ? [...new Set(items)].join(", ") : goHtml(m[3]);
    if (k && v && !RONG.test(v) && !(k in thongSo)) thongSo[k] = v;
  }
  const khoangGia = goHtml(/<span>Khoảng giá<\/span>[\s\S]*?class="value[^"]*">([\s\S]*?)<\/(?:div|p)>/.exec(sach)?.[1]).replace(/⁺/g, "+");
  // Nút "Xem chi tiết / Xem thêm" cũng là link /chu-dau-tu/ — lượt nạp 02/11/2026 ghi chúng vào chủ đầu tư của 591 dự án.
  const cdt = [...new Set([...sach.matchAll(/href="\/chu-dau-tu\/[^"]+"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => goHtml(m[1]))
    .filter((t) => t && !/^xem (chi tiết|thêm)$/i.test(t)))];

  const vungTi = /id="amenity"[\s\S]*?<\/view-more>/.exec(sach)?.[0] ?? "";
  const tienIch = [...new Set([...vungTi.matchAll(/<span class="value">([\s\S]*?)<\/span>/g)].map((m) => goHtml(m[1])).filter(Boolean))];

  // Giỏ hàng lúc tải trang: GỘP giá, không giữ từng tin.
  const ban = [], thue = [];
  for (const m of sach.matchAll(/<article class="card card-listing"[\s\S]*?<\/article>/g)) {
    const the = m[0];
    const gia = giaTrieu(goHtml(/card-listing-price[^>]*>([\s\S]*?)<\/a>/.exec(the)?.[1]));
    const dt = parseFloat((/(\d+(?:[.,]\d+)?)\s*m²/.exec(goHtml(the)) ?? [])[1]?.replace(",", "."));
    if (!gia) continue;
    // Tin rao của nguồn có ô gõ sai (La Pura 02/11/2026: "62633 m²" cho căn 62,6 m²) → bỏ diện tích ngoài 10–2.000 m², giá/m² ngoài 5–1.000 tr.
    if (/href="https:\/\/rever\.vn\/thue\//.test(the)) thue.push(gia);
    else if (dt >= 10 && dt <= 2000 && gia / dt >= 5 && gia / dt <= 1000) ban.push(gia / dt);
  }

  const R = {
    url: `${GOC}/du-an/${slug}`, ngay: HOM_NAY,
    ten, trang_thai: nhan.join(" · ") || thongSo["Trạng thái"] || null,
    dia_chi: diaChi || null,
    tinh: phan.at(-1) ?? null, quan: phan.at(-2) ?? null, phuong: phan.length >= 3 ? phan.at(-3) : null,
    chu_dau_tu: cdt.join(", ") || null,
    khoang_gia: khoangGia && !RONG.test(khoangGia) ? khoangGia : null,
    du_kien: {},
    tien_ich: tienIch,
  };
  const NHAN = {
    "Loại hình": "loại hình", "Hình thức sở hữu": "hình thức sở hữu", "Diện tích": "tổng diện tích", "Tổng diện tích": "tổng diện tích",
    "Qui mô dự án": "quy mô", "Số block": "số block", "Số tầng": "số tầng", "Số căn hộ": "số căn", "Mật độ xây dựng": "mật độ xây dựng",
    "Mật độ xây dựng (%)": "mật độ xây dựng", "Diện tích căn hộ": "diện tích căn", "Năm khởi công": "khởi công",
    "Thời gian giao nhà": "giao nhà", "Năm bàn giao": "giao nhà",
  };
  for (const [k, v] of Object.entries(thongSo)) if (NHAN[k] && !R.du_kien[NHAN[k]]) R.du_kien[NHAN[k]] = v;
  if (ban.length) {
    R.gia_rao_ban = { so_tin: ban.length, tr_m2_thap: lam(Math.min(...ban)), tr_m2_giua: lam(giua(ban)), tr_m2_cao: lam(Math.max(...ban)) };
  }
  if (thue.length) {
    R.gia_rao_thue = { so_tin: thue.length, tr_thang_thap: lam(Math.min(...thue)), tr_thang_giua: lam(giua(thue)), tr_thang_cao: lam(Math.max(...thue)) };
  }
  return R;
}

// ── Ghép với kho ────────────────────────────────────────────────────────────────────────────────────────────
export const khoaTen = (s) => boDau(String(s ?? "").replace(/\([^)]*\)/g, " "))
  .replace(/\b(du an|khu can ho|can ho|chung cu|khu do thi|khu dan cu)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();
const soQuan = (s) => boDau(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const boHanhChinh = (s) => soQuan(String(s ?? "").replace(/\([^)]*\)/g, " ")).replace(/^(huyen|quan|thanh pho|tp|thi xa|tinh)\s+/, "");

/** Các khoá tên của một dự án (02/11/2026, đo trên 26 dự án Rever: khớp nguyên tên chỉ 5/26): tên đủ, phần trước " - " ("Glory Heights -
 *  Vinhomes Grand Park", "IMPERIA SENSA PARK - MIK GROUP"), và tên bỏ quận / tỉnh dính đuôi ("Eco Retreat Long An", "Antares Beach Vũng Tàu"). */
export function cacKhoa(ten, quan, tinh) {
  const goc = [ten, String(ten ?? "").split(/\s+[-–|]\s+/)[0]];
  const duoi = [boHanhChinh(quan), boHanhChinh(tinh), "vung tau", "ba ria vung tau", "sai gon", "thu duc"].filter(Boolean);
  const ra = new Set();
  for (const g of goc) {
    let k = khoaTen(g);
    if (!k) continue;
    ra.add(k);
    for (let doi = true; doi;) {
      doi = false;
      for (const d of duoi) if (k.endsWith(` ${d}`) && k.length > d.length + 3) { k = k.slice(0, -d.length - 1).trim(); ra.add(k); doi = true; }
    }
  }
  return ra;
}

/** Chọn dòng kho cho một dự án Rever: trả {row} | {mo_ho: [...]} | null. */
export function chonDong(R, kho) {
  const k = cacKhoa(R.ten, R.quan, R.tinh);
  if (!k.size) return null;
  const tinh = tinhTrongVung(R.tinh);
  let ung = kho.filter((p) => (!p.province || !tinh || tinhTrongVung(p.province) === tinh) &&
    [...(p._khoa ??= cacKhoa(p.name, p.district, p.province))].some((x) => k.has(x)));
  if (ung.length <= 1) return ung.length ? { row: ung[0] } : null;
  const q = soQuan(R.quan);
  const cungQuan = q ? ung.filter((p) => ` ${soQuan(p.district)} `.includes(` ${q} `)) : [];   // "quận 1" không khớp "quận 12"
  if (cungQuan.length === 1) return { row: cungQuan[0] };
  return { mo_ho: ung.map((p) => `${p.name} · ${p.district ?? "?"} · ${p.slug}`) };
}

const trong = (v) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

export function vaGhep(row, R) {
  const vao = { specs: { ...(row.specs ?? {}), rever: R } };
  if (trong(row.developer) && R.chu_dau_tu) vao.developer = R.chu_dau_tu;
  if (trong(row.ward) && R.phuong) vao.ward = R.phuong;
  if (trong(row.status_text) && R.trang_thai) vao.status_text = R.trang_thai;
  if (trong(row.handover) && R.du_kien["giao nhà"]) vao.handover = R.du_kien["giao nhà"];
  if (trong(row.amenities) && R.tien_ich.length) vao.amenities = R.tien_ich;
  if (trong(row.specs?.gia_dong) && R.khoang_gia) vao.specs.gia_dong = R.khoang_gia;
  return vao;
}

const slugHoa = (s) => boDau(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

function vietMoTa(R) {
  const y = [`${R.ten}${R.chu_dau_tu ? ` do ${R.chu_dau_tu} làm chủ đầu tư` : ""}${R.dia_chi ? `, tại ${R.dia_chi}` : ""}.`];
  const dk = R.du_kien;
  const quyMo = ["tổng diện tích", "quy mô", "số block", "số tầng", "số căn"].filter((k) => dk[k]).map((k) => `${k} ${dk[k]}`);
  if (quyMo.length) y.push(`Quy mô: ${quyMo.join(", ")}.`);
  if (dk["loại hình"]) y.push(`Loại hình: ${dk["loại hình"]}.`);
  if (dk["diện tích căn"]) y.push(`Diện tích căn: ${dk["diện tích căn"]}.`);
  if (R.khoang_gia) y.push(`Giá tham khảo: ${R.khoang_gia}.`);
  if (R.trang_thai) y.push(`Tình trạng: ${R.trang_thai}.`);
  return y.join(" ");
}

export function dongMoi(R) {
  return {
    name: R.ten, slug: `${slugHoa(R.ten)}-rv`, developer: R.chu_dau_tu, province: tinhTrongVung(R.tinh) ?? R.tinh,
    district: R.quan, ward: R.phuong, location_raw: R.dia_chi, amenities: R.tien_ich,
    description: vietMoTa(R), status_text: R.trang_thai, handover: R.du_kien["giao nhà"] ?? null,
    specs: { gia_dong: R.khoang_gia, rever: R }, source: "rever", source_url: R.url, priority: 50,
  };
}

// ── DB ─────────────────────────────────────────────────────────────────────────────────────────────────────
const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });
async function docKho() {
  const ra = [];
  for (let tu = 0; ; tu += 1000) {
    const r = await fetch(`${URL_DB}/rest/v1/projects?select=id,name,slug,province,district,ward,developer,status_text,handover,amenities,specs&order=id&limit=1000&offset=${tu}`, { headers: H() });
    if (!r.ok) throw new Error(`đọc projects: HTTP ${r.status}`);
    const t = await r.json();
    ra.push(...t);
    if (t.length < 1000) return ra;
  }
}
async function sua(id, vao) {
  const r = await fetch(`${URL_DB}/rest/v1/projects?id=eq.${id}`, { method: "PATCH", headers: { ...H(), Prefer: "return=minimal" }, body: JSON.stringify(vao) });
  if (!r.ok) throw new Error(`sửa ${id}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}
async function them(rows) {
  const r = await fetch(`${URL_DB}/rest/v1/projects?on_conflict=slug`, { method: "POST", headers: { ...H(), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
  if (!r.ok) throw new Error(`thêm projects: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

// ── Chạy ───────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!DRY && !KEY) { console.error("Thiếu SUPABASE_SERVICE_ROLE_KEY trong scripts/.env (hoặc chạy --dry)"); process.exit(2); }
  const slugs = await danhSach();
  const thu = [];
  let ngoaiVung = 0;
  for (const [i, s] of slugs.entries()) {
    const html = await tai(`${GOC}/du-an/${s}`);
    const R = html ? bocChiTiet(html, s) : null;
    if (R && tinhTrongVung(R.tinh)) thu.push(R); else if (R) ngoaiVung++;
    process.stdout.write(`\r  chi tiết ${i + 1}/${slugs.length} · trong vùng ${thu.length} · ngoài vùng ${ngoaiVung}`);
    await nghi(NGHI);
  }
  console.log("");
  const ra = join(process.env.TMPDIR ?? "/tmp", `du-an-rever-${HOM_NAY}.json`);
  writeFileSync(ra, JSON.stringify(thu, null, 1));
  const dem = (f) => thu.filter(f).length;
  console.log(`${thu.length} dự án trong vùng → ${ra}`);
  console.log(`  có khoảng giá ${dem((r) => r.khoang_gia)} · có giá rao bán ${dem((r) => r.gia_rao_ban)} · có giá thuê ${dem((r) => r.gia_rao_thue)} · có tiện ích ${dem((r) => r.tien_ich.length)} · có chủ đầu tư ${dem((r) => r.chu_dau_tu)}`);

  if (DRY) {
    console.log(JSON.stringify(thu.slice(0, 2), null, 1));
  } else {
    const kho = await docKho();
    let ghep = 0; const moi = [], moHo = [];
    for (const R of thu) {
      const c = chonDong(R, kho);
      if (c?.row) { await sua(c.row.id, vaGhep(c.row, R)); ghep++; await nghi(60); }
      else if (c?.mo_ho) moHo.push(`${R.ten} (${R.quan}) ↔ ${c.mo_ho.join(" | ")}`);
      else moi.push(dongMoi(R));
    }
    const daCo = new Set();
    const moiSach = moi.filter((r) => !daCo.has(r.slug) && daCo.add(r.slug));
    for (let i = 0; i < moiSach.length; i += 100) await them(moiSach.slice(i, i + 100));
    console.log(`Ghép vào dòng có sẵn: ${ghep} · thêm mới: ${moiSach.length} · mơ hồ bỏ qua: ${moHo.length}`);
    for (const x of moHo) console.log(`  ? ${x}`);
  }
}
