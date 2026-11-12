// SRS-5.1zzzzzzz436 (chủ dự án 12/11/2026: "Giới thiệu khu trước"): đoạn giới thiệu + số liệu khu cho trang tag và trang chủ.
// - Lời giới thiệu viết tay, chỉ ghi điều ai sống ở Sài Gòn cũng kiểm được (vị trí, trục đường, loại nhà phổ biến) — KHÔNG
//   ghi giá, KHÔNG hứa hẹn "đón sóng", "tăng giá". Giá luôn lấy từ kho.
// - Số liệu tính thẳng từ tin đang lên kệ (TRANG_THAI_HIEN), ghi rõ là GIÁ RAO trên AI Ơi Nhà Đất, không phải giá giao dịch.
//   Dưới 3 tin thì không tính giá (một hai căn không nói lên gì).
// Thay khối "Radar" trang chủ cũ ghi số bịa ("340+ căn" Quận 7 khi cả kho ~240 tin).
import { unstable_cache } from "next/cache";
import { supabase, TRANG_THAI_HIEN } from "@/lib/supabase";
import { KHU_LE, type KhuInfo } from "@/lib/tags";

export const GIOI_THIEU: Record<string, string> = {
  "quan-1":
    "Trung tâm thương mại cũ của Sài Gòn, quanh Nguyễn Huệ, chợ Bến Thành, Đa Kao. Nhà phố phần lớn là nhà ống trên đất nhỏ, nhiều căn mua để cho thuê mặt bằng, văn phòng.",
  "quan-3":
    "Giáp Quận 1 về phía tây bắc, khu dân cư lâu đời quanh Võ Văn Tần, Trần Quốc Thảo, Cách Mạng Tháng Tám. Có nhiều biệt thự cũ và hẻm lớn thông ra đường chính.",
  "quan-5":
    "Lõi Chợ Lớn, quanh Trần Hưng Đạo, Nguyễn Trãi, Hải Thượng Lãn Ông, nhiều hộ người Hoa buôn bán lâu năm. Nhà phố liền kề nhiều tầng, nhà mặt tiền thường để kinh doanh.",
  "quan-6":
    "Phía tây Chợ Lớn, quanh chợ Bình Tây, Hậu Giang, Kinh Dương Vương. Khu dân cư đông, nhà phố trong hẻm là chính.",
  "quan-7":
    "Phía nam thành phố, có khu đô thị Phú Mỹ Hưng và trục Nguyễn Văn Linh, Huỳnh Tấn Phát. Căn hộ, biệt thự nằm trong khu quy hoạch; nhà phố hẻm tập trung ở các phường phía đông.",
  "quan-8":
    "Nằm dọc kênh Tàu Hủ, nối Quận 5 và Quận 1 qua nhiều cây cầu, trục Phạm Thế Hiển, Tạ Quang Bửu, Dương Bá Trạc. Nhà phố ở đây thuộc nhóm dễ mua nhất trong nội thành.",
  "quan-10":
    "Giữa nội thành, quanh 3 Tháng 2, Sư Vạn Hạnh, Lý Thường Kiệt. Nhiều trường đại học và bệnh viện nên phòng cho thuê, căn hộ dịch vụ rất phổ biến.",
  "quan-11":
    "Giáp Quận 5 và Quận 10, quanh Lạc Long Quân, Lãnh Binh Thăng, công viên Đầm Sen. Nhà phố hẻm dày, nhiều hộ buôn bán nhỏ.",
  "quan-12":
    "Cửa ngõ phía bắc, dọc Quốc lộ 1A, Tô Ký, Hà Huy Giáp. Đất còn rộng nên có cả nhà phố, nhà cấp 4 lẫn đất nền.",
  "binh-thanh":
    "Giáp Quận 1 qua cầu Thị Nghè và cầu Sài Gòn, quanh Xô Viết Nghệ Tĩnh, Điện Biên Phủ, Nguyễn Xí. Có cả nhà phố hẻm lâu năm lẫn căn hộ cao tầng ven sông.",
  "phu-nhuan":
    "Quận nhỏ nằm giữa sân bay Tân Sơn Nhất và Quận 1, quanh Phan Xích Long, Phan Đăng Lưu, Hoàng Văn Thụ. Nhà phố trong hẻm ngắn, dân cư ổn định.",
  "go-vap":
    "Phía bắc sân bay, quanh Quang Trung, Phan Văn Trị, Nguyễn Oanh. Khu dân cư đông, nhiều nhà phố hẻm, giá mềm hơn Phú Nhuận và Tân Bình.",
  "tan-binh":
    "Bao quanh sân bay Tân Sơn Nhất, dọc Cộng Hòa, Trường Chinh, Hoàng Văn Thụ. Nhiều văn phòng, nhà phố kinh doanh và khu dân cư cũ như Bàu Cát.",
  "tan-phu":
    "Tách ra từ Tân Bình, quanh Lũy Bán Bích, Âu Cơ, Tân Kỳ Tân Quý. Nhà phố hẻm, xen nhiều xưởng nhỏ và nhà mới xây.",
  "binh-tan":
    "Cửa ngõ phía tây, quanh Tên Lửa, Kinh Dương Vương, Quốc lộ 1A. Nhiều khu dân cư mới, giá thấp hơn các quận nội thành.",
  "thu-duc":
    "Gồm Quận 2, Quận 9 và Quận Thủ Đức cũ, có Thủ Thiêm, Thảo Điền, khu Công nghệ cao, Làng Đại học. Căn hộ chiếm phần lớn nguồn cung.",
  "binh-chanh":
    "Huyện phía tây nam giáp Long An, dọc Quốc lộ 1A, Nguyễn Văn Linh, Trần Văn Giàu. Còn nhiều đất nền, đất vườn và kho xưởng.",
  "hoc-mon": "Huyện phía tây bắc, dọc Quốc lộ 22 và Lê Văn Khương. Đất còn rộng, nhiều đất nền, đất vườn.",
  "nha-be": "Huyện phía nam, nối Quận 7 qua Nguyễn Hữu Thọ, Lê Văn Lương. Nhiều dự án căn hộ và nhà phố ven sông.",
  "ben-luc":
    "Huyện của Long An giáp Bình Chánh, dọc Quốc lộ 1A và cao tốc TP.HCM – Trung Lương. Nhiều khu công nghiệp, đất nền thổ cư.",
  "duc-hoa":
    "Huyện của Long An giáp Củ Chi và Hóc Môn, dọc Tỉnh lộ 10, 824, 825. Nhiều khu công nghiệp, đất nền giá thấp hơn Sài Gòn.",
  "can-giuoc": "Huyện của Long An giáp Nhà Bè và Bình Chánh, dọc Quốc lộ 50. Chủ yếu đất nền và nhà vườn.",
  "sai-gon":
    "Tin trên AI Ơi Nhà Đất rải khắp các quận nội thành và huyện ven Sài Gòn, mỗi tin ghi rõ đường vào, kết cấu, pháp lý theo lời chủ nhà.",
  "long-an":
    "Các huyện Long An giáp Sài Gòn như Bến Lức, Đức Hòa, Cần Giuộc là nơi người Sài Gòn hay tìm đất nền, nhà vườn giá thấp hơn trong thành phố.",
};

const LOAI_NHA = ["nha_pho", "nha_cap4", "biet_thu"];
const DUONG_XE_HOI = ["mat_tien", "hem_xe_tai", "hem_xe_hoi"];
const TOI_THIEU = 3;

export type SoLieuKhu = {
  /** Số tin đang lên kệ của khu theo giao dịch (mọi loại). */
  tong: number;
  /** Bán: giá rao trung vị / m² của nhà phố, cấp 4, biệt thự. Cho thuê: tiền thuê trung vị / tháng. Thiếu mẫu = null. */
  gia: number | null;
  soMauGia: number;
  /** % tin mặt tiền / hẻm xe hơi / xe tải trong số tin có ghi đường vào. */
  xeHoi: number | null;
  /** Phường (khu một quận) hoặc quận (khu gộp) nhiều tin nhất. */
  nhieuTin: { ten: string; n: number }[];
};

function trungVi(a: number[]): number | null {
  if (a.length < TOI_THIEU) return null;
  const s = [...a].sort((x, y) => x - y);
  const g = s.length >> 1;
  return s.length % 2 ? s[g] : (s[g - 1] + s[g]) / 2;
}

type Dong = {
  district: string | null;
  ward: string | null;
  property_type: string | null;
  access_type: string | null;
  price_vnd: number | null;
  area_m2: number | null;
};

const docTin = unstable_cache(
  async (deal: "ban" | "cho_thue", districts: string[]): Promise<Dong[]> => {
    const { data } = await supabase
      .from("listings")
      .select("district, ward, property_type, access_type, price_vnd, area_m2")
      .eq("deal", deal)
      .in("status", TRANG_THAI_HIEN)
      .in("district", districts)
      .gt("price_vnd", 0)
      .limit(5000);
    return (data ?? []) as Dong[];
  },
  ["so-lieu-khu-v1"],
  { revalidate: 3600 },
);

const tenKhuCuaQuan = new Map(KHU_LE.flatMap((k) => k.districts.map((d) => [d, k.label.replace(/, Long An$/, "")] as const)));

export async function soLieuKhu(k: KhuInfo, deal: "ban" | "cho_thue"): Promise<SoLieuKhu> {
  const rows = await docTin(deal, k.districts);
  const gop = !KHU_LE.some((x) => x.slug === k.slug);

  const gia =
    deal === "ban"
      ? rows
          .filter((r) => LOAI_NHA.includes(r.property_type ?? "") && r.area_m2 && r.area_m2 > 0)
          .map((r) => r.price_vnd! / r.area_m2!)
      : rows.map((r) => r.price_vnd!);
  const coDuong = rows.filter((r) => r.access_type);
  const dem = new Map<string, number>();
  for (const r of rows) {
    const ten = gop ? tenKhuCuaQuan.get(r.district ?? "") : r.ward?.trim();
    if (ten) dem.set(ten, (dem.get(ten) ?? 0) + 1);
  }
  return {
    tong: rows.length,
    gia: trungVi(gia),
    soMauGia: gia.length,
    xeHoi:
      coDuong.length >= TOI_THIEU
        ? Math.round((100 * coDuong.filter((r) => DUONG_XE_HOI.includes(r.access_type!)).length) / coDuong.length)
        : null,
    nhieuTin: [...dem]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ten, n]) => ({ ten, n })),
  };
}

/** Số tin BÁN đang lên kệ của từng khu lẻ (một query cho cả trang chủ). */
export const demTinTheoKhu = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const { data } = await supabase
      .from("listings")
      .select("district")
      .eq("deal", "ban")
      .in("status", TRANG_THAI_HIEN)
      .gt("price_vnd", 0)
      .limit(10000);
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as { district: string | null }[]) {
      const k = KHU_LE.find((x) => x.districts.includes(r.district ?? ""));
      if (k) out[k.slug] = (out[k.slug] ?? 0) + 1;
    }
    return out;
  },
  ["dem-tin-theo-khu-v1"],
  { revalidate: 3600 },
);

/** "128 triệu", "8,5 triệu", "1,2 tỉ". */
export function trieu(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỉ`;
  const t = v / 1e6;
  return `${t.toLocaleString("vi-VN", { maximumFractionDigits: t >= 100 ? 0 : 1 })} triệu`;
}
