// dong-bo-prompt.mjs — SO và ĐỒNG BỘ prompt bot giữa code và cơ sở dữ liệu.
//
// Chủ dự án 10/09/2026: "giờ tao vào đâu để sửa prompt bot và đồng bộ luôn bằng tay".
//
// HAI BẢN, DB ĐÈ CODE. Prompt của bot có hai nơi ở:
//   · code   — `bot/supabase/functions/_shared/prompts.ts` (đi theo git, có PR, có review)
//   · DB     — bảng `bot_prompts` (sửa tay ở Supabase Table Editor, KHÔNG cần deploy)
// Lúc chạy, `chat-reply` nạp `bot_prompts` và ĐÈ lên bản trong code, nhớ tạm 60 giây.
// Nên: sửa DB là bot đổi giọng trong vòng một phút; sửa code thì phải deploy.
//
// Cái bẫy đã xảy ra thật (10/09): `cau_hoi_mau` trong DB CŨ hơn code — bot chạy
// bộ câu hỏi cũ suốt mà không ai thấy, vì không có gì so hai bên. Lệnh này để
// không phải phát hiện bằng mắt nữa.
//
//   node scripts/dong-bo-prompt.mjs           # SO hai bên, in khoá nào lệch
//   node scripts/dong-bo-prompt.mjs --day     # ĐẨY code → DB (code là chuẩn)
//   node scripts/dong-bo-prompt.mjs --keo     # KÉO DB → code (bản sửa tay là chuẩn)
//
// Cần SUPABASE_SERVICE_ROLE_KEY trong scripts/.env.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// `.env` là TUỲ CHỌN: trên CI (`dong-bo-prompt.yml`) không có file này, token đi qua biến môi trường.
// Lượt chạy đầu 05/10 đỏ ngay dòng này (ENOENT) trước khi kịp tới đường Management API.
const docEnv = () => { try { return readFileSync(join(HERE, ".env"), "utf8"); } catch { return ""; } };
const env = Object.fromEntries(
  docEnv().split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const URL_DB = env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
// 05/10/2026 (SRS-5.1zza): chạy được từ CI (`dong-bo-prompt.yml`) bằng SUPABASE_ACCESS_TOKEN qua Management API — máy không có
// service_role (phiên Claude, máy mới) vẫn đẩy được prompt; không thì bản DB đè code mãi mà không ai thấy.
const TOKEN_QT = process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN ?? null;
const REF = (process.env.PROJECT_REF ?? "rqxmmqmctpklqcmbfxuj").trim();
if (!KEY && !TOKEN_QT) { console.error("Thiếu SUPABASE_SERVICE_ROLE_KEY trong scripts/.env (hoặc SUPABASE_ACCESS_TOKEN cho đường Management API)"); process.exit(1); }
async function sqlQuanTri(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN_QT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`Management API HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}
// Chuỗi nội dung đi vào SQL bằng dollar-quote với thẻ không thể xuất hiện trong prompt.
const lit = (x) => { const tag = "$prompt_" + Math.random().toString(36).slice(2, 8) + "$"; if (String(x).includes(tag)) throw new Error("thẻ trùng"); return `${tag}${x}${tag}`; };
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const DAY = process.argv.includes("--day");
const KEO = process.argv.includes("--keo");
// 13/10/2026: `--chi k1,k2` — chỉ so / đẩy các khoá này (khoá khác trên DB có bản chủ dự án sửa tay, vd cau_tien_dinh 12/10, không bị đè).
const CHI = (() => { const i = process.argv.indexOf("--chi"); return i >= 0 && process.argv[i + 1] ? new Set(process.argv[i + 1].split(",").map((x) => x.trim()).filter(Boolean)) : null; })();
const md5 = (s) => createHash("md5").update(s ?? "").digest("hex");

// Bản trong CODE: import thẳng module dùng chung, không đọc bằng regex — regex
// đọc mã nguồn là cách chắc chắn sẽ lệch khi ai đó xuống dòng khác đi.
const P = await import(new URL("../bot/supabase/functions/_shared/prompts.ts", import.meta.url).href);
const TU_CODE = {
  tone_rules: P.TONE_RULES,
  seller_script_rules: P.SELLER_SCRIPT_RULES,
  seller_fewshot: P.SELLER_FEWSHOT,
  buyer_fewshot: P.BUYER_FEWSHOT,
  slang_notes: P.SLANG_NOTES,
  agree_rules: P.AGREE_RULES,
  fee_rules: P.FEE_RULES,
  human_chat_rules: P.HUMAN_CHAT_RULES,
  rate_ctv_rubric: P.RATE_CTV_RUBRIC,
  loi_chao: P.LOI_CHAO,
  cau_hoi_mau: P.CAU_HOI_MAU_TEXT,
  cau_tien_dinh: P.CAU_TIEN_DINH_TEXT,
};

let dongDb;
if (KEY) {
  const r = await fetch(`${URL_DB}/rest/v1/bot_prompts?select=key,content`, { headers: H });
  if (!r.ok) { console.error(`Đọc bot_prompts hỏng: HTTP ${r.status}`); process.exit(1); }
  dongDb = await r.json();
} else {
  dongDb = await sqlQuanTri("select key, content from public.bot_prompts");
}
const TU_DB = Object.fromEntries(dongDb.map((x) => [x.key, x.content]));

const khoa = [...new Set([...Object.keys(TU_CODE), ...Object.keys(TU_DB)])].filter((k) => !CHI || CHI.has(k)).sort();
const lech = [];
console.log("khoá".padEnd(22), "code".padEnd(10), "DB".padEnd(10), "trạng thái");
for (const k of khoa) {
  const a = TU_CODE[k], b = TU_DB[k];
  const ta = a == null ? "—" : `${md5(a).slice(0, 8)}`;
  const tb = b == null ? "—" : `${md5(b).slice(0, 8)}`;
  const trangThai = a == null ? "CHỈ CÓ Ở DB" : b == null ? "CHỈ CÓ Ở CODE" : a === b ? "khớp" : "LỆCH";
  if (trangThai !== "khớp") lech.push(k);
  console.log(k.padEnd(22), ta.padEnd(10), tb.padEnd(10), trangThai);
}

// Kết thúc bằng `process.exitCode` chứ không `process.exit()`: trên máy Windows
// của dự án, `process.exit()` giữa lúc còn socket đang đóng làm libuv ném
// "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" và `bun run` đọc ra
// mã 9 — tức lệnh BÁO HỎNG trong khi nó vừa in "khớp hết". Một mã thoát nói dối
// còn tệ hơn không có mã thoát.
if (!lech.length) {
  console.log("\nHai bên khớp hết.");
} else {
  console.log(`\n${lech.length} khoá lệch: ${lech.join(", ")}`);
  if (!DAY && !KEO) {
    console.log("Chạy lại với --day (code → DB) hoặc --keo (DB → code) để đồng bộ.");
    console.log("DB ĐÈ code lúc chạy, nên khoá lệch nghĩa là bot đang dùng bản DB.");
    process.exitCode = 1;
  } else if (DAY) {
    const rows = lech.filter((k) => TU_CODE[k] != null).map((k) => ({ key: k, content: TU_CODE[k] }));
    let loiGhi = null;
    if (KEY) {
      const w = await fetch(`${URL_DB}/rest/v1/bot_prompts?on_conflict=key`, {
        method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
      if (!w.ok) loiGhi = `HTTP ${w.status} ${(await w.text()).slice(0, 300)}`;
    } else {
      try {
        const values = rows.map((x) => `(${lit(x.key)}, ${lit(x.content)})`).join(",\n");
        await sqlQuanTri(`insert into public.bot_prompts (key, content) values ${values}\n` +
          `on conflict (key) do update set content = excluded.content, updated_at = now()`);
      } catch (e) { loiGhi = String(e?.message ?? e); }
    }
    if (loiGhi) {
      console.error(`Ghi hỏng: ${loiGhi}`);
      process.exitCode = 1;
    } else {
      console.log(`Đã đẩy ${rows.length} khoá từ CODE lên DB. Bot đổi trong vòng 60 giây (nhớ tạm).`);
    }
  } else {
    // KÉO: chỉ IN RA để người dán vào prompts.ts — ghi đè mã nguồn tự động là
    // cách nhanh nhất để mất một bản sửa tay mà không ai thấy trong diff.
    console.log("\nDán các đoạn dưới vào bot/supabase/functions/_shared/prompts.ts rồi mở PR:\n");
    for (const k of lech) {
      if (TU_DB[k] == null) continue;
      console.log(`──── ${k} ────`);
      console.log(TU_DB[k]);
      console.log();
    }
    console.log("Nhớ deploy chat-reply sau khi merge, nếu không code và DB lại lệch.");
  }
}
