// ĐƯỜNG DỰ PHÒNG KHI MODEL CHÍNH CHẾT (FR-194).
//
// VÌ SAO. Sáng 10/09/2026 tài khoản Anthropic hết số dư: mọi lượt gọi trả 400
// "credit balance is too low", `chat-reply` rơi về CÂU MẪU tiền định. Bot vẫn
// trả lời nên nhìn bên ngoài KHÔNG khác gì — chủ dự án đọc lại bản ghi chỉ thấy
// "giọng cứng" mà không ai biết model đã chết 48 lượt liền. Câu mẫu giữ được
// việc chạy, nhưng không giữ được giọng.
//
// Groq nói giọng OpenAI, không phải Anthropic — cắm khoá vào SDK Anthropic là
// gãy. File này là lớp CHUYỂN ĐỔI: phơi ra đúng hai hàm mà 10 chỗ gọi đang dùng
// (`messages.create`, `messages.parse`) rồi dịch sang `POST /openai/v1/chat/
// completions`, dịch cả `usage` về đúng bốn ô mà `doTien` ghi sổ.
//
// THỨ TỰ do secret `MODEL_TRUOC` quyết (FR-194 b, 15/09/2026). Mặc định `groq`:
// Groq trả lời trước, chạm trần / hỏng thì Claude ngay trong cùng lượt. Đặt
// `claude` là về đường cũ: Claude trước, chỉ chen Groq khi lượt chính HỎNG vì
// hết tiền / quá nhịp / quá tải — đúng những mã lỗi liệt kê ở `nenDoiSang()`;
// lỗi khác (sai prompt, sai schema) vẫn ném lên như cũ, vì đổi model không
// chữa được chúng và nuốt lỗi ở đây là giấu một chỗ hỏng.
//
// GIỚI HẠN đã biết, đừng quên khi đọc kết quả:
//   · Groq KHÔNG có bộ nhớ tạm prompt → `cache_control` bị bỏ qua, hai ô
//     cache_read/cache_write ghi 0. Nhìn thẻ Chi phí Model thấy tỷ lệ đọc lại
//     tụt trong ngày chạy dự phòng là ĐÚNG, không phải hỏng.
//   · Các model Groq đang bật (gpt-oss-120b, qwen3.8-27b) KHÔNG nhìn được ảnh.
//     Lượt có ảnh bỏ qua nguồn Groq; chỉ Gemini đọc ảnh (SRS-5.1zzzzzzf, 13/10/2026 —
//     `image_url` dạng data URL qua cổng OpenAI). Không nguồn nào nhìn được thì ném
//     lỗi để tầng gọi đi đúng nhánh "không phân loại được → cất RIÊNG TƯ" (FR-185),
//     thay vì bịa ra nhãn ảnh từ chỗ không nhìn thấy gì. PDF (`document`) vẫn chỉ Claude.
//
// GEMINI (23/09/2026, chủ dự án đưa khoá sau khi Anthropic hết số dư lần hai và Groq
// bậc miễn phí chạm trần ngay với 3 khách): Gemini cũng có cổng nói giọng OpenAI
// (`/v1beta/openai/chat/completions`, khoá đi `Authorization: Bearer`), nên nó là một
// NGUỒN nữa trong cùng đường này, không phải một lớp chuyển đổi mới. Thăm dò cùng ngày:
// `gemini-3.8-flash` nhận `json_schema` strict (cả `anyOf` số nguyên / null, `enum`),
// nhưng phần NGHĨ ăn chung trần `max_completion_tokens` — trần 900 bị cắt giữa JSON;
// `reasoning_effort: "low"` thì dừng gọn (thử "minimal" bị 400 "not supported").

type Khoi = { type: string; text?: string; [k: string]: unknown };
type TinNhan = { role: string; content: string | Khoi[] };
export type ThamSo = {
  model?: string;
  max_tokens?: number;
  system?: Array<{ type: string; text: string; [k: string]: unknown }> | string;
  messages: TinNhan[];
  output_config?: { effort?: string; format?: unknown };
  [k: string]: unknown;
};
export type KetQua = {
  content: Array<{ type: string; text?: string }>;
  parsed_output?: unknown;
  stop_reason?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    /** 04/10/2026 (SRS-5.1zv): model THẬT đã trả lời, dạng "Groq:<model>" / "Gemini:<model>" — `doTien` ghi sổ theo model. */
    model?: string;
  };
};

const URL_GROQ = "https://api.groq.com/openai/v1/chat/completions";
const URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/** Một nguồn nói giọng OpenAI: khoá + danh sách model xoay vòng khi chạm trần. */
export type NguonOpenAI = { ten: "Groq" | "Gemini"; url: string; khoa: string; models: string[] };
const dsTu = (models: string) => models.split(",").map((m) => m.trim()).filter(Boolean);
export const nguonGroq = (khoa: string, models: string): NguonOpenAI => ({ ten: "Groq", url: URL_GROQ, khoa, models: dsTu(models) });
export const nguonGemini = (khoa: string, models: string): NguonOpenAI => ({ ten: "Gemini", url: URL_GEMINI, khoa, models: dsTu(models) });

/** Lỗi nào thì đáng đổi sang đường dự phòng — hết tiền, quá nhịp, quá tải, QUÁ HẠN (SRS-5.1zzzzo). */
export function nenDoiSang(e: unknown): boolean {
  const s = String((e as { message?: string })?.message ?? e ?? "");
  const ma = (e as { status?: number })?.status ?? 0;
  return ma === 429 || ma === 529 || ma === 500 || ma === 503 || ma === 504 || laHetHan(e) ||
    /credit balance is too low|insufficient|quota|rate limit|overloaded|billing/i.test(s);
}

// ─── SRS-5.1zzzzo (bắn production 09/10/2026: hai lượt 76–96 giây, lượt AI bóc tách tự nó 76–78 giây trong khi lượt thường 4–8 giây) ───
// Không lượt gọi model nào có HẠN: `fetch` tới Gemini / Groq không hẹn giờ (chờ tới khi máy chủ bên kia tự cắt), còn SDK Anthropic mặc
// định chờ 10 PHÚT và tự thử lại 2 lần, mỗi lần NGỦ đúng số giây máy chủ ghi ở `retry-after` (429 / 529 có thể tới 60 giây) — ngủ ngay
// trong lượt khách đang chờ, trong khi đường dự phòng đứng sẵn bên cạnh. Nay mỗi lượt gọi một hạn (theo trần chữ đầu ra), hết hạn là
// lỗi "quá hạn" đi ĐÚNG đường đổi nguồn như quá tải; SDK không tự ngủ — thử lại (một lần, ngủ ≤ 1,5 giây) chỉ khi không còn nguồn nào
// khác để đổi sang.
/** Hạn một lượt gọi model (ms): 8 giây + 8 ms mỗi chữ-máy đầu ra cho phép, trong [10 s, 30 s] — 2000 chữ (bóc tách) → 24 s, 512 → 12 s. */
export function hanGoiMs(p: { max_tokens?: number | null }): number {
  return Math.min(30_000, Math.max(10_000, 8_000 + (p.max_tokens ?? 1024) * 8));
}
/** Lỗi do hết hạn (của ta: `hetHan`; của SDK: APIConnectionTimeoutError "Request timed out"; của fetch: TimeoutError / AbortError). */
export function laHetHan(e: unknown): boolean {
  const o = e as { hetHan?: boolean; name?: string; message?: string } | null;
  return !!o && (o.hetHan === true || /^(?:TimeoutError|AbortError|APIConnectionTimeoutError)$/.test(o.name ?? "") || /timed out|timeout/i.test(o.message ?? ""));
}
/** Lỗi đáng THỬ LẠI cùng nguồn (khi không còn nguồn nào khác): quá nhịp, quá tải, lỗi máy chủ, đứt kết nối, quá hạn. Hết tiền thì không. */
export function nenThuLai(e: unknown): boolean {
  const s = String((e as { message?: string })?.message ?? e ?? "");
  const ma = (e as { status?: number })?.status ?? 0;
  if (/credit balance is too low|insufficient|billing/i.test(s)) return false;
  return ma === 408 || ma === 409 || ma === 429 || ma >= 500 || laHetHan(e) || /overloaded|rate limit|connection error/i.test(s);
}
/**
 * Gọi model chính với HẠN TỔNG `hanMs` cho cả lượt thử lại. `goi` nhận tuỳ chọn của SDK (`timeout`, `maxRetries: 0` — SDK không tự ngủ).
 * `thuLai`: lượt hỏng vì quá nhịp / quá tải / quá hạn thì thử lại MỘT lần sau ≤ 1,5 giây nếu còn ≥ 3 giây trong hạn — chỉ bật khi không
 * còn nguồn dự phòng nào để đổi sang (nơi gọi quyết). `ngu` thay được trong bài kiểm.
 */
export async function goiCoHan<T>(
  goi: (o: { timeout: number; maxRetries: number }) => Promise<T>, hanMs: number, thuLai: boolean,
  ngu: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  const het = Date.now() + hanMs;
  try {
    return await goi({ timeout: hanMs, maxRetries: 0 });
  } catch (e) {
    const con = het - Date.now();
    if (!thuLai || !nenThuLai(e) || con < 3_000) throw e;
    console.log(`model chinh loi (${String((e as { message?: string })?.message ?? e).slice(0, 80)}), thu lai mot lan`);
    await ngu(Math.min(1_500, con - 2_000));
    return await goi({ timeout: Math.max(2_000, het - Date.now()), maxRetries: 0 });
  }
}

/** system của Anthropic là MẢNG khối; OpenAI chỉ nhận một chuỗi. */
function gopHeThong(system: ThamSo["system"]): string {
  if (!system) return "";
  if (typeof system === "string") return system;
  return system.map((k) => k.text ?? "").filter(Boolean).join("\n\n");
}

/** Khối nội dung → chuỗi. Gặp ảnh thì DỪNG: model dự phòng không nhìn được. */
function gopNoiDung(content: TinNhan["content"]): string {
  if (typeof content === "string") return content;
  for (const k of content) {
    if (k.type === "image" || k.type === "document") {
      throw new Error("Model dự phòng không nhìn được ảnh — để tầng gọi đi nhánh cất riêng tư");
    }
  }
  return content.map((k) => k.text ?? "").filter(Boolean).join("\n");
}

// ─── SRS-5.1zzzzzzf (chủ dự án 13/10/2026: "gemini đọc ảnh các thứ còn dùng dc ko" → "Fix hết") ───
// Trước đây MỌI nguồn dự phòng mù ảnh: Claude quá hạn ở lượt phân loại ảnh (sổ lỗi 13/10 15:35 "Request timed out") → Gemini nhận
// lượt → ném "không nhìn được ảnh" → ảnh cất riêng tư, không đọc sổ. Gemini qua cổng OpenAI NHÌN được ảnh (`image_url` dạng data URL),
// nên nguồn Gemini đọc ảnh; Groq (gpt-oss / qwen) vẫn mù → lượt có ảnh bỏ qua nguồn Groq. PDF (`document`) vẫn chỉ Claude.
/** Trần một tấm ảnh gửi dự phòng (byte). Ảnh Zalo CDN vài trăm KB; quá trần thì thôi, để nhánh cất riêng tư. */
const TRAN_ANH_DU_PHONG = 6 * 1024 * 1024;
/** Khối ảnh Anthropic (`url` / `base64`) → data URL cho `image_url`. Ảnh `url` tải về (hạn 8 giây) rồi mã hoá — cổng Gemini chắc nhận data URL. */
async function anhThanhDataUrl(k: Khoi): Promise<string> {
  const src = (k.source ?? {}) as { type?: string; media_type?: string; data?: string; url?: string };
  if (src.type === "base64" && src.data) return `data:${src.media_type || "image/jpeg"};base64,${src.data}`;
  if (src.type === "url" && src.url) {
    const huy = new AbortController();
    const hen = setTimeout(() => huy.abort(), 8_000);
    try {
      const r = await fetch(src.url, { signal: huy.signal });
      if (!r.ok) throw new Error(`tải ảnh cho dự phòng: HTTP ${r.status}`);
      const mt = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim() || "image/jpeg";
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.byteLength > TRAN_ANH_DU_PHONG) throw new Error(`ảnh ${b.byteLength} byte quá trần dự phòng`);
      let s = "";
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return `data:${mt};base64,${btoa(s)}`;
    } finally {
      clearTimeout(hen);
    }
  }
  throw new Error("Khối ảnh không có url / base64");
}
/** Nội dung một tin cho nguồn OpenAI: Gemini nhận mảng phần (chữ + ảnh); Groq chỉ chữ (gặp ảnh thì ném như cũ). */
async function noiDungCho(nguon: NguonOpenAI, content: TinNhan["content"]): Promise<string | Array<Record<string, unknown>>> {
  if (nguon.ten !== "Gemini" || typeof content === "string") return gopNoiDung(content);
  if (!content.some((k) => k.type === "image" || k.type === "document")) return gopNoiDung(content);
  const phan: Array<Record<string, unknown>> = [];
  for (const k of content) {
    if (k.type === "document") throw new Error("Model dự phòng không đọc được tài liệu PDF — để tầng gọi đi nhánh cất riêng tư");
    if (k.type === "image") phan.push({ type: "image_url", image_url: { url: await anhThanhDataUrl(k) } });
    else if (k.text) phan.push({ type: "text", text: k.text });
  }
  return phan;
}

/**
 * Groq strict KHÔNG hiểu `$ref`. Bắt tại trận 15/09/2026 (lượt thật đầu tiên sau khi
 * đảo Groq lên trước): `zodOutputFormat()` biến `z.number().int().nullable()` (trường
 * `can` của boc-rao) thành `anyOf: [{$ref: "#/$defs/__schema0"}, {type: null}]`, Groq
 * trả 400 "anyOf branches must be disambiguated" — nó không nhìn xuyên `$ref` để biết
 * nhánh kia là integer. Thăm dò cùng ngày: giải `$ref` thành `anyOf: [{type:
 * integer}, {type: null}]` thì 200. Nên trước khi gửi, chép thân định nghĩa vào chỗ
 * tham chiếu rồi bỏ `$defs`. Khoá cạnh `$ref` (description…) giữ nguyên.
 * Có chặn sâu 30 tầng: schema đệ quy (zod recursive) thì thà gửi nguyên còn hơn treo.
 *
 * Cùng lượt: `zodOutputFormat()` GỠ `enum` ra khỏi schema và nhét vào description
 * dạng `{enum: ["ban","mua"]}` (Anthropic ràng buộc theo cách khác). Groq strict thì
 * HIỂU `enum`, và không có nó model tự bịa giá trị — thăm dò 15/09: `loai` trả
 * "GIAO_DICH_DIEM_DEN_DIEM_KHUE" trong khi danh sách chỉ có hai chữ; `safeParse` ở
 * nơi gọi gạt đi là mất cả lượt bóc. Nên đọc lại mảng đó và trả về đúng chỗ `enum`.
 * Đọc hụt (SDK đổi khuôn chữ) thì để nguyên — mất ràng buộc, không mất lượt.
 */
export function giaiThamChieu(schema: unknown): unknown {
  const goc = schema as Record<string, unknown> | null;
  if (!goc || typeof goc !== "object") return schema;
  const defs = (goc.$defs ?? {}) as Record<string, unknown>;
  const phucHoiEnum = (o: Record<string, unknown>): Record<string, unknown> => {
    if ("enum" in o || typeof o.description !== "string") return o;
    const m = /^(?:([\s\S]*?)\n\n)?\{enum: (\[[\s\S]*\])\}$/.exec(o.description);
    if (!m) return o;
    try {
      const ds = JSON.parse(m[2]);
      if (!Array.isArray(ds) || ds.length === 0) return o;
      const { description: _bo, ...conLai } = o;
      return m[1] ? { ...conLai, description: m[1], enum: ds } : { ...conLai, enum: ds };
    } catch {
      return o;
    }
  };
  const di = (n: unknown, sau: number): unknown => {
    if (sau > 30) return n;
    if (Array.isArray(n)) return n.map((x) => di(x, sau + 1));
    if (!n || typeof n !== "object") return n;
    const o = n as Record<string, unknown>;
    if (typeof o.$ref === "string") {
      const ten = o.$ref.replace(/^#\/\$defs\//, "");
      const { $ref: _bo, ...conLai } = o;
      const than = (defs[ten] ?? {}) as Record<string, unknown>;
      return di({ ...than, ...conLai }, sau + 1);
    }
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(phucHoiEnum(o))) if (k !== "$defs") r[k] = di(v, sau + 1);
    return r;
  };
  return di(goc, 0);
}

/** Lấy JSON Schema ra khỏi `output_config.format` do `zodOutputFormat()` dựng. */
function bocSchema(format: unknown): { name: string; schema: unknown } | null {
  const f = format as Record<string, unknown> | null;
  if (!f) return null;
  const trong = (f.json_schema ?? f.schema ?? null) as Record<string, unknown> | null;
  if (trong && typeof trong === "object" && "schema" in trong) {
    return { name: String(trong.name ?? "ket_qua"), schema: giaiThamChieu(trong.schema) };
  }
  if (trong) return { name: String(f.name ?? "ket_qua"), schema: giaiThamChieu(trong) };
  return null;
}

async function goiOpenAI(
  nguon: NguonOpenAI, model: string, p: ThamSo, schema: { name: string; schema: unknown } | null, hanMs: number = hanGoiMs(p),
): Promise<KetQua> {
  const messages = [
    ...(gopHeThong(p.system) ? [{ role: "system", content: gopHeThong(p.system) }] : []),
    // SRS-5.1zzzzzzf: Gemini nhận ảnh (mảng phần), Groq chỉ chữ — `noiDungCho`.
    ...(await Promise.all(p.messages.map(async (m) => ({ role: m.role, content: await noiDungCho(nguon, m.content) })))),
  ];
  const than: Record<string, unknown> = {
    model,
    messages,
    // Model suy luận tiêu ngân sách chữ cho phần NGHĨ trước khi viết câu trả lời,
    // nên trần của model chính (512) làm câu nhìn thấy bị cắt giữa chừng — bắt
    // 10/09: "Hẻm trước nhà rộng m". Cho lượt dự phòng ít nhất 900.
    max_completion_tokens: Math.max(p.max_tokens ?? 1024, 900),
    temperature: 0.6,
  };
  if (nguon.ten === "Groq") {
    // Model suy luận (qwen3.x) mặc định TRẢ KÈM đoạn nghĩ. Bắt tại trận 10/09:
    // một lượt trả về nguyên "<think> Here's a thinking process: 1. Analyze User
    // Input..." và bong bóng đó đi thẳng tới chủ nhà trên Zalo. Xin ẩn ở đây,
    // và vẫn cắt lại ở dưới — tham số này không phải model nào cũng nhận.
    than.reasoning_format = "hidden";
  } else {
    // Gemini: phần nghĩ tính vào trần chữ (xem khối đầu file) — nghĩ ít, trần rộng hơn.
    than.reasoning_effort = "low";
    than.max_completion_tokens = Math.max(p.max_tokens ?? 1024, 1500);
  }
  if (schema) {
    than.response_format = {
      type: "json_schema",
      json_schema: { name: schema.name, schema: schema.schema, strict: true },
    };
  }
  // SRS-5.1zzzzo: một HẠN cho cả lượt (gửi + đọc thân) — trước đây không hạn, chờ tới khi máy chủ bên kia tự cắt.
  const huy = new AbortController();
  const hen = setTimeout(() => huy.abort(), hanMs);
  let j: {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    const r = await fetch(nguon.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${nguon.khoa}`, "Content-Type": "application/json" },
      body: JSON.stringify(than),
      signal: huy.signal,
    });
    if (!r.ok) throw new Error(`${nguon.ten} ${r.status} ${(await r.text()).slice(0, 300)}`);
    j = await r.json();
  } catch (e) {
    if (huy.signal.aborted) throw Object.assign(new Error(`${nguon.ten} 504 quá hạn ${hanMs} ms (model ${model})`), { hetHan: true });
    throw e;
  } finally {
    clearTimeout(hen);
  }
  // Lưới thứ hai: cắt mọi khối nghĩ còn sót, kể cả khối chưa đóng thẻ (bị cắt
  // giữa chừng vì hết max_completion_tokens). Khách KHÔNG bao giờ được đọc nó.
  const tho = j.choices?.[0]?.message?.content ?? "";
  const txt = tho
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/^\s*(?:Here's a thinking process|Thinking process)[\s\S]*?(?:\n\n|$)/i, "")
    .trim();
  if (!txt) throw new Error(`${nguon.ten} 502 model ${model} trả rỗng sau khi cắt khối nghĩ`);
  const kq: KetQua = {
    content: [{ type: "text", text: txt }],
    stop_reason: "end_turn",
    usage: {
      input_tokens: j.usage?.prompt_tokens ?? 0,
      output_tokens: j.usage?.completion_tokens ?? 0,
      // Nguồn dự phòng không dùng bộ nhớ tạm prompt — hai ô này luôn 0, xem khối đầu file.
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      model: `${nguon.ten}:${model}`,
    },
  };
  if (schema) {
    try {
      kq.parsed_output = txt ? JSON.parse(txt) : null;
    } catch {
      kq.parsed_output = null; // tầng gọi đã có lưới regex, đừng ném
    }
  }
  return kq;
}

type CoMessages = {
  messages: {
    create: (p: ThamSo) => Promise<unknown>;
    parse: (p: ThamSo) => Promise<unknown>;
  };
};

/** Thứ tự gọi: model nào trả lời TRƯỚC (FR-194 b). */
/** "groq" = các nguồn dự phòng (Gemini / Groq, theo thứ tự danh sách) trả lời TRƯỚC; "claude" = Claude trước. */
export type ThuTuModel = "claude" | "groq";

/** Lượt có ảnh / tài liệu thì Groq mù — phải đi Claude, bất kể thứ tự. */
function coAnh(p: ThamSo): boolean {
  return p.messages.some((m) =>
    Array.isArray(m.content) && m.content.some((k) => k.type === "image" || k.type === "document")
  );
}

const loiCua = (e: unknown) => String((e as { message?: string })?.message ?? e);

/**
 * Bọc client chính bằng đường dự phòng Groq. `chinh` = null nghĩa là không có
 * khoá Anthropic — đi thẳng Groq.
 *
 * `thuTu` (FR-194 b, 15/09/2026 — chủ dự án: "dùng con groq trả lời trước nếu
 * bị chặn trần thì fall back về claude api liền luôn"):
 *   · `"groq"`  — Groq trả lời trước (rẻ, nhanh); hết nhịp cả danh sách model
 *     hay hỏng kiểu gì thì gọi Claude NGAY trong cùng lượt. Lượt có ảnh đi thẳng
 *     Claude vì Groq không nhìn được. Groq chạm trần là ĐƯỜNG ĐI BÌNH THƯỜNG của
 *     bậc miễn phí, nên chỉ `console.log`, không vào sổ lỗi (bài học 08/09).
 *   · `"claude"` — đường cũ: Claude trước, chỉ sang Groq khi `nenDoiSang()`.
 */
export function bocDuPhong(
  chinh: CoMessages | null,
  dsNguon: NguonOpenAI[],
  ghiSo?: (nguon: string, chiTiet: string) => Promise<void>,
  thuTu: ThuTuModel = "claude",
  /** SRS-5.1zzzzo: hạn một lượt gọi (mặc định `hanGoiMs`) — bài kiểm thay để đo không phải chờ thật. */
  o: { hanMs?: (p: ThamSo) => number } = {},
): CoMessages {
  // Bậc miễn phí Groq chặn nhịp THEO TỪNG MODEL. Đo 10/09: lượt đầu qua được,
  // lượt hai dính "Rate limit reached for model qwen/qwen3.8-27b" và rơi tiếp về
  // câu mẫu — tức là có lưới mà vẫn thủng. Nên mỗi nguồn nhận DANH SÁCH model
  // (GROQ_MODEL / GEMINI_MODEL ngăn bằng dấu phẩy): hết nhịp model này thì xoay
  // sang model kế, mỗi model một hạn mức riêng; hết một nguồn thì sang nguồn kế.
  const thuDuPhong = async (ten: "create" | "parse", p: ThamSo): Promise<KetQua> => {
    const schema = ten === "parse" ? bocSchema(p.output_config?.format ?? p._khuon_du_phong) : null;
    let cuoi: unknown = null;
    // SRS-5.1zzzzo: cả chuỗi dự phòng chung MỘT hạn (một lượt gọi) — xoay model / nguồn không được cộng dồn thời gian chờ của khách.
    const het = Date.now() + (o.hanMs ?? hanGoiMs)(p);
    const anh = coAnh(p);
    for (const n of dsNguon) {
      // SRS-5.1zzzzzzf: lượt có ảnh chỉ đi nguồn nhìn được ảnh (Gemini); Groq mù — bỏ qua, không ghi sổ lỗi (đường đi bình thường).
      if (anh && n.ten !== "Gemini") { console.log(`${n.ten} khong nhin duoc anh, bo qua nguon`); continue; }
      for (const m of n.models) {
        const con = het - Date.now();
        if (con < 1_500) throw cuoi ?? Object.assign(new Error("Dự phòng: hết hạn trước khi thử được nguồn nào"), { hetHan: true });
        try {
          return await goiOpenAI(n, m, p, schema, con);
        } catch (e) {
          cuoi = e;
          // Quá hạn: nguồn này đang chậm — xoay sang model / khoá khác của cùng chuỗi chỉ chờ thêm; trả về để nơi gọi sang model chính
          // (thứ tự `groq`) hay câu mẫu. Chậm là đường đi bình thường của nguồn miễn phí, không vào sổ lỗi.
          if ((e as { hetHan?: boolean }).hetHan) { console.log(`${n.ten} qua han, bo du phong: ${loiCua(e).slice(0, 120)}`); throw e; }
          // Hết nhịp / quá tải / QUÁ CỠ thì xoay model; lỗi khác (sai schema, sai
          // prompt) xoay trong CÙNG nguồn cũng vô ích — model nào cũng hỏng như nhau —
          // nên bỏ sang nguồn kế. 413 thêm 15/09: bậc miễn phí Groq trần chữ-mỗi-phút
          // THEO MODEL, prompt người mua ~14k chữ bị qwen trả "Request too large"
          // trong khi gpt-oss-120b còn nhận được.
          if (!/^(?:Groq|Gemini) (413|429|5\d\d)/.test(loiCua(e))) {
            // 30/09/2026: nguồn hỏng KHÔNG vì nhịp / quá tải (sai khoá, sai tên model, sai khuôn JSON…) là SỰ CỐ — trước đây
            // chỉ lỗi của nguồn CUỐI được ném lên (Claude "hết tiền"), lỗi Groq biến mất và không ai biết Groq hỏng vì sao.
            await ghiSo?.(`du phong hong - ${n.ten} ${m}`, loiCua(e).slice(0, 300));
            break;
          }
          // Xoay model là ĐƯỜNG ĐI BÌNH THƯỜNG của lưới dự phòng, không phải sự cố.
          // Ghi vào sổ lỗi là tự nuôi còi báo động (bài học escalation-feed 08/09).
          console.log(`${n.ten} het nhip, xoay khoi ${m}`);
        }
      }
    }
    throw cuoi ?? new Error("Dự phòng: không nguồn nào trả lời");
  };
  const chay = async (ten: "create" | "parse", p: ThamSo): Promise<unknown> => {
    if (thuTu === "groq" && chinh) {
      if (coAnh(p)) return await chinh.messages[ten](p);
      try {
        return await thuDuPhong(ten, p);
      } catch (e) {
        // Chặn trần / hỏng ở mọi nguồn dự phòng → Claude liền, cùng lượt. Claude mà cũng
        // hỏng thì ném lên như cũ — tầng gọi đã có sẵn nhánh câu mẫu.
        console.log(`Du phong chan tran/hong (${loiCua(e).slice(0, 120)}), doi sang model chinh`);
        return await chinh.messages[ten](p);
      }
    }
    if (chinh) {
      try {
        return await chinh.messages[ten](p);
      } catch (e) {
        if (!nenDoiSang(e)) throw e;
        await ghiSo?.(
          `model chinh hong - doi sang ${dsNguon[0]?.ten ?? "?"} ${dsNguon[0]?.models[0] ?? ""}`,
          loiCua(e).slice(0, 300),
        );
      }
    }
    return await thuDuPhong(ten, p);
  };
  return {
    messages: {
      create: (p: ThamSo) => chay("create", p),
      parse: (p: ThamSo) => chay("parse", p),
    },
  };
}
