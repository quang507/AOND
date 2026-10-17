#!/usr/bin/env bun
// keo-that.mjs — KÉO prompt + công tắc + mẫu câu của PRODUCTION xuống cho chat thử (chế độ MÁY), 07/10/2026.
//
// Chủ dự án: "lấy bot prompt… xuống chỗ test đi, để bây giờ tôi test là cái chuẩn nhất và có thể sửa ở đây lun".
// Đọc CHỈ ĐỌC qua Management API (SUPABASE_ACCESS_TOKEN — chạy được cả khi project đang khoá 402, như dong-bo-prompt.yml):
//   · bot_prompts            — bản DB ĐÈ code lúc chạy (chat.mjs dùng khi chạy `--prompt db`)
//   · app_config             — CHỈ các công tắc bot đọc qua `cau_hinh` (danh sách trắng bên dưới), không lấy dòng khác
//   · mau_cau_fewshot(ban/mua) — mẫu câu chuẩn sửa tay ở /admin/mau-cau (FR-180)
//   · duong                  — từ điển tên đường (FR-212, ~10.000 dòng OSM theo phường mới, dữ liệu công khai): không có
//                              bảng này DB giả không tra được phường từ tên đường + quận ("Thạnh Lộc 41, quận 12")
// Ghi ra `bot/tests/chat/that.json` (gitignore). KHÔNG in nội dung prompt / mẫu câu ra màn hình (log Actions công khai,
// mẫu câu có câu khách thật) — chỉ in tên khoá, khớp/lệch code, và giá trị các công tắc (chữ ngắn như "chinh", "gon").
//
//   SUPABASE_ACCESS_TOKEN=… bun bot/tests/chat/keo-that.mjs        # rồi: bun run chat -- --web
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
const REF = (process.env.PROJECT_REF ?? "rqxmmqmctpklqcmbfxuj").trim();
if (!TOKEN) { console.error("Thiếu SUPABASE_ACCESS_TOKEN"); process.exit(1); }

// Công tắc chat-reply đọc qua `cau_hinh`. `tim_theo_nghia` cố ý KHÔNG lấy: DB giả không có vector, bật là gọi RPC không có.
// `test_reset_hello` cũng không lấy: chat thử luôn bật ("hello" = làm lại người đó).
const CONG_TAC = ["boc_tach_ai", "bao_lai_da_luu", "luat_loi_bot", "tro_ly", "nhip_go", "lenh_json"];

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`Management API HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

const prompts = await sql("select key, content from public.bot_prompts order by key");
const ds = CONG_TAC.map((k) => `'${k}'`).join(",");
const cauHinh = Object.fromEntries((await sql(`select key, value from public.app_config where key in (${ds})`)).map((r) => [r.key, r.value]));
// Bỏ cột vector `nhung` (nặng, DB giả không dùng). Dòng không có tên / phường vẫn lấy như bảng thật.
const duong = await sql("select ten, ten_khong_dau, tinh, phuong, quan_cu, loai, so_hem, duong_me, lat, lng from public.duong");
const mau = (await sql("select public.mau_cau_fewshot('ban') as ban, public.mau_cau_fewshot('mua') as mua"))[0] ?? {};

const P = await import(new URL("../../supabase/functions/_shared/prompts.ts", import.meta.url).href);
const CODE = {
  tone_rules: P.TONE_RULES, seller_script_rules: P.SELLER_SCRIPT_RULES, seller_fewshot: P.SELLER_FEWSHOT, buyer_fewshot: P.BUYER_FEWSHOT,
  slang_notes: P.SLANG_NOTES, agree_rules: P.AGREE_RULES, fee_rules: P.FEE_RULES, human_chat_rules: P.HUMAN_CHAT_RULES,
  loi_chao: P.LOI_CHAO, cau_hoi_mau: P.CAU_HOI_MAU_TEXT, cau_tien_dinh: P.CAU_TIEN_DINH_TEXT,
};
const lech = prompts.filter((r) => r.key in CODE && r.content !== CODE[r.key]).map((r) => r.key);

writeFileSync(join(HERE, "that.json"), JSON.stringify({
  luc: new Date().toISOString(), bot_prompts: prompts, duong, cau_hinh: cauHinh, mau_cau: { ban: mau.ban ?? "", mua: mau.mua ?? "" },
}));
console.log(`bot_prompts: ${prompts.length} khoá · lệch code: ${lech.length ? lech.join(", ") : "không"}`);
console.log(`công tắc: ${CONG_TAC.map((k) => `${k}=${cauHinh[k] ?? "(trống)"}`).join(" · ")}`);
console.log(`mẫu câu: bán ${String(mau.ban ?? "").split("\n").filter(Boolean).length} dòng · mua ${String(mau.mua ?? "").split("\n").filter(Boolean).length} dòng`);
console.log(`duong: ${duong.length} dòng`);
console.log("Đã ghi bot/tests/chat/that.json");
