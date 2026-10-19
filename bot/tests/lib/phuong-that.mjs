// phuong-that.mjs — bảng phường THẬT đọc thẳng từ migration (168 dòng `wards` của 20260915a, phường cũ của 20260930a /
// 20261009d). Tách khỏi mock e2e TypeScript 19/10/2026 (SRS-5.1zzzzzzz67) khi mock gỡ cùng bot đó; `phuong-cu-truoc-2025.mjs`
// và `scripts/sinh-ds-phuong.mjs` dùng.
import { readFileSync } from "node:fs";

// 30/09/2026: bảng `wards` giả = 168 dòng THẬT của migration 20260915a (bảng thật trên DB nạp từ đúng file đó).
let phuongThat = null;
export function napPhuongThat() {
  if (phuongThat) return phuongThat;
  const sql = readFileSync(new URL("../../supabase/migrations/20260915a_wards_phuong_moi.sql", import.meta.url), "utf8");
  phuongThat = [...sql.matchAll(/^\s*\('((?:[^']|'')+)',\s*'(phuong|xa|dac_khu)',\s*'((?:[^']|'')+)',\s*'((?:[^']|'')+)',[^\n]*?'(TP\.HCM|Bình Dương|Bà Rịa – Vũng Tàu)',\s*(?:'((?:[^']|'')*)'|null)/gm)]
    .map((m) => ({
      ten: m[1].replace(/''/g, "'"), loai: m[2], ten_day_du: m[3].replace(/''/g, "'"), quan_cu: m[4].replace(/''/g, "'"),
      tinh_cu: m[5], don_vi_cu: m[6] != null ? m[6].replace(/''/g, "'") : null,
    }));
  return phuongThat;
}
// 20260930a: bảng `phuong_cu` giả = đúng dữ liệu migration sinh ra (tách wards.don_vi_cu bằng scripts/lib/don-vi-cu.mjs).
// 20261009d (OPEN-60): + phường SỐ cũ gộp trước 07/2025 (NQ 1111/2020, NQ 1278/2024), đọc thẳng khối VALUES của migration — cùng
// điều kiện "dòng trung gian có thật" như câu insert. ds-phuong.ts sinh từ hàm này (`bun scripts/sinh-ds-phuong.mjs`).
export async function napPhuongCuThat() {
  const { tachDonViCu, tachPhuongCuTruoc2025 } = await import("../../../scripts/lib/don-vi-cu.mjs");
  const goc = napPhuongThat().flatMap((w) => tachDonViCu(w.don_vi_cu).map((c) => ({ ten: c.ten, quan_cu: c.quan_cu, phuong_moi: w.ten, toan_bo: c.toan_bo })));
  const sql = readFileSync(new URL("../../supabase/migrations/20261009d_phuong_cu_truoc_2025.sql", import.meta.url), "utf8");
  const them = tachPhuongCuTruoc2025(sql, goc).map(({ ten, quan_cu, phuong_moi, toan_bo, nguon }) => ({ ten, quan_cu, phuong_moi, toan_bo, nguon }));
  return [...goc, ...them];
}
