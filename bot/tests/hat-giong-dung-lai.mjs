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

// 02/11/2026: schema `so` khi dựng lại — câu cũ của 20260907c / f còn chạy (trừ câu `so.ro_hang`) không được đọc bảng / cột đã gỡ;
// `so.ro_hang` dựng bằng 20261102b SAU vòng `so`, có `security_invoker`.
const fileMig = (t) => join(MIG, readdirSync(MIG).find((x) => x.startsWith(`${t}_`)));
const conLai = ["20260907c", "20260907f", "20260907g", "20260924f"]
  .flatMap((t) => capCao(readFileSync(fileMig(t), "utf8")).split(";").filter((c) => !/\bso\.ro_hang\b/i.test(c)).map((c) => `${t}: ${c.trim().slice(0, 80)}`));
const gay = conLai.filter((c) => /\b(public\.)?media\s+m\b|legacy_sst|source_url/.test(c));
ok("câu schema `so` cũ còn chạy khi dựng lại không đọc media / legacy_sst / source_url", gay.length === 0, gay.join("\n       "));
ok("vòng schema `so` bỏ câu so.ro_hang (cauSoTruRoHang, cùng mẫu với bài này)",
  /chay\(`\$\{t\} \(schema so\)`, cauSoTruRoHang\(/.test(dl) && dl.includes("!/\\bso\\.ro_hang\\b/i.test("));
const viTriSo = dl.indexOf("cauSoTruRoHang(docFile"), viTriB = dl.indexOf('fileMig("20261102b")');
ok("20261102b (so.ro_hang hiện hành) chạy SAU vòng schema `so`", viTriSo > 0 && viTriB > viTriSo, `${viTriSo} / ${viTriB}`);
const b = capCao(readFileSync(fileMig("20261102b"), "utf8"));
ok("20261102b có security_invoker, không đọc media / legacy_sst",
  /create or replace view so\.ro_hang with \(security_invoker = true\)/i.test(b) && !/\bmedia\s+m\b|legacy_sst/.test(b));
console.log(hong ? `\nHẠT GIỐNG DỰNG LẠI: ${hong} CA HỎNG` : "\nHẠT GIỐNG DỰNG LẠI: ĐẠT");
process.exit(hong ? 1 : 0);
