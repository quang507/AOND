// Model giả: trả theo kịch bản đặt ở globalThis.__model, ghi lại mọi lượt gọi.
const usage = () => ({ input_tokens: 120, output_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 5000 });

// Khuôn ĐẦY ĐỦ của `parsed_output` — mọi khoá mà chat-reply đọc tới. Để ở đây
// vì đây là module giả lập model; hai bộ e2e (`run.mjs`, `cong-thieu-bi-mat.mjs`)
// dùng chung MỘT khuôn. Chép tay khuôn này sang file thứ hai là cách chắc chắn
// để một hôm nào đó nó thiếu `profile` và ca kiểm chết vì lỗi mock chứ không
// phải vì lỗi thật — đã xảy ra đúng một lần, đừng bày lại.
export const OUT = (o = {}) => ({
  profile: { name: null, deal: null, area: null, budget: null, purpose: null, property_type: null, bedrooms: null, alley: null, timeline: null, notes: null },
  replies: ["Dạ em ghi nhận rồi ạ, anh/chị tìm khu nào ạ?"],
  promise: null, viewing: null, agreed_deal: null, send_photos: null, ask_owner: null, need_human: false,
  ...o,
});
export default class Anthropic {
  constructor() {
    this.messages = {
      create: async (params) => {
        globalThis.__calls.push({ kind: "create", params });
        // SRS-5.1y: lượt có `tools` là trợ lý có công cụ — `__model.troLy(params)` trả nguyên phản hồi
        // `{ content, stop_reason }` (khối text / tool_use), ném được để mô phỏng model chết.
        if (params.tools && globalThis.__model?.troLy) {
          const r = await globalThis.__model.troLy(params);
          return { stop_reason: "end_turn", ...r, usage: usage() };
        }
        const text = globalThis.__model?.create?.(params) ?? "Dạ em ghi nhận rồi ạ.";
        return { content: [{ type: "text", text }], usage: usage() };
      },
      parse: async (params) => {
        globalThis.__calls.push({ kind: "parse", params });
        // 14/09/2026: nhánh mua bỏ structured output — model thật trả CHỮ JSON, không
        // có parsed_output. `__model.parseChu` giả lập đúng đường đó.
        const chu = globalThis.__model?.parseChu?.(params);
        if (typeof chu === "string") return { stop_reason: "end_turn", parsed_output: null, content: [{ type: "text", text: chu }], usage: usage() };
        const out = globalThis.__model?.parse?.(params) ?? null;
        return { stop_reason: "end_turn", parsed_output: out, content: [], usage: usage() };
      },
    };
  }
}
