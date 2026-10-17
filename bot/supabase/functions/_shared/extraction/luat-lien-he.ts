// LUẬT CHE LIÊN HỆ — MỘT NGUỒN cho web và bot (tầng bốn, 11/09/2026).
//
// Trước bản này có HAI bản chép tay: `lib/format.ts sanitizeDescription` (web,
// FR-104) và `chat-reply locLienHe` (bot, FR-105). Chú thích bên bot còn ghi
// thẳng "Deno không import được module Next; sửa regex một bên thì sửa bên
// kia" — tức lời hứa đồng bộ bằng trí nhớ. Chiều ngược lại thì được: web nhập
// thẳng file này qua `@/bot/...` (đúng như `/admin/prompt` nhập `prompts.ts`).
//
// Giữ NGUỒN regex dạng chuỗi, dựng RegExp mới mỗi lần gọi: một RegExp `/g` dùng
// chung giữa nhiều lời gọi `.test()` giữ `lastIndex` từ lần trước — lần gọi thứ
// hai trên cùng một câu có SĐT trả `false`. Lỗi đó không kêu, chỉ thỉnh thoảng
// để lọt một số điện thoại.

/**
 * SĐT Việt Nam: +84 / 84 / 0 đầu, thêm 8–10 chữ số, chấp nhận dấu cách · chấm ·
 * gạch giữa.
 *
 * 13/09/2026 (review code): bản cũ không có RANH GIỚI — đầu "0" bám vào chữ số 0
 * nằm giữa một con số rồi đi xuyên dấu chấm phân cách, nên "giá 10.000.000.000"
 * thành "giá 1[liên hệ qua Zalo…]" trên web. Nay:
 *   · trước đầu số không được là chữ số / dấu chấm / phẩy (không bắt giữa số);
 *   · sau số cuối không được là chữ số (13 chữ số liền không phải SĐT);
 *   · cả cụm mà viết kiểu TIỀN — nhóm 1–3 số rồi ≥ 2 nhóm ".000" ("84.000.000.000")
 *     — thì không phải SĐT. "0903.123.456" nhóm đầu 4 số nên vẫn là SĐT.
 */
export const SDT_NGUON =
  "(?<![\\d.,])(?!\\d{1,3}(?:\\.\\d{3}){2,}(?![\\d]))(?:\\+?84|0)(?:[\\s.\\-]?\\d){8,10}(?![\\d])";
/**
 * Kênh liên hệ ngoài: Zalo, Facebook, Viber, Telegram kèm ID đi sau.
 *
 * 13/09/2026 (review code): bản cũ nuốt `[\w.@/]*` sau chữ "zalo" bất kể là gì —
 * `\w` của JS chỉ có ASCII nên nó ăn phần đầu KHÔNG DẤU của từ tiếng Việt kế tiếp:
 * "Chat Zalo trao đổi thêm" → "Chat [L] đổi thêm", "Liên hệ Zalo nhé" → "[L]é".
 * Nay chỉ nuốt phần đuôi khi nó là ID thật: đứng sau dấu hai chấm ("zalo: abc"),
 * hoặc có chữ số / @ / / / _ ("zalo 0903…", "fb nha.dat.q5", "facebook.com/x");
 * và không bao giờ cắt ngang một từ (không có chữ cái nào dính ngay sau).
 */
export const MANG_XA_HOI_NGUON =
  "\\b(?:zalo|z@lo|fb|facebook|viber|telegram)\\b" +
  "(?:\\s*:\\s*[\\w.@/]+(?![A-Za-zÀ-ỹ])|\\s*(?=[\\w.@/]*[\\d@/_])[\\w.@/]+(?![A-Za-zÀ-ỹ]))?";

/**
 * Thay mọi SĐT và kênh liên hệ trong `s` bằng `nhan`. Không giữ trạng thái giữa
 * các lần gọi.
 *
 * MỘT lượt `replace` với hai nhánh, KHÔNG phải hai lượt nối nhau. Bản hai lượt
 * (SĐT trước, mạng xã hội sau — đúng thứ tự của cả web lẫn bot suốt từ 02/09)
 * làm LỒNG NHÃN: nhãn "[liên hệ qua Zalo AI Ơi Nhà Đất]" vừa chèn ở lượt một có
 * chữ "Zalo", lượt hai khớp đúng chữ đó và chèn thêm một nhãn nữa vào giữa —
 * mô tả trên web hiện "[liên hệ qua [liên hệ qua Zalo AI Ơi Nhà Đất] Ơi Nhà
 * Đất]". Bắt 11/09 lúc gom hai bản về một nguồn. Một lượt `replace` không bao
 * giờ quét lại chữ nó vừa chèn, nên nhãn có chứa gì cũng không lồng được.
 */
export function thayLienHe(s: string, nhan: string): string {
  return s.replace(new RegExp(`(?:${SDT_NGUON})|(?:${MANG_XA_HOI_NGUON})`, "gi"), nhan);
}

/**
 * Kênh liên hệ CÓ ID đi kèm — bản chặt của `MANG_XA_HOI_NGUON`: chữ "zalo"/"fb" trần KHÔNG
 * khớp, phải có ":" + ID hoặc đuôi mang chữ số / @ / /.
 *
 * 22/09/2026 (bộ đo giọng M03): bong bóng của CHÍNH BOT "anh chị phụ trách sẽ liên hệ qua
 * Zalo" đi qua `thayLienHe` thành "liên hệ qua [liên hệ qua Zalo]". Chữ bot nói không phải
 * chữ khách gửi: bot không có số ai để lộ, chỉ cần che khi model lỡ chép một ID/SĐT từ kho.
 */
export const MANG_XA_HOI_CO_ID_NGUON =
  "\\b(?:zalo|z@lo|fb|facebook|viber|telegram)\\b" +
  "(?:\\s*:\\s*[\\w.@/]+(?![A-Za-zÀ-ỹ])|\\s*(?=[\\w.@/]*[\\d@/_])[\\w.@/]+(?![A-Za-zÀ-ỹ]))";

/** Như `thayLienHe` nhưng chỉ che kênh mạng xã hội khi CÓ ID — dùng cho câu bot tự nói. */
export function thayLienHeCoId(s: string, nhan: string): string {
  return s.replace(new RegExp(`(?:${SDT_NGUON})|(?:${MANG_XA_HOI_CO_ID_NGUON})`, "gi"), nhan);
}

/**
 * 30/09/2026 (bắn thật lx-ban-b): môi giới rao "… giá 9.2 tỷ TL, hh 1%" — câu rao gốc thành `description`, web in nguyên
 * "hh 1%" lên trang tin công khai và bot đưa nó vào "chủ tả" cho khách mua. Hoa hồng là chuyện giữa bên bán và môi giới,
 * khách mua không trả phí (DH-01) — không in ra. Bỏ cả dấu phẩy đứng trước để câu không còn ", ," lửng.
 */
export function boHoaHong(s: string): string {
  return s.replace(/[\s,;.]*(?<![\p{L}\d])(?:hh|hoa hồng|hoa hong|huê hồng|hue hong|phí môi giới|phi moi gioi|hh mg)\s*:?\s*\d+(?:[.,]\d+)?\s*%(?:\s*(?:cho\s+)?(?:sale|mg|môi giới|moi gioi|bên mua|ben mua))?/giu, "")
    .replace(/^[\s,;.]+/, "");
}

/** Câu có chứa SĐT không — dựng RegExp mới nên gọi bao nhiêu lần cũng đúng. */
export function coSdt(s: string): boolean {
  return new RegExp(SDT_NGUON).test(s);
}
