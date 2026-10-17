#!/usr/bin/env bun
// phuong-cu-truoc-2025.mjs — OPEN-60 / SRS-5.1zzzzl (09/10/2026): phường SỐ cũ gộp TRƯỚC 07/2025 (NQ 1111/NQ-UBTVQH14 năm 2020,
// NQ 1278/NQ-UBTVQH15 năm 2024) → phường mới, qua bảng `phuong_cu` (migration 20261009d) và bản code ds-phuong.ts.
// Không mạng, không DB. Đỏ khi:
//   (1) ds-phuong.ts lệch migration dữ liệu (sửa tay, hoặc thêm dòng migration mà quên `bun scripts/sinh-ds-phuong.mjs`);
//   (2) dòng mới thiếu nguồn (số NQ + Điều / khoản / điểm), trùng dòng có sẵn, hoặc `toan_bo` trái luật dẫn xuất;
//   (3) cửa `tenPhuongCot` / lưới đỡ / kiểm bằng chứng không đổi được phường số cũ có văn bản → phường mới, hoặc ĐOÁN một phường
//       khi phường cũ (hay phường trung gian) bị chia — lúc đó phải null để bot hỏi.
// Ca gốc bắn production 09/10: "MTKD đường Võ Văn Tần phường 6 quận 3 cũ" → cột phường trống, bot hỏi lại.
import { readFileSync } from "node:fs";
import { napPhuongCuThat, napPhuongThat } from "./e2e/mock-supabase.mjs";
import { tachDonViCu, tachPhuongCuTruoc2025 } from "../../scripts/lib/don-vi-cu.mjs";
import { noiDungDsPhuong } from "../../scripts/sinh-ds-phuong.mjs";
import { danhSachPhuongChoAi, phuongNhacTrongCau, tenPhuongCot } from "../supabase/functions/_shared/extraction/khop-phuong.ts";
import { kiemDeXuat } from "../supabase/functions/_shared/extraction/kiem-bang-chung.ts";

let dat = 0, hong = 0;
const ok = (ten, dk, chi = "") => { if (dk) dat++; else { hong++; console.log(`✗ ${ten}${chi ? `\n    → ${chi}` : ""}`); } };

// ── (1) bản code = migration ────────────────────────────────────────────────────────────────────────────────────────────────
const tsThat = readFileSync(new URL("../supabase/functions/_shared/extraction/ds-phuong.ts", import.meta.url), "utf8");
ok("ds-phuong.ts khớp migration dữ liệu (20260915a + 20260930a + 20261009d) — lệch thì chạy `bun scripts/sinh-ds-phuong.mjs`",
  tsThat === await noiDungDsPhuong());

// ── (2) dữ liệu migration ───────────────────────────────────────────────────────────────────────────────────────────────────
const goc = napPhuongThat().flatMap((w) => tachDonViCu(w.don_vi_cu).map((c) => ({ ten: c.ten, quan_cu: c.quan_cu, phuong_moi: w.ten, toan_bo: c.toan_bo })));
const sql = readFileSync(new URL("../supabase/migrations/20261009d_phuong_cu_truoc_2025.sql", import.meta.url), "utf8");
const moi = tachPhuongCuTruoc2025(sql, goc);
const tho = [...sql.matchAll(/^\s*\('Phường \d+',/gm)].length;
ok("migration: 57 dòng, dòng nào cũng khớp dòng trung gian có thật (không dòng nào bị câu insert bỏ)", moi.length === 57 && tho === 57, `${moi.length}/${tho}`);
ok("mọi dòng mới có nguồn 'NQ 1111/NQ-UBTVQH14 Điều 2 …' hoặc 'NQ 1278/NQ-UBTVQH15 Điều 1 …' kèm khoản + điểm",
  moi.every((r) => /^NQ (?:1111\/NQ-UBTVQH14 Điều 2|1278\/NQ-UBTVQH15 Điều 1) khoản \d+ điểm [a-iđ](?:, [a-iđ])?$/u.test(r.nguon)),
  JSON.stringify(moi.filter((r) => !/^NQ (?:1111|1278)\//.test(r.nguon))));
ok("không dòng mới nào trùng (tên, quận cũ) đã có trong bảng NQ 1685 — số đã tồn tại năm 2025 thì không phải phường gộp trước",
  !moi.some((r) => goc.some((g) => g.ten === r.ten && g.quan_cu === r.quan_cu)));
// Luật dẫn xuất toan_bo: trọn MỘT phường mới VÀ mọi dòng trung gian đều trọn → true; còn lại false.
const nhom = new Map();
for (const r of moi) nhom.set(`${r.ten}|${r.quan_cu}`, [...(nhom.get(`${r.ten}|${r.quan_cu}`) ?? []), r]);
const saiTb = [];
for (const ds of nhom.values()) {
  const tg = ds.flatMap((r) => r.trung_gian.split(" + ").flatMap((t) => goc.filter((g) => g.ten === t && g.quan_cu === r.quan_cu)));
  const mong = new Set(tg.map((g) => g.phuong_moi)).size === 1 && tg.every((g) => g.toan_bo);
  const moiDs = new Set(tg.map((g) => g.phuong_moi));
  if (ds.some((r) => r.toan_bo !== mong) || ds.length !== moiDs.size) saiTb.push(`${ds[0].ten} ${ds[0].quan_cu}`);
}
ok("toan_bo đúng luật dẫn xuất, và phường cũ mang ĐỦ mọi phường mới của các phường trung gian", saiTb.length === 0, saiTb.join(", "));
ok("DB giả e2e có đủ 487 + 57 dòng", (await napPhuongCuThat()).length === 544, String((await napPhuongCuThat()).length));

// ── (3) cửa chuẩn hoá, lưới đỡ, kiểm bằng chứng ────────────────────────────────────────────────────────────────────────────
for (const [t, q, mong] of [
  // ca gốc + cách nói khác
  ["phường 6 quận 3 cũ", null, "Phường Xuân Hòa"], ["Phường 6", "Quận 3", "Phường Xuân Hòa"], ["p.7 q3", null, "Phường Xuân Hòa"],
  ["P8", "Quận 3", "Phường Xuân Hòa"], ["phường 13 quận 3", null, "Phường Nhiêu Lộc"], ["phuong 10 quan 3", null, "Phường Nhiêu Lộc"],
  // Quận 4
  ["phường 6 quận 4", null, "Phường Khánh Hội"], ["p10 q4", null, "Phường Khánh Hội"], ["Phường 12", "Quận 4", "Phường Xóm Chiếu"],
  // Quận 5
  ["phường 8 quận 5", null, "Phường An Đông"], ["p3 q5", null, "Phường Chợ Quán"], ["phường 15 quận 5", null, "Phường Chợ Lớn"], ["Phường 10", "Quận 5", "Phường Chợ Lớn"],
  // Quận 10, Phú Nhuận
  ["phường 3 quận 10", null, "Phường Vườn Lài"], ["p11 q10", null, "Phường Vườn Lài"], ["Phường 7", "Quận 10", "Phường Diên Hồng"],
  ["phường 3 phú nhuận", null, "Phường Đức Nhuận"], ["phuong 12 phu nhuan", null, "Phường Phú Nhuận"],
  // Bình Thạnh
  ["phường 24 bình thạnh", null, "Phường Bình Thạnh"], ["p21 binh thanh", null, "Phường Thạnh Mỹ Tây"], ["Phường 15", "Quận Bình Thạnh", "Phường Gia Định"],
  // cùng văn bản: Quận 6 (P5 bị chia nhưng cả hai phần trọn vào Bình Tây), Quận 8, Quận 11, Gò Vấp
  ["phường 5 quận 6", null, "Phường Bình Tây"], ["phường 2 quận 8", null, "Phường Chánh Hưng"], ["p12 q8", null, "Phường Phú Định"],
  ["phường 6 quận 11", null, "Phường Minh Phụng"], ["phường 9 gò vấp", null, "Phường Thông Tây Hội"],
  // CHIA → null, bot hỏi (phường cũ bị chia, hoặc phường trung gian bị chia năm 2025)
  ["phường 6 bình thạnh", null, null], ["phường 13 gò vấp", null, null], ["phường 5 quận 4", null, null], ["Phường 14", "Quận 4", null],
  ["phường 17 phú nhuận", null, null], ["phường 12 quận 11", null, null],
  // chưa có văn bản → vẫn null; không quận → null; số còn tồn tại 2025 → giữ đúng dòng NQ 1685
  ["phường 7 quận 4", null, null], ["phường 6 phú nhuận", null, null], ["phường 4 bình thạnh", null, null], ["Phường 6", null, null],
  ["phường 5 quận 3", null, "Phường Bàn Cờ"], ["phường 9 quận 5", null, "Phường An Đông"],
]) ok(`tenPhuongCot(${JSON.stringify(t)}, ${JSON.stringify(q)}) = ${mong}`, tenPhuongCot(t, q) === mong, String(tenPhuongCot(t, q)));

// Lưới đỡ khi AI im (cả câu rao) — cách nói MỚI chưa từng bắn.
const pn = (c, q) => phuongNhacTrongCau(c, q)?.ten_day_du ?? null;
for (const [c, q, mong] of [
  ["Cần bán nhà MTKD đường Võ Văn Tần phường 6 quận 3 cũ, 4x20, giá 25 tỷ", null, "Phường Xuân Hòa"],
  ["nhà hẻm xe hơi Trần Quốc Thảo p13 q3 cũ 60m2", null, "Phường Nhiêu Lộc"],
  ["bán nhà Bùi Viện... à nhầm, nhà Đoàn Văn Bơ phường 10 quận 4", null, "Phường Khánh Hội"],
  ["nhà phường 24 cũ", "Quận Bình Thạnh", "Phường Bình Thạnh"],
  ["nha hem 4m phuong 6 binh thanh 5 ty", null, null],
]) ok(`phuongNhacTrongCau(${JSON.stringify(c)}, ${q}) = ${mong}`, pn(c, q) === mong, String(pn(c, q)));

// Kiểm bằng chứng: AI đổi đúng sang tên mới, trích số cũ → ĐẠT; AI chọn một nửa của phường bị chia → BỎ.
const k1 = kiemDeXuat([{ khoa: "phuong", gia_tri: "Phường Xuân Hòa", trich_dan: "phường 6 quận 3" }], "Cần bán nhà MTKD đường Võ Văn Tần phường 6 quận 3 cũ, 4x20, giá 25 tỷ");
ok("kiemDeXuat: AI 'Phường Xuân Hòa' trích «phường 6 quận 3» → ĐẠT", k1.dat.length === 1, JSON.stringify(k1));
const k2 = kiemDeXuat([{ khoa: "phuong", gia_tri: "Phường Gia Định", trich_dan: "phường 6 bình thạnh" }], "nhà hẻm 4m phường 6 bình thạnh 5 tỷ");
ok("kiemDeXuat: «phường 6 bình thạnh» (bị chia Bình Lợi Trung / Gia Định) mà AI chọn Gia Định → BỎ", k2.dat.length === 0, JSON.stringify(k2));
const k3 = kiemDeXuat([{ khoa: "phuong", gia_tri: "Phường Bình Thạnh", trich_dan: "p24" }], "p24 nha em", { quan: "Quận Bình Thạnh" });
ok("kiemDeXuat: «p24», quận tin đã biết Bình Thạnh → Phường Bình Thạnh ĐẠT", k3.dat.length === 1, JSON.stringify(k3));

// Danh sách phường gửi AI: câu nhắc phường số cũ → có phường mới tương ứng + dòng tên cũ.
const ds = danhSachPhuongChoAi("bán nhà phường 6 quận 3 cũ");
ok("danhSachPhuongChoAi('… phường 6 quận 3 cũ') có Phường Xuân Hòa ← Phường 6 3", /Phường Xuân Hòa/.test(ds) && /Phường 6 3(?!\d)/.test(ds), ds.slice(0, 300));

console.log(`\nPHƯỜNG CŨ TRƯỚC 2025: ${dat} đạt · ${hong} hỏng`);
process.exit(hong ? 1 : 0);
