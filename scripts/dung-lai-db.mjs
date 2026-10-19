#!/usr/bin/env node
// dung-lai-db.mjs — DỰNG LẠI DB từ số không trên một project Supabase RỖNG (08/10/2026).
//
// Vì sao có: project production cũ bị xoá nhầm 08/10/2026 (gói Free, không sao lưu). Quy trình tay (README bot
// của repo Nhadat.cc cũ) chưa từng diễn tập; script này làm đúng các bước đó qua Management API
// (`SUPABASE_ACCESS_TOKEN`, chạy trong apply-migration.yml), từng bước một, in SỐ ĐẾM chứ không in dữ liệu
// (log Actions công khai).
//
//   TOKEN=… PROJECT_REF=… node scripts/dung-lai-db.mjs <bước>
//   kiem      chỉ đọc: phiên bản Postgres, event trigger, số bảng public — xem token có vào được project không
//   cau-truc  gỡ event trigger "tự bật RLS" của dashboard (nó bật RLS cả bảng production cố ý để tắt), rồi:
//             20260929b (schema luu_tru) → schema.sql → 20261008a → bốn file schema `so`
//   du-lieu   dữ liệu tham chiếu KHÔNG nằm trong schema.sql: chạy lại theo thứ tự file mọi câu insert/update/delete
//             trên wards, phuong_cu, quan_cu, app_config trong migrations/ (chỉ các câu đó — câu tạo
//             hàm trong migration cũ là bản cũ, chạy lại là đè bản mới của schema.sql). Mã project cũ trong câu được
//             thay bằng mã mới. Sau cùng đặt các khoá app_config phụ thuộc project + công tắc production.
//   xac-minh  đếm dòng các bảng tham chiếu để đối chiếu
//
// Câu lỗi KHÔNG dừng cả bước: in mã lỗi + 120 chữ đầu của câu, chạy tiếp, cuối bước chạy lại lượt hai các câu lỗi
// (view chồng view phải tạo sau view nó dựa vào). Còn lỗi sau lượt hai thì thoát 1.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIG = join(GOC, "bot", "supabase", "migrations");
const TOKEN = (process.env.TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
const REF = (process.env.PROJECT_REF ?? "").trim();
const REF_CU = "tbcdpupiarkuxtntmosl";
const PUBLISHABLE = (process.env.PUBLISHABLE_KEY ?? "").trim();
const buoc = process.argv[2];

// Log job Actions phiên Claude không tải được (chuyển hướng sang kho blob) — chỉ annotation đọc được qua API. Gom mọi dòng
// in ra, lúc thoát phát thành vài `::notice::` (≤ 9 khối × 3.500 chữ). Chỉ số đếm / lỗi, không có dữ liệu dòng nào.
const BAO = [];
const logGoc = console.log.bind(console);
console.log = (...a) => { const d = a.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" "); BAO.push(d); logGoc(d); };
const thoatGoc = process.exit.bind(process);
process.exit = (ma = 0) => {
  if (process.env.GITHUB_ACTIONS) {
    const all = BAO.join("\n");
    for (let i = 0, k = 0; i < all.length && k < 9; i += 3500, k++) {
      const m = all.slice(i, i + 3500).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
      logGoc(`::notice title=dung-lai ${buoc} ${k + 1}::${m}`);
    }
  }
  thoatGoc(ma);
};
process.on("unhandledRejection", (e) => { console.log(`LỖI: ${String(e?.message ?? e).slice(0, 500)}`); process.exit(1); });
if (!TOKEN || !/^[a-z]{20}$/.test(REF)) { console.error("Thiếu TOKEN hoặc PROJECT_REF"); process.exit(2); }
if (REF === REF_CU) { console.error("PROJECT_REF vẫn là mã project cũ"); process.exit(2); }

async function sql(query, readOnly = false) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    signal: AbortSignal.timeout(180_000), // một câu treo (chờ khoá) không được giữ cả bước hàng giờ
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(readOnly ? { query, read_only: true } : { query }),
  });
  const t = await r.text();
  if (!r.ok) { const e = new Error(`HTTP ${r.status} ${t.slice(0, 300)}`); e.status = r.status; throw e; }
  try { return JSON.parse(t); } catch { return t; }
}

// Tách SQL thành từng câu: tôn trọng '…' (kể cả E'…\''), "…", $tag$…$tag$, -- và /* */.
export function tachCau(s) {
  const out = [];
  let i = 0, dau = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i], c2 = s.slice(i, i + 2);
    if (c2 === "--") { const j = s.indexOf("\n", i); i = j < 0 ? n : j + 1; continue; }
    if (c2 === "/*") { const j = s.indexOf("*/", i + 2); i = j < 0 ? n : j + 2; continue; }
    if (c === "'") {
      const e = i > 0 && /[eE]/.test(s[i - 1]) && !/[a-zA-Z0-9_]/.test(s[i - 2] ?? "");
      i++;
      while (i < n) {
        if (e && s[i] === "\\") { i += 2; continue; }
        if (s[i] === "'") { if (s[i + 1] === "'") { i += 2; continue; } i++; break; }
        i++;
      }
      continue;
    }
    if (c === '"') { const j = s.indexOf('"', i + 1); i = j < 0 ? n : j + 1; continue; }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i, i + 64));
      if (m && !/[A-Za-z0-9_]/.test(s[i - 1] ?? "")) {
        const j = s.indexOf(m[0], i + m[0].length);
        i = j < 0 ? n : j + m[0].length;
        continue;
      }
    }
    if (c === ";") { const cau = s.slice(dau, i).trim(); if (cau) out.push(cau); dau = i + 1; }
    i++;
  }
  const cuoi = s.slice(dau).trim();
  if (cuoi && !/^(--[^\n]*\n?\s*)*$/.test(cuoi)) out.push(cuoi);
  return out;
}

const boChuThich = (c) => c.replace(/^(\s*--[^\n]*\n)+/, "").trim();
const dau120 = (c) => boChuThich(c).replace(/\s+/g, " ").slice(0, 120);

// Chạy lại trên DB đã dựng một phần: khoá chính / UNIQUE đã có ném 42P16 / 42P07 (khối do $d$ của schema.sql chỉ bắt
// duplicate_object) — đó là "đã xong", không phải lỗi.
const DA_CO = (m) => /ERROR: (42P16: multiple primary keys|42P07: relation .* already exists|42710: .* already exists)/.test(m);

// Gửi một dãy câu: gom thành khối ≤ 120 KB cho nhanh; khối lỗi thì chạy lẻ từng câu để biết câu nào.
async function chay(ten, caus) {
  console.log(`\n▶ ${ten}: ${caus.length} câu`);
  const loi = [];
  let khoi = [], co = 0;
  const xa = async () => {
    if (!khoi.length) return;
    const ds = khoi; khoi = []; co = 0;
    try { await sql(ds.join(";\n") + ";"); }
    catch {
      for (const c of ds) { try { await sql(c + ";"); } catch (e) { if (!DA_CO(String(e.message))) loi.push({ c, e: String(e.message) }); } }
    }
  };
  for (const c of caus) {
    if (co + c.length > 120_000) await xa();
    khoi.push(c); co += c.length;
  }
  await xa();
  if (loi.length) {
    // Chạy lại tới khi không còn tiến triển (bảng cần hàm, hàm cần bảng, view cần view — mỗi lượt gỡ thêm một tầng).
    let con = loi;
    for (let luot = 2; luot <= 8 && con.length; luot++) {
      console.log(`  lượt ${luot}: chạy lại ${con.length} câu lỗi`);
      const moi = [];
      for (const x of con) { try { await sql(x.c + ";"); } catch (e) { if (!DA_CO(String(e.message))) moi.push({ c: x.c, e: String(e.message) }); } }
      if (moi.length === con.length) { con = moi; break; }
      con = moi;
    }
    for (const x of con.slice(0, 40)) console.log(`  ✗ ${dau120(x.c)}\n    ${x.e.replace(/\s+/g, " ").slice(0, 240)}`);
    console.log(`  ${caus.length - con.length}/${caus.length} câu xong`);
    return con.length;
  }
  console.log(`  ${caus.length}/${caus.length} câu xong`);
  return 0;
}

// Khoá publishable CŨ còn ghi cứng trong vài hàm (schema.sql) và migration — thay bằng khoá mới (khoá công khai).
const PUB_CU = "sb_publishable_zmJBmEgFPn3bBKx_1ve6Pg_dXdo4haX";
const docFile = (p) => {
  const s = readFileSync(p, "utf8").replaceAll(REF_CU, REF);
  return /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(PUBLISHABLE) ? s.replaceAll(PUB_CU, PUBLISHABLE) : s;
};
// schema.sql do xuat_schema() bản trước 20261008b sinh ra: cột SINH thành `default <biểu thức>`, cột IDENTITY thành
// `not null` trơn + sequence xuất riêng. Vá đúng các dòng đó (mỗi dòng phải khớp đúng một lần — lệch là dừng, không đoán).
const COT_IDENTITY = [["messages", "seq", "always"], ["phuong_cu", "id", "always"]];
function vaSchema(s) {
  if (!/default bo_dau\(ten\)/.test(s)) return s; // schema.sql đã sinh bằng xuat_schema() mới
  const doi = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`vá schema.sql: "${a.slice(0, 50)}" khớp ${n} lần`); s = s.replace(a, b); };
  doi("ten_khong_dau text default bo_dau(ten),", "ten_khong_dau text generated always as (bo_dau(ten)) stored,");
  const m = /price_per_m2_vnd bigint default \n(CASE[\s\S]*?END),/.exec(s);
  if (!m) throw new Error("vá schema.sql: không thấy price_per_m2_vnd");
  doi(m[0], `price_per_m2_vnd bigint generated always as (${m[1]}) stored,`);
  for (const [t, c, kieu] of COT_IDENTITY) {
    doi(`create sequence if not exists public.${t}_${c}_seq;`, "");
    const re = new RegExp(`(create table if not exists public\\.${t} \\([\\s\\S]*?\\n  ${c} bigint) not null`);
    if (!re.test(s)) throw new Error(`vá schema.sql: không thấy cột ${t}.${c}`);
    s = s.replace(re, `$1 generated ${kieu} as identity`);
  }
  return s;
}
// Bảng đã lỡ tạo thiếu identity ở lượt chạy trước: bỏ sequence trơn cùng tên rồi gắn identity (bảng rỗng, không mất gì).
const vaIdentity = () => COT_IDENTITY.map(([t, c, kieu]) => `do $v$ begin
  if to_regclass('public.${t}') is not null and not exists (select 1 from pg_attribute where attrelid = 'public.${t}'::regclass and attname = '${c}' and attidentity <> '') then
    execute 'alter table public.${t} alter column ${c} drop default';
    execute 'drop sequence if exists public.${t}_${c}_seq';
    execute 'alter table public.${t} alter column ${c} add generated ${kieu} as identity';
  end if;
end $v$`);

const fileMig = (tien) => { const f = readdirSync(MIG).find((x) => x.startsWith(tien)); if (!f) throw new Error(`không thấy migration ${tien}`); return join(MIG, f); };

try {
if (buoc === "kiem") {
  console.log(await sql("select version() as v", true));
  console.log("event trigger:", JSON.stringify(await sql(
    "select e.evtname, e.evtevent, p.proname, n.nspname from pg_event_trigger e join pg_proc p on p.oid = e.evtfoid join pg_namespace n on n.oid = p.pronamespace order by 1", true)));
  console.log("bảng public:", JSON.stringify(await sql("select count(*)::int as n from pg_tables where schemaname = 'public'", true)));
  console.log("hàm public:", JSON.stringify(await sql("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'", true)));
  console.log("view public:", JSON.stringify(await sql("select count(*)::int as n from pg_views where schemaname = 'public'", true)));
  console.log("trigger:", JSON.stringify(await sql("select count(*)::int as n from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal", true)));
  // Câu nào đang chạy / chờ khoá (để biết lượt dựng lại treo ở đâu) — chỉ 100 chữ đầu câu SQL, không có dữ liệu.
  console.log("đang chạy:", JSON.stringify(await sql(
    "select pid, state, wait_event_type, wait_event, (now() - query_start)::text as lau, left(regexp_replace(query, '\\s+', ' ', 'g'), 100) as q from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle' order by query_start", true)));
  console.log("quyền mẫu:", JSON.stringify(await sql(
    "select c.relname, c.relacl::text as acl from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('wards','duong','app_config','listing_missing_facts','agents_public','listings') order by 1", true)));
  console.log("default privileges:", JSON.stringify(await sql("select pg_get_userbyid(defaclrole) as role, defaclobjtype as t, defaclacl::text as acl from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace where n.nspname = 'public'", true)));
  // Vector (tìm theo nghĩa): đếm dòng đã nhúng / tổng, công tắc liên quan.
  console.log("vector:", JSON.stringify(await sql(`select
    (select count(*) from public.wards)::int as wards, (select count(nhung) from public.wards)::int as wards_vec,
    (select count(*) from public.phuong_cu)::int as phuong_cu, (select count(nhung) from public.phuong_cu)::int as phuong_cu_vec,
    (select count(*) from public.quan_cu)::int as quan_cu, (select count(nhung) from public.quan_cu)::int as quan_cu_vec,
    (select count(*) from public.duong)::int as duong, (select count(nhung) from public.duong)::int as duong_vec,
    (select count(*) from public.projects)::int as projects, (select count(nhung) from public.projects)::int as projects_vec,
    (select count(*) from public.listings)::int as listings, (select count(nhung) from public.listings)::int as listings_vec`, true)));
  console.log("công tắc:", JSON.stringify(await sql("select key, value from public.app_config where key in ('tim_theo_nghia','nhung_tam_dung_den','nhung_moi_tick','nhung_dia_danh_moi_tick') order by 1", true)));
  // Chỉ TÊN secret trong Vault (không bao giờ đọc giá trị) — để biết còn thiếu khoá nào bot cần.
  console.log("vault (tên):", JSON.stringify((await sql("select name from vault.secrets order by 1", true)).map((r) => r.name)));
  console.log("extension có sẵn:", JSON.stringify(await sql(
    "select name, installed_version from pg_available_extensions where name in ('pg_cron','pg_net','vector','http','fuzzystrmatch','supabase_vault','pgcrypto','uuid-ossp','pg_stat_statements') order by 1", true)));
} else if (buoc === "cau-truc") {
  // Event trigger dashboard tạo khi tick "Enable automatic RLS": chỉ gỡ cái có hàm mang chữ rls, in tên trước.
  const et = await sql("select e.evtname, p.proname from pg_event_trigger e join pg_proc p on p.oid = e.evtfoid where p.proname ilike '%rls%' or e.evtname ilike '%rls%'");
  for (const r of et) {
    console.log(`gỡ event trigger ${r.evtname} (hàm ${r.proname})`);
    await sql(`drop event trigger if exists "${r.evtname}"`);
    // Hàm dashboard tạo kèm nằm ở public — không gỡ thì xuat_schema() chép nó vào schema.sql.
    if (r.proname === "rls_auto_enable") await sql("drop function if exists public.rls_auto_enable()");
  }
  let hong = 0;
  hong += await chay("20260929b (schema luu_tru)", tachCau(docFile(fileMig("20260929b"))));
  hong += await chay("vá identity bảng đã tạo", vaIdentity());
  hong += await chay("schema.sql", tachCau(vaSchema(docFile(join(GOC, "bot", "supabase", "schema.sql")))));
  hong += await chay("20261008b (xuat_schema xuất đúng cột sinh / identity)", tachCau(docFile(fileMig("20261008b"))));
  hong += await chay("20261008a", tachCau(docFile(fileMig("20261008a"))));
  // 20261014d: thêm 20260924f — lượt dựng 08/10 bỏ sót nó, log so.hoi_thoai ghi cứng "Thái (bot)".
  for (const t of ["20260907c", "20260907f", "20260907g", "20260924f"]) hong += await chay(`${t} (schema so)`, tachCau(docFile(fileMig(t))));
  console.log(`\nbảng public: ${JSON.stringify(await sql("select count(*)::int as n from pg_tables where schemaname = 'public'", true))}`);
  process.exit(hong ? 1 : 0);
} else if (buoc === "bu") {
  // Bù phần còn thiếu sau một lượt cau-truc dở dang — không chạy lại 1.400 câu (≈ 26 phút): đọc catalog, so với từng đối
  // tượng schema.sql định nghĩa, chỉ chạy câu của đối tượng chưa có. Câu cấp quyền / chú thích chạy lại hết (rẻ, an toàn).
  // Sổ migration: project mới không có supabase_migrations (chỉ CLI tạo) → tạo, và ghi mọi file trong repo là "đã áp qua
  // schema.sql" — không ghi thì cổng CI thứ 7 kêu ~300 migration "chưa áp", và liet_ke_migration*() không tạo được.
  let hong = await chay("sổ migration", [
    "create schema if not exists supabase_migrations",
    "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)",
  ]);
  const files = readdirSync(MIG).filter((f) => /^\d{8,14}[a-z]?_.+\.sql$/.test(f)).sort(); // 14 chữ số = file dấu vết OPEN-46
  const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
  hong += await chay("ghi sổ migration", [`insert into supabase_migrations.schema_migrations (version, name, statements) select v, n, array[]::text[] from (values ${
    files.map((f) => `(${q(f.replace(/\.sql$/, ""))}, ${q(f.replace(/\.sql$/, ""))})`).join(", ")
  }) x(v, n) where not exists (select 1 from supabase_migrations.schema_migrations m where m.name = x.n)`]);
  const caus = tachCau(vaSchema(docFile(join(GOC, "bot", "supabase", "schema.sql"))));
  const khoa = (c) => {
    const b = boChuThich(c);
    let m;
    if ((m = /^create or replace function public\.(\w+)\(/i.exec(b))) return `fn:${m[1]}`;
    if ((m = /^create or replace view public\.(\w+)/i.exec(b))) return `view:${m[1]}`;
    if ((m = /^create trigger (\w+) .*? on public\.(\w+)/is.exec(b))) return `trg:${m[2]}.${m[1]}`;
    if ((m = /^create (?:unique )?index (?:if not exists )?(\w+)/i.exec(b))) return `idx:${m[1]}`;
    if ((m = /^create policy "?([^"]+?)"? on public\.(\w+)/i.exec(b))) return `pol:${m[2]}.${m[1]}`;
    if ((m = /^create policy "?([^"]+?)"? on storage\.(\w+)/i.exec(b))) return `spol:${m[2]}.${m[1]}`;
    if ((m = /alter table public\.(\w+) add constraint (\w+)/i.exec(b))) return `con:${m[1]}.${m[2]}`;
    if (/^insert into storage\.buckets/i.test(b)) return "luon";
    if ((m = /^select cron\.schedule\('([^']+)'/i.exec(b))) return `cron:${m[1]}`;
    if (/^(grant|revoke|comment on|alter table public\.\w+ enable row level security|alter function)/i.test(b)) return "luon";
    return null;
  };
  const co = new Set((await sql(`
    select 'fn:' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    union select 'view:' || viewname from pg_views where schemaname = 'public'
    union select 'trg:' || c.relname || '.' || t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal
    union select 'idx:' || indexname from pg_indexes where schemaname = 'public'
    union select 'pol:' || tablename || '.' || policyname from pg_policies where schemaname = 'public'
    union select 'spol:' || tablename || '.' || policyname from pg_policies where schemaname = 'storage'
    union select 'con:' || c.relname || '.' || con.conname from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
    union select 'cron:' || jobname from cron.job`, true)).map((r) => Object.values(r)[0]));
  // Hàm nạp chồng: đủ tên chưa chắc đủ bản — đếm số bản theo tên, thiếu thì chạy lại mọi bản của tên đó.
  const demFn = Object.fromEntries((await sql("select p.proname as n, count(*)::int as c from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' group by 1", true)).map((r) => [r.n, r.c]));
  const canFn = {};
  for (const c of caus) { const k = khoa(c); if (k?.startsWith("fn:")) canFn[k.slice(3)] = (canFn[k.slice(3)] ?? 0) + 1; }
  const thieu = [], luon = [];
  for (const c of caus) {
    const k = khoa(c);
    if (k === "luon") luon.push(c);
    else if (k?.startsWith("fn:") && (demFn[k.slice(3)] ?? 0) < canFn[k.slice(3)]) thieu.push(c);
    else if (k && !k.startsWith("fn:") && !co.has(k)) thieu.push(c);
  }
  const loai = {};
  for (const c of thieu) { const k = khoa(c).split(":")[0]; loai[k] = (loai[k] ?? 0) + 1; }
  console.log(`thiếu theo loại: ${JSON.stringify(loai)}`);
  console.log(`thiếu (40 đầu): ${thieu.slice(0, 40).map((c) => khoa(c)).join(", ")}`);
  hong += await chay("bù đối tượng thiếu", thieu);
  // Project mới tick "Automatically expose new tables" → mọi bảng / view vừa tạo được cấp sẵn quyền cho anon + authenticated;
  // schema.sql chỉ chép câu GRANT (không có REVOKE cho bảng) nên chạy lại không gỡ được phần cấp thừa (soát 08/10: 5 view
  // không cổng admin + 15 bảng nội bộ lộ trên giấy). Thu sạch rồi cấp lại đúng như bản cũ. Hàm đã có revoke riêng từng cái.
  hong += await chay("thu quyền anon / authenticated", [
    "revoke all on all tables in schema public from anon, authenticated",
    "revoke all on all sequences in schema public from anon, authenticated",
  ]);
  hong += await chay("cấp quyền / chú thích / RLS", luon);
  // xuat_schema() bản trước 20261008b làm rơi `security_invoker=false` — agents_public cố ý chạy definer (20260910q).
  hong += await chay("20261008b + tuỳ chọn view bị rơi", [...tachCau(docFile(fileMig("20261008b"))),
    "alter view public.agents_public set (security_invoker = false)"]);
  process.exit(hong ? 1 : 0);
} else if (buoc === "du-lieu") {
  // SRS-5.1zzzzs: bảng có dòng khởi tạo trong migration mà schema.sql không mang. Thêm bảng một dòng / bảng cấu hình mới
  // thì thêm ở đây — bot/tests/hat-giong-dung-lai.mjs đỏ khi một câu insert cấp cao nhất trong migration không được phủ.
  const BANG = "(?:public\\.)?(wards|phuong_cu|quan_cu|app_config|bridge_dang_nhap)\\b";
  const laDuLieu = new RegExp(`^(insert\\s+into\\s+${BANG}|update\\s+${BANG}|delete\\s+from\\s+${BANG})`, "i");
  const bangCua = (b) => new RegExp(BANG, "i").exec(b.replace(/^(insert\s+into|update|delete\s+from)\s+/i, ""))?.[1];
  const files = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
  const theoFile = files.map((f) => ({ f, caus: tachCau(docFile(join(MIG, f))).map(boChuThich) }));
  // Điểm reset: file cuối cùng xoá sạch một bảng (`delete from <bảng>` không where) — câu của bảng đó ở file TRƯỚC điểm
  // reset đã bị xoá trong lịch sử thật (vd 20260909h xoá rồi nạp lại nguyên bộ required_facts); chạy lại chúng chỉ đẻ lỗi
  // vì ràng buộc / cột thời đó không còn.
  const reset = {};
  theoFile.forEach(({ caus }, i) => { for (const b of caus) { const m = /^delete\s+from\s+(?:public\.)?(\w+)\s*$/i.exec(b); if (m) reset[m[1]] = i; } });
  console.log(`điểm reset: ${JSON.stringify(Object.fromEntries(Object.entries(reset).map(([t, i]) => [t, files[i]])))}`);
  let hong = 0, gom = [];
  for (const [i, { f, caus }] of theoFile.entries()) {
    const dl = caus.filter((b) => laDuLieu.test(b) && i >= (reset[bangCua(b)] ?? -1));
    if (!dl.length) continue;
    const tam = caus.filter((b) => /^create\s+temp(orary)?\s+table/i.test(b));
    if (tam.length) {
      // Bảng tạm `on commit drop` chỉ sống trong một lượt gửi: gửi câu tạo bảng tạm + câu dữ liệu của file đó CHUNG một lần.
      if (gom.length) { hong += await chay("dữ liệu tham chiếu", gom); gom = []; }
      try { await sql([...tam, ...dl].join(";\n") + ";"); console.log(`  ${f}: ${dl.length} câu (kèm ${tam.length} bảng tạm) xong`); }
      catch (e) { hong++; console.log(`  ✗ ${f} (kèm bảng tạm): ${String(e.message).replace(/\s+/g, " ").slice(0, 300)}`); }
    } else gom.push(...dl);
  }
  if (gom.length) hong += await chay("dữ liệu tham chiếu", gom);
  const base = `https://${REF}.supabase.co`;
  const dat = [
    ["functions_base_url", `${base}/functions/v1`],
    ["storage_public_base_url", `${base}/storage/v1/object/public`],
    // 19/10/2026 (SRS-5.1zzzzzzz62): bỏ boc_tach_ai / luat_loi_bot / bao_lai_da_luu — chỉ bot TypeScript đã gỡ đọc.
    // Tìm theo nghĩa: cron nhung-tick chỉ nhúng khi công tắc này = bat (docs/07 SRS FR-216 g). Thiếu GEMINI_API_KEY trong
    // Vault thì tim_nghia_san_sang() = false → bot đi đường cũ, không hỏng gì. 19/10/2026: lõi Python tra phường / đường theo nghĩa
    // (SRS-5.1zzzzzzz60) — bật.
    ["tim_theo_nghia", "bat"],
  ];
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(PUBLISHABLE)) dat.push(["publishable_key", PUBLISHABLE]);
  else console.log("  (không có PUBLISHABLE_KEY — app_config.publishable_key chưa đặt)");
  const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
  hong += await chay("app_config theo project mới", dat.map(([k, v]) =>
    `insert into public.app_config (key, value) values (${q(k)}, ${q(v)}) on conflict (key) do update set value = excluded.value`));
  process.exit(hong ? 1 : 0);
} else if (buoc === "xac-minh") {
  for (const t of ["wards", "phuong_cu", "quan_cu", "app_config", "duong"]) {
    const r = await sql(`select count(*)::int as n from public.${t}`, true).catch((e) => [{ n: `lỗi ${e.message.slice(0, 80)}` }]);
    console.log(`${t}: ${r[0]?.n}`);
  }
  console.log("app_config khoá:", JSON.stringify((await sql("select key from public.app_config order by 1", true)).map((r) => r.key)));
  console.log("cron:", JSON.stringify(await sql("select jobname, schedule from cron.job order by 1", true).catch((e) => e.message.slice(0, 120))));
  console.log("bucket:", JSON.stringify(await sql("select id, public from storage.buckets order by 1", true)));
} else {
  console.error("Bước: kiem | cau-truc | bu | du-lieu | xac-minh");
  process.exit(2);
}
} catch (e) { console.log(`LỖI: ${String(e?.message ?? e).slice(0, 500)}`); process.exit(1); }
process.exit(0);
