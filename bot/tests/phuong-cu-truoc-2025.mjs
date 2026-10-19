#!/usr/bin/env bun
// phuong-cu-truoc-2025.mjs — OPEN-60 / SRS-5.1zzzzl (09/10/2026): phường SỐ cũ gộp TRƯỚC 07/2025 (NQ 1111/NQ-UBTVQH14 năm 2020,
// NQ 1278/NQ-UBTVQH15 năm 2024) → phường mới, qua bảng `phuong_cu` (migration 20261009d) và bản code ds-phuong.ts.
// Không mạng, không DB. Đỏ khi:
//   (1) ds-phuong.ts lệch migration dữ liệu (sửa tay, hoặc thêm dòng migration mà quên `bun scripts/sinh-ds-phuong.mjs`);
//   (2) dòng mới thiếu nguồn (số NQ + Điều / khoản / điểm), trùng dòng có sẵn, hoặc `toan_bo` trái luật dẫn xuất;
//   (phần (3) kiểm `tenPhuongCot` / `kiemDeXuat` của bot TypeScript đã gỡ 18/10/2026 cùng code đó — SRS-5.1zzzzzzz46; phía Python
//   đổi phường cũ qua `rpc/chuan_dia_ban`, kiểm ở bot/tests/sql/chuan-dia-ban.sql.)
// Ca gốc bắn production 09/10: "MTKD đường Võ Văn Tần phường 6 quận 3 cũ" → cột phường trống, bot hỏi lại.
import { readFileSync } from "node:fs";
import { napPhuongCuThat, napPhuongThat } from "./lib/phuong-that.mjs";
import { tachDonViCu, tachPhuongCuTruoc2025 } from "../../scripts/lib/don-vi-cu.mjs";
import { noiDungDsPhuong } from "../../scripts/sinh-ds-phuong.mjs";

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

console.log(`\nPHƯỜNG CŨ TRƯỚC 2025: ${dat} đạt · ${hong} hỏng`);
process.exit(hong ? 1 : 0);
