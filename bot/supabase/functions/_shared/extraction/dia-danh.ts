// dia-danh.ts — DÒ ĐỊA DANH CHUNG (01/10/2026).
//
// Chủ dự án 01/10: "khi nào người ta đưa tên lên thì có thể đó là đường phường xã quận gì đó, vào search được đúng
// không … làm hàm dò địa danh chung đi, dò bằng schematic; nếu 137/28 thì là hẻm rồi, đường số 59 hoặc đường có tên
// là đường lớn". DB trả ứng viên ở cả bốn từ điển (`tim_dia_danh`, 20261001e: đúng chữ / đảo chữ / sai 1 ký tự; khi
// rỗng thì `tim_dia_danh_theo_nghia` — vector). Ở đây chỉ CHỌN: tên đó là phường, quận hay đường, theo ngữ cảnh câu
// đang hỏi; mập mờ (cùng tên ở hai loại mà ngữ cảnh không phân xử) thì không chọn.
//
// THUẦN: không fetch, không RPC (bot/tests/ranh-gioi.mjs canh).

const boDau = (s: string): string =>
  s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export type UngVienDiaDanh = {
  loai: string; ten: string; ten_day_du: string | null; phuong: string | null; quan_cu: string | null; khoang_cach: number;
};
export type NhomDiaDanh = "phuong" | "quan" | "duong";
export type DiaDanhChon = { nhom: NhomDiaDanh; ten: string; quan_cu: string | null };

const nhomCua = (loai: string): NhomDiaDanh =>
  loai === "phuong_moi" || loai === "phuong_cu" ? "phuong" : loai === "quan_cu" ? "quan" : "duong";
/** Giá trị ghi được của một ứng viên: phường (cũ hay mới) → tên đầy đủ phường MỚI; quận / đường → tên. */
const giaTriCua = (u: UngVienDiaDanh): string | null => nhomCua(u.loai) === "phuong" ? u.phuong : u.ten;
const quanKhop = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !a || !b || boDau(a).replace(/\s+/g, " ").trim() === boDau(b).replace(/\s+/g, " ").trim();

/**
 * Chọn MỘT địa danh từ ứng viên của `tim_dia_danh`: giữ ứng viên gần nhất; chúng chỉ thuộc một nhóm thì lấy nhóm đó.
 * Nhiều nhóm: chữ khách GÕ trước tên (`tienTo`: "phường …", "đường …") quyết; không gõ thì câu đang hỏi (`cauHoi`) quyết
 * giữa phường và đường — nhưng tên trùng QUẬN cũ ("Gò Vấp", "Bình Thạnh") mà khách không gõ "phường" thì không đoán.
 * Trong nhóm phải ra đúng MỘT giá trị (phường cũ tách về hai phường mới, tên đường ở hai quận → không chọn).
 * `quanBiet`: quận cũ của tin đã biết chắc — ứng viên phường / đường ở quận khác bị loại.
 */
export function chonDiaDanh(
  ds: UngVienDiaDanh[] | null | undefined,
  { tienTo = null, cauHoi = null, quanBiet = null }: { tienTo?: NhomDiaDanh | null; cauHoi?: NhomDiaDanh | null; quanBiet?: string | null } = {},
): DiaDanhChon | null {
  let c = (ds ?? []).filter((u) => giaTriCua(u) && (nhomCua(u.loai) === "quan" || quanKhop(u.quan_cu, quanBiet)));
  if (!c.length) return null;
  const min = Math.min(...c.map((u) => u.khoang_cach));
  c = c.filter((u) => u.khoang_cach === min);
  const nhom = new Set(c.map((u) => nhomCua(u.loai)));
  const chon: NhomDiaDanh | null = tienTo && nhom.has(tienTo) ? tienTo
    : nhom.size === 1 ? [...nhom][0]
    : cauHoi && nhom.has(cauHoi) && (cauHoi === "quan" || !nhom.has("quan")) ? cauHoi
    : null;
  if (!chon) return null;
  const trong = c.filter((u) => nhomCua(u.loai) === chon);
  const giaTri = new Set(trong.map((u) => giaTriCua(u)!));
  if (giaTri.size !== 1) return null;
  const quan = new Set(trong.map((u) => u.quan_cu).filter((q): q is string => !!q));
  return { nhom: chon, ten: [...giaTri][0], quan_cu: quan.size === 1 ? [...quan][0] : null };
}

// Chữ đệm quanh một tên trơn ("ở tân định nha em", "dạ gò vấp á").
const DEM_DAU = /^(?:(?:dạ|da|vâng|vang|ừ|u|ở|o|tại|tai|thuộc|thuoc|bên|ben|khu|khu vực|khu vuc|nhà|nha|em ơi|e oi|em oi)\s+)+/iu;
const DEM_CUOI = /(?:\s+(?:nha|nhé|nhe|nhen|em|e|ạ|a|đó|do|á|nè|ne|ơi|oi|luôn|luon|anh|chị|chi|đấy|day|thôi|thoi))+$/iu;
const TIEN_TO: Array<[RegExp, NhomDiaDanh]> = [
  [/^(?:phường|phuong|p\.?|xã|xa|thị trấn|thi tran|tt\.?)\s+/iu, "phuong"],
  [/^(?:quận|quan|q\.?|huyện|huyen|thành phố|thanh pho|tp\.?|thị xã|thi xa)\s+/iu, "quan"],
  [/^(?:đường|duong|đ\.|phố|pho)\s+/iu, "duong"],
];
// Lời đáp chung / chữ thông số — không phải tên. Không đưa vào đây chữ hay gặp TRONG tên ("hội", "gia", "cần", "cô",
// "lâm", "thị", "hà", "mai", "chợ": Thông Tây Hội, Gia Định, Cần Giờ, Cô Giang, Mai Chí Thọ, Chợ Quán…). "ban" (bán) có
// trong đây nên "bàn cờ" trơn không dò — khách gõ "phường bàn cờ" thì đường tra cũ (`tachTienToPhuong`) lo.
const KHONG_PHAI_TEN = /^(?:vang|uh|ok|oke|khong|ko|chua|roi|biet|sao|gi|nao|mua|thue|tim|qua|dep|tot|xong|duoc|nhieu|het|rat|luon|nua|chac|vay|hem|hxh|so|phong|ngu|tang|lau|gap|rieng|ty|trieu|met|de|noi|tiep|xem|goi|ban)$/;

/**
 * Tin chỉ là MỘT tên địa danh trơn ("tân định", "phường tây thạnh nha", "ở gò vấp á") → { ten, tienTo }; tin có số, có
 * dấu hỏi, dài hơn 5 chữ hay có chữ không phải tên (sổ, hẻm, giá…) → null. `tienTo` = loại khách tự gõ trước tên.
 */
export function tenDiaDanhTron(tin: string | null | undefined): { ten: string; tienTo: NhomDiaDanh | null } | null {
  let t = (tin ?? "").normalize("NFC").replace(/[.,!…]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t || /[\d?/]/.test(t)) return null;
  t = t.replace(DEM_CUOI, "").replace(DEM_DAU, "").replace(DEM_CUOI, "").trim();
  let tienTo: NhomDiaDanh | null = null;
  for (const [re, n] of TIEN_TO) {
    if (re.test(t)) { tienTo = n; t = t.replace(re, "").trim(); break; }
  }
  const tu = boDau(t).split(" ").filter(Boolean);
  if (tu.length < 1 || tu.length > 5 || boDau(t).replace(/[^a-z]/g, "").length < 4) return null;
  if (tu.some((w) => !/^[a-z]+$/.test(w) || KHONG_PHAI_TEN.test(w))) return null;
  // Một chữ trơn ("bình") quá mơ hồ — trừ khi khách gõ "phường / quận / đường" trước.
  if (tu.length === 1 && !tienTo) return null;
  return { ten: t, tienTo };
}

/**
 * Loại đường vào đọc từ SỐ NHÀ của địa chỉ (chủ dự án 01/10: "nếu 137/28 thì là hẻm rồi, đường số 59 hoặc đường có tên
 * là đường lớn"): "137/28 Đường số 59" → `hem`; "156 Nguyễn Trãi", "156 đường số 59" → `mat_tien`. Địa chỉ không mở đầu
 * bằng số nhà, hay câu có chữ hẻm / kiệt / ngõ / "cách mặt tiền" → null (không suy).
 */
export function loaiDuongVaoTuDiaChi(diaChi: string | null | undefined, chuKhac = ""): "hem" | "mat_tien" | null {
  const kd = boDau(diaChi ?? "").replace(/\s+/g, " ").trim();
  if (!kd) return null;
  if (/^(?:so\s+)?\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?(?:\s*\/\s*\d{1,4}[a-z]?)*\s+[a-z]/.test(kd)) return "hem";
  const tatCa = `${kd} ${boDau(chuKhac)}`;
  if (/\b(?:hem|hxh|hxm|kiet|ngo|ngach|xec|xuyet|cach mat tien|cach mt)\b/.test(tatCa)) return null;
  // Số nhà trơn rồi tới TÊN đường (chữ) hoặc "đường số N"; không phải "lô / căn / block / tầng / m".
  const m = /^(?:so\s+(?:nha\s+)?)?\d{1,4}[a-ln-z]?\s+((?:duong\s+)?(?:so\s+\d{1,3}[a-z]?\b|[a-z]{2,}))/.exec(kd);
  if (!m) return null;
  if (/^(?:m|met|m2|tang|lau|tam|lo|can|block|phong|x|ty|trieu|nam|ngang|dai|dt)\b/.test(m[1])) return null;
  return "mat_tien";
}

/** Lõi tên quận để so: "Quận Gò Vấp" → "go vap", "Quận 5" → "5", "Thành phố Thủ Đức" → "thu duc". */
const loiQuan = (q: string): string =>
  boDau(q).replace(/\s+/g, " ").trim().replace(/^(?:quan|huyen|thanh pho|thi xa|tp\.?)\s+/, "");
/** Hai tên quận (cũ) có cùng một quận không. */
export function cungQuan(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && loiQuan(a) === loiQuan(b);
}
/**
 * Tin khách có nhắc tới quận `quan` không ("gò vấp em", "quận 5", "q5", "ở tân phú"). Quận SỐ phải có chữ quận / q đi
 * trước ("5" trơn là số khác).
 */
export function nhacTenQuan(tin: string | null | undefined, quan: string | null | undefined): boolean {
  if (!tin || !quan) return false;
  const kd = ` ${boDau(tin).replace(/[^a-z0-9]+/g, " ").trim()} `;
  const loi = loiQuan(quan);
  if (!loi) return false;
  if (/^\d+$/.test(loi)) return new RegExp(`(?:quan|q)\\s*${loi}(?!\\d)`).test(kd);
  return kd.includes(` ${loi} `);
}

/**
 * Phường mới mang đúng tên quận cũ của nó ("Phường Gò Vấp" thuộc Quận Gò Vấp cũ, "Phường Bình Thạnh"…). Khách gõ tên đó mà
 * không có chữ "phường" là đang nói QUẬN — cùng luật `timPhuongTrongCau`.
 */
export function phuongTrungTenQuan(tenPhuong: string | null | undefined, quanCu: string | null | undefined): boolean {
  if (!tenPhuong || !quanCu) return false;
  const p = boDau(tenPhuong).replace(/\s+/g, " ").trim().replace(/^(?:phuong|xa|thi tran)\s+/, "");
  return !!p && p === loiQuan(quanCu);
}
/** Tin có chữ "phường / p." đi trước một tên không. */
export const coChuPhuong = (tin: string | null | undefined): boolean => /(?:^|[^a-z])(?:phuong|p\.)\s*[a-z]/.test(boDau(tin ?? ""));
