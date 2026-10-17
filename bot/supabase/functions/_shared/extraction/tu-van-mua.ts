// tu-van-mua.ts — bộ câu TƯ VẤN người mua (FR-228, chủ dự án 25/09/2026). Thuần: không mạng, không DB, không model.
//
// Chủ dự án gửi 7 câu "nếu có người hỏi tìm mua"; chọn qua câu hỏi: hỏi dần, MỖI LƯỢT MỘT CÂU, xen với gợi ý căn;
// câu 5 (thang máy) là câu của dự án Ny'ah Phú Định — khách không hỏi tới dự án đó thì đổi thành gợi ý chung;
// câu 7 (vay) khách cần thì ghi nhận, chuyển CTV. Câu mẫu giữ đúng chữ chủ dự án; model đổi đại từ theo cách gọi khách.
const boDau = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export type CauTuVan = { khoa: string[]; cau: string };

export const BUYER_TU_VAN: CauTuVan[] = [
  { khoa: ["khu_song"], cau: "Anh chị muốn mình sống ở một khu như thế nào ạ?" },
  { khoa: ["nguoi_o_cung"], cau: "Nhà mình gồm những ai ạ?" },
  { khoa: ["noi_lam"], cau: "Mình đi làm ở khu vực nào ạ?" },
  { khoa: ["bedrooms", "dien_tich_mong_muon"], cau: "Anh chị cần khoảng mấy phòng, diện tích tầm bao nhiêu thì thoải mái ạ?" },
  { khoa: ["thang_may"], cau: "" }, // đổi theo người ở cùng — xem `cauThangMay`
  { khoa: ["budget", "nguoi_quyet_dinh"], cau: "Mình đã có khoảng tài chính dự kiến chưa, và ngoài anh chị còn ai cùng quyết định không ạ?" },
  { khoa: ["can_vay"], cau: "Mình có cần em tư vấn thêm phần vay ngân hàng không ạ?" },
];

/** Nhãn hiện trong bong bóng 🤖 của người mua. */
export const NHAN_TU_VAN: Record<string, string> = {
  khu_song: "muốn sống ở khu", nguoi_o_cung: "người ở cùng", noi_lam: "nơi đi làm",
  dien_tich_mong_muon: "diện tích mong muốn", thang_may: "thang máy", nguoi_quyet_dinh: "người cùng quyết định",
  can_vay: "cần tư vấn vay",
};

const CO_NGUOI_LON_TUOI = /\b(?:ong ba|ong|ba noi|ba ngoai|ong noi|ong ngoai|bo me gia|me gia|ba gia|cha me gia|nguoi gia|lon tuoi|cao tuoi|nguoi benh|di lai kho|xe lan)\b/;
const NYAH_PHU_DINH = /\bny\s*'?\s*ah\s+phu\s+dinh\b/;

const coGiaTri = (v: unknown) => v != null && v !== "";

/** Câu 5: có ông bà / người lớn tuổi → gợi ý; dự án Ny'ah Phú Định → nguyên văn câu chủ dự án; không thì không hỏi. */
export function cauThangMay(nguoiOCung: unknown, hoiNyah: boolean): string | null {
  const lonTuoi = typeof nguoiOCung === "string" && CO_NGUOI_LON_TUOI.test(boDau(nguoiOCung));
  if (hoiNyah) {
    return lonTuoi
      ? "Bên em có 2 mẫu, có và không có thang máy. Nhà mình có ông bà thì em nghĩ mẫu thang máy sẽ tiện hơn. Anh chị thấy sao ạ?"
      : "Bên em có 2 mẫu, có và không có thang máy. Anh chị thích mẫu nào hơn ạ?";
  }
  return lonTuoi
    ? "Nhà mình có ông bà thì em nghĩ nhà có thang máy hoặc phòng ngủ dưới trệt sẽ tiện hơn. Anh chị thấy sao ạ?"
    : null;
}

/** Khách đang hỏi dự án Ny'ah Phú Định: tên dự án khớp trong lượt này, hoặc câu khách gõ tên đó. */
export function laHoiNyah(tenDuAnKhop: string[], text: string): boolean {
  return tenDuAnKhop.some((t) => NYAH_PHU_DINH.test(boDau(t))) || NYAH_PHU_DINH.test(boDau(text ?? ""));
}

/**
 * Câu tư vấn kế tiếp cho hồ sơ `prefs` (null = đã hỏi đủ). Câu gộp hai ý mà một ý đã biết thì kèm ghi chú
 * "(đã biết …, chỉ hỏi phần còn lại)" để model không hỏi lại thứ khách đã nói.
 */
export function cauTuVanKe(prefs: Record<string, unknown>, hoiNyah = false): { khoa: string[]; cau: string } | null {
  for (const c of BUYER_TU_VAN) {
    const thieu = c.khoa.filter((k) => !coGiaTri(prefs[k]));
    if (!thieu.length) continue;
    if (c.khoa[0] === "thang_may") {
      const cau = cauThangMay(prefs.nguoi_o_cung, hoiNyah);
      if (!cau) continue;
      return { khoa: c.khoa, cau };
    }
    const daBiet = c.khoa.filter((k) => coGiaTri(prefs[k]));
    const ten: Record<string, string> = { budget: "tài chính", bedrooms: "số phòng", dien_tich_mong_muon: "diện tích" };
    return { khoa: thieu, cau: daBiet.length ? `${c.cau} (đã biết ${daBiet.map((k) => ten[k] ?? k).join(", ")} — chỉ hỏi phần còn lại)` : c.cau };
  }
  return null;
}
