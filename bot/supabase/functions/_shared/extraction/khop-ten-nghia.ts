// khop-ten-nghia.ts — KIỂM ứng viên tìm theo NGHĨA (vector) trước khi nhận (30/09/2026).
//
// Chủ dự án 30/09: "2 hàm tìm theo nghĩa cho địa danh và dự án đang nằm không trong DB … làm đi". Vector
// (`tim_du_an_theo_nghia`, `tim_dia_danh_theo_nghia`) trả các ứng viên GẦN NGHĨA nhất — nhưng "gần nghĩa" chưa phải "đúng
// tên": "Vinhomes Grand Park" và "Vinhomes Central Park" gần nhau lắm. Nên máy chỉ nhận ứng viên mà TÊN còn gần chữ khách
// gõ (gõ sai vài chữ cái, thiếu chữ "s", viết liền / tách, thiếu từ chung như "the / khu / căn hộ"), và phải là ĐÚNG MỘT
// tên. Vector tìm, máy xác nhận.
//
// THUẦN: không fetch, không RPC (bot/tests/ranh-gioi.mjs canh).

const boDau = (s: string): string =>
  s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Từ chung của tên dự án — cùng bộ với `match_projects` trên DB. */
export const TU_CHUNG_DU_AN: ReadonlySet<string> = new Set([
  "the", "khu", "can", "ho", "nha", "pho", "dat", "nen", "city", "garden", "residence", "apartment", "tower", "block",
  "phan", "du", "an", "project", "eco", "new", "and", "chung", "cu", "biet", "thu", "villa", "shophouse", "do", "thi", "dan",
]);
/** Từ chung của tên đường. */
export const TU_CHUNG_DUONG: ReadonlySet<string> = new Set(["duong", "pho", "hem", "hxh", "ngo", "kiet"]);

const tuLoi = (s: string, bo: ReadonlySet<string>): string[] =>
  boDau(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w && !bo.has(w));

const lev = (a: string, b: string): number => {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
};

/**
 * Tên khách gõ `go` có phải là tên trong kho `kho` gõ sai / thiếu không. So trên chuỗi LIỀN (bỏ dấu, bỏ từ chung): lệch
 * tối đa ¼ độ dài (ít nhất 1, tối đa 4 ký tự), chữ số phải y hệt ("Quận 7" ≠ "Quận 9", "đường số 5" ≠ "đường số 6").
 * Tên quá ngắn (< 4 ký tự lõi) thì không đoán.
 */
export function tenGan(go: string | null | undefined, kho: string | null | undefined, bo: ReadonlySet<string>): boolean {
  const a = tuLoi(go ?? "", bo).join("");
  const b = tuLoi(kho ?? "", bo).join("");
  if (a.length < 4 || b.length < 4) return false;
  if (a.replace(/\D/g, "") !== b.replace(/\D/g, "")) return false;
  if (a === b) return true;
  const tran = Math.min(4, Math.max(1, Math.floor(Math.max(a.length, b.length) / 4)));
  return Math.abs(a.length - b.length) <= tran && lev(a, b) <= tran;
}

/**
 * Chọn ứng viên tìm theo nghĩa: giữ những cái tên gần chữ khách gõ (`tenGan`) và đủ gần nghĩa (≥ `nguong`); ra đúng MỘT
 * tên (bỏ trùng tên) mới trả, không thì null — để bot đi đường cũ (hỏi / giữ chữ khách).
 */
export function chonUngVienNghia<T extends { ten: string; do_gan: number }>(
  go: string | null | undefined, ds: T[] | null | undefined, bo: ReadonlySet<string>, nguong = 0.55,
): T | null {
  const motTen = (ds2: T[]): T | null => {
    const ten = new Set(ds2.map((u) => boDau(u.ten).replace(/[^a-z0-9]+/g, "")));
    return ten.size === 1 ? [...ds2].sort((x, y) => y.do_gan - x.do_gan)[0] : null;
  };
  const dat = (ds ?? []).filter((u) => u.do_gan >= nguong && tenGan(go, u.ten, bo));
  // Bắn thật 30/09: "Sunrize City" → "Sunrise City" VÀ "Khu Căn Hộ Sunrise" cùng lõi "sunrise" khi bỏ từ chung → hai tên,
  // không chọn. Nhiều tên qua thì phân xử trên tên ĐẦY ĐỦ (giữ từ chung): "sunrizecity" gần "sunrisecity", xa "khucanhosunrise".
  return motTen(dat) ?? (dat.length > 1 ? motTen(dat.filter((u) => tenGan(go, u.ten, KHONG_BO))) : null);
}
const KHONG_BO: ReadonlySet<string> = new Set();
