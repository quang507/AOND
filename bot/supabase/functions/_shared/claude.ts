// Hạ tầng dùng chung cho các edge function còn sống (escalation-feed, geocode-listings, media-cleanup): client Supabase,
// đọc secret, ghi sổ lỗi, đóng gói JSON response, soạn text việc-nội-bộ. 18/10/2026 (SRS-5.1zzzzzzz46): bỏ phần gọi model
// (anthropicClient, dự phòng Groq/Gemini, đồng hồ tiền) và gửi Zalo OA — chỉ bot TypeScript cũ dùng; bộ não là lõi Python.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/**
 * Bí mật ĐỌC ĐƯỢC từ Vault nhớ theo TỪNG client (mỗi request một client) tối đa 60 giây; null / lỗi KHÔNG nhớ (SEC-02). Nhớ theo client chứ
 * không theo cả isolate: request sau đọc lại Vault, nên xoá / xoay khoá có hiệu lực ngay lượt kế.
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

/**
 * SEC-02 — hàm đọc cũ `secretOf` (gỡ 02/11/2026 cùng bot TypeScript) gộp hai chuyện khác hẳn nhau vào cùng một `null`:
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

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export { escalationText } from "./tin_nhac.ts";
