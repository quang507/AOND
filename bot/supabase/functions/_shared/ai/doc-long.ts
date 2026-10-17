// ĐỌC LỎNG đầu ra có khuôn của model (02/10/2026, SRS-5.1ze).
//
// `zodOutputFormat()` của SDK GỠ `enum` khỏi JSON Schema gửi đi (nhét vào description — xem `groq.ts`), nên model
// KHÔNG bị ràng buộc theo danh sách khoá: thỉnh thoảng nó trả một khoá ngoài danh sách. Trước đây `parse` của SDK
// (và `safeParse` ở nơi gọi) gặp MỘT phần tử sai là ném / trả null — mất CẢ lượt bóc tách, dù 9/10 ô còn lại đúng.
// Bắt tại trận ở lượt bắn thử 02/10: `cap_nhat.khoa` ngoài `KHOA_GOP` → "Failed to parse structured output" → lượt
// đó AI coi như im, rơi về luật.
//
// Ở đây: phần tử mảng sai thì BỎ RIÊNG phần tử đó; trường cấp một sai thì đặt null (các trường phụ ở nơi gọi là
// `nullish`). Không đoán giá trị thay model — chỉ bỏ cái không đọc được.
import type { z } from "npm:zod@4";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";

type KetQuaDoc<T> = { success: true; data: T } | { success: false; data?: undefined };

/** Gọt dần chỗ sai cho tới khi khớp khuôn (tối đa 30 lượt gọt). Không gọt được thì `success: false`. */
export function docLong<T>(khuon: z.ZodType<T>, tho: unknown): KetQuaDoc<T> {
  if (tho === null || typeof tho !== "object") {
    const r = khuon.safeParse(tho);
    return r.success ? { success: true, data: r.data } : { success: false };
  }
  let x: unknown = JSON.parse(JSON.stringify(tho));
  for (let i = 0; i < 30; i++) {
    const r = khuon.safeParse(x);
    if (r.success) return { success: true, data: r.data };
    const duong = r.error.issues[0]?.path ?? [];
    let k = -1;
    for (let j = duong.length - 1; j >= 0; j--) if (typeof duong[j] === "number") { k = j; break; }
    if (k >= 0) {
      let cha: unknown = x;
      for (const b of duong.slice(0, k)) cha = (cha as Record<PropertyKey, unknown>)?.[b as PropertyKey];
      if (!Array.isArray(cha)) return { success: false };
      cha.splice(duong[k] as number, 1);
    } else if (duong.length >= 1 && typeof x === "object" && x !== null) {
      const o = x as Record<PropertyKey, unknown>;
      if (o[duong[0] as PropertyKey] === null) return { success: false }; // đã null mà vẫn sai → trường bắt buộc
      o[duong[0] as PropertyKey] = null;
    } else {
      return { success: false };
    }
  }
  return { success: false };
}

/**
 * Như `zodOutputFormat(guiDi)` nhưng `parse` KHÔNG ném khi model trả một khoá sai — đọc lỏng theo `doc` (mặc định
 * chính `guiDi`). Gọt không được thì trả JSON thô: nơi gọi vẫn `docLong` lại và tự quyết, không mất lượt vì SDK ném.
 */
export function dinhDangLong<T>(guiDi: z.ZodType<T>, doc: z.ZodType<unknown> = guiDi) {
  const f = zodOutputFormat(guiDi as never) as unknown as { type: "json_schema"; schema: Record<string, unknown> };
  return {
    type: f.type,
    schema: f.schema,
    parse: (noiDung: string): unknown => {
      const tho = JSON.parse(noiDung);
      const r = docLong(doc, tho);
      return r.success ? r.data : tho;
    },
  };
}
