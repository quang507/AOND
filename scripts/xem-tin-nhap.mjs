#!/usr/bin/env bun
// xem-tin-nhap.mjs — DỰNG THỬ bản nháp tin rao trên DỮ LIỆU THẬT, ngay trên máy.
//
// Vì sao có file này (12/09/2026): sửa cách bot trình bày tin rao mà mỗi lần
// xem kết quả lại phải deploy + nhắn thử trên Zalo thì vừa chậm vừa tốn lượt
// gọi hàm (Vercel free tier đã 75% của 1 triệu). Script đọc THẲNG mấy tin mới
// nhất trong Supabase rồi in ra đúng chuỗi mà `chat-reply` sẽ gửi — sửa chữ,
// chạy lại, nhìn, không đụng production.
//
//   bun scripts/xem-tin-nhap.mjs            # 5 tin mới nhất
//   bun scripts/xem-tin-nhap.mjs BDS-Q5-0016
//   bun scripts/xem-tin-nhap.mjs --so 10
//
// Cần SUPABASE_SERVICE_ROLE_KEY trong scripts/.env (đã gitignore) — chỉ ĐỌC.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAU_TIEN_DINH, dienCau } from "../bot/supabase/functions/_shared/prompts.ts";
import { soanTinNhap } from "../bot/supabase/functions/_shared/tin-nhap.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(HERE, ".env"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const URL_DB = env.SUPABASE_URL ?? "https://rqxmmqmctpklqcmbfxuj.supabase.co";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error("Thiếu SUPABASE_SERVICE_ROLE_KEY trong scripts/.env");
  process.exitCode = 1;
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const args = process.argv.slice(2);
const ma = args.find((a) => /^BDS-/i.test(a)) ?? null;
const soTin = Number(args[args.indexOf("--so") + 1]) || 5;

const lay = async (duong) => {
  const r = await fetch(`${URL_DB}/rest/v1/${duong}`, { headers: H });
  if (!r.ok) throw new Error(`${duong} → HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json();
};

const loc = ma ? `code=eq.${ma.toUpperCase()}` : `order=created_at.desc&limit=${soTin}`;
const tins = await lay(`listings?select=*&${loc}`);
if (!tins.length) {
  console.log("Không thấy tin nào.");
  process.exit(0);
}

// Câu tiền định: đọc bản trong DB nếu có (DB ĐÈ code lúc chạy — FR-138), không
// thì dùng bản trong code. In ra bản nào đang dùng để khỏi nhìn nhầm.
const [bp] = await lay("bot_prompts?select=content&key=eq.cau_tien_dinh");
let bang = CAU_TIEN_DINH, nguon = "code";
if (bp?.content) {
  try {
    bang = { ...CAU_TIEN_DINH, ...JSON.parse(bp.content) };
    nguon = "DB (bot_prompts.cau_tien_dinh)";
  } catch (e) {
    console.error("bot_prompts.cau_tien_dinh hỏng JSON, dùng bản code:", String(e).slice(0, 120));
  }
}
const cachGoi = "anh/chị";
const cauTD = (khoa, o = {}) =>
  dienCau(bang[khoa] ?? CAU_TIEN_DINH[khoa] ?? "", { ...o, ac: cachGoi, Ac: cachGoi, web: "aioinhadat.vercel.app" });

console.log(`Câu tiền định lấy từ: ${nguon}\n`);
for (const l of tins) {
  const facts = await lay(
    `listing_facts?select=question,answer,created_at&listing_id=eq.${l.id}&order=created_at.desc`,
  );
  // `diem_tin` trả MỘT dòng: PostgREST đưa về object, không phải mảng.
  const dRaw = await lay(`rpc/diem_tin?p_listing_id=${l.id}`).catch(() => null);
  const d = Array.isArray(dRaw) ? dRaw[0] : dRaw;
  const diem = d?.diem ?? 0;
  console.log("═".repeat(78));
  console.log(`${l.code} · ${l.status} · điểm ${diem}/100 · ${facts.length} fact`);
  console.log("═".repeat(78));
  console.log(
    soanTinNhap({
      l,
      facts,
      diem,
      thieu: d?.thieu ?? [],
      soAnh: d?.so_anh ?? 0,
      lai: false,
      cauTD,
    }),
  );
  console.log();
}
