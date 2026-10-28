// SRS-5.1zzzzs (10/10/2026) — dữ liệu khởi tạo nằm trong migration phải sống sót khi dựng lại từ số không.
//
// Dựng lại (scripts/dung-lai-db.mjs) chỉ nạp schema.sql — không replay migration — rồi bước `du-lieu` chạy lại các câu
// insert/update/delete trên một danh sách bảng (BANG). Bảng nào có dòng khởi tạo trong migration mà không nằm trong danh
// sách đó thì mất dòng khi dựng lại, im lặng: 08/10 mất dòng id=1 của bridge_dang_nhap → /admin không hiện trạng thái acc
// clone, nút "Đăng nhập lại" khoá, bridge báo trạng thái trúng 0 dòng.
// Bài này quét mọi câu `insert into <bảng>` CẤP CAO NHẤT (ngoài thân hàm $$…$$) trong bot/supabase/migrations/ và đòi:
// bảng đó nằm trong BANG của dung-lai-db.mjs, hoặc nằm trong MIEN dưới đây kèm lý do.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG = join(GOC, "bot", "supabase", "migrations");

// Bảng có câu insert cấp cao nhất nhưng cố ý KHÔNG nạp lại khi dựng lại. Thêm dòng ở đây là một quyết định kèm lý do.
const MIEN = {
  storage: "storage.buckets — dung-lai-db bước cau-truc chạy riêng (nhánh `luon`)",
  supabase_migrations: "sổ migration — dung-lai-db ghi riêng",
  ctvs: "bảng CTV đã gỡ 28/10/2026 (20261028d, bỏ hẳn CTV) — câu insert trong migration lịch sử 20260825 không còn chỗ để nạp",
  sellers: "dữ liệu thử / dữ liệu thật cũ trong migration lịch sử — không phải dữ liệu tham chiếu",
  listings: "như trên",
  listing_media: "như trên",
  listing_facts: "như trên",
  projects: "kho dự án nạp bằng bước nap-du-an",
  bot_prompts: "bảng đã gỡ 20261018i cùng bot TypeScript — insert chỉ còn trong migration lịch sử",
  bot_health: "dòng điểm danh tự sinh khi chạy",
  bot_errors: "sổ lỗi",
  reminders: "hàng đợi tự sinh",
  duong: "nạp bằng bước nap-duong",
  required_facts: "bảng gỡ 20261019g (bộ câu hỏi nay ở src/aioi/schema.py) — insert chỉ còn trong migration lịch sử",
  luu_tru: "kho lưu bản cũ trước khi xoá (vd app_config_ts_20261019, 20261019d) — không phải dữ liệu tham chiếu",
};

const dl = readFileSync(join(GOC, "scripts", "dung-lai-db.mjs"), "utf8");
const m = /const BANG = "\(\?:public\\\\\.\)\?\(([a-z_|]+)\)/.exec(dl);
if (!m) { console.error("✗ không đọc được BANG trong scripts/dung-lai-db.mjs"); process.exit(1); }
const PHU = new Set(m[1].split("|"));

// Bỏ chú thích và thân $tag$…$tag$ (hàm, do-block) — chỉ giữ câu lệnh cấp cao nhất.
const capCao = (sql) => sql
  .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''")
  .replace(/--[^\n]*/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

const thieu = [];
const gap = new Set();
for (const f of readdirSync(MIG).filter((x) => x.endsWith(".sql")).sort()) {
  const s = capCao(readFileSync(join(MIG, f), "utf8"));
  for (const mm of s.matchAll(/(?:^|;)\s*insert\s+into\s+(?:public\.)?("?)([a-z_]+)\1(?:\.[a-z_]+)?/gim)) {
    const bang = mm[2].toLowerCase();
    gap.add(bang);
    if (!PHU.has(bang) && !(bang in MIEN)) thieu.push(`${f}: insert into ${bang}`);
  }
}

let hong = 0;
const ok = (ten, dk, chiTiet = "") => { console.log(`${dk ? "✓" : "✗"} ${ten}${dk ? "" : `\n     → ${chiTiet}`}`); if (!dk) hong++; };
ok("mọi câu insert cấp cao nhất trong migration được bước du-lieu phủ hoặc có lý do miễn", thieu.length === 0, thieu.join("\n       "));
ok("bridge_dang_nhap (ca gốc 08/10) nằm trong BANG của dung-lai-db", PHU.has("bridge_dang_nhap"), [...PHU].join(","));
ok("bài quét thấy được câu khởi tạo của bridge_dang_nhap (không quét hụt)", gap.has("bridge_dang_nhap"), [...gap].join(","));
ok("bài quét KHÔNG nhặt câu insert trong thân hàm (chat_quota chỉ insert trong hàm)", !gap.has("chat_quota"), [...gap].join(","));
console.log(hong ? `\nHẠT GIỐNG DỰNG LẠI: ${hong} CA HỎNG` : "\nHẠT GIỐNG DỰNG LẠI: ĐẠT");
process.exit(hong ? 1 : 0);
