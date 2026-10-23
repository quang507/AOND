#!/usr/bin/env node
// do-tim-nha.mjs — ĐO chất lượng tìm nhà trên rổ hàng mẫu `seed_thu` (SRS-5.1zzzzzzz144). Chạy trong apply-migration.yml ô `dung_lai` = do-tim-nha.
// Chỉ ĐỌC DB (Management API); gọi Gemini bằng khoá chính GEMINI_API_KEY trong Vault (~60 lượt nhúng: 30 câu hỏi + 30 mô tả AI).
// Bốn chế độ, cùng bộ câu hỏi `cau-hoi.json` (đáp án viết trước):
//   loc_cung    tim_nha KHÔNG vector — chỉ lọc cứng (bán/thuê, loại, giá) + điểm khu vực / diện tích / phòng ngủ / xe hơi
//   tim_nha     tim_nha production: như trên + điểm vector (tin gốc của người bán)
//   nghia_goc   chỉ cosine, văn bản nhúng = TIN GỐC (vector đang lưu) — cùng lọc cứng với tim_nha
//   nghia_mota  chỉ cosine, văn bản nhúng = BẢN MÔ TẢ AI viết lại thay cho tin gốc — để so "tin gốc có dễ tìm hơn không"
// Thoát 0 = đã đo xong (đây là phép ĐO, không phải cổng đạt/trượt); thoát 2 = chưa đo được (hết hạn mức Gemini, lỗi SQL…).
import { readFileSync } from "node:fs";
import { chiSo, cosine, hang, hopLocCung, phanTram, sqlTimNha } from "./do-tim-nha-lib.mjs";

const TOKEN = process.env.TOKEN, REF = process.env.PROJECT_REF;
if (!TOKEN || !REF) { console.error("::error::Thiếu TOKEN / PROJECT_REF"); process.exit(2); }
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`SQL ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function nhung(khoa, text, taskType) {
  for (let lan = 1; lan <= 3; lan++) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": khoa },
      body: JSON.stringify({ content: { parts: [{ text }] }, taskType, outputDimensionality: 768 }),
    });
    if (r.status === 200) {
      const v = (await r.json()).embedding?.values;
      if (Array.isArray(v) && v.length === 768) return v;
      throw new Error("Gemini trả khuôn vector lạ");
    }
    if (r.status === 429) throw new Error("Gemini 429 — hết hạn mức nhúng, chưa đo được");
    await nghi(800 * lan);
  }
  throw new Error("Gemini lỗi sau 3 lần thử");
}

try {
  const bo = JSON.parse(readFileSync(new URL("./cau-hoi.json", import.meta.url), "utf8")).cau_hoi;
  const khoa = (await q("select decrypted_secret as k from vault.decrypted_secrets where name = 'GEMINI_API_KEY'"))[0]?.k;
  if (!khoa) throw new Error("Thiếu GEMINI_API_KEY trong Vault");
  console.log(`::add-mask::${khoa}`);

  const tin = await q(`select l.code, l.deal, l.property_type, l.price_vnd, l.nhung::text as nhung, public.van_ban_nhung(l.id) as vb,
      n.du_lieu->>'tin_goc' as tin_goc, l.description from public.listings l
      left join public.listing_noi_bo n on n.listing_id = l.id where l.source = 'seed_thu' order by l.code`);
  if (tin.length < 10) throw new Error(`Rổ mẫu chỉ có ${tin.length} tin (seed_thu) — chưa đủ để đo`);
  const chuaVec = tin.filter((t) => !t.nhung).map((t) => t.code);
  if (chuaVec.length) throw new Error(`${chuaVec.length} tin mẫu chưa có vector (${chuaVec.slice(0, 5).join(", ")}…) — chưa đo được`);
  const maMau = new Set(tin.map((t) => t.code));
  console.log(`== rổ mẫu: ${tin.length} tin có vector; bộ câu hỏi: ${bo.length} câu`);

  for (const t of tin) {
    t.vec = JSON.parse(t.nhung);
    const sau = t.tin_goc && t.description ? t.vb.replace(`Người bán nhắn: ${t.tin_goc}`, `Người bán tả: ${t.description}`) : null;
    if (!sau || sau === t.vb) throw new Error(`${t.code}: không dựng được văn bản "bản mô tả" để so sánh`);
    t.vbMota = sau;
  }
  console.log("== nhúng 30 bản mô tả AI (để so với tin gốc)…");
  for (const t of tin) { t.vecMota = await nhung(khoa, t.vbMota, "RETRIEVAL_DOCUMENT"); await nghi(120); }

  const CHE_DO = ["loc_cung", "tim_nha", "nghia_goc", "nghia_mota"];
  const kq = Object.fromEntries(CHE_DO.map((c) => [c, []]));   // [{id, nhom, hang, top}]
  let laNgoaiMau = 0;
  for (const c of bo) {
    const qv = await nhung(khoa, c.cau, "RETRIEVAL_QUERY"); await nghi(120);
    const top = {
      loc_cung: (await q(sqlTimNha(c.loc, null, 5))).map((r) => r.code),
      tim_nha: (await q(sqlTimNha(c.loc, qv, 5))).map((r) => r.code),
    };
    const hop = tin.filter((t) => hopLocCung(t, c.loc));
    const xep = (truong) => hop.map((t) => [t.code, cosine(qv, t[truong])]).sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0]);
    top.nghia_goc = xep("vec");
    top.nghia_mota = xep("vecMota");
    laNgoaiMau += top.tim_nha.filter((m) => !maMau.has(m)).length;
    for (const ch of CHE_DO) kq[ch].push({ id: c.id, nhom: c.nhom, hang: hang(top[ch], c.dap_an), top: top[ch].slice(0, 3), dapAn: c.dap_an });
  }

  const dong = (ten, ds) => { const m = chiSo(ds.map((x) => x.hang)); return `${ten.padEnd(12)} n=${String(m.n).padStart(2)}  hit@3=${phanTram(m.hit3).padStart(4)}  hit@5=${phanTram(m.hit5).padStart(4)}  MRR=${m.mrr.toFixed(2)}`; };
  console.log("\n== KẾT QUẢ (đáp án viết trước; hạng 1–5, không có trong top 5 = trượt)");
  for (const ch of CHE_DO) console.log(dong(ch, kq[ch]));
  for (const nhom of ["A", "B", "C"]) {
    console.log(`\n-- nhóm ${nhom}`);
    for (const ch of CHE_DO) console.log(dong(ch, kq[ch].filter((x) => x.nhom === nhom)));
  }
  console.log("\n== câu tim_nha KHÔNG đưa đáp án vào top 3 (id · đáp án · top 3 trả về)");
  for (const x of kq.tim_nha.filter((x) => !x.hang || x.hang > 3)) console.log(`${x.id} · ${x.dapAn.join("/")} · ${x.top.join(", ") || "(rỗng)"} · hạng=${x.hang ?? "ngoài top 5"}`);
  const g = new Map(kq.nghia_goc.map((x) => [x.id, x.hang])), m = new Map(kq.nghia_mota.map((x) => [x.id, x.hang]));
  const tot = (h) => (h === null ? 99 : h);
  const gocTot = [...g.keys()].filter((id) => tot(g.get(id)) < tot(m.get(id))), motaTot = [...g.keys()].filter((id) => tot(m.get(id)) < tot(g.get(id)));
  console.log(`\n== tin gốc tốt hơn mô tả AI ở ${gocTot.length} câu: ${gocTot.join(", ") || "-"}`);
  console.log(`== mô tả AI tốt hơn tin gốc ở ${motaTot.length} câu: ${motaTot.join(", ") || "-"}`);
  console.log(`== tin NGOÀI bộ mẫu lọt vào top 5 của tim_nha: ${laNgoaiMau} lượt (đối thủ thật trong rổ, không tính là đúng)`);
  console.log("\nLƯU Ý: 30 tin / 30 câu là cỡ nhỏ — dùng để SO SÁNH giữa các chế độ, không phải con số tuyệt đối. Điểm vector các tin chênh nhau ít nên xem cột nghia_* trước khi chỉnh trọng số.");
  console.log("KET_QUA_JSON " + JSON.stringify(Object.fromEntries(CHE_DO.map((ch) => [ch, chiSo(kq[ch].map((x) => x.hang))]))));
} catch (e) {
  console.error(`::error::Chưa đo được: ${e.message}`);
  process.exit(2);
}
