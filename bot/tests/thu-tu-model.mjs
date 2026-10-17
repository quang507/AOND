// TS-GROQ-04/05 — thứ tự model (FR-194 b, 15/09/2026).
//
// Chủ dự án: "dùng con groq trả lời trước nếu bị chặn trần thì fall back về
// claude api liền luôn". Bài này dựng Groq giả bằng `globalThis.fetch` và Claude
// giả bằng một object có `messages.create/parse`, rồi đếm AI được gọi, theo thứ
// tự nào, trong từng cảnh: Groq trả lời được · Groq 429 cả danh sách · Groq 400
// (lỗi không phải nhịp) · lượt có ẢNH · đường cũ `claude`. Không gọi ra ngoài,
// không tốn một đồng.
import { bocDuPhong, giaiThamChieu, goiCoHan, hanGoiMs, nenDoiSang, nguonGemini, nguonGroq } from "../supabase/functions/_shared/groq.ts";

let dat = 0, hong = 0;
const ok = (t) => { dat++; console.log(`✓ ${t}`); };
const ko = (t, chi) => { hong++; console.log(`✗ ${t}\n    ${chi}`); };
const la = (t, thuc, mong) => {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  a === b ? ok(t) : ko(t, `thật ${a}\n    mong ${b}`);
};

console.log("TS-GROQ-04/05 — thứ tự model Groq → Claude\n");

// ── Dàn cảnh ────────────────────────────────────────────────────────────────
// `kichBan[model]` = mã HTTP Groq trả cho model đó (200 kèm chữ, hoặc số lỗi).
let kichBan = {};
let goiGroq = [];   // model đã gọi, theo thứ tự
let goiClaude = []; // "create"/"parse" đã gọi
let claudeNem = null; // Claude ném lỗi này nếu khác null
let soGhiSo = 0;
let thanCuoi = null; // body lượt gọi Groq gần nhất
let treo = {}; // SRS-5.1zzzzo: model → treo (không trả lời) tới khi lượt gọi bị huỷ bằng `signal`

globalThis.fetch = async (url, init) => {
  const laGemini = /generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions/.test(String(url));
  if (!laGemini && !/api\.groq\.com/.test(String(url))) throw new Error(`fetch lạ: ${url}`);
  const than = JSON.parse(init.body);
  thanCuoi = than;
  goiGroq.push(than.model);
  if (treo[than.model]) {
    return await new Promise((_, nem) => {
      if (!init.signal) return; // không có signal (bản cũ): treo mãi — bài đo sẽ bắt bằng hẹn giờ của chính nó
      init.signal.addEventListener("abort", () => nem(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })));
    });
  }
  const kb = kichBan[than.model] ?? 200;
  if (kb !== 200) return new Response(`loi ${kb}`, { status: kb });
  return new Response(JSON.stringify({
    choices: [{ message: { content: `groq:${than.model}` } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200, headers: { "content-type": "application/json" } });
};
const claude = {
  messages: {
    create: async () => { goiClaude.push("create"); if (claudeNem) throw claudeNem; return { content: [{ type: "text", text: "claude" }] }; },
    parse: async () => { goiClaude.push("parse"); if (claudeNem) throw claudeNem; return { content: [{ type: "text", text: "claude" }], parsed_output: { a: 1 } }; },
  },
};
const ghiSo = async () => { soGhiSo++; };
const reset = () => { kichBan = {}; goiGroq = []; goiClaude = []; claudeNem = null; soGhiSo = 0; thanCuoi = null; treo = {}; };
const P = { messages: [{ role: "user", content: "xin chào" }], max_tokens: 200 };
const P_ANH = { messages: [{ role: "user", content: [{ type: "image", source: {} }, { type: "text", text: "ảnh gì" }] }] };
const DS = "m1,m2";
const G = [nguonGroq("k", DS)];
const chu = (r) => r?.content?.[0]?.text;

// ── Groq trước (mặc định của hệ thống từ 15/09) ─────────────────────────────
{
  reset();
  const c = bocDuPhong(claude, G, ghiSo, "groq");
  const r = await c.messages.create(P);
  la("groq trước: Groq m1 trả lời → Claude KHÔNG được gọi", [chu(r), goiGroq, goiClaude], ["groq:m1", ["m1"], []]);
  la("groq trước: không ghi sổ lỗi", soGhiSo, 0);
}
{
  reset(); kichBan = { m1: 429 };
  const c = bocDuPhong(claude, G, ghiSo, "groq");
  const r = await c.messages.create(P);
  la("groq trước: m1 chạm trần → xoay m2, vẫn chưa đụng Claude", [chu(r), goiGroq, goiClaude], ["groq:m2", ["m1", "m2"], []]);
}
{
  reset(); kichBan = { m1: 429, m2: 429 };
  const c = bocDuPhong(claude, G, ghiSo, "groq");
  const r = await c.messages.create(P);
  la("groq trước: cả danh sách chạm trần → Claude LIỀN trong cùng lượt", [chu(r), goiGroq, goiClaude], ["claude", ["m1", "m2"], ["create"]]);
  la("groq trước: chạm trần là đường bình thường — KHÔNG vào sổ lỗi", soGhiSo, 0);
}
{
  reset(); kichBan = { m1: 503, m2: 500 };
  const c = bocDuPhong(claude, G, ghiSo, "groq");
  const r = await c.messages.parse({ ...P, output_config: { format: { type: "json_schema", schema: { type: "object" } } } });
  la("groq trước: Groq 5xx cả danh sách → Claude parse", [r?.parsed_output, goiGroq, goiClaude], [{ a: 1 }, ["m1", "m2"], ["parse"]]);
}
{
  reset(); kichBan = { m1: 413 };
  const c = bocDuPhong(claude, G, ghiSo, "groq");
  const r = await c.messages.create(P);
  la("groq trước: m1 413 quá cỡ → xoay m2 (trần chữ theo model), chưa đụng Claude", [chu(r), goiGroq, goiClaude], ["groq:m2", ["m1", "m2"], []]);
}
{
  reset(); kichBan = { m1: 400 };
  const c = bocDuPhong(claude, G, ghiSo, "groq");
  const r = await c.messages.create(P);
  la("groq trước: Groq 400 (không phải nhịp) → không xoay m2, sang Claude luôn", [chu(r), goiGroq, goiClaude], ["claude", ["m1"], ["create"]]);
  // 30/09/2026: lỗi Groq không phải nhịp là sự cố — phải vào sổ (trước đây chỉ lỗi Claude ở cuối chuỗi được ném lên).
  la("groq trước: Groq 400 → ghi MỘT dòng sổ lỗi 'du phong hong'", soGhiSo, 1);
}
{
  reset();
  const c = bocDuPhong(claude, G, ghiSo, "groq");
  const r = await c.messages.create(P_ANH);
  la("groq trước: lượt có ẢNH đi thẳng Claude, Groq không được gọi", [chu(r), goiGroq, goiClaude], ["claude", [], ["create"]]);
}
{
  reset(); kichBan = { m1: 429, m2: 429 }; claudeNem = Object.assign(new Error("credit balance is too low"), { status: 400 });
  const c = bocDuPhong(claude, G, ghiSo, "groq");
  let loi = null;
  try { await c.messages.create(P); } catch (e) { loi = e.message; }
  la("groq trước: Groq chạm trần VÀ Claude hết tiền → ném lỗi Claude lên (tầng gọi có câu mẫu)", [loi, goiGroq, goiClaude], ["credit balance is too low", ["m1", "m2"], ["create"]]);
}
{
  reset(); kichBan = { m1: 429, m2: 429 };
  const c = bocDuPhong(null, G, ghiSo, "groq");
  let loi = null;
  try { await c.messages.create(P); } catch (e) { loi = e.message.slice(0, 8); }
  la("groq trước, không khoá Claude: hết danh sách thì ném lỗi Groq", [loi, goiGroq], ["Groq 429", ["m1", "m2"]]);
}

// ── Gemini (FR-194 c, 23/09/2026): cùng cổng giọng OpenAI, đứng trước Groq khi MODEL_TRUOC=gemini ──
const GG = [nguonGemini("kg", "g1,g2"), nguonGroq("k", DS)];
{
  reset();
  const c = bocDuPhong(claude, GG, ghiSo, "groq");
  const r = await c.messages.create(P);
  la("gemini trước: Gemini g1 trả lời → Groq lẫn Claude KHÔNG được gọi", [chu(r), goiGroq, goiClaude], ["groq:g1", ["g1"], []]);
  la("gemini: body có reasoning_effort=low, trần chữ ≥ 1500, KHÔNG có reasoning_format của Groq",
    [thanCuoi.reasoning_effort, thanCuoi.max_completion_tokens >= 1500, "reasoning_format" in thanCuoi], ["low", true, false]);
}
{
  reset(); kichBan = { g1: 429, g2: 429 };
  const c = bocDuPhong(claude, GG, ghiSo, "groq");
  const r = await c.messages.create(P);
  la("gemini trước: cả danh sách Gemini chạm trần → sang Groq m1, chưa đụng Claude", [chu(r), goiGroq, goiClaude], ["groq:m1", ["g1", "g2", "m1"], []]);
  la("groq: body có reasoning_format=hidden, không reasoning_effort", [thanCuoi.reasoning_format, "reasoning_effort" in thanCuoi], ["hidden", false]);
  la("xoay nguồn là đường bình thường — KHÔNG vào sổ lỗi", soGhiSo, 0);
}
{
  reset(); kichBan = { g1: 400 };
  const c = bocDuPhong(claude, GG, ghiSo, "groq");
  const r = await c.messages.create(P);
  la("gemini 400 (không phải nhịp) → bỏ g2 cùng nguồn, sang nguồn kế Groq", [chu(r), goiGroq, goiClaude], ["groq:m1", ["g1", "m1"], []]);
}
{
  reset(); kichBan = { g1: 429, g2: 503, m1: 429, m2: 429 };
  const c = bocDuPhong(claude, GG, ghiSo, "groq");
  const r = await c.messages.create(P);
  la("mọi nguồn dự phòng hỏng → Claude liền trong cùng lượt", [chu(r), goiGroq, goiClaude], ["claude", ["g1", "g2", "m1", "m2"], ["create"]]);
}
{
  reset(); claudeNem = Object.assign(new Error("credit balance is too low"), { status: 400 });
  const c = bocDuPhong(claude, GG, ghiSo, "claude");
  const r = await c.messages.create(P);
  la("claude trước, Claude hết tiền → nguồn dự phòng ĐẦU danh sách (Gemini), sổ ghi tên nguồn", [chu(r), goiGroq, soGhiSo], ["groq:g1", ["g1"], 1]);
}

// ── Schema gửi Groq: giải `$ref` (bắt tại trận 15/09, trường `can` của boc-rao) ──
// Đúng hình `zodOutputFormat()` sinh cho z.number().int().nullable(): $defs + anyOf[$ref, null].
const KHUON_REF = {
  $defs: { __schema0: { type: "integer", description: "{minimum: -9007199254740991, maximum: 9007199254740991}" } },
  type: "object",
  properties: {
    so_can: { type: "integer" },
    truong: {
      type: "array",
      items: {
        type: "object",
        properties: {
          khoa: { type: "string" },
          can: { anyOf: [{ $ref: "#/$defs/__schema0" }, { type: "null" }], description: "Căn số mấy" },
        },
        additionalProperties: false, required: ["khoa", "can"],
      },
    },
  },
  additionalProperties: false, required: ["so_can", "truong"],
};
{
  const r = giaiThamChieu(KHUON_REF);
  la("giaiThamChieu: chép thân $defs vào chỗ $ref, giữ description, bỏ $defs",
    [r.properties.truong.items.properties.can, "$defs" in r],
    [{ anyOf: [{ type: "integer", description: "{minimum: -9007199254740991, maximum: 9007199254740991}" }, { type: "null" }], description: "Căn số mấy" }, false]);
  la("giaiThamChieu: schema không có $ref thì trả y nguyên", giaiThamChieu({ type: "object", properties: { a: { type: ["string", "null"] } } }), { type: "object", properties: { a: { type: ["string", "null"] } } });
  la("giaiThamChieu: không phải object thì trả nguyên", [giaiThamChieu(null), giaiThamChieu("x")], [null, "x"]);
  // Đúng hình zodOutputFormat() sinh cho z.enum(): enum bị nhét vào description.
  const KHUON_ENUM = {
    type: "object",
    properties: {
      vai: { type: "string", description: "{enum: [\"ban\",\"mua\",\"chua_ro\"]}" },
      loai: { anyOf: [{ type: "string", description: "Loại nơi\n\n{enum: [\"benh_vien\",\"truong_hoc\"]}" }, { type: "null" }] },
      ghi: { type: "string", description: "mô tả thường, không phải enum" },
      so: { type: "integer", description: "{minimum: -1, maximum: 9}" },
    },
    additionalProperties: false, required: ["vai", "loai", "ghi", "so"],
    description: "{$schema: \"https://json-schema.org/draft/2020-12/schema\"}",
  };
  const e = giaiThamChieu(KHUON_ENUM);
  la("giaiThamChieu: enum nằm trong description → trả về đúng chỗ enum, bỏ description rỗng",
    e.properties.vai, { type: "string", enum: ["ban", "mua", "chua_ro"] });
  la("giaiThamChieu: enum có mô tả phía trước (trong anyOf) → giữ mô tả, thêm enum",
    e.properties.loai.anyOf[0], { type: "string", description: "Loại nơi", enum: ["benh_vien", "truong_hoc"] });
  la("giaiThamChieu: description thường và {minimum…} không bị đụng",
    [e.properties.ghi, e.properties.so, e.description],
    [{ type: "string", description: "mô tả thường, không phải enum" }, { type: "integer", description: "{minimum: -1, maximum: 9}" }, "{$schema: \"https://json-schema.org/draft/2020-12/schema\"}"]);
  la("giaiThamChieu: description enum hỏng JSON → để nguyên, không ném",
    giaiThamChieu({ type: "string", description: "{enum: [ban,mua]}" }), { type: "string", description: "{enum: [ban,mua]}" });
}
{
  reset();
  const c = bocDuPhong(claude, G, ghiSo, "groq");
  await c.messages.parse({ ...P, output_config: { format: { type: "json_schema", schema: KHUON_REF } } });
  const s = JSON.stringify(thanCuoi.response_format);
  la("parse qua Groq: response_format KHÔNG còn $ref/$defs, strict json_schema", [/\$ref|\$defs/.test(s), thanCuoi.response_format.type, thanCuoi.response_format.json_schema.strict], [false, "json_schema", true]);
}

// ── Đường cũ: Claude trước (MODEL_TRUOC=claude) ─────────────────────────────
{
  reset();
  const c = bocDuPhong(claude, G, ghiSo, "claude");
  const r = await c.messages.create(P);
  la("claude trước: Claude trả lời → Groq KHÔNG được gọi", [chu(r), goiGroq, goiClaude], ["claude", [], ["create"]]);
}
{
  reset(); claudeNem = Object.assign(new Error("rate limit"), { status: 429 });
  const c = bocDuPhong(claude, G, ghiSo, "claude");
  const r = await c.messages.create(P);
  la("claude trước: Claude 429 → Groq m1, có ghi sổ 1 dòng", [chu(r), goiGroq, goiClaude, soGhiSo], ["groq:m1", ["m1"], ["create"], 1]);
}
{
  reset(); claudeNem = Object.assign(new Error("invalid_request_error"), { status: 400 });
  const c = bocDuPhong(claude, G, ghiSo, "claude");
  let loi = null;
  try { await c.messages.create(P); } catch (e) { loi = e.message; }
  la("claude trước: lỗi 400 sai tham số KHÔNG đổi sang Groq (đổi model không chữa được)", [loi, goiGroq], ["invalid_request_error", []]);
}
{
  reset();
  const c = bocDuPhong(claude, G, ghiSo);
  const r = await c.messages.create(P);
  la("không truyền thứ tự: giữ đường cũ Claude trước (tham số mặc định của hàm)", [chu(r), goiGroq], ["claude", []]);
}

// ── SRS-5.1zzzzo: HẠN mỗi lượt gọi (bắn production 09/10: lượt bóc tách 76–78 giây) ─────────────────────────────────────────────
// Bản cũ: fetch dự phòng không hạn, SDK Anthropic chờ 10 phút + tự ngủ theo `retry-after`. Đo bằng đồng hồ thật, hạn thu nhỏ (200 ms).
const voiHan = async (p, ms) => { const t0 = Date.now(); const kq = await Promise.race([p.then((r) => ({ r })), new Promise((ok) => setTimeout(() => ok({ treoQua: true }), ms))]); return { ...kq, ms: Date.now() - t0 }; };
{
  reset(); treo = { m1: true };
  const c = bocDuPhong(claude, G, ghiSo, "groq", { hanMs: () => 2000 });
  const k = await voiHan(c.messages.parse({ ...P, output_config: { format: { type: "json_schema", schema: { type: "object" } } } }), 6000);
  la("HAN-01 nguồn dự phòng TREO (không trả lời) → hết hạn chuỗi dự phòng (2 s) thì sang Claude NGAY, không xoay m2, không ghi sổ lỗi",
    [!!k.treoQua, chu(k.r), goiGroq, goiClaude, soGhiSo, k.ms >= 1900 && k.ms < 3500], [false, "claude", ["m1"], ["parse"], 0, true]);
}
{
  reset(); kichBan = { m1: 429 }; treo = { m2: true };
  const c = bocDuPhong(claude, G, ghiSo, "groq", { hanMs: () => 2000 });
  const k = await voiHan(c.messages.create(P), 6000);
  la("HAN-02 m1 chạm trần, m2 treo → cả chuỗi chung MỘT hạn (≈2 s, không cộng dồn) rồi Claude", [chu(k.r), goiGroq, goiClaude, k.ms < 3500], ["claude", ["m1", "m2"], ["create"], true]);
}
{
  la("HAN-03 hạn theo trần chữ: bóc tách 2000 → 24 s, lời 512 → 12 s, nhỏ → 10 s, lớn → trần 30 s",
    [hanGoiMs({ max_tokens: 2000 }), hanGoiMs({ max_tokens: 512 }), hanGoiMs({ max_tokens: 100 }), hanGoiMs({ max_tokens: 9000 })], [24000, 12096, 10000, 30000]);
  la("HAN-04 quá hạn của SDK ('Request timed out', APIConnectionTimeoutError) là lỗi ĐỔI NGUỒN như quá tải",
    [nenDoiSang(Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" })), nenDoiSang(new Error("invalid_request_error"))], [true, false]);
}
{
  // goiCoHan: SDK không tự thử lại (maxRetries 0); thử lại MỘT lần, ngủ ≤ 1,5 s dù máy chủ đòi 60 s; chỉ khi `thuLai`.
  const ngu = []; const ghiNgu = async (ms) => { ngu.push(ms); };
  let lan = 0; const tuyChon = [];
  const goi529 = async (o) => { tuyChon.push(o); lan++; if (lan === 1) throw Object.assign(new Error("Overloaded"), { status: 529, headers: { "retry-after": "60" } }); return "ok"; };
  const r1 = await goiCoHan(goi529, 20000, true, ghiNgu);
  la("HAN-05 Claude 529 (máy chủ đòi chờ 60 s) → thử lại MỘT lần sau ≤ 1,5 s, SDK luôn maxRetries 0, có hạn timeout",
    [r1, lan, ngu.length, ngu[0] <= 1500, tuyChon.every((o) => o.maxRetries === 0 && o.timeout > 0 && o.timeout <= 20000)], ["ok", 2, 1, true, true]);
  lan = 0; ngu.length = 0;
  let loi = null; try { await goiCoHan(goi529, 20000, false, ghiNgu); } catch (e) { loi = e.status; }
  la("HAN-06 có dự phòng đứng sau (thuLai = false) → KHÔNG ngủ, ném ngay để đổi nguồn", [loi, lan, ngu.length], [529, 1, 0]);
  lan = 0; ngu.length = 0;
  loi = null; try { await goiCoHan(async () => { lan++; throw Object.assign(new Error("Your credit balance is too low"), { status: 400 }); }, 20000, true, ghiNgu); } catch (e) { loi = e.status; }
  la("HAN-07 hết tiền → không thử lại (thử lại không chữa được)", [loi, lan, ngu.length], [400, 1, 0]);
}

// ── SRS-5.1zzzzzzf (13/10/2026): Gemini ĐỌC ẢNH làm dự phòng; Groq vẫn mù ─────────────────────────────────────────────────
{
  const P_ANH64 = { messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }, { type: "text", text: "ảnh gì" }] }], max_tokens: 400 };
  const GM = [nguonGemini("kg", "g1")];
  reset(); claudeNem = Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" });
  const c = bocDuPhong(claude, GM, ghiSo, "claude");
  const r = await c.messages.create(P_ANH64);
  const nd = thanCuoi?.messages?.find((m) => m.role === "user")?.content;
  la("ANH-01 Claude quá hạn ở lượt có ẢNH (base64) → Gemini nhận lượt, nội dung là MẢNG phần có image_url data URL + chữ",
    [chu(r), goiGroq, Array.isArray(nd), nd?.[0]?.type, nd?.[0]?.image_url?.url, nd?.[1]?.text],
    ["groq:g1", ["g1"], true, "image_url", "data:image/png;base64,AAAA", "ảnh gì"]);
}
{
  reset(); claudeNem = Object.assign(new Error("Overloaded"), { status: 529 });
  const c = bocDuPhong(claude, [...G, nguonGemini("kg", "g1")], ghiSo, "claude");
  const r = await c.messages.create({ messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "BBBB" } }, { type: "text", text: "sổ gì" }] }], max_tokens: 400 });
  la("ANH-02 lượt có ẢNH: nguồn Groq bị BỎ QUA (không gọi, không ghi sổ 'du phong hong'), Gemini trả lời",
    [chu(r), goiGroq, soGhiSo], ["groq:g1", ["g1"], 1 /* chỉ dòng 'model chinh hong - doi sang' */]);
}
{
  reset(); claudeNem = Object.assign(new Error("Overloaded"), { status: 529 });
  const c = bocDuPhong(claude, G, ghiSo, "claude");
  let loi = null;
  try { await c.messages.create({ messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "CC" } }] }] }); } catch (e) { loi = String(e.message); }
  la("ANH-03 chỉ có Groq mà lượt có ảnh → không nguồn nào trả lời, ném lỗi (tầng gọi đi nhánh cất riêng tư), Groq không được gọi",
    [goiGroq, /Dự phòng|không nhìn/.test(loi ?? "")], [[], true]);
}
{
  reset(); claudeNem = Object.assign(new Error("Overloaded"), { status: 529 });
  const c = bocDuPhong(claude, [nguonGemini("kg", "g1")], ghiSo, "claude");
  let loi = null;
  try { await c.messages.create({ messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "DD" } }] }] }); } catch (e) { loi = String(e.message); }
  la("ANH-04 PDF (document) vẫn chỉ Claude: Gemini ném 'không đọc được tài liệu PDF', không gửi lên", [goiGroq, /PDF/.test(loi ?? "")], [[], true]);
}
{
  // Ảnh dạng URL: tải về rồi mã hoá data URL (cổng Gemini chắc nhận data URL).
  const fetchCu = globalThis.fetch;
  reset(); claudeNem = Object.assign(new Error("Overloaded"), { status: 529 });
  globalThis.fetch = async (url, init) => {
    if (/cdn\.test\/a\.jpg$/.test(String(url))) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });
    return await fetchCu(url, init);
  };
  const c = bocDuPhong(claude, [nguonGemini("kg", "g1")], ghiSo, "claude");
  const r = await c.messages.create({ messages: [{ role: "user", content: [{ type: "image", source: { type: "url", url: "https://cdn.test/a.jpg" } }, { type: "text", text: "x" }] }] });
  const nd = thanCuoi?.messages?.find((m) => m.role === "user")?.content;
  la("ANH-05 ảnh dạng URL → tải về, gửi Gemini dạng data:image/jpeg;base64,…", [chu(r), nd?.[0]?.image_url?.url], ["groq:g1", "data:image/jpeg;base64,AQID"]);
  globalThis.fetch = fetchCu;
}

console.log(`\n${dat} đạt, ${hong} hỏng`);
process.exit(hong ? 1 : 0);
