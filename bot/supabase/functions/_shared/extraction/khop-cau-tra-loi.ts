// khop-cau-tra-loi.ts — câu chủ nhà vừa nhắn CÓ PHẢI câu trả lời cho câu hỏi
// đang treo không? (FR-176)
//
// VÌ SAO. Lượt rao 07/09/2026 (tin #BDS-Q5-0174): bot hỏi pháp lý, chủ nhà
// nhắn "Kêu chị nha" → ghi thành ĐÁP ÁN pháp lý; hỏi hướng, chủ nhắn "16m nha"
// → cột `direction` thành chữ "16m nha"; hỏi diện tích đất, chủ nhắn "Ngang 5"
// → câu hỏi diện tích ĐÓNG mà `area_m2` vẫn trống. Ba câu hỏi đóng bằng ba câu
// không phải câu trả lời, và bot không bao giờ hỏi lại — tin lên kệ với pháp
// lý rỗng, hướng là rác. Trước bản này khối drip lấy NGUYÊN câu chat làm đáp
// án, không kiểm gì; chỉ `loai_bds` có đường "không đọc ra thì hỏi lại".
//
// Đây là tầng bóc tách TIỀN ĐỊNH (bot/tests/ranh-gioi.mjs): không model, không
// RPC, chạy và kiểm được mà không tốn một đồng. Nó chỉ trả lời "khớp / không
// khớp / thuộc loại gì", còn NÓI GÌ với chủ nhà là việc của tầng trên.
//
// Luật chung: thà HỎI LẠI một câu thừa còn hơn ĐÓNG một câu hỏi bằng rác —
// câu hỏi đóng sai không bao giờ tự lộ, câu hỏi thừa thì chủ nhà thấy ngay.

// Luật tiền MỘT NGUỒN (tầng bốn, 11/09): trước đây file này chép tay
// `(ty|ti|toi|trieu|tr)` ở năm chỗ, không chỗ nào biết "toi" + số là TỚI —
// nên "5 tới 6 tỷ" ghi giá "5 tới 6" (mục D1 review 10/09).
import { TIEN_KD, TIEN_CD, CO_TIEN_KD, TIEN_T_KEP, docTien } from "./luat-tien.ts";
import { TRUOC_LA_SAN, TRUOC_LA_THUE } from "./boc-cau-rao.ts";
import { laThuanNhan } from "./nhan.ts";
import { goNhamDau } from "./go-nham-dau.ts";

// 30/09/2026 (bắn thử vector, nhà phố Trần Bình Trọng): "nhà có 1 phòng ngủ ngay tầng trệt cho người già" → ô số phòng ngủ
// = 1, còn chi tiết "phòng ngủ ở tầng trệt" (thứ người mua có ba mẹ lớn tuổi đi tìm) mất khỏi vector. Số phòng ngủ đi kèm
// VỊ TRÍ TẦNG là phòng ngủ Ở ĐÂU, không phải TỔNG số phòng ngủ.
// "2pn tầng 12" (căn hộ ở tầng 12) KHÔNG tính: không có chữ chỉ chỗ thì chỉ "trệt" mới là tầng của phòng ngủ.
const PN_SAU_SO = String.raw`\s*(?:phong ngu|pn)\s+(?:(?:(?:o|ngay|nam|duoi|tren|tai)\s+){1,2}(?:tang\s+tret|(?:tang|lau)\s+\d{1,2}|tang|tret|lau)|(?:tang\s+)?tret)\b`;
const PN_O_TANG_RE = new RegExp(String.raw`\b(\d{1,2}|mot|hai|ba|bon|nam)` + PN_SAU_SO);
const SO_CHU_PN: Record<string, number> = { mot: 1, hai: 2, ba: 3, bon: 4, nam: 5 };
const veCau = (tin: string): string[] => (tin ?? "").split(/[,;\n]|\.(?!\d)/).map((c) => c.trim()).filter(Boolean);
/** Các con số phòng ngủ trong tin mà là phòng ngủ THEO TẦNG ("1 phòng ngủ ngay tầng trệt", "2pn trên lầu"). */
export function soPhongNguTheoTang(tin: string): number[] {
  return veCau(tin).flatMap((c) => {
    const m = PN_O_TANG_RE.exec(boDau(c).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " "));
    return m ? [SO_CHU_PN[m[1]] ?? Number(m[1])] : [];
  });
}
/** Vế câu gốc nói phòng ngủ theo tầng — giữ làm thông tin bổ sung (vào vector). */
export function cumPhongNguTheoTang(tin: string): string | null {
  return veCau(tin).find((c) => PN_O_TANG_RE.test(boDau(c).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " "))) ?? null;
}

export type LoaiCau =
  | "khop"      // đúng là câu trả lời cho câu đang hỏi → ghi fact, đóng câu hỏi
  | "xung_ho"   // dặn cách gọi ("kêu chị nha") → nhớ, KHÔNG ghi fact, hỏi lại
  | "ack"       // tiểu từ / ừ / ok / để coi → không ghi, hỏi lại nhẹ
  | "hoi"       // chủ nhà HỎI ngược ("phí sao em?") → trả lời rồi hỏi lại
  | "hoan"      // bận / để hỏi vợ / hỏi hoài → KHÔNG ghi, KHÔNG hỏi thêm, câu vẫn treo
  | "lech";     // có nội dung nhưng không khớp câu hỏi → không ghi, hỏi rõ

/**
 * Cách gọi khách (FR-176). 16/09/2026 (Zalo thật): khách nhắn "Chào cháu chú có căn
 * nhà này cần giao bán" mà bot đáp "Dạ em…" — xưng "chú" là NAM LỚN TUỔI, bot phải
 * gọi "chú" và tự xưng "cháu". Ba từ mới: chú / cô / bác (bác không rõ nam hay nữ).
 * 23/09/2026 (Zalo thật): "chào cháu, ông bán nhà Trần Bình Trọng Q5 7 tỷ" mà bot đáp "Dạ cháu chào mình ạ!"
 * — thêm ông / bà (người già hơn chú cô), cùng họ hàng hay gặp: dì, cậu, mợ, thím, dượng. Tất cả xưng cháu.
 */
export type XungHo = "anh" | "chị" | "chú" | "cô" | "bác" | "ông" | "bà" | "dì" | "cậu" | "mợ" | "thím" | "dượng";
export const XUNG_HO_LON_TUOI: ReadonlySet<string> = new Set(["chú", "cô", "bác", "ông", "bà", "dì", "cậu", "mợ", "thím", "dượng"]);
export const XUNG_HO_HOP_LE: ReadonlySet<string> = new Set(["anh", "chị", ...XUNG_HO_LON_TUOI]);
/** Bot tự xưng gì khi gọi khách là `xh`: em ↔ anh/chị, cháu ↔ chú/cô/bác/ông/bà/dì/cậu/mợ/thím/dượng. */
export const tuXungBot = (xh: string | null | undefined): "em" | "cháu" =>
  xh && XUNG_HO_LON_TUOI.has(xh) ? "cháu" : "em";
/** Giới tính + nhóm tuổi suy từ cách gọi (ghi `sellers.gioi_tinh`, `sellers.nhom_tuoi`). */
// 05/10/2026 (SRS-5.1zza, chủ dự án: "bỏ 'mình' luôn đi, chưa biết thì gọi anh chị"): MỘT chỗ quyết cách gọi khách khi hồ sơ
// chưa có — trước đây ~20 chỗ tự điền "mình" (vừa là tôi vừa là bạn, đọc như bot tự xưng: "cảm ơn mình", "không mình?").
// Chưa biết → "anh chị"; biết là người lớn tuổi mà chưa rõ cô hay chú → "cô chú". Cụm sở hữu "nhà mình" trong câu mẫu giữ.
export function cachGoiKhach(xungHo: string | null | undefined, nhomTuoi?: unknown): string {
  return xungHo ?? (nhomTuoi === "lon_tuoi" ? "cô chú" : "anh chị");
}

export function suyTuXungHo(xh: XungHo): { gioi_tinh: "nam" | "nu" | null; nhom_tuoi: "tre" | "lon_tuoi" } {
  const nam = ["anh", "chú", "ông", "cậu", "dượng"].includes(xh);
  const nu = ["chị", "cô", "bà", "dì", "mợ", "thím"].includes(xh);
  return { gioi_tinh: nam ? "nam" : nu ? "nu" : null, nhom_tuoi: XUNG_HO_LON_TUOI.has(xh) ? "lon_tuoi" : "tre" };
}

export type KetQuaKhop = {
  loai: LoaiCau;
  /** Cách xưng hô chủ nhà dặn, chỉ có khi loai = "xung_ho". */
  xungHo?: XungHo;
  /**
   * Câu không khớp câu đang hỏi nhưng khớp RÕ một fact khác → ghi vào đó
   * (FR-177 e: hỏi một đường, trả lời một nẻo thì VẪN ghi). Không nhận ra
   * fact nào thì tầng trên ghi nguyên văn vào fact `bo_sung`.
   */
  chuyenSang?: { question: string; answer: string };
  /**
   * 15/09/2026 (Zalo thật): câu vừa TRẢ LỜI vừa HỎI NGƯỢC ("Nhà 5 tầng, có thang máy
   * thì phải, bạn có biết xung quanh khu này có tiện ích gì không") → phần hỏi tách ra
   * đây để tầng trên trả lời TRƯỚC câu kế; phần trả lời ở `dapAn` (ghi fact bằng nó,
   * không ghi cả câu).
   */
  hoiNguoc?: string;
  dapAn?: string;
};

const boDau = (s: string): string =>
  goNhamDau(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/²/g, "2"); // 05/10/2026 (SRS-5.1zy): "245m²" — "²" không phải chữ nên `\b` sau nó không khớp

// ── Xưng hô ───────────────────────────────────────────────────────────────────
// "kêu chị nha", "gọi anh đi", "chị chứ không phải anh", "em là chị", "xưng chị
// nha em", "đừng gọi anh". Bắt CẢ câu chỉ có ý này; câu dài có kèm dữ liệu
// ("chị nha, sổ hồng riêng") thì phần dữ liệu vẫn được xét ở dưới.
const XUNG_HO_RE =
  /\b(?:keu|goi|xung|dung (?:keu|goi))\s*(?:la\s*|toi la\s*|minh la\s*)?(anh|chi|co|chu|bac)\b|\b(?:toi|minh|tui|em)\s*la\s*(anh|chi)\b(?!\s*(?:chu|chinh|cua))|\b(anh|chi)\s*(?:chu|ma|nha|nhe)\s*(?:khong phai|ko phai|k phai)\s*(?:anh|chi)\b|^\s*(chi|anh)\s*(?:nha|nhe|nhen|day|a)?\s*[.!]?\s*$|^\s*(chi|anh)\s*(?:nha|nhe|nhen|oi)\s*[,.;!]/;

const DOI_XUNG_HO: Record<string, XungHo> = { anh: "anh", chi: "chị", co: "cô", chu: "chú", bac: "bác" };
const XUNG_HO_LON_TRO = /^\s*(?:dạ\s*)?(chú|cô|bác|ông|bà|dì|cậu|mợ|thím|dượng)\s*(?:nha|nhé|nhen|đây|ạ|nè)?\s*[.!]?\s*$/u;
// ông/bà/dì/cậu/mợ/thím/dượng chỉ bắt trên chữ CÒN DẤU: bỏ dấu thì "ba" là số ba / ba = cha, "ong" là "ống",
// "di" là "đi", "cau" là "câu"; "gọi ông chủ", "kêu bà ngoại" là người thứ ba.
const GOI_ONG_BA_RE =
  /(?<![\p{L}])(?:kêu|gọi|xưng)\s+(?:là\s+)?(ông|bà|dì|cậu|mợ|thím|dượng)(?![\p{L}])(?!\s+(?:chủ|ấy|ta|kia|đó|này|bà|ông|ngoại|nội|thợ|cò|môi giới|xe|bảo vệ|hàng xóm))/u;
export function batXungHo(text: string): XungHo | null {
  // 22/09/2026: "cô" / "chú nha" trơ trọi (CÒN DẤU — bỏ dấu thì "cô" trùng "có") là câu trả lời cho
  // "cháu gọi chú hay cô cho tiện ạ?".
  const mLon = XUNG_HO_LON_TRO.exec(text.trim().toLowerCase());
  if (mLon) return mLon[1] as XungHo;
  const mOngBa = GOI_ONG_BA_RE.exec(text.toLowerCase());
  if (mOngBa) return mOngBa[1] as XungHo;
  const kd = boDau(text);
  const m = XUNG_HO_RE.exec(kd);
  if (!m) return null;
  const tu = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
  // 16/09/2026: "kêu cô/chú/bác" từng bị ép về anh/chị (cột chỉ có hai giá trị).
  return DOI_XUNG_HO[tu] ?? "anh";
}

// ── Khách TỰ XƯNG (11/09/2026, lượt bắn 42 ca) ───────────────────────────────
// 34/52 câu bot viết "anh/chị" dù khách đã tự xưng: "anh bận", "để anh hỏi vợ",
// "e oi a can ban nha", "chị Lan đây em". Người thật nghe một lần là gọi đúng.
// Lời DẶN tường minh ("kêu chị nha", `batXungHo`) vẫn thắng; hàm này chỉ dùng
// khi chưa biết gọi sao.
const TU_XUNG: RegExp[] = [
  /^\s*(?:e|em)\s*(?:oi)?\s*[,.]?\s*(a|anh|c|chi)\s+(?:can|muon|co|dang|ban|hoi|nho|gui)\b/,
  /^\s*(anh|chi)\s+[a-z]+\s+(?:day|nay)\b/,
  // 05/10/2026 (SRS-5.1zx, hội thoại test 02/10): "Anh nói đó được giá thì thôi" — nhắc lại lời mình cũng là tự xưng.
  /^\s*(anh|chi|a|c)\s+(?:can|muon|co|dang|khong|ko|chua|hoi|tinh|de|o|moi|vua|gui|ban|nho|thay|nghi|cung|noi|bao|ke|nhan|dinh|chot)\b/,
  /\b(?:nha|can|so|dat|lo|sdt|so dien thoai|so dt|vo|chong)\s+(?:cua\s+)?(anh|chi)\b(?!\s+(?:ay|nay|kia|hang xom))/,
  // 05/10/2026 (SRS-5.1zx): "Nhà a 4 tầng tính cả lửng", "nhà c 50m2" — chữ tắt a/c sau danh từ căn nhà, trước con số.
  /\b(?:nha|can|dat|lo)\s+(a|c)\s+(?=\d)/,
  /\bde\s+(anh|chi)\s+(?:hoi|tinh|coi|xem|nghi|ban|suy nghi)\b/,
  /\b(anh|chi)\s+(?:ban|dang ban|met|khong ranh|chua ranh|dang lai xe|dang hop)\b/,
  // 22/09/2026 (bắn thật): "hồi nãy anh nói giá bao nhiêu nhỉ" — tự xưng khi nhắc lại lời mình.
  /\b(?:hoi nay|luc nay|khi nay|ban nay|nay)\s+(anh|chi)\s+(?:noi|bao|ke|nhan|gui|co noi)\b/,
  // 13/09/2026 (bàn giao 11/09 lỗi a): tự xưng GIỮA câu, sau lời chào hay dấu
  // phẩy — "chào em, anh cần bán nhà", "dạ em, chị gửi ảnh nha". Các mẫu trên
  // neo đầu câu nên trượt. Chỉ nhận chữ đủ "anh/chi" ở đây — "a"/"c" giữa câu
  // quá dễ là tiểu từ "à".
  /(?:[,.;!?]|\b(?:chao|da|vang|alo|ok|oke|ua|thi)\s+em(?:\s+oi)?)\s*(anh|chi)\s+(?:can|muon|co|dang|tinh|dinh|hoi|gui|ban|nho|o|moi|vua|de|thay|nghi)\b/,
];
// 16/09/2026 (Zalo thật): "Chào cháu chú có căn nhà này cần giao bán" — khách tự xưng
// CHÚ / CÔ / BÁC. Chỉ bắt trên chữ CÒN DẤU: bỏ dấu thì "cô" trùng "có", "chú" trùng
// "chủ" ("chủ cần bán" là môi giới nói về chủ nhà), "bác" trùng "bạc". "cô giáo",
// "bác sĩ", "chú ấy / cô này" là người thứ ba, không phải người đang nhắn.
const TU_XUNG_LON: RegExp[] = [
  // 22/09/2026 (chủ dự án: "người ta chào là cô chào cháu nó vẫn đáp anh chị"): lời CHÀO cũng là tự xưng —
  // "cô chào cháu", "chú chào cháu nha", "chào cháu, cô đây". Bản trước chỉ bắt chú/cô/bác + động từ có/cần/bán.
  /(?<![\p{L}])(chú|cô|bác|ông|bà|dì|cậu|mợ|thím|dượng)\s+chào\s+(?:cháu|con|em)(?![\p{L}])/u,
  /(?<![\p{L}])chào\s+(?:cháu|con)\s*[,.!]?\s*(chú|cô|bác|ông|bà|dì|cậu|mợ|thím|dượng)(?:\s+(?:đây|nè|nha|ạ|ơi))?\s*[,.!]?\s*$/u,
  // `\b` chỉ biết chữ ASCII ("có" + khoảng trắng không phải ranh từ) → dùng (?<![\p{L}]) / (?![\p{L}\d]).
  /(?:^|[,.;!?]\s*|(?<![\p{L}])chào\s+(?:cháu|con|em)\s*,?\s*|(?<![\p{L}])(?:dạ|vâng|alo|ok|ừ|thì)\s+(?:cháu|em)(?:\s+ơi)?\s*,?\s*)(chú|cô|bác|ông|bà|dì|cậu|mợ|thím|dượng)\s+(?:có|cần|muốn|đang|bán|hỏi|nhờ|gửi|tính|định|ở|mới|vừa|để|thấy|nghĩ|đây|không|chưa|rao)(?![\p{L}\d])/u,
  // Mẫu sở hữu KHÔNG nhận ông/bà/họ hàng: "nhà ông bà để lại", "nhà bà ngoại", "nhà dì tôi" là người thứ ba.
  /(?<![\p{L}])(?:nhà|căn|sổ|đất|lô|sđt|số điện thoại|số đt|vợ|chồng)\s+(?:của\s+)?(chú|cô|bác)(?![\p{L}\d])(?!\s+(?:ấy|này|kia|đó|hàng xóm|giáo|sĩ))/u,
  /(?<![\p{L}])để\s+(chú|cô|bác|ông|bà|dì|cậu|mợ|thím|dượng)\s+(?:hỏi|tính|coi|xem|nghĩ|bàn|suy nghĩ)(?![\p{L}\d])/u,
  /(?<![\p{L}])(chú|cô|bác|ông|bà|dì|cậu|mợ|thím|dượng)\s+(?:bận|đang bận|mệt|không rảnh|chưa rảnh)(?![\p{L}\d])/u,
];
export function tuXungTuCau(text: string): XungHo | null {
  const cd = text.trim().toLowerCase();
  for (const re of TU_XUNG_LON) {
    const m = re.exec(cd);
    if (m) return m[1] as XungHo;
  }
  const kd = boDau(text.trim());
  for (const re of TU_XUNG) {
    const m = re.exec(kd);
    if (m) return m[1] === "chi" || m[1] === "c" ? "chị" : "anh";
  }
  // 15/09/2026 (bắn thật A3/A5): "để mình hỏi vợ đã", "ok vợ mình chốt 4 tỷ" → người
  // nói là chồng, gọi "anh"; bot từng đổi sang "chị" ở lượt sau. "vợ chồng mình" thì thôi.
  if (!/\bvo chong\b/.test(kd)) {
    if (/\b(?:vo|ba xa)\s+(?:cua\s+)?(?:minh|toi|tui|em|t)\b|\bhoi\s+(?:y\s+)?(?:vo|ba xa)\b/.test(kd)) return "anh";
    if (/\b(?:chong|ong xa)\s+(?:cua\s+)?(?:minh|toi|tui|em|t)\b|\bhoi\s+(?:y\s+)?(?:chong|ong xa)\b/.test(kd)) return "chị";
  }
  return null;
}

// 05/10/2026 (SRS-5.1zx, hội thoại test 02/10 → hỏi bù 04/10 vẫn "mình"): cách gọi khách trước đây chỉ học ở ĐÚNG lượt có câu
// tự xưng; lượt đó luật bỏ sót (hoặc AI chưa bật) là hồ sơ trống mãi, dù khách đã xưng "anh" hai lần. Quét lại các tin khách đã
// nhắn (cũ → mới), câu tự xưng MỚI NHẤT thắng; lời dặn tường minh (`batXungHo`) vẫn hơn lời tự xưng trong cùng một tin.
export function hocXungHoTuLichSu(tinKhach: readonly string[]): XungHo | null {
  for (let i = tinKhach.length - 1; i >= 0; i--) {
    const t = (tinKhach[i] ?? "").trim();
    if (!t) continue;
    const xh = batXungHo(t) ?? tuXungTuCau(t);
    if (xh) return xh;
  }
  return null;
}

// ── Bận / hoãn / khó chịu (11/09/2026, lượt bắn 42 ca) ──────────────────────
// "hỏi gì hỏi lắm vậy em, anh bận" từng được ghi vào ô PHƯỜNG; "để anh hỏi vợ
// đã em" vào thông tin bổ sung, rồi bot hỏi tiếp đúng câu cũ (38 từ). Đây không
// phải câu trả lời mà là lời xin dừng: không ghi gì, không hỏi thêm, câu hỏi
// vẫn treo cho lượt sau. "bận" chỉ phân biệt được với "bán" khi còn dấu.
const HOAN_CD = /(?<![\p{L}])(?:bận|mệt)(?![\p{L}])|hỏi (?:gì )?(?:hoài|lắm|nhiều|mãi)/iu;
const HOAN_KD =
  /\b(?:de (?:anh|chi|em|toi|tui|minh|a|c) (?:hoi|tinh|suy nghi|coi lai|xem lai|nghi|ban bac)|(?:hoi|ban|noi)\s+(?:y\s+|voi\s+|lai\s+)?(?:vo|chong|ba|me|con|gia dinh|anh em)|tinh sau|de sau|luc khac|khi khac|noi sau|bua khac|hom khac|chua ranh|khong ranh|ko ranh|dang lai xe|dang hop|hoi hoai|hoi (?:lai )?sau|thoi de do|(?:thoi\s+)?de\s+(?:mai|toi|chieu|mot lat|ti nua|lat nua)(?:\s+(?:nha|nhe|di|roi))?(?:\s+(?:anh|chi|em|e|a|c|minh|toi|tui))?(?:\s+(?:noi|nhan|gui|bao|tinh|tra loi)(?:\s+tiep)?)?(?:\s+(?:nha|nhe|nhen|a|nghe))?(?=[\s.!…]*$)|mai\s+(?:(?:anh|chi|em|e|a|c|minh|toi|tui)\s+)?(?:noi|nhan|gui|tra loi|bao)\s+tiep|noi tiep sau|nhan tiep sau)\b/;
// 30/09/2026 (bắn thật lx-ban-f): "thoi de mai e noi tiep" — thiếu "để mai / mai nói tiếp": câu vào "bổ sung" và bot hỏi tiếp.
export function laHoanLai(text: string): boolean {
  const goc = text.trim();
  if (!goc || /\d/.test(goc)) return false; // có số là có dữ liệu — xét như câu trả lời
  return HOAN_CD.test(goc) || HOAN_KD.test(boDau(goc));
}

// ── Phủ định trong lời sửa (11/09/2026, lượt bắn 42 ca) ───────────────────────
// "sai rồi em, phường 9 chứ không phải phường 4" → ô phường vẫn Phường 4, vị
// trí thành "sai rồi em, chứ không phải phường 4", mà bot báo "đã cập nhật
// Phường 9". Vế sau "không phải" là cái SAI — không được bóc ra làm dữ liệu.
// Che bằng khoảng trắng CÙNG ĐỘ DÀI để chỉ số khớp trên câu gốc vẫn đúng.
const PHU_DINH =
  /(?:,\s*)?(?:(?:chứ|chu)\s+)?(?:không|khong|ko|chẳng|chang)\s+(?:phải|phai)(?:\s+(?:là|la))?\s+[^,.;!?\n]*?(?=\s+(?:mà|ma)\s|[,.;!?\n]|$)/giu;
export function vungPhuDinh(text: string): Array<[number, number]> {
  return Array.from(text.matchAll(PHU_DINH), (m) => [m.index!, m.index! + m[0].length] as [number, number])
    .filter(([i, j]) => j > i);
}
export function cheoPhuDinh(text: string): string {
  return text.replace(PHU_DINH, (s) => " ".repeat(s.length));
}

// ── Câu trả lời kèm LỜI DẶN (11/09/2026, Zalo thật, dự án ehome 3) ────────────
// Đang hỏi địa chỉ, chủ nhà nhắn "Bạn phải ghi dự án chung cư ehome 3 chứ ở hồ
// ngọc lãm" → cả câu vào ô vị trí, rồi thành location_raw và street. Câu có lời
// dặn/sửa thì chỉ giữ CỤM địa chỉ ("hồ ngọc lãm"). Câu trả lời phường có số thì
// ghi gọn "Phường N" thay vì cả câu "Đường hồ ngọc lãm quận 8 phường 6".
const LENH_DAN = /\b(?:ban phai|em phai|phai ghi|ghi lai|ghi giup|ghi la|sua lai|sua thanh|chu khong phai|khong phai|nham roi|sai roi)\b/;
/**
 * Câu là LỜI SỬA ("à sửa lại, dài 16 chứ không phải 15") → bỏ vế phủ định và chữ lệnh, còn lại
 * phần dữ liệu; đọc ngang/dài nếu có. 20/09/2026 (bắn thật mau-y-D): nguyên câu từng vào ô bổ
 * sung và in ra bản nháp "📝 Thêm: à sửa lại, dài 16 chứ không phải 15" dù cột dài đã đổi.
 */
export function gonLoiSua(text: string): { laSua: boolean; con: string; ngang: string | null; dai: string | null } {
  const kd = boDau(text);
  const laSua = LENH_DAN.test(kd) || /^\s*(?:a|à|ờ|ừ)\s*,?\s*(?:sua|sửa|nham|nhầm|sai)\b/iu.test(text);
  const con = cheoPhuDinh(text)
    .replace(/\b(?:bạn phải|em phải|phải ghi|ghi lại|ghi giúp|ghi là|sửa lại|sửa thành|chứ không phải|không phải|nhầm rồi|sai rồi|ban phai|em phai|phai ghi|ghi lai|ghi giup|ghi la|sua lai|sua thanh|chu khong phai|khong phai|nham roi|sai roi)\b/giu, " ")
    .replace(/\s+/g, " ").replace(TIEU_TU_DAU, "").replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, "").trim();
  // FR-241 d (10 ca test làm khó 28/09): "ngang 4m2 chứ không phải 4" — sau chữ ngang / dài, "4m2" là 4 mét 2 (4,2m), không phải
  // diện tích; bản trước lùi về "4". Viết lại "4m2" / "16m5" thành "4.2" / "16.5" trước khi bắt số.
  const kdCon = boDau(con).replace(/\b(ngang|mat tien|mt|rong|dai|sau|doc)\s*(?:la\s*)?(\d{1,3})\s*m\s*(\d)(?!\d)/g, "$1 $2.$3");
  const dai = /\b(?:dai|sau|doc)\s*(?:la\s*)?(\d+(?:[.,]\d+)?)\s*(?:m|met)?(?![\d])/.exec(kdCon)?.[1] ?? null;
  const ngang = /\b(?:ngang|mat tien|mt|rong)\s*(?:la\s*)?(\d+(?:[.,]\d+)?)\s*(?:m|met)?(?![\d])/.exec(kdCon)?.[1] ?? null;
  return { laSua, con, ngang, dai };
}

export function bocCumDiaChi(text: string): string | null {
  const t = text.trim();
  const m = /(?:^|[\s,])(?:ở|tại)\s+([^,.;!?\n]{3,80})$/iu.exec(t) ??
    /(?:^|[\s,])((?:đường|duong|hẻm|hem|hxh|phố|số nhà)\s+[^,.;!?\n]{2,80})/iu.exec(t);
  return m ? m[1].trim() : null;
}
// Chữ TẢ CON ĐƯỜNG (không phải tên đường): "hẻm xe hơi 4m", "đường nhựa 7m",
// "hẻm thông", "hẻm bê tông". Tên đường là chữ KHÔNG nằm trong bảng này.
const TU_TA_DUONG = new Set([
  "xe", "hoi", "may", "tai", "thong", "cut", "rong", "nho", "lon", "be", "tong",
  "nhua", "dat", "vao", "ra", "trong", "thuong", "co", "truoc", "sau", "noi",
  "met", "m", "mo", "cua", "nha", "ban", "ngang", "dai", "cho",
  // 14/09/2026: "hẻm ba gác đường Phạm Thế Hiển" → "ba gác" từng bị đọc là TÊN đường.
  "ba", "gac",
  // 15/09/2026 (bắn thử kho xưởng): "đường xe container" → street "xe container".
  "container", "cont", "tai",
  // 24/09/2026 (chủ dự án test Zalo): "mặt tiền ngay nút giao Trần Đình Xu" → tên đường từng thành "ngay nút giao Trần".
  "ngay", "nut", "giao",
]);
// Tên quận/huyện đứng ngay sau tên đường ("hxh Nguyễn Kiệm Phú Nhuận") — gặp là hết tên đường.
const QUAN_SAU_TEN = /^(?:phu nhuan|tan binh|binh thanh|go vap|tan phu|binh tan|thu duc|nha be|binh chanh|hoc mon|cu chi|can gio)$/;
// 15/09/2026 (bắn thử): "hẻm 5m Lê Đức Thọ gò vấp" → tên đường "Lê Đức" — "tho" nằm
// trong TU_DUNG (vì "thổ cư") nên cắt cụt Lê Đức Thọ. Chữ ĐA NGHĨA chỉ dừng khi đi
// thành CỤM hai chữ của thứ khác: "thổ cư", "thổ đất".
// 24/09/2026: "mặt tiền Hợp đồng thuê…" — "hợp đồng" không mở đầu tên đường nào.
const DUNG_HAI_CHU = /^(?:tho cu|tho dat|hop dong)$/;
/** "hợp đồng" nói về HỢP ĐỒNG THUÊ đang chạy (không phải giấy tờ nhà). */
const HOP_DONG_THUE_RE = /\bhop dong\s+(?:thue\s+)?\d+\s*(?:nam|thang)\b|\bhop dong\b[^,.;]{0,40}\b(?:thue|het han|con \d+ (?:nam|thang)|(?:den|toi)\s*(?:nam\s*)?20\d\d)\b|\b(?:cho|khach|dang|ngan hang)\b[^,.;]{0,30}\bthue\b[^,.;]{0,20}\bhop dong\b|\b(?:het han|con)\s+hop dong\b/;

/**
 * Mảnh RÁC không đáng vào "📝 Thêm" (24/09/2026, tin thật 152 Trần Đình Xu: "Quận 1 em ơi", "mới"):
 * bỏ từ đệm / xưng hô / "ơi" mà còn dưới 2 chữ, hoặc chỉ còn tên một đơn vị hành chính (quận / phường / xã…).
 */
export function laBoSungRac(s: string | null | undefined): boolean {
  const kd = boDau(s ?? "").replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(?:em|e|anh|a|chi|c|oi|nha|nhe|nhen|nghen|a|ah|ha|nhi|luon|vay|thoi|roi|ok|oke|uh|uhm|um|da|vang)\b/g, " ")
    .replace(/\s+/g, " ").trim();
  if (!kd || kd.split(" ").length < 2) return true;
  // 01/10/2026 (chủ dự án test Zalo): "ko có" khi hỏi phường → ô bổ sung "ko có". Lời đáp không / không biết trơn không phải thông tin.
  if (KHONG_BIET_PHUONG.test(boDau(s ?? ""))) return true;
  // 01/10/2026 (chủ dự án test Zalo): "hình đây" gửi kèm album → bản nháp "📝 Thêm: hình đây". Câu đưa ảnh không phải thông tin.
  if (/^\s*(?:(?:da|day|nay|ne|gui|em|anh|chi|a|c|e|cho)\s+)*(?:(?:vai|may|mot|cac)\s+)?(?:tam\s+)?(?:hinh anh|hinh|anh|clip|video)(?:\s+(?:day|ne|nha|nhe|nhen|a|em|anh|chi|di|luon|nay|cua nha|nha em|xem|coi|thu|gui|kia|do))*\s*[.!]*\s*$/.test(boDau(s ?? ""))) return true;
  // FR-239 m (phát lại test 28/09): "Cần đước, long an á e" (trả lời câu địa chỉ) → ô quận "Cần Đước, Long An" VÀ ghi chú
  // nguyên văn. Mảnh ngắn chỉ gồm huyện + tỉnh lân cận là địa bàn, không phải thông tin thêm.
  if (kd.split(" ").length <= 6 && /^(?:o\s+|tai\s+|thuoc\s+)?(?:[a-z]+\s+){0,3}(?:long an|binh duong|dong nai|tay ninh|ba ria vung tau|vung tau|tien giang|ben tre|hcm|tp hcm|sai gon|ho chi minh)$/.test(kd)) return true;
  return /^(?:o\s+|tai\s+|thuoc\s+)?(?:quan|q|huyen|phuong|p|xa|thi tran|tp|thanh pho)\s*[a-z0-9 ]{0,24}$/.test(kd) && kd.split(" ").length <= 5;
}

/**
 * Mảnh "bổ sung" chỉ NÓI LẠI điều một ô có cấu trúc đã giữ → ghi nữa là trùng (25/09/2026, chủ dự án "làm sao cho
 * nó bóc thông tin đúng và ko ghi trùng"; dữ liệu thật: "sân thượng" khi kết cấu đã có sân thượng, "ko có lửng" khi
 * kết cấu đã rõ, "xe hơi không vào được" khi đã ghi hẻm 3m). Chỉ nhận mảnh THUẦN một chủ đề: bỏ chữ chủ đề + chữ đệm
 * + phủ định mà còn chữ khác ("hẻm thông ra chợ", "trần cao 4m thông suốt") thì giữ — đó là thông tin mới.
 */
export type NguCanhBoSung = {
  facts?: Record<string, string | null | undefined>;
  floors_text?: string | null; access_type?: string | null; alley_width_m?: number | string | null;
  legal_status?: string | null; year_built?: number | string | null; rear_width_m?: number | string | null;
  /** Nhãn tin đang mang (`listings.nhan`, cộng nhãn gắn từ chính tin vừa nhắn). Không có thì không xét trùng nhãn. */
  nhan?: readonly string[] | null;
};
/** Câu nói về nhà KHÁC (hàng xóm, bên cạnh) — năm xây trong đó không phải của căn đang rao. */
const NHA_KHAC_RE = /\b(?:hang xom|nha ben|ben canh|ke ben|doi dien|nha ke)\b/;
/** "xây năm ngoái / năm nay / năm kia / năm rồi" → năm số theo giờ VN. null = không có. */
export function namXayTuongDoi(kd: string, bayGio: Date = new Date()): string | null {
  const m = /\b(?:xay|hoan cong|xd)\s*(?:xong\s*|moi\s*)?(?:tu\s*|hoi\s*|vao\s*|cuoi\s*|dau\s*)?(nam nay|nam ngoai|nam roi|nam truoc|nam kia)\b/.exec(kd);
  if (!m) return null;
  const nam = new Date(bayGio.getTime() + 7 * 3600e3).getUTCFullYear();
  return String(nam - (m[1] === "nam nay" ? 0 : m[1] === "nam kia" ? 2 : 1));
}
const TU_NAM_XAY = /\b(?:moi xay|xay moi|vua xay|moi sua|vua sua|sua lai|xay xong|xay|nha moi|nha|moi|nam nay|nam ngoai|nam roi|nam truoc|nam kia|nam (?:19|20)\d{2}|(?:19|20)\d{2})\b/;
const PHU_DINH_BS = /\b(?:khong|ko|k|kg|chua|hong|hok)\b/;
const DEM_BS = /\b(?:co|la|duoc|dc|roi|thoi|nha|nhe|a|em|anh|chi|minh|nen|cung|va|voi|rat|lam|luon|het|toi|cua|tan|vao|ra|den|nua|1|mot|cai)\b/g;
function thuanChuDe(kd: string, tuChuDe: RegExp): boolean {
  if (!tuChuDe.test(kd)) return false;
  const con = kd.replace(new RegExp(tuChuDe.source, "g"), " ").replace(PHU_DINH_BS, " ").replace(/\b(?:khong|ko|k|kg|chua)\b/g, " ")
    .replace(DEM_BS, " ").replace(/\b\d+(?:[.,]\d+)?\s*(?:m|met)?\b/g, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  return con === "";
}
const TU_DUONG_VAO = /\b(?:hem|hxh|hxt|hxm|xe hoi|o to|oto|xe may|xe tai|ba gac|duong vao|rong)\b/;
const TU_TANG_PHU = /\b(?:gac lung|gac|lung|san thuong|ap mai|tum|tang ham|ham)\b/;
const TU_SO = /\b(?:so hong rieng|so hong|so do|so rieng|so chung|shr|so)\b/;
export function laBoSungTrung(s: string | null | undefined, c: NguCanhBoSung): boolean {
  const kd = boDau(s ?? "").replace(/[^a-z0-9\s.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd) return false;
  const f = c.facts ?? {};
  // "sổ hồng" bỏ dấu là "so hong" — "hong" ở đó không phải "hông" (= không).
  const phuDinh = PHU_DINH_BS.test(kd.replace(/\bso hong\b/g, "so"));
  if (thuanChuDe(kd, TU_DUONG_VAO)) {
    const coHem = !!(f.do_rong_hem || f.do_rong_duong || c.access_type || (c.alley_width_m != null && c.alley_width_m !== ""));
    if (!coHem) return false;
    // "xe hơi vào tới cửa" mà ô đang ghi hẻm xe máy là thông tin MỚI (trái) — giữ.
    const xeHoiVao = /\b(?:xe hoi|o to|oto|hxh|xe tai|hxt)\b/.test(kd) && !phuDinh;
    return !(xeHoiVao && !["hem_xe_hoi", "hem_xe_tai", "mat_tien"].includes(c.access_type ?? "") && !/\b(?:xe hoi|o to|oto)\b/.test(boDau(f.do_rong_hem ?? "")));
  }
  if (thuanChuDe(kd, TU_TANG_PHU)) {
    const ketCau = boDau(`${c.floors_text ?? ""} ${f.ket_cau ?? ""} ${f.tang_phu ?? ""}`);
    if (!ketCau.trim()) return false;
    if (phuDinh) return true;                       // "ko có lửng" khi kết cấu đã rõ
    const tu = kd.match(TU_TANG_PHU)?.[0] ?? "";
    const goc = tu === "gac" || tu === "gac lung" ? "lung" : tu === "tang ham" ? "ham" : tu;
    return ketCau.includes(goc);                    // "sân thượng" khi kết cấu đã có sân thượng
  }
  if (thuanChuDe(kd, TU_SO) && !phuDinh) return !!(c.legal_status || f.phap_ly);
  // "nở hậu nhé" khi đã có số mét nở hậu (25/09/2026, chủ dự án test Zalo).
  if (thuanChuDe(kd, /\b(?:no hau|nha|dat|lo)\b/) && /\bno hau\b/.test(kd) && !phuDinh) return !!(f.no_hau || (c.rear_width_m != null && c.rear_width_m !== ""));
  // "nhà mới xây năm ngoái" khi năm xây đã ghi / tin đã mang nhãn mới xây (25/09/2026, chủ dự án test Zalo).
  if (/\b(?:xay|sua)\b/.test(kd) && thuanChuDe(kd, TU_NAM_XAY) && !phuDinh) return !!(f.nam_xay || c.year_built || c.nhan?.includes("moi_sua"));
  // FR-239 m (phát lại test 28/09): "diện tích 425m2 thổ cư" → ô thổ cư 425m2 VÀ ghi chú "thổ cư". Mảnh chỉ có chữ "thổ cư"
  // (± full / 100% / toàn bộ) mà ô thổ cư đã có → trùng.
  if (/^(?:full |toan bo |het |100 )?tho cu(?: 100| het| toan bo| full)?$/.test(kd.replace(/%/g, "").trim()) && !phuDinh) return !!f.tho_cu;
  // Mảnh chỉ nói đúng nhãn ("khu yên tĩnh") mà tin ĐANG mang nhãn đó — nhãn đã giữ ý đó.
  return c.nhan ? laThuanNhan(s, c.nhan) : false;
}

// Chữ mở đầu THỨ KHÁC — gặp là hết tên đường: giấy tờ, giá, kết cấu, hành chính.
// "đường nhựa 7m sổ riêng 850tr" dừng ở "sổ", không nuốt cả câu.
//
// Bảng này CỐ Ý NGẮN và chỉ chứa chữ KHÔNG BAO GIỜ mở đầu tên đường Sài Gòn.
// Bản nháp đầu có "an", "cống", "điện", "nam", "cô" — tức là giết luôn An Dương
// Vương, Cống Quỳnh, Điện Biên Phủ, Nam Kỳ Khởi Nghĩa, Cô Giang. Thà giữ dư một
// hai chữ rác trong địa chỉ còn hơn mất tên đường thật.
const TU_DUNG = new Set([
  // 17/09/2026: "hẻm 2 xẹc nhưng hẻm rộng" từng thành địa chỉ — "xẹc" là bậc hẻm, "nhưng/mà" là nối câu.
  "xec", "sec", "set", "xet", "nhung", "ma",
  "so", "giay", "gia", "ban", "mua", "thue", "huong", "full", "that", "tret",
  "lau", "tang", "phong", "ngu", "wc", "toilet", "hoan", "gap", "luong",
  "tich", "phuong", "quan", "huyen", "khong", "ngap", "xay",
  // 15/09/2026 (Zalo thật): "đường Lê Văn Việt mới làm lại rất rộng" → tên đường
  // "Lê Văn Việt mới" (trần 4 chữ vô tình cắt đúng trước "làm"), geocode tra
  // "Lê Văn Việt mới" ra rỗng. "Mới" không mở đầu tên đường Sài Gòn nào.
  "moi",
  // KHÔNG có "duong"/"hem" ở đây: bỏ dấu thì "Dương" (An Dương Vương, Dương Bá
  // Trạc) trùng "đường" — thêm vào là cắt cụt tên đường thật.
  "ty", "ti", "trieu", "m2", "shr", "hdmb",
  // 29/09/2026 (kịch bản K5): "đường xe tải vào tận nơi" (tả đường vào) thành địa chỉ "đường xe tải vào tận nơi" — "tận"
  // dừng tên đường (có dấu: chỉ "tận"; không dấu: chỉ khi sau là "nơi", để "Tân Kỳ Tân Quý" gõ không dấu còn nguyên).
  "tan",
]);

/**
 * Chữ dừng tên đường, xét CẢ DẤU (bắn thật 23/09: "hẻm Nguyễn Tri Phương quận 10" → "hẻm Nguyễn Tri"; cùng lỗi với
 * "Lê Hồng Phong", "Lương Nhữ Học", "Huyền Trân Công Chúa"…): bỏ dấu thì tên người trùng chữ dừng. Chữ CÓ DẤU chỉ
 * dừng khi đúng dạng có dấu của chữ dừng ("phường", "phòng", "lượng"); chữ gõ KHÔNG DẤU giữ cách cũ (dừng), trừ
 * phuong / huong / phong — ba chữ này dừng khi chữ SAU cho thấy nghĩa ("phuong 5", "huong dong", "phong ngu").
 */
const DANG_CO_DAU: Record<string, readonly string[]> = {
  xec: ["xẹc"], sec: ["sẹc"], set: ["sẹt"], xet: ["xẹt"], nhung: ["nhưng"], ma: ["mà"], so: ["sổ", "số"],
  giay: ["giấy"], gia: ["giá"], ban: ["bán"], thue: ["thuê"], huong: ["hướng"], that: ["thật"], tret: ["trệt"],
  lau: ["lầu"], tang: ["tầng"], phong: ["phòng"], ngu: ["ngủ"], hoan: ["hoàn"], gap: ["gấp"], luong: ["lượng"],
  tich: ["tích"], phuong: ["phường"], quan: ["quận"], huyen: ["huyện"], khong: ["không"], ngap: ["ngập"],
  xay: ["xây"], moi: ["mới"], ty: ["tỷ", "tỉ"], ti: ["tỉ", "tỷ"], trieu: ["triệu"], tan: ["tận"],
};
function laTuDungTen(w: string, sau: string): boolean {
  const kd = boDau(w);
  if (!TU_DUNG.has(kd)) return false;
  const thuong = w.toLowerCase();
  if (thuong === kd) {
    const kdSau = boDau(sau);
    if (kd === "phuong") return /^\d/.test(kdSau);
    if (kd === "huong") return /^(?:dong|tay|nam|bac)/.test(kdSau);
    if (kd === "phong") return /^(?:ngu|khach|tam|wc|\d)/.test(kdSau);
    if (kd === "tan") return /^noi\b/.test(kdSau);
    return true;
  }
  const dang = DANG_CO_DAU[kd];
  return dang ? dang.includes(thuong) : true;
}

/**
 * VỊ TRÍ trong CÂU RAO: "hẻm xe hơi 5m Nguyễn Trãi p3 q5" → "hẻm xe hơi 5m Nguyễn Trãi".
 *
 * 12/09/2026 (bắn 20 tin thật): bản trước loại NGUYÊN cụm khi chữ ngay sau
 * "hẻm/đường" là chữ tả đường ("xe", "nhựa", "rộng") — ý đúng là để "hẻm xe hơi
 * 4m" không thành tên đường, nhưng nó vứt luôn TÊN ĐƯỜNG đứng sau, nên 7/7 tin
 * của lượt bắn có `location_raw` rỗng và bot hỏi địa chỉ vòng vòng.
 *
 * Nay: cắt mệnh đề địa chỉ tới trước phường/quận/giá/dấu phẩy, rồi hỏi một câu
 * duy nhất — sau mấy chữ tả đường, CÓ tên riêng nào không? Có thì giữ cả cụm
 * (bề rộng hẻm là thứ đáng giữ trong địa chỉ), không có thì trả null.
 */
const TEN_QUAN_CHU = /^(?:quan\s+\d{1,2}|q\s*\d{1,2}|phu nhuan|tan binh|binh thanh|go vap|tan phu|binh tan|thu duc|nha be|binh chanh|hoc mon|cu chi|can gio)$/;
export function bocViTriRao(text: string): string | null {
  const t = (text ?? "").trim();
  // Mệnh đề bắt đầu từ chữ hẻm/đường tới dấu ngắt câu gần nhất. 14/09/2026: "nhà phố" /
  // "mặt phố" là LOẠI nhà, không phải "phố <tên>" — bỏ qua, tìm chữ mở đầu kế tiếp.
  let menh: string | null = null;
  let soNhaTruoc: string | null = null;
  const kemSo = (diaChi: string | null) => diaChi && soNhaTruoc ? `${soNhaTruoc} ${diaChi}` : diaChi;
  // 15/09/2026 (bắn thật N1): "mặt tiền Nguyễn Chí Thanh" cũng là địa chỉ.
  // 24/09/2026 (chủ dự án test Zalo): "Góc 2 mặt tiền⏎Hợp đồng thuê Sacombank…" — `\s+` sau chữ mở đầu nuốt cả dấu
  // XUỐNG DÒNG, địa chỉ thành "mặt tiền Hợp đồng" và bot tưởng căn khác, tạo tin thứ hai. Chỉ khoảng trắng cùng dòng.
  const reMenh = /(?:^|[\s,(])((?:đường|duong|hẻm|hem|hxh|phố|pho|ngõ|ngo|mặt tiền|mat tien|mt)[ \t]+[^,.;!?\n]{2,70})/giu;
  for (let mm = reMenh.exec(t); mm; mm = reMenh.exec(t)) {
    const truoc = boDau(t.slice(Math.max(0, mm.index - 6), mm.index + 1));
    // "mặt tiền 4m" là CHIỀU NGANG, không phải địa chỉ — tìm tiếp sau chữ "mặt tiền".
    if (/^(?:mặt tiền|mat tien|mt)\s+\d/iu.test(mm[1])) {
      reMenh.lastIndex = mm.index + mm[0].length - mm[1].length + 2;
      continue;
    }
    if (/^(?:pho|phố)\s/iu.test(mm[1]) && /\b(?:nha|mat)\s*$/.test(truoc)) {
      // Mệnh đề "phố Tân Bình đường Cộng Hòa" đã nuốt tới dấu phẩy — tìm lại ngay sau chữ "phố".
      reMenh.lastIndex = mm.index + mm[0].length - mm[1].length + 3;
      continue;
    }
    menh = mm[1].trim();
    // 01/10/2026 (bắn thật lx-tam-12, chủ dự án: "sửa luôn lỗi mất số nhà 156… từ nguồn"): "156 đường 59 Tây Thông Hội" —
    // mệnh đề bắt đầu từ chữ "đường" nên SỐ NHÀ đứng trước rơi mất. Số nhà (có thể kèm "số / nhà / sn", "137/28") ngay
    // trước chữ mở đầu là một phần địa chỉ — trừ khi nó là số đo / tiền / tầng ("dt 50", "giá 5", "tầng 3").
    const batDau = mm.index + mm[0].length - mm[1].length;
    const sn = /(?:^|[\s,(])(?:(?:số|so|nhà|nha|sn)\s*)?(\d{1,5}[a-ln-zA-LN-Z]?(?:\/\d{1,5}[a-zA-Z]?)*)\s*$/iu.exec(t.slice(0, batDau));
    if (sn && !/\b(?:cap|c|loai|nam|quan|q|phuong|p|dt|dien tich|ngang|dai|gia|tang|lau|tam|hem|kiet|ngo|lo|can|block|phong|x)\s*$/.test(boDau(t.slice(Math.max(0, sn.index - 12), sn.index + sn[0].indexOf(sn[1]))))) {
      soNhaTruoc = sn[1];
    }
    break;
  }
  if (menh) {
    const tu = menh.split(/\s+/);
    const haiChu = /^(?:mặt tiền|mat tien)\s/iu.test(menh);
    // "mặt tiền đường An Dương Vương" → mệnh đề địa chỉ bắt đầu từ "đường".
    const dauSau = haiChu && /^(?:đường|duong|hẻm|hem|hxh|phố|pho|ngõ|ngo)$/iu.test(tu[2] ?? "");
    const dau = dauSau ? tu[2] : haiChu ? `${tu[0]} ${tu[1]}` : tu[0];
    let i = dauSau ? 3 : haiChu ? 2 : 1;
    // Chữ TẢ đường và bề rộng/số nhà đứng trước tên: "xe hơi 5m", "102". 14/09/2026: cả
    // chữ "đường"/"phố" CÓ DẤU nằm giữa ("hẻm ba gác đường Phạm Thế Hiển") — bỏ dấu thì
    // "đường" trùng "Dương" (An Dương Vương), nên chỉ nhận bản có dấu.
    // 24/09/2026 (chủ dự án test Zalo): "đường số 59 Gò vấp" — đường ĐÁNH SỐ (Gò Vấp, Bình Tân, Thủ Đức…): "số" là
    // chữ dừng tên đường ("sổ/số") nên cả địa chỉ rơi. "đường số N" là tên đường trọn vẹn.
    if (/^(?:đường|duong)$/iu.test(dau) && /^(?:số|so)$/iu.test(tu[i] ?? "") && /^\d{1,3}[a-z]?$/i.test(tu[i + 1] ?? "")) {
      return kemSo([dau, tu[i], tu[i + 1]].join(" "));
    }
    // 01/10/2026: "đường 59" (không chữ "số") cũng là đường ĐÁNH SỐ — tên dừng ở con số; chữ sau là phường / quận
    // ("đường 59 Tây Thông Hội" từng thành tên đường "59 Tây Thông Hội"). Số kèm đơn vị đo ("đường 5m") thì không.
    if (/^(?:đường|duong)$/iu.test(dau) && /^\d{1,3}[a-ln-z]?$/i.test(tu[i] ?? "") && !/^(?:m|met|mét|x|tháng|thang)$/iu.test(tu[i + 1] ?? "")) {
      return kemSo(`đường số ${tu[i]}`);
    }
    const truoc: string[] = [];
    while (i < tu.length && (TU_TA_DUONG.has(boDau(tu[i])) || /^(?:đường|phố)$/iu.test(tu[i]) ||
      /^\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)*(?:m|met|mét)?$/i.test(tu[i]))) {
      truoc.push(tu[i]);
      i++;
    }
    // Rồi tới TÊN đường: chữ thuần, tối đa 4 chữ, gặp chữ của thứ khác thì dừng.
    const ten: string[] = [];
    while (i < tu.length && ten.length < 4 && /^[\p{L}]{2,}$/u.test(tu[i]) && !laTuDungTen(tu[i], tu[i + 1] ?? "") &&
      !DUNG_HAI_CHU.test(boDau(`${tu[i]} ${tu[i + 1] ?? ""}`).trim()) &&
      !(ten.length && QUAN_SAU_TEN.test(boDau(`${tu[i]} ${tu[i + 1] ?? ""}`).trim()))) {
      ten.push(tu[i]);
      i++;
    }
    // 15/09/2026 (bắn thật C3): "Cách Mạng Tháng 8", "3 Tháng 2" — tên đường KẾT
    // THÚC bằng con số sau chữ "tháng"; bản trước cắt mất số ("Cách Mạng Tháng").
    if (ten.length && boDau(ten[ten.length - 1]) === "thang" && i < tu.length && /^\d{1,2}$/.test(tu[i])) {
      ten.push(tu[i]);
      i++;
    }
    // 01/10/2026 (bắn thử bán lx-ban-293d): "nhà cấp 4 hẻm 3m Bình Thạnh 4x12" → địa chỉ "hẻm 3m Bình Thạnh" — tên QUẬN
    // không phải tên đường; không có đường thì để trống, bot hỏi địa chỉ.
    if (ten.length && TEN_QUAN_CHU.test(boDau(ten.join(" ")))) return null;
    return ten.length ? kemSo([dau, ...truoc, ...ten].join(" ")) : null;
  }
  // 16/09/2026 (bắn thật): "Căn số 14 ở Ny'ah Phú Định, 80m2, giá 7 tỷ" — số căn + ở/tại/trong
  // + tên khu/dự án là địa chỉ của căn (tin mới mở từng trống `location_raw`).
  const can = /(?:^|[\s,])((?:căn|can|lô|lo|nền|nen|shop)\s*(?:số|so)?\s*\d{1,4}[a-zA-Z]?(?:[.\-\/]\d{1,4})?\s+(?:ở|o|tại|tai|trong|thuộc|thuoc)\s+[^,.;!?\n]{3,60})/iu
    .exec(t)?.[1]?.trim() ?? null;
  if (can && !/\d\s*(?:m2|m²|tỷ|ty|triệu|trieu)\b/iu.test(can)) return can;
  // Số nhà trần: "7 Hồng Bàng phường 12", "123/4 An Dương Vương q5" — chỉ nhận
  // khi ngay sau là phường/quận, để "5 tỷ" hay "40m2" không thành địa chỉ.
  // 22/09/2026 (bắn thật căn hộ): "126 Hung Vuong p12" — lookahead cũ `p\d\b` chỉ nhận phường MỘT chữ số
  // ("p4"), "p12" trượt ở ranh từ sau chữ số đầu → địa chỉ trần trước phường 10–19 không bao giờ được nhận.
  // 30/09/2026 (chat thử): "bán nhà 20 hồ biểu chánh phú nhuận 4x16…" — tên QUẬN chữ đứng trần (không chữ "quận") ngay
  // sau tên đường cũng là mốc dừng; bản trước chỉ nhận "phường / quận / p12 / q5" nên cả địa chỉ rơi.
  const soM = /(?:^|[\s,])(\d{1,5}[a-zA-Z]?(?:\/\d{1,5}[a-zA-Z]?)*\s+(?:[\p{L}]+\s?){1,4}?)(?=[\s,]*(?:p\.?\s*\d{1,2}|phường|phuong|quận|quan|q\.?\s*\d{1,2}|phú nhuận|phu nhuan|tân bình|tan binh|bình thạnh|binh thanh|gò vấp|go vap|tân phú|tan phu|bình tân|binh tan|thủ đức|thu duc|nhà bè|nha be|bình chánh|binh chanh|hóc môn|hoc mon|củ chi|cu chi|cần giờ|can gio)(?![\p{L}]))/iu
    .exec(t);
  // 30/09/2026 (bắn thử bán lx-ban-292b): "căn hộ 2pn 68m2 tầng 15 dự án Sunrise City quận 7" → địa chỉ "15 dự án Sunrise
  // City": số TẦNG / lô / căn / block đứng trước tên dự án không phải số nhà.
  if (soM && /\b(?:tang|lau|lo|can|block|blk|thap|toa|phong|so can|ma can)\s*$/.test(boDau(t.slice(Math.max(0, soM.index - 10), soM.index + soM[0].indexOf(soM[1])))) ) return null;
  const so = soM?.[1]?.trim() ?? null;
  // 23/09/2026 (bắn thật): "căn 2 căn hộ Hà Đô quận 10" → "2 căn hộ Hà Đô" — số thứ tự căn + chữ LOẠI nhà không phải số nhà.
  if (so && /^\d{1,5}[a-zA-Z]?\s+(?:căn|can|nhà|nha|lô|lo|nền|nen|phòng|phong|tầng|tang|lầu|lau|miếng|mieng)(?![\p{L}])/iu.test(so)) return null;
  // "12 tỷ rưỡi gò vấp", "3 triệu gò vấp" — tiền / diện tích đứng trước tên quận không phải số nhà.
  if (so && /^\d{1,5}[.,]?\d*\s*(?:tỷ|tỉ|tỏi|ty|ti|toi|triệu|trieu|tr|củ|cu|m2|m²|mét|met|m)(?![\p{L}])/iu.test(so)) return null;
  return so && so.length >= 6 ? so : null;
}

// 25/09/2026 (dữ liệu thật: pháp lý "Shr em"; chủ dự án "bóc thông tin đúng"): chữ đệm / xưng hô VIẾT THƯỜNG ở CUỐI
// câu trả lời không phải dữ liệu. Chỉ viết thường — tên riêng viết hoa ("… Anh", "Cô Giang") không bị cắt; "rồi",
// "thôi" giữ vì mang nghĩa ("hoàn công rồi").
// 05/10/2026 (SRS-5.1zzb): thêm "đâu" cuối câu ("không có đâu em") — tiểu từ phủ định nhấn, không phải "ở đâu".
// 07/10/2026 (chủ dự án chat thử: địa chỉ "An Dương Vương nha e" vào nguyên bản nháp): khách gõ tắt xưng hô một chữ "e" / "a" / "c"
// (em / anh / chị) SAU một tiểu từ ("nha e", "nhé a", "đó c") — bỏ luôn. Một chữ đứng trơn ("lô C", "toà E", "12 A") không bỏ.
const DEM_CUOI_DAP_AN = /(?:[\s,.;!]+(?:em|anh|chị|cô|chú|bác|cháu|ạ|á|nha|nhé|nhe|nhen|nghen|nè|ơi|đó|đấy|nhỉ|hen|đâu))+(?:[\s,]+[eac](?![\p{L}\d]))?[\s.!,]*$/u;
export function catDapAn(question: string, dapAn: string): string {
  const ra = catDapAnGoc(question, dapAn);
  // "hxh, 5x12, trệt 3 lầu" cắt còn "hxh" → chữ đầy đủ như khi khách chỉ gõ "hxh" (bắn thật lx-21).
  if ((question === "do_rong_hem" || question === "do_rong_duong") && /^\s*(?:hxh|hxt|hxm)\s*$/i.test(ra)) return catDapAnGoc(question, ra.trim());
  const gon = ra.replace(DEM_CUOI_DAP_AN, "").trim();
  return gon && /[\p{L}\p{N}]/u.test(gon) ? gon : ra;
}
function catDapAnGoc(question: string, dapAn: string): string {
  // 25/09/2026: câu năm xây đáp "năm ngoái" / "xây năm nay" → năm số (trigger chỉ đọc 4 chữ số); giữ chữ khách trong ngoặc.
  if (question === "nam_xay" && !/(?:19|20)\d{2}/.test(dapAn)) {
    const kd = boDau(dapAn);
    const nx = namXayTuongDoi(/\b(?:xay|hoan cong|xd)\b/.test(kd) ? kd : `xay ${kd.replace(/^\W*(?:(?:moi|vua)\s+)?/, "")}`);
    if (nx) return `${nx} (${dapAn.trim().replace(/[.!\s]+$/, "")})`;
  }
  // 25/09/2026: "hxh" một mình → "hẻm xe hơi" (đọc được ở 🤖 và bản nháp; trigger vẫn đọc ra loại đường vào).
  // 27/09/2026: kèm tiểu từ ("Hxm nhé", "hxh nha em") vẫn là cụm viết tắt trơn.
  if ((question === "do_rong_hem" || question === "do_rong_duong") &&
      /^\s*(?:hxh|hxt|hxm)(?:\s+(?:nhe|nha|nhen|em|a|do|day|luon|anh|chi|ne))*\s*[.!]*\s*$/.test(boDau(dapAn))) {
    const t = boDau(dapAn).trim().slice(0, 3);
    return t === "hxt" ? "hẻm xe tải" : t === "hxm" ? "hẻm xe máy" : "hẻm xe hơi";
  }
  // 15/09/2026: bỏ phần hỏi ngược trước khi cắt; đáp án chữ chỉ giữ MẢNH nói về đúng
  // câu đang hỏi — "Nhà 5 tầng, có thang máy thì phải, bạn có biết…" → kết cấu "Nhà 5
  // tầng"; "Được giá, căn tôi sở hữu nhưng chưa vào xem…" → gấp "Được giá".
  // SRS-5.1zzzb: hỏi có / không, "ko có, đường 8m" → giá trị ô đang hỏi là "ko có" (mảnh sau ghi kèm vào ô của nó).
  const coKhongDau = tachDapCoKhongDau(question, dapAn);
  if (coKhongDau) return coKhongDau.dau;
  const tach = tachCauHoiNguoc(dapAn);
  const goc0 = tach.hoi && tach.traLoi ? tach.traLoi : dapAn;
  const goc = O_HOI_KEM_DOAN.has(question) ? boGatDau(goc0) : goc0;
  if (question === "vi_tri" && LENH_DAN.test(boDau(goc))) return bocCumDiaChi(goc) ?? goc;
  // 20/09/2026 (bắn thật mau-y-B): "phường 17 nhé, đường Phan Văn Trị" — lời sửa phường bị bóc, còn
  // "nhé, đường Phan Văn Trị" thành location_raw và street = "nhé". Tiểu từ đứng đầu mệnh đề bỏ đi.
  if (question === "vi_tri") {
    // 24/09/2026 (chủ dự án test Zalo): "137/28 nhé em, cần bán gấp giá 5 tỏi 9…" — cả câu thành địa chỉ, street = "nhé
    // em". Mảnh ĐẦU là số nhà / hẻm và phần sau không nói gì về địa chỉ → chỉ giữ mảnh đầu, bỏ tiểu từ cuối.
    const manh = goc.split(/[,;\n]/);
    const dau0 = (manh[0] ?? "").replace(TIEU_TU_DAU, "").trim();
    const sau0 = boDau(manh.slice(1).join(" "));
    if (manh.length > 1 && /^\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)*(?:\s|$)/i.test(dau0) &&
        !/\b(?:duong|hem|hxh|pho|phuong|quan|p\s*\d|q\s*\d|ngo|kdc|khu)\b/.test(sau0)) {
      const gon = dau0.replace(/(?:\s+(?:nhé|nha|nhe|nghen|em|anh|chị|ạ|ơi|đó|nè|á|luôn|thôi))+\s*$/iu, "").trim();
      if (gon) return gon;
    }
    const sach = goc.replace(TIEU_TU_DAU, "").trim();
    if (sach && sach !== goc) return sach;
    // 07/10/2026: "nhà a ở 45 Trần Hưng Đạo" → bỏ lời dẫn "nhà anh ở" (chữ khách, không phải địa chỉ).
    const boDan = goc.replace(DAN_DIA_CHI, "").trim();
    if (boDan && boDan !== goc && /[\p{L}\p{N}]/u.test(boDan)) return boDan;
  }
  if (question === "phuong") {
    const m = /(?:phường|phuong|(?<![\p{L}])p)\s*\.?\s*(\d{1,2})(?!\d)/iu.exec(goc);
    if (m) return `Phường ${Number(m[1])}`;
    // 27/09/2026 (test Zalo): "Ở cầu kho em ơi" → "cầu kho" (bỏ "ở / tại / thuộc" đầu câu; tiểu từ đuôi bỏ ở dưới).
    const bo = goc.replace(/^\s*(?:nhà\s+)?(?:ở|o|tại|tai|thuộc|thuoc)\s+(?=\S)/iu, "");
    if (bo !== goc) return catDapAnGoc(question, bo);
  }
  // 15/09/2026 (bắn thật A2/A3): "giá thì mình muốn tầm 4 tỷ 2" ghi nguyên mệnh đề vào
  // ô giá, "70m2 2pn" vào ô tim tường. Cột đúng (parse_vnd, trigger) nhưng fact là rác:
  // giá lấy từ chữ "tầm/khoảng" hoặc con số tới hết mảnh; m² lấy đúng cụm số+m2.
  if (question === "gia" || question === "phi_quan_ly" || question === "tien_coc") {
    const kdD = boDauGiuDoDai(goc);
    const m = new RegExp(`(?:\\b(?:tam|khoang|co|tren|duoi|tu)\\s+)?[\\d][\\d.,]*\\s*(?:${TIEN_KD})(?![a-z])|(?:\\b(?:tam|khoang)\\s+)?${TIEN_T_KEP}`).exec(kdD);
    if (m && m.index > 0) {
      const manh = goc.slice(m.index).split(/[,;\n]/)[0].trim()
        .replace(/(?:\s+(?:thôi|nha|nhé|nhe|nhen|ạ|á|em|anh|chị|luôn|rồi|nè|đó|đấy|ơi))+\s*$/iu, "");
      if (manh && manh.length < goc.length) return manh;
    }
  }
  if (question === "dien_tich_tim_tuong" || question === "dien_tich" || question === "dien_tich_dat" || question === "tho_cu") {
    const kdD = boDauGiuDoDai(goc);
    const m = /\d+(?:[.,]\d+)?\s*(?:m2|m²|met vuong)(?![a-z0-9])/.exec(kdD);
    if (m && m[0].trim().length < goc.trim().length && !/\d\s*x\s*\d/.test(kdD)) return goc.slice(m.index, m.index + m[0].length).trim();
  }
  if (question === "gap") {
    const kdD = boDauGiuDoDai(goc);
    const m = GAP_CAT_RE.exec(kdD);
    if (m) return goc.slice(m.index, m.index + m[0].length).trim();
  }
  // 16/09/2026 (Zalo thật, ảnh chủ dự án): "ngang 5m còn dọc 16m cần bán gấp" trả lời câu
  // diện tích đất → ô đất ghi NGUYÊN câu. Có ngang + dài thì đáp án là "ngang 5m dài 16m"
  // (SQL `boc_thong_so` đọc được hai chiều rồi nhân).
  if (/^dien_tich/.test(question) || question === "tho_cu") {
    const nd = ngangDai(boDau(goc));
    if (nd) return nd;
  }
  const manh = goc.split(/[,;\n]|\.\s+(?=\S)/).map((x) => x.trim()).filter(Boolean);
  if (manh.length > 1 && question !== "vi_tri" && question !== "bo_sung") {
    const nd = nhanDienNhieuFact(goc).find((f) => cungHo(f.question, question));
    const khop = (nd?.answer && nd.answer.length < goc.length ? nd.answer : null) ??
      manh.find((x) => { const f = nhanDienFact(x); return !!f && cungHo(f.question, question); }) ?? null;
    if (khop) {
      // Mảnh mang SĐT ("sổ hồng riêng, gọi tôi 0703 123 456") giữ lại — nhánh người bán
      // không lọc số, CTV cần nó để gọi (V48-105d).
      const SDT_RE = /(?:\+?84|0)(?:[\s.]?\d){8,10}\b/;
      const giu = manh.filter((x) => x !== khop && !khop.includes(x) && SDT_RE.test(x));
      return [khop, ...giu].join(", ");
    }
  }
  return goc;
}

// Tiểu từ / ừ hử đứng ĐẦU mệnh đề, thường sót lại sau khi bóc lời sửa ("nhé, đường Phan Văn Trị").
export const TIEU_TU_DAU = /^(?:\s*(?:nhé|nhe|nha|nhen|hen|ạ|à|a|ừ|u|ờ|dạ|da|vâng|vang|rồi|roi|thì|thi|mà|ma|ok|oke|okie|em|anh|chị|chi)(?![\p{L}])[\s,.;:–-]*)+/iu;

// Mảnh "gấp" cắt khỏi câu dài — dùng ở cả `catDapAn` lẫn `nhanDienFact` (16/09/2026:
// "ngang 5m còn dọc 16m cần bán gấp" từng ghi nguyên câu vào ô gấp).
const GAP_CAT_RE = /\b(?:(?:khong|ko|k|chua)\s+(?:can\s+)?(?:gap|voi)|can\s+(?:ban\s+)?gap|ban\s+gap|(?:duoc|dc)\s+gia(?:\s+thi\s+thoi)?|tu tu|thong tha|can tien|ban nhanh|ban som|gap|khong voi|ko voi)\b/;
// "ngang 5m còn dọc 16m", "ngang 5 dài 20", "5x16" → "ngang 5m dài 16m"; không có thì null.
const NGANG_DAI_RE = /\b(?:ngang|mat tien|mt|rong)\s*(?:la\s*)?(\d+(?:[.,]\d+)?)\s*(?:m|met)?\b(?:\s*,?\s*(?:con\s+|va\s+)?(?:x|dai|sau|doc)\s*(?:la\s*)?(\d+(?:[.,]\d+)?)\s*(?:m|met)?\b)/;
export function ngangDai(kd: string): string | null {
  // "5x16" giữ nguyên dạng (DB đọc được, câu "4x14 nở hậu 5m" còn giữ nở hậu) — chỉ đổi dạng chữ.
  const m = NGANG_DAI_RE.exec(kd);
  return m ? `ngang ${m[1]}m dài ${m[2]}m` : null;
}

/**
 * 24/09/2026 (chủ dự án test Zalo: trích tin cũ + "đã trả lời rồi này"): chủ nhà nói MÌNH ĐÃ TRẢ LỜI — không phải dữ liệu.
 * Chỉ câu ngắn (≤ 8 chữ) mà ý chính là "đã trả lời / nói / nhắn / gửi rồi".
 */
export function laNoiDaTraLoi(text: string): boolean {
  const kd = boDau(text ?? "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd || kd.split(" ").length > 8) return false;
  // 27/09/2026 (test Zalo): "Cái giá hồi nãy đó" / "giá lúc nãy" / "như hồi nãy" — trỏ về điều đã nói ở tin trước.
  return /\b(?:tra loi|noi|nhan|gui|ghi|bao)\s+(?:roi|o tren|luc nay|hoi nay|nay gio)\b/.test(kd) ||
    /\b(?:cai|con so|so|gia|nhu|y nhu|giong)\s+(?:(?:gia|so)\s+)?(?:hoi nay|luc nay|ban nay|o tren|nay gio|luc dau)\b/.test(kd);
}

/**
 * 24/09/2026 (chủ dự án test Zalo: "137/28 nghĩa là đường số 59 hẻm 137 và nhà số 28"): mảnh ĐẦU của câu chỉ là số nhà
 * có gạch chéo ("137/28 nhé em, cần bán gấp…") → trả { soNha, conLai }. Không có gạch chéo thì null ("5 tỷ", "4m"
 * không phải số nhà).
 */
export function soNhaDau(text: string): { soNha: string; conLai: string } | null {
  const manh = (text ?? "").split(/[,;\n]/);
  const dau = (manh[0] ?? "").replace(TIEU_TU_DAU, "")
    .replace(/(?:\s+(?:nhé|nha|nhe|nghen|em|anh|chị|ạ|ơi|đó|nè|á|luôn|thôi))+\s*$/iu, "").trim();
  // 25/09/2026 (FR-226 b, chủ dự án: khách trả lời nhỏ giọt): "số 45 nha" — số trần có chữ "số" đứng trước cũng là số nhà.
  const m = /^(?:(?:số nhà|so nha|nhà số|nha so|số|so)\s+(\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)*)|(?:(?:số nhà|so nha|số|so|nhà|nha)\s+)?(\d{1,5}[a-z]?(?:\/\d{1,5}[a-z]?)+))$/iu.exec(dau);
  return m ? { soNha: m[1] ?? m[2], conLai: manh.slice(1).join(",").trim() } : null;
}

/**
 * 24/09/2026 (chủ dự án test Zalo): đang hỏi DIỆN TÍCH, chủ đã nói "ngang 5m" ở lượt trước, lượt này nói "dài 16m"
 * → "ngang 5m dài 16m" (DB nhân ra 80 m²). Câu nói MỘT chiều mà chiều kia đã có trong tin thì ghép; câu có đủ hai
 * chiều, có "x", có m², chỉ nói ngang, hoặc không nói chiều nào → null (đi đường cũ).
 */
export function ghepMotChieu(question: string, dapAn: string, ngangCo: number | string | null | undefined, daiCo: number | string | null | undefined): string | null {
  if (!/^dien_tich(?:_dat)?$/.test(question)) return null;
  const kd = boDau(dapAn ?? "");
  if (ngangDai(kd) || /\d\s*(?:m\s*)?x\s*\d|m2|m²|met vuong/.test(kd)) return null;
  const so = (re: RegExp) => { const m = re.exec(kd); return m ? m[1].replace(",", ".") : null; };
  // 27/09/2026 (test Zalo): "Nhưng dài tới 14 m" — cho phép "tới / khoảng / tầm / có / gần" giữa chữ và số.
  const dai = so(/\b(?:dai|sau|doc|chieu dai)\s*(?:(?:la|toi|khoang|tam|co|gan|chung)\s*)?(\d+(?:[.,]\d+)?)\s*(?:m|met)?(?![\d])/);
  const ngang = so(/\b(?:ngang|mat tien|mt|chieu ngang)\s*(?:la\s*)?(\d+(?:[.,]\d+)?)\s*(?:m|met)?(?![\d])/);
  const n = (v: number | string | null | undefined) => { const x = v == null ? NaN : Number(v); return Number.isFinite(x) && x > 0 ? String(x) : null; };
  // Chỉ chiều "dài" nối vào "ngang" đã có (thứ tự người ta nói: ngang trước, dài sau). "Ngang 5" trần vẫn đi đường cũ
  // (ghi mặt tiền, câu diện tích treo) — `length_m` cũ trong tin có thể từ lượt khác, không tự nhân.
  void daiCo;
  if (dai && !ngang && n(ngangCo)) return `ngang ${n(ngangCo)}m dài ${dai}m`;
  return null;
}

// ── Tiểu từ / ack ────────────────────────────────────────────────────────────
// Lời chào không mang dữ liệu (bỏ dấu): "hello", "chào em", "alo em ơi", "hi bạn".
export const CHAO_SUONG_RE =
  /^\s*(?:(?:anh|chi|co|chu|bac|ong|ba|di|cau|mo|thim|duong)\s+)?(?:hello|helo|hi|hey|alo|a lo|chao|xin chao|chao buoi (?:sang|trua|chieu|toi))\s*(?:em|chau|con|ban|shop|ad|admin|bot|a|c|anh|chi|ai oi|ai)?\s*(?:oi|nhe|nha|a)?\s*[!.~]*\s*$/;

/**
 * 22/09/2026: "chào cháu" / "chào con" mà KHÔNG xưng chú/cô/bác — biết là người lớn tuổi, chưa biết chú hay cô.
 * Chỉ trên chữ còn dấu ("chao chau" bỏ dấu vẫn đủ rõ, nhưng giữ một luật với `tuXungTuCau`).
 */
export function laChaoChau(text: string): boolean {
  return /(?<![\p{L}])chào\s+(?:cháu|con)(?![\p{L}])/u.test((text ?? "").trim().toLowerCase());
}
const TIEU_TU =
  /\b(a|u|o|oi|da|vang|em|anh|chi|nha|nhe|nhen|ha|hen|ok|oke|okie|roi|thi|ma|voi|va|do|luon|de|coi|xem|chut|lat|nua|tam|di|ne|ne|ok|uh|uk|um|hmm|hm|yes|yep)\b/g;
const conChu = (kd: string) => kd.replace(TIEU_TU, "").replace(/[^a-z0-9]+/g, "");

const CO_SO = /\d/;
// Từ nói chuyện (còn dấu) — không có trong tên phường/xã nào ("Bàn Cờ" là "bàn",
// không phải "bận").
/** Câu CHỈ nói quận/huyện ("quận 5 em", "Q.Bình Tân", "ở quận 10 nha"), không có phường/xã/số phường. */
export function laChiQuan(text: string): boolean {
  const kd = boDau(text ?? "").toLowerCase().replace(/[.,!?]+/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(?:phuong|xa|thi tran|p\s*\d)/.test(kd)) return false;
  return /^(?:(?:o|thuoc|nha|nha minh|nha o|em|anh|chi)\s+)*(?:quan|q|huyen)\s*(?:\d{1,2}|[a-z]+(?:\s[a-z]+){0,2}?)(?:\s+(?:nha|nhe|nhen|a|em|anh|chi|chau|ne|do|oi|nghen))*$/.test(kd);
}
const TU_NOI_CHUYEN = /(?<![\p{L}])(?:hỏi|gì|sao|vậy|lắm|bận|biết|không|chưa|rồi|để|đang|ơi|thôi|tính|nghĩ|vợ|chồng|mệt|hả)(?![\p{L}])/iu;
const SO_CHU = /\b(mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi|ruoi)\b/;

// Câu hỏi cần MỘT CON SỐ mới là trả lời.
const HOI_SO = new Set([
  "dien_tich", "dien_tich_dat", "dien_tich_tim_tuong", "tho_cu", "ket_cau", "tang",
  "so_phong_ngu", "nam_xay", "mat_tien", "do_rong_hem", "do_rong_duong",
  "phi_quan_ly", "gia_dien_nuoc", "thoi_han_thue", "gia",
  // FR-186 (09/09/2026, cho thuê): cọc mấy tháng, trượt giá mấy % — đều là số.
  "tien_coc", "truot_gia",
  // 20260909i: câu hỏi bù sau đăng + loại mới.
  "so_wc", "cach_mat_tien", "no_hau", "phi_gui_xe", "mat_do_xd", "tang_cao_toi_da", "fit_out",
  "so_phong", "ty_le_lap_day", "doanh_thu", "chieu_cao", "tai_trong_san", "tram_bien_ap",
]);
// Trường có đơn vị tiền hợp lệ ("120 triệu/tháng" là doanh thu, không phải giá bán lạc chỗ).
const TIEN_OK = new Set(["gia", "doanh_thu", "phi_quan_ly", "phi_gui_xe", "gia_dien_nuoc", "tien_coc"]);
// Câu hỏi CÓ/KHÔNG: "có", "không", "rồi", "chưa" là câu trả lời đủ (không phải ack).
const HOI_CO_KHONG = new Set([
  "hem_thong", "ngap_nuoc", "the_chap", "thuong_luong", "can_goc", "thang_may", "pccc", "len_tho_cu", "gap",
  "ranh_gioi", "xu_ly_nuoc_thai", "duong_container", "nguon_nuoc", "hien_trang_su_dung", "so_huu", "tang_phu",
  "hoan_cong", "ban_giao", "dong_y_ban", // FR-223
  "tranh_chap", "dien_tich_khop_so", // FR-229
]);

/** Câu hỏi có / không (đáp "có", "không", "rồi" là đủ). */
export const laCauCoKhong = (q: string): boolean => HOI_CO_KHONG.has(q);
/**
 * Chủ nhà bảo ĐĂNG ("cứ đăng như này trước đi", "đăng tin luôn đi em", "lên tin trước") — 28/09/2026, câu vừa bảo đăng vừa
 * hoãn ("chiều anh gửi thêm thông tin với ảnh, giờ đang bận"). Có dấu thì "đăng" ≠ "đang" (đang bận); gõ không dấu thì phải
 * có chữ đi kèm rõ nghĩa đăng tin. "chưa / khoan / đừng đăng" không tính.
 */
export function laBaoDang(text: string): boolean {
  const t = text.toLowerCase();
  const kd = boDau(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
  if (/(?:chưa|khoan|đừng|không|ko|chờ)\s+(?:cần\s+)?đăng|\b(?:chua|khoan|dung|khong|ko|cho)\s+dang\s+(?:tin|bai|len|nhu)/.test(t) || /\b(?:chua|khoan|dung)\s+dang\b/.test(kd)) return false;
  return /đăng(?!\s*ký)/.test(t) && !/đăng\s+ký/.test(t) ||
    /\b(?:cu|thi|ok|oke)\s+dang\s+(?:nhu|truoc|luon|di|tin|bai|len|tam)\b|\bdang\s+(?:tin|bai|len tin|luon di|nhu nay|nhu vay|truoc di|tam di)\b|\blen\s+(?:tin|ke)\b|\b(?:post|up)\s+(?:tin|bai)\b/.test(kd);
}
/**
 * SRS-5.1zzu (06/10/2026, bắn lại thu-ai-0610): CẢ TIN chỉ là câu lệnh đăng — "ok đăng đi", "đăng luôn đi em", "lên tin giúp anh" —
 * bỏ tiểu từ thì không còn chữ nào khác. Model (Haiku) từng đọc "ok đăng đi" (bot đang hỏi gấp) là `binh_thuong` → bot lờ, hỏi tiếp.
 * Đây là lưới "luật chắc" cùng tiền lệ "cả tin chỉ là một số tiền thì luật chắc": chỉ kích khi AI nói KHÔNG có ý định nào và tin
 * không mang gì ngoài lệnh đăng; câu có thêm ý ("chiều gửi ảnh, giờ đăng trước đi") vẫn để AI quyết.
 */
export function laChiLenhDang(text: string): boolean {
  if (!laBaoDang(text)) return false;
  const kd = boDau(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd || /\d/.test(kd) || kd.split(" ").length > 8) return false;
  const TIEU_TU = /^(?:ok|oke|okie|okay|u|uh|um|da|vang|roi|duoc|dc|thoi|em|e|a|anh|chi|chu|co|bac|nha|nhe|nhen|nghe|di|luon|giup|cho|minh|toi|tui|cu|thi|truoc|tam|vay|the|nay|len|tin|bai|dang|ke|chot|post|up|dum|ho|nhu|voi|vay|ban|lun|roi)$/;
  return kd.split(" ").every((w) => TIEU_TU.test(w));
}
/**
 * Một câu phủ định chung cho CẢ câu hỏi gộp ("không có gì hết", "ko dính gì", "sạch sẽ hết em") — 27/09/2026, câu pháp lý thứ
 * hai (quy hoạch + tranh chấp + xây lố). Có "nhưng / trừ" hay chữ số là nói riêng một ý → không tính; "không biết / không rõ"
 * không phải câu trả lời.
 */
export function laKhongGiHet(text: string): boolean {
  const kd = boDau(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd || kd.split(" ").length > 10 || /\d/.test(kd)) return false;
  if (/\b(?:nhung|tru|ngoai|biet|ro|nho|chac|hoi|de em|de anh|de chi)\b/.test(kd)) return false;
  return /^(?:da |a )?(?:khong|ko|k|hong|khg|kh|chang|dau co|lam gi co)\b/.test(kd) || /^(?:da |a )?sach(?: se)?\b/.test(kd);
}

// Từ khoá tối thiểu cho các câu hỏi CHỮ. Không có từ nào trong đây thì coi là
// lệch: "16m nha" không phải hướng, "kêu chị nha" không phải pháp lý.
const TU_KHOA: Record<string, RegExp> = {
  phap_ly: /\b(so|hong|do|hoan cong|giay|hop dong|hdmb|vi bang|phap ly|chung|rieng|chua co so|cho so|ra so|dang lam so|shr|shc)\b/,
  huong: /\b(dong|tay|nam|bac|huong|chua ro|khong ro|ko ro|khong biet|ko biet|chua biet)\b/,
  quy_hoach: /\b(khong|ko|k|chua|co|dinh|vuong|on|sach|quy hoach|lo gioi|treo|giai toa|an toan|khong dinh|ko dinh|chuan)\b/,
  loai_bds: /\b(nha|pho|cap 4|chung cu|can ho|dat|biet thu|phong tro|mat bang|kho|xuong)\b/,
  // Vị trí cụ thể (chủ dự án 09/09/2026: "hỏi vị trí cụ thể thì tốt hơn"):
  // tên đường / hẻm / số nhà / mốc gần — hoặc có số (số nhà, số hẻm).
  vi_tri: /\b(duong|hem|hxh|so|pho|ngo|kdc|khu|toa|chung cu|cu xa|lo|kp|ap|xa|phuong|quan|gan|doi dien|nga|cho|truong|benh vien|cong vien|du an|block|thap)\b/,
  // FR-186 (09/09/2026): bộ câu hỏi riêng cho đất / biệt thự (chat Gemini
  // 21/06: "vướng cột điện, hố ga", "xây tự do hay theo mẫu CĐT", "compound").
  ha_tang: /\b(cot dien|ho ga|tru dien|cong|duong dam|vuong|khong vuong|ko vuong|sach|khong co|ko co|khong|ko|trong|thoang)\b/,
  xay_dung: /\b(tu do|theo mau|mau|chu dau tu|cdt|quy hoach|xay|tang|lau|khong|ko|duoc)\b/,
  khu_compound: /\b(compound|biet lap|an ninh|bao ve|khu|cong|rieng|khong|ko|mo|tu do|ben ngoai|dan cu)\b/,
  // 14/09/2026: đang hỏi "gấp không", chủ nhà nhắn "à anh nói lại, là đất trống chưa xây"
  // → cả câu vào ô gấp. Câu trả lời gấp phải nói về NHỊP bán.
  // FR-220 (24/09/2026): "nhà có tầng lửng, sân thượng hay tầng hầm không".
  tang_phu: /\b(lung|gac|san thuong|ham|ap mai|khong|ko|k|co|chua|chi|deu|ca|het)\b/,
  gap: /\b(gap|voi|tu tu|thong tha|can tien|duoc gia|cho duoc|ban nhanh|ban som|som|lien|ngay|khong can|khong|ko|chua|co)\b(?!\s+xay)/,
};

// Câu hỏi ngược của chủ nhà: có dấu hỏi hoặc mở đầu bằng từ để hỏi.
// "phí quản lý 20 nghìn/m2" KHÔNG phải câu hỏi (10/09: từng bị coi là "hỏi phí") —
// chỉ "phí sao / phí bao nhiêu / phí bên em" mới là hỏi ngược.
const CAU_HOI_RE = /\?|^\s*(?:phi (?:ben em|sao|bao nhieu|the nao|nhu the nao|gi|nhu nao|la)|bao nhieu|sao|the nao|nhu the nao|bao gio|khi nao|em la|ben em|co phai|lam sao|toi co|toi phai|minh phai|co can)\b/;

/**
 * Phân loại câu chủ nhà vừa nhắn so với câu hỏi `question` đang treo.
 * `text` là phần còn lại SAU khi tầng trên đã bóc lời sửa (FR-164).
 */
// Hai khoá cùng "họ": câu trả lời nhận ra khoá này thì vẫn là câu trả lời cho
// khoá kia (không coi là lệch). "Ngang 5" cho câu diện tích có luật riêng ở dưới.
const HO_FACT: string[][] = [
  ["vi_tri", "phuong"],
  ["dien_tich", "dien_tich_dat", "dien_tich_tim_tuong", "tho_cu", "mat_tien"],
  ["do_rong_hem", "do_rong_duong", "duong_vao"],
  ["so_huu", "thoi_han_su_dung", "han_hop_dong_thue"],
  ["hien_trang", "hien_trang_su_dung", "ket_cau", "tang_phu", "han_hop_dong_thue"],
  ["noi_that", "fit_out"],
  // Tin cho thuê hỏi "thuê tối thiểu", khách đáp "hợp đồng 1 năm" (luật đọc ra hạn hợp đồng) → vẫn là câu trả lời.
  ["thoi_han_thue", "han_hop_dong_thue"],
  ["tiem_nang", "muc_dich", "nganh_hang_phu_hop"],
  ["phap_ly", "the_chap", "hoan_cong", "giay_to_hien_co", "du_kien_ra_so", "ban_giao", "dong_so_huu_voi", "dong_y_ban", "nguoi_dung_ten"],
  // FR-229: hỏi "diện tích xây khớp sổ không, đã hoàn công chưa" mà khách đáp về hoàn công → vẫn là câu trả lời.
  ["dien_tich_khop_so", "hoan_cong"],
];
const cungHo = (a: string, b: string) => a === b || HO_FACT.some((h) => h.includes(a) && h.includes(b));
export const cungHoFact = cungHo;

// 15/09/2026 (Zalo thật, Ny'ah Phú Định): chủ nhà vừa trả lời vừa hỏi ngược trong MỘT
// câu — "Nhà 5 tầng, có thang máy thì phải, bạn có biết xung quanh khu này có tiện ích
// gì không", "Được giá, căn tôi sở hữu nhưng chưa vào xem bạn có thông tin thêm về căn
// này không". Không dấu "?", không mở đầu bằng từ để hỏi, nên CAU_HOI_RE không thấy:
// cả câu vào ô kết cấu / ô gấp, còn câu hỏi của chủ nhà thì bot lờ đi và hỏi tiếp —
// chủ dự án: "nó ngu quá". Tách ở ranh MẢNH (dấu phẩy, hoặc trước "bạn có biết / bạn
// có thông tin / cho hỏi / mà bạn…"): mảnh HỎI = có "?" hoặc (có từ để hỏi VÀ kết bằng
// tiểu từ hỏi, ≥ 3 chữ). Mảnh còn lại là câu trả lời. Chỉ dùng khi CÓ CẢ HAI phần —
// câu thuần hỏi ("phí sao em?") và "5 tỷ được không?" vẫn đi luật cũ.
// 23/09/2026 (bắn thật): "bên em lấy phí bao nhiêu vậy? anh có nhà Lê Hồng Phong muốn gửi bán" — câu hỏi đứng TRƯỚC, ngăn
// bằng "?" (không phẩy) nên cả tin là một mảnh và câu hỏi phí bị nuốt. Ranh sau "?" (giữ "?" trong mảnh hỏi).
const RANH_MANH_RE = /[,;\n]|\.\s+(?=\S)|(?<=\?)\s+(?=\S)|\s+(?=(?:mà|nhưng|với lại|còn|ma|nhung|voi lai|con)\s+(?:bạn|em|bên|anh|chị|mình|bot|ban|ben|chi|minh)\b)|\s+(?=(?:bạn|em|bên em|bên mình|ban|ben em|ben minh)\s+(?:có\s+(?:biết|thông tin|nắm|thể)|biết|tư vấn|cho hỏi|co\s+(?:biet|thong tin|nam|the)|biet|tu van|cho hoi)\b)/iu;
const DAU_HOI_RE = /\b(?:co (?:biet|thong tin|the|nam)|biet|thong tin|tu van|cho hoi|hoi|gi|nao|bao nhieu|sao|the nao|nhu the nao|duoc khong|dc khong|bao gio|khi nao|o dau|co phai|la (?:bot|may|nguoi)|hay (?:bot|may|nguoi))\b|\bco\b(?=.*\b(?:khong|ko|k|chua)\b)/;
// 17/09/2026 (Zalo thật): "…bot hay người vậy\tTr" — đuôi rác ≤ 3 ký tự sau tiểu từ hỏi (gõ lỡ) không làm mất câu hỏi.
const DUOI_HOI_RE = /\b(?:khong|ko|k|chua|gi|nao|nhi|nhe|a|vay|ha|the|sao|bao nhieu|dau)(?:\s+(?:em|anh|chi|ban|chau|a|nha|nhe|nhi|vay|ha|ne|ạ))*(?:\s+\S{1,3})?\s*\?*\s*$/;
export function tachCauHoiNguoc(text: string): { traLoi: string; hoi: string | null } {
  const goc = (text ?? "").trim();
  const manh = goc.split(RANH_MANH_RE).map((x) => x.trim()).filter(Boolean);
  if (manh.length < 2) return { traLoi: goc, hoi: null };
  const laHoi = (m: string): boolean => {
    if (/\?/.test(m)) return true;
    const kd = boDau(m).replace(/[?.!]+$/, "").trim();
    return kd.split(/\s+/).length >= 3 && DAU_HOI_RE.test(kd) && DUOI_HOI_RE.test(kd);
  };
  const hoi = manh.filter(laHoi), traLoi = manh.filter((m) => !laHoi(m));
  if (!hoi.length || !traLoi.length) return { traLoi: goc, hoi: null };
  return { traLoi: traLoi.join(", "), hoi: hoi.join(" ") };
}

/**
 * Cả tin là MỘT CÂU HỎI ("bên bạn có cần mình gửi hình không hay sao") và không
 * mang fact nào → không phải dữ liệu để ghi, là câu hỏi ngược cần trả lời.
 * 15/09/2026 (bắn thật A5): bản trước ghi nguyên câu hỏi vào ô "thông tin bổ sung".
 */
export function laCauHoiTron(text: string): boolean {
  const goc = (text ?? "").trim();
  if (!goc || nhanDienFact(goc)) return false;
  if (/\?/.test(goc)) return true;
  const kd = boDau(goc).replace(/[?.!]+$/, "").trim();
  // Không dấu hỏi thì cần thêm CHỦ NGỮ/TỪ HỎI rõ ("bên bạn có…", "bao nhiêu", "thế nào"):
  // "không dính gì" (trả lời quy hoạch) có "gì" ở cuối nhưng không phải câu hỏi.
  // 16/09/2026 (bắn thật mau-co-thue): "à mà cháu là bot hay người vậy" — bot xưng cháu nên khách
  // hỏi "cháu là…"; câu hỏi về bản chất bot (là bot / máy / người thật) luôn là câu hỏi.
  // 20/09/2026 (bắn thật mau-y-A, môi giới gõ không dấu): "phi ben minh sao, co bat ky doc quyen ko"
  // từng vào ô bổ sung — "bên mình / của em" + "sao", "có bắt/tính/lấy … không" cũng là chủ ngữ hỏi.
  const coTuHoi = /\b(?:ban|ben|em|anh|chi|minh|chau)\s+(?:co|biet|tinh|nhan|can|thay|la)\b|\b(?:ben|cua)\s+(?:minh|em|ban|anh|chi|cac ban)\b|\bco\s+(?:bat|tinh|lay|thu|doi|yeu cau)\b|\b(?:phi|hoa hong)\b[^.?!]*\b(?:sao|bao nhieu|the nao|nhieu)\b|\b(?:bao nhieu|the nao|nhu the nao|khi nao|bao gio|o dau|co phai|duoc khong|dc khong|hay sao|ha em|ha chau|khong em|khong chau|khong a|khong ban|la bot|la may|la nguoi|hay nguoi|hay may|hay bot)\b/;
  return kd.split(/\s+/).length >= 3 && DAU_HOI_RE.test(kd) && DUOI_HOI_RE.test(kd) && coTuHoi.test(kd);
}

/**
 * Câu nói LOẠI đường vào — "hxh", "hẻm xe hơi", "hẻm ba gác", "ô tô vô tận nhà", "xe hơi không vào được", "mặt tiền" — là câu
 * trả lời CHẮC cho câu hỏi hẻm, dù không có số mét (25/09/2026, chủ dự án: "hxh nó vẫn ko đọc được, nếu hẻm xe hơi thì hẻm
 * rộng tầm bao nhiêu trở lên cái này nó phải tự nhận biết được"). Loại → cột `access_type` do trigger `boc_thong_so` đọc;
 * hẻm xe hơi nghĩa là từ khoảng 3,5m (trigger dùng đúng ngưỡng đó khi chỉ có số mét) nên không hỏi lại số mét.
 */
export const LOAI_DUONG_VAO_RE = /\b(?:hxh|hxt|hxm|hem (?:xe hoi|oto|o to|xe tai|xe may|ba gac|3 gac|xe 3 banh|xe con|7 cho)|(?:xe hoi|o to|oto|xe tai|xe 4 banh|xe 7 cho)\s+(?:(?:khong|ko|k|kg|chua)\s+)?(?:vao|vo|toi|den|lot|do|dau|quay dau|ra vao)|(?:khong|ko|k|kg|chua)\s+(?:co\s+)?(?:xe hoi|o to|oto)\s+(?:nao\s+)?(?:vao|vo|toi)|(?<!\b(?:cach|gan|ra|sat|toi)\s)(?:mat tien|mat duong|mat pho))\b/;
export const KHONG_BIET_PHUONG = /^\s*(?:(?:da|vang|u|dạ)\s+)?(?:khong|ko|k|hong|chua|cung)\s*(?:co|biet|ro|nho|chac|hieu)?(?:\s+(?:nua|luon|het|a|em|nha|nhe|anh|chi|do|phuong|ten|gi|nao|ro|lam|chac))*\s*[.!?]*\s*$|^\s*(?:quen|khong nho|ko nho)(?:\s+(?:roi|mat|a|em|nha|phuong))*\s*$/;
export function phanLoaiCauTraLoi(question: string, text: string): KetQuaKhop {
  // 11/09/2026: bận / hoãn đứng TRƯỚC mọi luật khác — câu này không mang dữ liệu
  // nào (có số thì `laHoanLai` đã trả false), mà luật phường cũ nhận bất kỳ câu
  // ≥ 3 chữ. Duyệt tin và chấm điểm có đường riêng, không đụng.
  if (question !== "duyet_tin" && question !== "danh_gia" && laHoanLai(text)) {
    const xh = batXungHo(text) ?? tuXungTuCau(text);
    return { loai: "hoan", ...(xh ? { xungHo: xh } : {}) };
  }
  // SRS-5.1zzzb: hỏi có / không, khách "ko có, đường 8m" → mảnh đầu trả lời câu đang hỏi; mảnh sau đi đường ghi kèm.
  // Đứng trước tách hỏi ngược: "không vướng gì, …" có chữ "gì" nhưng là câu ĐÁP, không phải câu hỏi.
  if (tachDapCoKhongDau(question, text)) {
    const xh = batXungHo(text);
    return { loai: "khop", ...(xh ? { xungHo: xh } : {}) };
  }
  // 15/09/2026: vừa trả lời vừa hỏi ngược → phần trả lời đi tiếp các luật dưới, phần
  // hỏi trả về `hoiNguoc` để tầng trên trả lời TRƯỚC câu kế (không nuốt câu hỏi).
  if (question !== "duyet_tin" && question !== "danh_gia") {
    const { traLoi, hoi } = tachCauHoiNguoc(text);
    if (hoi && traLoi && traLoi !== text.trim()) {
      const kqTL = phanLoaiCauTraLoi(question, traLoi);
      return { ...kqTL, hoiNguoc: hoi, dapAn: traLoi };
    }
  }
  // 25/09/2026: đang hỏi hẻm mà khách nói loại đường vào ("hxh", "ô tô vô tận nhà") → khớp, trước mọi luật nhận diện khác
  // ("ô tô vô tận nhà" từng thành tiềm năng vì "o" bỏ dấu giống "ở"; "HXH quay đầu" từng chuyển sang hẻm thông).
  if ((question === "do_rong_hem" || question === "do_rong_duong") && LOAI_DUONG_VAO_RE.test(boDau(text)) && !CAU_HOI_RE.test(boDau(text))) {
    const xh = batXungHo(text);
    return { loai: "khop", ...(xh ? { xungHo: xh } : {}) };
  }
  // 27/09/2026 (chủ dự án test Zalo): hỏi hoàn công, khách vặn lại câu trước "Làm gì có sổ chung" → bị ghi vào ô hoàn công
  // ("không có sổ chung"). Câu nói về LOẠI SỔ mà không nhắc hoàn công / xây dựng và không mở bằng có-không → chưa trả lời,
  // không ghi, hỏi lại.
  if (question === "hoan_cong") {
    const kdHc = boDau(text);
    if (/\b(so chung|so rieng|so hong|so do|shr|shc|dong so huu)\b/.test(kdHc) && !/\b(hoan cong|xay|giay phep|gpxd)\b/.test(kdHc) &&
        !/^\s*(roi|chua|da|co roi|xong)\b/.test(kdHc)) {
      const xh = batXungHo(text);
      return { loai: "ack", ...(xh ? { xungHo: xh } : {}) };
    }
  }
  // 27/09/2026 (test Zalo): hỏi phường, khách "Ở cầu kho em ơi" — luật tiềm năng đọc "ở" là "để ở". Đang hỏi phường / địa chỉ
  // mà câu mở bằng "ở …" (không phải "để ở", "ở gia đình") là câu trả lời VỊ TRÍ.
  // 30/09/2026 (bắn thật lx-ban-f): hỏi địa chỉ, khách "o q10" — chỉ có QUẬN/PHƯỜNG, chưa có đường / hẻm / số nhà. Quận vẫn
  // được ghi ở đường bóc quận; câu địa chỉ KHÔNG coi là đã trả lời (vi_tri "o q10" là rác, bot thôi hỏi tên đường).
  if (question === "vi_tri" && laChiDonViHanhChinh(text)) return { loai: "lech" };
  if ((question === "phuong" || question === "vi_tri") && /^\s*(?:nha\s+|can\s+)?o\s+(?!(?:gia dinh|duoc|hoac|cho thue|va)\b)\S/.test(boDau(text)) &&
      !CAU_HOI_RE.test(boDau(text))) {
    const xh = batXungHo(text);
    return { loai: "khop", ...(xh ? { xungHo: xh } : {}) };
  }
  // FR-229: hỏi "diện tích xây khớp sổ không, đã hoàn công chưa" mà khách đáp "hoàn công đủ rồi" — luật nhận diện xếp chữ
  // "hoàn công" vào câu sổ (phap_ly) và coi là lệch.
  if (question === "dien_tich_khop_so" && /\b(hoan cong|khop|dung so|lech|xay lo|xay du)\b/.test(boDau(text)) && !CAU_HOI_RE.test(boDau(text))) {
    const xh = batXungHo(text);
    return { loai: "khop", ...(xh ? { xungHo: xh } : {}) };
  }
  // 09/09/2026 tối (chạy 12 kịch bản trên production): câu trả lời bị ghi LỆCH
  // MỘT Ô hàng loạt — "Hẻm 4m" vào diện tích, "Đúc 5 tầng" vào số phòng ngủ,
  // "lên thổ cư 300m2" vào địa chỉ, "cọc 2 tháng" vào diện tích… vì các nhánh
  // số/từ khoá ở dưới chỉ hỏi "có số không / có từ khoá không", không hỏi "câu
  // này đang nói về THỨ GÌ". Nay hỏi `nhanDienFact` TRƯỚC: nhận ra rõ một fact
  // KHÁC họ với câu đang hỏi thì là lệch + chuyển sang, câu hỏi gốc treo lại.
  {
    const kd0 = boDau(text.trim());
    const chu0 = conChu(kd0.replace(XUNG_HO_RE, " "));
    if (question !== "duyet_tin" && question !== "danh_gia" && question !== "hinh_anh" &&
        question !== "loai_bds" && chu0.length >= 2 && !CAU_HOI_RE.test(kd0)) {
      const nd = nhanDienFact(text);
      // Câu có NHIỀU ý mà một ý chính là câu đang hỏi ("hẻm 4m, mà thôi anh cần bán
      // gấp" khi đang hỏi hẻm) → là câu trả lời KHỚP, các ý còn lại ghi kèm ở tầng trên.
      const nhieuY = nhanDienNhieuFact(text);
      const coCauDangHoi = nd && nd.question !== question && nhieuY.some((f) => cungHo(f.question, question));
      // FR-223 (bắn thật 24/09, rn-test-h): đang hỏi TIỀN THUÊ / cọc / phí mà khách trả lời một số tiền ("150 triệu một
      // tháng em") → luật đọc thành GIÁ BÁN và xếp lệch (AI tắt thì ghi đè giá bán thành 150 triệu). Hỏi tiền mà đáp tiền là khớp.
      const tienChoCauTien = nd?.question === "gia" && question !== "gia" && TIEN_OK.has(question);
      if (nd && !coCauDangHoi && !tienChoCauTien && nd.question !== "bo_sung" && !cungHo(nd.question, question) &&
          !(HOI_CO_KHONG.has(question) && /^\s*(co|khong|ko|k|chua|roi|da)\b/.test(kd0))) {
        const xh = batXungHo(text);
        return { loai: "lech", chuyenSang: nd, ...(xh ? { xungHo: xh } : {}) };
      }
      // 15/09/2026 (bắn thật A3): "3 phòng ngủ em. nhà đang cho thuê 25 triệu/tháng" khi đang
      // hỏi số phòng ngủ — có TIỀN trong câu nên luật "tiền ở câu không phải tiền" bên dưới
      // xếp LỆCH, cả câu vào "bổ sung" rồi hỏi lại phòng ngủ dù cột đã có 3. Câu nhiều ý mà
      // một ý là câu đang hỏi thì KHỚP; `catDapAn` lấy mảnh đó, ý còn lại ghi kèm ở tầng trên.
      if (question !== "phuong" && question !== "vi_tri" && nhieuY.length >= 2 && nhieuY.some((f) => cungHo(f.question, question))) {
        const xh = batXungHo(text);
        return { loai: "khop", ...(xh ? { xungHo: xh } : {}) };
      }
    }
  }
  const kq = phanLoaiTho(question, text);
  // FR-177 e: câu LỆCH mà nhận ra chủ nhà đang nói fact nào thì trỏ sang đó.
  if (kq.loai === "lech" && !kq.chuyenSang) {
    const nd = nhanDienFact(text);
    if (nd && nd.question !== question &&
        !(nd.question === "dien_tich" && /^dien_tich/.test(question))) {
      return { ...kq, chuyenSang: nd };
    }
  }
  return kq;
}

function phanLoaiTho(question: string, text: string): KetQuaKhop {
  const kd = boDau(text.trim());
  const xungHo = batXungHo(text);
  const chu = conChu(kd.replace(XUNG_HO_RE, " "));

  // FR-229: "sổ đứng tên ai" — câu trả lời hay chỉ là một đại từ / quan hệ ("anh", "mẹ em", "vợ chồng tôi"), mà đại từ
  // trần bị bóc như lời dặn xưng hô ("anh" → xung_ho) rồi hỏi lại. Đứng TRƯỚC luật xưng hô.
  if (question === "nguoi_dung_ten" && !laCauHoiTron(text) &&
      /\b(toi|minh|anh|chi|em|chu|co|bac|ong|ba|me|bo|cha|vo|chong|con|chau|chinh chu|dung ten|ten)\b/.test(kd)) {
    return { loai: "khop", ...(xungHo ? { xungHo } : {}) };
  }
  // Dặn xưng hô mà ngoài ra không còn nội dung → nhớ, hỏi lại.
  if (xungHo && chu.length < 3) return { loai: "xung_ho", xungHo };
  // Câu hỏi có/không (20260909i): "có", "không", "rồi", "chưa", "cụt", "thông"… là đáp án thật.
  // 15/09/2026 (bắn thật E4): "bên bạn có cần mình gửi hình không hay sao" khi đang hỏi
  // GẤP — chữ "không" làm cả câu hỏi thành đáp án. Câu hỏi trọn (`laCauHoiTron`) đi tiếp
  // xuống nhánh hỏi ngược bên dưới.
  if (HOI_CO_KHONG.has(question) && !laCauHoiTron(text) &&
      /^\s*(co|khong|ko|k|chua|roi|da|cut|thong|ngap|kho|cam tay|the chap|ngan hang|dang o|cho thue|trong|lau dai|50 nam|tl|thuong luong|cung duoc|de o)\b/.test(kd)) {
    return { loai: "khop", ...(xungHo ? { xungHo } : {}) };
  }
  // FR-229: "khớp", "đúng sổ", "lệch chút", "sạch" là đáp án đủ cho hai câu có/không mới.
  if ((question === "dien_tich_khop_so" || question === "tranh_chap") && !laCauHoiTron(text) &&
      /^\s*(khop|dung|lech|sach|du|thieu|lo|vuot|xay lo|xay du)\b/.test(kd)) {
    return { loai: "khop", ...(xungHo ? { xungHo } : {}) };
  }
  if (chu.length < 2 && !CO_SO.test(kd)) return { loai: "ack" };
  // 16/09/2026 (Zalo thật 13:36): "Hello" khi đang chờ ảnh → ghi "thông tin bổ sung: Hello".
  // Lời chào suông là ack, không phải dữ liệu.
  if (CHAO_SUONG_RE.test(kd)) return { loai: "ack" };

  // Chủ nhà hỏi ngược. Có số kèm dấu hỏi ("5 tỷ được không?") vẫn là câu hỏi
  // — bot phải trả lời chứ không lặng lẽ ghi "5 tỷ được không?" làm đáp án.
  if (CAU_HOI_RE.test(kd) && !(HOI_SO.has(question) && /^\s*[\d.,]+\s*(m2|m|ty|ti|tr|trieu|tang|lau|tam|pn)?\s*\?\s*$/.test(kd))) {
    return { loai: "hoi", ...(xungHo ? { xungHo } : {}) };
  }
  // 15/09/2026 (bắn thật E4): câu hỏi trọn không có dấu "?" ("bên bạn có cần mình gửi
  // hình không hay sao") — CAU_HOI_RE bỏ lỡ, rồi từ khoá "không" khớp ô gấp.
  if (laCauHoiTron(text)) return { loai: "hoi", ...(xungHo ? { xungHo } : {}) };

  const ketQua = (loai: LoaiCau, them: Partial<KetQuaKhop> = {}): KetQuaKhop =>
    ({ loai, ...(xungHo ? { xungHo } : {}), ...them });

  // Chấm điểm chăm sóc (09/09/2026): câu chữ tự do — "8 điểm", "giống người
  // thật", "ổn em", "hơi lâu" đều là câu trả lời. Chỉ ack/hỏi ngược ở trên mới
  // không tính. Không bao giờ chuyển sang fact khác.
  if (question === "danh_gia") return ketQua("khop");

  if (/^dien_tich/.test(question) || question === "tho_cu") {
    // "Ngang 5" / "rộng 4m" là MẶT TIỀN, không phải diện tích. Ghi đúng chỗ
    // và vẫn treo câu diện tích. "5x16", "5 x 16m", "80m2", "80" → khớp.
    const ngang = /\b(?:ngang|rong|mat tien|mt)\s*(?:la\s*)?(\d+(?:[.,]\d+)?)\s*(?:m|met)?\b/.exec(kd);
    const coDien = /\d+(?:[.,]\d+)?\s*(?:m2|m²|met vuong|mv)\b|\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?/.test(kd);
    // "ngang 5 dài 16" / "sâu 16 ngang 5": có cả hai chiều là đủ diện tích.
    if (/\b(ngang|rong|mat tien|mt)\b[^a-z]*\d[^a-z]*\b(dai|sau)\b\s*(?:la\s*)?\d/.test(kd) ||
        /\b(dai|sau)\b[^a-z]*\d[^a-z]*\b(ngang|rong)\b\s*(?:la\s*)?\d/.test(kd)) {
      return ketQua("khop");
    }
    if (ngang && !coDien && !/\b(dai|sau)\b/.test(kd)) {
      return ketQua("lech", { chuyenSang: { question: "mat_tien", answer: `${ngang[1]}m` } });
    }
    // 15/09/2026 (Zalo thật): "Căn số 14 ở Ny'ah Phú Định" trả lời câu diện tích →
    // "14" thành 14m² trong cột. Số đứng sau căn số / số nhà / lô / hẻm là ĐỊNH DANH,
    // không phải diện tích: coi là vị trí, câu diện tích vẫn treo.
    if (!coDien && /\b(?:can so|so nha|so|lo|hem|can)\s*\d/.test(kd)) {
      return ketQua("lech", { chuyenSang: { question: "vi_tri", answer: bocViTriRao(text) ?? text.trim() } });
    }
    if (coDien || (CO_SO.test(kd) && !/\b(ngang|rong|dai|sau|tang|lau|tam|phong|pn|ty|ti|trieu|tr)\b/.test(kd))) {
      return ketQua("khop");
    }
    return ketQua("lech");
  }

  // Ảnh (FR-177 a): ảnh thật đi đường ghiAnhKem, chữ chỉ "khớp" khi chủ nói
  // KHÔNG có ảnh; "chiều gửi" là lời hứa (PROMISE_RE tầng trên đặt nhắc).
  if (question === "hinh_anh") {
    return ketQua(/\b(khong co|ko co|k co|chua co|chua chup|khong chup|ko chup)\b/.test(kd) ? "khop" : "lech");
  }

  if (HOI_SO.has(question)) {
    // 16/09/2026 (bắn thật mau-chu-q8): "phường 16 quận 8" khi đang hỏi GIÁ — lời sửa FR-164 bóc
    // "phường 16" đi, còn "quận 8" rơi vào ô giá. Số của quận/phường không phải đáp án số;
    // câu chỉ còn quận/phường thì là ack (quận đã có `capNhatQuan` lo), câu hỏi vẫn treo.
    const kdKhongDiaGioi = kd.replace(/\b(?:quan|q|phuong|p)\s*\.?\s*\d{1,2}\b/g, " ");
    if (kdKhongDiaGioi !== kd && !CO_SO.test(kdKhongDiaGioi) && conChu(kdKhongDiaGioi.replace(/\b(?:quan|phuong)\b/g, "")).length < 2) {
      return { loai: "ack" };
    }
    // 16/09/2026 (Zalo thật): "Căn số 14 ở Ny'ah Phú Định" khi đang hỏi GIÁ / kết cấu —
    // số sau "căn số / số nhà / lô" là định danh, không phải đáp án số. Cùng luật với
    // nhánh diện tích ở trên: coi là vị trí, câu đang hỏi vẫn treo.
    if (/\b(?:can so|so nha|lo so|can|lo)\s*\d+[a-z]?\b/.test(kd) && (kd.match(/\d+/g) ?? []).length === 1 &&
        !/\d+[a-z]?\s*(?:m2|m²|m\b|met|ty|ti|toi|trieu|tr\b|tang|lau|tam|pn|phong|wc|nam|thang|%)/.test(kd)) {
      return ketQua("lech", { chuyenSang: { question: "vi_tri", answer: bocViTriRao(text) ?? text.trim() } });
    }
    if (CO_SO.test(kd) || SO_CHU.test(kd)) {
      // Số đi kèm đơn vị của trường KHÁC thì lệch: hỏi năm xây mà nhận "5 tỷ".
      // Trường TIỀN (giá, doanh thu, phí, cọc, điện nước) thì đơn vị tiền là đúng.
      if (!TIEN_OK.has(question) && CO_TIEN_KD.test(kd)) return ketQua("lech");
      // "80m2": không có ranh giới từ giữa "80" và "m2", nên đừng dùng \b trước m2.
      if (question === "gia" && /(m2|m²|met vuong|\btang\b|\blau\b|\btam\b|\bngang\b|\brong\b|\bdai\b|\bsau\b|\bhem\b|\bmat tien\b)/.test(kd) && !/\b(ty|ti|toi|trieu|tr|k)\b/.test(kd)) return ketQua("lech");
      return ketQua("khop");
    }
    // "chưa rõ / không nhớ" là câu trả lời hợp lệ cho năm xây, phí quản lý…
    if (/\b(khong nho|ko nho|chua ro|khong ro|ko ro|khong biet|ko biet|chua biet|khong co|ko co|mien phi)\b/.test(kd)) return ketQua("khop");
    return ketQua("lech");
  }

  // Phường: "5", "phường 5", "p5", "Nguyễn Cư Trinh", "xã Phong Phú" đều nhận; "ừ" thì không.
  // 11/09/2026 (42 ca): "chu.length >= 3" một mình nhận CẢ câu than phiền làm tên
  // phường. Tên phường bằng chữ ngắn (≤ 4 tiếng) và không có từ nói chuyện.
  if (question === "phuong") {
    // 25/09/2026 (bắn thật lx-29): hỏi "phường nào, quận nào" → "quận 5 em" thành PHƯỜNG "quận 5". Chỉ nói quận thì chưa
    // trả lời phường — quận vẫn được ghi (`capNhatQuan`), câu phường hỏi lại.
    if (laChiQuan(text)) return ketQua("lech");
    // 01/10/2026 (chủ dự án test Zalo): hỏi phường, khách "ko có" → ghi PHƯỜNG "Không Có" vào tin. "Không có / không biết /
    // không rõ / quên…" (không kèm tên) không phải tên phường.
    if (KHONG_BIET_PHUONG.test(kd)) return ketQua("lech");
    const soTieng = kd.split(/\s+/).filter(Boolean).length;
    // 01/10/2026 (bắn thật lx-tam-01): đang xác nhận phường, khách đáp "có lửng nha em" → PHƯỜNG "có lửng". Cụm có chữ
    // kết cấu / pháp lý / đường vào / gấp không phải tên phường (chữ "tam", "tang" thì có trong tên phường thật — không chặn).
    const chuNha = /\b(lung|gac|lau|tret|hem|hxh|gap|phong ngu|pn|wc|san thuong|noi that|so hong|so do|so rieng|so chung|shr|mat tien)\b/.test(kd);
    const tenChu = chu.length >= 3 && soTieng <= 4 && !TU_NOI_CHUYEN.test(text) && !chuNha;
    // Chữ "phường/xã" phải đi với một cái TÊN: "không biết phường nào" không phải tên phường.
    const coNhan = /\bp\s*\d|\b(?:phuong|xa|thi tran)\s+(?!nao\b|may\b|gi\b|do\b|nay\b)[a-z]/.test(kd);
    // 17/09/2026 (Zalo thật): "ngang 5m còn dọc 18m" → cột PHƯỜNG. Số chỉ là phường khi là
    // số phường TRẦN (1–2 chữ số, có thể kèm "phường/p", "quận N"), không kèm đơn vị đo.
    const coPhuongSo = /\b(?:phuong|p)\s*\.?\s*\d{1,2}\b/.test(kd);
    const soTran = /^\s*\d{1,2}\s*(?:,?\s*(?:quan|q\.?)\s*\d{1,2})?\s*(?:nha|nhe|a|em|chau)?\s*$/.test(kd);
    const coDonVi = /\d\s*(?:m2|m²|m\b|met|ty|ti|trieu|tr\b|x\s*\d|lau|tang|tam|pn)/.test(kd);
    return ketQua(coPhuongSo || soTran || ((coNhan || tenChu) && !coDonVi) ? "khop" : "lech");
  }
  // Vị trí: cần dấu hiệu địa chỉ thật (đường / hẻm / số nhà / mốc), KHÔNG chỉ vì
  // có con số — "lên thổ cư 300m2", "thời hạn đến 2060" từng đi vào địa chỉ.
  if (question === "vi_tri") {
    // 05/10/2026 (SRS-5.1zy): mảnh "4 WC" / "3 phòng" của tin dạng danh sách — số + đơn vị đếm không phải số nhà + tên đường.
    if (/^\s*\d+(?:[.,]\d+)?\s*(?:wc|pn|phong|toilet|tang|lau|tam|m2|m|ty|ti|trieu|tr|nam|thang)\b/.test(kd)) return ketQua("lech");
    const coDiaChi = /\b(duong|hem|hxh|so nha|dia chi|ngo|kdc|khu|toa|block|thap|chung cu|cu xa|du an|kp|ap|xa|phuong|quan|gan|doi dien|nga|cho|truong|benh vien|cong vien|lo|mat tien|mt|pho)\b/.test(kd) ||
      /\b(?:can|lo|nen|shop)\s*(?:so\s*)?\d+[a-z]?(?:[.\-\/]\d+)?\s+(?:o|tai|trong|thuoc|cua)\s+[a-z]{2,}/.test(kd) ||
      /^\s*\d+[a-z]?(?:\/\d+[a-z]?)*\s+[a-z]{2,}/.test(kd);
    // "đường bê tông 5m xe tải vào được", "đường 12m" là ĐƯỜNG VÀO, không phải địa chỉ.
    const laMoTaDuong = /\b(be tong|nhua|dat do|duong dat|xe tai|container|\d+\s*(?:m|met)\b)/.test(kd) && !/\b(so nha|hem \d|so \d|\/)/.test(kd);
    // 27/09/2026 (test Zalo, đất Cần Đước): hỏi địa chỉ, khách đáp tên đường trơn "xoài đôi" → lệch, bot hỏi lại. Câu 2–4 chữ,
    // không số, toàn chữ không phải hư từ / lời đáp chung → là TÊN (đường, ấp, khu); từ điển `duong` ở tầng trên đối chiếu tiếp.
    const w = kd.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).filter((x) => !/^(?:nha|nhe|a|em|e|oi|do|day|ne)$/.test(x));
    const HU_TU = /^(?:da|vang|u|uh|ok|oke|khong|ko|chua|roi|co|biet|sao|gi|nao|dau|nha|nhe|em|anh|chi|a|thi|la|ma|di|luon|the|vay|hoi|nua|chac|hinh|nhu|cung|ban|mua|thue|gia|nha|dat|can|tim|hay|qua|dep|tot|tuyet|voi|vui|cam|on|thoi|xong|duoc|ha|nhieu|lam|het|rat|oi)$/;
    const tenTron = w.length >= 2 && w.length <= 4 && !/\d/.test(kd) && !CAU_HOI_RE.test(kd) && w.every((x) => x.length >= 2 && !HU_TU.test(x));
    return ketQua((coDiaChi || tenTron) && !laMoTaDuong && !/\b(m2|m²|met vuong|tho cu|thoi han|nam \d{4}|ty|trieu)\b/.test(kd) ? "khop" : "lech");
  }

  const tk = TU_KHOA[question];
  if (tk) return ketQua(tk.test(kd) ? "khop" : "lech");

  // Câu hỏi chữ tự do (hiện trạng, nội thất, ngành hàng, sân vườn, giờ giấc…):
  // có nội dung là nhận.
  return ketQua(chu.length >= 3 ? "khop" : "lech");
}

/**
 * FR-188 b: câu MỀM — hỏi trong chat ĐÚNG MỘT lần. Chủ nhà trả lời thứ khác thì
 * thôi, không hỏi lại lần hai (chủ dự án 10/09). Vòng hỏi bù (ask-seller) vẫn có
 * thể nhắc lại hôm sau, đó là một lượt/ngày gom 2–3 câu nên không làm khách mệt.
 * Câu CỨNG (giá, địa chỉ, diện tích, pháp lý…) giữ luật né-2-lần.
 */
export const HOI_MOT_LAN = new Set(["gap", "ly_do_ban", "thuong_luong", "tiem_nang", "muc_dich"]);

/** Nhãn tiếng Việt ngắn để hỏi lại, KHÔNG lặp nguyên văn câu hỏi trước. */
export const NHAN_HOI_LAI: Record<string, string> = {
  phap_ly: "pháp lý giấy tờ nhà mình như thế nào (hỏi chung một câu \"Pháp lý nhà mình như thế nào\", không liệt kê sổ riêng / chung)",
  hoan_cong: "sổ nhà mình đã hoàn công chưa",
  huong: "nhà mình quay hướng nào",
  dien_tich_dat: "tổng diện tích đất bao nhiêu m2, hoặc ngang bao nhiêu dài bao nhiêu",
  dien_tich: "diện tích bao nhiêu m2",
  ket_cau: "nhà mấy tầng (trệt, lửng, mấy lầu)", // SRS-5.1zzzm: một ý, phòng ngủ là câu riêng
  quy_hoach: "nhà có dính quy hoạch hay lộ giới gì không",
  // FR-229
  nguoi_dung_ten: "sổ do chính mình hay người nhà đứng tên",
  the_chap: "sổ nhà mình đang cầm tay hay đang thế chấp ngân hàng",
  tranh_chap: "nhà có đang tranh chấp gì không",
  dien_tich_khop_so: "diện tích xây thực tế có khớp với sổ không",
  nam_xay: "nhà xây năm nào",
  gia: "giá mình muốn bán bao nhiêu",
  phuong: "nhà mình thuộc phường mấy",
  vi_tri: "nhà mình ở đường nào, số mấy hay hẻm nào",
  danh_gia: "mình chấm cách em chăm sóc mấy điểm, có góp ý gì cho em",
  do_rong_hem: "hẻm trước nhà rộng mấy mét, xe hơi vào được không",
  hinh_anh: "mình gửi giúp em vài tấm ảnh sổ, mặt tiền nhà và hẻm",
  duyet_tin: "bản nháp tin như vậy đã được chưa, hay mình muốn sửa chỗ nào",
  // FR-186
  tang: "căn hộ mình ở tầng mấy",
  noi_that: "bàn giao nhà trống hay để lại nội thất gì",
  ha_tang: "lô đất có vướng cột điện, hố ga hay đường đâm gì không",
  xay_dung: "đất được xây tự do hay phải xây theo mẫu chủ đầu tư",
  khu_compound: "nhà nằm trong khu biệt lập có bảo vệ hay khu dân cư mở",
  tien_coc: "mình lấy cọc mấy tháng",
  truot_gia: "giá thuê tăng mấy phần trăm mỗi năm",
  thoi_han_thue: "mình muốn cho thuê tối thiểu bao lâu",
  tiem_nang: "nhà mình hợp để ở hay kinh doanh ngành gì",
  ngung_rao_can_nao: "mình muốn ngưng rao căn nào, nhắn số thứ tự hoặc địa chỉ giúp em",
  xac_nhan_ngung_hang_loat: "mình chắc ngưng rao mấy căn em vừa liệt kê chưa, nhắn ừ hoặc thôi giúp em",
};

// ── FR-177 e: chủ nhà đang nói FACT NÀO? ─────────────────────────────────────
// Chỉ nhận khi câu có NHÃN hoặc ĐƠN VỊ rõ ("ngang 5", "80m2", "5 tỷ", "hẻm 4m",
// "3 lầu", "2 phòng ngủ", "sổ hồng", "hướng đông", "phường 5", "xây 2010").
// Một con số trần ("16m nha") thì KHÔNG đoán — về `bo_sung`, người đọc sau.
// Đáp án là chuỗi ĐÃ BỎ DẤU cho các trường số (parse_vnd/boc_thong_so phía DB
// đọc được "ty"/"trieu"), còn trường chữ (pháp lý, hướng, quy hoạch, nội thất)
// giữ nguyên văn để tầng DB bóc theo từ khoá có dấu.
export type NhanDien = { question: string; answer: string };
const SO = "(\\d+(?:[.,]\\d+)?)";
// Bỏ dấu mà GIỮ ĐỘ DÀI từng ký tự — chỉ số khớp trên bản này cắt được đúng đoạn
// trong câu gốc ("18 tỷ" thay vì "18 ty" — bản 09/09 tối ghi giá thành "18 ty").
const boDauGiuDoDai = (s: string): string =>
  Array.from(s, (c) => {
    if (c === "đ" || c === "Đ") return "d";
    const b = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return (b.length === 1 ? b : c).toLowerCase();
  }).join("");
// Một câu chủ nhà nói có thể mang NHIỀU fact ("Đường 12m, hướng Bắc"; "3 tầng,
// 4 phòng ngủ"): tách theo dấu phẩy / chấm phẩy / "và", nhận từng mảnh, bỏ trùng.
// Fact PHỤ hay đi kèm trong cùng một câu mà không có dấu phẩy ("2 lầu 3 phòng",
// "3 tầng 4 phòng ngủ 2 wc", "ngang 5 dài 20"): bắt thêm trên cả câu.
// Diện tích SÀN / sử dụng / xây dựng (16/09/2026): "dtsd 120m2", "diện tích sàn 240m2";
// "tổng diện tích 240m2" / "diện tích tổng 240m2" chỉ là sàn khi câu có tầng/tấm/lầu
// (lookbehind dài — V8/Deno hỗ trợ) và không phải "tổng diện tích đất".
const DIEN_TICH_SAN_RE = new RegExp(
  // SRS-5.1zzzzzr (13/10/2026): "Dtsd: 42,8m" — sau chữ sàn / sử dụng, đơn vị "m" trần vẫn là m² (không ai đo sàn bằng mét dài).
  `(?:(?:${TRUOC_LA_SAN.source})|(?<=\\b(?:tam|tang|lau|tret)\\b.*)\\b(?:tong\\s+(?:dien tich|dt)|(?:dien tich|dt)\\s+tong)(?!\\s+dat\\b))\\s*:?\\s*(?:la\\s*|khoang\\s*|tam\\s*)?(\\d{1,5}(?:[.,]\\d+)?)\\s*(?:m2|m²|met vuong|mv|m(?!\\s*x\\s*\\d))\\b`,
);
// 22/09/2026 (bộ đo giọng B11): "5 tỷ 60m2" / "12 tỷ 80m2" — số đứng sau đơn vị tiền chỉ là
// phần LẺ của giá ("5 tỷ 6") khi nó KHÔNG mang đơn vị của thứ khác (m2, x, pn, lầu, tầng…) và
// không phải một số dài hơn (không cắt "60" ra "6"). Dùng chung cho ba chỗ đọc giá dưới đây.
const KHONG_PHAI_LE_GIA = "(?![\\d.,]*\\d)(?!\\s*(?:m2|m\\b|x\\s*\\d|pn\\b|phong|lau|tang|tam|wc|met|nam\\b|thang))";
const FACT_PHU: Array<[string, RegExp, (m: RegExpExecArray) => string]> = [
  // "cần bán gấp 5 tỷ" → câu chính là gấp, giá vẫn phải ghi.
  ["gia", new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(${TIEN_KD})(?![a-z])(?:\\s*(\\d{1,3}(?:[.,]\\d+)?)${KHONG_PHAI_LE_GIA})?(?:\\s*(ruoi))?`), (m) => `${m[1]} ${m[2] === "toi" ? "tỏi" : m[2] === "ty" || m[2] === "ti" ? "tỷ" : "triệu"}${m[3] ? ` ${m[3]}` : ""}${m[4] ? " rưỡi" : ""}`],
  // 24/09/2026 (bắn 10 tin): "toà nhà CHDV 20 phòng" — phòng cho thuê, không phải phòng ngủ.
  // 29/09/2026 (kịch bản K2): "2pn2wc" gõ dính — biên từ `\b` giữa "n" và "2" không có, nên cả phòng ngủ lẫn WC rơi. Số đứng
  // sau chữ cái ("pn2wc") và đơn vị đứng trước chữ số vẫn tính.
  // 30/09/2026: "1 phòng ngủ ngay tầng trệt" là phòng ngủ theo tầng, không phải tổng số (soPhongNguTheoTang).
  ["so_phong_ngu", /(?<!\b(?:chdv|dich vu|toa nha|nha tro|day tro|phong tro)\b[^,.;]{0,12})(?<![\d.,])(\d{1,2})(?!\s*(?:phong ngu|pn)\s+(?:(?:(?:o|ngay|nam|duoi|tren|tai)\s+){1,2}(?:tang|tret|lau)|(?:tang\s+)?tret)\b)\s*(?:phong ngu|pn|phong)(?![a-z])(?!\s*(?:tro|cho thue|khach|tam|dich vu|bep|wc))/, (m) => m[1]],
  ["so_phong", /\b(?:chdv|can ho dich vu|toa nha|nha tro|day tro)\b[^,.;]{0,12}?\b(\d{1,3})\s*phong\b(?!\s*(?:ngu|wc|tam|ve sinh))/, (m) => m[1]],
  ["so_wc", /(?:\b|(?<=[a-z]))(\d{1,2})\s*(?:wc|toilet|ve sinh)(?![a-z])/, (m) => m[1]],
  // 29/09/2026 (kịch bản L1): căn hộ "block V3 tầng 12 76m2" — câu rao một mảnh, luật cả câu trả phí quản lý nên tầng rơi. Tầng
  // CĂN NẰM chỉ tính khi câu nói căn hộ / chung cư (nhà phố "tầng 1 cho thuê" là tầng của nhà).
  ["tang", /(?<=\b(?:can ho|chung cu|cc|officetel|penthouse)\b.*)\btang\s+(\d{1,2})\b(?!\s*(?:lau|tret|lung|tam|ham))/, (m) => m[1]],
  ["huong", /\bhuong\s*((?:dong|tay|nam|bac)(?:\s*(?:dong|tay|nam|bac))?)\b/, (m) => `hướng ${m[1]}`],
  // 13/09/2026: "ngang 5 dài 20" giữ CẢ hai chiều — đáp án "5m" làm mất chiều dài
  // (SQL `boc_thong_so` đọc được "ngang 5m dài 20m" ra frontage + length).
  // 16/09/2026: "ngang 5m CÒN DỌC 16m" — "dọc" là dài, chữ "còn" chen giữa.
  ["mat_tien", /(?<!cach\s)(?<!cach\s\s)\b(?:ngang|mat tien|mt)\s*(?:la\s*)?(\d+(?:[.,]\d+)?)\s*(?:m|met)?\b(?:\s*,?\s*(?:con\s+|va\s+)?(?:x|dai|sau|doc)\s*(?:la\s*)?(\d+(?:[.,]\d+)?)\s*(?:m|met)?\b)?/,
    (m) => m[2] ? `ngang ${m[1]}m dài ${m[2]}m` : `${m[1]}m`],
  // 22/09/2026 (kịch bản D): "nở hậu 4m5" — số dính "m" rồi phần lẻ, như "hẻm 3m5".
  ["no_hau", /\bno hau\s*(?:la\s*|hon\s*|khoang\s*)?(\d+(?:[.,]\d+)?)\s*(?:m(\d)|m|met)?(?![a-z0-9])/, (m) => `${m[1].replace(",", ".")}${m[2] ? `.${m[2]}` : ""}m`],
  // Câu rao dài (FR-177 n): các ý đời thường đi kèm không có dấu phẩy.
  ["cach_mat_tien", /\bcach\s*(?:mat tien|duong lon|duong chinh|mt)\s*(?:khoang|tam)?\s*(\d+(?:[.,]\d+)?)\s*(?:m|met)?\b/, (m) => `${m[1]}m`],
  ["hem_thong", /\bhem\s*(thong|cut)\b/, (m) => `hẻm ${m[1] === "cut" ? "cụt" : "thông"}`],
  ["ngap_nuoc", /\b((?:khong|ko|k)\s*(?:bi\s*)?ngap|ngap nuoc|hay ngap|bi ngap)\b/, (m) => /khong|ko|k\s/.test(m[1]) ? "không ngập" : "có ngập"],
  ["ly_do_ban", /\b(dinh cu|ke tien|can tien|doi nha|chuyen cho|di nuoc ngoai|chia tai san|tra no|ve que|doi cong tac|mua cho khac)\b/, (m) => m[1]],
  // 13/09/2026: "tầng 15 view sông" — mảnh đó ra `tang`, view rơi mất. Cắt từ chữ gốc.
  ["view", /\bview\s+[a-z0-9]+(?:\s+(?:song|ho|bien|thanh pho|cong vien|kenh|landmark|q1|quan 1|\d+))?/, (m) => m[0]],
  ["nam_xay", /\b(?:xay|hoan cong|xd)\s*(?:tu\s*|moi\s*|hoi\s*)?(?:nam\s*)?((?:19|20)\d{2})\b/, (m) => m[1]],
  ["nam_xay", /\b(?:xay|hoan cong|xd)\s*(?:xong\s*|moi\s*)?(?:tu\s*|hoi\s*|vao\s*|cuoi\s*|dau\s*)?(?:nam nay|nam ngoai|nam roi|nam truoc|nam kia)\b/, (m) => namXayTuongDoi(m[0]) ?? ""],
  ["thuong_luong", /\b(con thuong luong|co thuong luong|thuong luong duoc|\btl\b|fix|gia cung|khong bot)\b/, (m) => m[1]],
  // 16/09/2026 (Zalo thật): "nhà trong hẻm 2 xẹc nhưng hẻm rộng 5m nhà 4 tấm diện tích tổng
  // 240m2" — một mảnh, câu chính là hẻm; "4 tấm" và sàn 240m2 rơi mất.
  ["ket_cau", /(?<!\b(?:toa|thap|block|xay|cao|toi da|xay toi da|tang)\s*)\b((?:\d{1,2}|mot|hai|ba|bon|nam|sau)\s*(?:tam|tang|lau)(?:\s*(?:lung|st|san thuong))?|tret\s*(?:\+|va)?\s*\d\s*(?:lau|lung))\b(?!\s*(?:cao|toi da))/, (m) => m[1]],
  ["dien_tich_san", DIEN_TICH_SAN_RE, (m) => `${m[1]}m2`],
];
// Nhiều căn trong MỘT tin ("căn A5 8x20 giá 18 tỷ, căn A7 8x20 giá 18 tỷ 5, căn B2 góc
// 10x20 giá 22 tỷ") — đại diện chủ đầu tư / môi giới rao theo lô (chân dung 3, 10/09).
// 11/09/2026 (42 ca): "anh có 2 căn: 1 căn q5 50m2 6 tỷ, 1 căn q11 40m2 4 tỷ" —
// "q5" đứng sau chữ "căn" là QUẬN, không phải mã căn; bản trước ghi unit_code
// "Q5" và quận mặc định. Nay tách `quan`, và giữ diện tích m² nếu có.
// 15/09/2026 (bắn thử 07:19 UTC): "em có 2 căn: căn 1 hẻm 3m nguyễn trãi q5 4x12 giá 5 tỷ,
// căn 2 mặt tiền trần phú q5 4x20 giá 18 tỷ" — "căn 1 / căn 2 / căn thứ 2" là SỐ THỨ TỰ,
// không phải mã căn, bản trước không nhận → chỉ mở căn 1, còn câu nối "còn căn 2 …" bị
// hiểu là SỬA căn 1 (căn 1 mang luôn 4x20 và 18 tỷ). Nay nhận thứ tự (`thu`), không ghi
// unit_code. Số ngay sau "căn" mà kèm đơn vị (2 pn, 2 tầng, 2 x 10) thì không phải thứ tự.
export type CanTrongTin = { ma?: string; thu?: number; quan?: string; ngang?: string; dai?: string; dt?: string; gia?: string; goc: string;
  /** Loại đọc từ CHÍNH mảnh của căn (căn hộ / nhà / đất) — mảnh không nói thì không có. */
  loai?: "chung_cu" | "nha_pho" | "dat";
  /** Mảnh tách theo LOẠI ("căn nhà …, với 1 căn hộ …"), không theo số thứ tự. */
  theoLoai?: true };
const CAN_CHU_RE = /(?:^|[^\p{L}])(?:[Cc]ăn|[Cc]an|[Ll]ô|[Ll]o)\s+([A-H])(?![\p{L}\d])/u;
/** Loại BĐS nói bằng chữ trong một mảnh (không dấu): căn hộ/chung cư > đất > nhà. */
export function loaiTuChu(kd: string): "chung_cu" | "nha_pho" | "dat" | undefined {
  if (/\b(?:can ho|chung cu)\b/.test(kd)) return "chung_cu";
  if (/\b(?:lo dat|manh dat|mieng dat|dat nen|dat tho cu|dat vuon|dat nong nghiep)\b/.test(kd) || /\b(?:lo|manh|mieng)\b[^,.;]*\bdat\b/.test(kd) ||
    (/\bdat\b/.test(kd) && !/\bdat coc\b/.test(kd) && !/\bnha\b/.test(kd))) return "dat";
  if (/\bnha\b/.test(kd)) return "nha_pho";
  return undefined;
}
const giaTuKd = (kd: string): string | undefined => {
  const m = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${TIEN_KD})(?![a-z])(?:\\s*(\\d{1,3}(?:[.,]\\d+)?)${KHONG_PHAI_LE_GIA})?(?:\\s*(ruoi))?`).exec(kd);
  return m ? `${m[1]} ${m[2] === "toi" ? "tỏi" : /^t[iy]$/.test(m[2]) ? "tỷ" : "triệu"}${m[3] ? ` ${m[3]}` : ""}${m[4] ? " rưỡi" : ""}` : undefined;
};
/**
 * 23/09/2026 (bắn thật, 5 người): "Chị cần bán 2 căn: căn nhà hẻm 5m Nguyễn Trãi quận 5 60m2 giá 9 tỷ, với 1 căn hộ
 * chung cư Hà Đô quận 10 2PN 75m2 giá 5 tỷ 2" — không có "căn 1/căn 2" nên bản trước gộp làm MỘT tin (loại căn hộ, 2PN
 * của căn hộ, giá của căn nhà). Tách theo chữ LOẠI (căn nhà / căn hộ / chung cư / lô đất / đất…) khi câu báo nhiều căn
 * ("2 căn", "hai nhà", "với 1 căn hộ…"). Mỗi mảnh phải có GIÁ; mảnh chưa có giá ("căn hộ" đứng trước "chung cư …")
 * gộp vào mảnh kề sau (hoặc trước, nếu là mảnh cuối).
 */
function tachTheoLoai(text: string): CanTrongTin[] {
  const kdAll = boDau(text);
  const baoNhieu = /\b(?:2|3|4|hai|ba|bon)\s+(?:can|nha|lo|manh|mieng|bds|bat dong san|cai|tai san|noi)\b/.test(kdAll) ||
    /\b(?:voi|va|con|them)\s+(?:1|mot)\s+(?:can|nha|lo|manh|mieng)\b/.test(kdAll);
  if (!baoNhieu) return [];
  const re = /(?:^|[\s,;:.])((?:(?:với|voi|và|va|còn|con|thêm|them)\s+)?(?:(?:1|một|mot)\s+)?(?:căn hộ|can ho|chung cư|chung cu|căn nhà|can nha|nhà|nha|lô đất|lo dat|mảnh đất|manh dat|miếng đất|mieng dat|đất nền|dat nen)(?![\p{L}]))/giu;
  const moc: number[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) moc.push(m.index + m[0].length - m[1].length);
  if (moc.length < 2) return [];
  let manh = moc.map((bat, i) => text.slice(bat, moc[i + 1]).replace(/[\s,;:.]+$/u, "").trim()
    .replace(/^(?:với|voi|và|va|còn|con|thêm|them)\s+(?:(?:1|một|mot)\s+)?/iu, ""));
  const coGia = (s: string) => !!giaTuKd(boDau(s));
  const gop: string[] = [];
  let cho = "";
  for (const m of manh) {
    if (coGia(m)) { gop.push(`${cho}${cho ? " " : ""}${m}`); cho = ""; } else cho = `${cho}${cho ? " " : ""}${m}`;
  }
  if (cho && gop.length) gop[gop.length - 1] = `${gop[gop.length - 1]} ${cho}`;
  manh = gop;
  if (manh.length < 2) return [];
  return manh.map((goc, i) => {
    const kd = boDau(goc);
    const mKt = /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/.exec(kd);
    const mDt = /(\d{1,4}(?:[.,]\d+)?)\s*m2/.exec(kd);
    const q = /\b(?:quan|q)\s*\.?\s*(\d{1,2})\b/.exec(kd);
    const loai = loaiTuChu(kd);
    return { thu: i + 1, ...(q ? { quan: `Quận ${Number(q[1])}` } : {}), ngang: mKt?.[1], dai: mKt?.[2], dt: mDt?.[1], gia: giaTuKd(kd), goc, ...(loai ? { loai } : {}), theoLoai: true as const };
  });
}
export function nhanDienNhieuCan(text: string): CanTrongTin[] {
  const out: CanTrongTin[] = [];
  // 23/09/2026: "em ban 2 nha: nha 1 hem 3m …, nha 2 mat tien …" — "nhà 1/nhà 2" là số thứ tự khi câu có CẢ HAI
  // ("nhà 2 mặt tiền" đứng một mình là nhà hai mặt tiền, không phải căn thứ hai).
  const kdToan = boDau(text);
  const nhaThu = /\bnha\s+1\b/.test(kdToan) && /\bnha\s+2\b/.test(kdToan);
  const reThu = new RegExp(`(?:^|[^\\d])\\b(?:can|lo${nhaThu ? "|nha" : ""})\\s+(?:so\\s+|thu\\s+)?(\\d{1,2})\\b(?!\\s*(?:x\\s*\\d|m2|m\\b|ty|ti|toi|trieu|tr\\b|pn|phong|lau|tang|tam|met|wc))`);
  for (const goc of text.split(/[,;\n]|\s+va\s+|\s+và\s+/i).map((s) => s.trim()).filter(Boolean)) {
    const kd = boDau(goc);
    const mMa = /\b(?:can|lo|shop|nen)\s*(?:so\s*)?([a-z]{1,3}[\s.\-]?\d{1,3}(?:[.\-]\d{1,3})?[a-z]?|\d{1,3}[a-z])\b/.exec(kd);
    const mThuSo = mMa ? null : reThu.exec(kd);
    // 23/09/2026 (bắn thật, môi giới): "căn A 1pn 52m2 giá 4.8 tỷ, căn B 2pn 80m2 giá 7 tỷ 1" — CHỮ IN HOA
    // làm số thứ tự (A=1, B=2…). Chỉ nhận chữ in hoa đứng một mình ("căn A12-05" là mã căn, "căn ạ" không phải).
    const mChu = mMa || mThuSo ? null : CAN_CHU_RE.exec(goc);
    const mThu: [string, string] | null = mThuSo ? [mThuSo[0], mThuSo[1]] : mChu ? [mChu[0], String(mChu[1].charCodeAt(0) - 64)] : null;
    if (!mMa && !mThu) continue;
    if (mThu) {
      const mKt = /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/.exec(kd);
      const mDt = /(\d{1,4}(?:[.,]\d+)?)\s*m2/.exec(kd);
      const mGia = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${TIEN_KD})(?![a-z])(?:\\s*(\\d{1,3}(?:[.,]\\d+)?)${KHONG_PHAI_LE_GIA})?(?:\\s*(ruoi))?`).exec(kd);
      const q = /\b(?:quan|q)\s*\.?\s*(\d{1,2})\b/.exec(kd);
      // 15/09/2026 (bắn thật N2): "căn 2 sổ hồng riêng, căn 1 đúc 3 tấm" là FACT cho căn đã
      // mở, không phải rao thêm — căn thứ tự không giá, không kích thước thì không tính.
      if (!mKt && !mDt && !mGia) continue;
      const loaiThu = loaiTuChu(kd.replace(/\bnha\s+\d\b/, ""));
      out.push({
        thu: Number(mThu[1]), ...(q ? { quan: `Quận ${Number(q[1])}` } : {}), ...(nhaThu ? { loai: loaiThu ?? "nha_pho" } : loaiThu ? { loai: loaiThu } : {}),
        ngang: mKt?.[1], dai: mKt?.[2], dt: mDt?.[1],
        gia: mGia ? `${mGia[1]} ${mGia[2] === "toi" ? "tỏi" : /^t[iy]$/.test(mGia[2]) ? "tỷ" : "triệu"}${mGia[3] ? ` ${mGia[3]}` : ""}${mGia[4] ? " rưỡi" : ""}` : undefined,
        goc,
      });
      continue;
    }
    const laQuan = /^q\s*\.?\s*\d{1,2}$/.test(mMa![1]);
    const mKt = /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/.exec(kd);
    const mDt = /(\d{1,4}(?:[.,]\d+)?)\s*m2/.exec(kd);
    const mGia = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${TIEN_KD})(?![a-z])(?:\\s*(\\d{1,3}(?:[.,]\\d+)?)${KHONG_PHAI_LE_GIA})?(?:\\s*(ruoi))?`).exec(kd);
    out.push({
      ...(laQuan
        ? { quan: `Quận ${Number(mMa![1].replace(/\D/g, ""))}` }
        : { ma: mMa![1].replace(/[\s.]/g, "").toUpperCase() }),
      ngang: mKt?.[1], dai: mKt?.[2], dt: mDt?.[1],
      gia: mGia ? `${mGia[1]} ${mGia[2] === "toi" ? "tỏi" : /^t[iy]$/.test(mGia[2]) ? "tỷ" : "triệu"}${mGia[3] ? ` ${mGia[3]}` : ""}${mGia[4] ? " rưỡi" : ""}` : undefined,
      goc,
    });
  }
  return out.length >= 2 ? out : tachTheoLoai(text);
}
/**
 * Tin nói về NHIỀU CĂN đã mở, theo số thứ tự: "căn 2 sổ hồng riêng, có thương lượng. căn 1
 * đúc 3 tấm" → [{thu: 2, manh: "sổ hồng riêng, có thương lượng."}, {thu: 1, manh: "đúc 3 tấm"}].
 * Số ngay sau "căn" mà kèm đơn vị (2 pn, 2 x 10, 2 tấm) thì không phải thứ tự. (15/09/2026)
 */
export function tachTheoCan(text: string): Array<{ thu: number; manh: string; nhan?: string }> {
  const out: Array<{ thu: number; manh: string; nhan?: string }> = [];
  const re = /(?:^|[\s,;.])(?:căn|can|lô|lo)\s+(?:số\s+|so\s+|thứ\s+|thu\s+)?(\d{1,2})(?![\d])(?!\s*(?:x\s*\d|m2|m\b|tỷ|ty|tỉ|ti|tỏi|toi|triệu|trieu|tr\b|pn|phòng|phong|lầu|lau|tầng|tang|tấm|tam|mét|met|wc))/giu;
  const moc: Array<{ thu: number; bat: number; het: number; nhan?: string }> = [];
  for (let m = re.exec(text); m; m = re.exec(text)) moc.push({ thu: Number(m[1]), bat: m.index, het: m.index + m[0].length });
  // 23/09/2026: "căn B …" — chữ in hoa làm thứ tự (A=1, B=2…), cùng luật `nhanDienNhieuCan`.
  const reChu = /(?:^|[\s,;.])(?:[Cc]ăn|[Cc]an|[Ll]ô|[Ll]o)\s+([A-H])(?![\p{L}\d])/gu;
  // 29/09/2026 (kịch bản L10): giữ chữ khách gọi ("căn B") để bong bóng không đổi thành "căn 2".
  for (let m = reChu.exec(text); m; m = reChu.exec(text)) moc.push({ thu: m[1].charCodeAt(0) - 64, bat: m.index, het: m.index + m[0].length, nhan: m[1] });
  moc.sort((a, b) => a.bat - b.bat);
  for (let i = 0; i < moc.length; i++) {
    const manh = text.slice(moc[i].het, i + 1 < moc.length ? moc[i + 1].bat : undefined).replace(/^[\s:,.-]+|[\s,.]+$/g, "");
    if (manh.length >= 2) out.push({ thu: moc[i].thu, manh, ...(moc[i].nhan ? { nhan: moc[i].nhan } : {}) });
  }
  return out;
}
/**
 * Giá viết bằng CHỮ ("chín tỷ rưỡi", "hai trăm triệu", "sáu tỷ tám trăm") trên bản bỏ dấu giữ độ dài. Dùng ở `nhanDienFact`
 * VÀ vòng quét của `nhanDienNhieuFact`. 29/09/2026 (kịch bản K6): "giá sáu tỷ tám trăm" không vào ô giá vì luật chỉ nằm ở
 * `nhanDienFact` (trả MỘT kết quả — câu có "5x18" thì diện tích khớp trước) và đuôi "tám trăm" sau "tỷ" chưa được nhận.
 */
export const GIA_CHU_RE = /\b(?:muoi|mot|hai|ba|bon|nam|sau|bay|tam|chin)(?:\s+(?:muoi|mot|hai|ba|bon|nam|lam|sau|bay|tam|chin|tram))*\s+(?:ty|toi|trieu|tram)\b(?:\s+(?:ruoi|(?:mot|hai|ba|bon|tu|nam|sau|bay|tam|chin)(?:\s+tram)?)\b(?!\s*(?!(?:nha|nhe|nhen|em|a|anh|chi|thoi|luon)\b)[a-z0-9]))?/;

const CUM_KHOA: Record<string, RegExp> = {
  phap_ly: /\b(?:so hong|so do|so chung|so rieng|hoan cong|vi bang|hdmb|hop dong mua ban|shr|srh|shrr|shc|giay tay)(?:\s+(?:rieng|chung|hong|do|hoan cong|hc|shr|shc|du|day du|lau dai|chinh chu|ca nhan|roi|san|cam tay|so hong|so do))*\b/,
  phi_quan_ly: /\bphi\s+(?:quan ly|ql|dich vu|bao tri)(?:\s*(?:la|khoang|tam)?\s*\d[\d.,]*\s*(?:k|nghin|ngan|trieu|tr|d|dong)?(?:\s*\/\s*(?:m2|thang|th|can))?)?/,
};

/**
 * 30/09/2026 (bắn thật lx-ban-c): giá trị luật đọc giữ nguyên câu khách — pháp lý "sổ hồng rồi em", phí quản lý
 * "phí quản lý 15k/m2" — rồi in thẳng ra bản nháp. Chỉ gọn hai khoá này: bỏ tiểu từ đuôi, bỏ chữ khoá đứng đầu.
 */
export function gonGiaTriFact(q: string, answer: string): string {
  if (q === "phap_ly") {
    const g = answer.trim().replace(/(?:\s+(?:rồi|roi|nha|nhé|nhe|nhen|em|anh|chị|chi|ạ|a|đó|do|luôn|luon|á|nè|ne|ơi|oi))+\s*[.!]*$/iu, "").trim();
    return g.length >= 2 ? g : answer;
  }
  if (q === "phi_quan_ly") {
    const m = /\d+(?:[.,]\d+)?\s*(?:k|nghìn|ngàn|nghin|ngan|đ|d|đồng|dong|tr|triệu|trieu)?\s*(?:\/|trên|tren|một|mot)\s*(?:m2|m²|mét vuông|met vuong|tháng|thang)|\d+(?:[.,]\d+)?\s*(?:k|nghìn|ngàn|tr|triệu)(?![\p{L}\d])/iu.exec(answer);
    return m ? m[0].trim() : answer;
  }
  // 02/10/2026 (lx-t5-05: duong_container = "xe container vào tận nơi em"): mọi ô chữ bỏ tiểu từ / xưng hô cuối câu như
  // `catDapAn`. Trừ câu đứng tên — "ba anh", "chú" là NGƯỜI đứng sổ, không phải từ đệm.
  if (q !== "nguoi_dung_ten") {
    const g = answer.replace(DEM_CUOI_DAP_AN, "").trim();
    return g && /[\p{L}\p{N}]/u.test(g) ? g : answer;
  }
  return answer;
}

export function nhanDienNhieuFact(text: string): NhanDien[] {
  return nhanDienNhieuFactTho(text).map((f) => ({ ...f, answer: gonGiaTriFact(f.question, f.answer) }));
}
function nhanDienNhieuFactTho(text: string): NhanDien[] {
  const out: NhanDien[] = [];
  // 14/09/2026: tin rao kiểu Facebook ("🏢 Kết cấu: 3 tấm", "📜 Sổ hồng riêng") — đáp án bỏ
  // biểu tượng và nhãn "Kết cấu:" ở đầu mảnh.
  // `coNhan`: mảnh gốc viết "Nhãn: giá trị" (đã đổi thành "Nhãn giá trị" để luật đọc) → bỏ nhãn khỏi đáp án dù không còn dấu hai chấm.
  const gon = (a: string, coNhan = false) => a.replace(/^[\p{Extended_Pictographic}️‍\s•\-*]+/u, "")
    .replace(coNhan ? /^(?:kết cấu|pháp lý|giá|diện tích|dt|địa chỉ|vị trí|hướng|nội thất)\s*:?\s*(?=\S)/iu : /^(?:kết cấu|pháp lý|giá|diện tích|dt|địa chỉ|vị trí|hướng|nội thất)\s*:\s*/iu, "").trim() || a;
  // 05/10/2026 (SRS-5.1zy, tin rao dán nguyên 02/10 & 04/10): tin dạng DANH SÁCH "Tổng diện tích sàn: 245m²", "Giá: 6,95 tỷ" —
  // dấu hai chấm sau nhãn làm luật không thấy nhãn đứng trước số (sàn thành null), và dấu phẩy thập phân bị cắt thành mảnh
  // "95 tỷ". Đọc "Nhãn: giá trị" như "Nhãn giá trị"; dấu phẩy giữa hai chữ số không phải ranh mảnh.
  const chuanNhan = (s: string) => s.replace(/^[\p{Extended_Pictographic}️‍\s•\-*]+/u, "").replace(/^([\p{L}][\p{L}\s]{1,30}?)\s*:\s*(?=\S)/u, "$1 ");
  const coNhanDau = (s: string) => /^[\p{L}][\p{L}\s]{1,30}?\s*:\s*\S/u.test(s.replace(/^[\p{Extended_Pictographic}️‍\s•\-*]+/u, ""));
  const them = (nd: NhanDien | null, coNhan = false) => {
    if (!nd) return;
    let answer = gon(nd.answer, coNhan);
    // "5 x 20" / "4m x 11m" → "4x11" như đường AI (`boc_thong_so` tách hai chiều rồi nhân).
    if (nd.question === "dien_tich") answer = answer.replace(/^(\d+(?:[.,]\d+)?)\s*m?\s*x\s*(\d+(?:[.,]\d+)?)\s*m?$/i, (_m, a: string, b: string) => `${a.replace(",", ".")}x${b.replace(",", ".")}`);
    const cu = out.findIndex((x) => x.question === nd.question);
    if (cu < 0) out.push({ ...nd, answer });
    // 05/10/2026 (SRS-5.1zy): tiêu đề "BÁN NHÀ PHỐ 6 TẦNG CÓ THANG MÁY – TRƯƠNG ĐÌNH HỘI" từng chiếm ô kết cấu trước dòng
    // "Kết cấu: 6 tầng" — đáp án dài hơn 40 chữ là rác, đáp án ngắn đến sau thay thế.
    else if (out[cu].answer.length > 40 && answer.length <= 40) out[cu] = { ...nd, answer };
  };
  // 11/09/2026 (42 ca): xét từng MẢNH trước cả câu. Bản trước lấy nhanDienFact(cả
  // câu) trước, nên câu rao "bán nhà …, 4x16, 1 trệt 2 lầu, shr, 9t5" ghi fact pháp
  // lý là NGUYÊN câu rao (5/42 tin). Mảnh "shr" mới là câu trả lời pháp lý.
  // 15/09/2026 (bắn thật A3): "3 phòng ngủ em. nhà đang cho thuê 25 triệu/tháng" — dấu chấm + khoảng trắng cũng là ranh mảnh.
  // 24/09/2026 (xuất prompt, lượt Trần Đình Xu): "còn tầng 1 và 2 là để kinh doanh" bị cắt ở "và" thành
  // tiềm năng "2 là để kinh doanh". "và" giữa hai SỐ ("tầng 1 và 2", "lầu 2 và 3") không phải ranh mảnh.
  const manh = text.split(/(?<!\d),|,(?!\d)|[;\n]|\.\s+(?=\S)|(?<!\d)\s+(?:va|và)\s+|(?<=\d)\s+(?:va|và)\s+(?!\d)/i).map((s) => s.trim()).filter((s) => s.length >= 2);
  if (manh.length > 1) for (const s of manh) them(nhanDienFact(chuanNhan(s)), coNhanDau(s));
  // "Diện tích đất: 4m x 11m" — luật chỉ biết số có "m2"; ngang × dài là cách nói diện tích đất phổ biến nhất. Ghi "4x11"
  // như đường AI (`boc_thong_so` tách hai chiều rồi nhân). Chỉ mảnh đứng riêng, không có chữ sàn.
  if (!out.some((f) => f.question === "dien_tich" || f.question === "dien_tich_dat")) {
    for (const s of manh) {
      const kdS = boDau(chuanNhan(s)).trim();
      const m = /^(?:(?:dien tich|dt|kich thuoc|dat)(?:\s+dat)?\s*)?(\d{1,3}(?:[.,]\d+)?)\s*m?\s*x\s*(\d{1,3}(?:[.,]\d+)?)\s*m?$/.exec(kdS);
      if (m && !/\bsan\b/.test(kdS)) { them({ question: "dien_tich", answer: `${m[1].replace(",", ".")}x${m[2].replace(",", ".")}` }); break; }
    }
  }
  // 13/09/2026 (lượt bắn thật): câu nhiều mảnh mà lượt CẢ CÂU trả về nguyên câu
  // làm đáp án thì đó là rác — "anh cần bán căn nhà hẻm xe hơi 5m Nguyễn Trãi…"
  // thành fact độ rộng hẻm, "ngang 5 dài 20, đường nhựa 7m, sổ riêng" thành pháp
  // lý. Các mảnh đã được xét riêng ở trên; cả câu chỉ còn được góp đáp án ĐÃ CẮT.
  const textC = chuanNhan(text);
  let caCau = nhanDienFact(textC);
  // 29/09/2026 (kịch bản L1/L6/L9): câu rao MỘT mảnh (không dấu phẩy) mà luật cả câu trả nguyên câu làm đáp án — "bán căn hộ …
  // giá 4ty6 phí quản lý 15k/m2" thành phí quản lý = cả câu, "…gia 7t8 shr hc" / "bán nhà giấy tay…" thành pháp lý = cả câu.
  // Cắt đúng cụm của khoá đó; không cắt được thì bỏ (vòng quét bên dưới còn bắt các ý khác).
  if (caCau && manh.length <= 1 && caCau.answer === textC.trim() && textC.trim().split(/\s+/).length >= 8 && CUM_KHOA[caCau.question]) {
    const mk = CUM_KHOA[caCau.question].exec(boDauGiuDoDai(textC));
    caCau = mk ? { ...caCau, answer: textC.slice(mk.index, mk.index + mk[0].length).trim() } : null;
  }
  if (manh.length <= 1 || (caCau && caCau.answer !== textC.trim())) them(caCau, coNhanDau(text));
  const kd = boDau(text);
  const kdD = boDauGiuDoDai(text);
  for (const [q, re, lay] of FACT_PHU) {
    if (q === "nam_xay" && NHA_KHAC_RE.test(kd)) continue; // năm xây nhà hàng xóm không phải của căn này
    // Lý do bán giữ DẤU ("cần tiền", không phải "can tien"): khớp trên bản bỏ dấu
    // giữ độ dài rồi cắt đúng đoạn chữ gốc.
    // 29/09/2026 (kịch bản K10): thương lượng từng ra "con thuong luong" (chữ bỏ dấu) — cắt từ chữ gốc như lý do bán.
    if (q === "ly_do_ban" || q === "view" || q === "ket_cau" || q === "thuong_luong") {
      const mm = re.exec(kdD);
      if (mm) them({ question: q, answer: text.slice(mm.index, mm.index + mm[0].length).trim() });
      continue;
    }
    const m = re.exec(kd);
    // 15/09/2026 (bắn thật A2/C2): "nhà đang cho thuê 25 triệu/tháng" của tin BÁN là thu nhập
    // thuê, không phải giá mong muốn — luật hiện trạng (đang cho thuê) lo.
    if (m && q === "gia" && TRUOC_LA_THUE.test(kd.slice(Math.max(0, m.index - 30), m.index))) continue;
    if (m) them({ question: q, answer: lay(m) });
  }
  // 29/09/2026 (kịch bản L7): địa chỉ nay cắt trước chữ phường ("đường Phan Văn Trị phường 10" → "đường Phan Văn Trị") — phường số
  // phải đi thành ô riêng, không thì mất cùng đoạn bị cắt.
  if (out.some((f) => f.question === "vi_tri") && !out.some((f) => f.question === "phuong")) {
    const mp = /(?:^|\s)(?:phuong|p\.?)\s*(\d{1,2})(?!\d)/.exec(kd);
    if (mp) them({ question: "phuong", answer: `Phường ${Number(mp[1])}` });
  }
  // Giá bằng chữ (xem GIA_CHU_RE) — vòng trên chỉ biết giá chữ số. Cùng ngưỡng 100 triệu, cùng luật "không đứng sau chữ thuê".
  if (!out.some((f) => f.question === "gia")) {
    const mc = GIA_CHU_RE.exec(kdD);
    if (mc && (docTien(mc[0]) ?? 0) >= 1e8 && !TRUOC_LA_THUE.test(kd.slice(Math.max(0, mc.index - 30), mc.index))) {
      them({ question: "gia", answer: text.slice(mc.index, mc.index + mc[0].length).trim() });
    }
  }
  return out;
}
// Đổi loại giao dịch (15/09/2026): "cho thuê chứ không bán", "không bán, cho thuê",
// "đổi sang cho thuê" → thuê; "bán chứ không cho thuê", "chuyển qua bán" → bán.
export const DOI_SANG_THUE_RE = /\bcho thue\b[^,.]{0,6}\bchu\s+(?:khong|ko|k|hong)\s+(?:phai\s+)?ban\b|\b(?:khong|ko|k)\s+ban\b[^,.]{0,12}\bcho thue\b|\bcho thue\b[^,.]{0,12}\b(?:khong|ko|k)\s+ban\b|\b(?:doi|chuyen)\s+(?:sang|qua|thanh)\s+cho thue\b/;
// 24/09/2026 (bắn 10 tin, CHDV): "vẫn bán nha em, không phải cho thuê" — chủ khẳng định lại là BÁN.
export const DOI_SANG_BAN_RE = /\b(?:van|la|dang)\s+ban\b[^.]{0,20}\b(?:khong|ko|k|hong)\s+(?:phai\s+)?(?:la\s+)?cho thue\b|\bban\b[^,.]{0,6}\bchu\s+(?:khong|ko|k|hong)\s+(?:phai\s+)?cho thue\b|\b(?:khong|ko|k)\s+cho thue\b[^,.]{0,12}\bban\b|\b(?:doi|chuyen)\s+(?:sang|qua|thanh)\s+ban\b/;
/**
 * 27/09/2026 (test Zalo): "312 Nguyễn Thuơbgj Hiền" (đang hỏi hẻm) / "45 Ngô Y Linh" — SỐ NHÀ rồi TÊN RIÊNG viết hoa, không đơn vị
 * đo / tiền → là ĐỊA CHỈ (tên gõ sai vẫn là địa chỉ; từ điển `duong` ở tầng trên gợi ý tên đúng).
 */
/**
 * FR-241 o (bắn lại 28/09/2026, lx-85/86/87): cả tin là ĐÚNG MỘT câu trả lời của khoá `q`, không kèm gì khác — "sổ chung",
 * "sổ hồng rồi em", "sổ đỏ nha", "xã Vĩnh Lộc A", "phường 8". Chế độ `chinh` gạt luật khi AI im (khoá AI biết), nên khách nói
 * sang ô khác bằng một câu trọn như vậy thì pháp lý rơi vào bổ sung, còn phường mất hẳn (bổ sung coi tên phường là rác).
 * Câu trọn kiểu này không mơ hồ → luật nói thay. Có chữ phủ định / chờ / số tiền / đường / hẻm … thì KHÔNG phải câu trọn.
 */
export function laTraLoiTronKhoa(q: string, text: string): boolean {
  const tho = boDau(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  // Bỏ dấu thì "đỏ" và tiểu từ "đó" cùng là "do" — thử cắt tiểu từ cả hai cách ("sổ đỏ nha em", "sổ hồng rồi đó").
  const cat = (re: RegExp) => tho.replace(re, "").trim();
  const bienThe = [cat(/(?:\s+(?:roi|nha|nhe|nhen|em|a|anh|chi|luon|day|oi|ne|thoi))+$/), cat(/(?:\s+(?:roi|nha|nhe|nhen|em|a|anh|chi|do|luon|day|oi|ne|thoi))+$/)];
  return bienThe.some((kd) => !!kd && tronKhoa(q, kd));
}
function tronKhoa(q: string, kd: string): boolean {
  if (q === "phap_ly") {
    return /^(?:(?:da|co|la)\s+)?(?:shr|shc|so\s+(?:hong|do)(?:\s+(?:rieng|chung))?|so\s+(?:rieng|chung))$/.test(kd);
  }
  // 30/09/2026 (bắn thật lx-ban-f): "60m2" khi đang hỏi hẻm — AI im, luật đọc diện tích mà bị gạt (khoá AI biết) → "Không
  // bóc tách được gì", bot hỏi lại. Cả tin chỉ là một con số + m2 thì không mơ hồ.
  if (q === "dien_tich" || q === "dien_tich_dat") {
    return /^(?:(?:dien tich|dt)\s+)?(?:la\s+)?\d{1,5}(?:\s\d{1,2})?\s*(?:m2|m 2|met vuong|m vuong)$/.test(kd);
  }
  // 30/09/2026 (bắn lại lx-ban-c2 trên v274): "phí quản lý 15k/m2" khi đang hỏi nội thất — AI im, luật bị gạt → mất hẳn.
  if (q === "phi_quan_ly") {
    return /^(?:phi (?:quan ly|ql)|pql)\s+(?:la\s+|khoang\s+|tam\s+)?\d+(?:\s\d+)?\s*(?:k|nghin|ngan|tr|trieu|d|dong)?\s*(?:(?:tren\s+|mot\s+)?(?:m2|m 2|thang))?$/.test(kd);
  }
  if (q === "phuong") {
    return /^(?:xa|phuong|p|thi tran)\s+[a-z0-9]+(?:\s+[a-z0-9]+){0,3}$/.test(kd) &&
      !/\b(?:duong|hem|ngo|kiet|so nha|quan|q|huyen|ty|trieu|m2|lau|tang)\b/.test(kd.replace(/^(?:xa|phuong|p|thi tran)\s+/, ""));
  }
  return false;
}

// 07/10/2026 (SRS-5.1zzza, chủ dự án chat thử): câu hỏi KÈM PHỎNG ĐOÁN ("Nhà anh ở đâu vậy, ở Hồ Chí Minh đúng không?",
// "Nhà mình nằm trong hẻm đúng không anh, hẻm rộng mấy mét?") — khách gật phần đoán trước rồi mới trả lời phần hỏi: "đúng rồi
// e. nhà a ở quận 5". Mảnh gật ở đầu không phải giá trị của ô (bản trước: địa chỉ = "đúng rồi e. nhà a ở"). Chỉ các ô có câu
// mẫu kèm đoán; ô có / không thì lời gật LÀ câu trả lời nên không bỏ.
const O_HOI_KEM_DOAN = new Set(["vi_tri", "phuong", "do_rong_hem", "do_rong_duong"]);
const TP_HCM_KD = /\b(?:(?:tp|thanh pho)\s*)?(?:hcm|tphcm|ho chi minh|sai gon|sg)\b/g;
/** Mảnh đầu chỉ là lời gật (kể cả gật kèm tên thành phố: "ừ hcm", "đúng rồi sài gòn") → true. */
function laManhGat(manh: string): boolean {
  const kd = boDau(manh).replace(/[^a-z0-9\s]/g, " ").replace(TP_HCM_KD, " tp_hcm ").replace(/\s+/g, " ").trim();
  if (!kd || /\b(khong|ko|k|chua|sai|nham)\b/.test(kd)) return false;
  const tu = kd.split(" ");
  return tu.every((w) => TU_GAT.has(w) || TU_DEM.has(w) || w === "tp_hcm" || w === "o" || w === "tai") &&
    tu.some((w) => TU_GAT.has(w) || w === "tp_hcm");
}
/** Bỏ các mảnh gật đứng đầu ("đúng rồi e. nhà a ở quận 5" → "nhà a ở quận 5"); câu chỉ có lời gật thì giữ nguyên. */
export function boGatDau(text: string): string {
  let con = (text ?? "").trim();
  for (let i = 0; i < 3; i++) {
    const m = /^([^,.;!?\n]+)[,.;!?\n]+\s*(?=\S)/u.exec(con);
    if (!m || !laManhGat(m[1])) break;
    con = con.slice(m[0].length);
  }
  return con;
}
// 07/10/2026 (SRS-5.1zzzb, chủ dự án: "nó hỏi, khách sẽ trả lời 1 ý trước, rồi trong đó mới có ý cần bóc tách"): câu hỏi
// có / không ("Lô đất có vướng cột điện, hố ga gì không?") — khách đáp "ko có, đường 8m". Mảnh đầu là câu trả lời, mảnh sau là
// ô KHÁC; bản trước đọc cả câu là "nói sang ô đường" và mất câu trả lời. Lưới đỡ khi AI không chạy: chỉ tách theo DẤU NGẮT và khi
// mảnh sau là thông tin có ô riêng — câu không dấu ("không có mặt tiền đẹp em") để AI đọc theo nghĩa (prompt boc-rao).
const CAU_DAP_CO_KHONG = new Set([...HOI_CO_KHONG, "ha_tang", "quy_hoach"]);
// "dính" / "vướng" / "bị": khách lặp lại động từ của câu hỏi ("ko dính", "không vướng gì").
const TU_CO_KHONG = new Set(["khong", "ko", "k", "hong", "hok", "chua", "co", "gi", "het", "dau", "luon", "dinh", "vuong", "bi"]);
function laManhCoKhong(manh: string): boolean {
  const tu = boDau(manh).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return tu.length > 0 && tu.length <= 6 && tu.every((w) => TU_CO_KHONG.has(w) || TU_GAT.has(w) || TU_DEM.has(w)) &&
    tu.some((w) => w === "khong" || w === "ko" || w === "k" || w === "hong" || w === "hok" || w === "chua" || w === "co" || TU_GAT.has(w));
}
/** "ko có, đường 8m" khi hỏi có / không → { dau: "ko có", sau: "đường 8m" }; không tách được → null. */
export function tachDapCoKhongDau(question: string, text: string): { dau: string; sau: string } | null {
  if (!CAU_DAP_CO_KHONG.has(question)) return null;
  const m = /^([^,.;!?\n]+)[,.;!?\n]+\s*(?=\S)/u.exec((text ?? "").trim());
  if (!m || !laManhCoKhong(m[1])) return null;
  const sau = (text ?? "").trim().slice(m[0].length).trim();
  return nhanDienNhieuFact(sau).some((f) => f.question !== "bo_sung" && !cungHo(f.question, question)) ? { dau: m[1].trim(), sau } : null;
}
/** Lời dẫn đầu câu địa chỉ: "nhà a ở", "căn của chị tại", "ở". */
const DAN_DIA_CHI = /^\s*(?:(?:nhà|nha|căn|can|đất|dat|lô|lo)\s+(?:(?:của|cua)\s+)?(?:anh|a|chị|chi|c|em|e|mình|minh|tôi|toi|chú|chu|cô|co|bác|bac)?\s*)?(?:ở|o|tại|tai|thuộc|thuoc)\s+(?=\S)/iu;

/** "o q10", "ở quận 10 nha em", "p5 q10", "quận 10": câu chỉ nói đơn vị hành chính, không có đường / hẻm / số nhà / mốc. */
export function laChiDonViHanhChinh(text: string): boolean {
  // 07/10/2026: "đúng rồi e. nhà a ở quận 5" — bỏ lời gật phần đoán "ở Hồ Chí Minh đúng không" trước (SRS-5.1zzza).
  const kd = boDau(boGatDau(text)).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/(?:\s+(?:nha|nhe|nhen|em|e|a|anh|chi|oi|do|day|ne|luon))+$/, "");
  if (!kd) return false;
  const bo = kd.replace(/^(?:(?:nha|can|dat|lo)\s+(?:cua\s+)?(?:anh|a|chi|c|em|e|minh|toi|chu|co|bac)?\s*)?(?:o|tai|thuoc)\s+/, "")
    .replace(/\b(?:quan|q|phuong|p)\s*\d{1,2}\b|\b[qp]\d{1,2}\b|\b(?:tp|thanh pho)\s*(?:hcm|ho chi minh|sai gon|sg)\b|\bsai gon\b/g, " ")
    .replace(/\s+/g, " ").trim();
  return bo === "" && /\d/.test(kd);
}

export function laSoNhaTenDuong(text: string): boolean {
  const t = (text ?? "").trim().replace(/\s+(?:nha|nhé|nhe|nha em|em|ạ|a|đó|do)\s*[.!]*$/iu, "");
  return /^(?:số\s+)?\d{1,4}[a-zA-Z]?(?:\/\d{1,4}[a-zA-Z]?)*\s+\p{Lu}[\p{L}]*(?:\s+[\p{L}]+){0,4}\s*$/u.test(t) &&
    !/(?<![\p{L}\d])(?:m|m2|met|mét|tỷ|tỉ|triệu|tr|tầng|lầu|phòng|pn|wc|toilet|năm|tháng|tuổi|nhà|căn)(?![\p{L}\d])/iu.test(t);
}

export function nhanDienFact(text: string): NhanDien | null {
  const r = nhanDienFactTho(text);
  return r ? { ...r, answer: gonGiaTriFact(r.question, r.answer) } : r;
}
function nhanDienFactTho(text: string): NhanDien | null {
  const goc = text.trim();
  if (laSoNhaTenDuong(goc)) return { question: "vi_tri", answer: goc.replace(/\s+(?:nha|nhé|nhe|nha em|em|ạ|a|đó|do)\s*[.!]*$/iu, "") };
  const kd = boDau(goc);
  const kdD = boDauGiuDoDai(goc);
  const catGoc = (mm: RegExpExecArray) => goc.slice(mm.index, mm.index + mm[0].length).trim();
  // 13/09/2026 (lượt bắn thật): luật trả NGUYÊN câu làm đáp án thì câu nhiều mảnh
  // mang rác vào ô — "ngang 5 dài 20, đường nhựa 7m, sổ riêng" thành pháp lý. Chỉ
  // lấy MẢNH (giữa hai dấu phẩy) có chứa từ khoá; câu một mảnh thì như cũ.
  const manhKhop = (re: RegExp): string => {
    const ps = goc.split(/[,;\n]|\.\s+(?=\S)/).map((x) => x.trim()).filter(Boolean);
    if (ps.length < 2) return goc;
    return ps.find((x) => re.test(boDau(x))) ?? goc;
  };
  let m: RegExpExecArray | null;
  // 17/09/2026: "srh" là gõ lỡ của "shr" (Zalo thật) — nhận luôn.
  // 29/09/2026 (kịch bản K1): "hợp đồng tối thiểu 2 năm" (tin cho thuê) — "hợp đồng" đứng một mình từng khớp pháp lý (vì HĐMB)
  // và luật này xét TRƯỚC luật thời hạn thuê. Hợp đồng THUÊ / tối thiểu / N năm-tháng là thời hạn thuê, không phải giấy tờ.
  const PHAP_LY_RE = /\b(so hong|so do|so chung|so rieng|hoan cong|vi bang|hop dong(?!\s+(?:thue|cho thue|toi thieu|ky|\d))|hdmb|shr|srh|shrr|shc|giay tay|cam ngan hang|dang the chap)\b/;
  // 27/09/2026 (test Zalo): "ba a dứng tên", "anh đứng tên chính nhé", "mẹ em đứng tên" — NGƯỜI đứng tên sổ (FR-229), không
  // phải loại sổ. "đứng tên chung với…" / "đồng sở hữu" thuộc câu sổ chung (FR-223); câu có loại sổ thì mảnh sổ đi riêng.
  if (/\b(?:dung|dang dung)\s+ten\b/.test(kd) && !/\b(?:chung|dong so huu)\b/.test(kd) &&
      !PHAP_LY_RE.test(kd) && kd.split(/\s+/).length <= 8) {
    return { question: "nguoi_dung_ten", answer: goc };
  }
  // 22/09/2026 (kịch bản D): "đang thế chấp ngân hàng" một mình là TÌNH TRẠNG thế chấp (`the_chap`), không phải loại
  // giấy tờ; có kèm sổ/hợp đồng thì vẫn là pháp lý (mảnh thế chấp đi riêng qua `nhanDienNhieuFact`).
  if (/\b(dang the chap|the chap|cam ngan hang|trong ngan hang)\b/.test(kd) &&
      !/\b(so hong|so do|so chung|so rieng|hoan cong|vi bang|hop dong|hdmb|shr|srh|shrr|shc|giay tay)\b/.test(kd)) {
    return { question: "the_chap", answer: goc };
  }
  // 24/09/2026 (chủ dự án test Zalo, tin đang cho Techcombank thuê): "Hợp đồng 10 năm cho thuê 4 năm rồi đó" là HỢP ĐỒNG
  // THUÊ đang chạy, không phải giấy tờ nhà — bản trước ghi đè ô pháp lý. Chữ "hợp đồng" đi với thuê / hạn / còn N năm và
  // không kèm giấy tờ (sổ, HĐMB, công chứng…) → hạn hợp đồng thuê.
  if (HOP_DONG_THUE_RE.test(kd) && !/\b(so hong|so do|so chung|so rieng|hoan cong|vi bang|hdmb|mua ban|cong chung|shr|shc|giay tay|sang ten)\b/.test(kd)) {
    return { question: "han_hop_dong_thue", answer: goc };
  }
  // FR-241 f (10 ca test làm khó 28/09): đang hỏi giá, chủ nhà "chưa có sổ, đang chờ ra sổ" → không luật nào nhận, câu rơi ghi
  // chú, ô pháp lý trống. "Chưa có sổ / chờ ra sổ / đang làm sổ" là câu trả lời pháp lý (giữ nguyên chữ — F2: không thành sổ hồng).
  if (/\b(?:chua co so|chua ra so|chua lam so|cho ra so|cho so|dang cho so|dang lam so)\b/.test(kd)) {
    return { question: "phap_ly", answer: goc };
  }
  if (PHAP_LY_RE.test(kd)) {
    return { question: "phap_ly", answer: manhKhop(PHAP_LY_RE) };
  }
  // 10/09/2026 (chủ dự án): GẤP bắt ở MỌI lượt — "cần bán gấp", "không gấp, bán được
  // giá thì thôi", "không vội". Trả nguyên văn; tầng DB (sync_cols) đọc ra true/false.
  // 15/09/2026 (Zalo thật): "Được giá, căn tôi sở hữu…" — "được giá" đứng một mình cũng là nhịp bán.
  if (laGap(goc) || /\b(khong|ko|k|chua|chang|dau co)\s*(?:can\s*)?(?:gap|voi)\b|\bduoc gia\b|\bkhong voi\b|\btu tu\b|\bban duoc gia\b/.test(kd)) {
    // "gấp đôi / gấp 3 lần" là bội số; "cần bán gấp 5 tỷ" thì "5 tỷ" là giá, gấp vẫn là gấp.
    if (!/\bgap\s*(doi|ba|lan|ruoi|\d+(?:[.,]\d+)?\s*(?:lan|x\b))/.test(kd)) {
      // 16/09/2026: câu dài ("ngang 5m còn dọc 16m cần bán gấp") chỉ giữ mảnh gấp.
      const mg = GAP_CAT_RE.exec(kdD);
      return { question: "gap", answer: mg ? catGoc(mg) : goc };
    }
  }
  // 09/09 tối: những thứ CÓ SỐ nhưng không phải giá/diện tích — xét TRƯỚC giá,
  // kẻo "doanh thu 120 triệu/tháng" đè giá bán, "phí quản lý 15 nghìn/m2" rơi bo_sung.
  if (/\b(doanh thu|thu ve|dong tien|thu nhap|tien thue thu)\b/.test(kd)) return { question: "doanh_thu", answer: goc };
  if (/\b(phi quan ly|phi ql|phi dich vu|phi bao tri)\b/.test(kd)) return { question: "phi_quan_ly", answer: goc };
  if (/\b(phi gui xe|phi giu xe|tien gui xe)\b/.test(kd)) return { question: "phi_gui_xe", answer: goc };
  // 24/09/2026 (bắn 10 tin, biệt thự): "Bán biệt thự sân vườn Thảo Điền quận 2, …" → số của "quận 2" làm cả câu thành
  // ô sân vườn. Chỉ lấy MẢNH có chữ sân, và mảnh đó phải có số đo (không tính số quận / phường).
  if (/\b(san truoc|san sau|san vuon|co san|san rong|san dau xe)\b/.test(kd)) {
    const SAN_RE = /\b(san truoc|san sau|san vuon|co san|san rong|san dau xe)\b/;
    const mk = manhKhop(SAN_RE);
    const kdMk = boDau(mk).replace(/\b(?:quan|q|phuong|p|huyen)\.?\s*\d+/g, " ");
    if (SAN_RE.test(boDau(mk)) && /\d/.test(kdMk)) return { question: "san_vuon", answer: mk };
  }
  if (/\b(len tho cu|len tho|chuyen tho cu|chuyen muc dich)\b/.test(kd)) return { question: "len_tho_cu", answer: goc };
  if ((m = /\b(?:tho cu)\s*(?:duoc|la|het|full)?\s*(\d{1,4}(?:[.,]\d+)?)\s*(m2|%)/.exec(kd)) || (m = /\b(\d{1,4}(?:[.,]\d+)?)\s*(m2|%)\s*tho cu\b/.exec(kd)) ||
      // 29/09/2026 (kịch bản K5): "có 100 thổ cư" — thiếu chữ m2, luật cũ bắt buộc đơn vị nên bỏ qua. Số ≥ 10 đứng ngay trước
      // "thổ cư" là mét vuông thổ cư.
      (m = /\b(\d{2,4}(?:[.,]\d+)?)()\s*tho cu\b/.exec(kd))) {
    return { question: "tho_cu", answer: `${m[1]}${m[2] || "m2"}` };
  }
  // "đường 12m", "đường trước đất rộng 8m" → độ rộng đường (đất), không phải địa chỉ.
  if ((m = new RegExp(`\\bduong\\s*(?:truoc dat|truoc nha|noi khu|noi bo)?\\s*(?:rong\\s*)?(?:la\\s*)?${SO}\\s*(?:m|met)\\b`).exec(kd))) {
    return { question: "do_rong_duong", answer: `đường ${m[1]}m` };
  }
  if ((m = /\b(?:xa|thi tran|tt)\.?\s+([a-z][a-z ]{2,30})$/.exec(kd)) && !/\bxa hoi\b/.test(kd)) {
    return { question: "phuong", answer: goc };
  }
  // 14/09/2026: "à anh nói lại, là đất trống chưa xây nha em" — đổi LOẠI BĐS giữa chừng.
  // FR-239 b (phát lại test 27/09): "Chưa xây gì hết em nhà cấp 4" (chưa xây thêm, nhà cấp 4 có sẵn) → tin nhà bị đổi thành
  // ĐẤT. "chưa xây" chỉ là đất trống khi câu không nói có nhà.
  if ((/\b(?:la|thanh|chuyen sang|doi sang)\s+dat\s*(?:trong|nen|tho cu)?\b|\bdat trong\b(?![^,.;]*\bnha\b)/.test(kd) ||
       (/\bchua xay\b/.test(kd) && !/\bnha\b/.test(kd))) &&
      !/\b(?:cho xay|xay duoc|duoc xay|len tho)\b/.test(kd)) {
    return { question: "loai_bds", answer: /\bdat nen\b/.test(kd) ? "đất nền" : "đất trống" };
  }
  // "tầng 12" (chung cư), "thuê tối thiểu 1 năm", "hợp để ở / kinh doanh được" — 09/09 tối lần 2 rơi bo_sung.
  if ((m = /\b(?:tang|lau)\s*(?:thu\s*)?(\d{1,2})\b(?!\s*(?:lau|tang|tam|phong|m\b|met|x|%|(?:moi|mot|1)?\s*nam))/.exec(kd)) &&
      !/\b\d+\s*(?:lau|tang|tam)\b/.test(kd) && !/\btang\s*(?:gia|them|len)\b|\d\s*%/.test(kd) &&
      // 24/09/2026: "tầng 1 và 2 là để kinh doanh" kể các TẦNG của nhà phố, không phải căn hộ nằm tầng mấy.
      !/\b(?:tang|lau)\s*\d{1,2}\s*(?:va|den|toi|-|,)\s*\d/.test(kd)) {
    return { question: "tang", answer: m[1] };
  }
  // 16/09/2026 (bắn thật mau-co-thue): "cọc 2 tháng, ở tối thiểu 1 năm" → ô thời hạn ghi cả câu; chỉ lấy mảnh.
  const THOI_HAN_RE = /\b(thue toi thieu|toi thieu \d+ (?:nam|thang)|hop dong \d+ (?:nam|thang)|thoi han thue|ky \d+ nam|thue \d+ nam)\b/;
  if (THOI_HAN_RE.test(kd)) {
    return { question: "thoi_han_thue", answer: manhKhop(THOI_HAN_RE) };
  }
  // 15/09/2026 (bắn thật C4): "à mà nhà này cho thuê chứ ko bán, 25 triệu" là ĐỔI LOẠI
  // GIAO DỊCH — bản trước ghi vào ô "tiềm năng", tin vẫn là tin BÁN và 25 triệu bị
  // trigger giá gạt (dưới sàn giá bán). Đáp án là giá trị enum `listings.deal`;
  // trigger `listing_facts_sync_deal` (20260915d) lật cột và tính lại giá.
  if (DOI_SANG_THUE_RE.test(kd)) return { question: "loai_giao_dich", answer: "cho_thue" };
  if (DOI_SANG_BAN_RE.test(kd)) return { question: "loai_giao_dich", answer: "ban" };
  // 13/09/2026: "cho thuê căn hộ Sunrise City quận 7" là VIỆC RAO (deal + loại
  // BĐS), không phải tiềm năng — bản trước ghi nó vào ô "Phù hợp".
  // 16/09/2026 (bắn thật mau-co-thue): "cô có căn chung cư ở q7 muốn cho thuê" → ô tiềm năng.
  // "muốn/cần/đang + bán/cho thuê" là VIỆC rao, dù không có vật sau chữ đó.
  const laViecRao = /\b(?:ban|cho thue|sang|sang nhuong|de lai)\s+(?:lai\s+)?(?:gap\s+)?(?:can ho|can|nha|dat|lo|phong|mat bang|chung cu|kho|xuong|shophouse|biet thu|nen|mieng)\b/.test(kd) ||
    /\b(?:muon|can|dang|nho|ky gui|giao)\s+(?:giao\s+|gui\s+)?(?:ban|cho thue|sang nhuong)\b/.test(kd);
  // 16/09/2026 (Zalo thật): "nhà ở từ năm 2019 rồi" là HIỆN TRẠNG (đang ở, từ khi nào), không
  // phải tiềm năng sử dụng.
  const O_TU_NAM_RE = /\b(?:nha\s+)?(?:o|xay|xay dung|su dung|dang o)\s+(?:tu|hoi|nam)\s+(?:nam\s+)?((?:19|20)\d{2})\b/;
  if (!NHA_KHAC_RE.test(kd) && (m = O_TU_NAM_RE.exec(kd))) return { question: "hien_trang", answer: manhKhop(O_TU_NAM_RE) };
  // 21/09/2026 (bắn thật mau-tdt): "nhà ở đường trần đình trọng quận 5" là ĐỊA CHỈ ("ở" = nằm ở), từng
  // thành tiềm năng "nhà ở" rồi lên bản nháp "💡 Phù hợp: nhà ở đường…". "ở" theo sau là đường/hẻm/số/
  // phường/quận/khu/gần… thì không phải cách dùng.
  // 24/09/2026 (chủ dự án test Zalo): "ở Nguyễn Trãi quận 5" — tên đường KHÔNG có chữ "đường" đứng trước — cũng là
  // địa chỉ: chữ sau "ở" viết hoa (tên riêng) hoặc câu có quận/phường/huyện thì không phải cách dùng.
  const oLaDiaChi = /^\s*(?:nhà\s+)?ở\s+\p{Lu}/u.test(goc.trim()) || /\b(?:quan|q|phuong|p)\s*\d{1,2}\b|\b(?:quan|huyen|phuong|xa|tinh)\s+[a-z]/.test(kd);
  // 28/09/2026 (bắn thật lx-40): "ở ai cũng khá lên" (phong thuỷ) / "ở đây …" không phải cách dùng — "ở" + ai/đây/đó/kia/đâu.
  // FR-241 g (10 ca test làm khó 28/09): "ờ giá 15 tỷ" — "ờ" (thán từ) bỏ dấu thành "o" = "ở" → tiềm năng "để ở". Câu mở bằng
  // thán từ ờ / ơ / ừ / ồ thì "o" không phải "ở"; "ở giá …" cũng không phải cách dùng.
  const moBangThanTu = /^\s*(?:ờ|ơ|ừ|ồ|ờm|ừm)(?![\p{L}])/iu.test(goc.trim());
  // 29/09/2026 (kịch bản K6): "cho thuê được 12 triệu một tháng" mở bằng "cho thuê" nên luật này bắt làm TIỀM NĂNG và trả về
  // trước luật doanh thu bên dưới (luật viết đúng cho dạng này). Câu có số tiền (triệu/tỷ) là dữ liệu tiền, không phải tiềm năng.
  const coSoTien = /\d+(?:[.,]\d+)?\s*(?:trieu|tr|ty|ti)(?![a-z])/.test(kd);
  if (!laViecRao && !coSoTien && (!moBangThanTu && /^\s*(?:hop|de|nha)?\s*(?:hop )?(?:de o|o gia dinh|o(?!\s+(?:to\b|duong|hem|hxh|so|sn|phuong|quan|q\d|p\d|tai|gan|khu|xa|tren|trong|ngay|mat tien|chung cu|du an|gia\b|ai\b|day\b|do\b|kia\b|dau\b))|kinh doanh|buon ban|cho thue|lam van phong|mo shop|mo quan|lam cua hang)(?:\s|$|,)/.test(kd) && kd.split(/\s+/).length <= 8 &&
        !(/^\s*(?:nha\s+)?o\s/.test(kd) && oLaDiaChi)) ||
      (/\b(o hoac|hoac lam|deu duoc|lam can ho dich vu|lam chdv|hop (?:de )?(?:o|kinh doanh|cho thue|lam))\b/.test(kd) && kd.split(/\s+/).length <= 14 &&
        !/\b(showroom|lam xuong|van phong cong ty|nha hang|benh vien|truong hoc|lam kho)\b/.test(kd))) {
    return { question: "tiem_nang", answer: goc };
  }
  // Nội thất: "để lại máy lạnh, bếp", "full nội thất", "nhà trống".
  // 13/09/2026: "để lại căn nhà 4x16…" là BÁN, không phải để lại nội thất.
  const NOI_THAT_RE = /\b(de lai(?!\s+(?:lai\s+)?(?:can|nha|lo|dat|nen|mieng|mat bang|cho|gia|so|phong))|full noi that|noi that (?:co ban|day du|full)|may lanh|tu lanh|giuong|bep|ban giao (?:tho|trong|nha trong)|nha trong(?!\s+(?:hem|ngo|kiet|ngach|khu|duong|xom|day|toa|chung cu|du an|kdc|so|lo)))\b/;
  if (NOI_THAT_RE.test(kd) && !/\b(mat tien|m2|ty|trieu)\b/.test(kd)) {
    // 30/09/2026 (chat thử): câu rao MỘT vế "cho thuê căn hộ 1pn full nội thất vinhomes central park bình thạnh 15tr/tháng"
    // → ô nội thất ghi nguyên câu. Câu dài một vế: lấy cụm khớp + tối đa 3 chữ sau (dừng ở số / tên riêng viết hoa).
    let manh = manhKhop(NOI_THAT_RE);
    if (manh === goc && goc.split(/\s+/).length > 8) {
      const g = goc.normalize("NFC");
      const m = NOI_THAT_RE.exec(boDau(g));
      if (m && boDau(g).length === g.length) {
        const sau = g.slice(m.index + m[0].length).split(/\s+/).filter(Boolean);
        const them: string[] = [];
        for (const w of sau) { if (them.length >= 3 || /\d/.test(w) || /^[A-ZÀ-Ỹ]/u.test(w) || /^(?:vinhomes|masteri|sunrise|the|căn|nhà|giá|gia)$/iu.test(w)) break; them.push(w); }
        manh = [g.slice(m.index, m.index + m[0].length), ...them].join(" ").replace(/[,.;]+$/, "");
      }
    }
    return { question: "noi_that", answer: manh };
  }
  // "phường Tân Hưng" (tên chữ, câu ngắn) — phường số bắt ở dưới.
  if (/^\s*(?:phuong|p\.)\s+[a-z][a-z ]{2,25}\s*$/.test(kd) && !/\d/.test(kd)) return { question: "phuong", answer: goc };
  // Đường VÀO đất/xưởng: chất liệu, xe tải — không phải địa chỉ.
  const DUONG_VAO_RE = /\b(duong (?:be tong|nhua|dat|dal|cap phoi)|xe tai (?:vao|vo|chay)|duong vao)\b/;
  if (DUONG_VAO_RE.test(kd)) return { question: "duong_vao", answer: manhKhop(DUONG_VAO_RE) };
  // Vị trí cụ thể: "đường Trần Bình Trọng", "hẻm 123/45 Nguyễn Trãi", "số 12
  // Lê Lợi", "123/4 An Dương Vương". "hẻm 4m" (độ rộng) không rơi vào đây vì
  // sau số là đơn vị mét, không phải "/" hay tên đường.
  // 16/09/2026 (Zalo thật): "Căn số 14 ở Ny'ah Phú Định" — số căn + "ở/tại/trong" + tên
  // dự án / khu là VỊ TRÍ; bản trước không nhận, "14" thành diện tích đất.
  // 01/10/2026: "bán nhà phố hẻm 4m Nguyễn Trãi" — "nhà phố / mặt phố" là LOẠI nhà, không phải "phố <tên>"; bản trước nuốt cả câu
  // làm địa chỉ và mất "hẻm 4m" (cùng luật với `bocViTriRao`).
  if (/\bduong\s+[a-z]{2,}|(?<!\b(?:nha|mat|day)\s)\bpho\s+[a-z]{2,}/.test(kd) ||
      /\b(?:can|lo|nen|shop)\s*(?:so\s*)?\d+[a-z]?(?:[.\-\/]\d+)?\s+(?:o|tai|trong|thuoc|cua)\s+[a-z]{2,}/.test(kd) ||
      /\b(?:hem|hxh)\s*\d+(?:\/\d+)+\b/.test(kd) ||
      // "hẻm 123 Trần Bình Trọng": số hẻm rồi TÊN ĐƯỜNG (chữ), không phải "hẻm 4m".
      // 22/09/2026 (kịch bản C): "em xoá cái hẻm 4m ghi nhầm đi" — "4m" từng đọc thành số hẻm "4" + hậu tố
      // "m", chữ "ghi" thành tên đường, cả câu vào địa chỉ. Hậu tố số nhà không được là "m" đứng trơ.
      /\b(?:hem|hxh)\s*\d+(?:(?!m\b)[a-z])?\s+(?!m\b|met\b|xe\b|rong\b|thong\b|cut\b|xec\b|sec\b|set\b|xet\b|lan\b|doi\b)[a-z]{2,}/.test(kd) ||
      /\b(?:so|so nha|dia chi)\s*\d+[a-z]?(?:\/\d+)*\s+[a-z]{2,}/.test(kd) ||
      /^\s*\d+[a-z]?(?:\/\d+[a-z]?)+\s+[a-z]{2,}/.test(kd)) {
    // 17/09/2026 (Zalo thật): "Chào cháu, cô có căn nhà hẻm 4m Trần Hưng Đạo quận 5, 50m2, giá 5 tỷ 8…"
    // từng vào NGUYÊN CÂU làm vị trí (location_raw = cả câu, street = "Chào cháu"). Câu dài /
    // có dấu phẩy thì chỉ lấy mệnh đề địa chỉ (`bocViTriRao`), không lấy cả câu.
    // 29/09/2026 (kịch bản L7): "đường Phan Văn Trị phường 10" — phường đi riêng (ô phường), không dính vào địa chỉ.
    const dai = goc.length > 40 || /[,;]/.test(goc) || /(?:^|\s)(?:phường|phuong|p\.?)\s*\d{1,2}(?!\d)/iu.test(goc);
    return { question: "vi_tri", answer: dai ? (bocViTriRao(goc) ?? goc) : goc };
  }
  // 22/09/2026 (kịch bản D): "nhà cô đang cho thuê 30 triệu/tháng" là DÒNG TIỀN đang thu (doanh_thu →
  // rent_income_vnd), không phải giá thuê rao, không chỉ là hiện trạng. Xét trước luật giá.
  if (/\b(?:dang|co)\s+cho thue\b|\bcho thue\s+(?:duoc|lai)\b/.test(kd) &&
      (m = new RegExp(`${SO}\\s*(trieu|tr)(?![a-z])(?:\\s*(\\d{1,3})(?![\\d])(?!\\s*(?:thang|th\\b)))?\\s*(?:\\/|mot|moi|1|\\s)\\s*(?:thang|th)\\b`).exec(kd))) {
    return { question: "doanh_thu", answer: `${m[1].replace(",", ".")} triệu${m[3] ? ` ${m[3]}` : ""}/tháng` };
  }
  // "cách mặt tiền 30m" xét TRƯỚC độ rộng hẻm (kẻo "30m hẻm thông" thành hẻm 30m).
  if ((m = new RegExp(`\\bcach\\s*(?:mat tien|duong lon|duong chinh|mt)\\s*(?:khoang|tam|chung)?\\s*${SO}\\s*(?:m|met)?\\b`).exec(kd))) {
    return { question: "cach_mat_tien", answer: `${m[1]}m` };
  }
  // 14/09/2026 (bắn 14 tin bán): "hẻm rộng tầm 2m5 thôi em" không vào ô nào, bot hỏi lại
  // đúng câu hẻm rộng mấy mét. "2m5" = 2,5 m ("5m2" vẫn là diện tích — số sau m khác 2).
  if ((m = /\b(?:hem|hem truoc nha)\s*(?:rong\s*)?(?:la\s*|tam\s*|khoang\s*|chung\s*|co\s*|chi\s*)?(\d{1,2})\s*m\s*([013-9])(?!\d)/.exec(kd))) {
    return { question: "do_rong_hem", answer: `hẻm ${m[1]}.${m[2]}m` };
  }
  // Độ rộng hẻm: có đơn vị mét, hoặc số nhỏ (≤ 30) đứng cuối / trước dấu câu —
  // "hẻm 123 Trần Bình Trọng" là địa chỉ (đã bắt ở trên), không phải "hẻm 123m".
  if ((m = new RegExp(`\\b(?:hem|hem rong|hem truoc nha)\\s*(?:rong\\s*)?(?:la\\s*|tam\\s*|khoang\\s*|chung\\s*|co\\s*|chi\\s*)?${SO}\\s*(?:m|met)\\b`).exec(kd)) ||
      (m = new RegExp(`\\b(?:hem|hem rong|hem truoc nha)\\s*(?:rong\\s*)?(?:la\\s*)?(\\d{1,2}(?:[.,]\\d+)?)\\s*(?=$|[,.;!?]|\\s+(?:xe\\b|o to|oto|thong|cut|nha|em|anh|chi|a\\b))`).exec(kd)) ||
      (m = new RegExp(`${SO}\\s*(?:m|met)\\s*hem\\b`).exec(kd))) {
    return { question: "do_rong_hem", answer: `hẻm ${m[1]}m` };
  }
  // 25/09/2026 (ảnh chat thật): "hxh", "ô tô vô tận nhà", "xe hơi không vào được" cũng là câu về đường vào.
  if ((m = /\b(hxh|hxt|hxm|hem xe hoi|hem oto|hem o to|hem xe tai|hem xe may|hem ba gac|(?:xe hoi|o to|oto)\s+(?:(?:khong|ko|k|chua)\s+)?(?:vao|vo|toi|tới)(?:\s+(?:tan nha|toi nha|duoc|tan|toi|nha))?)\b(?:\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:m|met)\b)?/.exec(kdD))) {
    // 13/09/2026: cắt đúng cụm ("hẻm xe hơi 5m"), không lấy cả câu rao làm đáp án
    // — trigger đọc số ĐẦU TIÊN trong đáp án, câu "hẻm 102 … hẻm xe hơi" là ra 102.
    return { question: "do_rong_hem", answer: catGoc(m) };
  }
  // 20260909i: "cách mặt tiền 50m" là KHOẢNG CÁCH, không phải chiều ngang.
  if ((m = new RegExp(`\\bcach\\s*(?:mat tien|duong lon|duong chinh|mt)\\s*(?:khoang|tam|chung)?\\s*${SO}\\s*(?:m|met)?\\b`).exec(kd))) {
    return { question: "cach_mat_tien", answer: `${m[1]}m` };
  }
  // 17/09/2026 (Zalo thật): "ngang 5m còn dọc 18m" — có cả hai chiều là DIỆN TÍCH (DB nhân ra
  // m²), không phải câu vô danh rơi vào ô phường.
  {
    const nd = ngangDai(kd);
    if (nd) return { question: "dien_tich", answer: nd };
  }
  if ((m = new RegExp(`\\b(?:ngang|rong|mat tien|mt)\\s*(?:la\\s*)?${SO}\\s*(?:m|met)?\\b`).exec(kd)) &&
      !/\b(dai|sau|doc)\b/.test(kd)) {
    return { question: "mat_tien", answer: `${m[1]}m` };
  }
  // 27/09/2026 (test Zalo): "Nhưng dài tới 14 m" (ngang đã nói ở lượt trước) — chiều dài trơn là một mảnh DIỆN TÍCH; nơi gọi
  // ghép với ngang đã có (`ghepMotChieu`). Không có chữ ngang / rộng / mặt tiền trong câu.
  if ((m = new RegExp(`\\b(?:dai|chieu dai)\\s*(?:(?:la|toi|khoang|tam|co|gan|chung)\\s*)?${SO}\\s*(?:m|met)?(?![\\d.,]*\\s*(?:m2|x))`).exec(kd)) &&
      !/\b(ngang|rong|mat tien|mt|thue|hop dong|nam)\b/.test(kd)) {
    return { question: "dien_tich", answer: `dài ${m[1]}m` };
  }
  // 16/09/2026 (Zalo thật): "nhà 4 tấm diện tích tổng 240m2" — 240 là SÀN (cộng các
  // tầng), không phải đất; bản trước ghi area_m2 = 240. Diện tích sàn / sử dụng / xây
  // dựng là fact riêng `dien_tich_san`, DB không đổ vào cột đất. "tổng diện tích" chỉ
  // là sàn khi câu có tầng/tấm/lầu và không nói "đất".
  if ((m = DIEN_TICH_SAN_RE.exec(kd))) {
    return { question: "dien_tich_san", answer: `${m[1]}m2` };
  }
  if ((m = new RegExp(`${SO}\\s*(?:m2|m²|met vuong|mv)\\b`).exec(kd)) ||
      (m = new RegExp(`${SO}\\s*x\\s*${SO}`).exec(kd))) {
    return { question: "dien_tich", answer: m[0].replace(/\s+/g, " ") };
  }
  // Giá: khớp trên bản bỏ dấu GIỮ ĐỘ DÀI rồi cắt đúng đoạn gốc ("18 tỷ", "4 tỷ 5").
  if ((m = new RegExp(`${SO}\\s*(?:${TIEN_KD})(?![a-z])(?:\\s*${SO})?(?:\\s*(?:ruoi|thuong luong|tl))?`).exec(kdD)) &&
      // 15/09/2026 (bắn thật A2): "đang cho thuê 25 triệu/tháng" là thu nhập thuê, không phải giá.
      !TRUOC_LA_THUE.test(kd.slice(Math.max(0, m.index - 30), m.index))) {
    return { question: "gia", answer: catGoc(m) };
  }
  // 27/09/2026 (chủ dự án test Zalo): "Giá 8.000.000.000" — số ĐỒNG viết đủ có dấu nhóm nghìn, từ 100 triệu (dưới đó dễ
  // là tiền thuê / phí), không đứng sau chữ thuê.
  if ((m = /(?<![0-9.,])[1-9][0-9]{0,2}(?:[.,][0-9]{3}){2,}(?![0-9.,]*[0-9])/.exec(kdD)) &&
      (docTien(m[0]) ?? 0) >= 1e8 && !TRUOC_LA_THUE.test(kd.slice(Math.max(0, m.index - 30), m.index))) {
    return { question: "gia", answer: catGoc(m) };
  }
  // FR-241 (28/09/2026, bắn thật lx-72): "giá chín tỷ rưỡi" — số viết bằng CHỮ; `docTien` đọc được (soChuThanhSo), cửa
  // bắt giá thì chỉ biết chữ số nên câu rơi vào bổ sung. Cùng ngưỡng 100 triệu, cùng luật "không đứng sau chữ thuê".
  if ((m = GIA_CHU_RE.exec(kdD)) &&
      (docTien(m[0]) ?? 0) >= 1e8 && !TRUOC_LA_THUE.test(kd.slice(Math.max(0, m.index - 30), m.index))) {
    return { question: "gia", answer: catGoc(m) };
  }
  // Toà / tháp / block của chung cư — bắt TRƯỚC luật kết cấu, vì "toa S3.02 tang
  // 15" có chữ "tang" nên luật kết cấu vơ cả câu (bắt 10/09 ở lượt bắn 15 tin:
  // bản nháp in "🏗 Kết cấu: toa S3.02 tang 15 · tầng 15 · 2 phòng ngủ").
  // Chỉ nhận khi sau chữ toà/tháp/block là một MÃ (có số hoặc một chữ cái đơn) —
  // "toà nhà văn phòng" hay "block đất" thì không phải mã toà.
  // Số sau chữ toà/block mà đi kèm ĐƠN VỊ ĐẾM thì là số lượng, không phải mã toà:
  // "toà 20 phòng cho thuê" là hai mươi phòng — CI bắt được 10/09. Còn "toà S3.02
  // tầng 15" thì chữ "tầng" đứng sau mã là bình thường, vẫn nhận.
  if ((m = /\b(?:toa|thap|block|khoi)\s+([a-z]?\d[a-z0-9.\-]{0,6}|[a-z]\d?)(?!\s*(?:phong|can|nen|m2|ty|ti|trieu|tr|nha|xuong))(?=\s|$|,)/.exec(kd)) &&
      !/\b(toa nha|van phong|cong ty|nha xuong)\b/.test(kd)) {
    return { question: "toa_thap", answer: m[1].toUpperCase() };
  }
  // 20260909i: "xây tối đa 5 tầng" là TẦNG CAO CHO PHÉP của lô đất, không phải kết cấu nhà.
  if ((m = /\b(?:xay|cao)\s*(?:toi da|duoc)\s*(\d{1,2})\s*(?:tang|lau|tam)\b/.exec(kd))) return { question: "tang_cao_toi_da", answer: m[1] };
  // 30/09/2026: "1 phòng ngủ ngay tầng trệt" nói phòng ngủ ở đâu, không phải kết cấu nhà (đè "trệt 2 lầu sân thượng").
  if (((m = /\b(\d{1,2}|mot|hai|ba|bon|nam|sau)\s*(?:lau|tang|tam)\b/.exec(kd)) || /\btret\b/.test(kd)) && !PN_O_TANG_RE.test(kd)) {
    // 29/09/2026 (kịch bản L8): "à nhà 2 lầu thôi" (sửa lại) từng ghi nguyên câu — bỏ tiếng đệm đầu / cuối.
    const gonKc = goc.replace(/^(?:(?:à|ừ|ờ|ồ|dạ|thôi|nhầm|à nhầm)\s*,?\s*)+/iu, "")
      .replace(/(?:\s+(?:thôi|nha|nhé|nhe|em|ạ|a))+\s*[.!]*$/iu, "").trim();
    return { question: "ket_cau", answer: gonKc || goc };
  }
  if ((m = /\b(\d{1,2}|mot|hai|ba|bon|nam|sau)\s*(?:phong ngu|pn)(?![a-z])/.exec(kd)) && !PN_O_TANG_RE.test(kd)) {
    return { question: "so_phong_ngu", answer: m[1] };
  }
  if ((m = /\b(?:phuong|p)\.?\s*(\d{1,2})\b/.exec(kd))) {
    return { question: "phuong", answer: `Phường ${m[1]}` };
  }
  if (!NHA_KHAC_RE.test(kd)) {
    if ((m = /\b(?:xay|hoan cong|xd)\s*(?:nam\s*|tu\s*)?((?:19|20)\d{2})\b/.exec(kd))) {
      return { question: "nam_xay", answer: m[1] };
    }
    // 25/09/2026 (chủ dự án test Zalo): "nhà mới xây năm ngoái" từng vào bổ sung lẫn nhãn "mới xây" — năm xây đọc được.
    const nx = namXayTuongDoi(kd);
    if (nx) return { question: "nam_xay", answer: nx };
  }
  if ((m = /\bhuong\s*(?:dong|tay|nam|bac)(?:\s*(?:dong|tay|nam|bac))?\b/.exec(kdD))) return { question: "huong", answer: catGoc(m) };
  // FR-186: cho thuê — "cọc 2 tháng", "cọc 1 đóng 3"; "tăng 5%/năm", "trượt giá 10%".
  if ((m = /\bcoc\s*(\d{1,2})\s*(?:thang|th)?\b/.exec(kd)) || (m = /\b(\d{1,2})\s*thang\s*(?:tien\s*)?coc\b/.exec(kd))) {
    return { question: "tien_coc", answer: `cọc ${m[1]} tháng` };
  }
  if ((m = /\b(?:tang|truot gia|len)\s*(?:gia\s*)?(?:khoang\s*)?(\d{1,2})\s*%/.exec(kd)) || (m = /(\d{1,2})\s*%\s*(?:moi|1|mot)?\s*nam\b/.exec(kd))) {
    return { question: "truot_gia", answer: `${m[1]}%/năm` };
  }
  // 20260909i: câu hỏi bù sau đăng (chat 21/06 lượt 65–67, chat 07/09).
  if ((m = /\b(\d{1,2})\s*(?:wc|toilet|ve sinh|nha ve sinh)\b/.exec(kd)) || (m = /\b(?:wc|toilet)\s*(\d{1,2})\b/.exec(kd))) {
    return { question: "so_wc", answer: m[1] };
  }
  if ((m = new RegExp(`\\bcach\\s*(?:mat tien|duong lon|duong chinh|mt)\\s*(?:khoang|tam|chung)?\\s*${SO}\\s*(?:m|met)?\\b`).exec(kd))) {
    return { question: "cach_mat_tien", answer: `${m[1]}m` };
  }
  if ((m = new RegExp(`\\bno hau\\s*(?:la\\s*|hon\\s*|khoang\\s*)?${SO}\\s*(?:m(\\d)|m|met)?(?![a-z0-9])`).exec(kd))) return { question: "no_hau", answer: `${m[1].replace(",", ".")}${m[2] ? `.${m[2]}` : ""}m` };
  if (/\b(ngap|dong nuoc|khong ngap|ko ngap|kho rao|cao rao)\b/.test(kd) && /\b(mua|nuoc|ngap|cao rao|kho rao)\b/.test(kd)) {
    return { question: "ngap_nuoc", answer: goc };
  }
  if (/\b(hem thong|hem cut|quay dau|thong ra|khong thong|ko thong)\b/.test(kd)) return { question: "hem_thong", answer: goc };
  if (/\b(dang the chap|the chap|cam ngan hang|so cam tay|cam tay|trong ngan hang|ket sat)\b/.test(kd)) return { question: "the_chap", answer: goc };
  if (/\b(thuong luong|\btl\b|bot chut|fix|cung duoc|con bot|gia net|gia chot|(?:bot|giam)\s+(?:cho|xiu|it|them|chut)|(?:bot|giam)\s+(?:cho\s+)?nguoi\s+(?:o|thue)(?:\s+lau dai)?)\b/.test(kd) && !CO_TIEN_KD.test(kd)) {
    return { question: "thuong_luong", answer: goc };
  }
  // 25/09/2026 (bắn thật lx-19): "nhà trong hẻm" bỏ dấu là "nha trong hem" — "trong" (ở trong), không phải "trống".
  // 29/09/2026 (kịch bản K9): "đăng ở đâu vậy em?" — bỏ dấu thì "đăng ở" = "dang o" = "đang ở", thành hiện trạng. Câu CÓ dấu
  // thì phải khớp đúng chữ có dấu ("đang"); câu gõ không dấu mới dùng bản bỏ dấu.
  const coDauCau = /[\u00C0-\u1EF9đĐ]/.test(goc);
  // 29/09/2026 (kịch bản K5): đất vườn "đang trồng cây ăn trái" không vào hiện trạng (luật chỉ biết nhà: ở / cho thuê / trống).
  const hienTrangCoDau = /(?:^|[^\p{L}])(?:đang\s+ở|đang\s+cho\s+thuê|để\s+trống|nhà\s+trống|còn\s+ở|đang\s+thuê|đang\s+trồng|đang\s+nuôi|đất\s+trống)(?![\p{L}])/iu.test(goc);
  if (/\b(dang o|dang cho thue|de trong|nha trong(?!\s+(?:hem|ngo|kiet|ngach|khu|duong|xom|day|toa|chung cu|du an|kdc|so|lo))|con o|dang thue|dang trong\s+(?:cay|lua|rau|hoa|sau rieng|mit|xoai|tieu|ca phe|cao su|dieu|mia|thanh long|bap|chuoi|dua)|dang nuoi\s+(?:ca|tom|heo|ga|bo|vit|de)|dat trong(?!\s+(?:hem|ngo|kiet|ngach|khu|duong|xom|day|toa|chung cu|du an|kdc|so|lo)))\b/.test(kd) &&
      (!coDauCau || hienTrangCoDau) && !/\b(noi that|ban giao)\b/.test(kd)) return { question: "hien_trang_su_dung", answer: goc };
  const LY_DO_RE = /\b(ly do|dinh cu|ke tien|can tien|doi nha|chuyen cho|di nuoc ngoai|chia tai san)\b/;
  if (LY_DO_RE.test(kd)) return { question: "ly_do_ban", answer: manhKhop(LY_DO_RE) };
  // 25/09/2026 (chủ dự án test Zalo: "sang tên 1 nốt nhạc ko phải tiện ích"): "công chứng" là THỦ TỤC khi đi với sang tên /
  // ký / ra / làm / nhanh — chỉ là tiện ích khi nói phòng / văn phòng công chứng, hoặc gần công chứng.
  if (/\b(truong hoc|truong tieu hoc|phong gym|gym|gan cho\b|cho gan\b|sieu thi|benh vien gan)\b/.test(kd) ||
    (/\bcong chung\b/.test(kd) && /\b(?:(?:van )?phong cong chung|(?:gan|canh|sat|ke|doi dien)\b[^,.;]{0,20}\bcong chung)\b/.test(kd) &&
      !/\b(?:sang ten|ky|ra|lam|thu tuc|not nhac)\b/.test(kd))) return { question: "tien_ich_gan", answer: goc };
  if (/\b(can goc|lo goc)\b/.test(kd)) return { question: "can_goc", answer: goc };
  if (/\bthang may\b/.test(kd)) return { question: "thang_may", answer: goc };
  if (/\bview\b/.test(kd)) return { question: "view", answer: goc };
  if (/\b(pccc|phong chay)\b/.test(kd)) return { question: "pccc", answer: goc };
  if ((m = /\b(\d{1,3})\s*(?:phong|can)\s*(?:cho thue|dich vu|khach)\b/.exec(kd))) return { question: "so_phong", answer: m[1] };
  // 24/09/2026 (bắn 10 tin): "toà nhà CHDV 20 phòng" — số phòng cho thuê (không phải phòng ngủ), bot từng hỏi lại.
  if ((m = /\b(?:chdv|can ho dich vu|toa nha|nha tro|day tro)\b[^,.;]{0,12}?\b(\d{1,3})\s*phong\b(?!\s*(?:ngu|wc|tam|ve sinh))/.exec(kd))) return { question: "so_phong", answer: m[1] };
  if ((m = /\b(?:lap day|kin phong|full phong)\s*(?:khoang|tam)?\s*(\d{1,3})\s*%/.exec(kd)) || (m = /(\d{1,3})\s*%\s*(?:lap day|kin phong)/.exec(kd))) return { question: "ty_le_lap_day", answer: `${m[1]}%` };
  if (/\bdoanh thu\b|\bthu ve\b.*\bthang\b|\bdong tien\b/.test(kd)) return { question: "doanh_thu", answer: goc };
  if ((m = new RegExp(`\\b(?:cao|thong thuy|chieu cao)\\s*(?:khoang|tam)?\\s*${SO}\\s*(?:m|met)\\b`).exec(kd)) &&
    // 24/09/2026 (bắn 10 tin, kho xưởng): mảnh "cao 10m" tách khỏi câu rao (hay "cao 10m như anh nói rồi") không còn chữ
    // kho / xưởng đi kèm → rơi vào "📝 Thêm", bot hỏi lại thông thủy. Mảnh MỞ ĐẦU bằng "cao / chiều cao" thì nhận luôn.
    (/\b(xuong|kho|thong thuy|tran|tai trong|bien ap|kva|container|pccc)\b/.test(kd) || /^(?:chieu\s+)?cao\s*\d/.test(kd.trim()))) return { question: "chieu_cao", answer: `${m[1]}m` };
  if ((m = new RegExp(`\\b(?:tai trong)\\s*(?:san)?\\s*(?:khoang|tam)?\\s*${SO}\\s*(?:tan|t)\\b`).exec(kd))) return { question: "tai_trong_san", answer: `${m[1]} tấn/m2` };
  if ((m = new RegExp(`${SO}\\s*kva\\b`).exec(kd)) || (m = new RegExp(`\\b(?:tram|bien ap|dien)\\s*(?:khoang|tam)?\\s*${SO}\\s*kva`).exec(kd))) return { question: "tram_bien_ap", answer: `${m[1]} kVA` };
  if (/\b(nuoc thai|xu ly nuoc)\b/.test(kd)) return { question: "xu_ly_nuoc_thai", answer: goc };
  if (/\b(container|cont\b|xe cong)\b/.test(kd)) return { question: "duong_container", answer: goc };
  if (/\b(len tho cu|len tho|chuyen tho cu|chuyen muc dich)\b/.test(kd)) return { question: "len_tho_cu", answer: goc };
  // 30/09/2026 (bắn thử vector, nhà cấp 4): "nhà có giếng trời" từng thành "nguồn nước tưới" — giếng trời là khoảng lấy sáng.
  if (/\b(kenh|muong|tuoi tieu|nguon nuoc|gieng(?!\s*troi))\b/.test(kd)) return { question: "nguon_nuoc", answer: goc };
  if (/\b(cam coc|rao luoi|ranh gioi|ranh dat)\b/.test(kd)) return { question: "ranh_gioi", answer: goc };
  // "đất thuê nhà nước TỚI 2058" có mốc năm → thời hạn sử dụng; không có năm → hình thức thuê đất.
  if (/\b(toi|den|het|thoi han)\s*(?:nam\s*)?20\d\d\b/.test(kd) && /\b(thue|so huu|su dung|thoi han)\b/.test(kd)) return { question: "thoi_han_su_dung", answer: goc };
  if (/\b(tra (?:tien )?(?:thue dat )?(?:mot lan|hang nam|tung nam)|thue dat (?:hang nam|mot lan|nha nuoc)|dat thue)\b/.test(kd)) return { question: "hinh_thuc_thue_dat", answer: goc };
  if (/\b(lau dai|so huu lau dai|den nam 20\d\d|thoi han su dung|50 nam)\b/.test(kd) && !/\b(bot|giam|nguoi o|khach o|o lau dai)\b/.test(kd)) return { question: /\b(can ho|chung cu)\b/.test(kd) ? "so_huu" : "thoi_han_su_dung", answer: goc };
  if (/\b(mat do xay dung|mat do xd)\b/.test(kd)) return { question: "mat_do_xd", answer: goc };
  if (/\b(vuong vuc|bop hau|thop hau|meo|hinh dang)\b/.test(kd)) return { question: "hinh_dang", answer: goc };
  if (new RegExp(`\\bfit.?out\\s*(?:khoang|tam)?\\s*${SO}\\s*(?:ngay|thang|tuan)`).test(kd) || new RegExp(`\\b(?:mien phi|free)\\s*${SO}\\s*(?:ngay|thang|tuan)\\s*(?:sua|sua chua|setup|lam noi that)`).test(kd)) return { question: "fit_out", answer: goc };
  // 10/09 lần 7: "Anh đầu tư mua nhà cũ sửa lại bán, giờ có căn…" là chủ nhà KỂ VỀ
  // MÌNH (nghề của họ), không phải tiềm năng của căn — trước bản này nó vào bản nháp
  // thành "💡 Phù hợp: Anh đầu tư mua nhà cũ sửa lại bán". Câu mở bằng đại từ + nghề
  // thì hai luật cuối (muc_dich, tiem_nang) bỏ qua.
  const keVeMinh = /^(?:anh|chi|em|toi|minh|ba|chu|ong|co)\b[^,.]{0,20}\b(?:dau tu|chuyen|lam nghe|moi gioi|mua ban|buon|co nghe)\b/.test(kd);
  if (/\b(showroom|van phong cong ty|lam xuong|truong hoc|benh vien|nha hang)\b/.test(kd) && /\b(hop|phu hop|lam|mo)\b/.test(kd) && !keVeMinh) return { question: "muc_dich", answer: goc };
  // FR-186: đất — hạ tầng (cột điện, hố ga), xây tự do / theo mẫu; biệt thự — compound.
  if (/\b(cot dien|ho ga|tru dien|duong dam)\b/.test(kd)) return { question: "ha_tang", answer: goc };
  if (/\b(xay tu do|theo mau|mau chu dau tu|mau cdt|xay theo)\b/.test(kd)) return { question: "xay_dung", answer: goc };
  if (/\b(compound|biet lap|khu an ninh|bao ve 24)\b/.test(kd)) return { question: "khu_compound", answer: goc };
  if (/\b(quy hoach|lo gioi|giai toa)\b/.test(kd)) return { question: "quy_hoach", answer: goc };
  if (/\btranh chap\b/.test(kd)) return { question: "tranh_chap", answer: goc }; // FR-229
  if (/\b(noi that|ban giao|nha trong(?!\s+(?:hem|ngo|kiet|ngach|khu|duong|xom|day|toa|chung cu|du an|kdc|so|lo))|full nt)\b/.test(kd)) return { question: "noi_that", answer: goc };
  // FR-241 a: "không cho thuê, đang ở" là HIỆN TRẠNG, không phải tiềm năng "cho thuê".
  if (/\b(de o|cho thue|kinh doanh|mo quan|mo shop|chdv|dau tu|van phong|buon ban)\b/.test(kd) && !keVeMinh && !laViecRao &&
      !/\b(?:khong|ko|chua)\s+(?:cho thue|kinh doanh|buon ban|mo quan)\b/.test(kd)) {
    return { question: "tiem_nang", answer: goc };
  }
  return null;
}

// ── FR-177 a: câu hỏi KẾ TIẾP bám câu chủ nhà vừa nói ────────────────────────
// Nhóm ưu tiên cao nhất còn thiếu quyết định TẬP ứng viên (co_ban trước);
// trong tập đó, chọn câu LIÊN QUAN tới fact vừa ghi (nghe "ngang 5" thì hỏi
// diện tích, nghe "3 lầu" thì hỏi phòng ngủ), không có thì lấy câu đầu.
// Nhóm đọc từ cột `nhom` của view; view cũ không có cột thì tra bảng dưới.
export const NHOM_FACT: Record<string, "co_ban" | "chuyen_mon" | "phu"> = {
  loai_bds: "co_ban", phuong: "co_ban", vi_tri: "co_ban", dien_tich: "co_ban", dien_tich_dat: "co_ban",
  dien_tich_tim_tuong: "co_ban", tho_cu: "co_ban", gia: "co_ban", gap: "co_ban", mat_tien: "co_ban",
  huong: "phu", quy_hoach: "phu", nam_xay: "phu",
};
const LIEN_QUAN: Record<string, string[]> = {
  mat_tien: ["dien_tich_dat", "dien_tich", "dien_tich_tim_tuong", "tho_cu"],
  dien_tich: ["mat_tien", "gia"], dien_tich_dat: ["mat_tien", "tho_cu", "gia"],
  dien_tich_tim_tuong: ["gia"], tho_cu: ["len_tho_cu", "gia"],
  // 10/09: hỏi GẤP ngay sau giá ("mình cần ra hàng gấp hay được giá thì thôi").
  // (gap ở nhóm co_ban priority 10 = câu CUỐI của nhóm cơ bản, tức ngay sau giá theo thứ
  //  tự ưu tiên; không nối gia → gap để địa chỉ/phường còn thiếu vẫn được hỏi trước.)
  gia: ["phuong"], gap: ["do_rong_hem", "do_rong_duong", "ket_cau"], phuong: ["vi_tri", "dien_tich_dat", "dien_tich", "dien_tich_tim_tuong"],
  vi_tri: ["phuong", "do_rong_hem", "dien_tich_dat", "dien_tich"],
  loai_bds: ["phuong"],
  do_rong_hem: ["ket_cau", "mat_tien"], do_rong_duong: ["huong", "ha_tang", "mat_tien"],
  // FR-241 l (bắn lại 28/09, lx-85): nhà phố — phòng ngủ đã lùi sang dải 16–21 cùng pháp lý, nên nối ket_cau → so_phong_ngu
  // kéo phòng ngủ lên TRƯỚC pháp lý ngay sau câu kết cấu, trái ý chủ dự án ("để sau rồi hỏi"). Bỏ nối đó; căn hộ giữ tang → phòng ngủ.
  ket_cau: ["san_vuon", "phap_ly"], tang: ["so_phong_ngu", "huong"], so_phong_ngu: ["huong", "noi_that", "phap_ly"],
  // FR-186 (09/09/2026): chuỗi hỏi giống người cho chung cư / đất / biệt thự / cho thuê.
  huong: ["noi_that", "ha_tang", "phap_ly"], noi_that: ["phap_ly", "tien_coc"],
  ha_tang: ["xay_dung", "phap_ly"], xay_dung: ["phap_ly"],
  san_vuon: ["khu_compound", "do_rong_hem"], khu_compound: ["phap_ly"],
  // FR-223: câu nhánh pháp lý (chỉ có trong danh sách khi re-nhanh.ts thêm vào) đi NGAY sau câu pháp lý.
  phap_ly: ["hoan_cong", "giay_to_hien_co", "du_kien_ra_so", "ban_giao", "dong_so_huu_voi", "dong_y_ban", "tien_coc", "tiem_nang", "hinh_anh"], tiem_nang: ["hinh_anh"],
  hoan_cong: ["hinh_anh"], giay_to_hien_co: ["du_kien_ra_so", "ban_giao"], du_kien_ra_so: ["ban_giao", "hinh_anh"],
  dong_so_huu_voi: ["dong_y_ban"], dong_y_ban: ["hinh_anh"],
  // FR-229: câu pháp lý trước nháp. Ảnh (dải 24) chỉ được chọn khi hết câu pháp lý (dải 16–21) — tức câu pháp lý CUỐI dẫn
  // thẳng tới bản nháp như câu sổ trước đây (gấp để bản nháp lo, phường thiếu thì vẫn hỏi phường trước).
  nguoi_dung_ten: ["dong_y_ban", "hinh_anh"], the_chap: ["hinh_anh"], quy_hoach: ["hinh_anh"], tranh_chap: ["hinh_anh"],
  dien_tich_khop_so: ["hinh_anh"],
  tien_coc: ["thoi_han_thue"], thoi_han_thue: ["truot_gia"], truot_gia: ["hinh_anh"],
  hinh_anh: [],
};
export type CauThieu = { fact_key: string; priority?: number; nhom?: string | null };
export function chonCauKe(vuaNoi: string[], conThieu: CauThieu[]): string | undefined {
  if (!conThieu.length) return undefined;
  const nhom = (c: CauThieu) => c.nhom ?? NHOM_FACT[c.fact_key] ?? "chuyen_mon";
  // Nhóm trước, priority sau (10/09: `gap` co_ban priority 10 hoà `do_rong_hem`
  // chuyen_mon 10 — xếp theo priority đơn thuần thì nhóm cơ bản bị chen).
  const bac: Record<string, number> = { co_ban: 0, chuyen_mon: 1, sau_dang: 2, phu: 3 };
  const xep = [...conThieu].sort((a, b) => (bac[nhom(a)] ?? 1) - (bac[nhom(b)] ?? 1) || (a.priority ?? 0) - (b.priority ?? 0));
  const dau = xep[0];
  const ungVien = xep.filter((c) => nhom(c) === nhom(dau));
  // FR-219 (24/09/2026, chủ dự án chọn "hỏi theo thứ chủ nhà dễ trả lời … ko fix cứng"): câu liên quan vẫn được
  // chen lên, nhưng KHÔNG vượt dải — vật lý (<12) → tiền (12–15) → pháp lý (16–21, FR-229) → phường, gấp, ảnh (22+).
  // Nghe "diện tích" thì hỏi mặt tiền / kết cấu được, không kéo GIÁ lên trước kết cấu, phòng ngủ, hẻm.
  const dai = (p?: number) => p == null ? 0 : p < 12 ? 0 : p < 16 ? 1 : p < 22 ? 2 : 3;
  for (const k of [...vuaNoi].reverse()) {
    for (const lq of LIEN_QUAN[k] ?? []) {
      // 20261001c: phòng ngủ (nhà phố / cấp 4 / biệt thự) đứng ngay trước ảnh — câu nối "→ ảnh" (= gửi bản nháp) không nhảy qua nó.
      if (lq === "hinh_anh" && ungVien.some((u) => u.fact_key === "so_phong_ngu")) continue;
      const c = ungVien.find((u) => u.fact_key === lq);
      if (c && dai(c.priority) <= dai(dau.priority)) return lq;
    }
  }
  return dau.fact_key;
}

// ── FR-177 c: chủ nhà GẬT bản nháp? (AGREE_RULES, bản tiền định) ─────────────
// Gật = câu chỉ gồm từ đồng ý + tiểu từ, không có từ phủ định/sửa; hoặc emoji
// vui, like, tim. "ok nhưng sửa giá" là KHÔNG gật — sửa đi trước.
const TU_GAT = new Set(["da","vang","ok","oke","okie","okay","u","uh","um","duoc","dc","chuan","dung","dong","y","chot","len","dang","vay","tot","hay","dep","on","nhat","tri","xin","cam","on","yes","yep"]);
// 21/09/2026 (bắn thật kiem-cc2, chủ nhà là chú): "ok đăng đi cháu" KHÔNG gật vì bộ đệm chỉ có anh/chị/em —
// lời gật thành "thông tin bổ sung" và bản nháp gửi lại. Thêm cách xưng lớn tuổi (FR-176): cháu, chú, cô, bác, con.
const TU_DEM = new Set(["nha","nhe","nhen","em","e","a","roi","do","day","luon","di","thoi","ha","rat","qua","lam","cu","the","nhu","tin","vay","cho","chi","anh","minh","toi","ne","het","cai","nay","ma","chau","chu","co","bac","con","ong","ba"]);
const EMOJI_VUI = /(👍|❤️|❤|😍|🥰|😊|🙂|👌|🔥|💯|\[sticker|\[khach tha tim|\[thả tim|\[like)/;
/**
 * 02/10/2026 (test Zalo, ảnh chủ dự án): bridge gửi cú thả cảm xúc thành chữ "[khách thả cảm xúc /-strong]" (FR-142). Đó chỉ
 * là GẬT — không mang nội dung nào để trả lời câu "nhà mình thuộc loại nào". Nơi gọi dùng để im khi câu đang hỏi cần nội dung.
 */
export function laThaCamXuc(text: string): boolean {
  return /^\s*\[(?:khách|khach) thả cảm xúc[^\]]*\]\s*$/iu.test(text ?? "");
}
/**
 * SRS-5.1zzzzzzz22 (18/10/2026) — sticker Zalo cá nhân KHÔNG rõ sắc thái (bridge gán `[khách gửi sticker]`, thay "[sticker cảm xúc]" cũ từng
 * khớp EMOJI_VUI nên sticker bực cũng thành GẬT). Khác `laThaCamXuc` ở chỗ: sticker KHÔNG BAO GIỜ là gật, kể cả khi đang
 * hỏi duyệt — chỉ là tin rỗng nghĩa. Lớp lỗi bắt khi chat thử: chuỗi trung tính không được nhận là tin-rỗng nên lúc chờ
 * duyệt nó rơi xuống đường "sửa bản tin" → ghi bo_sung → in lên bài rao công khai.
 */
export function laStickerTrungTinh(text: string): boolean {
  return /^\s*\[(?:khách|khach) gửi sticker\]\s*$/iu.test(text ?? "");
}
/** Tin không mang chữ (thả cảm xúc hoặc sticker trung tính): không phải dữ liệu căn nhà, không tính là "tin mới hơn". */
export function laTinRongNghia(text: string): boolean {
  return laThaCamXuc(text) || laStickerTrungTinh(text);
}
export function laDongY(text: string): boolean {
  const goc = text.trim();
  if (!goc) return false;
  if (EMOJI_VUI.test(goc)) return true;
  const kd = boDau(goc).replace(/[^a-z0-9\s]/g, " ").trim();
  if (!kd) return false;
  if (/\b(khong|ko|k|chua|sua|doi|sai|nham|bo|them|thieu|nhung)\b/.test(kd)) return false;
  const tu = kd.split(/\s+/);
  return tu.every((w) => TU_GAT.has(w) || TU_DEM.has(w)) && tu.some((w) => TU_GAT.has(w));
}

// ── "Đủ rồi" — FR-177 g ───────────────────────────────────────────────────────
// Chủ dự án 09/09/2026: "điểm đầy đủ thì chỉ khách nói là đã đầy đủ tin rồi" —
// bot hỏi bù dần trong vài ngày, nhưng chủ nhà bảo "đủ rồi / vậy thôi / đừng
// hỏi nữa" thì NGỪNG hỏi. Điểm KHÔNG nhảy lên 100: nó vẫn đo theo dữ liệu thật,
// chỉ có vòng hỏi dừng lại (`listings.chu_noi_du_at`).
// Không phải "đủ rồi": "chưa đủ", "đủ 3 lầu" (số đi kèm là dữ liệu), "còn nữa".
const DU_ROI_RE =
  /\b(?:(?:vay|the|nhieu do|bay nhieu|nhu vay|nhu the|chi vay|toi day|toi do)\s*(?:la\s*)?(?:du|thoi|het)\b|(?:thong tin\s*)?(?:day\s*)?du\s*(?:thong tin\s*)?roi\b|het roi\b|khong con gi(?: nua| khac)?\b|(?:dung|khoi|thoi)\s*hoi\s*(?:nua|them)?\b|(?:chi|nhieu do|bay nhieu|vay)\s*thoi\b)/;
export function laDuRoi(text: string): boolean {
  const kd = boDau(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd) return false;
  // "chưa đủ", "còn nữa", "thiếu", "bổ sung thêm" là NGƯỢC lại.
  if (/\b(chua|con nua|thieu|bo sung|them cai|them cho)\b/.test(kd)) return false;
  // "đủ 3 lầu", "đủ 4 phòng" — số đi sau "đủ" là dữ liệu, không phải kết thúc.
  if (/\bdu\s+\d/.test(kd)) return false;
  // FR-229 (e2e PL229-E3): "đồng ý hết rồi" trả lời câu "các bên đồng ý bán chưa" — "hết rồi" ở đây là mọi người, không
  // phải "hết thông tin rồi"; nhận là đủ rồi thì bot bỏ luôn các câu pháp lý còn lại.
  if (/\b(?:dong y|thong nhat|ky)\s+het\b/.test(kd)) return false;
  return DU_ROI_RE.test(kd);
}

// ── Gật câu hỏi vai (27/09/2026, câu chào "anh chị cần giao bán bất động sản đúng không ạ?") ──
// CẢ câu chỉ gồm lời gật + tiểu từ / xưng hô: "đúng rồi", "dạ", "ừ em", "vâng đúng rồi anh bán". Có chữ nào khác
// ("không", "mua", "thuê", "chào") thì không phải gật — "đúng rồi anh muốn mua" đi đường cũ.
// "có" là gật nhưng "cô" (trả lời "cháu gọi chú hay cô") thì không — bỏ dấu cả hai đều là "co", nên xét chữ GỐC.
const LOI_GAT_VAI = new Set(["da", "vang", "u", "ua", "uh", "um", "o", "dung", "phai", "chuan", "ok", "oke", "okie", "yes", "yep"]);
const DEM_GAT_VAI = new Set([...LOI_GAT_VAI, "co", "roi", "a", "em", "nha", "nhe", "anh", "chi", "chu", "bac", "luon", "do", "day", "ban", "can",
  "minh", "toi", "tui", "ne", "the", "vay", "ha", "hen", "nhen", "chau", "con", "ong", "ba"]);
export function laGatHoiVai(text: string): boolean {
  const goc = (text ?? "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  if (!goc) return false;
  const w = goc.split(/\s+/);
  const kd = w.map((x) => boDau(x));
  if (w.length > 6 || !kd.every((x) => DEM_GAT_VAI.has(x))) return false;
  // "dạ cô" / "dạ chú" có thể chỉ là trả lời "cháu gọi chú hay cô" (câu chào hỏi cả hai) → cần lời gật RÕ ("đúng", "ừ", "có"…).
  const xungLonTuoi = w.some((x) => ["cô", "chú", "bác", "ông", "bà"].includes(x));
  return w.some((x, i) => (LOI_GAT_VAI.has(kd[i]) && !(xungLonTuoi && ["da", "o"].includes(kd[i]))) || x === "có");
}

/**
 * 27/09/2026 (test Zalo): câu chào hỏi "anh chị cần giao bán bất động sản đúng không ạ?", khách "Hay quá" → bot sang hàng người
 * mua hỏi "mua hay thuê". Câu CHUNG CHUNG — ≤ 4 chữ, không nói mua / thuê / bán / tìm / nhà đất / nơi chốn, không số, không hỏi —
 * không trả lời câu vai; hỏi lại một lần.
 */
export function laCauChungChung(text: string): boolean {
  const kd = boDau(text ?? "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd) return /\p{Extended_Pictographic}/u.test(text ?? ""); // chỉ biểu tượng cảm xúc
  if (/\d|\?/.test(`${kd}${text}`)) return false;
  if (kd.split(" ").length > 4) return false;
  return !/\b(?:mua|thue|ban|tim|kiem|can|nha|dat|can ho|chung cu|phong|mat bang|quan|phuong|duong|hem|gia|ty|trieu|khong|ko|chua|goi|alo)\b/.test(kd);
}

// ── "Gấp" — cột listings.gap ──────────────────────────────────────────────────
// Chủ dự án 09/09/2026: tình trạng gấp hay không cần cột riêng (cùng loại giao
// dịch, vị trí). true khi câu rao / câu chat nói bán gấp, cần tiền, thanh lý
// gấp, bán nhanh; false khi nói rõ "không gấp"; câu không nhắc gì → tầng trên
// giữ null (chưa rõ), không ép false.
export function laGap(text: string): boolean {
  const kd = boDau(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd) return false;
  if (/\b(khong|ko|k|chua|dau co|chang)\s*(?:can\s*)?gap\b/.test(kd)) return false;
  if (/\bgap\s*(doi|ba|lan|ruoi|\d)/.test(kd)) return false; // "gấp đôi", "gấp 3" là so sánh
  // 12/09/2026 (bắn 20 tin): "gia đình cần tiền nên để lại căn nhà…" bị gắn cờ
  // CẦN BÁN GẤP rồi in thẳng lên tin rao. Cần tiền là LÝ DO bán, không phải hạn
  // chót — chỉ tính gấp khi cùng câu có chữ bán/ra hàng/thanh lý/nhanh.
  if (/\bcan tien\b/.test(kd) && /\bcan tien\b[^.]{0,40}\b(ban|ra hang|thanh ly|nhanh|gap)\b/.test(kd)) return true;
  return /\b(ban|thue|thanh ly|can|ra|di)\s*(?:nha\s*|dat\s*)?gap\b|\bgap\s*(lam|qua|nha|nhe|em|a)?\b|\b(ban|di|ra)\s*nhanh\b/.test(kd);
}

// ── "Bán rồi / ngưng rao" — FR-184 (chat Gemini 21/06, chủ dự án chốt 09/09/2026) ──
// Chủ nhà tự báo: "bán rồi", "đã bán", "có người thuê rồi", "nhận cọc rồi" →
// `ban_roi` (tin sang da_chot); "ngưng bán", "không bán nữa", "rút tin", "để lại
// ở" → `rut` (tin ẩn). Không phải: câu hỏi ("bán rồi hả em?"), phủ định ("chưa
// bán", "vẫn đang bán"), lời rao ("bán nhà 5 tỷ"), hay số liệu ("chốt giá 5 tỷ").
export type NgungRao = "ban_roi" | "rut";
export function laNgungRao(text: string): NgungRao | null {
  // 28/09/2026 (e2e FR235-E3): "giờ anh bận rồi em" bỏ dấu thành "gio anh ban roi" = "bán rồi" → bot chúc mừng đã bán và GỠ TIN.
  // Có dấu thì "bận" / "bạn" không phải "bán" — thay bằng chữ không đọc được TRƯỚC khi bỏ dấu.
  const goc = text.trim().replace(/[bB][ậạẬẠ][nN]/gu, "bxn");
  if (!goc || /\?/.test(goc)) return null;
  const kd = boDau(goc).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd) return null;
  // Phủ định / còn bán / câu hỏi tình trạng → không phải lời báo ngưng.
  if (/\b(chua|van con|van dang|con ban|con cho thue|chua ai|chua co ai|chua chot|dang ban|dang cho thue|sao roi|the nao|ha|ha em|hong|khong a)\b/.test(kd)) return null;
  // "cho thuê CHỨ không bán" / "bán chứ không cho thuê" là đổi loại giao dịch (15/09), không phải rút tin.
  if (/\bchu\s+(?:khong|ko|k|hong)\s+(?:phai\s+)?(?:ban|cho thue)\b/.test(kd)) return null;
  // "chốt giá 5 tỷ", "bán 5 tỷ rồi" — có số + đơn vị tiền là dữ liệu, không phải báo bán.
  // 15/09: "gia 6ty2 shr … ko ban" — đơn vị dính số ("6ty2") không có biên từ
  // sau "ty" nên cửa này hụt, câu rao không dấu bị hiểu thành RÚT TIN. Đơn vị
  // kết thúc ở chỗ hết chữ cái là đủ, không đòi biên từ.
  if (/\d\s*(ty|ti|toi|trieu|tr|m2)(?![a-z])/.test(kd)) return null;
  // 24/09/2026 (chủ dự án test Zalo): "đã cho thuê là nhà đã hoàn thiện hết rồi em, đăng rao bán đi" → bị hiểu "bán rồi",
  // bot hỏi "mình đã bán căn nào". Lời GIỤC đăng ("đăng / rao bán đi") xét TRƯỚC mọi luật "bán rồi"; và "đã/đang cho thuê"
  // kèm chuyện hợp đồng / ngân hàng / dòng tiền là NHÀ ĐANG CÓ KHÁCH THUÊ (thông tin tin rao), không phải giao dịch xong.
  const giucDangTruoc = !/\bnua\b/.test(kd) && /\b(?:dang|rao)\b[^.]{0,12}\b(?:di|giup|gium|dum|ho|len)\b/.test(kd);
  if (giucDangTruoc) return null;
  const dangCoKhachThue = /\b(?:da|dang)\s*cho thue\b/.test(kd) &&
    /\b(?:hop dong|ngan hang|dong tien|thu nhap|khach thue|moi thang|hoan thien|kinh doanh)\b/.test(kd) &&
    !/\b(?:da ban|ban roi|ban duoc|chot roi|coc roi)\b/.test(kd);
  if (dangCoKhachThue) return null;
  // 05/10/2026 (SRS-5.1zzc, thăm dò câu keep-alive): "ngưng bán rồi" / "thôi không bán rồi" từng ra BÁN RỒI vì luật "bán … rồi"
  // xét trước — đó là lời DỪNG (đảo ngược được), không phải giao dịch xong (đóng tin + báo khách "đã bán").
  if (/\b(?:ngung|dung|thoi|het|khong|ko|k)\s*(?:ban|cho thue|rao)\s*(?:nua\s*)?(?:roi|r)\b/.test(kd) && !/\b(?:da ban|ban duoc|chot|coc)\b/.test(kd)) return "rut";
  const banRoi =
    /\b(?:da|vua)\s*(?:ban|cho thue|chot|nhan coc|giao dich|co nguoi (?:mua|thue)|sang ten|xong)\b/.test(kd) ||
    /\b(?:ban|cho thue|chot|giao dich|sang ten)\s*(?:duoc|xong|het|nha|dat|can|no)?\s*(?:roi|xong roi|r)\b/.test(kd) ||
    /\b(?:co nguoi|co khach)\s*(?:mua|thue|coc)\s*(?:roi|r)?\b/.test(kd) ||
    /\b(?:nhan|lay|da)\s*coc\s*(?:roi|xong)?\b/.test(kd) ||
    /\bban (?:duoc|xong) roi\b/.test(kd);
  if (banRoi) return "ban_roi";
  // HAI CỬA CHẶN trước khi kết luận "rút tin" — vì kết luận này PHÁ HUỶ: tin
  // sang `an`, mọi câu hỏi treo thành `expired`, nhắc bị huỷ. Bắt 10/09 bằng
  // review: `"thôi đăng đi em"` (chủ nhà GIỤC đăng) và `"không đăng ảnh nữa nha
  // em"` (từ chối gửi ảnh) đều ra `rut` — mồi chỉ cần "thoi|khong" đứng gần
  // "dang". Đúng luật chính file này tự viết ở đầu: thà hỏi lại một câu thừa
  // còn hơn đóng một câu hỏi bằng rác — mà ở đây còn nặng hơn: đóng cả tin rao.
  //
  //  (1) "đăng/rao ĐI, GIÚP, DÙM, LÊN, CHO" là lời GIỤC, không phải lời rút.
  //  (2) tân ngữ là ẢNH/HÌNH/VIDEO thì đó là chuyện gửi ảnh, không phải chuyện
  //      rao tin ("không đăng ảnh nữa", "thôi khỏi gửi hình").
  //
  // Chữ "nua" là dấu hiệu CHẤM DỨT ("không đăng NỮA", "ngưng bán NỮA"), nên khi
  // có nó thì cửa (1) mở ra — không nhầm lời giục được. Cửa (2) chỉ tính khi
  // ảnh/hình đứng NGAY SAU động từ: "anh" trần còn là cách xưng hô, chặn theo
  // chữ trần là giết luôn câu rút tin thật ("anh không bán nữa em ơi").
  const giucDang = !/\bnua\b/.test(kd) &&
    /\b(?:dang|rao|ban|cho thue)\b[^.]{0,12}\b(?:di|giup|gium|dum|ho|len)\b/.test(kd);
  const veAnh = /\b(?:dang|gui|up|chup|them|xoa|bo)\s+(?:anh|hinh|video|clip)\b/.test(kd);
  if (giucDang || veAnh) return null;
  // FR-241 a (10 ca test làm khó 28/09): tin BÁN, hỏi hiện trạng, chủ nhà "không cho thuê, đang ở" → bị hiểu RÚT TIN, tin
  // sang `an`. "không cho thuê" trần là HIỆN TRẠNG (nhà không có khách thuê); rút tin cho thuê phải có "nữa" hoặc động từ dừng.
  const khongChoThueTran = /\b(?:khong|ko|k)\s*cho thue\b(?!\s*nua)/.test(kd) && !/\b(?:ngung|dung|thoi|het)\b/.test(kd);
  if (khongChoThueTran && !/\b(?:rut|go|xoa|huy)\s*(?:tin|bai)\b/.test(kd)) return null;
  const rut =
    /\b(?:ngung|ngung|dung|thoi|het|khong|ko|k|chua muon)\s*(?:ban|cho thue|rao|dang)\s*(?:nua|nha|em|a|roi)?\b/.test(kd) ||
    /\b(?:rut|go|xoa|huy|bo|dong)\s*(?:tin|bai|dang|ky gui|rao|ho so)\b/.test(kd) ||
    /\b(?:de lai|giu lai)\s*(?:o|xai|dung|cho thue|nha|can)?\b/.test(kd) && /\b(khong|ko|thoi|ngung)\b/.test(kd) ||
    /\bkhong (?:ban|cho thue|rao) nua\b/.test(kd);
  return rut ? "rut" : null;
}

// ── Trả lời câu keep-alive "còn bán không" (SRD §VI 2.4, 05/10/2026, SRS-5.1zzc) ──
// LƯỚI ĐỠ khi AI không chạy. Đường chính: AI đọc theo nghĩa (`dong_y` với câu bot vừa hỏi = còn; `y_dinh` ban_roi / ngung_rao;
// `khong_dong_y` không kèm "bán rồi" = tạm ngưng — đảo ngược được, không gửi "đã bán" cho khách đang chờ).
// "còn em" / "vẫn đang bán nha" / "chưa bán được" / "ừ" → con · "bán rồi" → ban_roi (laNgungRao) · "không còn" / "hết rồi" /
// "ngưng bán" → rut · nói chuyện khác → null (tầng trên đi đường thường, câu còn treo).
export type TraLoiConBan = "con" | NgungRao;
export function docTraLoiConBan(text: string): TraLoiConBan | null {
  const goc = (text ?? "").trim();
  if (!goc) return null;
  const ng = laNgungRao(goc);
  if (ng) return ng;
  const kd = boDau(goc.replace(/[bB][ậạẬẠ][nN]/gu, "bxn")).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd || /\?/.test(goc)) return null;
  if (/\b(?:khong|ko|k|het|hong)\s*(?:con|ban|cho thue|rao)\b|\bhet roi\b/.test(kd)) return "rut";
  // Câu HỎI / câu có số ("giá giờ còn bao nhiêu được", "còn 2 căn") không phải lời xác nhận còn bán.
  if (/\b(?:bao nhieu|may|sao|the nao|duoc khong|khong em|hong)\b|\d/.test(kd)) return null;
  if (/\b(?:con|van|dang|chua)\s*(?:ban|cho thue|rao|con|chot|ai mua|ai thue)?\b/.test(kd) && kd.split(" ").length <= 8) return "con";
  if (laDongY(goc)) return "con";
  return null;
}

// Nhiều căn đang rao → chủ nhà chỉ căn nào? Nhận SỐ THỨ TỰ ("1", "căn 2", "cái
// thứ 2", "số 1") hoặc ĐỊA CHỈ (chữ ≥ 4 ký tự trong location_raw / số phường
// khớp câu). Không rõ → null, tầng trên hỏi lại.
export type CanChon = { id: string; location_raw?: string | null; ward?: string | null; code?: string | null; property_type?: string | null };
// Generic: trả về ĐÚNG kiểu người gọi đưa vào. Bản cũ trả `CanChon` hẹp nên
// chat-reply đọc `chon.deal` ra TS2339 dù lúc chạy trường đó có thật (bật kiểm
// kiểu bot 11/09).
/**
 * SRS-5.1zzl (05/10/2026, demo AOND): ngưng rao NHIỀU căn / CHỈ GIỮ vài căn — luật ĐỠ khi AI không chạy (AI đọc ở doc-y-luot).
 * Không ghi gì: chỉ mở câu xác nhận; gật ở lượt sau mới ẩn. Câu hỏi ("gỡ tin kiểu gì?") → null.
 *   "chỉ giữ căn A, ẩn hết còn lại" → chi_giu ["can a"]; "ngưng rao hết trừ căn Trần Hưng Đạo" → chi_giu ["can tran hung dao"];
 *   "gỡ hết đi" / "ẩn tất cả" → an_het; "ngưng căn Nguyễn Trãi" / "bán hết rồi" → null.
 */
export function laNgungHangLoat(text: string): { kieu: "chi_giu" | "an_het"; giu: string[] } | null {
  if (/\?/.test(text)) return null;
  const t = boDau(text);
  const dongTu = /\b(ngung|go|rut|an|xoa|khong ban|ko ban|k ban|dung rao|ngung rao|go tin|rut tin)\b/;
  const tatCa = /\b(het|tat ca|toan bo|sach|moi can|cac can|may can|con lai)\b/;
  const giuM = t.match(/\b(?:chi giu(?: lai)?|giu lai(?: moi| duy nhat)?|tru|ngoai)\s+((?:can|lo|ma)\s+[^,.;]+|[^,.;]+)/);
  if (/\bchi giu\b/.test(t) || ((/\b(tru|ngoai)\b/.test(t)) && dongTu.test(t) && tatCa.test(t))) {
    return { kieu: "chi_giu", giu: giuM ? [giuM[1].replace(/\b(an|go|ngung|rut)\b.*$/, "").trim()].filter(Boolean) : [] };
  }
  if (dongTu.test(t) && tatCa.test(t) && !/\b(ban het|ban duoc het|het hang|het roi)\b/.test(t)) return { kieu: "an_het", giu: [] };
  return null;
}

export function chonCanTheoCau<T extends CanChon>(text: string, cans: T[]): T | null {
  if (!cans.length) return null;
  const kd = boDau(text).replace(/[^a-z0-9\s/]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd) return null;
  if (cans.length === 1) return cans[0];
  const stt = /^(?:can|cai|so|thu|tin)?\s*(?:thu\s*)?(\d{1,2})\b\s*(?:nha|nhe|em|do|a)?$/.exec(kd) ||
    /\b(?:can|cai|tin|so)\s*(?:thu\s*)?(\d{1,2})\b/.exec(kd);
  if (stt) {
    const i = Number(stt[1]) - 1;
    if (i >= 0 && i < cans.length) return cans[i];
  }
  if (/\b(dau|dau tien|thu nhat|1st)\b/.test(kd)) return cans[0];
  if (/\b(cuoi|sau cung|con lai)\b/.test(kd)) return cans[cans.length - 1];
  // 22/09/2026 (kịch bản E): "rao lại căn chung cư đi" — chỉ MỘT căn là chung cư thì là căn đó.
  const loaiKd = /\b(?:chung cu|can ho|cc)\b/.test(kd) ? "chung_cu" : /\b(?:nha pho|nha hem|nha mat tien)\b/.test(kd) ? "nha_pho" : /\b(?:lo dat|dat)\b/.test(kd) ? "dat" : null;
  if (loaiKd) {
    const cung = cans.filter((c) => c.property_type === loaiKd);
    if (cung.length === 1) return cung[0];
  }
  let tot: T | null = null, diemTot = 0;
  for (const c of cans) {
    const tu = boDau(c.location_raw ?? "").replace(/[^a-z0-9\s/]/g, " ").split(/\s+/).filter((w) => w.length >= 4 || /^\d+(\/\d+)*$/.test(w) && w.length >= 2);
    let d = tu.filter((w) => kd.includes(w)).length;
    const p = /\bphuong\s*(\d{1,2})\b/.exec(boDau(c.ward ?? ""));
    if (p && new RegExp(`\\b(?:phuong|p)\\s*\\.?\\s*${p[1]}\\b`).test(kd)) d += 1;
    if (c.code && kd.includes(boDau(c.code))) d += 3;
    if (d > diemTot) { diemTot = d; tot = c; }
    else if (d === diemTot && d > 0) tot = null; // hoà → không đoán
  }
  return diemTot > 0 ? tot : null;
}

// ── "Rao lại / mở lại" — 22/09/2026 (kịch bản E) ─────────────────────────────
// Bot hứa "muốn rao lại nhắn em một tiếng là em mở lại liền" nhưng chưa có luật nào nhận.
// "mở lại căn 2", "rao lại căn chung cư đi", "đăng lại tin", "căn đó chưa bán, mở lại giúp".
// Không phải: câu hỏi; "bán lại giá tốt" (không có mở/rao/đăng/lên).
export function laRaoLai(text: string): boolean {
  const goc = (text ?? "").trim();
  if (!goc || /\?/.test(goc)) return false;
  const kd = boDau(goc).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd) return false;
  return /\b(?:rao|dang|mo|len|treo)\s+(?:tin\s+|can\s+\d\s+|can\s+)?lai\b/.test(kd) ||
    (/\b(?:chua ban|con ban|van con|chua chot|con nguyen|chua co ai)\b/.test(kd) && /\b(?:rao|dang|mo|len)\b/.test(kd));
}

/**
 * 29/09/2026 (kịch bản K7): "thôi em ơi nhà bán rồi" → tin gỡ; lượt sau "à không, chưa bán, vẫn bán nha" không khớp luật nào
 * (`laRaoLai` đòi chữ rao/đăng/mở) nên tin nằm luôn ở trạng thái đã chốt. "chưa bán" + lời khẳng định "vẫn bán / còn bán /
 * nhầm / à không" là RÚT LẠI lời báo bán. Chỉ dùng ngay sau lượt bot gỡ tin — "chưa bán, vẫn bán" còn là câu trả lời thường
 * cho câu hỏi "căn còn bán không" của tin đang rao.
 */
export function laRutLoiBan(text: string): boolean {
  const goc = (text ?? "").trim();
  if (!goc || /\?/.test(goc)) return false;
  const kd = boDau(goc).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return /\b(?:chua ban|chua chot|chua coc|chua ai mua)\b/.test(kd) && /\b(?:van ban|van rao|van con|con ban|nham|a khong|khong phai)\b/.test(kd);
}

// ── Tầng phụ — FR-220 (24/09/2026) ───────────────────────────────────────────
// Trả lời câu "nhà có tầng lửng, sân thượng hay tầng hầm không" → chen phần CÓ vào kết cấu chữ
// (`floors_text`): lửng sau "trệt", hầm đầu, áp mái / sân thượng cuối. Phủ định tính theo từng mảnh
// (phẩy, "nhưng", "còn"): "không có lửng, có sân thượng" → chỉ sân thượng; "lửng thì có, hầm không" → chỉ lửng.
// "có" trơn / "không có" / kết cấu còn trống → null (fact vẫn ghi, không đoán).
const PHU_DINH_TP = /^(?:khong|ko|k|chua|hong|hok)$/;
const TANG_PHU_RE = /\b(?:gac lung|lung|san thuong|tang ham|ham|ap mai)\b/g;
export function themTangPhu(floorsText: string | null | undefined, floors: number | null | undefined, answer: string): string | null {
  const kd = boDau(answer ?? "").replace(/[^a-z0-9,;.\s]/g, " ");
  if (/\?/.test(answer ?? "")) return null;
  const co = new Set<string>();
  for (const manh of kd.split(/[,;.]|\b(?:nhung|con)\b/)) {
    const tu = manh.trim().split(/\s+/).filter(Boolean);
    if (!tu.length) continue;
    const cau = tu.join(" ");
    const cuoi = tu.filter((t) => !/^(?:a|nha|nhe|em|anh|chi|ha|luon|nua|het|co)$/.test(t));
    const duoiPhuDinh = cuoi.length > 0 && PHU_DINH_TP.test(cuoi[cuoi.length - 1]);
    for (const m of cau.matchAll(TANG_PHU_RE)) {
      const truoc = cau.slice(0, m.index).trim().split(/\s+/).filter(Boolean);
      // Phủ định đứng TRƯỚC ("không có lửng") — "có" sau phủ định vẫn là phủ định.
      const iPd = truoc.map((t) => PHU_DINH_TP.test(t)).lastIndexOf(true);
      const truocPd = iPd >= 0 && !truoc.some((t, i) => i > iPd + 1 && t === "co");
      if (truocPd || duoiPhuDinh) continue;
      co.add(m[0] === "gac lung" ? "lung" : m[0] === "tang ham" ? "ham" : m[0]);
    }
  }
  if (!co.size) return null;
  let kc = (floorsText ?? "").normalize("NFC").trim();
  if (!kc && floors != null && floors >= 1) kc = floors === 1 ? "trệt" : `trệt + ${floors - 1} lầu`;
  if (!kc) return null;
  const kcKd = boDau(kc);
  let doi = false;
  if (co.has("lung") && !/\blung\b/.test(kcKd)) {
    const m = /trệt/iu.exec(kc);
    if (m) {
      const sau = kc.slice(m.index + m[0].length).replace(/^\s*\+?\s*/, "");
      kc = kc.slice(0, m.index + m[0].length) + " + lửng" + (sau ? ` + ${sau}` : "");
    } else kc += " + lửng";
    doi = true;
  }
  if (co.has("ham") && !/\bham\b/.test(kcKd)) { kc = `hầm + ${kc}`; doi = true; }
  if (co.has("ap mai") && !/\bap mai\b/.test(kcKd)) { kc += " + áp mái"; doi = true; }
  if (co.has("san thuong") && !/\bsan thuong\b/.test(kcKd)) { kc += " + sân thượng"; doi = true; }
  return doi ? kc : null;
}

// ── "4 tấm" / "4 tầng" có tính lửng? (01/10/2026) ────────────────────────────
// Chủ dự án 01/10: "nhà nếu có 4 tấm, tầng thì hỏi có tính gác lửng ko". Người Sài Gòn đếm tấm/tầng có khi gồm cả lửng
// ("4 tấm" = trệt + lửng + 2 lầu), có khi không (trệt + 3 lầu). Kết cấu chỉ nói SỐ tấm/tầng trơn → hỏi một câu; nói rõ
// lầu / trệt / lửng / gác thì không hỏi.
/**
 * SRS-5.1zzzzzg (test Zalo 12/10: "3 tầng có lửng" → lượt chốt tin ghi "trệt + lửng + 1 lầu", DB thì đọc "trệt + lửng + 2 lầu"): cụm
 * có nói RÕ lửng nằm TRONG hay NGOÀI số tấm / tầng không — "tính cả lửng", "gồm lửng", "lửng thêm nữa", "chưa tính lửng", "lửng riêng".
 * "có lửng" chỉ nói nhà CÓ lửng, không nói đếm thế nào.
 */
export const DEM_LUNG_RO = /\b(tinh|gom|bao gom|them|nua|ngoai|rieng)\b/;
/** Có N tấm / tầng + có lửng mà KHÔNG nói lửng trong hay ngoài N → hai cách hiểu, phải hỏi. Không có lửng / nói rõ / đã có trệt-lầu → null. */
export function lungChuaRoDem(s: string | null | undefined): { n: number; dv: "tấm" | "tầng" } | null {
  const kd = boDau(s ?? "");
  if (!/\b(lung|gac)\b/.test(kd) || DEM_LUNG_RO.test(kd)) return null;
  if (/\b(khong|ko|k|kg|khg|chua|hong|hok)\s+(?:co\s+)?(?:gac\s+)?(?:lung|gac)\b/.test(kd)) return null;
  return soTamCanHoiLung(kd.replace(/\b(?:gac\s+)?lung\b|\bgac\b/g, " "));
}
export function soTamCanHoiLung(ketCau: string | null | undefined): { n: number; dv: "tấm" | "tầng" } | null {
  const kd = boDau(ketCau ?? "");
  if (!kd.trim()) return null;
  // Nói lửng mà chưa rõ lửng trong hay ngoài số tầng ("3 tầng có lửng") vẫn phải hỏi — SRS-5.1zzzzzg.
  if (/\b(lung|gac)\b/.test(kd)) return lungChuaRoDem(kd);
  if (/\b(lau|tret|ham|cap 4|c4|ap mai)\b/.test(kd)) return null;
  if (/(duoc xay|xay duoc|cho xay|co the xay|xay len|xay them|nang len|len duoc|len toi)\s*(?:len|toi|den|them|toi da)?\s*\d+\s*(?:tam|tang)/.test(kd)) return null;
  // Khoảng "4-6 tầng", "4 tới 6 tầng" (02/10/2026: khách HỎI "Sao em biết nhà 4-6 tầng") không phải kết cấu một căn.
  if (/\d\s*(?:-|–|toi|den|hoac|hay)\s*\d{1,2}\s*(?:tam|tang)\b/.test(kd)) return null;
  const m = /\b(\d{1,2})\s*(tam|tang)\b(?!\s*ruoi)/.exec(kd);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 2 || n > 10) return null;
  return { n, dv: m[2] === "tam" ? "tấm" : "tầng" };
}

/**
 * Câu đáp câu lửng có nói lại SỐ tấm/tầng ("Nhà a 4 tầng tính cả lửng") → số đó (02/10/2026, test tay: bot hỏi "6 tầng đó có
 * tính cả gác lửng không", khách đáp "4 tầng tính cả lửng" → bot vẫn lấy 6 → "trệt + lửng + 4 lầu"). Không có / nhiều số → null.
 */
export function soTangTrongDapLung(answer: string): number | null {
  const kd = boDau(answer ?? "");
  const ds = [...kd.matchAll(/\b(\d{1,2})\s*(?:tam|tang)\b/g)].map((m) => Number(m[1]));
  if (new Set(ds).size !== 1) return null;
  const n = ds[0];
  return n >= 2 && n <= 10 ? n : null;
}

/**
 * Trả lời câu "N tấm đó có tính cả gác lửng không": "co" = lửng nằm TRONG N (trệt + lửng + N−2 lầu); "them" = có lửng
 * NGOÀI N tấm (trệt + lửng + N−1 lầu); "khong" = không lửng (trệt + N−1 lầu, như đã ghi); null = không rõ.
 */
const TU_DAP_LUNG = new Set(["co", "khong", "ko", "k", "kg", "khg", "chua", "hong", "hok", "tinh", "ca", "luon", "gom", "bao", "roi", "dung",
  "da", "vang", "ok", "oke", "u", "uh", "nha", "nhe", "nhen", "a", "em", "e", "anh", "chi", "c", "chu", "co", "bac", "ma", "do", "thoi", "vay", "the"]);
export function docTraLoiLung(answer: string): "co" | "them" | "khong" | null {
  const goc = answer ?? "";
  if (/\?/.test(goc)) return null;
  // 05/10/2026 (SRS-5.1zzb, test Zalo 17:30 "có em ơi" → "Không bóc tách được gì", lửng không ghi): tiểu từ / cách gọi cuối
  // câu ("em ơi", "nha anh", "ạ") lọc bằng BỘ CHUNG `DEM_CUOI_DAP_AN` / `TIEU_TU_DAU` như mọi câu trả lời khác — danh sách riêng
  // `TU_DAP_LUNG` thiếu "ơi" là câu đáp rõ ràng bị coi như không trả lời.
  const gonTieuTu = goc.replace(DEM_CUOI_DAP_AN, "").replace(TIEU_TU_DAU, "").trim();
  const kd = boDau(gonTieuTu || goc).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!kd) return null;
  const noiLung = /\b(lung|gac)\b/.test(kd);
  const phuDinh = /\b(khong|ko|k|chua|hong|hok|kg|khg)\b/.test(kd);
  const them = /\b(them|nua|ngoai|rieng|chua tinh|khong tinh|ko tinh|k tinh)\b/.test(kd);
  if (noiLung && them && /\b(co|con)\b/.test(kd)) return "them";
  // Không nhắc lửng mà có chữ khác ngoài lời đáp ("có sân thượng nữa em", "sổ hồng riêng") → không phải câu trả lời này.
  if (!noiLung && kd.split(" ").some((t) => !TU_DAP_LUNG.has(t))) return null;
  if (phuDinh) return "khong";
  if (laDongY(goc) || /\b(co|tinh ca|tinh luon|gom ca|gom luon|bao gom|tinh)\b/.test(kd)) return "co";
  return null;
}

/**
 * SRS-5.1zzzzy (khách mô phỏng 11/10: "không có gác lửng ạ, 4 tầng đầy đủ thôi" — 9 chữ): câu đáp câu lửng đã được đọc (sửa kết cấu)
 * thì các mảnh nói về lửng / số tầng thuộc về câu đó, không đi tiếp luồng thường (luồng đó ghi nguyên văn câu vào ô kết cấu, rồi tầng
 * DB thấy chữ "lửng" là bật có lửng). Bản cũ cắt theo độ dài (≤ 8 chữ) — một cụm chỉ trả lời một ô, không phải theo số chữ. Trả phần
 * CÒN LẠI (mảnh không nói lửng / số tầng); rỗng = cả tin là câu đáp lửng.
 */
export function phanNgoaiCauLung(answer: string): string {
  return (answer ?? "").split(/[,;.!\n]+/).map((m) => m.trim()).filter((m) => m &&
    docTraLoiLung(m) == null && soTangTrongDapLung(m) == null && !/\b(lung|gac)\b/.test(boDau(m))).join(", ");
}
/**
 * SRS-5.1zzzzy: hai cụm nói CÙNG một ý — so theo từ (bỏ dấu, bỏ hư từ), không theo chuỗi con: khách gõ "con chị ở Úc" để chỉ
 * ý thêm "con chị đang ở Úc nên cần bán". Đủ khi ≥ 3/4 từ của cụm ngắn nằm trong cụm dài (ít nhất 2 từ, cụm một từ thì 1).
 * Dùng cho xin bỏ ý dòng "Thêm" (`boYGhiChu`) và lọc chuyện riêng / ý đã bỏ khỏi kiến thức thêm (`boKeRieng`).
 */
const HU_TU_Y = new Set(["va", "voi", "cua", "la", "thi", "ma", "nen", "dang", "se", "da", "cai", "may", "dong", "cau", "ve", "chuyen", "nay", "do", "kia", "nha", "a", "ak", "nhe", "di", "ra", "lam", "qua", "roi", "thoi", "can", "minh", "chi", "anh", "em", "co", "chu", "bac"]);
export function trungY(a: string, b: string): boolean {
  const tu = (x: string) => boDau(x ?? "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length >= 2 && !HU_TU_Y.has(t));
  const [ta, tb] = [tu(a), tu(b)];
  const [ngan, dai] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  if (!ngan.length) return false;
  const trung = ngan.filter((t) => dai.has(t)).length;
  return trung >= Math.min(2, ngan.length) && trung / ngan.length >= 0.75;
}
/** Kết cấu chữ sau khi biết lửng: n tấm + đáp → { floors, floors_text } (floors = số tầng KHÔNG tính lửng). */
export function ketCauTheoLung(n: number, dap: "co" | "them" | "khong"): { floors: number; floors_text: string } {
  if (dap === "khong") return { floors: n, floors_text: n > 1 ? `trệt + ${n - 1} lầu` : "trệt" };
  const lau = dap === "co" ? n - 2 : n - 1;
  return { floors: lau + 1, floors_text: lau > 0 ? `trệt + lửng + ${lau} lầu` : "trệt + lửng" };
}

// ── Tên phường/xã nằm TRONG câu địa chỉ, gõ gần đúng (01/10/2026) ─────────────
// Chủ dự án 01/10: "lỡ người ta nói 156 đường 59 tây thông hội thì sao … trong data có danh sách quận đường phường xã
// rồi mà nếu gần giống thì lôi ra". Dò theo bảng `wards` (tên mới sau 07/2025): khớp đúng chuỗi chữ, đảo thứ tự chữ
// ("tây thông hội" ↔ Thông Tây Hội), hoặc sai ≤ 1 ký tự (tên ≥ 8 ký tự). Tên đứng ngay sau "đường / phố" hoặc ngay sau
// số nhà đầu câu là TÊN ĐƯỜNG ("156 Phú Thọ Hòa") — không nhận. Nhiều phường cùng khớp ở mức tốt nhất → null (không đoán).
export type PhuongDs = { ten: string; ten_day_du?: string | null; loai?: string | null; quan_cu?: string | null };
function sai1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, sai = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++sai > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return sai + (a.length - i) + (b.length - j) <= 1;
}
export function timPhuongTrongCau(cau: string, ds: PhuongDs[]): { phuong: PhuongDs; khop: string; ganDung: boolean } | null {
  const tu = boDau(cau ?? "").replace(/[,;.]/g, " , ").replace(/[^a-z0-9,\s]/g, " ").split(/\s+/).filter(Boolean);
  if (!tu.length) return null;
  // Tên phường mới trùng tên QUẬN cũ ("Gò Vấp", "Bình Thạnh", "Phú Nhuận") — không có chữ "phường" đi trước thì là quận.
  const tenQuan = new Set(ds.map((p) => boDau(String(p.quan_cu ?? "")).replace(/^(quan|huyen|thi xa|thanh pho)\s+/, "").trim()).filter(Boolean));
  let tot: Array<{ p: PhuongDs; muc: number; khop: string; ganDung: boolean }> = [];
  for (const p of ds) {
    const pt = boDau(p.ten ?? "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    const n = pt.length;
    if (n < 2 || /^\d/.test(pt[0])) continue;
    const ptSap = [...pt].sort().join(" ");
    const ptNoi = pt.join(" ");
    for (let i = 0; i + n <= tu.length; i++) {
      const cua = tu.slice(i, i + n);
      if (cua.includes(",")) continue;
      const noi = cua.join(" ");
      const muc = noi === ptNoi ? 3 : [...cua].sort().join(" ") === ptSap ? 2 : ptNoi.length >= 8 && sai1(noi, ptNoi) ? 1 : 0;
      if (!muc) continue;
      const truoc = tu[i - 1] ?? "", truoc2 = tu[i - 2] ?? "";
      // 02/10/2026 (bắn thử thu-kb-s02, SRS-5.1zh): "nhà ở Phú Nhuận" — cụm CHÍNH LÀ tên quận nên phường "Phú Nhuận" bị bỏ (đúng),
      // nhưng cùng cụm đó lại khớp SAI-MỘT-CHỮ với "Phú Thuận" (Quận 7) và lọt → tin Phú Nhuận ghi phường Quận 7. Cụm đúng bằng
      // tên một quận (không có chữ "phường" đứng trước) là nói QUẬN: không đem so gần đúng với phường nào.
      if (!/^(phuong|xa|p|f)$/.test(truoc) && tenQuan.has(noi)) continue;
      // Ngay sau là chữ cái đơn / số ("xã Vĩnh Lộc B", "Tân Định 2") → tên dài hơn (thường là đơn vị CŨ) — để đường tra cũ lo.
      if (/^([a-pr-z]|\d+)$/.test(tu[i + n] ?? "")) continue;
      const nhanPhuong = /^(phuong|xa|p|f)$/.test(truoc);
      if (!nhanPhuong && tenQuan.has(ptNoi)) continue;
      if (/^(quan|q|huyen|tp|thanh)$/.test(truoc)) continue;
      // Ngay sau "đường / phố", hay ngay sau số nhà đầu câu → tên ĐƯỜNG.
      // SRS-5.1zzzzzh (test Zalo 12/10: "hẻm 120 Trần Hưng Đạo quận 5" → "Trần Hưng" sai một chữ thành phường Tân Hưng): sau "hẻm / kiệt /
      // ngõ / số N" vẫn là TÊN ĐƯỜNG (hẻm của đường đó). Chỉ "đường N" (đường đánh số, "đường 59 Tây Thông Hội") mới cho chữ sau là phường.
      const laDuong = !nhanPhuong && (/^(duong|d|pho)$/.test(truoc) || (/^\d/.test(truoc) && (i - 1 === 0 || !/^(duong|d)$/.test(truoc2))));
      if (laDuong) continue;
      // Đảo chữ / sai chữ: phải đứng sau một RANH GIỚI (đầu câu, dấu phẩy, số, "phường", "ở"…) — "Phú Thọ Hòa" không thành
      // "Thới Hòa" chỉ vì đuôi "thọ hòa" gần giống.
      const ranhGioi = !truoc || truoc === "," || /^\d/.test(truoc) || /^(phuong|xa|p|f|o|tai|thuoc|khu|ben|gan)$/.test(truoc);
      if (muc < 3 && !ranhGioi) continue;
      tot.push({ p, muc: muc + (nhanPhuong ? 1 : 0), khop: noi, ganDung: muc < 3 });
    }
  }
  if (!tot.length) return null;
  const max = Math.max(...tot.map((t) => t.muc));
  tot = tot.filter((t) => t.muc === max);
  const ten = new Set(tot.map((t) => t.p.ten));
  return ten.size === 1 ? { phuong: tot[0].p, khop: tot[0].khop, ganDung: tot[0].ganDung } : null;
}

/**
 * SRS-5.1zzzzq (bắn production 09/10/2026): "chào em, chị muốn bán lô đất" → AI bóc tách trả RỖNG bốn lần liền (cả sau khi sửa
 * luật và thêm ví dụ mẫu); "chị muốn bán lô đất" → đúng ngay. Lời chào ĐẦU tin chỉ được cắt khỏi chữ GỬI CHO AI ĐỌC — không quyết
 * ý gì, không ghi gì; trích dẫn vẫn kiểm trên tin gốc (cụm sau lời chào vẫn nằm nguyên trong đó). Tin chỉ có lời chào → giữ nguyên.
 */
export function boLoiChaoDau(tin: string): string {
  const t = (tin ?? "").trim();
  // Sau chữ chào phải là cách gọi ("chào em") hoặc dấu câu ("hello,") — "chào giá 5 tỷ" (chào giá = báo giá) không phải lời chào.
  const m = /^(?:(?:dạ|da|vâng|vang)\s*,?\s*)?(?:xin\s+)?(?:chào|chao|hello|hi|alo)(?:\s+(?:em|anh|chị|chi|bạn|ban|cháu|chau|cô|co|chú|chu|bác|bac|shop|ad|admin|bot)(?:\s+(?:ơi|oi|nhé|nhe|nha))?\s*[,.!:;–-]*|\s*[,.!:;–-]+)\s+/iu.exec(t);
  if (!m) return t;
  const con = t.slice(m[0].length).trim();
  return con.length >= 3 ? con : t;
}

/**
 * SRS-5.1zzzzzza (Zalo thật 13/10/2026 16:44–16:53): lúc chờ duyệt, chủ nhà "Điều chỉnh cho mình giá 6,950 tỷ" / "Sửa cho chị giá từ 1,2 tỷ
 * thành 6,950 tỷ" bốn lần, lượt AI trả rỗng cả bốn, bot chỉ "Dạ em nghe rồi ạ". LƯỚI ĐỠ tất định, chỉ chạy khi AI đã đọc mà không ra ô nào:
 * câu có động từ SỬA (sửa / điều chỉnh / chỉnh / đổi / cập nhật / thay / để) + chữ "giá" + ít nhất một số tiền → lấy số tiền ĐỨNG SAU "thành /
 * là / còn / lại / =" nếu có, không thì số tiền CUỐI; khác giá đang ghi thì đó là giá mới. Trả đúng cụm khách gõ; không có → null.
 */
export function suaGiaTrongLoi(text: string, giaCu: string | null | undefined): string | null {
  const t = (text ?? "").normalize("NFC");
  const kd = boDau(t);
  if (!/\b(?:sua|dieu chinh|chinh lai|chinh|doi|cap nhat|thay|de lai|de)\b/.test(kd) || !/\bgia\b/.test(kd)) return null;
  const re = new RegExp(`\\d+(?:[.,]\\d+)?\\s*(?:${TIEN_CD})(?![\\p{L}])(?:\\s*\\d{1,3}(?![\\p{L}\\d/]|\\s*(?:m|phòng|phong|tầng|tang|lầu|lau|x)))?`, "giu");
  const ds = [...t.matchAll(re)];
  if (!ds.length) return null;
  const sau = ds.find((m) => /(?:thành|thanh|là|la|còn|con|lại|lai|=|->|→)\s*$/iu.test(t.slice(Math.max(0, m.index! - 8), m.index!)));
  const chon = (sau ?? ds[ds.length - 1])[0].trim();
  const moi = docTien(chon);
  if (moi == null) return null;
  const cu = giaCu ? docTien(giaCu) : null;
  if (cu != null && Math.abs(cu - moi) < 1) return null;
  return chon;
}
