// tien-ich.ts — loại tiện ích OSM và chuẩn tên để so (11/09/2026). `_shared/geocode.ts` (edge function geocode-listings) dùng.
// 19/10/2026 (SRS-5.1zzzzzzz67): phần đọc câu khách mua ("gần bệnh viện 1 km" → `docGanTienIch`) chỉ bot TypeScript gọi — đã gỡ
// cùng bot đó; lõi Python đọc câu khách bằng AI.

export type LoaiTienIch = "benh_vien" | "truong_hoc" | "cho" | "sieu_thi" | "cong_vien";

// NFC trước: bản gõ tổ hợp (NFD) làm lệch vị trí giữa chữ gốc và chữ bỏ dấu.
const boDau = (s: string): string =>
  s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Chuẩn tên để so: bỏ dấu, thường, bỏ ký tự lạ ("Co.opmart" → "coopmart"). */
export function kdTen(s: string): string {
  return boDau(s).replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
}
