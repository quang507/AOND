// Báo lại cho người bán ĐÚNG thứ đang nằm trong DB — chủ dự án 11/09/2026
// (giai đoạn test): "chat một câu là nhắn đã thu thập được gì trong Supabase".
//
// Vì sao không dùng lại bong bóng "📝 Em ghi nhận": bong bóng đó ghép từ CHỮ
// khách vừa gõ (regex tầng TS), còn cột thật do trigger `listing_facts_sync_cols`
// đọc lại bằng regex tầng SQL — hai tầng đọc số khác nhau. Khách gõ "6x11" thì
// 📝 có thể nói 66m2 trong khi cột lưu 6 (đoạn chat Zalo 08/09). Bong bóng 💾
// ĐỌC LẠI dòng tin từ DB SAU KHI mọi nhánh đã ghi xong, nên nó nói đúng cái web
// sẽ hiện — và ở chế độ đầy đủ in cả câu trả lời gốc cạnh cột để soi chỗ lệch.
//
// Công tắc `app_config.bao_lai_da_luu` (đọc mỗi lượt, không nhớ tạm — đổi là
// có hiệu lực lượt kế, không cần deploy):
//   tat      — mặc định khi chưa có dòng. Không báo gì.
//   thay_doi — chỉ báo khi dữ liệu KHÁC lần báo trước; gắn vào cuối bong bóng
//              cuối, KHÔNG đẻ thêm bong bóng (luật tối đa 2 bong bóng), không
//              in mã tin (luật cấm đọc mã cho khách). Dùng được với khách thật.
//   day_du   — lượt nào cũng báo, bong bóng riêng, kèm mã tin, trạng thái và
//              câu trả lời gốc từng khoá. CHỈ cho giai đoạn test.
//
// Hàm ở đây THUẦN (không gọi DB) để kiểm được bằng node; phần đọc DB nằm ở
// `baoLaiDaLuu` trong chat-reply.

import { donViGiaDep } from "./extraction/luat-tien.ts";
import { SPEC_COLS, thongSoNgan, type SpecRow } from "./thong_so.ts";
import { tenNhanKhongTrung } from "./extraction/nhan.ts";
import { diaChiHienThi, duongHienThi } from "./extraction/hien-thi-dia-chi.ts";
import { chuanSo, cumGocTrongTin } from "./extraction/kiem-bang-chung.ts";
import { ngangDaiCauRao } from "./extraction/boc-cau-rao.ts";
import { phuongChuan, tenDayDu } from "./extraction/khop-phuong.ts";
import { thayLienHe } from "./extraction/luat-lien-he.ts";

/** `admin` (05/10/2026, văn phong AOND): vẫn dựng bong bóng 🤖 và ghi vào `messages` cho /admin + `so.hoi_thoai`,
 *  nhưng KHÔNG gửi cho khách — khách chỉ đọc lời model (demo AOND in "[đã trích xuất]" cho người vận hành, không cho khách). */
export type CheDoBaoLai = "tat" | "thay_doi" | "day_du" | "admin";

/** Dấu mở bong bóng báo lại. Cố ý khác 📋 (tiêu đề bản nháp) và 📝 (ghi nhận lúc rao).
 *  21/09/2026 (chủ dự án): 💾 "Vừa lưu / Đã lưu" và 🤖 "AI đọc thêm" GỘP thành MỘT bong bóng "🤖 Đã lưu";
 *  fact AI đọc (nguồn ai_kiem) nằm chung danh sách, không tách dòng. */
export const DAU_BAO_LAI = "🤖";
/** 24/09/2026 (chủ dự án: "cái đã lưu đừng đưa đã lưu nữa, mà là đã bóc tách được gì trong tin nhắn đó, tin nhắn nào
 *  của khách ko bóc tách được gì thì ghi là ko bóc tách được gì … phần đã bóc tách được ghi trong dấu \" \""): bong bóng
 *  🤖 chỉ nói thứ bóc được từ CHÍNH tin khách vừa nhắn, giá trị trong ngoặc kép; không bóc được gì cũng nói ra. */
// SRS-5.1zzzzn (09/10/2026, chủ dự án bật `bao_lai_da_luu = thay_doi` cho người thử đọc trên Zalo: "ghi như con AOND á. Đã trích
// xuất “data nguyên mẫu”, làm chuẩn “data làm chuẩn”"): mỗi mục in HAI phần — cụm khách GÕ (nguyên mẫu, tìm lại đúng chữ trong tin
// khách bằng `cumGocTrongTin`, đã che liên hệ) và giá trị hệ thống LƯU / IN (làm chuẩn, qua bộ in một nguồn: `donViGiaDep`,
// `duongHienThi` / `diaChiHienThi`, phường chuẩn + quận cũ, `CHU_DAP_AN`, kích thước). Hai phần như nhau (bỏ qua hoa thường) thì in
// một lần; không tìm được cụm khách gõ (giá trị code suy ra: thông số, nhãn) thì chỉ in phần làm chuẩn. Một mục một dòng.
export const BOC_DUOC = `${DAU_BAO_LAI} Đã trích xuất:`;
export const KHONG_BOC = `${DAU_BAO_LAI} Không trích xuất được gì từ tin này.`;
/** SRS-5.1zzzzzn: lượt không có dữ liệu để trích nhưng em hiểu việc của nó (gật bản nháp, khách hỏi, tự nói vai): "🤖 Hiểu: …". */
export const HIEU_LUOT = `${DAU_BAO_LAI} Hiểu:`;
/** SRS-5.1zzzzzs (chủ dự án 13/10: "nếu nhận yêu cầu của khách hàng thì ghi ra là đã bóc tách yêu cầu … ghi nhận yêu cầu"): lượt khách
 *  XIN / HỎI về tin của mình → "🤖 Đã bóc tách yêu cầu:" + một dòng "• ghi nhận yêu cầu của {ac}: …", cùng khuôn với dòng dữ liệu. */
// SRS-5.1zzzzzzc (chủ dự án 13/10 tối: "đã trích xuất yêu cầu cho bot thực hiện 'bla bla'" — xác nhận "đúng"): một khuôn cho MỌI lượt
// khách ra LỆNH (sửa ô lúc duyệt, bỏ ô / ý, tiêu đề của khách, chuyển căn, xin xem lại tin): đầu bong bóng ghi yêu cầu trong ngoặc kép,
// dưới là các dòng dữ liệu lượt đó (nếu có). Xem `bongYeuCau`.
export const BOC_YEU_CAU = `${DAU_BAO_LAI} Đã trích xuất yêu cầu cho bot thực hiện:`;
/** "🤖 Đã trích xuất yêu cầu cho bot thực hiện: "sửa giá"\n• giá: "7 tỷ 5"" — yêu cầu + dòng dữ liệu (nếu có) của lượt. */
export const bongYeuCau = (yeuCau: string, dong: string[] = []): string => [`${BOC_YEU_CAU} "${yeuCau.replace(/\s+/g, " ").trim()}"`, ...dong].join("\n");
/** Dấu mở bong bóng lượt ẢNH (không có chữ để trích): "🤖 Đã trích xuất từ ảnh: mặt tiền". */
export const TU_ANH = `${DAU_BAO_LAI} Đã trích xuất từ ảnh:`;
const LAM_CHUAN = "làm chuẩn";
/** Nhãn thay cho SĐT / kênh liên hệ trong phần nguyên mẫu (luật che MỘT nguồn: luat-lien-he.ts). */
const CHE_LIEN_HE = "[đã che liên hệ]";
const gon = (s: string, n = 120): string => {
  const t = thayLienHe(s, CHE_LIEN_HE).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
/** 07/10/2026 (SRS-5.1zzzf, chủ dự án: "người ta xác nhận đúng sai hay trả lời câu hỏi của nó thì nó phải đọc lại câu của
 *  chính mình chứ"): tin khách là câu TRẢ LỜI cho câu bot vừa hỏi (không có dữ kiện căn để bóc) → bong bóng nói đã hiểu gì,
 *  kèm câu bot đã hỏi — không báo "Không trích xuất được gì" như thể khách nhắn vô nghĩa. SRS-5.1zzzzn: kèm nguyên mẫu (`tho` —
 *  chữ khách vừa gõ) → làm chuẩn (điều hệ thống hiểu). */
export function traLoiCauBot(cauBot: string, hieu: string, tho?: string | null): string {
  const t = tho ? gon(tho, 80) : "";
  return `${DAU_BAO_LAI} Trả lời câu em vừa hỏi ("${cauBot.trim()}"): ${t ? `đã trích xuất "${t}" → ` : ""}${LAM_CHUAN} "${hieu}".`;
}

export const COT_BAO_LAI =
  `id, code, property_type, deal, status, location_raw, street, ward, district, area_m2, price_raw, price_vnd, bedrooms, boc_tach, floor, furnishing, nhan, description, projects(name), ${SPEC_COLS}`;

export type DongBaoLai = SpecRow & {
  id?: string;
  /** Câu rao gốc — FR-226 a: có chữ "phố / lầu / hẻm…" mới gọi là nhà phố. */
  description?: string | null;
  code?: string | null;
  property_type?: string | null;
  deal?: string | null;
  status?: string | null;
  location_raw?: string | null;
  /** Tên đường từ điển (FR-212) — in thay chữ khách gõ (SRS-5.1zzzzj). */
  street?: string | null;
  ward?: string | null;
  district?: string | null;
  area_m2?: number | string | null;
  price_raw?: string | null;
  price_vnd?: number | string | null;
  bedrooms?: number | null;
  /** JSON bóc tách; `quan_mac_dinh: true` = quận chưa ai nói, cột đang giữ mặc định. */
  boc_tach?: Record<string, unknown> | null;
  /** Tầng căn hộ nằm (chung cư) — khác `floors` (số tầng nhà). */
  floor?: number | null;
  furnishing?: string | null;
  /** Dự án tin đã GẮN (project_id → projects.name), không phải tên đoán từ chữ. */
  projects?: { name?: string | null } | null;
  /** Nhãn tìm kiếm của tin (FR-211) — toàn bộ, không chỉ nhãn lượt này. */
  nhan?: string[] | null;
};

/** `goc` (SRS-5.1zzzzn): ứng viên NGUYÊN MẪU của fact này từ sổ ghi của lượt — cụm AI trích (`cum_goc` / `trich_dan`), chữ nơi gọi
 *  đưa vào cửa ghi trước khi chuẩn hoá. Chỉ là ỨNG VIÊN: chữ in ra luôn là đoạn tìm lại được trong chính tin khách. */
export type FactBaoLai = {
  question: string; answer: string | null; created_at?: string | null; source?: string | null;
  goc?: ReadonlyArray<string | null | undefined> | null;
  /** SRS-5.1zzzzzzx: tin này có nói ô đó nhưng giá trị tin đã mang từ trước — in kèm "(như cũ)". */
  nhuCu?: boolean;
};
/** Ngữ cảnh in một mục: `tin` = chữ khách vừa nhắn (nơi tìm nguyên mẫu); `dong` = dòng tin (tên đường từ điển cho bộ in). */
export type NguCanhIn = { tin?: string | null; dong?: DongBaoLai | null };

/**
 * NGUYÊN MẪU: đoạn ĐÚNG như khách gõ trong `tin` ứng với ứng viên đầu tiên tìm thấy (so trên bản bỏ dấu / ký hiệu — `chuanSo`,
 * cùng cách `kiemDeXuat` tìm `cum_goc`). Không thấy → null (không bao giờ in một chữ khách không gõ như thể khách gõ).
 */
export function timNguyenMau(tin: string | null | undefined, ...ungVien: ReadonlyArray<string | null | undefined>): string | null {
  const t = (tin ?? "").normalize("NFC");
  if (!t.trim()) return null;
  for (const u of ungVien) {
    const muc = chuanSo(String(u ?? ""));
    if (!muc || muc.length > 200) continue;
    // Chữ lưu có thể mang đơn vị code thêm ("4x15" → "4x15m2") — thử cả bản bỏ đơn vị cuối.
    for (const m of new Set([muc, muc.replace(/(\d)\s*m ?2$/, "$1")])) {
      const doan = cumGocTrongTin(t, m);
      if (doan) return doan;
    }
  }
  return null;
}

const soVi = (n: number): string => String(Math.round(n * 100) / 100).replace(".", ",");
/** Ô kích thước / diện tích → chữ chuẩn: "4x15" → "ngang 4m × dài 15m (60m²)"; "60m2" → "60m²"; "4m" (mặt tiền) → "ngang 4m". */
const O_KICH_THUOC: ReadonlySet<string> = new Set(["dien_tich", "dien_tich_dat", "dien_tich_san", "dien_tich_tim_tuong", "mat_tien"]);
export function kichThuocChuan(question: string, v: string): string {
  const kd = chuanSo(v);
  const nd = ngangDaiCauRao(kd);
  if (nd) return `ngang ${soVi(nd[0])}m × dài ${soVi(nd[1])}m (${soVi(nd[0] * nd[1])}m²)`;
  const m = /^(\d+(?:\.\d+)?)\s*(m2|m 2|met vuong|m)?$/.exec(kd);
  if (!m) return v;
  const n = Number(m[1]);
  if (question === "mat_tien") return m[2] && m[2] !== "m" ? v : `ngang ${soVi(n)}m`;
  return m[2] === "m" ? v : `${soVi(n)}m²`;
}

/** Phường để in: "Phường Phú Định (Quận 8 cũ)" — tên chuẩn + quận cũ tra từ bảng phường (dữ liệu, không đoán). Không chuẩn → null. */
export function phuongKemQuanCu(ten: string | null | undefined): string | null {
  const p = phuongChuan(ten);
  return p ? `${tenDayDu(p)}${p.quan_cu ? ` (${p.quan_cu} cũ)` : ""}` : null;
}

/** LÀM CHUẨN một fact: chữ hệ thống lưu / in, qua đúng bộ in một nguồn của ô đó. */
export function lamChuanFact(question: string, v: string, dong: DongBaoLai | null = null): string {
  return CHU_DAP_AN[question]?.[v] ?? (
    O_TIEN.has(question) ? donViGiaDep(v)
      : question === "vi_tri" ? duongHienThi(v, dong?.street ?? null) || v
      : question === "phuong" ? phuongKemQuanCu(v) ?? v
      : O_KICH_THUOC.has(question) ? kichThuocChuan(question, v)
      : v
  );
}

/** Một dòng: `• nhãn: "nguyên mẫu" → làm chuẩn "chuẩn"`; như nhau (bỏ qua hoa thường) → `• nhãn: "chuẩn"`; không có nguyên mẫu →
 *  `• nhãn: làm chuẩn "…"`. Cả hai phần qua luật che liên hệ một nguồn (`thayLienHe`) — tin khách có SĐT thì cụm gõ cũng có. */
export function dongTrichXuat(nhan: string, tho: string | null | undefined, chuan: string): string {
  const c = gon(chuan);
  const t = tho ? gon(tho) : "";
  if (!t) return `• ${nhan}: ${LAM_CHUAN} "${c}"`;
  // Chỉ khác hoa thường → in MỘT lần, bằng chữ chuẩn (đúng chữ hệ thống lưu / in).
  if (t.toLocaleLowerCase("vi") === c.toLocaleLowerCase("vi")) return `• ${nhan}: "${c}"`;
  return `• ${nhan}: "${t}" → ${LAM_CHUAN} "${c}"`;
}

/** Dòng của MỘT fact: nhãn ngắn, nguyên mẫu (cụm AI trích → chữ đưa vào cửa ghi → chữ đã lưu), làm chuẩn. */
export function dongFact(f: FactBaoLai, nhan: Record<string, string>, ngu: NguCanhIn = {}, tienTo = ""): string {
  const v = (f.answer ?? "").replace(/\s+/g, " ").trim();
  const tho = timNguyenMau(ngu.tin, ...(f.goc ?? []), v);
  return dongTrichXuat(`${tienTo}${nhanNgan(f.question, nhan)}`, tho, lamChuanFact(f.question, v, ngu.dong ?? null)) + (f.nhuCu ? " (như cũ)" : "");
}
/** Ghép bong bóng từ các dòng — null khi không có dòng nào. */
export const bongTrichXuat = (dong: string[]): string | null => dong.length ? `${BOC_DUOC}\n${dong.join("\n")}` : null;

/** Nguồn fact do AI đọc ra (FR-208 bước 2). Từ 21/09/2026 gộp chung vào bong bóng "🤖 Đã lưu". */
export const NGUON_AI = "ai_kiem";
/** Dấu cũ của dòng "AI đọc thêm" (nay trùng DAU_BAO_LAI — một bong bóng). */
export const DAU_AI_DOC = "🤖";

/** Giá trị lạ, rỗng, NULL → tắt. Thà im còn hơn bật nhầm cho khách thật. */
export function docCheDo(v: unknown): CheDoBaoLai {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "day_du" || s === "thay_doi" || s === "admin" ? s : "tat";
}

/**
 * FR-226 a (25/09/2026, chủ dự án: "Nhà người ta chưa có gì mà nó tự nhận là nhà phố"; chọn "không hỏi, tự suy sau"):
 * khách chỉ nói "bán nhà" thì tin vẫn thuộc nhóm nhà (`nha_pho` — để không lẫn với đất, hỏi đúng bộ câu của nhà) nhưng
 * HIỆN là "Nhà". Có dấu hiệu nhà phố (câu rao nói phố / trệt / lầu / tầng / N tấm / hẻm / mặt tiền, hoặc đã có số tầng
 * ≥ 2, loại đường vào, độ rộng hẻm) mới hiện "Nhà phố". Khách nói "cấp 4" thì DB đổi hẳn sang nhà cấp 4 (20260925e).
 */
export function laNhaPhoRo(l: { description?: string | null; location_raw?: string | null; floors?: number | null; floors_text?: string | null; access_type?: string | null; alley_width_m?: number | string | null }): boolean {
  const kd = boDau(`${l.description ?? ""} ${l.location_raw ?? ""} ${l.floors_text ?? ""}`);
  return (l.floors ?? 0) >= 2 || !!l.access_type || (l.alley_width_m != null && l.alley_width_m !== "") ||
    /\b(?:nha pho|np|tret|lau|lung|tang|\d+ ?tam|hem|hxh|mat tien|mt)\b/.test(kd);
}
const tenLoai = (l: DongBaoLai): string =>
  l.property_type === "nha_pho" && !laNhaPhoRo(l) ? "Nhà" : LOAI[l.property_type ?? ""] ?? "BĐS";

const LOAI: Record<string, string> = {
  nha_pho: "Nhà phố", nha_cap4: "Nhà cấp 4", chung_cu: "Căn hộ", dat: "Đất",
  biet_thu: "Biệt thự", phong_tro: "Phòng trọ", mat_bang: "Mặt bằng",
  toa_nha: "Toà nhà / CHDV", dat_nong_nghiep: "Đất nông nghiệp",
  dat_kinh_doanh: "Đất kinh doanh", kho_xuong: "Kho xưởng",
};

const TRANG_THAI: Record<string, string> = {
  cho_thong_tin: "chưa đăng", dang_ban: "đang rao", dang_quan_tam: "đang rao",
  da_chot: "đã chốt", an: "đã gỡ",
};

// Câu chờ và ảnh không phải thông số: ảnh là URL kho, ba khoá kia là lượt duyệt/chấm/hẹn.
const BO_QUA = new Set(["hinh_anh", "duyet_tin", "danh_gia", "xac_nhan_lich", "con_ban", "xac_nhan_ngung_hang_loat", "tai_lieu_du_an_nao"]);

// Khoá fact có thật trong DB mà FACT_LABELS (prompts.ts) chưa có nhãn — thấy khi
// chạy thử trên 7 tin thật 11/09: "du_an_ten" hiện nguyên tên khoá. Khoá lạ khác
// thì đổi "_" thành khoảng trắng, còn hơn in mã.
// Nhãn in trên 🤖 khác nhãn câu hỏi: FACT_LABELS.view = "view căn hộ" (câu hỏi căn hộ) mà nhà phố cũng có view
// (bắn thật 23/09: "view căn hộ: công viên" cho nhà phố). Đè trước FACT_LABELS.
// 02/10/2026 (test Zalo, ảnh chủ dự án): FACT_LABELS của nhiều ô là CÂU HỎI ("có thang máy không", "khu biệt lập có bảo vệ hay
// khu dân cư mở") — in ra "có thang máy không: "có"" ở 🤖 và "có thang máy không có thang máy" ở 📝. Ô nào nhãn là câu hỏi thì
// có tên ngắn ở đây; 🤖 và 📝 cùng đọc qua `nhanNgan`.
const NHAN_BAO_LAI: Record<string, string> = {
  view: "view",
  thang_may: "thang máy", khu_compound: "khu", can_goc: "căn góc", ngap_nuoc: "ngập nước", hem_thong: "hẻm thông",
  thuong_luong: "thương lượng", gap: "gấp", the_chap: "sổ", xay_dung: "xây dựng", len_tho_cu: "lên thổ cư",
  duong_container: "xe container", o_to_vao_nha: "ô tô vào nhà", hien_trang_su_dung: "hiện trạng", ha_tang: "hạ tầng",
  ban_giao: "bàn giao", dong_y_ban: "đồng sở hữu đồng ý bán", nguoi_dung_ten: "người đứng tên", so_huu: "sở hữu",
  hinh_thuc_thue_dat: "thuê đất", duong_vao: "đường vào", loai_duong_vao: "đường vào", ranh_gioi: "ranh giới",
  pccc: "PCCC", dien_tich_khop_so: "diện tích khớp sổ", han_hop_dong_thue: "hợp đồng thuê", du_kien_ra_so: "dự kiến ra sổ",
  cach_mat_tien: "cách mặt tiền", tang_cao_toi_da: "xây tối đa", mat_do_xd: "mật độ xây dựng",
};
/** Nhãn ngắn của một ô để IN (🤖 / 📝): bảng đè ở trên, rồi nhãn câu hỏi bỏ phần ngoặc. */
export function nhanNgan(k: string, nhan: Record<string, string>): string {
  return (NHAN_BAO_LAI[k] ?? nhan[k] ?? NHAN_THEM[k] ?? k.replace(/_/g, " ")).replace(/\s*\(.*\)\s*$/, "");
}
const NHAN_THEM: Record<string, string> = {
  du_an_ten: "tên dự án",
  loai_giao_dich: "loại giao dịch",
  dien_tich_san: "diện tích sàn", // 16/09/2026: bong bóng 💾 từng in "dien tich san"
};
// Đáp án là giá trị enum (`listings.deal`) — in cho người đọc.
const CHU_DAP_AN: Record<string, Record<string, string>> = {
  loai_giao_dich: { ban: "bán", cho_thue: "cho thuê" },
  // SRS-5.1zzzc (chat thử 07/10): AI ghi loại BĐS bằng mã — 🤖 từng in "loại bất động sản: "nha_cap4"".
  loai_bds: {
    nha_pho: "nhà phố", nha_cap4: "nhà cấp 4", chung_cu: "căn hộ chung cư", dat: "đất", biet_thu: "biệt thự", phong_tro: "phòng trọ",
    mat_bang: "mặt bằng", toa_nha: "toà nhà", dat_nong_nghiep: "đất nông nghiệp", dat_kinh_doanh: "đất kinh doanh", kho_xuong: "kho xưởng",
  },
};

const boDau = (s: string): string =>
  s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");

// numeric của PostgREST có thể về dạng chuỗi "66.00" — in gọn thành "66".
// SRS-5.1zzzzn: làm tròn 2 chữ số — 4,2 × 18 tính bằng số thực ra "75.60000000000001".
const so = (x: number | string): string => String(Math.round(Number(x) * 100) / 100);

/**
 * Một bong bóng mô tả dòng tin ĐANG nằm trong DB, hoặc null khi tắt.
 * `facts` phải xếp MỚI NHẤT trước (lấy câu trả lời mới nhất mỗi khoá).
 */
export function tomTatDaLuu(
  l: DongBaoLai | null,
  facts: FactBaoLai[],
  nhan: Record<string, string>,
  cheDo: CheDoBaoLai,
): string | null {
  if (cheDo === "tat") return null;
  if (!l) return `${DAU_BAO_LAI} Chưa có tin nào được lưu.`;

  const p: string[] = [];
  p.push(`${tenLoai(l)} ${l.deal === "cho_thue" ? "cho thuê" : "bán"}`);
  // 11/09/2026 (Zalo thật): "sao cái nào cũng ghi Q5" — Quận 5 mà là MẶC ĐỊNH (chưa
  // ai nói quận) thì nói thẳng ra, đừng để người đọc tưởng hệ thống đọc được Quận 5.
  // 20260917a: không còn mặc định Quận 5 — quận trống thì in "(chưa rõ quận)"; cờ cũ giữ để đọc tin cũ.
  const quanMacDinh = !l.district || (l.district === "Quận 5" && l.boc_tach?.quan_mac_dinh === true);
  // SRS-5.1zzzzj: in qua MỘT nguồn `diaChiHienThi` — đường chuẩn hoá từ chữ khách, phường / quận từ cột chuẩn.
  const dc = diaChiHienThi(l, quanMacDinh ? (l.district ? `${l.district} (chưa rõ quận)` : "(chưa rõ quận)") : l.district);
  if (dc) p.push(dc);
  // 14/09/2026 (bắn thật): căn hộ Sunrise City đã gắn project_id, tầng 15, full nội
  // thất nằm trong DB mà 💾 không nói — tóm tắt chỉ biết cột nhà phố.
  if (l.projects?.name) p.push(`dự án ${l.projects.name}`);
  if (l.area_m2 !== null && l.area_m2 !== undefined && l.area_m2 !== "") p.push(`${so(l.area_m2)}m²`);
  const ts = thongSoNgan(l).replace(/^ · /, "");
  if (ts) p.push(ts);
  if (l.floor != null) p.push(`tầng ${l.floor}`);
  if (l.furnishing) p.push(`nội thất ${({ full: "đầy đủ", co_ban: "cơ bản", khong: "không (nhà trống)" } as Record<string, string>)[l.furnishing] ?? l.furnishing}`);
  if (l.bedrooms) p.push(`${l.bedrooms} phòng ngủ`);
  // Có chữ giá mà không ra số = parse_vnd không đọc được → web lọc giá sẽ không thấy tin.
  // 22/09/2026 (bắn thật): khách gõ "4 ty 3" thì 🤖 in "giá 4 ty 3" tới khi sửa — chỉ ĐỌC cho đẹp đơn vị
  // (ty/ti/toi → tỷ, trieu/tr → triệu), không đụng `price_raw` trong DB.
  if (l.price_raw) p.push(l.price_vnd ? `giá ${donViGiaDep(l.price_raw)}` : `giá "${l.price_raw}" (chưa đọc ra số)`);
  // 23/09/2026 (bắn thật FR-215): fact "nhan" chỉ giữ nhãn THÊM ở một lượt — lượt 2 thêm "đã hoàn công" thì 🤖 mất
  // "view công viên" của lượt 1. In cột `listings.nhan` (đủ mọi nhãn) thay cho fact đó.
  // 25/09/2026: nhãn mà thông số phía trước đã nói ("sân thượng", "lửng") không in lặp.
  const nhanIn = l.nhan?.length ? tenNhanKhongTrung(l.nhan, p.join(" ")) : "";
  if (nhanIn) p.push(`nhãn: ${nhanIn}`);

  if (cheDo === "thay_doi") return `${DAU_BAO_LAI} Đã lưu: ${p.join(" · ")}`;

  const tt = TRANG_THAI[l.status ?? ""];
  const dau = `${DAU_BAO_LAI} Đã lưu${l.code ? ` tin ${l.code}` : ""}${tt ? ` (${tt})` : ""}: ${p.join(" · ")}`;

  const moiNhat = new Map<string, string>();
  for (const f of facts) {
    const a = (f.answer ?? "").replace(/\s+/g, " ").trim();
    if (!a || BO_QUA.has(f.question) || moiNhat.has(f.question)) continue;
    moiNhat.set(f.question, a);
  }
  if (!moiNhat.size) return dau;
  const tho = [...moiNhat].slice(0, 10).map(([k, v]) => {
    const ten = nhanNgan(k, nhan);
    return `${ten}: "${v.length > 40 ? v.slice(0, 39) + "…" : v}"`;
  });
  return `${dau}\nCâu trả lời gốc: ${tho.join(" · ")}`;
}

/**
 * Lượt TẠO tin: cả dòng tin là thứ bóc từ câu rao → in từng cột đã có (24/09/2026). SRS-5.1zzzzn: mỗi cột kèm nguyên mẫu khi tìm
 * được cụm khách gõ (fact cùng ô của lượt này, hay chữ lưu nguyên văn `location_raw` / `price_raw`); cột code SUY RA (loại khi
 * không có cụm, thông số, nhãn) chỉ in phần làm chuẩn. Fact lượt này mà cột chưa nói (`kemLuotTao`) nối tiếp, cùng kiểu dòng.
 * ```
 * 🤖 Đã trích xuất:
 * • loại: "bán nhà" → làm chuẩn "Nhà phố bán"
 * • địa chỉ: "duong pham van chieu" → làm chuẩn "Đường Phạm Văn Chiêu, Phường An Hội Tây, Quận Gò Vấp"
 * • giá: "9 ty 5" → làm chuẩn "9 tỷ 5"
 * ```
 */
export function bocTachTaoTin(l: DongBaoLai | null, ngu: { tin?: string | null; facts?: FactBaoLai[]; nhan?: Record<string, string> } = {}): string | null {
  if (!l) return null;
  const facts = ngu.facts ?? [];
  // Ứng viên nguyên mẫu của một cột: cụm AI trích / chữ vào cửa ghi / chữ đã lưu của các fact cùng ô lượt này, rồi chữ cột lưu nguyên văn.
  const ungVien = (khoa: string[], ...them: Array<string | null | undefined>): Array<string | null | undefined> => [
    ...facts.filter((f) => khoa.includes(f.question)).flatMap((f) => [...(f.goc ?? []), f.answer]),
    ...them,
  ];
  const p: Array<[string, string, string | null]> = [];
  const cot = (nhan: string, chuan: string, ...uv: Array<string | null | undefined>) => p.push([nhan, chuan, timNguyenMau(ngu.tin, ...uv)]);
  cot("loại", `${tenLoai(l)} ${l.deal === "cho_thue" ? "cho thuê" : "bán"}`, ...ungVien(["loai_bds", "loai_giao_dich"]));
  const quanMacDinh = !l.district || (l.district === "Quận 5" && l.boc_tach?.quan_mac_dinh === true);
  const dc = diaChiHienThi(l, quanMacDinh ? null : l.district);
  if (dc) cot("địa chỉ", `${dc}${quanMacDinh ? " (chưa rõ quận)" : ""}`, ...ungVien(["vi_tri"], l.location_raw));
  if (l.projects?.name) cot("dự án", l.projects.name, ...ungVien(["du_an_ten"], l.projects.name));
  // Diện tích nhân từ ngang × dài: khách gõ "4x15" / "ngang 4 dài 15" — hai dạng đó cũng là ứng viên (chỉ in khi có trong tin).
  const ngDai = l.frontage_m && l.length_m ? [`${so(l.frontage_m)}x${so(l.length_m)}`, `ngang ${so(l.frontage_m)} dai ${so(l.length_m)}`] : [];
  if (l.area_m2 !== null && l.area_m2 !== undefined && l.area_m2 !== "") cot("diện tích", `${so(l.area_m2)}m²`, ...ungVien(["dien_tich", "dien_tich_dat", "dien_tich_san", "dien_tich_tim_tuong"], ...ngDai));
  const ts = thongSoNgan(l).replace(/^ · /, "");
  if (ts) cot("thông số", ts);
  if (l.floor != null) cot("tầng", String(l.floor), ...ungVien(["tang"]));
  if (l.furnishing) cot("nội thất", ({ full: "đầy đủ", co_ban: "cơ bản", khong: "không (nhà trống)" } as Record<string, string>)[l.furnishing] ?? l.furnishing, ...ungVien(["noi_that"]));
  if (l.bedrooms) cot("phòng ngủ", String(l.bedrooms), ...ungVien(["so_phong_ngu"]));
  if (l.price_raw) cot("giá", l.price_vnd ? donViGiaDep(l.price_raw) : `${l.price_raw} (chưa đọc ra số)`, ...ungVien(["gia"], l.price_raw));
  // 25/09/2026 (bắn thật lx-13): "thông số: … lửng … sân thượng" rồi "nhãn: sân thượng · có gác lửng" — không in lặp.
  const nhanIn = l.nhan?.length ? tenNhanKhongTrung(l.nhan, p.map(([, v]) => v).join(" ")) : "";
  if (nhanIn) cot("nhãn", nhanIn);
  const dong = p.map(([k, v, tho]) => dongTrichXuat(k, tho, v));
  const kem = kemLuotTao(facts, ngu.nhan ?? {}, l, { tin: ngu.tin, dong: l });
  return bongTrichXuat(kem ? [...dong, kem] : dong);
}

// ── 14/09/2026: báo NGAY SAU tin khách, đúng thứ TIN ĐÓ vừa lưu ────────────
// Chủ dự án: "nhắn tin lại cho khách liền sau tin nhắn đó đã bóc tách (thật vào
// db) gì luôn". Bản trước chỉ in TÓM TẮT CỘT của tin, gắn vào CUỐI bong bóng cuối
// và chỉ khi cột đổi — nên cọc / thời hạn thuê / phí quản lý (chỉ nằm ở fact)
// không bao giờ hiện, câu "à nhầm, 6 tỷ 5" chìm sau câu hỏi, và người mua không
// được báo gì. Nay tầng trên đọc lại DB: fact có `created_at` ≥ giờ ghi tin khách
// (cùng đồng hồ DB), hồ sơ người mua đọc lại sau khi gộp; hàm dưới chỉ dựng chữ.

/** Dấu cũ của dòng "📦 Tin giờ" (tóm tắt tin ở các lượt sau). 21/09/2026 (chủ dự án): bỏ — lượt sau in một
 *  dòng "🤖 Đã lưu:" đầy đủ y như lượt tạo tin. Giữ hằng để `tomTatTrongCau` còn đọc được câu bot cũ trong sổ. */
export const DAU_TIN_GIO = "📦 Tin giờ:";

/** Ô fact mang SỐ TIỀN — in bằng `donViGiaDep`. */
const O_TIEN: ReadonlySet<string> = new Set(["gia", "tien_coc", "doanh_thu", "thu_nhap_thue"]);
/** Các DÒNG trích xuất của fact lượt này (mới nhất trước → in theo thứ tự ghi), rỗng khi không có. */
export function dongVuaLuu(facts: FactBaoLai[], nhan: Record<string, string>, ngu: NguCanhIn = {}): string[] {
  const moiNhat = new Map<string, string>();
  const goc = new Map<string, FactBaoLai["goc"]>();
  const nhuCu = new Map<string, boolean>();
  // SRS-5.1zzzzzw (Zalo thật 13/10 15:47, bài rao KDC Cầu Tràm: 🤖 in "thông tin bổ sung: … 'thông ra ĐT 835D chỉ 200 mét'" trong khi lượt
  // ghi nhiều ý): ghi chú `bo_sung` là NHIỀU dòng một lượt — mỗi khoá chỉ giữ một giá trị thì bong bóng chỉ còn ý đầu. Gộp đủ các ý " · ".
  // Mỗi ý một dòng (một dòng gộp 120 ký tự lại cắt mất ý sau), thứ tự như lúc ghi.
  const boSung: string[] = [];
  for (const f of facts) {
    const a = (f.answer ?? "").replace(/\s+/g, " ").trim();
    if (!a || BO_QUA.has(f.question)) continue;
    if (f.question === "bo_sung") {
      for (const y of a.split(" · ")) if (y.trim() && !boSung.includes(y.trim())) boSung.push(y.trim());
      continue;
    }
    if (moiNhat.has(f.question)) continue;
    moiNhat.set(f.question, a);
    goc.set(f.question, f.goc ?? null);
    if (f.nhuCu) nhuCu.set(f.question, true);
  }
  const dongBoSung = boSung.reverse().map((y) => `• ${nhanNgan("bo_sung", nhan)}: "${gon(y, 170)}"`);
  if (!moiNhat.size && !dongBoSung.length) return [];
  // 25/09/2026 (chủ dự án test Zalo): "5x12" → "diện tích đất: "5x12" · diện tích: "5x12"" — cùng một câu trả lời ghi vào
  // hai khoá diện tích. Cùng họ diện tích mà cùng giá trị thì in một lần.
  const daIn = new Set<string>();
  for (const k of ["dien_tich", "dien_tich_dat", "dien_tich_tim_tuong"]) {
    const v = moiNhat.get(k);
    if (v === undefined) continue;
    if (daIn.has(v)) moiNhat.delete(k);
    else daIn.add(v);
  }
  // 23/09/2026 (chủ dự án: "ghi thật đầy đủ"): trần 12 khoá / 50 ký tự từng cắt mất fact và đuôi câu trả lời.
  // SRS-5.1zzzzh / 5.1zzzzj: phần LÀM CHUẨN đọc qua bộ in một nguồn (`lamChuanFact`: tiền `donViGiaDep`, địa chỉ `duongHienThi`,
  // phường + quận cũ, kích thước); fact trong DB giữ nguyên chữ. SRS-5.1zzzzn: phần NGUYÊN MẪU là cụm khách gõ (`dongFact`).
  return [...[...moiNhat].reverse().slice(0, 40).map(([k, v]) => dongFact({ question: k, answer: v, goc: goc.get(k), nhuCu: nhuCu.get(k) }, nhan, ngu)), ...dongBoSung];
}
/** "🤖 Đã trích xuất:\n• giá: "9 ty 5" → làm chuẩn "9 tỷ 5"\n• pháp lý: "sổ hồng riêng"" — fact lượt này, null khi không có. */
export function vuaLuuBan(facts: FactBaoLai[], nhan: Record<string, string>, ngu: NguCanhIn = {}): string | null {
  return bongTrichXuat(dongVuaLuu(facts, nhan, ngu));
}

/** "🤖 AI đọc thêm (đã kiểm):\n• hướng: …" — fact nguồn `ai_kiem` lượt này. */
export function aiDocThem(facts: FactBaoLai[], nhan: Record<string, string>, ngu: NguCanhIn = {}): string | null {
  const v = dongVuaLuu(facts.filter((f) => f.source === NGUON_AI), nhan, ngu);
  return v.length ? `${DAU_AI_DOC} AI đọc thêm (đã kiểm):\n${v.join("\n")}` : null;
}

// Fact mà tóm tắt CỘT nói THAY — chỉ khi cột đó thật sự có giá trị trên dòng tin (23/09/2026, chủ dự án: "in các cột chính
// và thông tin của lượt hiện tại thôi nhưng ko được thiếu cái gì hết"). Cột trống (trigger không đọc ra, ví dụ pháp lý
// gõ lạ) thì fact vẫn in ở "Kèm:"; "gấp" không có trong tóm tắt cột nên luôn in.
const COT_NOI_THAY: Record<string, (l: DongBaoLai) => boolean> = {
  dien_tich: (l) => l.area_m2 != null && l.area_m2 !== "",
  dien_tich_dat: (l) => l.area_m2 != null && l.area_m2 !== "",
  dien_tich_tim_tuong: (l) => l.area_m2 != null && l.area_m2 !== "",
  gia: (l) => !!l.price_raw,
  phuong: (l) => !!l.ward,
  vi_tri: (l) => !!l.location_raw,
  so_phong_ngu: (l) => !!l.bedrooms,
  ket_cau: (l) => !!(l.floors_text || l.floors),
  do_rong_hem: (l) => !!l.access_type,
  phap_ly: (l) => !!l.legal_status,
  so_wc: (l) => !!l.bathrooms,
  mat_tien: (l) => !!(l.frontage_m && l.length_m),
  huong: (l) => !!l.direction,
  loai_bds: (l) => !!l.property_type && l.property_type !== "chua_ro",
  tang: (l) => l.floor != null,
  noi_that: (l) => !!l.furnishing,
  nhan: (l) => !!l.nhan?.length, // tóm tắt cột in cả `listings.nhan`
};

/** Các dòng "• view: "view sông"\n• lý do bán: "cần tiền"" — fact CỦA LƯỢT NÀY mà dòng cột `l` chưa nói (SRS-5.1zzzzn: nối
 *  thẳng dưới các cột của `bocTachTaoTin`, cùng kiểu dòng; bỏ chữ "Kèm:"). null khi không có. */
export function kemLuotTao(facts: FactBaoLai[], nhan: Record<string, string>, l: DongBaoLai | null = null, ngu: NguCanhIn = {}): string | null {
  // 21/09/2026 (gộp 🤖 vào 💾): chỉ nêu fact mà tóm tắt cột không nói, bất kể nguồn (AI hay luật).
  const con = facts.filter((f) => {
    const noiThay = COT_NOI_THAY[f.question];
    if (!noiThay) return true;
    // Không có dòng tin để đối chiếu → giữ cách cũ: coi như cột đã nói.
    return l ? !noiThay(l) : false;
  });
  const v = dongVuaLuu(con, nhan, ngu);
  return v.length ? v.join("\n") : null;
}

// Khoá hồ sơ người mua là việc NỘI BỘ của bot — không báo.
const MUA_NOI_BO = new Set(["ten_tro_ly", "xung_ho", "photo_offset", "hoi_vai", "hoi_vai_lai", "gan_tien_ich_loc"]);
const MUA_NHAN_THEM: Record<string, string> = {
  gan_tien_ich: "muốn ở gần", notes: "hoàn cảnh", gap: "cần gấp", name: "tên",
  phap_ly: "pháp lý mong muốn", // 23/09/2026: "ưu tiên sổ hồng riêng" không còn nằm ở "hoàn cảnh".
  so_tang: "số tầng mong muốn", // SRS-5.1zzzzb
};

/**
 * "🤖 Bóc tách được: khu vực muốn tìm: "Quận 5" · khoảng giá: "7 tỷ"" — các khoá hồ sơ ĐỔI
 * giữa `truoc` (đầu lượt) và `sau` (đọc lại DB sau khi gộp). Không đổi gì → null.
 */
export function vuaLuuMua(
  truoc: Record<string, unknown> | null | undefined,
  sau: Record<string, unknown> | null | undefined,
  truong: Array<[string, string]>,
  tin: string | null = null,
): string | null {
  if (!sau) return null;
  const nhanTruong = Object.fromEntries(truong.map(([k, v]) => [k, v.replace(/\s*\(.*\)\s*$/, "")]));
  const giaTri = (k: string, v: unknown): string => {
    if (k === "deal") return v === "thue" ? "thuê" : v === "ban" ? "mua" : String(v);
    if (typeof v === "boolean") return v ? "có" : "không";
    return String(v).replace(/\s+/g, " ").trim();
  };
  const ds: string[] = [];
  const thuTu = [...truong.map(([k]) => k), ...Object.keys(sau).filter((k) => !truong.some(([t]) => t === k))];
  for (const k of thuTu) {
    if (MUA_NOI_BO.has(k)) continue;
    const v = sau[k];
    if (v == null || v === "" || (typeof v === "object")) continue;
    if (JSON.stringify(truoc?.[k] ?? null) === JSON.stringify(v)) continue;
    const ten = nhanTruong[k] ?? MUA_NHAN_THEM[k];
    if (!ten) continue;
    const s = giaTri(k, v);
    // SRS-5.1zzzzn: cùng kiểu dòng với người bán — nguyên mẫu là cụm khách gõ tìm lại được trong tin (giá trị hồ sơ là ứng viên).
    ds.push(dongTrichXuat(ten, timNguyenMau(tin, s, typeof v === "string" ? v : null), s));
  }
  return bongTrichXuat(ds);
}

/** Tóm tắt tin (không dấu mở) nằm trong một câu bot có 💾, để so "tin có đổi không". */
export function tomTatTrongCau(body: string | null | undefined): string | null {
  if (!body) return null;
  const m = [...body.matchAll(new RegExp(`(?:${DAU_BAO_LAI} Đã lưu(?: tin [^:(]*)?(?: \\([^)]*\\))?:|${DAU_TIN_GIO}) ([^\\n]*)`, "gu"))];
  return m.length ? m[m.length - 1][1].trim() : null;
}

/** Phần 💾 trong một câu bot đã lưu (bong bóng riêng hoặc dòng gắn cuối), không có thì null. */
export function layBaoLai(body: string | null | undefined): string | null {
  if (!body) return null;
  if (body.startsWith(DAU_BAO_LAI)) return body;
  const i = body.indexOf(`\n${DAU_BAO_LAI}`);
  return i >= 0 ? body.slice(i + 1) : null;
}

/** Câu bot sau khi bỏ phần 💾 — lịch sử gửi model không được thấy bảng báo lại. */
export function boBaoLai(body: string | null | undefined): string | null {
  if (!body) return body ?? null;
  if (body.startsWith(DAU_BAO_LAI) || body.startsWith(DAU_AI_DOC)) return "";
  const i = body.indexOf(`\n${DAU_BAO_LAI}`);
  const j = body.indexOf(`\n${DAU_AI_DOC}`);
  const cat = [i, j].filter((x) => x >= 0);
  return cat.length ? body.slice(0, Math.min(...cat)) : body;
}
