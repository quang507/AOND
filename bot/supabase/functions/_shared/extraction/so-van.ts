// so-van.ts — SỔ VAN: ghi lại mỗi lần một van trong `van-tra-loi.ts` ĐỔI lời model (06/10/2026, SRS-5.1zzn).
//
// Vì sao có file này: hơn 80 van hậu kiểm cắt / thay lời model mà không chỗ nào ghi lại van nào đã kích, nên
// không ai biết bao nhiêu phần trăm tin bị sửa và sửa ở đâu — mọi quyết định "bỏ van này được chưa" đều là
// cảm tính. Sổ này chỉ ghi khi lời ĐỔI (trước ≠ sau), mỗi dòng: tên van · câu trước · câu sau (cắt 600 chữ).
// Ghi vào bảng `van_kich` (20261006b) ở cuối lượt, MỘT câu insert; không có van nào kích thì không ghi gì.
// Không mang SĐT: lời bot đã qua `thayLienHe` trước khi tới đây ở nhánh bán; nhánh mua qua `locLienHeBot`.

export type VanKich = { van: string; truoc: string; sau: string };
export type SoVan = { nhanh: "ban" | "mua"; ds: VanKich[] };

const TRAN_CHU = 600;

export function moSoVan(nhanh: "ban" | "mua"): SoVan {
  return { nhanh, ds: [] };
}

/** Chuẩn hoá lời để so: mảng → nối dòng, null → rỗng. */
export function chuanLoi(x: string | string[] | null | undefined): string {
  if (x == null) return "";
  return (Array.isArray(x) ? x.join("\n") : x).trim();
}

const cat = (s: string) => (s.length > TRAN_CHU ? s.slice(0, TRAN_CHU) + "…" : s);

/**
 * Theo dõi một biến lời (`doc()` đọc giá trị hiện tại). Gọi `moc("tenVan")` ngay SAU mỗi van: lời đổi so với
 * mốc trước thì ghi một dòng vào sổ. Đặt sau câu lệnh thay vì bọc biểu thức để không phải viết lại từng van.
 */
export function theoDoiVan(so: SoVan, doc: () => string | string[] | null | undefined): (ten: string, luonGhi?: boolean) => void {
  let truoc = chuanLoi(doc());
  // `luonGhi` (SRS-5.1zzp): van có TỐN tiền (gọi lại model) thì ghi cả khi lời không đổi — để đếm số lượt gọi, không chỉ số lượt đổi.
  return (ten: string, luonGhi = false) => {
    const sau = chuanLoi(doc());
    if (sau !== truoc || luonGhi) so.ds.push({ van: ten, truoc: cat(truoc), sau: cat(sau) });
    truoc = sau;
  };
}

/** Ghi một van áp trên giá trị rời (không theo dõi biến): trả về `sau` để viết `x = apVan(so, "ten", x, f(x))`. */
export function apVan<T extends string | string[] | null | undefined>(so: SoVan, ten: string, truoc: T, sau: T): T {
  const a = chuanLoi(truoc), b = chuanLoi(sau);
  if (a !== b) so.ds.push({ van: ten, truoc: cat(a), sau: cat(b) });
  return sau;
}

/** Tên các van đã kích (không trùng), để trả trong body cho e2e / bắn thử đọc. */
export function tenVanKich(so: SoVan): string[] {
  return [...new Set(so.ds.map((d) => d.van))];
}
