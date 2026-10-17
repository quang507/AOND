#!/usr/bin/env bun
// sinh-ds-phuong.mjs — sinh lại bot/supabase/functions/_shared/extraction/ds-phuong.ts (bản CODE của bảng `wards` + `phuong_cu`)
// từ chính các migration dữ liệu: 20260915a (wards), 20260930a (phuong_cu tách từ wards.don_vi_cu), 20261009d (phường số cũ gộp
// trước 07/2025, OPEN-60). Đọc qua bộ nạp của DB giả e2e (`napPhuongThat` / `napPhuongCuThat`) — một chỗ đọc migration, nên DB giả,
// bot và bảng thật không lệch nhau.
//
//   bun scripts/sinh-ds-phuong.mjs          ghi lại file
//   bun scripts/sinh-ds-phuong.mjs --kiem   chỉ so: lệch → thoát 1 (bot/tests/phuong-cu-truoc-2025.mjs gọi)
//
// Thêm dòng phường cũ = sửa migration dữ liệu (file mới), rồi chạy lệnh này. KHÔNG sửa tay ds-phuong.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { napPhuongCuThat, napPhuongThat } from "../bot/tests/e2e/mock-supabase.mjs";

const DICH = new URL("../bot/supabase/functions/_shared/extraction/ds-phuong.ts", import.meta.url);

export async function noiDungDsPhuong() {
  const moi = napPhuongThat().map((w) => [w.ten, w.ten_day_du, w.quan_cu]);
  const cu = (await napPhuongCuThat()).map((c) => [c.ten, c.quan_cu, c.phuong_moi, c.toan_bo ? 1 : 0]);
  const goc = cu.length - (await napPhuongCuThat()).filter((c) => c.nguon).length;
  return [
    `// ds-phuong.ts — DỮ LIỆU (không phải luật): ${moi.length} phường / xã mới TP.HCM (NQ 1685, bảng \`wards\`, migration 20260915a) và`,
    `// ${cu.length} dòng phường / xã cũ trước 07/2025 → phường mới (bảng \`phuong_cu\`: ${goc} dòng 20260930a theo NQ 1685 + ${cu.length - goc} dòng`,
    "// 20261009d — phường SỐ cũ gộp năm 2020 / 2024 theo NQ 1111/NQ-UBTVQH14 và NQ 1278/NQ-UBTVQH15, OPEN-60). SINH TỰ ĐỘNG — đừng",
    "// sửa tay; sinh lại bằng `bun scripts/sinh-ds-phuong.mjs` khi migration dữ liệu wards / phuong_cu đổi.",
    "//",
    "// Chủ dự án 30/09/2026: \"sao lại nhận tên đúng chữ mới nhận, phải dùng AI để xem chứ … để AI nhận mới thông minh\". Danh",
    "// sách này đi vào câu lệnh AI bóc tách (AI tự hiểu \"Vĩnh Lộc B\", \"thảo điền\", gõ sai, thiếu chữ \"xã\") và vào bước KIỂM",
    "// bằng chứng (tên AI trả phải là phường có thật, và câu khách phải nhắc tên đó — mới hoặc cũ).",
    "",
    "/** [tên ngắn, tên đầy đủ, quận cũ] */",
    `export const PHUONG_MOI: ReadonlyArray<readonly [string, string, string]> = ${JSON.stringify(moi)};`,
    "",
    "/** [tên cũ có tiền tố, quận cũ, tên ngắn phường mới, 1 = toàn bộ / 0 = một phần] */",
    `export const PHUONG_CU: ReadonlyArray<readonly [string, string, string, number]> = ${JSON.stringify(cu)};`,
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
