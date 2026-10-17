// dao-sau-du-an.mjs — cho MODEL đọc lại hồ sơ dự án đã thu về, bóc thành THÔNG SỐ
// CÓ CẤU TRÚC và viết lại mô tả bằng lời của mình (FR-196).
//
// Chủ dự án 10/09/2026: "nếu cần thì cho llm đi vào sâu hơn, bóc tách lại nguyên
// dự án và mô tả luôn".
//
// VÌ SAO CẦN. Trình thu thập giữ nguyên các gạch đầu dòng của trang nguồn, nên
// một dự án có 14 dòng lẫn lộn: ranh giới bốn phía, loại căn, tiện ích, hạ tầng
// vùng. Model nói chuyện với khách phải LỌC lại mỗi lượt, và đo 10/09 cho thấy
// nó bỏ qua số trong kho để nói theo trí nhớ — kho ghi The Beverly studio 32,5m²
// mà bot nói "1 phòng ngủ hơn 30m2". Chuyển thành bảng thì model chỉ việc đọc.
//
// LUẬT CỦA LƯỢT BÓC: chỉ được dùng ĐÚNG đoạn văn bản đưa vào. Không suy, không
// thêm kiến thức ngoài. Thiếu thì để trống — một ô trống thì bot biết đường nói
// "để em xác nhận lại", còn một ô bịa thì không ai biết là bịa.
//
//   node scripts/dao-sau-du-an.mjs --so 40      # đào 40 dự án nhiều dữ liệu nhất
//   node scripts/dao-sau-du-an.mjs --ten centrosa
//   node scripts/dao-sau-du-an.mjs --so 40 --dry
//
// Chạy lại được: dự án đã có `specs.dao_sau_at` thì bỏ qua, trừ khi `--lam-lai`.
// Cần SUPABASE_SERVICE_ROLE_KEY (scripts/.env) và GROQ_API_KEY (env hoặc Vault).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(HERE, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const URL_DB = env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const args = process.argv.slice(2);
const lay = (t, m) => { const i = args.indexOf(t); return i >= 0 ? args[i + 1] : m; };
const DRY = args.includes("--dry");
const LAM_LAI = args.includes("--lam-lai");
const SO = Number(lay("--so", "40"));
const TEN = lay("--ten", null);

// Đọc qua PostgREST bằng khoá service (nằm ở scripts/.env, ngoài repo). KHÔNG
// dùng token Management API ở đây: repo này PUBLIC, một hằng số dán vào file là
// một bí mật phát ra thế giới — GitHub chặn đúng lúc 10/09/2026.
async function chon(duong) {
  const r = await fetch(`${URL_DB}/rest/v1/${duong}`, { headers: H });
  if (!r.ok) throw new Error(`${duong}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const GROQ = process.env.GROQ_API_KEY ?? env.GROQ_API_KEY;
const MODELS = (process.env.GROQ_MODEL ?? env.GROQ_MODEL ?? "qwen/qwen3.8-27b,openai/gpt-oss-120b")
  .split(",").map((x) => x.trim()).filter(Boolean);
if (!GROQ) {
  console.error("Thiếu GROQ_API_KEY — đặt biến môi trường hoặc thêm dòng GROQ_API_KEY=... vào scripts/.env");
  process.exit(1);
}

const SCHEMA = {
  type: "object",
  properties: {
    quy_mo: { type: ["string", "null"], description: "Quy mô dự án: số căn, số block, diện tích khu. Chỉ khi văn bản có." },
    loai_can: {
      type: "array",
      description: "Từng loại căn/sản phẩm kèm diện tích, chép đúng số trong văn bản.",
      items: {
        type: "object",
        properties: {
          ten: { type: "string" },
          dien_tich: { type: ["string", "null"] },
          so_can: { type: ["string", "null"] },
        },
        required: ["ten", "dien_tich", "so_can"],
        additionalProperties: false,
      },
    },
    tien_ich: { type: "array", items: { type: "string" }, description: "Tiện ích NỘI KHU. Bỏ ranh giới bốn phía và hạ tầng vùng." },
    ket_noi: { type: "array", items: { type: "string" }, description: "Kết nối hạ tầng, đường lớn, khoảng cách. Câu ngắn." },
    ban_giao: { type: ["string", "null"] },
    phap_ly: { type: ["string", "null"] },
    mo_ta: { type: "string", description: "2–3 câu tiếng Việt, giọng môi giới nói chuyện, CHỈ dùng dữ kiện trong văn bản. Không quảng cáo sáo rỗng." },
  },
  required: ["quy_mo", "loai_can", "tien_ich", "ket_noi", "ban_giao", "phap_ly", "mo_ta"],
  additionalProperties: false,
};

const HE_THONG =
  "Bạn bóc dữ kiện bất động sản cho một sàn môi giới. Chỉ dùng ĐÚNG văn bản được đưa. " +
  "Không suy diễn, không thêm kiến thức bên ngoài, không quảng cáo. Thiếu thì để null hoặc mảng rỗng. " +
  "Số liệu chép nguyên văn (kể cả dấu phẩy thập phân). Viết tiếng Việt.";

const cat = (s) => String(s ?? "")
  .replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").trim();

async function daoMot(p) {
  const vanBan = [
    `Tên dự án: ${p.name}`,
    p.developer ? `Chủ đầu tư: ${p.developer}` : null,
    p.location_raw ? `Địa chỉ: ${p.location_raw}` : null,
    p.legal_status ? `Pháp lý: ${p.legal_status}` : null,
    p.handover ? `Bàn giao: ${p.handover}` : null,
    p.specs?.gia_dong ? `Giá: ${p.specs.gia_dong}` : null,
    p.specs?.tong_dien_tich ? `Tổng diện tích: ${p.specs.tong_dien_tich}` : null,
    p.specs?.dien_tich_tu_m2 ? `Diện tích sản phẩm: ${p.specs.dien_tich_tu_m2}-${p.specs.dien_tich_den_m2} m2` : null,
    Array.isArray(p.amenities) && p.amenities.length ? `Các dòng ghi chép được:\n- ${p.amenities.join("\n- ")}` : null,
    p.description ? `Mô tả hiện có: ${p.description}` : null,
  ].filter(Boolean).join("\n");

  // Bậc miễn phí Groq chặn nhịp theo từng model. Thử vòng: model A, model B,
  // nghỉ dài rồi quay lại A — chứ không bỏ cuộc sau một lượt 429 (lượt đầu
  // 10/09 hụt 32/60 chỉ vì thế).
  for (const [vong, model] of [...MODELS, ...MODELS, ...MODELS].entries()) {
    if (vong >= MODELS.length) await new Promise((s) => setTimeout(s, 4000));
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, max_completion_tokens: 1600, temperature: 0.2, reasoning_format: "hidden",
        response_format: { type: "json_schema", json_schema: { name: "du_an", schema: SCHEMA, strict: true } },
        messages: [{ role: "system", content: HE_THONG }, { role: "user", content: vanBan }],
      }),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 2500)); continue; }
    if (!r.ok) { console.error(`  ! ${p.name}: HTTP ${r.status}`); return null; }
    const j = await r.json();
    const txt = cat(j.choices?.[0]?.message?.content);
    if (!txt) continue;
    try { return JSON.parse(txt); } catch { continue; }
  }
  return null;
}

// Chọn dự án: ưu tiên nơi CÓ GÌ ĐỂ ĐÀO (nhiều dòng ghi chép nhất). PostgREST
// không xếp được theo độ dài mảng nên kéo về rồi xếp ở đây; `projects` cỡ ngàn
// dòng, kéo hết vẫn rẻ hơn một lượt gọi model.
const cot = "id,name,developer,location_raw,legal_status,handover,description,amenities,specs";
const loc = TEN ? `&name=ilike.*${encodeURIComponent(TEN)}*` : "";
const tatCa = await chon(`projects?select=${cot}${loc}&limit=5000`);
const ds = tatCa
  .filter((p) => Array.isArray(p.amenities) && p.amenities.length >= 3)
  .filter((p) => TEN || LAM_LAI || !p.specs?.dao_sau_at)
  .sort((a, b) => (b.amenities.length - a.amenities.length) ||
    (String(b.description ?? "").length - String(a.description ?? "").length))
  .slice(0, SO);

console.log(`Đào ${ds.length} dự án bằng ${MODELS.join(" → ")}\n`);
let xong = 0, hong = 0;
for (const p of ds) {
  const kq = await daoMot(p);
  if (!kq) { hong++; console.log(`  ✗ ${p.name}`); continue; }
  // Model hay điền bừa hai ô này: `ban_giao` thành TÊN dự án, `so_can` thành
  // tên loại căn. Ô nào không có CHỮ SỐ thì bỏ — thà trống còn hơn sai.
  if (kq.ban_giao && !/[0-9]/.test(kq.ban_giao)) kq.ban_giao = null;
  for (const c of kq.loai_can ?? []) { if (c.so_can && (c.so_can === c.ten || !/[0-9]/.test(c.so_can) || /pn|phong/i.test(c.so_can))) c.so_can = null; }
  const specsMoi = {
    ...(p.specs ?? {}),
    quy_mo: kq.quy_mo ?? undefined,
    loai_can: kq.loai_can?.length ? kq.loai_can : undefined,
    ket_noi: kq.ket_noi?.length ? kq.ket_noi : undefined,
    ban_giao: kq.ban_giao ?? undefined,
    dao_sau_at: new Date().toISOString(),
    dao_sau_boi: "groq",
  };
  xong++;
  console.log(`  ✓ ${p.name} — ${kq.loai_can?.length ?? 0} loại căn, ${kq.tien_ich?.length ?? 0} tiện ích`);
  if (DRY) { if (xong === 1) console.log(JSON.stringify(kq, null, 1)); continue; }
  const r = await fetch(`${URL_DB}/rest/v1/projects?id=eq.${p.id}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({
      specs: specsMoi,
      amenities: kq.tien_ich?.length ? kq.tien_ich : p.amenities,
      description: kq.mo_ta?.trim() ? kq.mo_ta.trim() : p.description,
      legal_status: p.legal_status ?? kq.phap_ly ?? null,
      handover: p.handover ?? kq.ban_giao ?? null,
    }),
  });
  if (!r.ok) { hong++; console.error(`  ! ghi ${p.name}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); }
  await new Promise((s) => setTimeout(s, 1500)); // đi chậm, bậc miễn phí chặn nhịp
}
console.log(`\nXong ${xong}, hỏng ${hong}.`);
