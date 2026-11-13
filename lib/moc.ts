// SRS-5.1zzzzzzz443 (chủ dự án 12/11/2026 "lấy mấy cái này thì lấy lun"): trang "Nhà bán gần <địa danh>" — ý tưởng điểm neo của
// NhaDat-Radar, nhưng KHÔNG chép lời mô tả bên đó (hai web cùng chủ, chép là trùng nội dung trên Google).
// - Danh sách địa danh + toạ độ lấy từ bảng `tien_ich` của chính kho (dữ liệu OpenStreetMap, chỉ admin đọc được nên chép tay vào đây).
//   Chọn nơi người mua hay nhắm theo: bệnh viện lớn, chợ, công viên, trung tâm thương mại, đại học. Không ghi quận: địa giới đổi
//   sau sáp nhập 2025, phường / quận hiện ra trên trang lấy thẳng từ các tin quanh đó.
// - Không viết lời giới thiệu tay. Mọi câu trên trang sinh từ số tin thật trong bán kính.
import { unstable_cache } from "next/cache";
import { MAP_COLS, supabase, TRANG_THAI_HIEN, type MapRow } from "@/lib/supabase";

export type LoaiMoc = "benh_vien" | "cho" | "cong_vien" | "sieu_thi" | "truong_hoc";
export type Moc = { slug: string; ten: string; loai: LoaiMoc; lat: number; lng: number };

export const TEN_LOAI: Record<LoaiMoc, string> = {
  benh_vien: "Bệnh viện",
  cho: "Chợ",
  cong_vien: "Công viên",
  sieu_thi: "Trung tâm thương mại, siêu thị",
  truong_hoc: "Trường đại học",
};

export const MOC: Moc[] = [
  { slug: "benh-vien-cho-ray", ten: "Bệnh viện Chợ Rẫy", loai: "benh_vien", lat: 10.75695, lng: 106.65973 },
  { slug: "benh-vien-tu-du", ten: "Bệnh viện Từ Dũ", loai: "benh_vien", lat: 10.76787, lng: 106.68476 },
  { slug: "benh-vien-binh-dan", ten: "Bệnh viện Bình Dân", loai: "benh_vien", lat: 10.77413, lng: 106.68137 },
  { slug: "benh-vien-nhi-dong-1", ten: "Bệnh viện Nhi đồng 1", loai: "benh_vien", lat: 10.76881, lng: 106.66994 },
  { slug: "benh-vien-nhi-dong-2", ten: "Bệnh viện Nhi đồng 2", loai: "benh_vien", lat: 10.78143, lng: 106.70282 },
  { slug: "benh-vien-dai-hoc-y-duoc", ten: "Bệnh viện Đại học Y Dược", loai: "benh_vien", lat: 10.75527, lng: 106.66457 },
  { slug: "benh-vien-nhan-dan-115", ten: "Bệnh viện Nhân dân 115", loai: "benh_vien", lat: 10.77604, lng: 106.66649 },
  { slug: "benh-vien-thong-nhat", ten: "Bệnh viện Thống Nhất", loai: "benh_vien", lat: 10.79108, lng: 106.65354 },
  { slug: "benh-vien-quan-y-175", ten: "Bệnh viện Quân y 175", loai: "benh_vien", lat: 10.81843, lng: 106.68081 },
  { slug: "benh-vien-da-khoa-binh-tan", ten: "Bệnh viện Đa khoa Bình Tân", loai: "benh_vien", lat: 10.76445, lng: 106.60322 },
  { slug: "cho-ben-thanh", ten: "Chợ Bến Thành", loai: "cho", lat: 10.77257, lng: 106.69802 },
  { slug: "cho-binh-tay", ten: "Chợ Bình Tây", loai: "cho", lat: 10.74933, lng: 106.65107 },
  { slug: "cho-an-dong", ten: "Chợ An Đông", loai: "cho", lat: 10.75811, lng: 106.67218 },
  { slug: "cho-ban-co", ten: "Chợ Bàn Cờ", loai: "cho", lat: 10.76886, lng: 106.68007 },
  { slug: "cho-tan-dinh", ten: "Chợ Tân Định", loai: "cho", lat: 10.7899, lng: 106.69005 },
  { slug: "cho-ba-chieu", ten: "Chợ Bà Chiểu", loai: "cho", lat: 10.80168, lng: 106.69882 },
  { slug: "cho-pham-van-hai", ten: "Chợ Phạm Văn Hai", loai: "cho", lat: 10.79477, lng: 106.6627 },
  { slug: "cong-vien-tao-dan", ten: "Công viên Tao Đàn", loai: "cong_vien", lat: 10.77449, lng: 106.69265 },
  { slug: "cong-vien-23-thang-9", ten: "Công viên 23 Tháng 9", loai: "cong_vien", lat: 10.76957, lng: 106.69394 },
  { slug: "cong-vien-le-van-tam", ten: "Công viên Lê Văn Tám", loai: "cong_vien", lat: 10.78824, lng: 106.69376 },
  { slug: "cong-vien-gia-dinh", ten: "Công viên Gia Định", loai: "cong_vien", lat: 10.81254, lng: 106.67523 },
  { slug: "cong-vien-hoang-van-thu", ten: "Công viên Hoàng Văn Thụ", loai: "cong_vien", lat: 10.80251, lng: 106.66452 },
  { slug: "cong-vien-phu-lam", ten: "Công viên Phú Lâm", loai: "cong_vien", lat: 10.74801, lng: 106.62532 },
  { slug: "vincom-ba-thang-hai", ten: "Vincom Plaza 3 Tháng 2", loai: "sieu_thi", lat: 10.77629, lng: 106.68084 },
  { slug: "vincom-quang-trung", ten: "Vincom Plaza Quang Trung", loai: "sieu_thi", lat: 10.82948, lng: 106.67254 },
  { slug: "lotte-mart-quan-7", ten: "Lotte Mart Quận 7", loai: "sieu_thi", lat: 10.74108, lng: 106.70209 },
  { slug: "lotte-mart-cong-hoa", ten: "Lotte Mart Cộng Hòa", loai: "sieu_thi", lat: 10.80086, lng: 106.65299 },
  { slug: "crescent-mall", ten: "Crescent Mall", loai: "sieu_thi", lat: 10.72899, lng: 106.71869 },
  { slug: "aeon-mall-tan-phu", ten: "Aeon Mall Tân Phú", loai: "sieu_thi", lat: 10.80142, lng: 106.61686 },
  { slug: "coopmart-phu-lam", ten: "Co.opmart Phú Lâm", loai: "sieu_thi", lat: 10.75457, lng: 106.63364 },
  { slug: "dai-hoc-bach-khoa", ten: "Đại học Bách khoa (cơ sở Lý Thường Kiệt)", loai: "truong_hoc", lat: 10.77342, lng: 106.65966 },
  { slug: "dai-hoc-kinh-te", ten: "Đại học Kinh tế TP.HCM (cơ sở Nguyễn Đình Chiểu)", loai: "truong_hoc", lat: 10.78303, lng: 106.69487 },
  { slug: "dai-hoc-khoa-hoc-tu-nhien", ten: "Đại học Khoa học Tự nhiên (cơ sở Nguyễn Văn Cừ)", loai: "truong_hoc", lat: 10.76263, lng: 106.68197 },
  { slug: "dai-hoc-y-duoc", ten: "Đại học Y Dược TP.HCM", loai: "truong_hoc", lat: 10.75439, lng: 106.66327 },
  { slug: "dai-hoc-ton-duc-thang", ten: "Đại học Tôn Đức Thắng", loai: "truong_hoc", lat: 10.7318, lng: 106.69808 },
  { slug: "dai-hoc-rmit", ten: "Đại học RMIT (Nam Sài Gòn)", loai: "truong_hoc", lat: 10.72983, lng: 106.69401 },
];

export const BAN_KINH_KM = 2;
/** Dưới mức này trang để noindex và không vào sitemap: vài căn không đủ làm một trang tìm kiếm. */
export const TOI_THIEU_MOC = 3;

export const mocBySlug = (slug: string) => MOC.find((m) => m.slug === slug);

// SRS-5.1zzzzzzz457: câu tìm "nhà gần bệnh viện Chợ Rẫy" từng lọc /mua-ban bằng `location_raw ilike` + nhãn "gần bệnh viện" → 0 căn,
// trong khi /gan/benh-vien-cho-ray có 27 căn trong 2 km. Câu có chữ "gần" + tên một địa danh trong MOC thì đi thẳng trang /gan.
const boDau = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const LOAI_DAU = /^(benh vien|cho|cong vien|truong dai hoc|dai hoc)\s+/;
function bienThe(m: Moc): string[] {
  const t = boDau(m.ten.replace(/\(.*?\)/g, ""));
  const s = new Set([t, t.replace(/\b(mall|plaza)\b/g, "").replace(/\s+/g, " ").trim()]);
  const loi = t.replace(LOAI_DAU, ""); // "cho ray", "ben thanh", "bach khoa" — chỉ nhận khi còn ≥ 2 chữ
  if (loi !== t && loi.split(" ").length >= 2) s.add(loi);
  return [...s];
}
/** Địa danh trong câu tìm, chỉ khi câu có chữ "gần" ("nhà phường Bến Thành" là tên phường, không phải gần chợ). Khớp dài nhất thắng. */
export function timMoc(cau: string | undefined): Moc | undefined {
  if (!cau) return undefined;
  const t = ` ${boDau(cau)} `;
  if (!t.includes(" gan ")) return undefined;
  let tot: { m: Moc; dai: number } | undefined;
  for (const m of MOC) for (const v of bienThe(m)) if (t.includes(` ${v} `) && (!tot || v.length > tot.dai)) tot = { m, dai: v.length };
  return tot?.m;
}

export function khoangCachKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type TinGan = MapRow & { km: number };

/** Tin BÁN đang lên kệ trong bán kính, gần trước. Toạ độ tin là cấp đường (chưa tới số nhà) nên khoảng cách chỉ là "khoảng". */
export const tinGanMoc = unstable_cache(
  async (slug: string): Promise<TinGan[]> => {
    const m = mocBySlug(slug);
    if (!m) return [];
    const d = BAN_KINH_KM / 111; // độ vĩ ~ 111 km
    const dLng = d / Math.cos((m.lat * Math.PI) / 180);
    const { data } = await supabase
      .from("listings")
      .select(MAP_COLS)
      .eq("deal", "ban")
      .in("status", TRANG_THAI_HIEN)
      .gt("price_vnd", 0)
      .gte("lat", m.lat - d)
      .lte("lat", m.lat + d)
      .gte("lng", m.lng - dLng)
      .lte("lng", m.lng + dLng)
      .limit(1000);
    return ((data ?? []) as MapRow[])
      .map((l) => ({ ...l, km: khoangCachKm(m, { lat: Number(l.lat), lng: Number(l.lng) }) }))
      .filter((l) => l.km <= BAN_KINH_KM)
      .sort((a, b) => a.km - b.km);
  },
  ["tin-gan-moc-v1"],
  { revalidate: 3600, tags: ["listings"] }, // SRS-5.1zzzzzzz457: /api/tin-da-go xoá theo tag
);
