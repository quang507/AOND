// geocode.ts — phần THUẦN của geocode-listings (11/09/2026): dựng câu tra
// Nominatim, đọc điểm OSM từ Overpass, đo khoảng cách. Tách khỏi index.ts để
// test chạy được mà không cần Deno.serve hay mạng.
import { kdTen, type LoaiTienIch } from "./extraction/tien-ich.ts";

export type TinCanToaDo = {
  location_raw: string | null;
  street: string | null;
  ward: string | null;
  district: string | null;
  /** boc_tach.quan_mac_dinh: quận là "Quận 5" do thiếu, không phải chủ nhà nói. */
  quan_mac_dinh: boolean;
};

/**
 * duong = tâm một đoạn đường (đủ cho "cách 1 km"); phuong = tâm phường (không đủ);
 * quan = tâm quận/huyện (14/09/2026: tin CHỈ nói huyện, vd "bán đất Củ Chi" — trước
 * đó không vào hàng tra, nằm không toạ độ mãi). Hai mức sau không dùng cho tìm gần
 * mốc (`tin_gan_moc` chỉ nhận duong/du_an/tay) và không nạp tiện ích.
 */
export type MucToaDo = "duong" | "phuong" | "quan";
export type CauTra = { q: string; muc: MucToaDo };

const boDau = (s: string): string =>
  s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");

// Quận/huyện thuộc TỈNH khác (vungNgoai lân cận, dia_ban.ts) — đuôi "Việt Nam"
// thay cho "Thành phố Hồ Chí Minh". Bình Dương, BR-VT về TP.HCM từ 07/2025
// nhưng người bán vẫn gọi tên cũ, Nominatim hiểu cả hai.
const TINH_NGOAI_RE = /\b(long an|tay ninh|dong nai|tien giang|ben tre|dong thap|vinh long|can tho|lam dong)\b/i;

/**
 * Tên đường từ địa chỉ tự do, BỎ SỐ NHÀ: "hẻm 12 Hồ Ngọc Lãm, P.An Lạc" →
 * "Hồ Ngọc Lãm". Toạ độ lưu chỉ tới mức đường — /ban-do công khai hứa "chấm
 * theo đường/hẻm, chưa tới số nhà".
 */
export function tenDuong(raw: string): string {
  let s = (raw ?? "").normalize("NFC").split(/[,;(\n]/)[0];
  for (let i = 0; i < 3; i++) {
    const truoc = s;
    s = s
      .replace(/^\s*(?:nhà|nha|mặt tiền|mat tien|mt|mặt phố|mat pho|mặt đường|mat duong)\s+/i, "")
      .replace(/^\s*(?:số|so|sn)\s*(?=\d)/i, "")
      .replace(/^\s*(?:hẻm|hem|hẽm|kiệt|kiet|ngõ|ngo|ngách|ngach|hxh|hxm|hxt)\s*/i, "")
      .replace(/^\s*\d+[a-z]?(?:\s*\/\s*\d+[a-z]?)*\s+/i, "");
    if (s === truoc) break;
  }
  s = s.replace(/\s+/g, " ").trim();
  return /[a-zA-ZÀ-ỹđĐ]{2}/.test(s) ? s : "";
}

/** "Đường số 7", "đường 10": trùng khắp thành phố, không tra được khi bỏ phường/quận. */
const DUONG_CHUNG_RE = /^(?:đường|duong)?\s*(?:số|so)?\s*\d+[a-z]?$/i;

/**
 * Câu tra Nominatim, hẹp trước rộng sau; mỗi câu kèm mức toạ độ nó cho ra.
 *
 * 11/09/2026: TP.HCM trên OSM không còn ranh giới quận (sáp nhập 07/2025) — câu
 * có "Quận 8" hay trả rỗng. Thử thật: "Ho Ngoc Lam, Ho Chi Minh City" →
 * 10.7229, 106.6107; tra ngược ra "Phường An Lạc, Thành phố Hồ Chí Minh",
 * không có quận. Nên thêm nấc KHÔNG QUẬN và nấc KHÔNG DẤU.
 * Bỏ hẳn mặc định "Quận 5" cũ: quận không rõ thì đừng bịa ra quận.
 */
export function queriesFor(l: TinCanToaDo): CauTra[] {
  const out: CauTra[] = [];
  const them = (parts: Array<string | null | undefined>, muc: MucToaDo) => {
    const q = parts.map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
    if (q && !out.some((x) => x.q === q)) out.push({ q, muc });
  };
  const duong = (l.street ?? "").trim() || tenDuong(l.location_raw ?? "");
  const quan = l.quan_mac_dinh ? "" : (l.district ?? "").trim();
  const ngoai = TINH_NGOAI_RE.test(boDau(quan));
  const tp = ngoai ? "Việt Nam" : "Thành phố Hồ Chí Minh";
  const tpKd = ngoai ? "Vietnam" : "Ho Chi Minh City";
  const phuong = (l.ward ?? "").trim();
  if (duong) {
    const chung = DUONG_CHUNG_RE.test(duong);
    const duongKd = boDau(duong.replace(/^(?:đường|duong)\s+(?!(?:số|so)?\s*\d)/i, ""));
    if (!chung) {
      them([duong, phuong, quan, tp], "duong");
      them([duong, quan, tp], "duong");
      them([duong, tp], "duong");
      them([duongKd, tpKd], "duong");
    } else if (phuong) {
      // "Đường số 7" có ở mọi phường — không có phường thì không tra mức đường.
      them([duong, phuong, quan, tp], "duong");
      them([boDau(duong), boDau(phuong), tpKd], "duong");
    }
  }
  if (phuong) {
    them([phuong, quan, tp], "phuong");
    them([boDau(phuong), boDau(quan), tpKd], "phuong");
  }
  // Chỉ có quận/huyện (không đường, không phường): tâm quận/huyện. Có đường/phường mà
  // tra hỏng thì KHÔNG lùi về tâm quận — tin sẽ đứng ở mức thô đó mãi, lượt sau không
  // tra lại mức tốt hơn.
  if (!duong && !phuong && quan) {
    them([quan, tp], "quan");
    them([boDau(quan), tpKd], "quan");
  }
  return out;
}

export type DuAnCanToaDo = {
  name: string | null; location_raw: string | null; ward: string | null; district: string | null;
};

/**
 * Câu tra cho DỰ ÁN (11/09/2026 — khách nói "gần Ehome 3", "gần Landmark 81"
 * thì mốc là dự án). TÊN trước — Nominatim biết nhiều khu căn hộ theo tên —
 * rồi mới tới địa chỉ. Địa chỉ dự án là thông tin công khai nên giữ số nhà.
 * "Glory Heights - Vinhomes Grand Park" → tra "Glory Heights".
 */
export function queriesDuAn(p: DuAnCanToaDo): CauTra[] {
  const out: CauTra[] = [];
  const them = (parts: string[]) => {
    const q = parts.map((x) => x.trim()).filter(Boolean).join(", ");
    if (q && !out.some((x) => x.q === q)) out.push({ q, muc: "duong" });
  };
  const quan = (p.district ?? "").replace(/\([^)]*\)/g, "").trim();
  const ngoai = TINH_NGOAI_RE.test(boDau(quan));
  const tp = ngoai ? "Việt Nam" : "Thành phố Hồ Chí Minh";
  const tpKd = ngoai ? "Vietnam" : "Ho Chi Minh City";
  const ten = (p.name ?? "").normalize("NFC").split(/\s+[-–]\s+/)[0].trim();
  if (ten.length >= 3) {
    them([ten, tp]);
    them([boDau(ten), tpKd]);
  }
  const dc = (p.location_raw ?? "").normalize("NFC").split(",")[0].trim();
  if (/[a-zA-ZÀ-ỹđĐ]{2}/.test(dc)) {
    them([dc, tp]);
    const d = tenDuong(dc);
    if (d && !DUONG_CHUNG_RE.test(d)) {
      them([d, tp]);
      them([boDau(d), tpKd]);
    }
  }
  return out;
}

/** Điểm Nominatim trả về có nằm trong vùng hợp lý không (chặn trùng tên đường ở tỉnh xa). */
export function trongVung(lat: number, lng: number, ngoaiTp = false): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return ngoaiTp
    ? lat > 9.2 && lat < 12.6 && lng > 104.4 && lng < 108.8 // Nam Bộ + Lâm Đồng
    : lat > 10.3 && lat < 11.5 && lng > 106.3 && lng < 107.6; // TP.HCM sau 07/2025
}
export const laTinhNgoai = (district: string | null) => TINH_NGOAI_RE.test(boDau(district ?? ""));

// ─── Khoá vùng tìm quanh QUẬN CŨ (11/09/2026) ────────────────────────────────
// Lượt chạy thật đầu tiên: "hẻm 102 Trần Bình Trọng, Phường 1, Quận 5" ra
// 10.8125, 106.6882 — một đường Trần Bình Trọng KHÁC, cách Quận 5 ~7 km. Nấc
// "bỏ quận" (cần vì OSM TP.HCM không còn ranh giới quận) khớp đường trùng tên ở
// quận khác. Quận không còn trên OSM nhưng vẫn là thông tin tốt: tâm ~ + bán
// kính của quận/huyện cũ → Nominatim chỉ tìm trong hộp đó (`viewbox` +
// `bounded=1`), và điểm trả về ngoài bán kính thì loại — thà không ghim còn hơn
// ghim nhầm quận rồi trả lời "gần bệnh viện" theo nó.
const TAM_QUAN: Record<string, [number, number, number]> = {
  "1": [10.7757, 106.7004, 4], "3": [10.7830, 106.6860, 4], "4": [10.7578, 106.7013, 4],
  "5": [10.7540, 106.6634, 4], "6": [10.7480, 106.6352, 4], "7": [10.7340, 106.7218, 6],
  "8": [10.7240, 106.6286, 6], "10": [10.7746, 106.6679, 4], "11": [10.7629, 106.6505, 4],
  "12": [10.8672, 106.6413, 7], "2": [10.7872, 106.7498, 7], "9": [10.8428, 106.8287, 10],
  "binh thanh": [10.8106, 106.7091, 5], "phu nhuan": [10.7992, 106.6803, 4],
  "tan binh": [10.8015, 106.6527, 5], "tan phu": [10.7918, 106.6278, 5],
  "go vap": [10.8387, 106.6653, 5], "binh tan": [10.7652, 106.6039, 7],
  "thu duc": [10.8494, 106.7537, 12], "nha be": [10.6951, 106.7048, 10],
  "binh chanh": [10.6874, 106.5938, 15], "hoc mon": [10.8894, 106.5947, 12],
  "cu chi": [10.9733, 106.4933, 22], "can gio": [10.4113, 106.9547, 25],
};

export type VungQuan = { lat: number; lng: number; r_km: number };

/** "Quận 5", "Q.5", "Quận 9 (TP. Thủ Đức)", "Huyện Bình Chánh" → tâm + bán kính; không biết → null. */
export function vungQuan(district: string | null): VungQuan | null {
  if (!district) return null;
  const k = boDau(district).toLowerCase()
    .replace(/\([^)]*\)/g, " ").replace(/[.,]/g, " ")
    .replace(/\b(thanh pho|tp|quan|huyen|thi xa|q)\b/g, " ")
    .replace(/\s+/g, " ").trim().replace(/^0+(\d)/, "$1");
  const v = TAM_QUAN[k];
  return v ? { lat: v[0], lng: v[1], r_km: v[2] } : null;
}

/** Điểm có nằm trong bán kính quận không. */
export const trongVungQuan = (lat: number, lng: number, v: VungQuan): boolean =>
  khoangCachM(lat, lng, v.lat, v.lng) <= v.r_km * 1000;

/** Hộp `viewbox` cho Nominatim: "trái,trên,phải,dưới" (kinh, vĩ). */
export function viewboxQuan(v: VungQuan): string {
  const dLat = v.r_km / 111.32;
  const dLng = v.r_km / (111.32 * Math.cos(v.lat * Math.PI / 180));
  const f = (x: number) => x.toFixed(4);
  return `${f(v.lng - dLng)},${f(v.lat + dLat)},${f(v.lng + dLng)},${f(v.lat - dLat)}`;
}

// ─── Tiện ích quanh tin (Overpass) ───────────────────────────────────────────

/** Nạp điểm trong bán kính này quanh mỗi tin; khách hỏi xa hơn thì kẹp lại. */
export const BAN_KINH_NAP_M = 3000;

export function cauOverpass(lat: number, lng: number, r = BAN_KINH_NAP_M): string {
  const a = `(around:${r},${lat.toFixed(6)},${lng.toFixed(6)})`;
  return `[out:json][timeout:25];(` +
    `nwr${a}["amenity"="hospital"];` +
    `nwr${a}["amenity"~"^(school|kindergarten|university|college)$"];` +
    `nwr${a}["amenity"="marketplace"];` +
    `nwr${a}["shop"~"^(supermarket|mall|department_store)$"];` +
    `nwr${a}["leisure"="park"];` +
    `);out tags center;`;
}

export type DiemOsm = {
  osm_id: string; loai: LoaiTienIch; ten: string; ten_kd: string; lat: number; lng: number;
};

// OSM gắn nhầm "hospital" cho nhà thuốc, phòng thí nghiệm, thú y — đo thật 11/09:
// điểm "bệnh viện" gần Hồ Ngọc Lãm nhất là "Nhà Thuốc Tây …".
const KHONG_PHAI_BV_RE = /(nha thuoc|pharma|thu y|veterinar|phong thi nghiem|xet nghiem|nha khoa|dental)/;

function loaiTuTags(tags: Record<string, string>): LoaiTienIch | null {
  const am = tags.amenity, shop = tags.shop, lei = tags.leisure;
  if (am === "hospital") return "benh_vien";
  if (am && /^(school|kindergarten|university|college)$/.test(am)) return "truong_hoc";
  if (am === "marketplace") return "cho";
  if (shop && /^(supermarket|mall|department_store)$/.test(shop)) return "sieu_thi";
  if (lei === "park") return "cong_vien";
  return null;
}

/** Đọc JSON Overpass (`out tags center`) thành điểm có tên, bỏ điểm gắn nhầm loại. */
export function docDiemOsm(js: unknown): DiemOsm[] {
  const els = (js as { elements?: unknown[] } | null)?.elements;
  if (!Array.isArray(els)) return [];
  const out: DiemOsm[] = [];
  const thay = new Set<string>();
  for (const raw of els) {
    const el = raw as {
      type?: string; id?: number; lat?: number; lon?: number;
      center?: { lat?: number; lon?: number }; tags?: Record<string, string>;
    };
    const tags = el.tags ?? {};
    const ten = (tags["name:vi"] ?? tags.name ?? "").trim();
    const loai = loaiTuTags(tags);
    const lat = Number(el.lat ?? el.center?.lat);
    const lng = Number(el.lon ?? el.center?.lon);
    if (!ten || !loai || !el.type || el.id == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const ten_kd = kdTen(ten);
    if (loai === "benh_vien" && KHONG_PHAI_BV_RE.test(ten_kd)) continue;
    const osm_id = `${el.type}/${el.id}`;
    if (thay.has(osm_id)) continue;
    thay.add(osm_id);
    out.push({ osm_id, loai, ten, ten_kd, lat, lng });
  }
  return out;
}

/** Khoảng cách đường chim bay, mét (haversine) — cùng công thức SQL `khoang_cach_m`. */
export function khoangCachM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type TienIchGan = { loai: LoaiTienIch; ten: string; m: number };

/** Gần nhất mỗi loại trong `maxM` — cột `listings.tien_ich_gan`, bot kể "quanh nhà có gì". */
export function ganNhatMoiLoai(lat: number, lng: number, diem: DiemOsm[], maxM = BAN_KINH_NAP_M): TienIchGan[] {
  const best = new Map<LoaiTienIch, TienIchGan>();
  for (const d of diem) {
    const m = khoangCachM(lat, lng, d.lat, d.lng);
    if (m > maxM) continue;
    const cu = best.get(d.loai);
    if (!cu || m < cu.m) best.set(d.loai, { loai: d.loai, ten: d.ten, m });
  }
  return [...best.values()]
    .map((x) => ({ ...x, m: Math.round(x.m / 10) * 10 }))
    .sort((a, b) => a.m - b.m);
}
