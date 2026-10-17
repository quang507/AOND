// VAN CỦA LƯỢT PHÂN VAI BẰNG MODEL (FR-205, 11/09/2026) — phần TIỀN ĐỊNH, không import gì.
//
// Chủ dự án 11/09: "có thể dùng AI vào các chỗ quá cứng trong code không" → "gật".
// Vai người lạ (bán hay mua) quyết bằng luật trong chat-reply (`wantsSell`,
// `hoiMuaTho`). Luật chỉ bắt KIỂU câu đã gặp: lượt bắn 42 câu có 6 câu rao
// không chữ "bán" rơi về câu chào khuôn, PR #104 vá luật cho đúng 6 câu đó —
// câu thứ bảy nói khác đi lại rơi. Chỗ đó giờ hỏi model, nhưng model chỉ
// ĐỀ XUẤT; file này là hai cái van:
//   · `nenHoiModelVai` — có ĐÁNG tốn một lượt model không (người lạ, luật không
//     kết luận, câu có mùi nhà đất). Câu chào, "ok em", câu luật đã rõ: không gọi.
//   · `donVai` — dọn kết quả model: khuôn sai → bỏ; cụm chữ làm bằng phải có
//     NGUYÊN trong câu khách gõ (so bỏ dấu) — model bịa cớ thì coi như chưa rõ.
//
// Nằm riêng khỏi `_shared/ai/phan-vai.ts` vì luật `bot/tests/ranh-gioi.mjs`
// (tầng bóc tách chạy được mà không chạm model) và vì bun không nạp được
// specifier `npm:` — phần đáng kiểm phải đứng ở đây (`bot/tests/phan-vai.mjs`).

export type VaiModel = "ban" | "mua" | "chua_ro";

/** Bỏ dấu, hạ chữ thường, gộp mọi thứ không phải chữ/số thành một khoảng trắng. */
export function boDauGon(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Câu gõ CÓ dấu: soi bằng chữ có dấu — "nhà" khác "nha" (tiếng đệm "ok nha em"),
// "căn" khác "cần". Câu gõ không dấu thì chỉ còn cách soi bản không dấu.
const MUI_CO_DAU = /(nhà|căn|đất|mặt bằng|chung cư|phòng trọ|biệt thự|kho\b|xưởng|toà|tòa|shophouse|villa|dự án|sổ hồng|sổ đỏ|thổ cư|hẻm|mặt tiền)/i;
const MUI_KHONG_DAU = /\b(nha|can ho|chung cu|mat bang|phong tro|biet thu|xuong|du an|so hong|so do|tho cu|hem|hxh|mat tien|shophouse|villa)\b/;
// Số liệu của một căn — nói lên nhà đất bất kể có dấu hay không.
const SO_LIEU = /\d+\s*m2\b|\d+(?:[.,]\d+)?\s*x\s*\d+|\d\s*(?:ty|ti|toi|trieu|tr|cu)\b|\d(?:ty|t)\d/;
const CO_DAU = /[À-ỹ]/;

/** Câu có nói tới nhà đất không — rẻ, chạy trước mọi lượt gọi model. */
export function coMuiBDS(text: string): boolean {
  const t = text ?? "";
  const kd = boDauGon(t);
  if (SO_LIEU.test(kd)) return true;
  return CO_DAU.test(t) ? MUI_CO_DAU.test(t) : MUI_KHONG_DAU.test(kd);
}

export type DieuKienVai = {
  coHoSoBan: boolean;   // đã có dòng `sellers` — vai đã rõ
  raoTheoLuat: boolean; // luật đã nhận ra câu rao
  muaTheoLuat: boolean; // luật đã nhận ra ý định mua/thuê
  daCoHoSoMua: boolean; // hồ sơ nhu cầu đã có trường — khách cũ bên mua
  coAnh: boolean;       // gửi ảnh: model đọc ảnh ở đường riêng
  nhacMaCan: boolean;   // nhắc mã tin (từ web sang) — đi thẳng hàng mua
  doiGoi: boolean;      // "alo được không" — đường VOICE riêng
  text: string;
  // 07/10/2026 (SRS-5.1zzze): tin này trả lời CÂU HỎI VAI bot vừa gửi, và luật đáp vai (gật trơn, "có nhà", "bán") không ra.
  traLoiCauVai?: boolean;
  dapVaiTheoLuat?: boolean;
};

/** Có đáng tốn MỘT lượt model để phân vai không. */
export function nenHoiModelVai(d: DieuKienVai): boolean {
  if (d.coHoSoBan || d.raoTheoLuat || d.muaTheoLuat || d.daCoHoSoMua || d.coAnh || d.nhacMaCan || d.doiGoi) return false;
  const t = (d.text ?? "").trim();
  if (!t || t.length > 600) return false;
  if (t.length >= 8 && coMuiBDS(t)) return true;
  // Trả lời câu hỏi vai: câu ngắn không mùi nhà đất ("đúng rồi e", "chuẩn luôn") vẫn đáng một lượt model — luật gật chỉ
  // biết danh sách chữ đã gặp, câu khác đi một chữ là rơi về hỏi lại câu chào.
  return !!d.traLoiCauVai && !d.dapVaiTheoLuat;
}

/**
 * Dọn kết quả model. `null` = không dùng được (khuôn sai / model hỏng) → nơi gọi
 * đi đường cũ. `chua_ro` = hỏi vai như cũ. Chỉ `ban`/`mua` mới đổi đường đi, và
 * chỉ khi cụm làm bằng (≥ 4 ký tự sau khi gọn) nằm NGUYÊN trong câu khách gõ.
 */
export function donVai(k: unknown, text: string, toiThieu = 4): VaiModel | null {
  if (!k || typeof k !== "object") return null;
  const { vai, bang_chung } = k as { vai?: unknown; bang_chung?: unknown };
  if (vai !== "ban" && vai !== "mua" && vai !== "chua_ro") return null;
  if (vai === "chua_ro") return "chua_ro";
  const bc = boDauGon(typeof bang_chung === "string" ? bang_chung : "");
  // Lời gật trả lời câu hỏi vai thường rất ngắn ("ok", "ừ e") → nơi gọi hạ `toiThieu`; cụm là CẢ câu thì luôn nhận.
  const tg = boDauGon(text);
  if ((bc.length < toiThieu && bc !== tg) || !bc || !tg.includes(bc)) return "chua_ro";
  return vai;
}
