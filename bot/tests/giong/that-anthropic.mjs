// SDK Anthropic THẬT, bọc lại để ghi sổ từng lượt gọi (model đã phục vụ, usage, thời gian)
// vào `globalThis.__calls` — cùng hình với `../e2e/mock-anthropic.mjs`, nên `chay.mjs` đọc
// một kiểu cho cả hai chế độ. Bộ đo giọng cần model thật vì giọng là thứ model viết;
// e2e giữ model giả vì e2e đo LUỒNG. Không ghi khoá API ra đâu cả.
import Anthropic from "@anthropic-ai/sdk";

export default class AnthropicGhiSo {
  constructor(opts) {
    const c = new Anthropic(opts);
    const ghi = (kind, params, r, ms) => {
      globalThis.__calls.push({
        kind, params,
        model_phuc_vu: r?.model ?? null,
        usage: r?.usage ?? null,
        stop_reason: r?.stop_reason ?? null,
        ms,
      });
      return r;
    };
    this.messages = {
      create: async (params) => { const t = Date.now(); const r = await c.messages.create(params); return ghi("create", params, r, Date.now() - t); },
      parse: async (params) => { const t = Date.now(); const r = await c.messages.parse(params); return ghi("parse", params, r, Date.now() - t); },
    };
  }
}
