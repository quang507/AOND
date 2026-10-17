// Bảng giá model — MỘT NGUỒN cho /admin (04/10/2026, SRS-5.1zv). Đô trên MỘT TRIỆU chữ-máy, giá niêm yết Anthropic
// (bảng cached 25/09/2026 trong skill claude-api; kiểm lại khi đổi model). Để trong code, không nhét vào DB: giá đổi thì
// sửa một chỗ, số chữ đã ghi trong `bot_usage_model` vẫn đúng mãi.
//
// Trước bản này /admin dùng một cặp hằng số GIA_VAO=5 / GIA_RA=25 (giá Opus) cho MỌI token → cao hơn thật 1,7× khi bot
// chạy Sonnet 4.6, 5× khi chạy Haiku 4.5, và tính tiền cho cả lượt Groq/Gemini vốn không đụng credit Anthropic.

export type GiaModel = { vao: number; ra: number; nhan: string };

/** Khớp theo tiền tố ID model (ID thật có đuôi ngày, vd `claude-haiku-4-5-20251001`). Thứ tự: cụ thể trước. */
const BANG_GIA: Array<[RegExp, GiaModel]> = [
  [/^claude-haiku-4-5/, { vao: 1, ra: 5, nhan: "Haiku 4.5" }],
  [/^claude-sonnet-4-6/, { vao: 3, ra: 15, nhan: "Sonnet 4.6" }],
  [/^claude-sonnet-4-5/, { vao: 3, ra: 15, nhan: "Sonnet 4.5" }],
  [/^claude-sonnet-5-5/, { vao: 2, ra: 10, nhan: "Sonnet 5.5" }],
  [/^claude-sonnet-5/, { vao: 2, ra: 10, nhan: "Sonnet 5" }],
  [/^claude-opus-5-5/, { vao: 4, ra: 20, nhan: "Opus 5.5" }],
  [/^claude-opus-(5|4-[6-8])/, { vao: 5, ra: 25, nhan: "Opus" }],
  // Đường dự phòng (FR-194): bậc miễn phí, không trừ credit Anthropic → 0 đô, nhưng vẫn hiện số chữ để biết nó chạy bao nhiêu.
  [/^(Groq|Gemini):/, { vao: 0, ra: 0, nhan: "dự phòng (Groq/Gemini)" }],
];

/** Hệ số bộ nhớ tạm: ghi cache nhớ 1 giờ = 2× giá vào (chat-reply dùng `ttl: "1h"`); đọc cache = 0,1× giá vào. */
export const HE_SO_NAP = 2;
export const HE_SO_DOC = 0.1;

/** Giá của một model; `null` = chưa có trong bảng (kể cả `khac` của dòng cũ) → không quy ra đô, không đoán. */
export function giaCua(model: string | null | undefined): GiaModel | null {
  const m = (model ?? "").trim();
  if (!m) return null;
  for (const [re, g] of BANG_GIA) if (re.test(m)) return g;
  return null;
}

export type DongToken = {
  model: string;
  in_tokens: number;
  out_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  /** Số lượt gọi model (20261004b); thiếu ở dòng cũ. */
  calls?: number;
};

/**
 * Ngưỡng prompt TỐI THIỂU để Anthropic chịu cache (token) — dưới ngưỡng thì `cache_control` im lặng không có tác dụng, không lỗi,
 * `cache_creation_input_tokens: 0` (tài liệu prompt caching, bảng theo model, đọc 04/10/2026). Không đều theo đời model:
 * Haiku 4.5 / Opus 4.6 = 4.096; Sonnet 4.6 / 4.5 = 1.024; Opus 5.5 / Sonnet 5.5 = 512. Đổi model là phải xem lại prompt nào còn cache.
 */
export function nguongCache(model: string | null | undefined): number | null {
  const m = (model ?? "").trim();
  if (/^claude-(haiku-4-5|opus-4-[56])/.test(m)) return 4096;
  if (/^claude-opus-4-7/.test(m)) return 2048;
  if (/^claude-(sonnet-4-[56]|opus-4-8|sonnet-5(?!-5))/.test(m)) return 1024;
  if (/^claude-(opus-5|sonnet-5-5|fable-5)/.test(m)) return 512;
  return null;
}

/** Tỷ lệ chữ đọc lại từ cache trên tổng chữ đầu vào (0–1); null khi chưa có chữ. */
export function tyLeDocCache(t: DongToken): number | null {
  const tong = t.in_tokens + t.cache_write_tokens + t.cache_read_tokens;
  return tong > 0 ? t.cache_read_tokens / tong : null;
}

/**
 * Cảnh báo cache không chạy cho một dòng (ngày × model Claude): đã gửi đủ nhiều chữ đầu vào mà KHÔNG đọc lại cache lần nào.
 * Nguyên nhân hay gặp: prompt dưới ngưỡng tối thiểu của model (xem `nguongCache`) — bot đổi sang Haiku 4.5 là ngưỡng nhảy
 * 1.024 → 4.096. Trả câu để /admin in; null = không có gì đáng nói. `toiThieuChu` = ngưỡng chữ để tránh báo trên ngày quá ít lượt.
 */
export function canhBaoCache(t: DongToken, toiThieuChu = 20_000): string | null {
  if (!/^claude-/.test(t.model)) return null;
  const vao = t.in_tokens + t.cache_write_tokens;
  if (vao < toiThieuChu || t.cache_read_tokens > 0) return null;
  const ng = nguongCache(t.model);
  return `${giaCua(t.model)?.nhan ?? t.model}: ${vao.toLocaleString("vi-VN")} chữ đầu vào mà không đọc lại cache lần nào${ng ? ` — model này chỉ cache prompt ≥ ${ng.toLocaleString("vi-VN")} token, prompt ngắn hơn là trả giá đầy đủ mỗi lượt` : ""}.`;
}

/** Đô của một dòng (ngày × model); `null` khi model chưa có giá. */
export function tienDong(t: DongToken): number | null {
  const g = giaCua(t.model);
  if (!g) return null;
  return (t.in_tokens * g.vao + t.out_tokens * g.ra + t.cache_write_tokens * g.vao * HE_SO_NAP + t.cache_read_tokens * g.vao * HE_SO_DOC) / 1_000_000;
}

/** Tổng đô của nhiều dòng — chỉ cộng dòng có giá; `chuaRo` = số dòng bỏ qua vì chưa rõ model/giá. */
export function tongTien(rows: DongToken[]): { tien: number; chuaRo: number } {
  let tien = 0, chuaRo = 0;
  for (const r of rows) { const d = tienDong(r); if (d === null) chuaRo++; else tien += d; }
  return { tien, chuaRo };
}
