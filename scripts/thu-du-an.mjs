// thu-du-an.mjs — dựng KHO DỰ ÁN cho bot (OPEN-56 / FR-114 d).
//
// Chủ dự án 10/09/2026: "crawl đi, lấy đúng các specs của họ luôn, lấy tối đa
// những gì mày có thể lấy" (nguồn mogi.vn, chủ dự án nói đó cũng là dự án của
// nhà mình).
//
// LẤY GÌ: DỮ KIỆN — tên, chủ đầu tư, tỉnh/quận/phường, địa chỉ, giá từ, đơn giá
// mỗi m2, tổng diện tích, dải diện tích sản phẩm, năm khởi công / hoàn thành,
// pháp lý, trạng thái, danh sách tiện ích, và link nguồn.
//
// KHÔNG chép nguyên bài giới thiệu và ảnh của trang nguồn: (1) đó là phần có
// bản quyền rõ nhất, (2) nội dung trùng lặp làm hại chính SEO của Aioinhadat —
// Google hạ trang chép lại chứ không hạ trang gốc. `description` được VIẾT LẠI
// từ các dữ kiện vừa bóc (hàm `viet_mo_ta`), `source_url` giữ để truy nguồn.
//
//   node scripts/thu-du-an.mjs            # năm tỉnh: HCM, Bình Dương, Đồng Nai, Long An, Tây Ninh
//   node scripts/thu-du-an.mjs --tinh long-an-cid40 --trang 3
//   node scripts/thu-du-an.mjs --dry      # xem trước, không ghi DB
//
// Cần SUPABASE_SERVICE_ROLE_KEY trong scripts/.env. Đi chậm có chủ đích
// (2 luồng, nghỉ giữa các lượt) để không đấm vào máy chủ nguồn.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(HERE, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const URL_DB = env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const GOC = "https://mogi.vn";

const args = process.argv.slice(2);
const co = (t) => args.includes(t);
const lay = (t, m) => { const i = args.indexOf(t); return i >= 0 ? args[i + 1] : m; };
const DRY = co("--dry");
const TINH = lay("--tinh", null);
// 08/10/2026: trần cũ 60 cắt HCM ở 60/162 trang (nạp được 865 thay vì ~2.400) — vòng tự dừng khi hết trang mới.
const TRANG_TOI_DA = Number(lay("--trang", "400"));

// Mã tỉnh mogi (cid) soát 08/10/2026 bằng tiêu đề trang /du-an/x-cidN — phần chữ trước "-cid" mogi bỏ qua.
const TEN_TINH = {
  "ho-chi-minh-cid30": "Hồ Chí Minh", "binh-duong-cid9": "Bình Dương", "dong-nai-cid19": "Đồng Nai",
  "long-an-cid40": "Long An", "tay-ninh-cid54": "Tây Ninh",
};
const TINH_LIST = TINH ? [TINH] : Object.keys(TEN_TINH);

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
const goHtml = (s) => String(s ?? "")
  .replace(/<sup>2<\/sup>/g, "2").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

async function tai(url, lan = 0) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "vi" } });
    if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    if (lan >= 3) { console.error(`  ! ${url}: ${e.message}`); return null; }
    await nghi(1500 * (lan + 1));
    return tai(url, lan + 1);
  }
}

// ── Trang danh sách của một tỉnh → danh sách đường dẫn dự án ────────────────
async function danhSach(tinh) {
  const duong = new Map();
  for (let cp = 1; cp <= TRANG_TOI_DA; cp++) {
    const html = await tai(`${GOC}/du-an/${tinh}${cp > 1 ? `?cp=${cp}` : ""}`);
    if (!html) break;
    const truoc = duong.size;
    // Mỗi thẻ card có: link, tên, CHỦ ĐẦU TƯ, "Quận, Tỉnh | Bàn giao: năm", giá.
    // Chủ đầu tư và năm bàn giao CHỈ có ở đây, trang chi tiết không in ra.
    for (const khoi of html.split('<div class="project clearfix">').slice(1)) {
      const m = /href="(\/[a-z0-9-]+-prj(\d+))"/.exec(khoi);
      if (!m) continue;
      const cdt = goHtml(/<div class="project-org">([\s\S]*?)<\/div>/.exec(khoi)?.[1]) || null;
      const dong = goHtml(/<div class="project-address">\s*(?:<div class="project-address">)?([\s\S]*?)<\/div>/.exec(khoi)?.[1]) || "";
      const banGiao = /Bàn giao:\s*([0-9]{4})/.exec(dong)?.[1] ?? null;
      const trangThai = /id="sale"/.test(khoi) ? (/id="lease"/.test(khoi) ? "đang bán · có cho thuê" : "đang bán") : null;
      duong.set(m[2], { url: GOC + m[1], chu_dau_tu: cdt, ban_giao: banGiao, trang_thai: trangThai });
    }
    if (duong.size === truoc) break; // hết trang: không thêm được dự án nào mới
    process.stdout.write(`\r  ${tinh}: trang ${cp}, ${duong.size} dự án`);
    await nghi(400);
  }
  console.log("");
  return [...duong.entries()].map(([id, v]) => ({ id, ...v }));
}

// ── Trang chi tiết → dữ kiện ────────────────────────────────────────────────
const soTuTien = (s) => {
  if (!s) return null;
  const t = s.toLowerCase().replace(/\./g, "").replace(/,/g, ".");
  let m = /(\d+(?:\.\d+)?)\s*tỷ(?:\s*(\d+)\s*triệu)?/.exec(t);
  if (m) return Math.round(parseFloat(m[1]) * 1e9 + (m[2] ? +m[2] * 1e6 : 0));
  m = /(\d+(?:\.\d+)?)\s*triệu/.exec(t);
  if (m) return Math.round(parseFloat(m[1]) * 1e6);
  return null;
};

function bocChiTiet(html, url) {
  // Hai kiểu trang (soát 08/10/2026): trang đầy đủ có `h1.project-title`; trang RÚT GỌN (vd PNT Court) chỉ có
  // `div.prj-title > h1` + một div địa chỉ, giá / chủ đầu tư / bàn giao để trống. Chỉ đọc kiểu đầu thì ~560/2.414 dự án
  // bị bỏ im lặng (HCM 1.159/1.613). Trang rút gọn vẫn cho TÊN + ĐỊA CHỈ — đủ để bot nhận ra tên dự án khách nói.
  const rutGon = /<div class="prj-title">\s*<h1>([\s\S]*?)<\/h1>\s*<div>([\s\S]*?)<\/div>/.exec(html);
  const ten = goHtml(/<h1 class="project-title">([\s\S]*?)<\/h1>/.exec(html)?.[1]) || goHtml(rutGon?.[1]);
  if (!ten) return null;
  const diaChi = goHtml(/<div class="project-address">([\s\S]*?)<\/div>/.exec(html)?.[1]) || goHtml(rutGon?.[2]);
  const giaDong = goHtml(/<div class="project-price">([\s\S]*?)<\/div>/.exec(html)?.[1]);

  const thongSo = {};
  for (const m of (/<ul class="info-general[^"]*">([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? "").matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const nhan = goHtml(/<span>([\s\S]*?)<\/span>/.exec(m[1])?.[1]);
    const giaTri = goHtml(m[1].replace(/<span>[\s\S]*?<\/span>/, ""));
    if (nhan && giaTri && !/đang cập nhật/i.test(giaTri)) thongSo[nhan] = giaTri;
  }

  // Chủ đầu tư: JSON-LD không có, lấy ở khối "Chủ đầu tư" trong trang.
  const cdt = goHtml(/Chủ đầu tư[:\s]*<\/[^>]+>\s*<[^>]*>([\s\S]{0,120}?)<\//.exec(html)?.[1]) ||
    goHtml(/<div class="investor[^"]*">([\s\S]{0,160}?)<\/div>/.exec(html)?.[1]) || null;

  // Tiện ích: các gạch đầu dòng trong phần giới thiệu — DỮ KIỆN, không phải văn.
  // Cắt ở chân trang: chân trang mogi cũng là các <li> (người chịu trách nhiệm, số giấy phép, địa chỉ văn phòng) — lượt
  // nạp 08/10/2026 ghi chúng vào `amenities` của mọi dự án.
  const chan = html.search(/class="footer/);
  const thanBai = (chan > 0 ? html.slice(0, chan) : html).replace(/<ul class="info-general[^"]*">[\s\S]*?<\/ul>/, " ");
  const tienIch = [...thanBai.matchAll(/<li>([^<][\s\S]{0,160}?)<\/li>/g)]
    .map((m) => goHtml(m[1]))
    .filter((t) => t.length >= 8 && t.length <= 140 && !/^(Trang chủ|Mogi|Dự án|Tìm |Đăng |Giá |Môi giới)/i.test(t))
    .filter((t) => !Object.values(thongSo).includes(t))
    .filter((t) => !/^(Tổng diện tích|Diện tích từ|Năm khởi công|Năm hoàn thành|Pháp lý hiện tại)/.test(t))
    .slice(0, 14);

  const giaM2 = /\((\d+)\s*-\s*(\d+)\s*triệu\/m2\)/.exec(giaDong ?? "");
  const dt = /(\d+(?:[.,]\d+)?)\s*m2\s*-\s*(\d+(?:[.,]\d+)?)\s*m2/.exec(thongSo["Diện tích từ"] ?? "");

  const phan = (diaChi ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const tinh = phan.at(-1) ?? null;
  const quan = phan.at(-2) ?? null;
  const phuong = phan.length >= 3 ? phan.at(-3) : null;

  return {
    ten, slug: url.split("/").pop(), url,
    chu_dau_tu: cdt, dia_chi: diaChi, tinh, quan, phuong,
    gia_tu: soTuTien(giaDong), gia_dong: giaDong || null,
    gia_m2_min: giaM2 ? +giaM2[1] * 1e6 : null,
    gia_m2_max: giaM2 ? +giaM2[2] * 1e6 : null,
    tong_dien_tich: thongSo["Tổng diện tích"] ?? null,
    dien_tich_tu: dt ? parseFloat(dt[1].replace(",", ".")) : null,
    dien_tich_den: dt ? parseFloat(dt[2].replace(",", ".")) : null,
    nam_khoi_cong: thongSo["Năm khởi công"] ?? null,
    nam_hoan_thanh: thongSo["Năm hoàn thành"] ?? null,
    phap_ly: thongSo["Pháp lý hiện tại"] ?? null,
    tien_ich: tienIch,
  };
}

/** Mô tả VIẾT LẠI từ dữ kiện — không chép văn của nguồn. */
function vietMoTa(d) {
  const y = [];
  y.push(`${d.ten}${d.chu_dau_tu ? ` do ${d.chu_dau_tu} làm chủ đầu tư` : ""}${d.dia_chi ? `, tại ${d.dia_chi}` : ""}.`);
  const quyMo = [];
  if (d.tong_dien_tich) quyMo.push(`tổng diện tích ${d.tong_dien_tich}`);
  if (d.dien_tich_tu) quyMo.push(`sản phẩm ${d.dien_tich_tu}-${d.dien_tich_den} m2`);
  if (quyMo.length) y.push(`Quy mô: ${quyMo.join(", ")}.`);
  const gia = [];
  if (d.gia_dong) gia.push(d.gia_dong.replace(/^Giá từ\s*/i, "giá từ "));
  if (gia.length) y.push(`Giá: ${gia.join(" ")}.`);
  if (d.phap_ly) y.push(`Pháp lý: ${d.phap_ly}.`);
  const nam = d.ban_giao ?? d.nam_hoan_thanh;
  if (nam) y.push(`Bàn giao ${nam}.`);
  if (d.trang_thai) y.push(`Trạng thái: ${d.trang_thai}.`);
  return y.join(" ");
}

const slugHoa = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);

async function ghiDB(rows) {
  const r = await fetch(`${URL_DB}/rest/v1/projects?on_conflict=slug`, {
    method: "POST",
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`ghi projects: HTTP ${r.status} ${(await r.text()).slice(0, 400)}`);
}

// ── Chạy ────────────────────────────────────────────────────────────────────
const tatCa = [];
for (const tinh of TINH_LIST) {
  console.log(`\n▸ ${TEN_TINH[tinh] ?? tinh}`);
  const ds = await danhSach(tinh);
  let n = 0;
  for (let i = 0; i < ds.length; i += 2) {
    const lo = ds.slice(i, i + 2);
    const kq = await Promise.all(lo.map(async (m) => {
      const html = await tai(m.url);
      const d = html ? bocChiTiet(html, m.url) : null;
      if (d) {
        d.chu_dau_tu = d.chu_dau_tu ?? m.chu_dau_tu ?? null;
        d.ban_giao = m.ban_giao ?? (d.nam_hoan_thanh && /^\d{4}$/.test(d.nam_hoan_thanh) ? d.nam_hoan_thanh : null);
        d.trang_thai = m.trang_thai ?? null;
      }
      return d;
    }));
    for (const d of kq) {
      if (!d) continue;
      d.tinh_nguon = TEN_TINH[tinh] ?? d.tinh;
      tatCa.push(d);
      n++;
    }
    process.stdout.write(`\r  bóc ${n}/${ds.length}`);
    await nghi(350);
  }
  console.log("");
}

const daCo = new Set();
const rows = tatCa.map((d) => ({
  name: d.ten,
  slug: slugHoa(d.slug || d.ten),
  developer: d.chu_dau_tu,
  province: d.tinh_nguon ?? d.tinh,
  district: d.quan,
  ward: d.phuong,
  location_raw: d.dia_chi,
  legal_status: d.phap_ly,
  price_min: d.gia_tu,
  amenities: d.tien_ich,
  description: vietMoTa(d),
  status_text: d.trang_thai ?? (d.ban_giao ? `bàn giao ${d.ban_giao}` : null),
  handover: d.ban_giao ?? d.nam_hoan_thanh,
  specs: {
    tong_dien_tich: d.tong_dien_tich, dien_tich_tu_m2: d.dien_tich_tu, dien_tich_den_m2: d.dien_tich_den,
    gia_m2_min: d.gia_m2_min, gia_m2_max: d.gia_m2_max, nam_khoi_cong: d.nam_khoi_cong,
    nam_hoan_thanh: d.nam_hoan_thanh, ban_giao: d.ban_giao, gia_dong: d.gia_dong,
  },
  source: "mogi",
  source_url: d.url,
  priority: 50,
})).filter((r) => {
  // Một dự án có thể nằm ở hai trang tỉnh; hai dòng cùng slug trong một mẻ upsert làm Postgres từ chối cả mẻ.
  if (daCo.has(r.slug)) return false;
  daCo.add(r.slug);
  return true;
});

// 11/09/2026: bỏ sao lưu → không còn thư mục nhadat-backup. Bản chụp dự án
// crawl được ghi ra thư mục tạm của máy — chỉ để soi lại, không phải sao lưu.
const ra = join(process.env.TMPDIR ?? process.env.TEMP ?? "/tmp", `du-an-${new Date().toISOString().slice(0, 10)}.json`);
mkdirSync(dirname(ra), { recursive: true });
writeFileSync(ra, JSON.stringify(rows, null, 1));
console.log(`\n${rows.length} dự án → ${ra}`);

if (DRY) {
  console.log(JSON.stringify(rows.slice(0, 2), null, 1));
} else {
  for (let i = 0; i < rows.length; i += 100) {
    await ghiDB(rows.slice(i, i + 100));
    process.stdout.write(`\r  ghi DB ${Math.min(i + 100, rows.length)}/${rows.length}`);
  }
  console.log("\nXong.");
}
