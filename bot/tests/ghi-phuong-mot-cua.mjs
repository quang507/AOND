#!/usr/bin/env bun
// ghi-phuong-mot-cua.mjs — SRS-5.1zzzzj (09/10/2026): cột `listings.ward` chỉ mang tên phường MỚI có thật, và MỌI đường ghi đi qua
// MỘT cửa. Bài tĩnh (không mạng, không DB) — đỏ khi:
//   (1) có chỗ gọi `rpc("ghi_fact_listing"` ngoài `_shared/ghi-fact.ts` (fact `phuong` không qua `tenPhuongCot` là lọt chữ lạ);
//   (2) có chỗ gán `ward:` (hoặc `{ ward }`) trong edge function mà giá trị không đi qua `tenPhuongCot(` (hay là `null`);
//   (3) cửa chuẩn hoá trả một chuỗi KHÔNG có trong bảng `wards` (dữ liệu ds-phuong.ts lệch migration 20260915a).
// Kèm ca ÂM tự kiểm: bộ dò phải bắt được mẫu vi phạm dựng sẵn, không thì "0 vi phạm" chỉ có nghĩa là regex sai.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { phuongCot, tenPhuongCot, TEN_PHUONG_HOP_LE } from "../supabase/functions/_shared/extraction/khop-phuong.ts";
import { PHUONG_CU, PHUONG_MOI } from "../supabase/functions/_shared/extraction/ds-phuong.ts";
import { napPhuongThat } from "./e2e/mock-supabase.mjs";

const HAM = new URL("../supabase/functions/", import.meta.url).pathname;
const cacFile = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? cacFile(p) : /\.ts$/.test(n) ? [p] : [];
});

/** Vi phạm trong một nguồn TS. `ten` = đường dẫn tương đối (để miễn đúng file cửa). */
export function soat(ten, nguon) {
  const ra = [];
  nguon.split("\n").forEach((dong, i) => {
    const code = dong.replace(/\/\/.*$/, "");
    if (/\.rpc\(\s*["']ghi_fact_listing["']/.test(code) && ten !== "_shared/ghi-fact.ts") ra.push(`${ten}:${i + 1} gọi thẳng ghi_fact_listing`);
    for (const m of code.matchAll(/(?<![\w.?])ward\s*:\s*([^,}\n]+)/g)) {
      const v = m[1].trim();
      // Khai báo kiểu ("ward: string | null;", "ward?: …") — không phải giá trị.
      if (/^(?:string|number|unknown|boolean)\b/.test(v) || /^null\s*(?:[;|]|$)/.test(v) && /[;|]/.test(v)) continue;
      if (v === "null" || /\btenPhuongCot\(/.test(v)) continue;
      // Dòng nhập thô của rổ hàng: chưa ghi DB, chat-reply chuẩn hoá khi ghi (có chú thích đánh dấu trên dòng).
      if (/chuẩn hoá qua tenPhuongCot khi ghi/.test(dong)) continue;
      // Đối số của bộ IN địa chỉ (đọc cột, không ghi).
      if (/\bdiaChiHienThi\(/.test(code)) continue;
      ra.push(`${ten}:${i + 1} ward: ${v.slice(0, 60)}`);
    }
    if (/\.(?:update|insert|upsert)\(\s*\{[^}]*(?<![\w.?])ward\s*[,}]/.test(code)) ra.push(`${ten}:${i + 1} { ward } viết tắt`);
  });
  return ra;
}

let hong = 0;
const ok = (n, dk, ct = "") => { console.log(`${dk ? "✓" : "✗"} ${n}${dk ? "" : `\n    → ${ct}`}`); if (!dk) hong++; };

// Ca ÂM: bộ dò phải bắt.
ok("ÂM: gọi thẳng rpc ghi_fact_listing bị bắt", soat("chat-reply/index.ts", `await client.rpc("ghi_fact_listing", { p_question: "phuong" })`).length === 1);
ok("ÂM: ward: phuongRao (chưa qua cửa) bị bắt", soat("x.ts", `  ward: phuongRao ?? duAn?.ward,`).length === 1);
ok("ÂM: `Phường ${so}` bị bắt", soat("x.ts", "  ward: `Phường ${wardNo}`,").length === 1);
ok("ÂM: { ward } viết tắt bị bắt", soat("x.ts", `client.from("listings").update({ ward }).eq("id", id)`).length === 1);
// Ca DƯƠNG: không bắt nhầm.
ok("DƯƠNG: kiểu dữ liệu / null / qua cửa không bị bắt", soat("x.ts", [
  "type A = { ward: string | null; ward?: string | null };", "  ward: null,", "  ward: tenPhuongCot(d.ward, d.district),",
  `  const { error } = await ghiFact(client, { p_question: "phuong" });`,
].join("\n")).length === 0);

// Soát mã thật.
const viPham = cacFile(HAM).filter((p) => !/\.bundle\./.test(p)).flatMap((p) => soat(relative(HAM, p), readFileSync(p, "utf8")));
ok("mọi lượt ghi fact đi qua ghiFact, mọi `ward:` đi qua tenPhuongCot", viPham.length === 0, viPham.join("\n      "));

// Dữ liệu cửa = dữ liệu bảng wards.
const that = new Set(napPhuongThat().map((w) => w.ten_day_du));
ok("ds-phuong.ts: 168 tên đủ trùng khít bảng wards (migration 20260915a)", that.size === 168 && [...TEN_PHUONG_HOP_LE].every((t) => that.has(t)) && TEN_PHUONG_HOP_LE.size === that.size);
// Cửa chỉ ra tên có thật, với mọi tên mới / cũ / số cũ + quận cũ trong bảng.
const dauVao = [
  ...PHUONG_MOI.flatMap(([ten, du, q]) => [[ten, null], [du, null], [ten.toLowerCase(), q]]),
  ...PHUONG_CU.map(([cu, q]) => [cu, q]),
  ["phường 6", "Quận 3"], ["p.7 q3", null], ["phuong 15 tan binh", null], ["Xã Tân Kiên", null], ["Phường 4", null], ["linh tinh gì đó", null],
];
const ngoai = dauVao.map(([t, q]) => [t, q, tenPhuongCot(t, q)]).filter(([, , r]) => r !== null && !TEN_PHUONG_HOP_LE.has(r));
ok(`cửa chuẩn hoá chỉ trả tên có trong bảng wards (${dauVao.length} đầu vào)`, ngoai.length === 0, JSON.stringify(ngoai.slice(0, 5)));
// Tên cũ "toàn bộ" về đúng một phường mới thì cửa ra đúng phường đó (không mất dữ liệu bảng có).
const mat = PHUONG_CU.filter(([cu, q, moi, tb]) => tb === 1 && PHUONG_CU.filter((r) => r[0] === cu && r[1] === q).length === 1)
  .filter(([cu, q, moi]) => phuongCot(cu, q)?.ten !== moi);
ok("tên cũ thuộc trọn một phường mới → cửa ra đúng phường đó", mat.length === 0, JSON.stringify(mat.slice(0, 5)));

// Cách nói MỚI chưa từng bắn (SRS-5.1zzzzj): phường số cũ không có trong bảng phường cũ → null (bot hỏi), không bao giờ "Phường N".
// SRS-5.1zzzzl (OPEN-60): Phường 6 / 7 Quận 3 có văn bản (NQ 1111/NQ-UBTVQH14 Điều 2 khoản 1 điểm a, 20261009d) → Xuân Hòa; số chưa có
// văn bản (Phường 7 Quận 4) vẫn null.
for (const [t, q, mong] of [
  ["phường 6 quận 3 cũ", null, "Phường Xuân Hòa"], ["Phường 6", "Quận 3", "Phường Xuân Hòa"], ["p.7 q3", null, "Phường Xuân Hòa"], ["phường 7 quận 4", null, null], ["phuong 15 tan binh", null, null],
  ["P.14 Gò Vấp", null, "Phường An Hội Tây"], ["p14", "Quận Gò Vấp", "Phường An Hội Tây"], ["phường 13", "Quận Phú Nhuận", "Phường Phú Nhuận"],
  ["phường 12 quận 3", null, "Phường Nhiêu Lộc"], ["xã Tân Thạnh Đông huyện Củ Chi", null, "Xã Phú Hòa Đông"], ["Phường 4", null, null],
  ["an hoi tay", null, "Phường An Hội Tây"], ["thảo điền", null, "Phường An Khánh"], ["Phường Tân Phú", "Quận 7", "Phường Tân Mỹ"],
  ["Thị trấn Tân Bình", "Huyện Bắc Tân Uyên", "Phường Vĩnh Tân"],
]) ok(`tenPhuongCot(${JSON.stringify(t)}, ${JSON.stringify(q)}) = ${mong}`, tenPhuongCot(t, q) === mong, String(tenPhuongCot(t, q)));

// SRS-5.1zzzzq (bắn production 09/10, thu-thuong2/6): "ở củ chi, xã tân thạnh đông" → bảng phường MỚI khớp phần đầu "tân thạnh" với
// Phường Tân Thành (Phú Mỹ). Bộ dò chung (tên mới + cũ, tên dài trùm tên ngắn) phải đi TRƯỚC bảng `wards` trong `ghiPhuongTrongCau`.
{
  const { phuongNhacTrongCau } = await import("../supabase/functions/_shared/extraction/khop-phuong.ts");
  const { timPhuongTrongCau } = await import("../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts");
  for (const [cau, mong] of [["ở củ chi, xã tân thạnh đông", "Xã Phú Hòa Đông"], ["đất chị ở xã tân thạnh tây bên củ chi", "Xã Phú Hòa Đông"]]) {
    ok(`bộ dò chung "${cau}" → ${mong}`, phuongNhacTrongCau(cau)?.ten_day_du === mong, String(phuongNhacTrongCau(cau)?.ten_day_du));
  }
  ok("bẫy còn đó: riêng bảng phường mới khớp 'tân thạnh' với Phường Tân Thành (lý do phải hỏi bộ chung trước)",
    timPhuongTrongCau("ở củ chi, xã tân thạnh đông", napPhuongThat())?.phuong.ten_day_du === "Phường Tân Thành");
  const nguon = readFileSync(join(HAM, "chat-reply/index.ts"), "utf8");
  const than = nguon.slice(nguon.indexOf("const ghiPhuongTrongCau"), nguon.indexOf("const ghiPhuongTrongCau") + 4000);
  ok("ghiPhuongTrongCau: bộ dò chung đọc ra phường KHÁC bảng phường mới → theo bộ chung",
    /const pn = pnChung && pnChung\.ten_day_du !== tpBang\?\.phuong\.ten_day_du \? pnChung : null;/.test(than) && /const tp = pn \? null : tpBang;/.test(than),
    than.slice(0, 200));
}

console.log(hong ? `\nMỘT CỬA PHƯỜNG: ${hong} CA HỎNG` : "\nMỘT CỬA PHƯỜNG: ĐẠT");
process.exit(hong ? 1 : 0);
