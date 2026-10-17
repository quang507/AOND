// nhung.ts — FR-216 (23/09/2026): vector NGHĨA của câu khách mua, để xếp kho theo nghĩa.
//
// Chủ dự án 23/09: "lưu bằng RAG … để sau này còn tìm kiếm bằng Semantic". Vector của TIN do DB tự tính
// (cron `nhung-tick`, migration 20260923e, taskType RETRIEVAL_DOCUMENT); ở đây chỉ nhúng CÂU TÌM
// (RETRIEVAL_QUERY) — cùng model, cùng 768 chiều thì mới so được.
//
// Tầng AI: không đọc/ghi bảng nào (bot/tests/ranh-gioi.mjs). Hỏng thì NÉM — nơi gọi giữ thứ tự kho cũ và
// ghi sổ; không bao giờ để câu trả lời khách chờ lâu vì bước xếp hạng phụ này (hạn mặc định 2,5 s).

const URL_NHUNG = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
export const SO_CHIEU = 768;

/**
 * Vector 768 chiều của câu tìm. e2e đặt `globalThis.__nhung = (text) => number[]` để khỏi gọi mạng.
 * 30/09/2026 (chủ dự án: "có cái key gemini free này, đưa vào kẻo lâu lâu thiếu api ko gọi dc"): nhận NHIỀU khoá
 * (GEMINI_API_KEY rồi GEMINI_API_KEY_2) — khoá trước hết hạn mức (429) thì thử khoá sau; lỗi khác ném luôn.
 */
export async function nhungCauTim(khoa: string | readonly string[], text: string, hanMs = 2500): Promise<number[]> {
  const gia = (globalThis as { __nhung?: (t: string) => number[] | Promise<number[]> }).__nhung;
  if (gia) return await gia(text);
  const ds = (typeof khoa === "string" ? [khoa] : [...khoa]).filter(Boolean);
  if (!ds.length) throw new Error("Gemini embed: không có khoá");
  let loi: Error | null = null;
  for (const k of ds) {
    try {
      return await nhungMotKhoa(k, text, hanMs);
    } catch (e) {
      loi = e as Error;
      if (!/^Gemini embed 429\b/.test(loi.message)) throw loi;
    }
  }
  throw loi!;
}

async function nhungMotKhoa(khoa: string, text: string, hanMs: number): Promise<number[]> {
  const r = await fetch(URL_NHUNG, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": khoa },
    body: JSON.stringify({
      content: { parts: [{ text: text.slice(0, 2000) }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: SO_CHIEU,
    }),
    signal: AbortSignal.timeout(hanMs),
  });
  if (!r.ok) throw new Error(`Gemini embed ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json() as { embedding?: { values?: unknown } };
  const v = j.embedding?.values;
  if (!Array.isArray(v) || v.length !== SO_CHIEU || !v.every((x) => typeof x === "number")) {
    throw new Error("Gemini embed trả khuôn lạ");
  }
  return v as number[];
}

/** Xếp lại `ds` theo thứ tự mã trong `thuTu` (mã có điểm nghĩa lên trước); mã không có điểm giữ thứ tự cũ, xếp sau. */
export function xepTheoNghia<T extends { code: string }>(ds: T[], thuTu: string[]): T[] {
  const hang = new Map(thuTu.map((c, i) => [c, i]));
  return ds
    .map((x, i) => ({ x, i, h: hang.get(x.code) }))
    .sort((a, b) => (a.h ?? 1e9) - (b.h ?? 1e9) || a.i - b.i)
    .map((o) => o.x);
}
