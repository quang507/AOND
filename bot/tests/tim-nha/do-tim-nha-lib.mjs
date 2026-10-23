// Hàm thuần của bộ đo tìm nhà (SRS-5.1zzzzzzz144) — không I/O để tự kiểm offline (do-tim-nha.tu-kiem.mjs).

export const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const so = (v, ten) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${ten} không phải số: ${v}`);
  return v;
};

/** Câu SQL gọi `public.tim_nha` đúng chữ ký (p_deal, p_loai, p_gia_max, p_khu, p_dt_min, p_pn_min, p_xe_hoi, p_vec, p_limit).
 *  `vec` null = chỉ lọc cứng + điểm khu vực / diện tích / phòng ngủ / xe hơi, không điểm vector. */
export function sqlTimNha(loc, vec, limit = 5) {
  const chu = (v) => (v == null ? "null::text" : esc(v));
  const num = (v, ten, kieu) => { const x = so(v, ten); return x === null ? `null::${kieu}` : `${x}::${kieu}`; };
  const vecSql = vec == null ? "null::float8[]" : `array[${vec.map((x) => so(x, "vec")).join(",")}]::float8[]`;
  return `select r.can->>'code' as code, (r.diem)::float8 as diem from public.tim_nha(` +
    `p_deal => ${esc(loc.deal)}, p_loai => ${chu(loc.loai)}, p_gia_max => ${num(loc.gia_max, "gia_max", "bigint")}, ` +
    `p_khu => ${chu(loc.khu)}, p_dt_min => ${num(loc.dt_min, "dt_min", "numeric")}, p_pn_min => ${num(loc.pn_min, "pn_min", "int")}, ` +
    `p_xe_hoi => ${loc.xe_hoi ? "true" : "false"}, p_vec => ${vecSql}, p_limit => ${so(limit, "limit")}) r`;
}

export function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Thứ hạng (1-based) của đáp án ĐẦU TIÊN trong top k; không có → null. */
export function hang(dsMa, dapAn, k = 5) {
  for (let i = 0; i < Math.min(k, dsMa.length); i++) if (dapAn.includes(dsMa[i])) return i + 1;
  return null;
}

/** hit@3, hit@5, MRR (1/hạng, không có = 0) của một danh sách thứ hạng. */
export function chiSo(hangs) {
  const n = hangs.length;
  if (!n) return { n: 0, hit3: 0, hit5: 0, mrr: 0 };
  const dem = (f) => hangs.filter((h) => h !== null && f(h)).length / n;
  return { n, hit3: dem((h) => h <= 3), hit5: dem((h) => h <= 5), mrr: hangs.reduce((t, h) => t + (h ? 1 / h : 0), 0) / n };
}

/** Điều kiện CỨNG của tim_nha (bán / thuê, loại, giá tối đa) — dùng cho chế độ nghĩa thuần để so công bằng với tim_nha. */
export function hopLocCung(tin, loc) {
  if (tin.deal !== loc.deal) return false;
  if (loc.loai && tin.property_type !== loc.loai) return false;
  if (loc.gia_max != null && !(tin.price_vnd <= loc.gia_max)) return false;
  return true;
}

export const phanTram = (x) => `${(x * 100).toFixed(0)}%`;
