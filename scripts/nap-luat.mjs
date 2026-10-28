#!/usr/bin/env node
// nap-luat.mjs — nạp kho điều luật (SRS-5.1zzzzzzz231) từ bot/supabase/luat/ lên bảng van_ban_luat / dieu_luat qua Management API.
// Chạy trong apply-migration.yml ô `dung_lai` = nap-luat (TOKEN + PROJECT_REF). Chạy lại được: upsert theo (so_hieu, dieu, phan); chữ một
// điều đổi thì trigger dieu_luat_doi_chu xoá vector để lịch nhung-luat-tick nhúng lại; phần không còn trong tệp thì xoá. KHÔNG gọi AI.
// Tệp chữ sinh bằng scripts/tach-dieu-luat.py — đừng sửa tay tệp .json.
import { readFileSync, existsSync } from "node:fs";

const TOKEN = process.env.TOKEN, REF = process.env.PROJECT_REF;
if (!TOKEN || !REF) { console.error("::error::Thiếu TOKEN / PROJECT_REF"); process.exit(2); }
const THU_MUC = new URL("../bot/supabase/luat/", import.meta.url);

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`SQL ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return r.json();
}
const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

try {
  const dm = JSON.parse(readFileSync(new URL("danh-muc.json", THU_MUC), "utf8"));
  for (const vb of dm.van_ban) {
    const tep = new URL(vb.tep, THU_MUC);
    if (!existsSync(tep)) { console.log(`-- bỏ qua ${vb.so_hieu}: chưa có tệp ${vb.tep}`); continue; }
    const { so_hieu, dieu } = JSON.parse(readFileSync(tep, "utf8"));
    if (so_hieu !== vb.so_hieu || !Array.isArray(dieu) || !dieu.length) throw new Error(`${vb.tep}: sai số hiệu hoặc rỗng`);
    await q(`insert into public.van_ban_luat (so_hieu, ten, loai, ngay_hieu_luc, con_hieu_luc, nguon_url, ghi_chu, nap_luc)
      values (${lit(vb.so_hieu)}, ${lit(vb.ten)}, ${lit(vb.loai)}, ${lit(vb.ngay_hieu_luc)}, ${vb.con_hieu_luc ? "true" : "false"}, ${lit(vb.nguon_url)}, ${lit(vb.ghi_chu)}, now())
      on conflict (so_hieu) do update set ten = excluded.ten, loai = excluded.loai, ngay_hieu_luc = excluded.ngay_hieu_luc,
        con_hieu_luc = excluded.con_hieu_luc, nguon_url = excluded.nguon_url, ghi_chu = excluded.ghi_chu, nap_luc = now()`);
    for (let i = 0; i < dieu.length; i += 40) {
      const me = dieu.slice(i, i + 40);
      await q(`insert into public.dieu_luat (so_hieu, dieu, phan, tieu_de, noi_dung) values
        ${me.map((d) => `(${lit(so_hieu)}, ${lit(d.dieu)}, ${Number(d.phan)}, ${lit(d.tieu_de)}, ${lit(d.noi_dung)})`).join(",\n")}
        on conflict (so_hieu, dieu, phan) do update set tieu_de = excluded.tieu_de, noi_dung = excluded.noi_dung`);
    }
    const giu = dieu.map((d) => `(${lit(d.dieu)}, ${Number(d.phan)})`).join(",");
    const xoa = await q(`delete from public.dieu_luat where so_hieu = ${lit(so_hieu)} and (dieu, phan) not in (${giu}) returning id`);
    const dem = (await q(`select count(*)::int n, count(nhung)::int co_vector from public.dieu_luat where so_hieu = ${lit(so_hieu)}`))[0];
    console.log(`== ${so_hieu} (${vb.ten}): ${dem.n} phần trên DB (tệp ${dieu.length}), đã có vector ${dem.co_vector}, xoá ${xoa.length} phần cũ`);
    if (dem.n !== dieu.length) throw new Error(`${so_hieu}: DB ${dem.n} phần ≠ tệp ${dieu.length}`);
  }
  // Văn bản trên DB mà danh mục không còn (thay bằng bản hợp nhất, gỡ bỏ) → xoá cả điều luật (cascade).
  const giuVb = dm.van_ban.filter((v) => existsSync(new URL(v.tep, THU_MUC))).map((v) => lit(v.so_hieu)).join(",");
  const bo = await q(`delete from public.van_ban_luat where so_hieu not in (${giuVb}) returning so_hieu`);
  if (bo.length) console.log(`== xoá văn bản không còn trong danh mục: ${bo.map((r) => r.so_hieu).join(", ")}`);
  const tong = (await q("select count(*)::int n, count(nhung)::int co_vector from public.dieu_luat"))[0];
  console.log(`OK: kho ${tong.n} phần điều luật, ${tong.co_vector} đã có vector (lịch nhung-luat-tick nhúng dần ~20 phần / 2 phút).`);
} catch (e) {
  console.error(`::error::${e.message}`);
  process.exit(2);
}
