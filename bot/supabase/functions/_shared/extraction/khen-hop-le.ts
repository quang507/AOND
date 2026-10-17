// khen-hop-le.ts — kiểm TẤT ĐỊNH câu khen AI viết dưới bản nháp (SRS-5.1zzzzzl). Tách khỏi `ai/khen-nhap.ts` để kiểm offline không
// cần SDK (luật `bot/tests/ranh-gioi.mjs`: tầng bóc tách không import AI).
import { trichCoTrongTin } from "./kiem-bang-chung.ts";

/**
 * Kiểm tất định câu khen: một câu (≤ 200 ký tự, không xuống dòng, không "?"), có ít nhất một cụm dựa vào và MỌI cụm chép nguyên văn từ
 * bản tin, mọi con số trong câu có trong bản tin. Không qua → null (bản nháp không có câu khen).
 */
export function khenHopLe(khen: string | null | undefined, duaTren: string[], banTin: string): string | null {
  const k = (khen ?? "").replace(/\s+/g, " ").trim();
  if (k.length < 10 || k.length > 200 || /[?\n]/.test(khen ?? "") || /—/.test(k)) return null;
  const cum = (duaTren ?? []).map((x) => (x ?? "").trim()).filter(Boolean);
  if (!cum.length || cum.some((x) => !trichCoTrongTin(x, banTin))) return null;
  const soTin = new Set((banTin.match(/\d+(?:[.,]\d+)?/g) ?? []).map((s) => s.replace(",", ".")));
  if ((k.match(/\d+(?:[.,]\d+)?/g) ?? []).some((s) => !soTin.has(s.replace(",", ".")))) return null;
  return k;
}

/**
 * SRS-5.1zzzzzn: lời nhận ảnh giấy tờ model viết (`phan-loai-anh.ts` `loi_nhan`). Qua khi: 10–220 ký tự, không "?" (lời báo, không hỏi), không
 * gạch dài, mọi con số trong lời là diện tích đọc trên giấy hoặc diện tích đang ghi (không số nào khác — chặn lộ số thửa / số tờ / số giấy tờ).
 * Không qua → null (nơi gọi dùng câu soạn sẵn).
 */
export function loiNhanGiayToHopLe(loi: string | null | undefined, soM2: number | null | undefined, dangGhiM2: number | null | undefined): string | null {
  const k = (loi ?? "").replace(/\s+/g, " ").trim();
  if (k.length < 10 || k.length > 220 || /\?/.test(k) || /—/.test(k)) return null;
  const choPhep = new Set([soM2, dangGhiM2].filter((x): x is number => typeof x === "number" && x > 0).map((x) => String(x)));
  // "132m2" — chữ số 2 của đơn vị không phải con số.
  const so = (k.replace(/(\d)\s*m2(?![\p{L}\d])/giu, "$1m²").match(/\d+(?:[.,]\d+)?/g) ?? []).map((s) => String(Number(s.replace(",", "."))));
  if (so.some((s) => !choPhep.has(s))) return null;
  return k;
}

/**
 * SRS-5.1zzzzzq (Zalo thật 13/10/2026, khách mua hỏi "Diện tích căn 3 phòng ngủ của Hà Đô Centrosa là bao nhiêu?"): model trả lời
 * ĐÚNG "căn 3PN từ 128-138m2" lấy từ khối DỰ ÁN, nhưng ba lưới "kho trống" (`boCanBia`, lượt soát nhận xét người mua, `chanHuaCoHang`)
 * coi mọi câu có diện tích / giá / khen là căn bịa → gọt sạch, khách chỉ nhận câu hỏi lạc đề. Kiến thức dự án là NGUỒN, như kho căn.
 * AI soát (`soatNhanXetBangModel` đối tượng người mua) liệt kê câu nói về dự án kèm `can_cu` chép từ khối dự án; câu này giữ khi:
 * không nói có hàng, không đánh giá thị trường, kiểu nhắc lại (không suy ra / chấm điểm), MỌI căn cứ có thật trong khối dự án, và mọi
 * con số trong câu nằm trong căn cứ của nó (chặn "tầm 10-12 tỷ" tự nhân giá/m² × diện tích). Trả các câu giữ (nguyên văn AI chép).
 */
export function cauDuAnCoNguon(
  nhanXet: Array<{ cau?: string | null; can_cu?: string | null; kieu?: string | null; noi_co_hang?: boolean | null; danh_gia_thi_truong?: boolean | null }>,
  nguon: string,
): string[] {
  if (!nguon.trim()) return [];
  const so = (x: string) => (x.replace(/(\d)\s*m2(?![\p{L}\d])/giu, "$1m²").match(/\d+(?:[.,]\d+)?/g) ?? []).map((s) => String(Number(s.replace(",", "."))));
  const theoCau = new Map<string, { canCu: string[]; hong: boolean }>();
  for (const n of nhanXet) {
    const cau = (n.cau ?? "").trim();
    if (!cau || /\?/.test(cau)) continue;
    const o = theoCau.get(cau) ?? { canCu: [], hong: false };
    const cc = (n.can_cu ?? "").trim();
    if (n.noi_co_hang === true || n.danh_gia_thi_truong === true || (n.kieu && n.kieu !== "nhac_lai") || !cc || !trichCoTrongTin(cc, nguon)) o.hong = true;
    else o.canCu.push(cc);
    theoCau.set(cau, o);
  }
  const ra: string[] = [];
  for (const [cau, o] of theoCau) {
    if (o.hong || !o.canCu.length) continue;
    const coSo = new Set(so(o.canCu.join(" ")));
    if (so(cau).every((s) => coSo.has(s))) ra.push(cau);
  }
  return ra;
}

/**
 * SRS-5.1zzzzzr: tiêu đề AI viết ("hoa văn tí") — qua khi: 20–100 ký tự, một dòng, không "?", "!", gạch dài, mở bằng "Chỉ", MỌI con số
 * có trong bản tin (giá, m², số tầng…), không chữ nói thị trường / sinh lời / hứa / tiếng Anh quảng cáo. Không qua → null (giữ tiêu đề máy).
 */
export function tieuDeHopLe(td: string | null | undefined, banTin: string): string | null {
  const k = (td ?? "").replace(/\s+/g, " ").trim();
  // SRS-5.1zzzzzu: không bắt mở bằng "Chỉ" nữa (tiêu đề "cachy" cho cả tin bán lẫn thuê) — vẫn phải có ít nhất một con số (giá / diện tích).
  if (k.length < 20 || k.length > 100 || /[?!\n—]/.test(td ?? "") || !/\d/.test(k)) return null;
  const CAM = /\b(?:dễ bán|bán nhanh|khách chuộng|đắt khách|sinh lời|đầu tư|thanh khoản|giá tốt|giá rẻ|rẻ nhất|hời|lời|cam kết|đảm bảo|hot|vip|luxury|premium|view)\b/iu;
  if (CAM.test(k)) return null;
  // "nhà cấp 4" là LOẠI nhà, không phải con số — chỉ nhận khi bản tin cũng nói cấp 4 (AI gọi nhà trệt lửng là "cấp 4" thì bỏ).
  const CAP4 = /\bcấp\s*4\b/iu;
  if (CAP4.test(k) && !CAP4.test(banTin)) return null;
  const so = (x: string) => (x.replace(CAP4, "cấp bốn").replace(/(\d)\s*m2(?![\p{L}\d])/giu, "$1m²").match(/\d+(?:[.,]\d+)?/g) ?? []).map((v) => v.replace(",", "."));
  const coSo = new Set(so(banTin));
  if (so(k).some((v) => !coSo.has(v))) return null;
  return k;
}

/**
 * SRS-5.1zzzzzz (chủ dự án 13/10/2026: "Chọn lọc các tiện ích trong tin dự án để đưa ra ý ngon nghẻ"): bài rao dự án / khu dân cư liệt kê 7–9
 * tiện ích, dòng 🏫 in hết thì rối. AI (cùng lượt khen bản nháp) chọn tối đa 4 ý đáng khoe và viết gọn; code kiểm TẤT ĐỊNH từng ý:
 * `goc` phải là đúng một ý trong danh sách ứng viên (so bỏ dấu, bỏ "có" đầu); `gon` ≤ 60 ký tự, một dòng, không "?", không gạch dài, MỌI con
 * số trong gon có trong goc, MỌI chữ viết hoa (tên riêng, viết tắt như KCN) trong gon có trong goc (bỏ dấu; "KCN" nhận khi goc có "khu công
 * nghiệp"), không chữ nhận định / quảng cáo. gon không qua → in goc. Trả danh sách ý ĐÃ CHỌN (goc gốc + chữ in), tối đa 4, theo thứ tự AI xếp.
 * Dữ liệu DB không đụng — chỉ chọn thứ in lên tin.
 */
export function tienIchNoiBatHopLe(
  ds: Array<{ goc?: string | null; gon?: string | null }> | null | undefined, ungVien: string[],
): Array<{ goc: string; in: string }> {
  const bd = (s: string) => s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const khoa = (s: string) => bd(s).replace(/[^a-z0-9]+/g, " ").trim().replace(/^(?:nha co|can co|co)\s+/, "");
  const CAM = /\b(?:sầm uất|tiện lợi|đắc địa|đẳng cấp|tuyệt vời|lý tưởng|thuận tiện|dễ bán|sinh lời|đầu tư|hot|vip|view|đẹp|tốt|rộng)\b/iu;
  const VIET_TAT: Record<string, string> = { kcn: "khu cong nghiep", tt: "trung tam", bv: "benh vien", th: "truong", st: "sieu thi", ql: "quoc lo", dt: "duong tinh|dt", cc: "chung cu", kdc: "khu dan cu", ubnd: "uy ban" };
  const so = (x: string) => (x.match(/\d+(?:[.,]\d+)?/g) ?? []).map((v) => v.replace(",", "."));
  const ra: Array<{ goc: string; in: string }> = [];
  const daChon = new Set<string>();
  for (const d of ds ?? []) {
    const goc0 = (d?.goc ?? "").replace(/\s+/g, " ").trim();
    if (!goc0) continue;
    const goc = ungVien.find((u) => khoa(u) === khoa(goc0));
    if (!goc || daChon.has(khoa(goc))) continue;
    daChon.add(khoa(goc));
    let inRa = goc;
    const gon = (d?.gon ?? "").replace(/\s+/g, " ").trim();
    if (gon && gon.length <= 60 && !/[?\n—]/.test(gon) && !CAM.test(gon)) {
      const soGoc = new Set(so(goc));
      const kdGoc = bd(goc);
      const soOk = so(gon).every((v) => soGoc.has(v));
      const tenOk = (gon.match(/\p{Lu}[\p{L}\d]*/gu) ?? []).every((w) => {
        const k = bd(w);
        if (kdGoc.includes(k)) return true;
        const dai = VIET_TAT[k];
        return !!dai && new RegExp(dai).test(kdGoc);
      });
      if (soOk && tenOk) inRa = gon;
    }
    ra.push({ goc, in: inRa });
    if (ra.length >= 4) break;
  }
  return ra;
}
