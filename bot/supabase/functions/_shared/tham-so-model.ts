// LỌC THAM SỐ THEO MODEL — không import gì, để bài kiểm chạy được bằng bun.
//
// `output_config.effort` là tham số RIÊNG của họ Claude 5 (opus/sonnet/fable).
// Haiku 4.5 trả thẳng 400 `invalid_request_error: This model does not support
// the effort parameter.` — đo thật trên API ngày 10/09/2026, TRƯỚC khi hạ model
// theo lệnh chủ dự án ("hạ bot xuống haiku 4.5 đi").
//
// Vì sao phải có lớp lọc chứ không sửa tay 10 chỗ gọi: nếu để lọt, mọi lượt gọi
// ném `invalid_request` — mà `nenDoiSang()` KHÔNG coi đó là cớ đổi sang Groq
// (đúng: sai tham số thì đổi model không chữa được). Kết quả là `chat-reply`
// rơi hết về CÂU MẪU tiền định: bot vẫn trả lời trơn tru, khách không thấy gì
// lạ, và không ai biết model đã chết. Đúng cảnh sáng 10/09 đẻ ra FR-194.
//
// `output_config.format` (structured output) thì Haiku 4.5 nhận bình thường —
// cũng đã đo — nên KHÔNG được đụng vào.

/** Model nào còn hiểu `effort`. */
export const CO_EFFORT = /(opus|sonnet|fable)-5/i;

/**
 * Bỏ `output_config.effort` khi model không hiểu nó; giữ nguyên mọi thứ khác.
 * `output_config` rỗng sau khi bỏ thì bỏ luôn cả khoá, đừng gửi object trống.
 */
export function locThamSo<T extends Record<string, unknown>>(p: T, modelMacDinh = ""): T {
  // 14/09/2026: `_khuon_du_phong` là khuôn JSON CHỈ cho lưới Groq (nhánh mua bỏ
  // structured output ở Anthropic vì chậm gấp đôi) — SDK Anthropic không biết trường
  // này, gửi đi là 400. Gỡ ở đây vì mọi lượt gọi Anthropic đều đi qua hàm này.
  if ("_khuon_du_phong" in p) {
    const { _khuon_du_phong: _bo, ...khongKhuon } = p as Record<string, unknown>;
    p = khongKhuon as T;
  }
  const oc = p.output_config as { effort?: string; format?: unknown } | undefined;
  if (!oc?.effort) return p;
  if (CO_EFFORT.test(String(p.model ?? modelMacDinh))) return p;
  const { effort: _bo, ...conLai } = oc;
  const ra = { ...p } as Record<string, unknown>;
  if (Object.keys(conLai).length > 0) ra.output_config = conLai;
  else delete ra.output_config;
  return ra as T;
}
