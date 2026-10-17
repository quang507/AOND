// tra-phuong.ts — FR-209 (15/09/2026): tra PHƯỜNG MỚI từ TÊN ĐƯỜNG qua Nominatim.
//
// Chủ dự án 15/09 (Zalo thật): "căn hộ 5 tầng… đường Lê Văn Việt mới làm lại… số
// nhà tôi là số 449" → bot đáp "Quận 5 (chưa rõ quận)" rồi hỏi "phường mấy" —
// "nếu có địa chỉ và tên đường rồi thì tự search phường quận được không chứ".
//
// Nominatim (OSM) sau 07/2025 trả PHƯỜNG MỚI (`address.suburb = "Phường Tăng
// Nhơn Phú"`) mà KHÔNG có quận — OSM đã bỏ ranh giới quận. Quận cũ lấy từ bảng
// `wards` (NQ 1685/NQ-UBTVQH15). Chủ dự án chốt OPEN-27 nửa sau cùng ngày: LƯU
// TÊN PHƯỜNG MỚI "cho nó dùng được Nominatim"; bot HỎI XÁC NHẬN trước khi ghi.
//
// File này THUẦN (không fetch, không RPC — bot/tests/ranh-gioi.mjs canh): dựng
// URL, đọc JSON Nominatim, soạn câu hỏi xác nhận. Gọi mạng nằm ở chat-reply.

export type PhuongNominatim = { ten: string; loai: "phuong" | "xa" | "dac_khu"; ten_day_du: string };

const boDau = (s: string): string =>
  s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

/** Bỏ chữ "đường/phố" đứng đầu: "đường Lê Văn Việt" → "Lê Văn Việt" (Nominatim tra tên trần chắc hơn). */
export function chuanTenDuong(duong: string | null | undefined): string {
  return (duong ?? "").replace(/^\s*(?:đường|duong|phố|pho|đ\.)\s+(?!(?:số|so)?\s*\d)/iu, "").replace(/\s+/g, " ").trim();
}

/** Tên đường đủ để tra: có ≥ 2 chữ cái, không phải "đường số 7" (trùng khắp thành phố). */
export function duongTraDuoc(duong: string | null | undefined): boolean {
  const d = chuanTenDuong(duong);
  if (!/[\p{L}]{2}/u.test(d)) return false;
  return !/^(?:đường|duong)?\s*(?:số|so)?\s*\d+[a-z]?$/i.test(d);
}

/**
 * URL tra Nominatim cho một tên đường ở TP.HCM. Ghim `countrycodes=vn`, xin
 * `addressdetails=1` để đọc `address.suburb`.
 *
 * 23/09/2026 (Zalo chủ dự án): "105 Trần Bình Trọng" → bot "thuộc Phường Vườn Lài (Quận 10 cũ)"
 * trong khi số 105 ở Chợ Quán (Q5 cũ). Bản trước xin `limit=1`: sau sáp nhập 07/2025 tên
 * "Trần Bình Trọng" có ở ~7 phường (Q5, Q10, Bình Thạnh, Gò Vấp, Vũng Tàu, Thủ Dầu Một…),
 * OSM không có số nhà, thứ tự kết quả đổi giữa hai lần gọi — lấy một là bốc thăm. Nay xin
 * 10 kết quả để BIẾT đường có ở nhiều nơi hay không (`docCacPhuongNominatim`).
 */
export function urlTraPhuong(duong: string): string {
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&countrycodes=vn&q=${encodeURIComponent(cauTraPhuong(duong))}`;
}

/** Câu tra của `urlTraPhuong` — 25/09/2026 (FR-227): chat-reply gửi câu này qua RPC `tra_nominatim` (IP edge bị chặn). */
export function cauTraPhuong(duong: string): string {
  return `${chuanTenDuong(duong)}, Thành phố Hồ Chí Minh`;
}

// Tiền tố + tên, ở BẤT KỲ đâu trong câu: "không, phường long trường" (câu sửa của chủ
// nhà) cũng phải ra "long trường". Tên dừng ở dấu câu; "phường nào/mấy" không phải tên.
// `\b` của JS không hiểu chữ có dấu ("gì", "đó") → dùng (?![\p{L}]).
const TIEN_TO_RE = /(?:^|[\s,.;:!?(])(phường|phuong|xã|xa|đặc khu|dac khu)\s+(?!(?:nào|nao|mấy|may|gì|gi|đó|do|này|nay)(?![\p{L}]))([^,.;:!?\n()]{1,40})/iu;
// Câu CÓ DẤU thì chỉ nhận tiền tố có dấu: "nhà xa trung tâm", "phương án" không phải xã/phường.
// Dạng không dấu ("phuong tan dinh", "xa cu chi") chỉ dành cho người gõ trần cả câu.
const TIEN_TO_CO_DAU_RE = /(?:^|[\s,.;:!?(])(phường|xã|đặc khu)\s+(?!(?:nào|mấy|gì|đó|này)(?![\p{L}]))([^,.;:!?\n()]{1,40})/iu;
const CO_DAU_RE = /[\u0300-\u036f]|đ/i;

/** "Phường Tăng Nhơn Phú" → { ten: "Tăng Nhơn Phú", loai: "phuong" }; không tiền tố → null. */
export function tachTienToPhuong(s: string | null | undefined): PhuongNominatim | null {
  const goc = (s ?? "").trim();
  const coDau = CO_DAU_RE.test(goc.normalize("NFD"));
  const m = (coDau ? TIEN_TO_CO_DAU_RE : TIEN_TO_RE).exec(goc);
  if (!m) return null;
  const tt = boDau(m[1]).toLowerCase();
  const loai = tt === "phuong" ? "phuong" : tt === "xa" ? "xa" : "dac_khu";
  // 15/09/2026 (bắn thử 07:21 UTC): "xã Tân Kiên đó em" → cột phường ghi nguyên "xã Tân
  // Kiên đó em". Chữ đệm cuối câu (đó/nha/ạ/em/anh/chị…) không phải tên — cắt đi. 23/09: cả lời xưng
  // với người lớn tuổi ("xã Long Thượng cháu" → cột phường ghi nguyên chữ "cháu").
  const ten = m[2].replace(/\s+/g, " ").trim()
  // Chỉ chữ đệm CÓ DẤU hoặc không thể là tên: "chi"/"a"/"do" không dấu thì để yên ("Xã Củ Chi").
    .replace(/(?:\s+(?:đó|đấy|đây|nha|nhé|nhe|nhen|hen|ạ|á|em|anh|chị|cháu|cô|chú|bác|dì|ông|bà|cậu|mợ|thím|dượng|ơi|luôn|rồi|nè|đúng không|phải không))+$/iu, "");
  // Tên phường mới là CHỮ ("Tăng Nhơn Phú"); có số ("8 quận 5") là phường cũ đánh số → đường chuan_hoa_phuong.
  if (!/[\p{L}]{2}/u.test(ten) || /\d/.test(ten)) return null;
  const tienTo = loai === "phuong" ? "Phường" : loai === "xa" ? "Xã" : "Đặc khu";
  return { ten, loai, ten_day_du: `${tienTo} ${ten}` };
}

/**
 * Đọc phường từ JSON Nominatim (mảng kết quả jsonv2). Chỉ nhận khi kết quả nằm
 * trong TP.HCM (address.city / state có "Hồ Chí Minh") và là đường/địa điểm chứ
 * không phải cả thành phố; ô phường có thể nằm ở suburb / quarter / city_district
 * / town / village tuỳ cách OSM gắn thẻ.
 */
export function docPhuongNominatim(json: unknown): PhuongNominatim | null {
  if (!Array.isArray(json) || !json.length) return null;
  return phuongCuaKetQua(json[0]);
}

function phuongCuaKetQua(r0: unknown): PhuongNominatim | null {
  const r = (r0 ?? {}) as Record<string, unknown>;
  const addr = (r.address ?? {}) as Record<string, unknown>;
  const tp = boDau(String(addr.city ?? addr.state ?? addr.province ?? "")).toLowerCase();
  if (!/ho chi minh/.test(tp)) return null;
  if (/^(city|state|province|country|municipality|region)$/.test(String(r.addresstype ?? r.type ?? ""))) return null;
  for (const k of ["suburb", "quarter", "city_district", "town", "village", "neighbourhood"]) {
    const p = tachTienToPhuong(typeof addr[k] === "string" ? (addr[k] as string) : null);
    if (p) return p;
  }
  return null;
}

/** MỌI phường khác nhau trong kết quả Nominatim (TP.HCM, bỏ kết quả cấp thành phố), theo thứ tự gặp. */
export function docCacPhuongNominatim(json: unknown): PhuongNominatim[] {
  if (!Array.isArray(json)) return [];
  const ra: PhuongNominatim[] = [];
  const da = new Set<string>();
  for (const r of json) {
    const p = phuongCuaKetQua(r);
    if (!p) continue;
    const k = boDau(p.ten_day_du).toLowerCase();
    if (da.has(k)) continue;
    da.add(k);
    ra.push(p);
  }
  return ra;
}

/**
 * Đường có ở NHIỀU nơi → KHÔNG đoán phường; hỏi thẳng, kể các quận cũ tra được để chủ nhà chọn
 * ("Đường Trần Bình Trọng có ở nhiều nơi (Quận 5, Quận 10, Bình Thạnh…), nhà mình thuộc phường nào, quận nào vậy anh?").
 */
export function cauNhieuNoiPhuong(cachGoi: string, duong: string, quan: string[]): string {
  const ds = quan.slice(0, 4).join(", ") + (quan.length > 4 ? "…" : "");
  return `Đường ${duong.trim()} có ở nhiều nơi (${ds}), nhà mình thuộc phường nào, quận nào vậy ${cachGoi}?`;
}

/** Câu hỏi xác nhận trước khi ghi (chủ dự án 15/09: "bot hỏi xác nhận trước khi ghi"). */
export function cauXacNhanPhuong(mau: string, cachGoi: string, duong: string, tenDayDu: string, quanCu: string): string {
  const Ac = cachGoi.charAt(0).toUpperCase() + cachGoi.slice(1);
  return mau
    .replace(/\{ac\}/g, cachGoi).replace(/\{Ac\}/g, Ac)
    .replace(/\{duong\}/g, duong.trim()).replace(/\{phuong\}/g, tenDayDu).replace(/\{quan\}/g, quanCu);
}

/**
 * Đã biết QUẬN (cũ) + tên đường, bảng `duong` cho ra 2–3 phường mới trong quận đó → hỏi CHỌN thay vì hỏi trống
 * (25/09/2026, chủ dự án: "người ta đưa số nhà và tên đường và quận rồi nhưng mà lại cố hỏi là phường nào").
 */
export function cauChonPhuong(cachGoi: string, duong: string, phuong: string[]): string {
  const ds = phuong.slice(0, 3);
  const noi = ds.length === 2 ? ds.join(" hay ") : ds.slice(0, -1).join(", ") + " hay " + ds[ds.length - 1];
  return `Đường ${duong.trim()} đoạn nhà mình thuộc ${noi} vậy ${cachGoi}?`;
}

/** Phường MỚI (khác nhau, không rỗng) của một tên đường trong một quận cũ — từ các dòng bảng `duong`. */
export function phuongCuaDuongTrongQuan(dong: Array<{ phuong?: string | null; quan_cu?: string | null }>, quan: string): string[] {
  const ra: string[] = [];
  for (const d of dong) {
    const p = (d.phuong ?? "").trim();
    if (p && d.quan_cu === quan && !ra.includes(p)) ra.push(p);
  }
  return ra;
}

export type PhuongQuan = { phuong: string; quan: string };
/**
 * SRS-5.1zzzzzzm (14/10/2026): các cặp (phường mới, quận cũ) KHÁC NHAU của một tên đường từ bảng `duong`, CHƯA CẦN biết quận. Đã biết quận
 * (`quanBiet`) → chỉ giữ quận đó. `hopLe(phuong, quan)` do nơi gọi đưa (bảng `wards` TP.HCM) để bỏ dòng tỉnh khác / dòng trống phường.
 * Người test thật 14/10: chưa biết quận → bản cũ đi Nominatim, Nominatim trả MỘT phường cho con đường bảng `duong` biết có 4 phường
 * (Phú Thuận, Tân Mỹ, Tân Thuận ở Quận 7 cũ, Xã Nhà Bè) → bot hỏi có/không một phường đoán, khách sửa, tin vẫn ghi phường đoán.
 */
export function phuongQuanCuaDuong(
  dong: Array<{ phuong?: string | null; quan_cu?: string | null }>, quanBiet: string | null | undefined,
  hopLe: (phuong: string, quan: string) => boolean,
): PhuongQuan[] {
  const ra: PhuongQuan[] = [];
  for (const d of dong) {
    const p = (d.phuong ?? "").trim(), q = (d.quan_cu ?? "").trim();
    if (!p || !q || (quanBiet && q !== quanBiet) || !hopLe(p, q)) continue;
    if (!ra.some((x) => x.phuong === p && x.quan === q)) ra.push({ phuong: p, quan: q });
  }
  return ra;
}

/**
 * Câu CHỌN phường khi đường chạy qua 2–4 phường, có thể ở nhiều quận cũ: cùng một quận → như `cauChonPhuong`; nhiều quận → kể từng
 * cụm kèm quận ("Phường Phú Thuận, Phường Tân Mỹ hay Phường Tân Thuận (Quận 7 cũ), hay Xã Nhà Bè (Huyện Nhà Bè cũ)").
 */
export function cauChonPhuongQuan(cachGoi: string, duong: string, ds: PhuongQuan[]): string {
  const cac = ds.slice(0, 4);
  const quan = [...new Set(cac.map((x) => x.quan))];
  if (quan.length <= 1) return cauChonPhuong(cachGoi, duong, cac.map((x) => x.phuong));
  const noi = (ten: string[]) => ten.length === 1 ? ten[0] : ten.length === 2 ? ten.join(" hay ") : ten.slice(0, -1).join(", ") + " hay " + ten[ten.length - 1];
  const cum = quan.map((q) => `${noi(cac.filter((x) => x.quan === q).map((x) => x.phuong))} (${q} cũ)`);
  return `Đường ${duong.trim()} đoạn nhà mình thuộc ${cum.join(", hay ")} vậy ${cachGoi}?`;
}
