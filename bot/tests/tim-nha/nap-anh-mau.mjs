#!/usr/bin/env node
// nap-anh-mau.mjs — gắn 4 ảnh minh hoạ (bot/tests/tim-nha/anh-mau/, vẽ bằng sinh-anh-mau.py, có dải chữ "ẢNH MẪU") cho MỌI tin `seed_thu` chưa có ảnh
// (SRS-5.1zzzzzzz168; chat thử 24/10: 130 căn mẫu không có ảnh nào, bot hứa gửi ảnh mà không ảnh nào tới). Mỗi tin một thư mục `<uuid tin>/` trong bucket
// công khai `listing-public` (ràng buộc listing_media_duong_dan_theo_uuid) + 4 dòng `listing_media`. Chạy trong apply-migration.yml ô `dung_lai` = nap-anh-mau
// (khoá service_role lấy lúc chạy, ghi scripts/.env trên máy runner). Chạy lại được: tin đã có ảnh thì bỏ qua. Cuối cùng đối chiếu số dòng `listing_photos_v`
// (nguồn ảnh bot gửi kèm) và tải thử MỘT URL công khai rồi mới báo xong — Storage trả 200 mà không cất file là hình lỗi đã gặp (NFR-18).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANH_MAU, dongMedia } from "./nap-anh-mau-lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(HERE, "../../../scripts/.env"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const BASE = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) { console.error("::error::Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong scripts/.env"); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const anh = ANH_MAU.map((a) => ({ ...a, byte: readFileSync(join(HERE, "anh-mau", a.tep)) }));

async function rest(path, init = {}) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { ...H, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`REST ${path.slice(0, 60)} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}
const khoi = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function dua(id, dong) {
  for (let i = 0; i < dong.length; i++) {
    const r = await fetch(`${BASE}/storage/v1/object/listing-public/${dong[i].storage_path}`, {
      method: "POST", headers: { ...H, "Content-Type": "image/jpeg", "x-upsert": "true" }, body: anh[i].byte,
    });
    if (!r.ok) throw new Error(`upload ${dong[i].storage_path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

try {
  const tin = await rest("listings?source=eq.seed_thu&select=id,code&order=code&limit=1000");
  const da = new Set();
  for (const c of khoi(tin.map((t) => t.id), 40))
    for (const m of await rest(`listing_media?listing_id=in.(${c.join(",")})&select=listing_id&limit=1000`)) da.add(m.listing_id);
  const can = tin.filter((t) => !da.has(t.id));
  console.log(`== ${tin.length} tin seed_thu, ${da.size} tin đã có ảnh; cần gắn ảnh cho ${can.length} tin`);
  let xong = 0;
  for (const nhom of khoi(can, 6)) {                       // 6 tin song song, mỗi tin 4 ảnh tuần tự
    await Promise.all(nhom.map(async (t) => {
      const dong = dongMedia(t.id);
      await dua(t.id, dong);
      await rest("listing_media", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(dong) });
      xong++;
    }));
    if (xong % 30 === 0 || xong === can.length) console.log(`   ${xong}/${can.length}`);
  }
  // Đối chiếu: ảnh bot đọc (view) phải đủ 4 / tin, và một URL công khai tải được thật.
  let dem = 0, mau = null;
  for (const c of khoi(tin.map((t) => t.code), 40)) {
    const v = await rest(`listing_photos_v?code=in.(${c.join(",")})&select=code,url&limit=1000`);
    dem += v.length; mau ??= v[0]?.url ?? null;
  }
  console.log(`== listing_photos_v: ${dem} ảnh cho ${tin.length} tin (mong ${tin.length * ANH_MAU.length})`);
  if (dem < tin.length * ANH_MAU.length) throw new Error("số ảnh trong view ít hơn mong đợi");
  const g = await fetch(mau);
  const ct = g.headers.get("content-type") ?? "";
  console.log(`== tải thử ${mau} → ${g.status} ${ct}`);
  if (!g.ok || !ct.startsWith("image/")) throw new Error("URL ảnh công khai không tải được");
  console.log("OK: mọi tin mẫu có đủ ảnh minh hoạ, bot gửi kèm được.");
} catch (e) {
  console.error(`::error::${e.message}`);
  process.exit(2);
}
