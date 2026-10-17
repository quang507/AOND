import { hashSeed } from "@/lib/geo";
// Luật che liên hệ MỘT NGUỒN cho web và bot (tầng bốn, 11/09). Trước đây file
// này và `chat-reply locLienHe` giữ hai bản regex chép tay, đồng bộ bằng lời
// hứa "sửa một bên thì sửa bên kia" trong chú thích.
import { boHoaHong, thayLienHe } from "@/bot/supabase/functions/_shared/extraction/luat-lien-he";

// FR-104 (bản 02/09, OPEN-36): web không bao giờ lộ SĐT/Zalo trong mô tả gốc —
// liên hệ chỉ mở ở bước chốt lịch xem, qua bot.
export function sanitizeDescription(text: string | null): string {
  if (!text) return "";
  return thayLienHe(boHoaHong(text), " [liên hệ qua Zalo AI Ơi Nhà Đất] ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function formatPrice(priceVnd: number | null, priceRaw: string | null): string {
  if (priceVnd && priceVnd > 0) {
    const ty = priceVnd / 1_000_000_000;
    if (ty >= 1) {
      return `${ty.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
    }
    return `${Math.round(priceVnd / 1_000_000)} triệu`;
  }
  return priceRaw?.trim() || "Thương lượng";
}

export function formatArea(m2: number | null): string {
  return m2 ? `${Number(m2).toLocaleString("vi-VN")} m²` : "-";
}

// Nhãn loại BĐS (enum `property_type` của DB) — MỘT bảng cho thẻ tin, trang
// chi tiết và form admin; trước đây chép ba nơi, lệch một chữ là web nói hai
// giọng (FR-171 j).
export const TYPE_LABEL: Record<string, string> = {
  nha_pho: "Nhà phố",
  nha_cap4: "Nhà cấp 4",
  chung_cu: "Chung cư",
  dat: "Đất",
  biet_thu: "Biệt thự",
  phong_tro: "Phòng trọ",
  mat_bang: "Mặt bằng",
  // 20260909i (chat Gemini 21/06 lượt 38): toà nhà dòng tiền, đất nông nghiệp, đất SKC/TMD, kho xưởng.
  toa_nha: "Toà nhà / CHDV",
  dat_nong_nghiep: "Đất nông nghiệp",
  dat_kinh_doanh: "Đất kinh doanh",
  kho_xuong: "Kho xưởng",
};

// Ô thông số nào CÓ NGHĨA với loại BĐS nào (01/10/2026, chủ dự án xem form sửa tin của một lô đất: "các loại bds khác thì
// bên trong tab này đâu phải là phòng ngủ"). Lớp lỗi: form admin / trang tin dùng MỘT bộ ô cho mọi loại, trong khi bot hỏi
// theo loại (bảng required_facts). MỘT bảng ở đây cho form admin và trang tin; `bot/tests/o-theo-loai.mjs` đối chiếu với bộ
// câu bot hỏi theo loại. Chưa rõ loại → hiện đủ.
// - phongNgu: loại có khái niệm phòng ngủ — trang tin / thẻ tin hiện số phòng ngủ khi có (⇔ bot có câu so_phong_ngu).
// - oPhongNguTrong: form sửa tin hiện ô phòng ngủ cả khi TRỐNG (⇔ phòng ngủ là thông số CHÍNH bot hỏi sớm, như căn hộ).
//   Nhà phố / cấp 4 / biệt thự: chủ dự án 01/10 "phòng ngủ cũng ko quan trọng" → "bỏ ô phòng ngủ khỏi form với nhà"; bot
//   hỏi phòng ngủ SAU CÙNG (20261001c) — ô chỉ hiện khi đã có số để admin sửa / xoá.
export type OTheoLoai = { phongNgu: boolean; oPhongNguTrong: boolean; ketCau: boolean; ngangDai: boolean };
const DU_O: OTheoLoai = { phongNgu: true, oPhongNguTrong: true, ketCau: true, ngangDai: true };
const NHA: OTheoLoai = { phongNgu: true, oPhongNguTrong: false, ketCau: true, ngangDai: true };
export const O_THEO_LOAI: Record<string, OTheoLoai> = {
  nha_pho: NHA,
  nha_cap4: NHA,
  biet_thu: NHA,
  chung_cu: { phongNgu: true, oPhongNguTrong: true, ketCau: false, ngangDai: false },
  toa_nha: { phongNgu: false, oPhongNguTrong: false, ketCau: true, ngangDai: true },
  dat: { phongNgu: false, oPhongNguTrong: false, ketCau: false, ngangDai: true },
  dat_nong_nghiep: { phongNgu: false, oPhongNguTrong: false, ketCau: false, ngangDai: true },
  dat_kinh_doanh: { phongNgu: false, oPhongNguTrong: false, ketCau: false, ngangDai: true },
  kho_xuong: { phongNgu: false, oPhongNguTrong: false, ketCau: false, ngangDai: true },
  mat_bang: { phongNgu: false, oPhongNguTrong: false, ketCau: false, ngangDai: true },
  phong_tro: { phongNgu: false, oPhongNguTrong: false, ketCau: false, ngangDai: false },
};
export const oTheoLoai = (loai: string | null | undefined): OTheoLoai => (loai && O_THEO_LOAI[loai]) || DU_O;

// FR-172 — nhãn cho các cột thông số có cấu trúc (migration 20260902e). Một
// bảng cho thẻ tin, trang chi tiết, bộ lọc và form admin.
export const ACCESS_LABEL: Record<string, string> = {
  mat_tien: "Mặt tiền",
  hem_xe_tai: "Hẻm xe tải",
  hem_xe_hoi: "Hẻm xe hơi",
  hem_xe_may: "Hẻm xe máy",
  hem: "Trong hẻm",
};
/** Nhãn ngắn cho thẻ tin (khách Quận 5 đọc "HXH"/"MT" quen hơn chữ đầy đủ). */
export const ACCESS_SHORT: Record<string, string> = {
  mat_tien: "MT",
  hem_xe_tai: "HXT",
  hem_xe_hoi: "HXH",
  hem_xe_may: "Hẻm xe máy",
  hem: "Hẻm",
};
export const LEGAL_LABEL: Record<string, string> = {
  so_hong_rieng: "Sổ hồng riêng",
  so_hong_chung: "Sổ hồng chung",
  so_hong: "Sổ hồng / sổ đỏ",
  hdmb: "Hợp đồng mua bán",
  giay_tay: "Giấy tay / vi bằng",
};
export const FURNISH_LABEL: Record<string, string> = {
  full: "Đầy đủ",
  co_ban: "Cơ bản",
  khong: "Không nội thất",
};
export const PLANNING_LABEL: Record<string, string> = {
  khong_lo_gioi: "Không lộ giới",
  khong_quy_hoach: "Không dính quy hoạch",
  dinh_lo_gioi: "Có lộ giới / quy hoạch",
};

/** "4 x 15 m", có nở hậu thì "4 x 15 m (nở hậu 4,5)". */
export function formatDims(frontage: number | null, length: number | null, rear?: number | null): string | null {
  if (!frontage && !length) return null;
  const n = (v: number) => Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  const base = frontage && length ? `${n(frontage)} x ${n(length)} m` : frontage ? `ngang ${n(frontage)} m` : `dài ${n(length!)} m`;
  return rear ? `${base} (nở hậu ${n(rear)})` : base;
}

/** Giá mỗi m²: tin bán "≈ 150 tr/m²", tin thuê "≈ 1,1 tr/m²/tháng". */
export function formatPricePerM2(vnd: number | null, deal: "ban" | "cho_thue"): string | null {
  if (!vnd || vnd <= 0) return null;
  const tr = vnd / 1_000_000;
  const s = tr >= 10 ? Math.round(tr).toLocaleString("vi-VN") : tr.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  return `≈ ${s} tr/m²${deal === "cho_thue" ? "/tháng" : ""}`;
}

// Deep-link Zalo mang ngữ cảnh (FR-13/14). Đang chạy acc CLONE trong lúc chờ
// OA duyệt: đặt NEXT_PUBLIC_ZALO_URL=https://zalo.me/<SĐT acc clone> trong env
// Vercel (hoặc sửa fallback dưới); OA duyệt xong đổi về link OA.
// NFR-09 — gốc URL tuyệt đối cho canonical / OpenGraph / sitemap / JSON-LD.
// 09/09/2026: project Vercel đổi tên nhadat-cc → aioinhadat, domain theo tên.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aioinhadat.vercel.app";

export const ZALO_OA_URL =
  process.env.NEXT_PUBLIC_ZALO_URL ?? "https://zalo.me/nhadatcc";
export function zaloLink(context?: string): string {
  return context ? `${ZALO_OA_URL}?ref=${encodeURIComponent(context)}` : ZALO_OA_URL;
}

// Ảnh placeholder xoay vòng theo mã tin (ảnh thật nằm OneDrive, chờ pipeline OPEN-18).
// Serve TỪ CHÍNH SITE (`public/img/` được Next.js phục vụ ở gốc). Bản cũ trỏ
// raw.githubusercontent.com: chạy được chừng nào repo còn public, nhưng buộc
// ảnh của web phụ thuộc vào một thiết lập GitHub chẳng liên quan gì — set repo
// private một cái là raw trả 404 và ảnh vỡ sạch. Đường dẫn tương đối cắt hẳn
// ràng buộc đó, lại nhanh hơn (cùng origin, qua CDN của Vercel).
const IMG_BASE = "/img";
export function placeholderImg(seed: string): string {
  return `${IMG_BASE}/house${(hashSeed(seed) % 5) + 1}.jpg`;
}
