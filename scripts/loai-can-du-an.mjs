// loai-can-du-an.mjs — bóc LOẠI CĂN từ bài giới thiệu dự án trên mogi.vn (docs/07 SRS-5.1zzzzzzz35).
//
// mogi không có ô loại căn / mặt bằng có cấu trúc (`FloorImages` rỗng, phần còn lại sau đăng nhập — soát 18/10/2026);
// loại căn chỉ nằm trong các dòng liệt kê của bài giới thiệu, kiểu "Căn hộ 2 phòng ngủ: Diện tích từ 51m² - 53m²"
// hay "2PN + 2WC góc". Ở đây chỉ lấy DỮ KIỆN (tên loại + dải diện tích), không chép câu văn của nguồn.
//
// Luật thà trống còn hơn sai:
//  - chỉ đọc trong khối giới thiệu (`id="project-intro"` → khối kế tiếp), không đọc menu / chân trang ("Cho thuê căn hộ…");
//  - dòng phải MỞ ĐẦU bằng loại căn (sau "Căn hộ" / "Loại" / gạch đầu dòng), và là dòng liệt kê: có ":" hoặc "-" ngay
//    sau tên loại, hoặc có diện tích, hoặc ngắn ≤ 40 ký tự. Câu văn kể chuyện ("Shophouse tại khu … được thiết kế …")
//    không tính;
//  - một dòng nêu nhiều loại thì ghi tên các loại, KHÔNG gán diện tích (không biết số nào của loại nào);
//  - diện tích ngoài khoảng hợp lý của loại (căn hộ 15–1.000 m², shophouse / sky villa 20–2.000 m²)
//    thì bỏ cả dòng đó.
// Không lấy giá: giá trong bài giới thiệu hay cũ, và lẫn giá bán với giá thuê.

const KHOI_SAU = ["hinh-anh-thuc-te", "mua-ban-cho-thue", "bieu-do-gia-can", "thi-truong-noi-gi", "section-investor", "tai-lieu-phan-tich"];

const LOAI_KHAC = [
  { re: /^studio\b/i, khoa: "studio", ten: "Studio", lon: false },
  { re: /^duplex\b/i, khoa: "duplex", ten: "Duplex", lon: false },
  { re: /^penthouse\b/i, khoa: "penthouse", ten: "Penthouse", lon: false },
  { re: /^officetel\b/i, khoa: "officetel", ten: "Officetel", lon: false },
  { re: /^dual\s*key\b/i, khoa: "dualkey", ten: "Dual Key", lon: false },
  { re: /^shophouse\b/i, khoa: "shophouse", ten: "Shophouse", lon: true },
  { re: /^sky\s*villa\b/i, khoa: "skyvilla", ten: "Sky Villa", lon: true },
];
const THU_TU = ["studio", "1pn", "2pn", "3pn", "4pn", "5pn", "duplex", "penthouse", "officetel", "dualkey", "shophouse", "skyvilla"];

const PN = /(\d)\s*(?:pn\b|phòng ngủ|phong ngu)/gi;

function khoiGioiThieu(html) {
  const id = html.indexOf('id="project-intro"');
  if (id < 0) return "";
  const dau = html.indexOf(">", id) + 1; // cắt SAU thẻ mở — không thì đuôi thẻ dính vào dòng đầu và dòng đó không bao giờ khớp
  const cuoi = KHOI_SAU.map((id) => html.indexOf(`id="${id}"`, dau)).filter((i) => i > dau);
  return html.slice(dau, cuoi.length ? Math.min(...cuoi) : dau + 80000);
}

function thanhDong(khoi) {
  return khoi
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<sup>2<\/sup>/gi, "²")
    .replace(/<(?:br|\/p|\/li|\/tr|\/h\d|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&sup2;/g, "²").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 3 && l.length <= 300);
}

// "41,65" → 41.65; "1.000" → 1000 (dấu chấm / phẩy trước đúng 3 chữ số là phân cách nghìn).
const so = (s) => (/[.,]\d{3}$/.test(s) ? Number(s.replace(/[.,]/g, "")) : Number(s.replace(",", ".")));

function dienTich(dong) {
  const ra = [];
  const SO = String.raw`(\d+(?:[.,]\d+)?)`;
  const DV = String.raw`\s*(?:m²|m2)`;
  for (const m of dong.matchAll(new RegExp(`${SO}(?:${DV})?\\s*(?:-|–|đến|tới|~)\\s*${SO}${DV}`, "gi"))) ra.push(so(m[1]), so(m[2]));
  for (const m of dong.matchAll(new RegExp(`${SO}${DV}`, "gi"))) ra.push(so(m[1]));
  return ra.filter((x) => Number.isFinite(x) && x > 0);
}

/** Loại căn ở đầu dòng (sau "Căn hộ" / "Loại" / gạch đầu dòng), hoặc null. */
function loaiDauDong(dong) {
  const than = dong.replace(/^[-–•+*·\s]+/, "").replace(/^(?:căn hộ|can ho|loại|loai|căn)\s+/i, "");
  const pn = /^(\d)\s*(?:pn\b|phòng ngủ|phong ngu)/i.exec(than);
  if (pn) return { khoa: `${pn[1]}pn`, ten: `${pn[1]} phòng ngủ`, lon: false, sauTen: than.slice(pn[0].length), so_pn: pn[1] };
  for (const l of LOAI_KHAC) {
    const m = l.re.exec(than);
    if (m) return { ...l, sauTen: than.slice(m[0].length) };
  }
  return null;
}

const dep = (x) => String(Math.round(x * 100) / 100).replace(".", ",");

/** html trang chi tiết mogi → [{ name, specs: { dien_tich?, so_phong_ngu? } }] (khuôn `unit_types` của web). */
export function bocLoaiCan(html) {
  const gom = new Map();
  for (const dong of thanhDong(khoiGioiThieu(String(html ?? "")))) {
    const loai = loaiDauDong(dong);
    if (!loai) continue;
    const dt = dienTich(dong);
    const laDongLietKe = /^\s*(?:[:\-–(]|\+\s*\d\s*wc)/i.test(loai.sauTen) || dt.length > 0 || dong.length <= 40;
    if (!laDongLietKe) continue;
    const nhieuLoai = new Set([...dong.matchAll(PN)].map((m) => m[1])).size > 1;
    const lay = (khoa, ten, so_pn) => {
      if (!gom.has(khoa)) gom.set(khoa, { ten, so_pn, dt: [] });
      return gom.get(khoa);
    };
    if (nhieuLoai) {
      for (const m of dong.matchAll(PN)) lay(`${m[1]}pn`, `${m[1]} phòng ngủ`, m[1]);
      continue;
    }
    const o = lay(loai.khoa, loai.ten, loai.so_pn);
    // Một số trong dòng lệch khoảng thì bỏ cả dòng — bỏ nửa dải ("233 – 670 m2" → "233 m2") là in sai.
    const tran = loai.lon ? 2000 : 1000, san = loai.lon ? 20 : 15;
    if (dt.every((x) => x >= san && x <= tran)) o.dt.push(...dt);
  }
  return [...gom.entries()]
    .sort((a, b) => THU_TU.indexOf(a[0]) - THU_TU.indexOf(b[0]))
    .slice(0, 12)
    .map(([, o]) => {
      const specs = {};
      if (o.dt.length) {
        const nho = Math.min(...o.dt), lon = Math.max(...o.dt);
        specs.dien_tich = nho === lon ? `${dep(nho)} m2` : `${dep(nho)} - ${dep(lon)} m2`;
      }
      if (o.so_pn) specs.so_phong_ngu = o.so_pn;
      return { name: o.ten, specs };
    });
}
