// nhap-ro-hang.ts — NHẬP RỔ HÀNG hàng loạt từ bảng (CSV / XLSX) của môi giới nhiều căn
// (05/10/2026, SRS-5.1zzk — theo demo AOND bulk.py: ánh xạ cột TẤT ĐỊNH, không model, kiểm được offline).
//
// Môi giới / sàn giữ rổ hàng trong Excel; xuất ra gửi bot là mỗi dòng một tin. Tiêu đề cột nhận
// theo bảng bí danh tiếng Việt / tiếng Anh (bỏ dấu, không phân biệt hoa thường); cột lạ bỏ qua.
// Cột TÊN / SĐT / Zalo của chủ nhà CỐ Ý không nhập (§5: không ghi SĐT vào tin, tin là công khai).
// Luật tiền KHÔNG viết lại ở đây: `price_raw` giữ nguyên chữ, trigger `parse_vnd` (DB) và
// `docTien` (TS) cùng một bảng ca đọc ra số.

export type DongNhap = {
  stt: number;
  deal: "ban" | "cho_thue";
  property_type: string;
  location_raw: string | null;
  ward: string | null;
  district: string | null;
  area_m2: number | null;
  price_raw: string | null;
  floors_text: string | null;
  bedrooms: number | null;
  legal_status: string | null;
  huong: string | null;
  du_an: string | null;
  ma_can: string | null;
  mo_ta: string | null;
  hem: string | null;
  /** Ô thiếu để báo lại (không chặn nhập — hỏi bù sẽ hỏi). */
  thieu: string[];
};

export function chuan(s: string): string {
  return (s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Bí danh tiêu đề cột (đã bỏ dấu) → khoá. Thêm cột là thêm dòng ở đây + ca trong `bot/tests/nhap-ro-hang.mjs`. */
export const BI_DANH_COT: Record<string, keyof Omit<DongNhap, "stt" | "thieu"> | "bo_qua"> = {
  "loai": "property_type", "loai hinh": "property_type", "loai bds": "property_type", "loai nha": "property_type", "type": "property_type",
  "giao dich": "deal", "nhu cau": "deal", "ban thue": "deal", "ban hay thue": "deal", "hinh thuc": "deal", "deal": "deal",
  "dia chi": "location_raw", "address": "location_raw", "vi tri": "location_raw", "duong": "location_raw", "so nha": "location_raw", "ten duong": "location_raw",
  "phuong": "ward", "ward": "ward", "phuong xa": "ward", "xa": "ward",
  "quan": "district", "district": "district", "quan huyen": "district", "huyen": "district",
  "dien tich": "area_m2", "dt": "area_m2", "area": "area_m2", "m2": "area_m2", "dien tich m2": "area_m2", "dt m2": "area_m2",
  "gia": "price_raw", "price": "price_raw", "gia ban": "price_raw", "gia thue": "price_raw", "gia chao": "price_raw", "gia rao": "price_raw", "muc gia": "price_raw",
  "ket cau": "floors_text", "so tang": "floors_text", "tang": "floors_text", "so lau": "floors_text", "lau": "floors_text", "ket cau nha": "floors_text",
  "phong ngu": "bedrooms", "so phong ngu": "bedrooms", "pn": "bedrooms", "bedrooms": "bedrooms",
  "phap ly": "legal_status", "so": "legal_status", "so hong": "legal_status", "giay to": "legal_status", "legal": "legal_status",
  "huong": "huong", "huong nha": "huong",
  "du an": "du_an", "project": "du_an", "ten du an": "du_an",
  "ma can": "ma_can", "ma lo": "ma_can", "can so": "ma_can", "lo": "ma_can", "ma so can": "ma_can", "unit": "ma_can", "ma": "ma_can",
  "mo ta": "mo_ta", "ghi chu": "mo_ta", "note": "mo_ta", "notes": "mo_ta", "description": "mo_ta", "chi tiet": "mo_ta",
  "hem": "hem", "duong vao": "hem", "lo gioi": "hem", "do rong hem": "hem", "hem rong": "hem",
  // §5 — không bao giờ nhập: thông tin cá nhân của chủ nhà.
  "ten": "bo_qua", "ten chu": "bo_qua", "chu nha": "bo_qua", "sdt": "bo_qua", "so dien thoai": "bo_qua", "dien thoai": "bo_qua",
  "phone": "bo_qua", "zalo": "bo_qua", "lien he": "bo_qua", "email": "bo_qua", "cccd": "bo_qua", "cmnd": "bo_qua",
};

const LOAI_BDS: Array<[RegExp, string]> = [
  [/\b(can ho|chung cu|apartment|ch|cc)\b/, "chung_cu"],
  [/\b(biet thu|villa|bt)\b/, "biet_thu"],
  [/\b(nha cap 4|cap 4|c4)\b/, "nha_cap4"],
  [/\b(phong tro|tro|nha tro)\b/, "phong_tro"],
  [/\b(mat bang|mb|kiot|shop|shophouse)\b/, "mat_bang"],
  [/\b(kho|xuong|kho xuong|nha xuong)\b/, "kho_xuong"],
  [/\b(toa nha|building|cao oc)\b/, "toa_nha"],
  [/\b(dat nong nghiep|dat vuon|dat ruong)\b/, "dat_nong_nghiep"],
  [/\b(dat kinh doanh|dat skc|dat thuong mai)\b/, "dat_kinh_doanh"],
  [/\b(dat|dat nen|dat tho cu|lo dat|land)\b/, "dat"],
  [/\b(nha pho|nha|nha mat tien|nha hem|house|np|nha rieng|nha nguyen can)\b/, "nha_pho"],
];
export function docLoaiBds(s: string): string | null {
  const t = chuan(s);
  if (!t) return null;
  for (const [re, loai] of LOAI_BDS) if (re.test(t)) return loai;
  return null;
}

export function docGiaoDich(s: string): "ban" | "cho_thue" | null {
  const t = chuan(s);
  if (!t) return null;
  if (/\b(thue|cho thue|rent|lease)\b/.test(t)) return "cho_thue";
  if (/\b(ban|sell|sale|chuyen nhuong)\b/.test(t)) return "ban";
  return null;
}

export function docPhapLy(s: string): string | null {
  const t = chuan(s);
  if (!t) return null;
  if (/\b(shr|so hong rieng|so rieng|so do rieng|rieng)\b/.test(t)) return "so_hong_rieng";
  if (/\b(shc|so chung|so hong chung|chung)\b/.test(t)) return "so_hong_chung";
  if (/\b(hdmb|hop dong mua ban|hop dong)\b/.test(t)) return "hdmb";
  if (/\b(giay tay|vi bang|giay tay vi bang)\b/.test(t)) return "giay_tay";
  if (/\b(so hong|so do|shr|co so|da co so|so)\b/.test(t)) return "so_hong";
  return null;
}

/** "60", "60m2", "60,5 m²", "4x15" → 60 / 60.5 / 60. */
export function docM2(s: string): number | null {
  // Không qua `chuan` (nó xoá dấu phẩy / chấm thập phân): "60,5 m²" → 60.5.
  const t = (s ?? "").toLowerCase().replace(/,/g, ".").replace(/\s+/g, " ");
  const nhan = t.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  if (nhan) { const n = Number(nhan[1]) * Number(nhan[2]); return n > 5 && n < 1_000_000 ? +n.toFixed(1) : null; }
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 5 && n < 1_000_000 ? n : null;
}

export function docSoPhong(s: string): number | null {
  const m = chuan(s).match(/\d{1,2}/);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 1 && n <= 50 ? n : null;
}

/** Ánh xạ tiêu đề → khoá. Trả cả danh sách cột không nhận để báo lại. */
export function anhXaCot(tieuDe: string[]): { cot: Array<keyof Omit<DongNhap, "stt" | "thieu"> | "bo_qua" | null>; laCot: string[]; nhanRa: string[] } {
  // §5: tiêu đề nào có chữ SĐT / điện thoại / Zalo / CCCD / email (kể cả "SĐT chủ", "Zalo môi giới") → bỏ, không cần bí danh đúng từng chữ.
  const cot = tieuDe.map((h) => { const c = chuan(h); return /\b(sdt|so dien thoai|dien thoai|phone|zalo|cccd|cmnd|email|lien he)\b/.test(c) ? "bo_qua" as const : BI_DANH_COT[c] ?? null; });
  const laCot = tieuDe.filter((h, i) => cot[i] === null && h.trim());
  const nhanRa = tieuDe.filter((_, i) => cot[i] && cot[i] !== "bo_qua");
  return { cot, laCot, nhanRa };
}

export type KetQuaNhap = { dong: DongNhap[]; laCot: string[]; nhanRa: string[]; loi: string | null };

/** Bảng chữ (hàng đầu là tiêu đề) → danh sách tin. Hàng không có địa chỉ lẫn dự án lẫn giá thì bỏ. */
export function bangThanhTin(bang: string[][], macDinh: { deal?: "ban" | "cho_thue" } = {}): KetQuaNhap {
  if (!bang.length) return { dong: [], laCot: [], nhanRa: [], loi: "bảng trống" };
  const { cot, laCot, nhanRa } = anhXaCot(bang[0]);
  if (!cot.some((c) => c && c !== "bo_qua")) return { dong: [], laCot, nhanRa, loi: "không nhận ra cột nào (cần ít nhất: địa chỉ, giá, diện tích)" };
  const dong: DongNhap[] = [];
  bang.slice(1).forEach((hang, i) => {
    const o: Record<string, string> = {};
    hang.forEach((v, j) => {
      const k = cot[j];
      if (!k || k === "bo_qua" || !v?.trim()) return;
      o[k] = o[k] ? `${o[k]} ${v.trim()}` : v.trim();
    });
    if (!o.location_raw && !o.du_an && !o.price_raw && !o.area_m2) return;
    const thieu: string[] = [];
    const deal = (o.deal ? docGiaoDich(o.deal) : null) ?? macDinh.deal ?? "ban";
    const loai = o.property_type ? docLoaiBds(o.property_type) : null;
    const area = o.area_m2 ? docM2(o.area_m2) : null;
    if (!o.location_raw && !o.du_an) thieu.push("địa chỉ");
    if (!o.price_raw) thieu.push("giá");
    if (!area) thieu.push("diện tích");
    dong.push({
      stt: i + 1,
      deal,
      property_type: loai ?? (o.du_an || o.ma_can ? "chung_cu" : "chua_ro"),
      location_raw: o.location_raw ?? null,
      ward: o.ward ?? null, // dòng nhập thô (chưa ghi DB) — chat-reply chuẩn hoá qua tenPhuongCot khi ghi
      district: o.district ?? null,
      area_m2: area,
      price_raw: o.price_raw ?? null,
      floors_text: o.floors_text ?? null,
      bedrooms: o.bedrooms ? docSoPhong(o.bedrooms) : null,
      legal_status: o.legal_status ? docPhapLy(o.legal_status) : null,
      huong: o.huong ?? null,
      du_an: o.du_an ?? null,
      ma_can: o.ma_can ?? null,
      mo_ta: o.mo_ta ?? null,
      hem: o.hem ?? null,
      thieu,
    });
  });
  return { dong, laCot, nhanRa, loi: null };
}

/** Câu rao một dòng từ các ô — làm `description` của tin (trigger DB bóc thông số từ đây như câu rao thường). */
export function cauRaoTuDong(d: DongNhap): string {
  const p: string[] = [];
  p.push(d.deal === "cho_thue" ? "Cho thuê" : "Bán");
  if (d.du_an) p.push(`${d.ma_can ? `căn ${d.ma_can} ` : ""}dự án ${d.du_an}`);
  if (d.location_raw) p.push(d.location_raw);
  if (d.ward) p.push(d.ward);
  if (d.district) p.push(d.district);
  if (d.area_m2) p.push(`${d.area_m2}m2`);
  if (d.floors_text) p.push(d.floors_text);
  if (d.bedrooms) p.push(`${d.bedrooms} phòng ngủ`);
  if (d.hem) p.push(`hẻm ${d.hem}`);
  if (d.huong) p.push(`hướng ${d.huong}`);
  if (d.legal_status) p.push({ so_hong_rieng: "sổ hồng riêng", so_hong_chung: "sổ hồng chung", so_hong: "có sổ hồng", hdmb: "hợp đồng mua bán", giay_tay: "giấy tay" }[d.legal_status] ?? d.legal_status);
  if (d.price_raw) p.push(`giá ${d.price_raw}`);
  if (d.mo_ta) p.push(d.mo_ta);
  return p.join(", ") + ".";
}
