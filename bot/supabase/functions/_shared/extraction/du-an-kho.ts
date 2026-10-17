// du-an-kho.ts — gọt dữ liệu KHO DỰ ÁN (bảng `projects`, nguồn mogi / aond / người bán) trước khi đưa model (SRS-5.1zzzzzq, 13/10/2026).
// Thuần: không mạng, không DB, không model (luật `bot/tests/ranh-gioi.mjs`).
//
// Zalo thật 13/10: "Hà Đô Centrosa" khớp HAI dòng mogi ("HaDo Centrosa Garden" và "Hà Đô Centrosa Garden"), dòng thứ hai có ô tiện ích là
// tiêu đề bài viết ("- Chủ đầu tư dự án này có uy tín hay không?", "Có nên mua căn hộ Hà Đô Centrosa không?"). Model đọc hai khối lệch
// nhau (giá từ 3,055 tỷ / 3,792 tỷ) và kể "tiện ích" là câu hỏi. Sửa ở chỗ đọc, không sửa tay dữ liệu: dòng nạp lại từ mogi sẽ lại y vậy.

const boDau = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Khoá gộp: tên bỏ dấu, bỏ mọi ký tự không phải chữ / số ("HaDo Centrosa Garden" = "Hà Đô Centrosa Garden"). */
export const khoaTenDuAn = (ten: string | null | undefined): string => boDau(ten ?? "").replace(/[^a-z0-9]/g, "");

type DuAnBatKy = { name?: string | null; amenities?: unknown; specs?: unknown; unit_types?: unknown; description?: string | null; developer?: string | null; location_raw?: string | null };

/** Điểm "nhiều thông tin": đếm ô có dữ liệu thật (tiện ích sạch, thông số, mẫu căn, mô tả, CĐT, địa chỉ có số nhà). */
function diemThongTin(p: DuAnBatKy): number {
  let d = tienIchDuAnSach(p.amenities).length;
  if (p.specs && typeof p.specs === "object") d += Object.values(p.specs as Record<string, unknown>).filter((v) => v != null && v !== "").length;
  if (Array.isArray(p.unit_types)) d += p.unit_types.length;
  if (p.description) d += 1;
  if (p.developer) d += 1;
  if (p.location_raw && /\d/.test(p.location_raw)) d += 1;
  return d;
}

/** Gộp các dòng cùng khoá tên; giữ dòng nhiều thông tin hơn, giữ thứ tự xuất hiện đầu. */
export function gopDuAnTrung<T extends DuAnBatKy>(ds: T[]): T[] {
  const theoKhoa = new Map<string, T>();
  for (const p of ds) {
    const k = khoaTenDuAn(p.name);
    const cu = theoKhoa.get(k);
    if (!cu || diemThongTin(p) > diemThongTin(cu)) theoKhoa.set(k, p);
  }
  return [...theoKhoa.values()];
}

/**
 * Tiện ích sạch: chuỗi ngắn (≤ 160 ký tự), không phải câu hỏi, không mở bằng gạch đầu dòng "- ", không phải tiêu đề bài viết
 * ("đánh giá", "phân tích", "có nên mua", "ưu điểm, nhược điểm", "tiềm năng đầu tư"). Không phải mảng → rỗng.
 */
export function tienIchDuAnSach(am: unknown): string[] {
  if (!Array.isArray(am)) return [];
  const RAC = /\?|^\s*-\s|\b(?:danh gia|phan tich|co nen mua|uu diem|nhuoc diem|tiem nang dau tu|ai la nguoi nen|review)\b/;
  return am
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length >= 2 && x.length <= 160 && !RAC.test(boDau(x)));
}
