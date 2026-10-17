// gan-manh-loc.ts — kiểm đầu ra `ganManhBangModel` (FR-214 b/d, 23/09/2026). Tiền định, không model/RPC.
//
// Model được đọc cả hội thoại để quyết mảnh nào thuộc căn nào, nhưng CHỮ và MÃ phải có thật: mảnh không
// nằm nguyên văn trong tin thì bỏ; mã không thuộc danh sách tin của người đó (hoặc MOI/KHONG) thì bỏ.

export type ManhGan = { trich: string; ma: string };

const gon = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

export function donManh(ket: unknown, text: string, maHopLe: string[]): ManhGan[] {
  const k = ket as { manh?: Array<{ trich?: unknown; ma_tin?: unknown }> } | null;
  if (!k?.manh?.length) return [];
  const goc = gon(text);
  const ma = new Set(maHopLe.map((m) => m.toUpperCase()));
  const ra: ManhGan[] = [];
  for (const m of k.manh) {
    const trich = typeof m.trich === "string" ? m.trich.trim() : "";
    const maTin = typeof m.ma_tin === "string" ? m.ma_tin.trim().toUpperCase() : "";
    if (trich.length < 2 || !goc.includes(gon(trich))) continue;
    if (!(ma.has(maTin) || maTin === "MOI" || maTin === "KHONG")) continue;
    ra.push({ trich, ma: maTin });
  }
  return ra;
}

const boDau = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export type TinGon = { code: string; property_type?: string | null; district?: string | null; street?: string | null; location_raw?: string | null };

/**
 * Có đáng hỏi model không (tiền định, rẻ): người đó rao ≥ 2 tin VÀ tin mới có dấu hiệu nói tới căn khác —
 * ≥ 2 con số tiền, "còn/thêm (nhà|căn|đất|mảnh|lô)…", hoặc nhắc nơi chốn (quận / tên đường) của một tin
 * KHÁC tin đang treo. Một tin thì không bao giờ hỏi (không có gì để nhầm).
 */
export function canGanManh(text: string, dsTin: TinGon[], maTreo: string | null): boolean {
  const kd = boDau(text);
  // 23/09/2026 (bắn thật): đang hỏi phường căn nhà Q3 mà nhắn "phường 9 em. À anh còn miếng đất ở Nhơn Trạch … 2 tỷ 3
  // nữa" — mới MỘT tin, nhưng câu vừa trả lời căn cũ vừa rao căn mới; bản trước ghi "Phường 9" cho lô đất Đồng Nai.
  // Có câu đang treo + phần trước chữ "còn/thêm <loại>" → model chia (mảnh đầu = câu treo, mảnh sau = MOI).
  const CON_THEM_RE = /(?:^|[.,;!?]\s*|\s)(?:a\s+|ah\s+|u\s+)?(?:(?:anh|chi|em|co|chu|bac|con|chau|minh|tui|toi|cau|di)\s+)?(?:con|them|co them|ngoai ra)\s+(?:(?:mot|1|cai)\s+)?(?:nha|can|dat|manh|lo|mieng|mat bang|kho|phong)\b/;
  if (dsTin.length === 1 && maTreo) {
    const m = CON_THEM_RE.exec(kd);
    return !!m && m.index > 0 && /[a-z0-9]/.test(kd.slice(0, m.index));
  }
  if (dsTin.length < 2) return false;
  const soTien = (kd.match(/\d+(?:[.,]\d+)?\s*(?:ty|ti|toi|trieu|tr)(?![a-z])/g) ?? []).length;
  if (soTien >= 2) return true;
  if (/\b(?:con|them|ngoai ra|voi lai)\s+(?:(?:mot|1|cai)\s+)?(?:nha|can|dat|manh|lo|mieng|mat bang|kho|phong)\b/.test(kd)) return true;
  // Câu nói tới một LOẠI khác căn đang treo ("nhà phố mà thổ cư full…" khi đang hỏi lô đất) mà người đó có tin
  // thuộc loại ấy → gần như chắc là nói về căn kia (Zalo chủ dự án 23/09, tin thứ 5).
  const nhom = (l: string | null | undefined) => l === "dat" ? "dat" : l === "chung_cu" ? "chung_cu" : l && l !== "chua_ro" ? "nha" : null;
  const loaiCau = /\b(?:can ho|chung cu)\b/.test(kd) ? "chung_cu" : /\bnha(?:\s+(?:pho|hem|mat tien|rieng))?\b/.test(kd) ? "nha"
    : /\b(?:manh dat|lo dat|dat nen|mieng dat|dat)\b/.test(kd) ? "dat" : null;
  const treo = maTreo ? dsTin.find((t) => t.code.toUpperCase() === maTreo.toUpperCase()) : null;
  if (loaiCau && treo && nhom(treo.property_type) && loaiCau !== nhom(treo.property_type) &&
      dsTin.some((t) => t !== treo && nhom(t.property_type) === loaiCau)) return true;
  return dsTin.some((t) => {
    if (maTreo && t.code.toUpperCase() === maTreo.toUpperCase()) return false;
    const q = boDau(t.district ?? "").replace(/,.*$/, "").trim();
    const d = boDau(t.street ?? "").trim();
    return (q.length >= 5 && kd.includes(q)) || (d.length >= 5 && kd.includes(d));
  });
}
