#!/usr/bin/env bun
// sinh-ds-phuong.mjs — sinh lại bot/supabase/functions/_shared/extraction/ds-phuong.ts (bản CODE của bảng `wards`, cho form
// /admin/dang-tin) từ migration dữ liệu 20260915a qua bộ nạp của DB giả e2e (`napPhuongThat`) — một chỗ đọc migration, nên DB giả và
// bảng thật không lệch nhau. Bảng phường CŨ (`phuong_cu`) chỉ ở DB, lõi Python tra qua REST; bản code `PHUONG_CU` gỡ 02/11/2026 (không
// ai đọc từ khi bot TypeScript gỡ).
//
//   bun scripts/sinh-ds-phuong.mjs          ghi lại file
//   bun scripts/sinh-ds-phuong.mjs --kiem   chỉ so: lệch → thoát 1 (bot/tests/phuong-cu-truoc-2025.mjs gọi)
//
// Thêm dòng phường cũ = sửa migration dữ liệu (file mới), rồi chạy lệnh này. KHÔNG sửa tay ds-phuong.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { napPhuongThat } from "../bot/tests/lib/phuong-that.mjs";

const DICH = new URL("../bot/supabase/functions/_shared/extraction/ds-phuong.ts", import.meta.url);

export async function noiDungDsPhuong() {
  const moi = napPhuongThat().map((w) => [w.ten, w.ten_day_du, w.quan_cu]);
  return [
    `// ds-phuong.ts — DỮ LIỆU (không phải luật): ${moi.length} phường / xã mới TP.HCM (NQ 1685, bảng \`wards\`, migration 20260915a) — danh sách`,
    "// chọn phường của form /admin/dang-tin. SINH TỰ ĐỘNG — đừng sửa tay; sinh lại bằng `bun scripts/sinh-ds-phuong.mjs` khi migration dữ",
    "// liệu wards đổi. Phường cũ trước 07/2025 → phường mới: bảng `phuong_cu` (DB), lõi Python tra.",
    "",
    "/** [tên ngắn, tên đầy đủ, quận cũ] */",
    `export const PHUONG_MOI: ReadonlyArray<readonly [string, string, string]> = ${JSON.stringify(moi)};`,
    "",
  ].join("\n");
}

if (import.meta.main) {
  const moi = await noiDungDsPhuong();
  const cu = readFileSync(DICH, "utf8");
  if (process.argv.includes("--kiem")) {
    if (cu === moi) { console.log("ds-phuong.ts khớp migration dữ liệu"); process.exit(0); }
    console.log("ds-phuong.ts LỆCH migration dữ liệu — chạy: bun scripts/sinh-ds-phuong.mjs");
    process.exit(1);
  }
  if (cu === moi) console.log("ds-phuong.ts đã khớp, không đổi");
  else { writeFileSync(DICH, moi); console.log("đã ghi lại ds-phuong.ts"); }
}
