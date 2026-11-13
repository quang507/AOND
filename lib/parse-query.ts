// FR-02 / FR-08 / FR-09 (SRS-4.5) + FR-92 (SRS-4.6) — bóc tách câu tìm kiếm
// / câu rao tiếng Việt BẰNG LUẬT, không gọi model. Chạy được ở route handler
// (server) lẫn trong ListingBrowse (server component) — cùng một bộ luật nên
// tiêu đề diễn giải và bộ lọc không bao giờ lệch nhau.
//
// Có dấu / không dấu: chuẩn hoá ký-tự-một (NFD bỏ dấu tổ hợp, đ→d) GIỮ NGUYÊN
// độ dài chuỗi, nên chỉ số trong bản không dấu trùng chỉ số trong bản gốc —
// bóc tên đường / mốc thì cắt từ bản gốc để giữ dấu cho tiêu đề. Không đặt
// `\b` cạnh chữ tiếng Việt (bẫy SRS-3.8 "\b và dấu"): mọi biên từ tự dựng bằng
// `(^|[^a-z])` … `(?![a-z])` trên bản đã bỏ dấu (toàn ASCII).
//
// Kết quả là TẬP CON của bộ lọc /mua-ban (ListingBrowse): cùng cột, cùng luật
// "chỉ tin đang lên kệ". Giá không ép vào ô chip cố định (duoi-5/5-8/…) mà đi
// thành `gmin`/`gmax` (VND) — "8 tỉ" là 6,8–9,2 tỉ, không phải "5–8 tỷ".
import { slugKhu, tagBySlug } from "@/lib/tags";
import { TIEN_KD } from "@/bot/supabase/functions/_shared/extraction/luat-tien";
import { ganNhan, tenNhan } from "@/bot/supabase/functions/_shared/extraction/nhan";

const TY = 1_000_000_000;
const TR = 1_000_000;

export type SearchFilters = {
  deal?: "ban" | "cho_thue";
  /** enum `property_type` của DB (nhiều giá trị cho nhóm "nhà"). */
  types?: string[];
  ward?: string;
  district?: string;
  priceMin?: number;
  priceMax?: number;
  /** "8 tỉ" → 8e9; giữ để diễn giải tiêu đề ("khoảng 8 tỉ"). */
  priceApprox?: number;
  /** khoá `vao` của ListingBrowse. */
  access?: "mt" | "hxh" | "hem";
  bedrooms?: number;
  areaMin?: number;
  areaMax?: number;
  street?: string;
  landmark?: string;
  /** FR-211: nhãn tìm kiếm (khoá từ điển `nhan.ts`), lọc `contains` trên `listings.nhan`. */
  tags?: string[];
};

export type Confidence = Partial<Record<keyof SearchFilters, number>>;

export type ParsedQuery = {
  q: string;
  filters: SearchFilters;
  confidence: Confidence;
  /** FR-08: tiêu đề diễn giải lại truy vấn. Rỗng khi không bóc được gì. */
  title: string;
  /** Trang tag khớp (FR-12) hoặc /mua-ban|/cho-thue?… */
  url: string;
  /** Không bóc được trường nào — trang kết quả mời sang Zalo. */
  empty: boolean;
};

/** Bỏ dấu GIỮ ĐỘ DÀI: mỗi ký tự gốc → đúng một ký tự ASCII thường. */
export function boDauGiuViTri(s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch === "đ" || ch === "Đ") { out += "d"; continue; }
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Ký tự lạ (emoji…) là một code point nhưng có thể là 2 code unit — bù cho
    // đủ độ dài để chỉ số hai bản luôn trùng nhau.
    const c = (base[0] ?? " ").toLowerCase();
    const one = /[a-z0-9]/.test(c) ? c : /[.,/\-–]/.test(c) ? c : " ";
    out += one + " ".repeat(Math.max(0, ch.length - 1));
  }
  return out;
}

const NHOM_NHA = ["nha_pho", "nha_cap4", "biet_thu"];

// Thứ tự QUAN TRỌNG: mẫu dài trước ("nha pho" trước "nha", "can ho" trước "ho").
const LOAI: Array<{ re: RegExp; types: string[]; label: string; tag: string; conf: number }> = [
  // 20260909i: loại mới — xét trước "can ho" vì "căn hộ dịch vụ" là toà nhà dòng tiền.
  { re: /(^|[^a-z])(kho xuong|nha xuong|kho bai|nha kho|xuong)(?![a-z])/, types: ["kho_xuong"], label: "kho xưởng", tag: "kho-xuong", conf: 0.9 },
  { re: /(^|[^a-z])(dat nong nghiep|dat vuon|dat lua|dat trong|dat ruong|dat ray)(?![a-z])/, types: ["dat_nong_nghiep"], label: "đất nông nghiệp", tag: "dat", conf: 0.9 },
  { re: /(^|[^a-z])(dat skc|dat tmd|dat kinh doanh|dat thuong mai|thuong mai dich vu)(?![a-z])/, types: ["dat_kinh_doanh"], label: "đất kinh doanh", tag: "dat", conf: 0.9 },
  { re: /(^|[^a-z])(can ho dich vu|chdv|khach san|toa nha|building|nha nghi)(?![a-z])/, types: ["toa_nha"], label: "toà nhà", tag: "toa-nha", conf: 0.9 },
  { re: /(^|[^a-z])(chung cu|can ho|cc|apartment|penthouse)(?![a-z])/, types: ["chung_cu"], label: "căn hộ", tag: "can-ho", conf: 0.9 },
  { re: /(^|[^a-z])(mat bang|mb|kiot|ki ot|shophouse|van phong|cua hang)(?![a-z])/, types: ["mat_bang"], label: "mặt bằng", tag: "mat-bang", conf: 0.9 },
  { re: /(^|[^a-z])(phong tro|nha tro|tro|phong(?!\s*(ngu|khach|tam|bep|wc)))(?![a-z])/, types: ["phong_tro"], label: "phòng trọ", tag: "phong-tro", conf: 0.85 },
  { re: /(^|[^a-z])(biet thu|villa)(?![a-z])/, types: ["biet_thu"], label: "biệt thự", tag: "nha", conf: 0.9 },
  { re: /(^|[^a-z])(nha cap 4|nha cap bon|cap 4)(?![a-z])/, types: ["nha_cap4"], label: "nhà cấp 4", tag: "nha", conf: 0.9 },
  // "nhà đất" là cách gọi chung → không phải loại; bỏ qua ở dưới.
  { re: /(^|[^a-z])(nha pho|nha)(?!\s*dat)(?![a-z])/, types: NHOM_NHA, label: "nhà phố", tag: "nha", conf: 0.85 },
  { re: /(^|[^a-z])(dat nen|lo dat|dat)(?![a-z])/, types: ["dat"], label: "đất", tag: "dat", conf: 0.9 },
];

// Quận/huyện có tên (Sài Gòn + Long An — FR-174). Giá trị hiển thị có dấu.
const QUAN_TEN: Array<[RegExp, string]> = [
  [/binh chanh/, "Bình Chánh"], [/binh tan/, "Bình Tân"], [/binh thanh/, "Bình Thạnh"],
  [/tan binh/, "Tân Bình"], [/tan phu/, "Tân Phú"], [/phu nhuan/, "Phú Nhuận"],
  [/go vap/, "Gò Vấp"], [/thu duc/, "Thủ Đức"], [/nha be/, "Nhà Bè"], [/hoc mon/, "Hóc Môn"],
  [/cu chi/, "Củ Chi"], [/can gio(?![a-z])/, "Cần Giờ"],
  [/ben luc/, "Bến Lức"], [/duc hoa/, "Đức Hoà"], [/can giuoc/, "Cần Giuộc"],
  [/can duoc/, "Cần Đước"], [/tan an(?![a-z])/, "Tân An"], [/thu thua/, "Thủ Thừa"], [/long an(?![a-z])/, "Long An"],
];

const MOC_RE =
  /(^|[^a-z])(gan|sat|canh|ke|doi dien)\s+((cho|truong|benh vien|bv|nga tu|nga ba|cong vien|chua|nha tho|ben xe|metro|sieu thi|ho boi|cau|vong xoay|cho lon|dai hoc|truong hoc)(?:\s+[a-z0-9]+){0,4})/;
const DUONG_RE = /(^|[^a-z])(mat tien duong|mt duong|hem duong|duong)\s+((?:[a-z0-9]+\s*){1,5})/;
// Từ kết thúc tên đường/mốc: gặp là cắt.
const DUNG_RE = /^(gia|q\d*|quan|phuong|p\d*|hxh|hxt|mt|hem|duoi|tren|khoang|tam|tu|den|pn|phong|dt|o|tai|thuoc|ban|mua|thue|can|tim|nha|dat|chung|cu|cc|co|voi|hoac|va|gan)$/;

/**
 * Cắt cụm chữ (tên đường, mốc) từ bản GỐC có dấu. `m[3]` phải là nhóm CUỐI
 * của match (kết thúc đúng ở cuối match) để suy vị trí tuyệt đối trong `t`.
 */
function bocCum(t: string, goc: string, m: RegExpExecArray, giuDau = 0): string | undefined {
  const span = m[3];
  const spanStart = m.index + m[0].length - span.length;
  let end = 0;
  const re = /[a-z0-9]+/g;
  let w: RegExpExecArray | null;
  let n = 0;
  while ((w = re.exec(span)) && n < 6) {
    // Phần đầu là từ khoá loại mốc ("ngã tư", "bến xe") — không xét từ dừng ở đó.
    if (n > 0 && w.index >= giuDau && DUNG_RE.test(w[0])) break;
    end = w.index + w[0].length;
    n++;
  }
  if (!end) return undefined;
  return goc.slice(spanStart, spanStart + end).replace(/\s+/g, " ").trim();
}

/** Đọc số kiểu Việt: "8", "8,5", "8.5". */
function so(s: string): number {
  return parseFloat(s.replace(",", "."));
}

type GiaKQ = { min?: number; max?: number; approx?: number; conf: number; thue?: boolean; raw: string };

// Giá. Đơn vị: ty|ti|toi → 1e9; tr|trieu|cu → 1e6; "/thang" → dấu hiệu thuê.
// `tr(?![a-z])` để "tret" (trệt) không thành "triệu" — bẫy SRS-3.8 đã ăn ba lần.
// KHÔNG nhận "m"/"k" làm đơn vị: "60 m2" mà đọc thành 60 triệu là sai cả câu.
// Đơn vị tiền MỘT NGUỒN (tầng bốn, 11/09): `luat-tien.ts` — dùng chung với bot
// và bộ bóc tách. Bản cũ ở đây có "toi" TRẦN (luôn là tỷ), trong khi nhánh khoảng
// giá ngay dưới lại coi "toi" là TỚI: cùng một chữ, hai nghĩa, trong một file.
const DV = `(${TIEN_KD})`;
const SO = "(\\d+(?:[.,]\\d+)?)";
function donVi(u: string): number {
  return u === "ty" || u === "ti" || u === "toi" ? TY : TR;
}
function bocGia(t: string, goc?: string): GiaKQ | null {
  if (goc) {
    let i = goc.toLowerCase().indexOf("tỏi");
    while (i >= 0) {
      t = t.slice(0, i) + "ty " + t.slice(i + 3);
      i = goc.toLowerCase().indexOf("tỏi", i + 3);
    }
  }
  // `raw` cắt từ bản gốc (có dấu) theo cùng chỉ số, bỏ ký tự ngăn cách đứng đầu.
  const rawCua = (m: RegExpExecArray) =>
    (goc ?? t).slice(m.index + m[1].length, m.index + m[0].length).replace(/^[^\p{L}\p{N}]+/u, "").trim();
  // "8ty2", "6ty5" → 8,2 / 6,5 tỉ (FR-154 lóng)
  let m = new RegExp(`(^|[^a-z0-9])${SO}\\s*(ty|ti)\\s*(\\d)(?![a-z0-9])`).exec(t);
  if (m) {
    const v = (so(m[2]) + Number(m[4]) / 10) * TY;
    return { approx: v, min: v * 0.85, max: v * 1.15, conf: 0.85, raw: rawCua(m) };
  }
  // "5-8 ty", "5 den 8 ty", "tu 5 den 8 ty", "5 toi 8 ty"
  m = new RegExp(`(^|[^a-z0-9])${SO}\\s*(?:-|–|den|toi|to)\\s*${SO}\\s*${DV}(?![a-z])`).exec(t);
  if (m) {
    const dv = donVi(m[4]);
    return { min: so(m[2]) * dv, max: so(m[3]) * dv, conf: 0.9, raw: rawCua(m) };
  }
  // "duoi 5 ty", "tren 10 ty", "khoang 8 ty", "tam 8 ti", "8 ty ruoi", "15tr/thang"
  m = new RegExp(`(^|[^a-z0-9])(duoi|toi da|max|tren|tu|it nhat|khoang|tam|co|gia|chung)?\\s*${SO}\\s*${DV}(?![a-z])(\\s*ruoi)?(\\s*/\\s*(thang|th|nam))?`).exec(t);
  if (m) {
    const tuKhoa = m[2] ?? "";
    let v = so(m[3]);
    if (m[5]) v += 0.5;
    const vnd = v * donVi(m[4]);
    const thue = !!m[6];
    const raw = rawCua(m);
    if (/^(duoi|toi da|max)$/.test(tuKhoa)) return { max: vnd, conf: 0.95, thue, raw };
    if (/^(tren|tu|it nhat)$/.test(tuKhoa)) return { min: vnd, conf: 0.95, thue, raw };
    return { approx: vnd, min: vnd * 0.85, max: vnd * 1.15, conf: tuKhoa ? 0.9 : 0.8, thue, raw };
  }
  return null;
}

function fGia(v: number): string {
  return v >= TY
    ? `${(v / TY).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỉ`
    : `${Math.round(v / TR).toLocaleString("vi-VN")} triệu`;
}

function nhanGia(g: { priceMin?: number; priceMax?: number; priceApprox?: number }, thue: boolean): string {
  const duoi = thue ? "/tháng" : "";
  if (g.priceApprox) return `khoảng ${fGia(g.priceApprox)}${duoi}`;
  if (g.priceMin && g.priceMax) return `${fGia(g.priceMin)} – ${fGia(g.priceMax)}${duoi}`;
  if (g.priceMax) return `dưới ${fGia(g.priceMax)}${duoi}`;
  if (g.priceMin) return `trên ${fGia(g.priceMin)}${duoi}`;
  return "";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Bóc câu TÌM KIẾM (FR-09). Không đụng DB. */
export function parseQuery(qRaw: string): ParsedQuery {
  const q = (qRaw ?? "").toString().slice(0, 300).replace(/\s+/g, " ").trim();
  const t = boDauGiuViTri(q);
  const f: SearchFilters = {};
  const c: Confidence = {};
  // FR-211: nhãn tìm kiếm trong câu hỏi ("yên tĩnh", "gần chợ"…) — cùng từ điển với bot.
  { const tags = ganNhan(q); if (tags.length) { f.tags = tags; c.tags = 0.8; } }

  // Giao dịch. "thue" → thuê; "mua"/"ban" → bán. Cả hai → thuê thắng ("cần
  // thuê" rõ ý hơn "bán" vốn hay đứng trong "cho thuê hoặc bán").
  if (/(^|[^a-z])(thue|cho thue|can thue|muon thue|o ghep)(?![a-z])/.test(t)) { f.deal = "cho_thue"; c.deal = 0.95; }
  else if (/(^|[^a-z])(mua|ban|can mua|tim mua|dau tu)(?![a-z])/.test(t)) { f.deal = "ban"; c.deal = 0.95; }

  // Loại BĐS
  let loaiTag = "";
  let loaiLabel = "";
  for (const L of LOAI) {
    if (L.re.test(t)) { f.types = L.types; loaiTag = L.tag; loaiLabel = L.label; c.types = L.conf; break; }
  }

  // Phường: "phuong 5", "p5", "p.5", "p 5"
  let m = /(^|[^a-z])(phuong|p)\.?\s*(\d{1,2})(?![0-9])/.exec(t);
  if (m) { f.ward = `Phường ${Number(m[3])}`; c.ward = m[2] === "phuong" ? 0.95 : 0.8; }

  // Quận: "quan 5", "q5", "q.5", "q 5" hoặc tên
  m = /(^|[^a-z])(quan|q)\.?\s*(\d{1,2})(?![0-9])/.exec(t);
  if (m) { f.district = `Quận ${Number(m[3])}`; c.district = m[2] === "quan" ? 0.95 : 0.8; }
  else {
    for (const [re, ten] of QUAN_TEN) {
      if (re.test(t)) { f.district = ten; c.district = 0.9; break; }
    }
  }

  // Giá
  const g = bocGia(t, q);
  if (g) {
    if (g.min) f.priceMin = Math.round(g.min);
    if (g.max) f.priceMax = Math.round(g.max);
    if (g.approx) f.priceApprox = Math.round(g.approx);
    c.priceMin = c.priceMax = g.conf;
    if (g.thue && !f.deal) { f.deal = "cho_thue"; c.deal = 0.8; }
  }
  // Giá dưới 100 triệu mà chưa rõ giao dịch → gần như chắc là thuê theo tháng.
  if (!f.deal && f.priceApprox && f.priceApprox < 100 * TR) { f.deal = "cho_thue"; c.deal = 0.6; }

  // Đường vào (FR-172): HXH gộp cả hẻm xe tải + mặt tiền, đúng chip của /mua-ban.
  if (/(^|[^a-z])(mt|mat tien)(?![a-z])/.test(t)) { f.access = "mt"; c.access = 0.9; }
  else if (/(^|[^a-z])(hxh|hxt|hem xe hoi|hem xe tai|hem oto|hem o to|xe hoi|o ?to (vo|vao|toi|tan|quay))(?![a-z])/.test(t)) { f.access = "hxh"; c.access = 0.9; }
  else if (/(^|[^a-z])(hem|hem xe may|trong hem)(?![a-z])/.test(t)) { f.access = "hem"; c.access = 0.8; }

  // Phòng ngủ: "3pn", "3 phong ngu", "3 phòng"
  m = /(^|[^a-z0-9])(\d)\s*(pn|phong ngu|phong)(?![a-z])/.exec(t);
  if (m) { f.bedrooms = Math.min(4, Math.max(1, Number(m[2]))); c.bedrooms = 0.9; }

  // Diện tích: "60m2", "tren 50 m2", "dt 60"
  m = /(^|[^a-z0-9])(duoi|tren|tu|khoang|dt|dien tich)?\s*(\d{2,4})\s*(m2|m vuong|met vuong)(?![a-z])/.exec(t);
  if (m) {
    const v = Number(m[3]);
    if (m[2] === "duoi") f.areaMax = v;
    else if (m[2] === "tren" || m[2] === "tu") f.areaMin = v;
    else { f.areaMin = Math.round(v * 0.8); f.areaMax = Math.round(v * 1.25); }
    c.areaMin = c.areaMax = 0.8;
  }

  // Tên đường (cắt từ bản GỐC để giữ dấu)
  m = DUONG_RE.exec(t);
  if (m) { const s = bocCum(t, q, m); if (s) { f.street = s; c.street = 0.75; } }

  // Mốc ("gần chợ X")
  m = MOC_RE.exec(t);
  if (m) { const s = bocCum(t, q, m, m[4].length); if (s) { f.landmark = s; c.landmark = 0.7; } }
  // SRS-5.1zzzzzzz457: có mốc cụ thể thì bỏ nhãn chung "gần …" — tiêu đề từng ra "gần bệnh viện gần bệnh viện Chợ Rẫy", và lọc
  // thêm nhãn gan_benh_vien chồng lên mốc chỉ làm hụt tin (tin gần Chợ Rẫy chưa chắc có nhãn đó).
  if (f.landmark && f.tags?.length) {
    f.tags = f.tags.filter((k) => !k.startsWith("gan_"));
    if (!f.tags.length) { delete f.tags; delete c.tags; }
  }

  // "Bóc được" = có ít nhất một tín hiệu MẠNH. Chỉ mỗi loại BĐS ("nhà", "đất")
  // thì chưa đủ để tự tin dựng bộ lọc — "cho em hỏi giá nhà ở đây" phải đi
  // sang hộp Zalo chứ không đổ ra cả kho.
  const manh = !!(f.deal || f.ward || f.district || f.priceMin || f.priceMax || f.access
    || f.bedrooms || f.street || f.landmark || f.areaMin || f.areaMax || f.tags?.length);
  const empty = !manh;
  const deal = f.deal ?? "ban";
  const thue = deal === "cho_thue";

  // Tiêu đề diễn giải (FR-08)
  const parts: string[] = [thue ? "Thuê" : "Mua", loaiLabel || "nhà đất"];
  if (f.access === "mt") parts.push("mặt tiền");
  else if (f.access === "hxh") parts.push("hẻm xe hơi");
  else if (f.access === "hem") parts.push("trong hẻm");
  if (f.bedrooms) parts.push(`${f.bedrooms}+ phòng ngủ`);
  if (f.tags?.length) parts.push(tenNhan(f.tags));
  if (f.areaMin || f.areaMax) {
    parts.push(f.areaMin && f.areaMax ? `${f.areaMin}–${f.areaMax} m²` : f.areaMax ? `dưới ${f.areaMax} m²` : `trên ${f.areaMin} m²`);
  }
  const gia = nhanGia(f, thue);
  if (gia) parts.push(gia);
  if (f.street) parts.push(`đường ${f.street}`);
  if (f.landmark) parts.push(`gần ${f.landmark}`);
  const khu = [f.ward, f.district].filter(Boolean).join(", ");
  const title = empty ? "" : cap(parts.join(" ")) + (khu ? `, ${khu}` : "");

  // URL: trang tag nếu tổ hợp khớp ĐÚNG một tag (không còn tiêu chí thừa).
  let url = "";
  if (!empty && loaiTag) {
    const thua = !!(f.street || f.landmark || f.areaMin || f.areaMax || f.priceMin || f.priceApprox || f.tags?.length);
    let attr = "";
    let attrDung = true;
    if (f.access === "hxh") attr = "hem-xe-hoi";
    else if (f.access === "mt") attr = "mat-tien";
    else if (f.access === "hem") attrDung = false;
    if (f.priceMax && !f.priceMin && !f.priceApprox) {
      const ty = f.priceMax / TY;
      if (attr === "" && ty === 5) attr = "duoi-5-ty";
      else attrDung = false;
    }
    if (f.bedrooms) attrDung = false; // SRS-5.1zzzzzzz433: bộ 100 tag không còn tag theo số phòng ngủ
    // SRS-5.1zzzzzzz433: tag theo quận / huyện (100 tag); không có quận = tag "Sài Gòn". Có phường thì không còn tag nào khớp đúng.
    const area = f.ward ? null : slugKhu(f.district);
    if (area && !thua && attrDung) {
      const slug = [thue ? "cho-thue" : "ban", loaiTag, attr, area].filter(Boolean).join("-");
      if (tagBySlug(slug)) url = `/${slug}`;
    }
  }
  if (!url) {
    const p = new URLSearchParams();
    if (f.ward) p.set("phuong", f.ward);
    if (f.district) p.set("quan", f.district);
    if (f.priceMin) p.set("gmin", String(f.priceMin));
    if (f.priceMax) p.set("gmax", String(f.priceMax));
    if (f.areaMin) p.set("dtmin", String(f.areaMin));
    if (f.areaMax) p.set("dtmax", String(f.areaMax));
    if (f.bedrooms) p.set("pn", String(f.bedrooms));
    if (f.access) p.set("vao", f.access);
    if (f.types?.length && !empty) p.set("loai", f.types.join(","));
    if (f.street) p.set("duong", f.street);
    if (f.landmark) p.set("moc", f.landmark);
    if (f.tags?.length) p.set("nhan", f.tags.join(","));
    if (q) p.set("q", q);
    const qs = p.toString();
    url = `${thue ? "/cho-thue" : "/mua-ban"}${qs ? `?${qs}` : ""}`;
  }

  return { q, filters: f, confidence: c, title, url, empty };
}
