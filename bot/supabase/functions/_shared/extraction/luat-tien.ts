// LUẬT TIỀN — MỘT NGUỒN cho mọi chỗ phía TS đọc giá (tầng bốn, 11/09/2026).
//
// Chủ dự án: "gom các luật đang tồn tại hai ba bản song song về một nguồn".
//
// Trước bản này luật tiền có NĂM bản chép tay, và chúng lệch nhau đúng ở những
// chỗ đã cắn người thật:
//   · chat-reply `TIEN_KD`         biết "toi" = TỚI khi sau nó là số ("5 toi 6 ty")
//   · khop-cau-tra-loi (3 chỗ)     KHÔNG biết → "5 tới 6 tỷ" ghi giá "5 tới 6" (D1)
//   · lib/parse-query `DV`         nhánh "8ty2" chỉ nhận ty|ti → "2 tỏi 5" ra 2 tỷ (D6)
//   · hai bộ dò "câu có tiền không" quên luôn "toi"
//   · SQL `parse_vnd`              bản thứ năm, KHÔNG import được file này
// Sửa một chỗ quên bốn chỗ là hình lỗi lặp lại mười một lần trong bản review
// 10/09 ("luật đúng đã viết ra, nhưng chỉ áp một chỗ trong khi nó sống ở nhiều
// chỗ"). Nay mọi bản TS nhập từ đây; bản SQL thì không nhập được nên nó phải
// trả lời ĐÚNG CÙNG MỘT BẢNG CA (`bot/tests/luat/tien.json`) — bài
// `doi-chieu-tien.mjs` chạy cả hai bản trên bảng đó và đỏ khi chúng lệch nhau.
//
// File này không import gì: nó thuộc tầng bóc tách tiền định (luật
// `ranh-gioi.mjs`), và web (`lib/`) nhập thẳng nó qua đường `@/bot/...`.

/**
 * Đơn vị tiền trên chuỗi ĐÃ BỎ DẤU. "toi" là tỏi (tỷ) CHỈ khi sau nó KHÔNG có
 * số — "5 toi 6 ty" là "5 TỚI 6". "tr" là triệu nhưng không được nuốt "trệt"
 * (đã bỏ dấu thành "tret" — lookahead chặn mọi chữ cái đứng sau).
 */
export const TIEN_KD = "ty|ti|toi(?!\\s*\\d)|trieu|tr(?![a-z])|cu";

/**
 * Giá MỖI m² ("75 triệu/m2", "120tr một m2", "80 triệu mỗi mét"). Cả hai bản
 * luật tiền trả null cho chuỗi này: 75 triệu/m2 mà đọc thành 75 triệu thì căn
 * 50m2 lên web giá 75 triệu (lượt bắn 42 ca 11/09/2026).
 */
export const GIA_THEO_M2 =
  /(?:tỷ|tỉ|tỏi|triệu|trieu|tr|củ|cu|ty|ti)\s*(?:\/|mỗi|moi|một|mot|1)\s*(?:m2|m²|mét|met|m(?![\p{L}\p{N}]))/u;

/**
 * FR-241 (28/09/2026, bắn thật lx-72): "giá chín tỷ rưỡi" rơi giá — số viết bằng CHỮ. Đổi chữ số thành chữ số
 * CHỈ khi nó đứng ngay trước đơn vị tiền (tỷ/triệu/củ/trăm), hoặc đứng trơ cuối câu ngay sau "tỷ" ("chín tỷ hai").
 * "năm 2020", "bán năm căn" không đứng trước đơn vị nên giữ nguyên. SQL `parse_vnd` chạy CÙNG các bước này
 * (20260928f) — sửa ở đây thì sửa cả bên đó và thêm ca vào `bot/tests/luat/tien.json`.
 */
export const SO_CHU: ReadonlyArray<readonly [string, string]> = [
  ["một", "1"], ["mốt", "1"], ["mot", "1"], ["hai", "2"], ["ba", "3"], ["bốn", "4"], ["bon", "4"], ["tư", "4"],
  ["năm", "5"], ["nam", "5"], ["lăm", "5"], ["sáu", "6"], ["sau", "6"], ["bảy", "7"], ["bẩy", "7"], ["bay", "7"],
  ["tám", "8"], ["tam", "8"], ["chín", "9"], ["chin", "9"],
];
const DON_VI_CHU = "(?=\\s*(?:tỷ|tỏi|tỉ|ty|triệu|trieu|củ|trăm|tram)(?![\\p{L}]))";

// Lọc trước (20260928g): vòng đổi dưới đây tốn ~100 lượt regex; `parse_vnd` bị gọi trong hàm quét nhiều dòng nên chạy vòng cho
// MỌI câu làm DB Free quá giờ (bắn lại 28/09). Chỉ chạy khi câu có chữ số đứng sát đơn vị tiền, hoặc sau "tỷ", hoặc "<số> trăm".
const CHU_SO_RE = "(?:một|mốt|mot|hai|ba|bốn|bon|tư|năm|nam|lăm|sáu|sau|bảy|bẩy|bay|tám|tam|chín|chin|mười|muoi|mươi)";
const CO_SO_CHU = [
  new RegExp(`${CHU_SO_RE}\\s*(?:tỷ|tỏi|tỉ|ty|triệu|trieu|củ|trăm|tram)(?![\\p{L}])`, "u"),
  new RegExp(`(?:tỷ|tỏi|tỉ)\\s+${CHU_SO_RE}(?!\\s*[\\p{L}\\p{N}])`, "u"),
  /[0-9]\s*(?:trăm|tram)(?![\p{L}])/u,
];

export function soChuThanhSo(t: string): string {
  if (!CO_SO_CHU.some((re) => re.test(t))) return t;
  for (const [w, d] of SO_CHU) {
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:mười|muoi)\\s+${w}${DON_VI_CHU}`, "gu"), `1${d}`);
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${w}\\s+(?:mươi|muoi)(?![\\p{L}])`, "gu"), `${d}0`);
  }
  for (const [w, d] of SO_CHU) {
    t = t.replace(new RegExp(`(?<![0-9])([1-9])0\\s+${w}${DON_VI_CHU}`, "gu"), `$1${d}`);
  }
  t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:mười|muoi)${DON_VI_CHU}`, "gu"), "10");
  for (const [w, d] of SO_CHU) {
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${w}${DON_VI_CHU}`, "gu"), d);
  }
  t = t.replace(/([0-9])\s*(?:trăm|tram)(?![\p{L}])/gu, (_m, d: string) => `${d}00`);
  for (const [w, d] of SO_CHU) {
    t = t.replace(new RegExp(`(tỷ|tỏi|tỉ)\\s+${w}(?!\\s*[\\p{L}\\p{N}])`, "gu"), `$1 ${d}`);
  }
  return t;
}

/**
 * Đọc MỘT con số tiền từ một câu — cùng luật với SQL `parse_vnd` (phiên dịch
 * từng dòng, xem `bot/supabase/schema.sql`). Tồn tại để bài đối chiếu có một
 * bản TS mà so với bản SQL trên cùng bảng ca; nơi nào ở TS cần MỘT con số giá
 * thì dùng hàm này thay vì viết regex riêng.
 *
 * Một chỗ phải dịch cẩn thận: `\M` của Postgres là "hết từ", mà chữ có dấu là
 * CHỮ — nên "1 trệt" không thành "1 triệu". JS `\b` coi "ệ" là ranh giới, nên
 * phải dùng lớp `\p{L}` thay vào, không thì hai bản lệch nhau đúng ở câu có dấu.
 */
export function docTien(p: string | null | undefined): number | null {
  if (!p || !p.trim()) return null;
  let t = p.toLowerCase();
  // Giá MỖI m² không phải giá cả căn (xem `GIA_THEO_M2`).
  if (GIA_THEO_M2.test(t)) return null;
  t = soChuThanhSo(t);
  const ruoi = /rưỡi|rươi|ruoi/.test(t);
  t = t.replace(/tỏi|tỷ|tỉ|tị|tỹ/g, " _ty ");
  t = t.replace(/triệu|trieu|củ/g, " _trieu ");
  // 22/09/2026 (kịch bản C, bắn thật): "7 ti 5" — "ti" không dấu là tỷ, y như "ty". Cả TS lẫn SQL
  // `parse_vnd` cùng thiếu nên cổng đối chiếu không đỏ; ca "7 ti 5" / "7ti5" nay nằm trong `tien.json`.
  t = t.replace(/([0-9])\s*t[yi]\s*([0-9])/g, "$1 _ty $2");
  // "3tr5" = 3,5 triệu (lượt bắn 42 ca 11/09: phòng trọ "3tr5 một tháng" rơi giá).
  t = t.replace(/([0-9])\s*tr\s*([0-9])/g, "$1 _trieu $2");
  // 13/09/2026 (review code): "1t2l" / "1t 2l" là 1 trệt 2 lầu — hàm này từng
  // đọc ra 1,2 tỷ. Số sau "t" mà dính chữ,
  // hoặc "t" trơ trọi mà sau là "<số> l/lầu" thì không phải tiền. SQL `parse_vnd`
  // cùng luật (20260913b), ca ở `bot/tests/luat/tien.json`.
  t = t.replace(/([0-9])\s*t\s*([0-9]{1,3})(?![\p{L}\p{N}])/gu, "$1 _ty $2");
  t = t.replace(/([0-9])\s*t[yi](?![\p{L}\p{N}_])/gu, "$1 _ty ");
  t = t.replace(/([0-9])\s*tr(?![\p{L}\p{N}_])/gu, "$1 _trieu ");
  t = t.replace(/([0-9])\s*t(?![\p{L}\p{N}_])(?!\s*[0-9]+\s*(?:l|lầu|lau)(?![\p{L}]))/gu, "$1 _ty ");

  // Phần lẻ sau đơn vị: "5 tỷ 5" = 5,5 tỷ · "3 tỷ 200" = 3,2 tỷ. Không nuốt
  // "5 tỷ 50m2" (diện tích) — cấm chữ số lẫn "m" đứng ngay sau.
  let m = /([0-9]+)\s*_ty\s*([0-9]{1,3})(?![0-9.,]|\s*m)/.exec(t);
  if (m) {
    return Number(m[1]) * 1e9 + (m[2].length === 1 ? Number(m[2]) * 1e8 : Number(m[2]) * 1e6);
  }
  m = /([0-9]+[.,]?[0-9]*)\s*_ty/.exec(t);
  if (m) {
    let v = parseFloat(m[1].replace(",", ".")) * 1e9;
    if (ruoi) v += 5e8;
    return Math.round(v);
  }
  // Phần lẻ sau triệu: "3 triệu 5" = 3,5 triệu · "3 triệu 500" = 3,5 triệu. Số
  // đứng sau mà là số LƯỢNG ("cọc 3 triệu 2 tháng", "15 triệu 2 phòng ngủ", "80
  // triệu 100m2") thì không phải phần lẻ.
  m = /([0-9]+)\s*_trieu\s*([0-9]{1,3})(?![0-9.,]|\s*(?:m2|m²|mét|met|m(?![\p{L}])|phòng|phong|pn|lầu|lau|tầng|tang|tấm|tam|wc|tháng|thang|năm|nam|người|nguoi|căn|can))/u.exec(t);
  if (m) {
    return Number(m[1]) * 1e6 + (m[2].length === 1 ? Number(m[2]) * 1e5 : Number(m[2]) * 1e3);
  }
  m = /([0-9]+[.,]?[0-9]*)\s*_trieu/.exec(t);
  if (m) {
    let v = parseFloat(m[1].replace(",", ".")) * 1e6;
    if (ruoi) v += 5e5;
    return Math.round(v);
  }
  // 27/09/2026 (chủ dự án test Zalo): "Giá 8.000.000.000" — số ĐỒNG viết đủ, có dấu nhóm nghìn hoặc ≥ 7 chữ số liền. Không
  // mở bằng 0 (SĐT), không phải số đo ("1.000.000m2"), từ 1 triệu tới 10 nghìn tỷ. SQL `parse_vnd` cùng luật (20260927b).
  m = /(?<![0-9.,])([1-9][0-9]{0,2}(?:[.,][0-9]{3}){2,}|[1-9][0-9]{6,12})(?![0-9.,]*[0-9])(?!\s*(?:m2|m²|mét|met|m(?![\p{L}])))/u.exec(t);
  if (m) {
    const v = Number(m[1].replace(/[.,]/g, ""));
    if (v >= 1e6 && v <= 1e13) return v;
  }
  return null;
}
