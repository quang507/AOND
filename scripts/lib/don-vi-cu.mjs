// don-vi-cu.mjs — tách cột `wards.don_vi_cu` ("trên cơ sở toàn bộ Phường 12 và Phường 14 thuộc quận Gò Vấp.") thành
// danh sách PHƯỜNG / XÃ CŨ (trước 07/2025) → phường mới. THUẦN, không mạng. Dùng sinh dữ liệu bảng `phuong_cu`
// (migration 20260930a) và bài kiểm bot/tests/phan-loai-duong.mjs.
//
// Chủ dự án 30/09/2026: "vector đường lớn phường quận mới và cũ và dự án đi" — khách vẫn nói "phường 12 Gò Vấp",
// "phường Thảo Điền", bot phải biết đó là phường mới nào, quận cũ nào.

const LOAI = "(?:Phường|phường|Xã|xã|Thị trấn|thị trấn)";
const CAP_QUAN = "(?:quận|Quận|huyện|Huyện|thành phố|Thành phố|thị xã|Thị xã)";

/** Tên quận cũ chuẩn hoá: "quận Gò Vấp" → "Quận Gò Vấp", "thành phố Thủ Đức" → "Thành phố Thủ Đức". */
export function chuanQuan(s) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * @returns {Array<{ ten: string, loai: "phuong" | "xa" | "thi_tran", quan_cu: string, toan_bo: boolean }>}
 * "một phần" / "phần còn lại" → toan_bo = false (phường cũ bị chia, một phần sang phường mới khác).
 */
export function tachDonViCu(doanVan) {
  const t = String(doanVan ?? "").replace(/\s+/g, " ").replace(/^trên cơ sở\s+/i, "").trim();
  if (!t) return [];
  const ra = [];
  // Mỗi cụm "<danh sách đơn vị> thuộc <quận>" — một câu có thể có nhiều cụm nối bằng "và" / ";".
  const re = new RegExp(`([\\s\\S]*?)\\bthuộc\\s+(${CAP_QUAN}\\s+[^,.;]+?)(?=\\s*(?:[,.;]|\\s+và\\s|$))`, "gu");
  for (const m of t.matchAll(re)) {
    const ds = m[1];
    const quan = chuanQuan(m[2]);
    // Tách theo dấu phẩy / chữ "và" (\b của JS không nhận chữ có dấu — "và" phải chặn bằng lookaround \p{L}).
    const reDv = new RegExp(`^(toàn bộ|một phần|phần còn lại(?: của)?)?\\s*(?:của\\s+)?(${LOAI})\\s+(.+)$`, "u");
    let pham = "toàn bộ";
    for (const manh of ds.split(/\s*(?:,|(?<![\p{L}])và(?![\p{L}]))\s*/u)) {
      const d = reDv.exec(manh.trim());
      if (!d) continue;
      if (d[1]) pham = d[1];
      const loaiChu = d[2].toLowerCase();
      const ten = d[3].replace(/\s+/g, " ").trim();
      if (!ten || ten.length > 40) continue;
      const loai = loaiChu === "phường" ? "phuong" : loaiChu === "xã" ? "xa" : "thi_tran";
      const tien = loai === "phuong" ? "Phường" : loai === "xa" ? "Xã" : "Thị trấn";
      ra.push({ ten: `${tien} ${ten}`, loai, quan_cu: quan, toan_bo: pham === "toàn bộ" });
    }
  }
  return ra;
}

// ── OPEN-60 (20261009d): phường SỐ cũ gộp TRƯỚC 07/2025 (NQ 1111/2020, NQ 1278/2024) ─────────────────────────────────────
/**
 * Đọc khối VALUES của migration 20261009d: `('Phường 6', 'Quận 3', 'Phường Võ Thị Sáu', 'Xuân Hòa', true, 'NQ 1111/… Điều 2 …')`.
 * THUẦN (nhận chữ SQL). `goc` = các dòng phuong_cu đã có ({ ten, quan_cu, phuong_moi }): như câu insert của migration, dòng chỉ
 * được nhận khi dòng TRUNG GIAN (tên, quận cũ, phường mới) có trong `goc` — lệch thì bỏ, giống hệt DB.
 * @returns {Array<{ ten: string, quan_cu: string, phuong_moi: string, toan_bo: boolean, trung_gian: string, nguon: string }>}
 */
export function tachPhuongCuTruoc2025(sql, goc) {
  const s = (x) => x.replace(/''/g, "'");
  const re = /^\s*\('((?:[^']|'')+)',\s*'((?:[^']|'')+)',\s*'((?:[^']|'')+)',\s*'((?:[^']|'')+)',\s*(true|false),\s*'((?:[^']|'')+)'\)/gm;
  return [...String(sql ?? "").matchAll(re)]
    .map((m) => ({ ten: s(m[1]), quan_cu: s(m[2]), trung_gian: s(m[3]), phuong_moi: s(m[4]), toan_bo: m[5] === "true", nguon: s(m[6]) }))
    .filter((r) => goc.some((g) => g.quan_cu === r.quan_cu && g.phuong_moi === r.phuong_moi && r.trung_gian.split(" + ").includes(g.ten)))
    // `on conflict (ten, quan_cu, phuong_moi) do nothing`
    .filter((r) => !goc.some((g) => g.ten === r.ten && g.quan_cu === r.quan_cu && g.phuong_moi === r.phuong_moi));
}
