// hien-thi-dia-chi.ts — MỘT NGUỒN in địa chỉ cho khách (SRS-5.1zzzzj, 09/10/2026). THUẦN: không fetch, không RPC.
//
// Bắn production 09/10: "a can ban gap nha hem xe hoi duong pham van chieu p14 go vap" → `location_raw` "duong Phạm Văn Chiêu" (tên
// đường đã tra từ điển, chữ "duong" giữ nguyên chữ khách — ô nguyên văn, O_NGUYEN_VAN), rồi 📝 "bán nhà phố · duong Phạm Văn Chiêu ·
// Phường An Hội Tây", 🤖 "địa chỉ: duong Phạm Văn Chiêu…". Lớp lỗi: cột LƯU nguyên văn (đúng thiết kế — để đối chiếu, để AI đọc lại)
// nhưng mỗi chỗ IN (📝, 🤖, 📋, câu xác nhận) đọc thẳng cột đó, mỗi chỗ một hàm ghép riêng (`gonDiaChi` bao_lai.ts, `diaChiGon`
// tin-nhap.ts, dòng 📝 chat-reply). Nay: lưu nguyên văn, IN qua đây — cùng mẫu với `donViGiaDep` (luat-tien.ts) cho giá.
//   • phần đường / hẻm / số nhà: chữ viết tắt / không dấu của TỪ LOẠI ("duong", "dg", "hem", "so 12") → chữ chuẩn; tên đường khớp
//     cột `street` (tên từ điển, có dấu) khi bỏ dấu → in tên từ điển; bỏ đuôi phường / quận / thành phố khách gõ kèm (phần đó in từ
//     cột chuẩn `ward` / `district`, không bao giờ từ chữ khách);
//   • phường: cột `ward` (chỉ mang tên chuẩn — `tenPhuongCot`); quận: cột `district`.

const boDau = (s: string): string =>
  s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Đuôi hành chính khách gõ kèm địa chỉ: "phường 6 quận 3 cũ", "p14 go vap", ", Q.5", "tp hcm". Cắt từ chỗ đầu tiên. */
const DUOI_HC = /(?:^|[\s,;(])(?:phường|phuong|p\.?\s*\d{1,2}(?!\d)|xã|xa|thị trấn|thi tran|quận|quan|q\.?\s*\d{1,2}(?!\d)|huyện|huyen|thành phố|thanh pho|tp\.?|hcm|tphcm|hồ chí minh|ho chi minh|sài gòn|sai gon)(?![\p{L}])/iu;
/** Từ loại viết tắt / không dấu → chữ chuẩn (chỉ TỪ LOẠI, không đụng tên riêng). */
// Chỉ khi từ loại ĐỨNG ĐẦU một vế (đầu chuỗi, sau dấu phẩy, sau số nhà / số hẻm, hay sau một từ loại khác) — "au duong lan" (Âu Dương
// Lân gõ không dấu) có chữ "duong" giữa tên riêng, không phải từ loại.
const DAU_VE = "(^|[,(]\\s*|(?:^|\\s)[\\d/]+[a-z]?\\s+|(?:^|\\s)(?:hẻm|hem|số|so|đường|duong|ngõ|ngo|kiệt|kiet|mặt tiền|mat tien)\\s+)";
const TU_LOAI: ReadonlyArray<[RegExp, string]> = [
  [new RegExp(`${DAU_VE}(?:duong|đg|dg|đ\\.|d\\.)(?=\\s|$)`, "giu"), "$1đường"],
  [new RegExp(`${DAU_VE}hxh(?=\\s|$)`, "giu"), "$1hẻm xe hơi"],
  [new RegExp(`${DAU_VE}hxm(?=\\s|$)`, "giu"), "$1hẻm xe máy"],
  [new RegExp(`${DAU_VE}hem(?=\\s|$)`, "giu"), "$1hẻm"],
  [new RegExp(`${DAU_VE}ngo(?=\\s|$)`, "giu"), "$1ngõ"],
  [new RegExp(`${DAU_VE}kiet(?=\\s|$)`, "giu"), "$1kiệt"],
  [new RegExp(`${DAU_VE}(?:mt|mat tien)(?=\\s|$)`, "giu"), "$1mặt tiền"],
  [/(^|[\s,(])(?:so|sn)(?=\s*\d)/giu, "$1số"],
];
/** Chữ đệm còn trơ lại sau khi cắt đuôi hành chính ("o q10" → "o"). */
const CHI_DEM = /^(?:ở|o|tại|tai|thuộc|thuoc|bên|ben|nhà|nha|khu|gần|gan)$/iu;

/**
 * Phần ĐƯỜNG của địa chỉ để in cho khách, từ `location_raw` (nguyên văn) + `street` (tên đường từ điển, có thể null).
 * "duong pham van chieu p14 go vap" + "Phạm Văn Chiêu" → "Đường Phạm Văn Chiêu"; "o q10" → "" (chỉ là hành chính).
 */
export function duongHienThi(locationRaw: string | null | undefined, street: string | null | undefined = null): string {
  let t = (locationRaw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = DUOI_HC.exec(t);
  if (m) t = t.slice(0, m.index).trim();
  t = t.replace(/[\s,;.\-–—:]+$/u, "").trim();
  if (!t || CHI_DEM.test(t)) return "";
  for (const [re, thay] of TU_LOAI) t = t.replace(re, thay);
  // Tên đường từ điển (có dấu) khi chữ khách là cùng tên bỏ dấu / khác hoa thường.
  const st = (street ?? "").normalize("NFC").trim();
  if (st && !t.includes(st)) {
    const i = boDau(t).indexOf(boDau(st));
    if (i >= 0) t = t.slice(0, i) + (i > 0 ? st.replace(/^Đường(?=\s)/u, "đường") : st) + t.slice(i + st.length);
  }
  return t.charAt(0).toLocaleUpperCase("vi") + t.slice(1);
}

/** `duongHienThi` đặt GIỮA câu ("căn hẻm 45 Nguyễn Trãi", "Bán nhà phố đường Lê Lợi"): từ loại đầu chữ thường, tên riêng giữ hoa. */
export function duongGiuaCau(locationRaw: string | null | undefined, street: string | null | undefined = null): string {
  return duongHienThi(locationRaw, street).replace(/^(?:Hẻm|Đường|Số|Ngõ|Kiệt|Mặt tiền)(?=\s)/u, (m) => m.toLocaleLowerCase("vi"));
}

/** Bỏ mảnh trùng ("…, quận 5, Phường 2, Quận 5") và dấu phẩy kép — ghép các mảnh ĐÃ chuẩn. */
export function ghepDiaChi(...manh: Array<string | null | undefined>): string {
  const ra: string[] = [];
  for (const m of manh) {
    for (const p of (m ?? "").split(",")) {
      const s = p.trim();
      if (s && !ra.some((x) => boDau(x) === boDau(s))) ra.push(s);
    }
  }
  return ra.join(", ");
}

export type DongDiaChi = { location_raw?: string | null; street?: string | null; ward?: string | null; district?: string | null };
/**
 * Địa chỉ đủ để in: đường (đã chuẩn) · phường (cột chuẩn) · quận (cột, hoặc chữ nơi gọi đưa — "(chưa rõ quận)", null = không in).
 * Không bao giờ in chữ khách gõ cho phường / quận.
 */
export function diaChiHienThi(l: DongDiaChi | null | undefined, quan: string | null | undefined = l?.district ?? null): string {
  if (!l) return "";
  return ghepDiaChi(duongHienThi(l.location_raw, l.street), l.ward, quan);
}
