// hoi-ve-tin.ts — CHỦ NHÀ HỎI VỀ CHÍNH TIN CỦA MÌNH (22/09/2026, bắn thật căn hộ Hùng Vương Plaza).
//
// "hồi nãy anh nói giá bao nhiêu nhỉ" → bot đáp "em kiểm tra rồi báo lại" dù giá 4 tỷ 5 nằm ngay
// trong DB; "có khách nào hỏi chưa em" → bị nuốt làm câu trả lời chấm điểm. Chủ nhà hỏi thứ hệ
// thống ĐANG GIỮ thì trả lời tiền định từ DB, không nhờ model, không đoán. Tiền định, không mạng.
//
// Nhận diện chặt: câu phải có dáng HỎI (dấu hỏi, hoặc đuôi "chưa / không / nhỉ / vậy / sao … em")
// và KHÔNG mang con số kèm đơn vị (câu "giá 4 tỷ 3 được không?" là câu TRẢ LỜI kèm hỏi, đi đường cũ).

import { nhanDienFact } from "./khop-cau-tra-loi.ts";
import { donViGiaDep } from "./luat-tien.ts";

const boDau = (s: string): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export type LoaiHoiTin = "khach" | "gia" | "dien_tich" | "dia_chi" | "tang" | "huong" | "phap_ly" | "trang_thai" | "ban_chua" | "noi_dang" | "bao_lau_ban" | "noi_dung";

export type TinTom = {
  code?: string | null; status?: string | null; price_raw?: string | null; area_m2?: number | string | null;
  location_raw?: string | null; ward?: string | null; district?: string | null; floor?: number | null;
  direction?: string | null; legal_status?: string | null; bedrooms?: number | null;
};
export type KhachTom = { quan_tam: number; hoi: number };

const CO_SO_DON_VI = /\d\s*(?:ty|ti|toi|trieu|tr\b|m2|m\b|pn|lau|tang|tam|x\s*\d)/;
const DANG_HOI = /\?|\b(?:bao nhieu|nhieu|may|nao|gi|sao|the nao|chua|khong|ko|nhi|nho|ha|ho|vay|a)\s*(?:em|chau|e|nhe|nha)?\s*[?.!]*$/;

/** Câu hỏi về tin → loại; không phải → null. */
export function hoiVeTin(text: string): LoaiHoiTin | null {
  const goc = (text ?? "").trim();
  if (!goc) return null;
  // 29/09/2026 (kịch bản K9): bỏ dấu thì "đang" = "đăng" — câu CÓ dấu, "đang" (không phải "đăng") không được đọc là đăng tin.
  const kd = boDau(goc.replace(/(?<![\p{L}])[đĐ]ang(?![\p{L}])/gu, "dxng")).replace(/\s+/g, " ").trim();
  if (CO_SO_DON_VI.test(kd)) return null;
  // SRS-5.1zzzzzq (Zalo thật 13/10/2026: "Cho Bác xin nội dung tin đăng của Bác" → model TỰ VIẾT một tin 6x22m, 2 lầu, sổ riêng không có
  // trong DB): XIN xem lại NỘI DUNG tin / bản tin / bài rao là lời xin, không cần dáng hỏi → code gửi đúng bản tin dựng từ DB. Lưới đỡ
  // khi AI (`hoi_noi_dung`) không chạy.
  if (/\b(?:noi dung|ban tin|bai rao|bai dxng|tin dxng|tin rao|bai viet)\b/.test(kd) && /\b(?:xin|cho .{0,12}xem|gui lai|gui cho|xem lai|coi lai|doc lai|ghi sao|nhu nao|the nao|ra sao)\b/.test(kd) && !/\bgia\b/.test(kd) && !nhanDienFact(goc)) return "noi_dung";
  if (!DANG_HOI.test(kd)) return null;
  // Câu mang DỮ LIỆU ("Được giá, căn tôi sở hữu nhưng… có thông tin thêm không") là câu trả lời kèm hỏi
  // ngược → đi đường cũ (ghi fact + hỏi ngược), không phải hỏi về tin.
  if (nhanDienFact(goc)) return null;
  if (kd.split(" ").length < 3) return null;
  // 22/09/2026 (kịch bản C): "bán rồi hả em?" — model từng đáp "Chủ nhà bán rồi em chưa biết, để em hỏi
  // chủ nhà" với chính chủ nhà. Hỏi ĐÃ BÁN CHƯA là hỏi về tin: trả lời từ trạng thái, không nhờ model.
  // SRS-5.1zzzzzq (Zalo thật 13/10/2026: "Cho Bác xin nội dung tin đăng của Bác" → model TỰ VIẾT một tin 6x22m, 2 lầu, sổ riêng không có
  // trong DB): xin xem lại NỘI DUNG tin / bản tin / bài rao → code gửi đúng bản tin dựng từ DB. Lưới đỡ khi AI không chạy.
  if (/\b(?:ban roi|ban duoc chua|ban chua|da ban chua|ban dc chua|chot roi|chot chua|chot duoc chua|co ai mua|ai mua chua|mua chua)\b/.test(kd) && !/\bgia\b/.test(kd)) return "ban_chua";
  if (/\bkhach\b/.test(kd) && /\b(?:hoi|quan tam|xem|coi|nao|chua|co ai|nhieu)\b/.test(kd)) return "khach";
  if (/\b(?:ai|nguoi nao)\s+(?:hoi|quan tam|xem)\b/.test(kd)) return "khach";
  // 29/09/2026 (kịch bản K9): "đăng ở đâu vậy em?" từng được đáp bằng trạng thái tin ("đang chờ thêm thông tin") — khách hỏi
  // NƠI đăng, không hỏi đăng chưa.
  if (/\b(?:dang|len|rao)\b[^?]{0,12}\b(?:o dau|cho nao|dau vay|dau em|web nao|trang nao|kenh nao|tren dau)\b/.test(kd) && !/\bgia\b/.test(kd)) return "noi_dang";
  if (/\b(?:dang|len ke|len chua|dang chua|len tin|len web|dang tin)\b/.test(kd) && !/\bgia\b/.test(kd)) return "trang_thai";
  if (/\bgia\b/.test(kd) && /\b(?:bao nhieu|nhieu|nhi|the nao|la gi|hoi nay|luc nay|khi nay|nay|dang rao|de la|ghi)\b/.test(kd)) return "gia";
  if (/\b(?:dien tich|may m2|bao nhieu m2|rong bao nhieu|rong may)\b/.test(kd)) return "dien_tich";
  if (/\b(?:dia chi|o dau|duong nao|so nha|phuong nao|quan nao)\b/.test(kd)) return "dia_chi";
  if (/\btang\s+(?:may|bao nhieu|nao)\b/.test(kd)) return "tang";
  if (/\bhuong\s+(?:gi|nao)\b|\bhuong\b.*\b(?:gi|nao|sao)\b/.test(kd)) return "huong";
  if (/\b(?:phap ly|so hong|so do)\b.*\b(?:gi|sao|nao|chua|the nao)\b/.test(kd)) return "phap_ly";
  // FR-239 c (phát lại test 27/09): "Là bao nhiêu vậy em nhớ không" (hỏi lại giá mình đã nói) → model trả lời PHÍ 1%.
  // "bao nhiêu … nhớ không" không nêu ô nào khác là hỏi lại giá.
  if (/\bbao nhieu\b/.test(kd) && /\bnho\b/.test(kd)) return "gia";
  return null;
}

export const LEGAL_VI: Record<string, string> = {
  so_hong_rieng: "sổ hồng riêng", so_hong_chung: "sổ hồng chung", so_hong: "có sổ", hdmb: "hợp đồng mua bán",
  giay_tay: "giấy tay", cho_so: "đang chờ sổ",
};
const STATUS_VI: Record<string, string> = {
  dang_ban: "đang lên kệ rồi", dang_quan_tam: "đang lên kệ, có khách quan tâm", cho_thong_tin: "đang chờ thêm thông tin, chưa lên kệ",
  da_chot: "đã chốt, em gỡ khỏi kệ rồi", an: "đang tạm gỡ khỏi kệ",
};

/**
 * Tin chưa lên kệ: còn thiếu gì. `thieu` = nhãn từ `diem_tin` (null = không đọc được → không nói); rỗng = đủ, chỉ chờ chủ duyệt
 * bản nháp (`daDuyet` false). SRS-5.1zg: "tin lên chưa" từng chỉ được đáp "đang chờ thêm thông tin" mà không nói thiếu gì.
 */
export type ConThieu = { thieu: string[] | null; daDuyet: boolean; nhapDaGui?: boolean };
function cauChuaLenKe(ct: ConThieu | null | undefined, ac: string): string | null {
  if (!ct?.thieu) return null;
  if (ct.thieu.length) return `tin mình chưa lên kệ vì còn thiếu ${ct.thieu.slice(0, 3).join(", ")}; ${ac} nhắn em mấy thông tin đó là em đăng liền`;
  if (ct.daDuyet) return null;
  // SRS-5.1zzzzzc: câu này từng nói "duyệt bản nháp em gửi" khi chưa có bản nháp nào — chỉ nói theo trạng thái thật.
  return ct.nhapDaGui === false
    ? `tin mình đủ thông tin rồi, ${ac} nhắn "đăng đi" là em đăng liền`
    : `tin mình đủ thông tin rồi, ${ac} duyệt bản nháp em gửi (nhắn "ok") là em đăng liền`;
}

/** Câu trả lời tiền định từ DB. `ac` = cách gọi khách. Không có dữ liệu thì nói thật là chưa có. */
export function dapHoiVeTin(loai: LoaiHoiTin, tin: TinTom, khach: KhachTom, ac: string, ct?: ConThieu | null): string {
  const chua = (thu: string) => `Dạ tin mình chưa có ${thu}, ${ac} cho em xin ${thu} nha.`;
  const chuaKe = tin.status === "cho_thong_tin" ? cauChuaLenKe(ct, ac) : null;
  switch (loai) {
    case "khach": {
      const n = Math.max(khach.quan_tam, 0), h = Math.max(khach.hoi, 0);
      if (!n && !h) return `Dạ hiện chưa có khách nào hỏi căn này, có khách là em báo ${ac} liền ạ.`;
      return `Dạ căn này đang có ${n || h} khách quan tâm${h ? `, ${h} câu khách hỏi em đã chuyển ${ac}` : ""}; có gì mới em báo ${ac} liền ạ.`;
    }
    case "gia": return tin.price_raw ? `Dạ giá mình đang rao là ${donViGiaDep(tin.price_raw)} ạ.` : chua("giá");
    case "dien_tich": return tin.area_m2 ? `Dạ tin ghi diện tích ${tin.area_m2}m² ạ.` : chua("diện tích");
    case "dia_chi": {
      const dc = [tin.location_raw, tin.ward, tin.district].filter(Boolean).join(", ");
      return dc ? `Dạ tin ghi địa chỉ ${dc} ạ.` : chua("địa chỉ");
    }
    case "tang": return tin.floor != null ? `Dạ tin ghi tầng ${tin.floor} ạ.` : chua("số tầng");
    case "huong": return tin.direction ? `Dạ tin ghi hướng ${tin.direction} ạ.` : chua("hướng");
    case "phap_ly": return tin.legal_status ? `Dạ tin ghi pháp lý ${LEGAL_VI[tin.legal_status] ?? tin.legal_status} ạ.` : chua("pháp lý");
    case "trang_thai": return chuaKe ? `Dạ ${chuaKe} ạ.` : `Dạ tin mình ${STATUS_VI[tin.status ?? ""] ?? "đang được em theo dõi"} ạ.`;
    // SRS-5.1zg (chủ dự án 02/10: "bao lâu bán được thì sau sẽ thống kê theo khu vực"): bot tự trả lời, KHÔNG chuyển người
    // phụ trách, KHÔNG hứa số ngày — chưa có số liệu thời gian bán theo khu vực.
    case "bao_lau_ban": return dapBaoLauBan(ac, chuaKe);
    case "noi_dang": return `Dạ tin lên kệ web AI Ơi Nhà Đất, và em giới thiệu thẳng cho khách đang tìm mua nhắn em qua Zalo ạ. Hiện ${chuaKe ?? `tin mình ${STATUS_VI[tin.status ?? ""] ?? "đang được em theo dõi"}`}.`;
    // SRS-5.1zzzzzq: xin xem nội dung tin — chat-reply dựng bản tin từ DB trước khi tới đây; dòng này chỉ là lưới khi không dựng được.
    case "noi_dung": return chuaKe ? `Dạ ${chuaKe} ạ.` : `Dạ tin mình ${STATUS_VI[tin.status ?? ""] ?? "đang được em theo dõi"}, em gửi lại nội dung ngay ạ.`;
    case "ban_chua": {
      if (tin.status === "da_chot") return `Dạ tin mình đã chốt, em gỡ khỏi kệ rồi ạ.`;
      const n = Math.max(khach.quan_tam, 0);
      return `Dạ chưa bán ạ, tin mình ${STATUS_VI[tin.status ?? ""] ?? "đang được em theo dõi"}${n ? `, đang có ${n} khách quan tâm` : ""}; có khách chốt là em báo ${ac} liền.`;
    }
  }
}

/** "Bao lâu bán được" — có tin hay chưa đều trả lời được; `chuaKe` = tin chưa lên kệ vì sao (nếu biết). */
export function dapBaoLauBan(ac: string, chuaKe?: string | null): string {
  return `Dạ bao lâu bán được thì tuỳ giá và khu vực ${ac} ạ, em không dám hứa số ngày. Giá sát thị trường, tin đủ thông tin và có hình thì khách hỏi nhanh hơn. Tin lên kệ là em giới thiệu ngay cho khách đang tìm mua, có khách quan tâm em báo ${ac} liền.${chuaKe ? `\nHiện ${chuaKe} ạ.` : ""}`;
}
