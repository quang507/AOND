// Chặn tái phát đợt giảm egress Supabase 02/10/2026 (docs/07 SRS-5.1z). Soi MÃ NGUỒN, không gọi DB:
//  G-01 generateStaticParams của route động KHÔNG được hỏi Supabase — mỗi lượt build (CI mỗi PR + Vercel preview +
//       production) sẽ dựng sẵn mọi dòng; /du-an/[slug] từng đốt 83% request REST cả project như vậy.
//  G-02 mọi `rpc("match_projects", …)` phải nối `.select(…)` — hàm trả SETOF projects, không chọn cột là kéo cả vector `nhung`.
//  G-03 không `select("*")` trên `listings` / `projects` ở web và chat-reply (vector `nhung` ~9,8 KB/dòng).
//  G-04 (03/10, SRS-5.1zl) mọi generateStaticParams trả [] — kể cả khi tham số lấy từ từ điển (/[tag]): trang dựng sẵn vẫn hỏi
//       DB lúc render, nhân với số lượt build. G-05: trang công khai không cache dưới 1 giờ (revalidate / unstable_cache).
//  G-06 chat-reply không select nguyên bảng bot_prompts — chỉ khoá DB khác bản code qua rpc doc_prompt_khac.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const goc = new URL("../..", import.meta.url).pathname;
let dat = 0, hong = 0;
const kiem = (ten, ok, chiTiet = "") => { ok ? dat++ : hong++; console.log(`${ok ? "✓" : "✗"} ${ten}${ok ? "" : ` — ${chiTiet}`}`); };

function duyet(thu, ra = []) {
  for (const f of readdirSync(thu)) {
    const p = join(thu, f);
    if (statSync(p).isDirectory()) duyet(p, ra);
    else if (/\.(tsx?|mjs)$/.test(f)) ra.push(p);
  }
  return ra;
}

// G-01: thân hàm generateStaticParams (tới dấu `}` đầu dòng) không chứa supabase/from(/rpc(.
const trang = duyet(join(goc, "app")).filter((p) => /\[[^\]]+\]/.test(p) && p.endsWith("page.tsx"));
for (const p of trang) {
  const s = readFileSync(p, "utf8");
  const m = s.match(/export (?:async )?function generateStaticParams\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
  if (!m) continue;
  const hoiDb = /supabase|\.from\(|\.rpc\(/.test(m[1]);
  kiem(`G-01 ${p.slice(goc.length)}: generateStaticParams không hỏi DB`, !hoiDb, "dựng sẵn mọi dòng mỗi lượt build — trả [] (vẫn ● / ISR)");
}

// G-04: thân generateStaticParams chỉ `return [];`.
for (const p of trang) {
  const s = readFileSync(p, "utf8");
  const m = s.match(/export (?:async )?function generateStaticParams\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
  if (!m) continue;
  kiem(`G-04 ${p.slice(goc.length)}: generateStaticParams trả []`, /^\s*return \[\];\s*$/.test(m[1]), m[1].trim().slice(0, 80));
}
// G-05: revalidate < 3600 ở trang / thành phần công khai (bỏ qua admin, quản lý, tài khoản).
for (const p of [...duyet(join(goc, "app")), ...duyet(join(goc, "lib")), ...duyet(join(goc, "components"))]) {
  if (/\/(admin|quan-ly|tai-khoan)\//.test(p)) continue;
  const s = readFileSync(p, "utf8");
  for (const m of s.matchAll(/export const revalidate = (\d+)|revalidate: (\d+)|const TTL = (\d+)/g)) {
    const n = Number(m[1] ?? m[2] ?? m[3]);
    kiem(`G-05 ${p.slice(goc.length)}: cache ≥ 3600 s`, n >= 3600, m[0]);
  }
}
// G-06.
{
  const cr = readFileSync(join(goc, "bot/supabase/functions/chat-reply/index.ts"), "utf8");
  const keoBang = [...cr.matchAll(/from\("bot_prompts"\)\.select\(/g)].length;
  const thanNap = cr.match(/async function napPrompt\([\s\S]*?\n\}/)?.[0] ?? "";
  kiem("G-06 chat-reply: bot_prompts đọc qua doc_prompt_khac; select cả bảng chỉ còn ở nhánh RPC hỏng trong napPrompt",
    /rpc\("doc_prompt_khac"/.test(thanNap) && keoBang === 1 && /from\("bot_prompts"\)\.select\(/.test(thanNap.slice(thanNap.indexOf("doc_prompt_khac"))),
    `số chỗ select bot_prompts: ${keoBang}`);
}

// G-02 + G-03 trên chat-reply và web.
const nguon = [join(goc, "bot/supabase/functions/chat-reply/index.ts"), ...duyet(join(goc, "app")), ...duyet(join(goc, "lib")), ...duyet(join(goc, "components"))];
for (const p of nguon) {
  const s = readFileSync(p, "utf8");
  const ten = p.slice(goc.length);
  for (const m of s.matchAll(/rpc\("match_projects",[^)]*\)(\s*\.\w+)?/g)) {
    kiem(`G-02 ${ten}: match_projects có .select`, (m[1] ?? "").trim() === ".select", m[0].slice(0, 80));
  }
  for (const m of s.matchAll(/from\("(listings|projects)"\)\s*\.select\("\*"\)/g)) {
    kiem(`G-03 ${ten}: không select("*") trên ${m[1]}`, false, m[0]);
  }
}

// Ca tự kiểm: bộ bắt phải BẮT được mẫu xấu (không thì xanh vì soi sai).
const xau = 'export async function generateStaticParams() {\n  const { data } = await supabase.from("projects").select("slug");\n  return data;\n}';
const mx = xau.match(/export (?:async )?function generateStaticParams\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
kiem("G-tu-kiem: bắt được generateStaticParams hỏi DB", !!mx && /supabase/.test(mx[1]), "regex không còn bắt mẫu cũ");
const rpcXau = 'client.rpc("match_projects", { p_text: text }).then((r) => r)';
const mr = [...rpcXau.matchAll(/rpc\("match_projects",[^)]*\)(\s*\.\w+)?/g)][0];
kiem("G-tu-kiem: bắt được match_projects thiếu .select", mr && (mr[1] ?? "").trim() !== ".select", "regex không còn bắt mẫu cũ");

console.log(`\n${dat}/${dat + hong} đạt`);
if (hong) process.exit(1);
