// SRS-5.1zzzzzzz523 — lựa chọn của form đăng ký môi giới (/moi-gioi/dang-ky) và trang quản trị (/admin/moi-gioi). Một nguồn cho cả hai;
// DB lưu đúng chữ ở đây (`dang_ky_moi_gioi.khu_vuc`, `loai_bds`, `kinh_nghiem`), đổi chữ thì dòng cũ giữ chữ cũ.

// Cụm khu vực theo vùng nhận tin của bot (TP.HCM theo cụm quận cũ + 5 tỉnh quanh).
export const KHU_VUC_MG = [
  "Quận 1, 3, 10",
  "Quận 5, 6, 11",
  "Quận 4, 7, Nhà Bè",
  "Quận 8, Bình Chánh",
  "Bình Thạnh, Phú Nhuận",
  "Tân Bình, Tân Phú, Bình Tân",
  "Gò Vấp, Quận 12, Hóc Môn",
  "Thủ Đức, Quận 2, Quận 9",
  "Long An",
  "Bình Dương",
  "Đồng Nai",
  "Bà Rịa - Vũng Tàu",
  "Tây Ninh",
] as const;
export const KHU_VUC_TOI_DA = 5;

export const LOAI_BDS_MG = [
  "Nhà phố",
  "Căn hộ, chung cư",
  "Đất",
  "Biệt thự",
  "Mặt bằng kinh doanh",
  "Kho xưởng",
  "Phòng trọ, căn hộ dịch vụ",
  "Dự án",
] as const;

export const KINH_NGHIEM_MG = ["Mới vào nghề", "Dưới 2 năm", "Từ 2 đến 5 năm", "Trên 5 năm"] as const;

export type TrangThaiMG = "moi" | "da_lien_he" | "duyet" | "tu_choi";
export const TRANG_THAI_MG: Record<TrangThaiMG, string> = {
  moi: "Mới",
  da_lien_he: "Đã liên hệ",
  duyet: "Đã duyệt",
  tu_choi: "Từ chối",
};

export type DangKyMG = {
  id: string;
  created_at: string;
  loai: "ca_nhan" | "san";
  ho_ten: string;
  so_dien_thoai: string;
  khu_vuc: string[];
  loai_bds: string[];
  cong_ty: string | null;
  kinh_nghiem: string | null;
  so_can: number | null;
  ghi_chu: string | null;
  trang_thai: TrangThaiMG;
  ghi_chu_admin: string | null;
  xu_ly_luc: string | null;
  xu_ly_boi: string | null;
};

/** Số điện thoại di động Việt Nam sau khi bỏ dấu cách, dấu chấm, +84 — cùng luật với `gui_dang_ky_moi_gioi` trên DB. */
export function chuanSoDienThoai(s: string): string | null {
  let so = s.replace(/\D/g, "");
  if (so.startsWith("84") && so.length === 11) so = "0" + so.slice(2);
  return /^0[35789]\d{8}$/.test(so) ? so : null;
}
