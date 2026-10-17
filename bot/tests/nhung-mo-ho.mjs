// NHÚNG MƠ HỒ — `listings ↔ sellers` có HAI quan hệ (listings.seller_id và
// sellers.active_listing_id, 20260827h), nên PostgREST từ chối `sellers(...)` trần trên
// một select đi từ `listings` bằng 300 PGRST201. Bắt 15/09/2026: ask-seller (hỏi bù)
// chết im từ 09/09 với 313 dòng "listing không tồn tại", chat-reply chốt kèo không ghi
// `deals`, nudge đọc nhắc đến hạn rỗng — ba chỗ, không chỗ nào đọc `error`.
// Mock e2e không biết PGRST201, nên bài này soi MÃ NGUỒN: mọi chuỗi select có
// `sellers(` mà nằm trong ngữ cảnh listings thì phải là `sellers!listings_seller_id_fkey(`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// 23/09: .pathname giữ %20 và thêm dấu / đầu — máy Windows có dấu cách trong đường dẫn thì
// ENOENT (CI Linux không thấy). fileURLToPath giải mã đúng cho cả hai.
const GOC = fileURLToPath(new URL("../../", import.meta.url));
const THU_MUC = ["bot/supabase/functions", "app", "lib"];
const files = [];
const di = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (f === "node_modules" || f.startsWith(".")) continue; if (statSync(p).isDirectory()) di(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
for (const t of THU_MUC) di(join(GOC, t));

let hong = 0, soSelect = 0;
for (const f of files) {
  // Bỏ chú thích `// …` (giữ xuống dòng để số dòng đúng): chú thích hay trích cụm
  // `sellers(...)` để giải thích, không phải mã.
  const src = readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, (c) => " ".repeat(c.length));
  // Mỗi chuỗi select là một literal; xét literal có "sellers(" không kèm gợi ý.
  const re = /(["'`])((?:(?!\1)[^\\]|\\.)*?)\1/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const lit = m[2];
    if (!/(?<![!\w])sellers\(/.test(lit)) continue;
    soSelect++;
    // Ngữ cảnh listings: chuỗi có "listings(" (lồng) HOẶC 400 ký tự trước có .from("listings")
    const truoc = src.slice(Math.max(0, m.index - 400), m.index);
    const tuListings = /listings\(/.test(lit) || /from\(["'`]listings["'`]\)/.test(truoc);
    if (!tuListings) continue;
    // Có "listings(" lồng nhưng sellers( trần nằm NGOÀI cụm listings(...) thì vẫn hợp lệ
    // (vd reminders → sellers(...) và listings(...) song song). Chỉ bắt sellers( trần đứng SAU listings(.
    const viTriListings = lit.indexOf("listings(");
    const sauListings = viTriListings >= 0 ? lit.slice(viTriListings) : lit;
    if (!/(?<![!\w])sellers\(/.test(sauListings) && viTriListings >= 0) continue;
    hong++;
    const dong = src.slice(0, m.index).split("\n").length;
    console.log(`  \x1b[31m✗\x1b[0m ${f.replace(GOC, "")}:${dong} — sellers( trần trong select đi từ listings; dùng sellers!listings_seller_id_fkey(`);
  }
}
console.log(`NHÚNG MƠ HỒ: soi ${files.length} file, ${soSelect} chuỗi có sellers( — ${hong ? hong + " chỗ hỏng" : "sạch"}`);
process.exit(hong ? 1 : 0);
