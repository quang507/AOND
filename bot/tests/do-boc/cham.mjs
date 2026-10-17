// cham.mjs — CHẤM BỘ ĐO BÓC TÁCH (TS-DO-BOC-01, 23/09/2026).
//
// Chủ dự án (23/09): "nếu cứ bắn thử và vá này thì sau bot sẽ cover được hết trường hợp à" — không. Bộ này đo
// bot đúng BAO NHIÊU PHẦN TRĂM trên một bộ câu cố định, để mỗi lần đổi code/prompt biết tăng hay tụt,
// thay vì chỉ biết "5 ca vừa bắn thì qua".
//
// Hàm thuần: nhận KỲ VỌNG của một ca + TRẠNG THÁI đọc ra sau khi chạy (tin bán của người đó, hồ sơ mua),
// trả điểm. Không biết trạng thái đến từ đâu — DB giả (chay.mjs) hay DB production (đổ ra JSON) chấm
// như nhau.
//
//   bun bot/tests/do-boc/cham.mjs --tu-kiem     # tự kiểm hàm chấm (không mạng, không model)

/** Bỏ dấu, thường hoá — so chữ không phụ thuộc cách gõ. */
export const boDau = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();

/** "Quận 5" / "quan 5" / "Q5" / "Huyện Củ Chi" → khoá so sánh ("q5", "cu chi"). */
export function khoaQuan(s) {
  const k = boDau(s).replace(/,.*$/, "");
  const m = /^(?:quan|q)\s*\.?\s*(\d{1,2})$/.exec(k);
  if (m) return `q${Number(m[1])}`;
  return k.replace(/^(?:quan|huyen|thanh pho|tp|tinh|thi xa)\s+/, "").trim();
}
/** "Phường 9" / "P9" / "phường Bình Thới" → "p9" / "binh thoi". */
export function khoaPhuong(s) {
  const k = boDau(s);
  const m = /^(?:phuong|p)\s*\.?\s*(\d{1,2})$/.exec(k);
  if (m) return `p${Number(m[1])}`;
  return k.replace(/^(?:phuong|xa|thi tran)\s+/, "").trim();
}
// SRS-5.1zzzzc (09/10/2026): phường SỐ cũ ("Phường 5" Gò Vấp) và phường MỚI nó gộp vào ("Phường An Nhơn") là MỘT phường — bot nay
// ghi tên mới qua bảng phường cũ (`phuongTuSoCu`, cùng hàm bot dùng). Kỳ vọng soạn trước 07/2025 vẫn chấm đúng.
import { phuongTuSoCu } from "../../supabase/functions/_shared/extraction/khop-phuong.ts";
function cungPhuongCu(v, ky, quan) {
  const so = (x) => /^p(\d{1,2})$/.exec(khoaPhuong(x))?.[1] ?? null;
  const moi = (x) => { const n = so(x); return n ? phuongTuSoCu(n, quan) : null; };
  const a = moi(ky), b = moi(v);
  return (!!a && boDau(a.ten) === khoaPhuong(v)) || (!!b && boDau(b.ten) === khoaPhuong(ky));
}
const NHOM_LOAI = { nha_pho: "nha", nha_cap4: "nha", nha_cap_4: "nha", biet_thu: "nha", nha_tro: "nha", chung_cu: "chung_cu", dat: "dat", dat_nong_nghiep: "dat", dat_kinh_doanh: "dat", mat_bang: "mat_bang", kho_xuong: "kho_xuong", toa_nha: "toa_nha" };
const nhomLoai = (l) => NHOM_LOAI[l] ?? l ?? null;
const gan = (a, b, tile = 0.02) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= Math.max(1, Math.abs(Number(b)) * tile);

/**
 * So một trường. `ky` là giá trị kỳ vọng; `null` nghĩa là "phải TRỐNG" (bot không được bịa/ghi nhầm vào đây).
 * Trả true/false.
 */
export function soTruong(truong, ky, tin) {
  const v = {
    loai: tin.property_type, quan: tin.district, phuong: tin.ward, gia: tin.price_vnd, dt: tin.area_m2,
    pn: tin.bedrooms, phap_ly: tin.legal_status, tang: tin.floors, ngang: tin.frontage_m, deal: tin.deal,
    dt_san: tin.built_area_m2,
  }[truong];
  if (ky === null) return v == null || v === "" || v === "chua_ro";
  switch (truong) {
    case "loai": return nhomLoai(v) === nhomLoai(ky);
    // "Cần Giuộc, Long An" khớp kỳ vọng "Long An" (tỉnh), nhưng "Quận 10" KHÔNG khớp "Quận 1".
    case "quan": return !!v && (khoaQuan(v) === khoaQuan(ky) || (!/^q\d/.test(khoaQuan(ky)) && boDau(v).split(/\s*,\s*/).some((x) => khoaQuan(x) === khoaQuan(ky))));
    case "phuong": return !!v && (khoaPhuong(v) === khoaPhuong(ky) || cungPhuongCu(v, ky, tin.district));
    case "gia": return gan(v, ky, 0.01);
    case "dt": case "ngang": case "dt_san": return gan(v, ky, 0.02);
    case "pn": case "tang": return v != null && Number(v) === Number(ky);
    case "phap_ly": return v === ky || (ky === "co_so" && /^so_/.test(String(v ?? "")));
    case "deal": return v === ky;
    default: return false;
  }
}

/** Điểm khớp một tin thật với một tin kỳ vọng (để ghép cặp). */
function diemKhop(ky, tin) {
  let d = 0;
  for (const [k, gt] of Object.entries(ky)) if (gt !== null && soTruong(k, gt, tin)) d += k === "gia" || k === "loai" ? 2 : 1;
  return d;
}

/**
 * Chấm một ca. `ky`: { so_tin?, tin?: [{loai, quan, gia, …}], mua?: {area?, budget?, pn?, loai?} }.
 * `tt`: { tin: [{property_type, district, …}], mua: preferences | null }.
 * Trả { dat, truong: {dung, tong}, loi: [chuỗi] }.
 */
export function chamCa(ky, tt) {
  const loi = [];
  let dung = 0, tong = 0;
  const tinThat = [...(tt.tin ?? [])];
  const tinKy = ky.tin ?? [];
  const soTin = ky.so_tin ?? (ky.tin ? tinKy.length : null);
  if (soTin != null) {
    tong++;
    if (tinThat.length === soTin) dung++;
    else loi.push(`số tin ${tinThat.length} ≠ ${soTin}`);
  }
  // Ghép cặp tham lam: tin kỳ vọng nào khớp nhiều trường nhất với tin thật nào.
  const conLai = new Set(tinThat.map((_, i) => i));
  tinKy.forEach((k, ki) => {
    let tot = -1, iTot = -1;
    for (const i of conLai) { const d = diemKhop(k, tinThat[i]); if (d > tot) { tot = d; iTot = i; } }
    const tin = iTot >= 0 ? tinThat[iTot] : null;
    if (iTot >= 0) conLai.delete(iTot);
    for (const [truong, gt] of Object.entries(k)) {
      tong++;
      if (tin && soTruong(truong, gt, tin)) dung++;
      else loi.push(`tin ${ki + 1}.${truong}: muốn ${gt === null ? "trống" : JSON.stringify(gt)}, có ${tin ? JSON.stringify({ loai: tin.property_type, quan: tin.district, phuong: tin.ward, gia: tin.price_vnd, dt: tin.area_m2, pn: tin.bedrooms, phap_ly: tin.legal_status, tang: tin.floors, ngang: tin.frontage_m, deal: tin.deal }[truong]) : "không có tin"}`);
    }
  });
  if (ky.mua) {
    const p = tt.mua ?? {};
    for (const [truong, gt] of Object.entries(ky.mua)) {
      tong++;
      let ok = false;
      if (truong === "area") ok = !!p.area && boDau(p.area).includes(boDau(gt));
      else if (truong === "budget") ok = gan(docSoTien(p.budget), gt, 0.05);
      else if (truong === "pn") ok = p.bedrooms != null && Number(p.bedrooms) === Number(gt);
      else if (truong === "loai") ok = !!p.property_type && boDau(p.property_type).includes(boDau(gt));
      else if (truong === "deal") ok = p.deal === gt;
      if (ok) dung++;
      else loi.push(`mua.${truong}: muốn ${JSON.stringify(gt)}, có ${JSON.stringify(truong === "pn" ? p.bedrooms : truong === "loai" ? p.property_type : p[truong] ?? null)}`);
    }
  }
  return { dat: loi.length === 0, truong: { dung, tong }, loi };
}

/** Đọc số tiền thô từ hồ sơ mua ("5,5 tỷ", "tầm 6 tỷ", 6000000000). Chỉ đủ cho chấm — không thay luat-tien. */
export function docSoTien(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const k = boDau(v).replace(/,/g, ".");
  const m = /(\d+(?:\.\d+)?)\s*(ty|ti|toi)(?:\s*(\d{1,3}|ruoi))?/.exec(k);
  if (m) return Number(m[1]) * 1e9 + (m[3] === "ruoi" ? 5e8 : m[3] ? Number(m[3]) * (m[3].length === 1 ? 1e8 : m[3].length === 2 ? 1e7 : 1e6) : 0);
  const t = /(\d+(?:\.\d+)?)\s*(trieu|tr|cu)\b/.exec(k);
  if (t) return Number(t[1]) * 1e6;
  return null;
}

/** Gộp kết quả nhiều ca thành bảng số theo nhóm. */
export function tongHop(ketQua) {
  const theoNhom = {};
  let caDat = 0, dung = 0, tong = 0;
  for (const r of ketQua) {
    const n = (theoNhom[r.nhom] ??= { ca: 0, ca_dat: 0, dung: 0, tong: 0 });
    n.ca++; if (r.dat) { n.ca_dat++; caDat++; }
    n.dung += r.truong.dung; n.tong += r.truong.tong; dung += r.truong.dung; tong += r.truong.tong;
  }
  return { so_ca: ketQua.length, ca_dat: caDat, ty_le_ca: ketQua.length ? +(caDat / ketQua.length).toFixed(3) : null, truong_dung: dung, truong_tong: tong, ty_le_truong: tong ? +(dung / tong).toFixed(3) : null, theo_nhom: theoNhom };
}

// ── Tự kiểm ─────────────────────────────────────────────────────────────────
if (import.meta.main && process.argv.includes("--tu-kiem")) {
  let hong = 0, n = 0;
  const ok = (ten, d) => { n++; if (!d) hong++; console.log(`${d ? "✓" : "✗"} ${ten}`); };
  const tin = (o) => ({ property_type: null, district: null, ward: null, price_vnd: null, area_m2: null, bedrooms: null, legal_status: null, floors: null, frontage_m: null, deal: "ban", ...o });
  ok("khoaQuan: 'Quận 5' = 'q5' = 'quan 05'", khoaQuan("Quận 5") === "q5" && khoaQuan("Q5") === "q5" && khoaQuan("quan 05") === "q5");
  ok("khoaQuan: 'Huyện Củ Chi' = 'Củ Chi'", khoaQuan("Huyện Củ Chi") === khoaQuan("Củ Chi"));
  ok("soTruong quan: 'Cần Giuộc, Long An' ~ 'Long An'; 'Quận 10' ≠ 'Quận 1'", soTruong("quan", "Long An", tin({ district: "Cần Giuộc, Long An" })) && !soTruong("quan", "Quận 1", tin({ district: "Quận 10" })));
  ok("khoaPhuong: 'Phường 9' = 'P9'", khoaPhuong("Phường 9") === khoaPhuong("P9"));
  ok("soTruong phuong (SRS-5.1zzzzc): 'Phường 5' Gò Vấp ~ 'Phường An Nhơn'; khác quận thì không; phường cũ bị chia thì không",
    soTruong("phuong", "Phường 5", tin({ district: "Quận Gò Vấp", ward: "Phường An Nhơn" })) &&
      !soTruong("phuong", "Phường 5", tin({ district: "Quận 10", ward: "Phường An Nhơn" })) &&
      !soTruong("phuong", "Phường 16", tin({ district: "Quận 8", ward: "Phường Bình Phú" })));
  const ky = { so_tin: 2, tin: [{ loai: "nha_pho", quan: "Quận 5", gia: 9e9, pn: null }, { loai: "chung_cu", quan: "Quận 10", gia: 5.2e9, pn: 2 }] };
  const dung = { tin: [tin({ property_type: "chung_cu", district: "Quận 10", price_vnd: 5.2e9, bedrooms: 2 }), tin({ property_type: "nha_pho", district: "Quận 5", price_vnd: 9e9 })] };
  ok("chamCa: hai tin đúng (thứ tự đảo) → đạt, 1 + 8 trường", (() => { const r = chamCa(ky, dung); return r.dat && r.truong.dung === 9 && r.truong.tong === 9; })());
  const gop = { tin: [tin({ property_type: "chung_cu", district: "Quận 5", price_vnd: 9e9, bedrooms: 2 })] };
  ok("chamCa: gộp hai căn thành một → rớt, sai số tin + thiếu tin 2", (() => { const r = chamCa(ky, gop); return !r.dat && r.loi.some((x) => /số tin 1/.test(x)) && r.loi.some((x) => /không có tin/.test(x)); })());
  const bia = { tin: [tin({ property_type: "nha_pho", district: "Quận 5", price_vnd: 9e9, bedrooms: 2 }), tin({ property_type: "chung_cu", district: "Quận 10", price_vnd: 5.2e9, bedrooms: 2 })] };
  ok("chamCa: pn phải TRỐNG mà có 2 (fact căn này ghi sang căn kia) → rớt đúng trường", (() => { const r = chamCa(ky, bia); return !r.dat && r.loi.length === 1 && /tin 1\.pn/.test(r.loi[0]); })());
  ok("soTruong: giá lệch 0.5% vẫn khớp, lệch 5% thì không", soTruong("gia", 9e9, tin({ price_vnd: 9.04e9 })) && !soTruong("gia", 9e9, tin({ price_vnd: 9.5e9 })));
  ok("soTruong: loại cùng nhóm nhà (nhà cấp 4 ~ nhà phố)", soTruong("loai", "nha_pho", tin({ property_type: "nha_cap4" })));
  ok("soTruong: phap_ly 'co_so' nhận mọi loại sổ", soTruong("phap_ly", "co_so", tin({ legal_status: "so_hong_rieng" })) && !soTruong("phap_ly", "co_so", tin({ legal_status: null })));
  ok("chamCa: hồ sơ mua — area chứa, budget ±5%, pn", chamCa({ mua: { area: "Quận 5", budget: 6e9, pn: 3 } }, { tin: [], mua: { area: "khu Chợ Lớn Quận 5", budget: "tầm 6 tỷ", bedrooms: 3 } }).dat);
  ok("chamCa: hồ sơ mua thiếu budget → rớt đúng trường", (() => { const r = chamCa({ mua: { area: "Quận 5", budget: 6e9 } }, { tin: [], mua: { area: "Quận 5" } }); return !r.dat && r.loi.length === 1 && /mua\.budget/.test(r.loi[0]); })());
  ok("docSoTien: '5,5 tỷ' / '7 tỷ 2' / '25 triệu' / '5 tỷ rưỡi'", docSoTien("5,5 tỷ") === 5.5e9 && docSoTien("7 tỷ 2") === 7.2e9 && docSoTien("25 triệu/tháng") === 25e6 && docSoTien("5 tỷ rưỡi") === 5.5e9);
  ok("tongHop: tỉ lệ ca + tỉ lệ trường theo nhóm", (() => { const t = tongHop([{ nhom: "a", dat: true, truong: { dung: 3, tong: 3 } }, { nhom: "a", dat: false, truong: { dung: 1, tong: 3 } }]); return t.ty_le_ca === 0.5 && t.truong_dung === 4 && t.theo_nhom.a.ca === 2; })());
  console.log(hong ? `\nCHẤM ĐO BÓC: ${hong}/${n} CA HỎNG` : `\nCHẤM ĐO BÓC: ${n}/${n} CA ĐẠT`);
  process.exit(hong ? 1 : 0);
}
