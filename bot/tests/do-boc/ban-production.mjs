// Bắn bộ đo bóc tách lên PRODUCTION rồi chấm (03/10/2026, chủ dự án: "giờ bot đáp ứng bao nhiêu %"). Chạy trong workflow
// `do-boc.yml` (cần SUPABASE_ACCESS_TOKEN — Management API, chỉ có trên GitHub Actions). Làm đúng các bước README.md §"Đo trên
// production": Zalo thử `do-<id>` (la_id_thu), mẻ ≤ 20 người, mỗi lượt đợi MỌI người trong mẻ có tin bot mới rồi mới bắn lượt kế;
// cuối cùng đổ trạng thái ra JSON, chấm bằng chay.mjs --tu-trang-thai, và dọn dữ liệu thử (reset_nguoi_test) — kể cả khi hỏng giữa
// chừng. Không in nội dung trả lời của bot; câu khách là câu soạn sẵn trong ca.jsonl.
//   PROJECT_REF=… TOKEN=… node bot/tests/do-boc/ban-production.mjs [--nhom ban1,sua] [--bo-nhom mua] [--me 20]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOC = join(HERE, "..", "..", "..");
const { PROJECT_REF, TOKEN } = process.env;
if (!PROJECT_REF || !TOKEN) { console.error("Thiếu PROJECT_REF / TOKEN — CHƯA ĐO ĐƯỢC"); process.exit(2); }
const args = process.argv.slice(2);
const giaTri = (k, mac) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : mac; };
const NHOM = giaTri("--nhom", "") ? giaTri("--nhom", "").split(",") : null;
const BO_NHOM = giaTri("--bo-nhom", "") ? giaTri("--bo-nhom", "").split(",") : [];
const ME = Math.min(20, Number(giaTri("--me", "20")) || 20);

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
async function q(sql) {
  for (let lan = 1; lan <= 4; lan++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
    });
    if (r.ok) return await r.json();
    if (r.status === 429 || r.status >= 500) { await ngu(3000 * lan); continue; } // giới hạn tốc độ Management API
    throw new Error(`Management API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  throw new Error("Management API: hết lượt thử");
}

const CA = readFileSync(join(HERE, "ca.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
  .filter((c) => (!NHOM || NHOM.includes(c.nhom)) && !BO_NHOM.includes(c.nhom));
const zalo = (c) => `do-${c.id.toLowerCase()}`;
const DS_LIT = (ds) => ds.map((c) => lit(zalo(c))).join(",");
const demBot = async (ds) => Object.fromEntries((await q(`select u.z, (select count(*) from messages m join conversations c on c.id = m.conversation_id
    left join buyers b on b.id = c.buyer_id left join sellers s on s.id = c.seller_id
    where (b.zalo_user_id = u.z or s.zalo_user_id = u.z) and m.sender not in ('buyer','seller'))::int as n
  from unnest(array[${DS_LIT(ds)}]) u(z)`)).map((r) => [r.z, r.n]));
const donDep = () => q(`select count(public.reset_nguoi_test(z)) as n from (select zalo_user_id z from sellers where zalo_user_id like 'do-%'
  union select zalo_user_id from buyers where zalo_user_id like 'do-%') u`);

let ma = 0;
try {
  for (const c of CA) if ((await q(`select public.la_id_thu(${lit(zalo(c))}) as t`))[0]?.t !== true) throw new Error(`${zalo(c)} không phải ID thử`);
  console.log(`Dọn dữ liệu thử cũ: ${JSON.stringify(await donDep())}`);
  console.log(`BẮN ${CA.length} ca (${CA.reduce((n, c) => n + c.luot.length, 0)} lượt), mẻ ${ME} người`);
  for (let i = 0; i < CA.length; i += ME) {
    const me = CA.slice(i, i + ME);
    const soLuot = Math.max(...me.map((c) => c.luot.length));
    for (let t = 0; t < soLuot; t++) {
      const ban = me.filter((c) => c.luot[t]);
      const truoc = await demBot(ban);
      await q(`select count(net.http_post(url := public.cau_hinh('functions_base_url') || '/chat-reply',
          body := jsonb_build_object('external_user_id', x.z, 'channel', 'zalo_personal_test', 'text', x.t,
            'msg_id', 'do-' || x.z || '-' || gen_random_uuid()::text),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-bridge-secret', public.get_secret('BRIDGE_SECRET')),
          timeout_milliseconds := 120000)) as n
        from (values ${ban.map((c) => `(${lit(zalo(c))}, ${lit(c.luot[t])})`).join(",")}) x(z, t)`);
      const han = Date.now() + 180_000;
      let con = ban;
      while (con.length && Date.now() < han) {
        await ngu(6000);
        const sau = await demBot(con);
        con = con.filter((c) => !(sau[zalo(c)] > truoc[zalo(c)]));
      }
      await ngu(8000); // bong bóng cuối của lượt
      console.log(`  mẻ ${i / ME + 1} lượt ${t + 1}: ${ban.length - con.length}/${ban.length} người có trả lời${con.length ? ` — chưa: ${con.map((c) => c.id).join(",")}` : ""}`);
    }
  }
  const [{ kq }] = await q(`select coalesce(jsonb_object_agg(upper(substr(u.z, 4)), jsonb_build_object(
    'tin', coalesce((select jsonb_agg(jsonb_build_object('code', l.code, 'property_type', l.property_type,
        'district', l.district, 'ward', l.ward, 'price_vnd', l.price_vnd, 'area_m2', l.area_m2,
        'bedrooms', l.bedrooms, 'legal_status', l.legal_status, 'floors', l.floors,
        'frontage_m', l.frontage_m, 'deal', l.deal, 'status', l.status) order by l.created_at)
      from listings l join sellers s on s.id = l.seller_id where s.zalo_user_id = u.z), '[]'::jsonb),
    'mua', (select b.preferences from buyers b where b.zalo_user_id = u.z))), '{}'::jsonb) as kq
  from unnest(array[${DS_LIT(CA)}]) u(z)`); // mọi ca đã bắn, kể cả ca bot không tạo tin / hồ sơ nào (chấm là trống)
  const loi = await q(`select left(source, 60) as nguon, count(*)::int as n from bot_errors
    where at > now() - interval '2 hours' and source like 'chat-reply%' group by 1 order by 2 desc limit 10`);
  console.log(`Sổ lỗi chat-reply 2 giờ qua: ${JSON.stringify(loi)}`);
  const ra = join(GOC, "train", "out", "do-boc");
  mkdirSync(ra, { recursive: true });
  writeFileSync(join(ra, "production.json"), JSON.stringify(kq));
  const chiCa = CA.map((c) => c.id).join(",");
  const r = spawnSync("bun", [join(HERE, "chay.mjs"), "--tu-trang-thai", join(ra, "production.json"), "--chi", chiCa], { stdio: "inherit" });
  ma = r.status ?? 1;
} catch (e) {
  console.error(`HỎNG: ${e.message}`);
  ma = 2;
} finally {
  console.log(`Dọn dữ liệu thử: ${JSON.stringify(await donDep().catch((e) => e.message))}`);
}
process.exit(ma === 2 ? 2 : 0);
