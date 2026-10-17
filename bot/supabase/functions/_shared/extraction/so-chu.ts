// so-chu.ts — số ĐỌC BẰNG CHỮ → chữ số, cho câu gõ bằng giọng nói (11/09/2026).
//
// Zalo có nút nói-thành-chữ. Lượt bắn 42 ca 11/09 có câu "bán nhà quận năm
// phường hai diện tích năm mươi mét vuông giá bốn tỷ rưỡi" → không bóc được một
// thứ gì, vì mọi luật bóc tách (TS lẫn SQL) chờ CHỮ SỐ. Đổi ở đây, trước khi bóc.
//
// Chỉ đổi khi cụm số đứng cạnh một ĐƠN VỊ ("tỷ", "mét vuông", "lầu", "phòng"…)
// hoặc sau một NHÃN ("quận", "phường", "giá", "ngang"…). "năm ngoái", "hướng
// nam", "ba mẹ", "tư vấn" giữ nguyên. Chạy trên chữ CÒN DẤU: bỏ dấu thì "năm"
// (5) trùng "nam" (hướng), "tám" (8) trùng "tấm" (sàn).
//
// Hai số đứng liền nhau không có "mươi/trăm" ("hai ba tỷ") là KHOẢNG, không phải
// một số — để nguyên, đừng đoán.

const DON: Record<string, number> = {
  "không": 0, "một": 1, "mốt": 1, "hai": 2, "ba": 3, "bốn": 4, "tư": 4,
  "năm": 5, "lăm": 5, "nhăm": 5, "sáu": 6, "bảy": 7, "bẩy": 7, "tám": 8, "chín": 9,
};
const TU = "(?:không|một|mốt|hai|ba|bốn|tư|năm|lăm|nhăm|sáu|bảy|bẩy|tám|chín|mười|mươi|trăm|linh|lẻ)";
const CUM = `${TU}(?:\\s+${TU})*`;
// Biên từ cho chữ có dấu: \b của JS coi "ă", "ơ"… là ranh giới.
const TRUOC = "(?<![\\p{L}\\p{N}])";
const SAU = "(?![\\p{L}\\p{N}])";
const DON_VI = "(?:tỷ|tỉ|tỏi|triệu|củ|mét vuông|mét|m2|lầu|tầng|tấm|phòng|pn|wc|căn|tháng)";
const NHAN = "(?:quận|phường|giá|ngang|dài|rộng|hẻm|tầng|lầu|số|cọc)";
const TIEN = "(?:tỷ|tỉ|tỏi|triệu|củ)";

/** "năm mươi" → 50, "một trăm linh năm" → 105; null nếu là khoảng hay không phải số. */
export function docCumSo(cum: string): number | null {
  const tu = cum.toLowerCase().trim().split(/\s+/);
  let tong = 0;
  let le: number | null = null;
  let coSo = false;
  for (const w of tu) {
    if (w in DON) {
      if (le !== null) return null; // "hai ba" = khoảng 2–3, không đoán
      le = DON[w];
      coSo = true;
    } else if (w === "trăm") {
      tong += (le ?? 1) * 100; le = null; coSo = true;
    } else if (w === "mươi") {
      if (le === null) return null;
      tong += le * 10; le = null;
    } else if (w === "mười") {
      tong += 10; le = null; coSo = true;
    } else if (w === "linh" || w === "lẻ") {
      continue;
    } else return null;
  }
  if (!coSo) return null;
  return tong + (le ?? 0);
}

const doi = (cum: string): string => {
  const n = docCumSo(cum);
  return n === null ? cum : String(n);
};

/** Đổi các cụm số đọc bằng chữ đứng cạnh đơn vị/nhãn sang chữ số. Câu không có gì để đổi → trả nguyên. */
export function soChuThanhSo(text: string): string {
  if (!text || !new RegExp(`${TRUOC}${TU}${SAU}`, "iu").test(text)) return text;
  let t = text;
  // Nhãn đứng trước: "quận năm", "phường hai", "giá bốn".
  t = t.replace(new RegExp(`${TRUOC}(${NHAN})\\s+(${CUM})${SAU}`, "giu"), (all, nhan, cum) => {
    const n = docCumSo(cum);
    return n === null ? all : `${nhan} ${n}`;
  });
  // Đơn vị đứng sau: "năm mươi mét vuông", "bốn tỷ", "ba lầu".
  t = t.replace(new RegExp(`${TRUOC}(${CUM})\\s+(${DON_VI})${SAU}`, "giu"), (all, cum, dv) => {
    const n = docCumSo(cum);
    return n === null ? all : `${n} ${dv}`;
  });
  // Phần lẻ sau đơn vị tiền: "4 tỷ hai" → "4 tỷ 2".
  t = t.replace(new RegExp(`(\\d\\s*${TIEN})\\s+(${CUM})${SAU}`, "giu"), (_all, dau, cum) => `${dau} ${doi(cum)}`);
  // "50 mét vuông" → "50m2" để mọi luật diện tích nhận ra.
  t = t.replace(/(\d)\s*mét vuông/giu, "$1m2");
  return t;
}
