// Hạ tầng dùng chung cho mọi edge function: client Supabase/Claude, đọc secret,
// gửi Zalo OA, đóng gói JSON response, và soạn text việc-nội-bộ.
// Mọi function PHẢI dùng ở đây thay vì tự viết lại — trước đây `db()`/`secret()`
// bị chép 5 bản, `sendZalo()` 2 bản, và text escalation trùng byte giữa `nudge`
// với `escalation-feed` (sửa một nơi quên nơi kia là lệch giọng bot ngay).
import Anthropic from "npm:@anthropic-ai/sdk";
import { bocDuPhong, goiCoHan, hanGoiMs, nguonGemini, nguonGroq } from "./groq.ts";
import { locThamSo } from "./tham-so-model.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// Model chính. Đổi được bằng secret `ANTHROPIC_MODEL` mà KHÔNG cần deploy —
// hết số dư hay muốn hạ giá thì sửa một dòng trong Vault là xong.
// Chủ dự án 10/09/2026 (còn ~15 đô số dư): "hạ bot xuống haiku 4.5 đi".
// Chủ dự án 02/10/2026 (sau test tay: Haiku đọc sót "được giá thì bán", xưng hô, kết cấu): "đổi sang sonet 4.6 đi" (SRS-5.1ze).
// Chủ dự án 03/10/2026 (tài khoản Anthropic hết credit lần nữa lúc ~09:05 UTC, sổ lỗi "credit balance is too low"):
// "lại hết rồi đổi sang haiku đi" — secret đặt cùng ngày qua `ban-thu`; mặc định trong code đổi theo để repo không lệch Vault.
export const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001";

/**
 * DẤU SỐNG của model chính (FR-192 b). Băng đỏ "hết số dư" ở /admin trước đây
 * chỉ đọc dấu vết CHẾT — dòng lỗi "credit balance is too low" trong 24 giờ —
 * nên chủ dự án nạp tiền xong, model gọi lại được, mà băng vẫn đỏ tới hôm sau
 * ("nãy giờ tao thấy vẫn còn 15 đô chứ hết đâu", 10/09/2026). Cần một thứ nói
 * "BÂY GIỜ nó vẫn chạy", và thứ đó chỉ có ở đây: lượt gọi vừa TRẢ VỀ.
 *
 * Tiết chế 2 phút một lần cho mỗi isolate — dấu này để người nhìn màn hình, độ
 * phân giải phút là quá đủ; đóng mỗi lượt là thêm một RPC vào mọi tin nhắn.
 */
const NHIP_DAU_MS = 120_000;
let dauLuc = 0;

/**
 * `thuLai` (SRS-5.1zzzzo): model chính là nguồn CUỐI (không có dự phòng, hay dự phòng đã trả lời trước) → hỏng vì quá nhịp / quá tải /
 * quá hạn thì thử lại một lần trong hạn. Có dự phòng đứng SAU (thứ tự `claude`) thì không — đổi nguồn nhanh hơn ngủ chờ cùng nguồn.
 */
function bocLocThamSo(c: Anthropic, db: SupabaseClient, thuLai = true): Anthropic {
  const dongDau = () => {
    const gio = Date.now();
    if (gio - dauLuc < NHIP_DAU_MS) return;
    dauLuc = gio;
    // Không await: dấu hỏng thì thôi, tuyệt đối không giữ chân câu trả lời khách.
    db.rpc("beat", { p_who: "model_chinh" }).then(
      () => {},
      () => {},
    );
  };
  // 04/10/2026 (SRS-5.1zv): gắn model THẬT trả lời vào `usage` để `doTien` ghi sổ theo model — nơi gọi chỉ chuyền `usage`,
  // không phải sửa 16 chỗ. Phản hồi Anthropic luôn có `model`; thiếu thì lấy MODEL đang cấu hình.
  const ganModel = (r: unknown) => {
    const o = r as { model?: unknown; usage?: { model?: string } | null } | null;
    if (o?.usage && typeof o.usage === "object" && !o.usage.model) o.usage.model = typeof o.model === "string" && o.model ? o.model : MODEL;
  };
  // deno-lint-ignore no-explicit-any
  const xong = <T,>(p: Promise<T>): Promise<T> => p.then((r) => { dongDau(); ganModel(r); return r; });
  // SRS-5.1zzzzo: mỗi lượt gọi một HẠN (`hanGoiMs`), SDK không tự ngủ theo `retry-after` (`maxRetries: 0`) — xem groq.ts.
  return {
    messages: {
      // deno-lint-ignore no-explicit-any
      create: (p: any) => xong(goiCoHan((o) => c.messages.create(locThamSo(p, MODEL), o), hanGoiMs(p), thuLai)),
      // deno-lint-ignore no-explicit-any
      parse: (p: any) => xong(goiCoHan(
        (o) => (c.messages as unknown as { parse: (x: unknown, o: unknown) => Promise<unknown> }).parse(locThamSo(p, MODEL), o),
        hanGoiMs(p), thuLai,
      )),
    },
  } as unknown as Anthropic;
}

/** Đếm lưu lượng Supabase của một lượt (03/10/2026, giảm egress): số lần gọi + byte phản hồi, gộp theo đường dẫn REST. */
export type DemLuuLuong = { so: number; byte: number; theo: Record<string, [number, number]> };

export function serviceClient(dem?: DemLuuLuong): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    dem ? {
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const res = await fetch(input, init);
          try {
            const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
            const khoa = `${init?.method ?? "GET"} ${url.pathname.replace(/^\/rest\/v1\//, "")}`;
            const b = (await res.clone().arrayBuffer()).byteLength;
            dem.so++;
            dem.byte += b;
            const t = dem.theo[khoa] ??= [0, 0];
            t[0]++;
            t[1] += b;
          } catch { /* đếm hụt không được chặn đường đi */ }
          return res;
        },
      },
    } : undefined,
  );
}

/** Tóm tắt bộ đếm cho sổ inbound: tổng + 10 đường dẫn tốn byte nhất. */
export function tomTatLuuLuong(dem: DemLuuLuong): Record<string, unknown> {
  const top = Object.entries(dem.theo).sort((a, b) => b[1][1] - a[1][1]).slice(0, 10).map(([k, [n, b]]) => `${k} ×${n} ${b}B`);
  return { so: dem.so, byte: dem.byte, top };
}

/**
 * SRS-5.1zzzzzzz (chủ dự án 14/10 "giảm độ trễ đi"): mỗi lượt chat-reply gọi `get_secret` ~8 lần (sổ lưu lượng `_luu_luong`). Giá trị ĐỌC
 * ĐƯỢC nhớ theo TỪNG client (mỗi request một client) tối đa 60 giây; null / lỗi KHÔNG nhớ (SEC-02, e2e "VAULT HỤT MỘT LẦN → đọc lại ngay").
 * Nhớ theo client chứ không theo cả isolate: request sau đọc lại Vault, nên xoá / xoay khoá có hiệu lực ngay lượt kế (e2e webhook CK-4 đổi
 * khoá giữa các ca và bắt được bản nhớ chung isolate đầu tiên).
 */
const NHO_BI_MAT_MS = 60_000;
const nhoBiMat = new WeakMap<object, Map<string, { v: string; luc: number }>>();
const layNho = (db: object, name: string): string | null => {
  const n = nhoBiMat.get(db)?.get(name);
  return n && Date.now() - n.luc < NHO_BI_MAT_MS ? n.v : null;
};
const datNho = (db: object, name: string, v: string) => {
  let m = nhoBiMat.get(db);
  if (!m) { m = new Map(); nhoBiMat.set(db, m); }
  m.set(name, { v, luc: Date.now() });
};

/** Secret lấy từ env (supabase secrets) trước, không có thì đọc Vault. */
export async function secretOf(db: SupabaseClient, name: string): Promise<string | null> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv;
  const nho = layNho(db, name);
  if (nho) return nho;
  const { data } = await db.rpc("get_secret", { secret_name: name });
  if (typeof data === "string" && data) datNho(db, name, data);
  return (data as string) ?? null;
}

/**
 * SEC-02 — `secretOf` gộp hai chuyện khác hẳn nhau vào cùng một `null`:
 * "secret CHƯA ĐẶT" và "ĐỌC HỤT secret" (Vault lỗi, DB quá tải, timeout, hết
 * kết nối). Cổng cũ coi cả hai là "mở", nên một lần DB nghẹn là bảy edge
 * function thành công khai — đúng lúc hệ thống yếu nhất. Hàm này tách hai
 * trạng thái ra để nơi gọi xử khác nhau: chưa đặt thì còn cân nhắc được,
 * đọc hụt thì luôn phải chặn.
 */
export async function docBiMat(
  db: SupabaseClient,
  name: string,
): Promise<{ giaTri: string | null; loi: string | null }> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return { giaTri: fromEnv, loi: null };
  const nho = layNho(db, name);
  if (nho) return { giaTri: nho, loi: null };
  const { data, error } = await db.rpc("get_secret", { secret_name: name });
  if (error) return { giaTri: null, loi: error.message };
  if (typeof data === "string" && data) datNho(db, name, data);
  return { giaTri: (data as string) ?? null, loi: null };
}

/**
 * SEC-11 — so hai chuỗi bí mật trong thời gian không phụ thuộc nội dung.
 * `===` trên chuỗi thoát ngay ở byte đầu khác nhau, nên đo thời gian phản hồi
 * qua nhiều nghìn request là dò dần được từng byte. `BRIDGE_SECRET` là bí mật
 * dài hạn nên kẻ tấn công có thừa thời gian. Băm cả hai vế rồi so từng byte
 * của bản băm: độ dài luôn bằng nhau (32 byte) nên vòng lặp không rò gì.
 */
export async function bangNhau(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const ax = new Uint8Array(x);
  const bx = new Uint8Array(y);
  let khac = 0;
  for (let i = 0; i < ax.length; i++) khac |= ax[i] ^ bx[i];
  return khac === 0;
}

export async function anthropicClient(db: SupabaseClient): Promise<Anthropic> {
  const apiKey = await secretOf(db, "ANTHROPIC_API_KEY");
  // FR-194: khoá dự phòng Groq / Gemini. Có khoá thì BỌC client chính lại — mọi chỗ
  // gọi (10 chỗ, cả create lẫn parse) tự có lưới mà không phải sửa chỗ nào. Không có
  // khoá dự phòng nào thì trả đúng client cũ, đường đi y như trước.
  const groqKey = await secretOf(db, "GROQ_API_KEY");
  const groqModel = (await secretOf(db, "GROQ_MODEL")) ?? "qwen/qwen3.8-27b";
  // FR-194 c (23/09/2026): Gemini, cùng cổng giọng OpenAI với Groq (xem groq.ts).
  const geminiKey = await secretOf(db, "GEMINI_API_KEY");
  // 30/09/2026 (chủ dự án): khoá Gemini thứ hai — khoá đầu chạm trần (429) thì chuỗi dự phòng thử khoá này.
  const geminiKey2 = await secretOf(db, "GEMINI_API_KEY_2");
  const geminiModel = (await secretOf(db, "GEMINI_MODEL")) ?? "gemini-3.8-flash";
  if (!apiKey && !groqKey && !geminiKey && !geminiKey2) throw new Error("Không tìm thấy ANTHROPIC_API_KEY, GROQ_API_KEY lẫn GEMINI_API_KEY (env lẫn Vault)");
  const coDuPhong = !!(groqKey || geminiKey || geminiKey2);
  // FR-194 b: ai trả lời TRƯỚC. Chủ dự án 15/09/2026: Groq trước, chặn trần thì
  // Claude liền. Đổi bằng secret `MODEL_TRUOC`, không cần deploy: `claude` = Claude
  // trước; `gemini` = Gemini → Groq → Claude; còn lại (`groq`) = Groq → Gemini → Claude.
  const truoc = coDuPhong ? (await secretOf(db, "MODEL_TRUOC"))?.trim().toLowerCase() : undefined;
  const thuTu = truoc === "claude" ? "claude" : "groq";
  // SRS-5.1zzzzo: `maxRetries: 0` — SDK không tự thử lại / ngủ theo `retry-after`; thử lại (nếu có) do `goiCoHan` quyết trong hạn.
  const chinh = apiKey ? bocLocThamSo(new Anthropic({ apiKey, maxRetries: 0 }), db, !coDuPhong || thuTu !== "claude") : null;
  if (!coDuPhong) return chinh!;
  const gq = groqKey ? [nguonGroq(groqKey, groqModel)] : [];
  const gm = [geminiKey, geminiKey2].filter((k): k is string => !!k).map((k) => nguonGemini(k, geminiModel));
  const dsNguon = truoc === "gemini" ? [...gm, ...gq] : [...gq, ...gm];
  const ghiSo = async (nguon: string, chiTiet: string) => {
    try {
      await db.rpc("log_loi", { p_source: nguon, p_detail: chiTiet, p_code: null });
    } catch { /* đồng hồ hỏng thì thôi, đừng làm hỏng lượt trả lời khách */ }
  };
  // `bocDuPhong` chỉ cần hai hàm `messages.create/parse` — client thật khớp về
  // cấu trúc nhưng kiểu SDK rộng hơn nhiều, nên ép qua `unknown` ở MỘT chỗ này.
  return bocDuPhong(
    chinh as unknown as Parameters<typeof bocDuPhong>[0], dsNguon, ghiSo, thuTu,
  ) as unknown as Anthropic;
}

/**
 * Client Claude KHÔNG bọc lưới dự phòng — cho trợ lý có công cụ (SRS-5.1y). Lưới Groq/Gemini (`groq.ts`) dịch lượt
 * gọi sang giọng OpenAI và BỎ `tools`, nên lượt có công cụ đi qua đó sẽ ra chữ trơn như thể model không gọi công cụ nào.
 * Không có khoá Anthropic → null, nơi gọi đi đường cũ.
 */
export async function anthropicTrucTiep(db: SupabaseClient): Promise<Anthropic | null> {
  const apiKey = await secretOf(db, "ANTHROPIC_API_KEY");
  // SRS-5.1zzzzo: trợ lý hỏng thì đường JSON cũ trả lời ngay trong lượt — đó là đường đổi nguồn, không thử lại ở đây.
  return apiKey ? bocLocThamSo(new Anthropic({ apiKey, maxRetries: 0 }), db, false) : null;
}

/**
 * FR-152 — ghi một lỗi tầng ứng dụng vào sổ bền `bot_errors` (hiện ở /admin).
 *
 * `console.error` KHÔNG đủ: log edge function bậc Free chỉ giữ 1 ngày, mà loại
 * lỗi nguy nhất ở đây lại trả 200 (catch nuốt exception rồi hàm chạy tiếp), nên
 * bot_health_tick — vốn chỉ soi mã HTTP — không thấy gì. Vẫn giữ console.error
 * để đọc realtime lúc đang debug, và ghi thêm vào sổ để mai còn tra được.
 *
 * KHÔNG BAO GIỜ NÉM. Mọi nơi gọi hàm này đều đang ở trong `catch` — ném ở đây
 * là biến một lỗi thành hai, mà lỗi thứ hai còn không ai bắt.
 */
export async function ghiLoi(
  db: SupabaseClient,
  source: string,
  detail: unknown,
  code?: number,
): Promise<void> {
  const text = detail instanceof Error
    ? (detail.message || String(detail))
    : String(detail ?? "");
  console.error(`${source}:`, text);
  try {
    await db.rpc("log_loi", { p_source: source, p_detail: text, p_code: code ?? null });
  } catch { /* sổ hỏng thì thôi, đừng kéo theo cả luồng chính */ }
}

/**
 * Đồng hồ đo tiền (migration 20260901b) — ghi số CHỮ thật của một lượt gọi bộ
 * não vào `bot_usage` của ngày hôm nay.
 *
 * Vì sao cần, khi đã có `bump_model_quota` đếm lượt: tiền tính theo chữ chứ
 * không theo lượt, và bốn loại chữ có bốn giá lệch nhau tới 50 lần. Không đo
 * thì mọi câu trả lời cho "tốn bao nhiêu, scale lên có chịu nổi không" đều là
 * ước tính từ số ký tự, sai số lớn.
 *
 * Cặp số đáng nhìn nhất là cache_write so với cache_read: write cao mà read
 * thấp nghĩa là lượt nào cũng trượt bộ nhớ tạm — đang trả THÊM tiền để không
 * được gì, và phải đổi nhịp nhớ tạm (xem khối bình luận ở chỗ cache_control
 * trong chat-reply).
 *
 * KHÔNG BAO GIỜ NÉM, cùng lý do với ghiLoi: mọi nơi gọi hàm này đều đã có sẵn
 * câu trả lời cho khách trong tay. Đồng hồ hỏng thì thôi, không được phép kéo
 * câu trả lời đó xuống nhánh dự phòng.
 *
 * Nối ở cả bốn nơi gọi model: `chat-reply`, `nudge`, `ask-seller`, `ctv-report`
 * (FR-171 e, 02/09/2026). Thêm một chỗ gọi model mới mà quên gọi hàm này là số
 * trong bảng lại thành sàn.
 */
export async function doTien(
  db: SupabaseClient,
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    /** Model thật đã trả lời — do lớp bọc (`bocLocThamSo`, `bocDuPhong`) gắn; thiếu thì ghi MODEL đang cấu hình. */
    model?: string | null;
  } | null | undefined,
): Promise<void> {
  if (!usage) return;
  try {
    // SRS-5.1zv: sổ theo (ngày, model) — /admin mới quy ra đô đúng giá từng model; Groq/Gemini tách riêng (không tốn credit).
    await db.rpc("cong_token", {
      p_in: usage.input_tokens ?? 0,
      p_out: usage.output_tokens ?? 0,
      p_cache_write: usage.cache_creation_input_tokens ?? 0,
      p_cache_read: usage.cache_read_input_tokens ?? 0,
      p_model: usage.model ?? MODEL,
    });
  } catch (e) {
    // Nối dây vào sổ (FR-152) — một `catch` im lặng ở đây là một đồng hồ chết
    // mà không ai biết, rồi số liệu tiền lặng lẽ sai.
    await ghiLoi(db, "do tien", e);
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Gửi một tin text qua Zalo OA. true = OA nhận (error === 0). */
export async function sendZalo(token: string, userId: string, text: string): Promise<boolean> {
  const r = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
    method: "POST",
    headers: { "Content-Type": "application/json", access_token: token },
    body: JSON.stringify({ recipient: { user_id: userId }, message: { text } }),
  });
  const j = await r.json().catch(() => ({}));
  return j?.error === 0;
}

/** FR-143: gửi ảnh qua OA bằng media template. */
export async function sendZaloImage(token: string, userId: string, url: string): Promise<boolean> {
  const r = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
    method: "POST",
    headers: { "Content-Type": "application/json", access_token: token },
    body: JSON.stringify({
      recipient: { user_id: userId },
      message: {
        attachment: {
          type: "template",
          payload: { template_type: "media", elements: [{ media_type: "image", url }] },
        },
      },
    }),
  });
  const j = await r.json().catch(() => ({}));
  return j?.error === 0;
}

// Chữ của việc nội bộ tách sang `tin_nhac.ts` (thuần, kiểm được offline).
export { escalationText } from "./tin_nhac.ts";
