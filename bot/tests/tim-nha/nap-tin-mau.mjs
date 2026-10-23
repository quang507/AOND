#!/usr/bin/env node
// nap-tin-mau.mjs — nạp thêm 100 tin mẫu `seed_thu` (SEED0031..SEED0130) bằng SQL qua Management API (SRS-5.1zzzzzzz144). Chạy trong
// apply-migration.yml ô `dung_lai` = nap-tin-mau. KHÔNG gọi AI chat; vector do cron `nhung-tick` nhúng dần (10 tin / 2 phút, khi hạn mức Gemini cho phép).
// Chạy lại được: bỏ qua mã đã có. Xoá hết khi cần: select reset_nguoi_test('thu-seed-001') (cả 130 tin mẫu).
import { sinhTin, sqlNapTin } from "./nap-tin-mau-lib.mjs";

const TOKEN = process.env.TOKEN, REF = process.env.PROJECT_REF;
if (!TOKEN || !REF) { console.error("::error::Thiếu TOKEN / PROJECT_REF"); process.exit(2); }

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`SQL ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return r.json();
}

try {
  const ban = await q("select count(*)::int as n from sellers where zalo_user_id = 'thu-seed-001'");
  if (!ban[0].n) throw new Error("Chưa có người bán thử thu-seed-001 (nạp 30 tin đầu trước)");
  const co = new Set((await q("select code from listings where code like 'SEED%'")).map((r) => r.code));
  const can = sinhTin(100, 31).filter((t) => !co.has(t.code));
  console.log(`== đã có ${co.size} mã SEED; cần nạp ${can.length} tin`);
  for (let i = 0; i < can.length; i += 25) {
    const mau = can.slice(i, i + 25);
    const kq = await q(sqlNapTin(mau));
    if (kq.length !== mau.length) throw new Error(`mẻ ${i / 25 + 1}: nạp ${kq.length}/${mau.length} tin`);
    console.log(`   mẻ ${i / 25 + 1}: ${kq.length} tin`);
  }
  const tk = (await q(`select count(*)::int tong, count(*) filter (where status = 'dang_ban')::int dang_ban, count(*) filter (where price_vnd is null)::int thieu_gia,
      count(*) filter (where area_m2 is null)::int thieu_dt, count(*) filter (where ward is null)::int thieu_phuong, count(*) filter (where property_type::text = 'chua_ro')::int loai_chua_ro,
      count(*) filter (where nhung is not null)::int co_vector,
      (select count(*)::int from listing_noi_bo n join listings l2 on l2.id = n.listing_id where l2.source = 'seed_thu' and n.du_lieu ? 'tin_goc') co_tin_goc
      from listings where source = 'seed_thu'`))[0];
  console.log("== rổ mẫu sau khi nạp:", JSON.stringify(tk));
  const loai = await q("select deal, property_type, count(*)::int n from listings where source = 'seed_thu' group by 1,2 order by 1,3 desc");
  console.log("== theo loại:", loai.map((r) => `${r.deal}/${r.property_type}=${r.n}`).join(", "));
  const hong = tk.thieu_gia + tk.thieu_dt + tk.thieu_phuong + tk.loai_chua_ro + (tk.dang_ban === tk.tong ? 0 : 1) + (tk.co_tin_goc === tk.tong ? 0 : 1);
  if (hong) { console.error("::error::Có tin thiếu giá / diện tích / phường / loại, hoặc không lên dang_ban, hoặc thiếu tin gốc — xem số trên"); process.exit(1); }
  console.log("OK: mọi tin mẫu đủ giá, diện tích, phường, loại, đang bán, có tin gốc. Vector sẽ có dần khi cron nhúng chạy.");
} catch (e) {
  console.error(`::error::${e.message}`);
  process.exit(2);
}
