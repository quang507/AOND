// mo-phong.mjs — KHÁCH MÔ PHỎNG có persona chat với bot PRODUCTION rồi chấm (TS-MO-PHONG-01, SRS-5.1zzzzw; tư duy từ UKPLab/llm-roleplay:
// kiểm bot bằng khách giả có tính cách thay cho kịch bản viết tay cố định). Chạy trong workflow `mo-phong.yml` (cần SUPABASE_ACCESS_TOKEN
// — Management API — và khoá Anthropic đọc từ Vault, đã che trong log). Mỗi persona một Zalo THỬ `thu-mp-<mã>` (la_id_thu), một model
// đóng vai khách nhắn từng tin qua đúng đường ban-thu (net.http_post → chat-reply), đợi bot trả lời, tới khi khách nói xong hoặc hết lượt.
// Chấm: cham.mjs (tất định) + giám khảo AI (lỗi phải trích nguyên văn câu bot, code kiểm). Cuối cùng DỌN dữ liệu thử (reset_nguoi_test)
// kể cả khi hỏng giữa chừng. Log repo CÔNG KHAI: persona là người giả, dữ kiện căn là dữ kiện bịa trong persona.json.
//   PROJECT_REF=… TOKEN=… ANTHROPIC_API_KEY=… bun bot/tests/mo-phong/mo-phong.mjs --persona cut-khong-dau,nghi-lua [--luot 10]
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { chamTatDinh, dongTomTat, DAU_BANG, kiemTrichDanGiamKhao } from "./cham.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const { PROJECT_REF, TOKEN, ANTHROPIC_API_KEY } = process.env;
if (!PROJECT_REF || !TOKEN || !ANTHROPIC_API_KEY) { console.error("Thiếu PROJECT_REF / TOKEN / ANTHROPIC_API_KEY — CHƯA CHẠY ĐƯỢC"); process.exit(2); }
const args = process.argv.slice(2);
const giaTri = (k, mac) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : mac; };
const TAT_CA = JSON.parse(readFileSync(join(HERE, "persona.json"), "utf8"));
const CHON = (giaTri("--persona", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const PERSONA = TAT_CA.filter((p) => CHON.includes(p.ma));
const LUOT = Math.min(14, Math.max(2, Number(giaTri("--luot", "10")) || 10));
const MODEL_KHACH = giaTri("--model-khach", "claude-haiku-4-5-20251001");
const MODEL_CHAM = giaTri("--model-cham", "claude-sonnet-5-5");
if (!PERSONA.length || PERSONA.length > 5 || PERSONA.length !== CHON.length) {
  console.error(`Chọn 1–5 persona có thật trong persona.json: ${TAT_CA.map((p) => p.ma).join(", ")}`); process.exit(2);
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
async function q(sql) {
  for (let lan = 1; lan <= 5; lan++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
    });
    if (r.ok) return await r.json();
    if (r.status === 429 || r.status >= 500) { await ngu(3000 * lan); continue; }
    throw new Error(`Management API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  throw new Error("Management API: hết lượt thử");
}
const zalo = (p) => `thu-mp-${p.ma}`.slice(0, 40);
const tinBot = async (z) => (await q(`select m.body from messages m join conversations c on c.id = m.conversation_id
  left join buyers b on b.id = c.buyer_id left join sellers s on s.id = c.seller_id
  where (b.zalo_user_id = ${lit(z)} or s.zalo_user_id = ${lit(z)}) and m.sender not in ('buyer','seller') order by m.created_at, m.seq`)).map((r) => r.body ?? "");
// SRS-5.1zzzzzd: dọn cả sổ đầu ra model (`ai_ghi_thu`) của các ID thử này — reset_nguoi_test không biết bảng đó.
const donDep = (ds) => q(`with a as (delete from ai_ghi_thu where zalo_user_id = any(array[${ds.map(lit).join(",")}]::text[]) returning 1)
  select count(public.reset_nguoi_test(z)) as n, (select count(*) from a) as ai from unnest(array[${ds.map(lit).join(",")}]::text[]) z`);

const ai = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 2 });
const chuCuaLoi = (r) => (r.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
const layJson = (s, mac) => { const m = String(s).match(/[[{][\s\S]*[\]}]/); try { return m ? JSON.parse(m[0]) : mac; } catch { return mac; } };
const banGhi = (luot) => luot.map((l) => `KHÁCH: ${l.khach}\n${(l.bot ?? []).map((b) => `BOT: ${b}`).join("\n")}`).join("\n\n");
// SRS-5.1zzzzy (lượt 11/10: bác lớn tuổi hỏi "pháp lý là sao", rồi chính model đóng vai bác viết "Dạ cháu giải thích cho bác nghe nhé…"):
// bản ghi cho model ĐÓNG VAI đánh dấu theo góc nhìn của nó — BẠN là tin của bạn, TRỢ LÝ là bên app — để nó không nhận nhầm vai.
const banGhiChoKhach = (luot) => luot.map((l) => `BẠN: ${l.khach}\n${(l.bot ?? []).map((b) => `TRỢ LÝ: ${b}`).join("\n")}`).join("\n\n");

/** Model đóng vai khách: trả {tin, xong}. */
async function tinKhachKe(p, luot) {
  const r = await ai.messages.create({
    model: MODEL_KHACH, max_tokens: 300,
    system: `Bạn ĐÓNG VAI một người bán bất động sản đang nhắn Zalo với trợ lý của AI Ơi Nhà Đất. Đây là bài kiểm thử bot, người thật không đọc.
Tính cách / cách gõ: ${p.mo_ta}
Xưng hô của bạn: ${p.xung_ho}. Hành vi ẩn: ${p.an_y}
SỰ THẬT về căn (chỉ nói những gì có ở đây, đúng cách gõ của bạn, mỗi tin một ít; không bịa thêm dữ kiện; KHÔNG đưa số điện thoại): ${p.loi_ke}
Bạn LUÔN là người bán, KHÔNG BAO GIỜ nói thay bên app / trợ lý: không giải thích phí, thuật ngữ hay cách bên app làm việc, không tự trấn an
mình ("app này không lấy tiền trước đâu" là lời của bên app, không phải của bạn). Bạn hỏi mà TRỢ LÝ chưa trả lời rõ thì hỏi lại hoặc bỏ qua,
như người bán thật — không tự trả lời câu của chính mình. Trong bản ghi, dòng BẠN là tin bạn đã nhắn, dòng TRỢ LÝ là bên app.
Luật: mỗi lượt viết ĐÚNG MỘT tin như người thật nhắn (không giải thích, không ngoặc kép). Bot hỏi gì thì trả lời theo tính cách. Bot gửi bản nháp tin (dòng bắt đầu 📋) thì đồng ý đăng hoặc sửa chỗ sai. Bot báo tin đã lên kệ, hoặc bạn đã kể hết và bot không hỏi gì nữa → xong.
Trả về DUY NHẤT JSON: {"tin": "<tin nhắn kế>", "xong": false} hoặc {"tin": "", "xong": true}.`,
    messages: [{ role: "user", content: luot.length ? `Cuộc chat tới giờ:\n\n${banGhiChoKhach(luot)}\n\nTin kế của bạn?` : `Bắt đầu bằng đúng câu này: "${p.cau_dau}"` }],
  });
  const j = layJson(chuCuaLoi(r), {});
  return { tin: String(j.tin ?? "").slice(0, 400).trim(), xong: j.xong === true };
}

/** Giám khảo: 5 tiêu chí giọng AOND, mỗi lỗi kèm trích dẫn nguyên văn câu bot. */
async function giamKhao(luot) {
  const r = await ai.messages.create({
    model: MODEL_CHAM, max_tokens: 4000, thinking: { type: "adaptive" },
    system: `Bạn chấm lời một trợ lý môi giới nhắn Zalo với người bán (chỉ chấm dòng BOT; dòng bắt đầu 🤖 💾 📝 📋 👤 là bong bóng hệ thống, bỏ qua).
Năm tiêu chí: (1) mot_y — mỗi tin chỉ hỏi MỘT ý; (2) khong_doc_lai — không đọc lại số liệu khách vừa nói; (3) khong_bia — không khẳng định điều khách chưa nói / bot không thể biết (tin đã đăng, đã kiểm duyệt, giá thị trường, pháp lý chưa ai nói); (4) khong_tieng_anh — không chen tiếng Anh; (5) tu_nhien — không máy móc ("Dạ em cảm ơn" mở mọi tin, lặp khuôn câu), không cụt lủn vô nghĩa.
CHÍNH SÁCH CÓ THẬT của bên trợ lý (bot nói đúng những điều này KHÔNG phải bịa): không thu đồng nào trước; phí chỉ thu khi giao dịch thành công;
chính chủ 1% giá chốt, môi giới 0,5%, cho thuê 3/4 tháng tiền thuê; chưa rõ người bán là chính chủ hay môi giới thì nói "mức tuỳ chính chủ hay
môi giới" (không số); hạng người rao Đồng / Bạc / Vàng là có thật; câu "Em tra thấy đường X thuộc phường Y" là tra từ điển đường có thật.
Chỉ liệt kê VI PHẠM có thật. Mỗi vi phạm trích NGUYÊN VĂN một đoạn ≥ 6 ký tự của câu BOT đó.
Trả về DUY NHẤT JSON mảng: [{"tieu_chi": "mot_y|khong_doc_lai|khong_bia|khong_tieng_anh|tu_nhien", "trich_dan": "...", "nhan_xet": "..."}] (không lỗi thì []).`,
    messages: [{ role: "user", content: banGhi(luot) }],
  });
  return layJson(chuCuaLoi(r), []);
}

async function chayMot(p) {
  const z = zalo(p);
  const luot = [];
  for (let i = 0; i < LUOT; i++) {
    const { tin, xong } = await tinKhachKe(p, luot);
    if (xong || !tin) break;
    const truoc = (await tinBot(z)).length;
    await q(`select net.http_post(url := public.cau_hinh('functions_base_url') || '/chat-reply',
        body := jsonb_build_object('external_user_id', ${lit(z)}, 'channel', 'zalo_personal_test', 'text', ${lit(tin)},
          'msg_id', 'mp-' || ${lit(z)} || '-' || gen_random_uuid()::text, 'ghi_ai', true),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-bridge-secret', public.get_secret('BRIDGE_SECRET')),
        timeout_milliseconds := 120000) as id`);
    const han = Date.now() + 150_000;
    let sau = truoc;
    while (Date.now() < han) { await ngu(5000); sau = (await tinBot(z)).length; if (sau > truoc) break; }
    await ngu(7000); // bong bóng cuối của lượt
    const ds = await tinBot(z);
    luot.push({ khach: tin, bot: ds.slice(truoc) });
    console.log(`[${p.ma}] lượt ${i + 1}\n  KHÁCH: ${tin}\n${ds.slice(truoc).map((b) => `  BOT: ${b.replace(/\n/g, " ⏎ ")}`).join("\n") || "  (bot không trả lời trong 150 giây)"}`);
  }
  const [tin] = await q(`select l.property_type, l.deal, l.district, l.street, l.location_raw, l.price_vnd, l.area_m2, l.frontage_m, l.length_m,
      l.floors, l.bedrooms, l.legal_status, l.status from listings l join sellers s on s.id = l.seller_id
     where s.zalo_user_id = ${lit(z)} order by l.created_at limit 1`);
  // Lượt chạy đầu (11/10): "4x18 mới đúng" ra "Không trích xuất được gì" mà dữ liệu thử đã dọn, không còn gì để truy. In AI bóc tách
  // từng lượt (đề xuất · bị loại vì sao · khách hỏi gì) như ban-thu.yml, TRƯỚC khi dọn — lỗi lần sau có bằng chứng.
  const aiLuot = await q(`select b.cau_dang_hoi as hoi, left(b.tin, 120) as tin,
      (select string_agg((d->>'khoa') || '=' || (d->>'gia_tri') || ' «' || (d->>'trich_dan') || '»', ' · ') from jsonb_array_elements(b.de_xuat) d) as de_xuat,
      (select string_agg((d->>'khoa') || ':' || (d->>'ly_do'), ' · ') from jsonb_array_elements(b.bo) d) as bo,
      b.da_ghi->'hoi_lai'->>'chu_de' as hoi_lai
    from boc_tach_bong b join sellers s on s.id = b.seller_id where s.zalo_user_id = ${lit(z)} order by b.created_at`).catch(() => []);
  for (const a of aiLuot) console.log(`[${p.ma}] AI · hỏi ${a.hoi ?? "-"} · «${a.tin ?? ""}» · đề xuất: ${a.de_xuat ?? "(rỗng)"} · loại: ${a.bo ?? "-"}${a.hoi_lai ? ` · khách hỏi: ${a.hoi_lai}` : ""}`);
  // SRS-5.1zzzzzd: CA PHÁT LẠI — đầu ra model thật của từng lượt (chat-reply ghi vào `ai_ghi_thu` vì tin mang cờ `ghi_ai`), ghép theo
  // đúng tin khách, in một dòng JSON để chép vào bot/tests/phat-lai/ca/ (lấy bằng `lay-tu-log.mjs`). Chạy lại offline không tốn tiền.
  const ghiAi = await q(`select tin, luot from ai_ghi_thu where zalo_user_id = ${lit(z)} order by created_at, id`).catch(() => []);
  const caPhatLai = { ten: `mp-${p.ma}-${new Date().toISOString().slice(0, 10)}`, nguon: { run: process.env.GITHUB_RUN_ID ?? null, persona: p.ma },
    cau_hinh: CAU_HINH, luot: [], ky_vong: [] };
  let j = 0;
  for (const l of luot) {
    const k = ghiAi.findIndex((g, i) => i >= j && String(g.tin ?? "").trim() === l.khach.trim());
    const ai = k >= 0 ? (typeof ghiAi[k].luot === "string" ? JSON.parse(ghiAi[k].luot) : ghiAi[k].luot) : [];
    if (k >= 0) j = k + 1;
    caPhatLai.luot.push({ khach: l.khach, bot_goc: l.bot ?? [], ai });
  }
  console.log(`PHAT_LAI_JSON ${p.ma} ${JSON.stringify(caPhatLai)}`);
  const kq = chamTatDinh(p, luot, tin ?? null);
  let loiAi = [];
  try { loiAi = kiemTrichDanGiamKhao(await giamKhao(luot), luot).giu; } catch (e) { console.log(`[${p.ma}] giám khảo AI hỏng: ${String(e).slice(0, 160)}`); }
  return { kq, loiAi, luot, aiLuot };
}

const IDS = PERSONA.map(zalo);
const CAU_HINH = {};
let thoat = 0;
try {
  for (const z of IDS) if ((await q(`select public.la_id_thu(${lit(z)}) as t`))[0]?.t !== true) throw new Error(`${z} không phải ID thử`);
  // Công tắc production lúc chạy — ca phát lại chạy lại đúng chế độ đó (chỉ khoá công tắc, không có bí mật).
  for (const r of await q(`select key, value from app_config where key in ('boc_tach_ai','bao_lai_da_luu','luat_loi_bot','tro_ly','nhip_go','lenh_json')`).catch(() => [])) CAU_HINH[r.key] = r.value;
  console.log(`Dọn dữ liệu thử cũ: ${JSON.stringify(await donDep(IDS))}`);
  console.log(`Chạy ${PERSONA.length} persona, tối đa ${LUOT} lượt, khách ${MODEL_KHACH}, giám khảo ${MODEL_CHAM}`);
  const ketQua = await Promise.all(PERSONA.map((p) => chayMot(p).catch((e) => ({ loi: String(e).slice(0, 300), ma: p.ma }))));
  const bang = [DAU_BANG, ...ketQua.map((k) => k.kq ? dongTomTat(k.kq, k.loiAi) : `| ${k.ma} | hỏng: ${k.loi} | | | | | |`)].join("\n");
  const chiTiet = ketQua.filter((k) => k.kq).map((k) => [`### ${k.kq.ma}`,
    ...k.kq.loi.map((l) => `- lượt ${l.luot} · ${l.ma}: ${String(l.cau).slice(0, 160)}`),
    ...k.loiAi.map((l) => `- AI · ${l.tieu_chi}: «${String(l.trich_dan).slice(0, 120)}» ${String(l.nhan_xet ?? "").slice(0, 160)}`)].join("\n")).join("\n\n");
  console.log(`\n${bang}\n\n${chiTiet}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Khách mô phỏng\n\n${bang}\n\n${chiTiet}\n`);
  const thuMuc = join(HERE, "..", "..", "..", "train", "out");
  mkdirSync(thuMuc, { recursive: true });
  writeFileSync(join(thuMuc, `mo-phong-${Date.now()}.json`), JSON.stringify(ketQua, null, 1));
  if (ketQua.some((k) => !k.kq)) thoat = 1;
} catch (e) {
  console.error(`HỎNG: ${String(e).slice(0, 300)}`);
  thoat = 2;
} finally {
  try { console.log(`Dọn dữ liệu thử: ${JSON.stringify(await donDep(IDS))}`); } catch (e) { console.error(`DỌN HỎNG — chạy tay reset_nguoi_test cho ${IDS.join(", ")}: ${e}`); thoat = 2; }
}
process.exit(thoat);
