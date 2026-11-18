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
  seller_id: string | null;
  ma_moi_gioi: string | null;
  ma_kich_hoat: string | null;
};

/** Số điện thoại di động Việt Nam sau khi bỏ dấu cách, dấu chấm, +84 — cùng luật với `gui_dang_ky_moi_gioi` trên DB. */
export function chuanSoDienThoai(s: string): string | null {
  let so = s.replace(/\D/g, "");
  if (so.startsWith("84") && so.length === 11) so = "0" + so.slice(2);
  return /^0[35789]\d{8}$/.test(so) ? so : null;
}

// ── Khách môi giới giới thiệu (SRS-5.1zzzzzzz524) ──
export type TrangThaiKhach = "moi" | "da_tiep_nhan" | "dang_cham_soc" | "da_xem_nha" | "chot" | "khong_thanh";
export const THU_TU_KHACH: TrangThaiKhach[] = ["moi", "da_tiep_nhan", "dang_cham_soc", "da_xem_nha", "chot", "khong_thanh"];
export const TRANG_THAI_KHACH: Record<TrangThaiKhach, string> = {
  moi: "Mới gửi",
  da_tiep_nhan: "Đã tiếp nhận",
  dang_cham_soc: "Đang chăm sóc",
  da_xem_nha: "Đã xem nhà",
  chot: "Đã chốt",
  khong_thanh: "Không thành",
};

export type NhatKyKhach = { id: string; khach_id: string; luc: string; vai: "moi_gioi" | "admin" | "he_thong"; ai: string; viec: string; ghi_chu: string | null };
export type KhachGioiThieu = {
  id: string;
  created_at: string;
  seller_id: string;
  ten_khach: string;
  so_dien_thoai: string;
  nhu_cau: "mua" | "thue";
  khu_vuc: string | null;
  ngan_sach: string | null;
  ma_tin: string | null;
  ghi_chu: string | null;
  trang_thai: TrangThaiKhach;
  nguoi_phu_trach: string | null;
  cap_nhat_luc: string | null;
  // SRS-5.1zzzzzzz527: mã môi giới đưa cho khách; khách nhắn mã (hoặc số điện thoại) cho trợ lý thì hồ sơ nối với Zalo của khách.
  ma_khach: string;
  noi_zalo_luc: string | null;
  da_co_truoc: "nguoi_mua" | "nguoi_ban" | null;
  // SRS-5.1zzzzzzz525: phần chi cho môi giới, có sau khi admin chốt.
  loai_chot: "ban" | "thue" | null;
  gia_chot_vnd: number | null;
  phi_cong_ty_vnd: number | null;
  hoa_hong_ty_le: number | null;
  hoa_hong_vnd: number | null;
  hoa_hong_trang_thai: "cho_thu_phi" | "da_chi" | null;
  hoa_hong_chi_luc: string | null;
};
export const COT_KHACH =
  "id, created_at, seller_id, ten_khach, so_dien_thoai, nhu_cau, khu_vuc, ngan_sach, ma_tin, ghi_chu, trang_thai, nguoi_phu_trach, cap_nhat_luc, " +
  "ma_khach, noi_zalo_luc, da_co_truoc, loai_chot, gia_chot_vnd, phi_cong_ty_vnd, hoa_hong_ty_le, hoa_hong_vnd, hoa_hong_trang_thai, hoa_hong_chi_luc";
/** Tỷ lệ chi cho môi giới giới thiệu khách, trên phí công ty thu được (bảng `cau_hinh_moi_gioi`, admin chỉnh). */
export type MucChiMG = { ty_le_ban: number; ty_le_thue: number };
export const MUC_CHI_MAC_DINH: MucChiMG = { ty_le_ban: 0.2, ty_le_thue: 0.2 };
export const phanTram = (x: number) => `${Math.round(x * 1000) / 10}%`.replace(".", ",");
export const tienDong = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("vi-VN")} đ`);
export type HoSoMoiGioi = {
  seller_id: string;
  ma_moi_gioi: string | null;
  ten: string | null;
  co_zalo: boolean;
  chuan: { dang_rao: number; chot_6_thang: number; tong_6_thang: number; ty_le_chot: number; dat_chuan: boolean } | null;
};
