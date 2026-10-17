// dia-chi.ts — SRS-5.1zzzzzzm (14/10/2026): ĐỊA CHỈ MỘT CỬA — phần ĐƯỜNG + SỐ NHÀ của `vi_tri` được chuẩn hoá ở MỘT chỗ
// (`ghiFact`, _shared/ghi-fact.ts) trước khi vào DB. File này THUẦN (không fetch, không RPC — bot/tests/ranh-gioi.mjs canh).
//
// Người test thật 14/10 (nhà Huỳnh Tấn Phát): lượt đầu ghi "1235 Huỳnh Tấn Phát" (đã qua từ điển), lượt CHỐT TIN ghi đè bằng cụm thô
// "đường huỳnh tấn phát số 1235" → `location_raw` chữ thường, cột `street` thành "huỳnh tấn phát số 1235" (SQL `boc_ten_duong` không
// biết "số 1235" ở cuối), 📍 in "Đường huỳnh tấn phát số 1235". Lớp lỗi: vi_tri có BA đường ghi (luật đã qua `suaTenDuong`, AI ghi cụm
// nguyên văn, lượt chốt ghi cụm nguyên văn nối lại), mỗi đường một kiểu chữ. Nay mọi đường đi qua cùng một phép chuẩn hoá:
//   • số nhà đứng TRƯỚC tên đường, không chữ "số" ("đường X số 1235" / "số 1235 X" / "1235 đường X" → "1235 X");
//   • tiền tố hẻm / ngõ / kiệt giữ nguyên chỗ ("hẻm 120 Trần Hưng Đạo" không đổi);
//   • tên đường theo TỪ ĐIỂN (có dấu, hoa thường) khi nơi gọi tra được tên khớp đúng (`tenTuDien`); không tra được thì giữ chữ khách;
//   • phần sau dấu phẩy (phường / quận khách gõ kèm) giữ nguyên — in ra khách không đọc nó (`hien-thi-dia-chi.ts`).
// Chỉ đổi THỨ TỰ / DẤU / HOA THƯỜNG — không bao giờ đổi chữ cái của tên riêng (FR-208 h).
import { chuanTenDuong } from "./tra-phuong.ts";
import { catTenDuong, theTenDuong } from "./tra-duong.ts";

export type ManhDiaChi = { tienTo: string; soNha: string | null; tenDuong: string; duoi: string };

const SO_NHA = String.raw`\d{1,5}[a-ln-z]?(?:\s*\/\s*\d{1,5}[a-z]?)*`;
/** Tiền tố hẻm (một hay nhiều cấp): "hẻm 120", "hẻm 18/5", "ngõ 3 hẻm 7", "hxh 45". */
const TIEN_TO_HEM_RE = new RegExp(String.raw`^((?:(?:hẻm|hem|hẽm|ngõ|ngo|kiệt|kiet|ngách|ngach|hxh|hxm|hxt)\s*[\d][\d\/a-z]*\s*)+)(.*)$`, "iu");
/** "… số 1235" ở CUỐI: phần trước có ≥ 2 chữ cái và không kết bằng từ loại (để "đường số 59" là tên đường, không phải số nhà). */
const SO_CUOI_RE = new RegExp(String.raw`^(.*?[\p{L}]{2}.*?)\s+(?:số|so)\s*(${SO_NHA})$`, "iu");
const KET_BANG_TU_LOAI_RE = /(?:^|\s)(?:đường|duong|phố|pho|đ\.|hẻm|hem|ngõ|ngo|kiệt|kiet|số|so)$/iu;
/** "(số) 1235 tên đường" ở ĐẦU: số nhà rồi tới chữ. */
const SO_DAU_RE = new RegExp(String.raw`^(?:(?:số|so)\s*)?(${SO_NHA})\s+(.*[\p{L}]{2}.*)$`, "iu");

const boDau = (s: string): string =>
  s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Tách vế đầu địa chỉ (trước dấu phẩy) thành tiền tố hẻm · số nhà · tên đường; không nhận ra số nhà thì `soNha` null, `tenDuong` = cả vế. */
export function tachManhDiaChi(viTri: string): ManhDiaChi {
  const goc = (viTri ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  const iPhay = goc.search(/[,;]/);
  const dau = (iPhay >= 0 ? goc.slice(0, iPhay) : goc).trim();
  const duoi = iPhay >= 0 ? goc.slice(iPhay + 1).trim() : "";
  let tienTo = "", than = dau;
  const mh = TIEN_TO_HEM_RE.exec(than);
  if (mh && mh[2].trim()) { tienTo = mh[1].trim(); than = mh[2].trim(); }
  const mc = SO_CUOI_RE.exec(than);
  if (mc && !KET_BANG_TU_LOAI_RE.test(mc[1].trim())) return { tienTo, soNha: mc[2].replace(/\s+/g, ""), tenDuong: mc[1].trim(), duoi };
  const md = SO_DAU_RE.exec(than);
  // "4m Phạm Thế Hiển" là bề rộng, không phải số nhà (chữ đuôi "m" đã bị loại ở SO_NHA, nhưng "4 m" / "4m" vẫn phải chặn).
  if (md && !/^\d+\s*m(?![\p{L}])/iu.test(than)) return { tienTo, soNha: md[1].replace(/\s+/g, ""), tenDuong: md[2].trim(), duoi };
  return { tienTo, soNha: null, tenDuong: than, duoi };
}

/**
 * Chuẩn hoá vế đường của `vi_tri`. `tenTuDien`: tên đường từ điển KHỚP ĐÚNG với tên khách gõ (nơi gọi tra `tim_duong` → `chonDuong`
 * ra `sua` / `khop`), null khi không tra được. Không có gì để đổi → trả nguyên chữ (đã gọt khoảng trắng).
 */
export function chuanHoaViTri(viTri: string, tenTuDien: string | null | undefined = null): string {
  const m = tachManhDiaChi(viTri);
  let ten = m.tenDuong;
  // Có số nhà thì chữ "đường" đứng trước tên là thừa ("1235 đường Huỳnh Tấn Phát" → "1235 Huỳnh Tấn Phát").
  if (m.soNha) ten = ten.replace(/^(?:đường|duong|phố|pho|đ\.)\s+(?!(?:số|so)?\s*\d)/iu, "").trim();
  if (tenTuDien) {
    const goc = catTenDuong(chuanTenDuong(ten));
    if (goc && boDau(goc) === boDau(tenTuDien)) ten = theTenDuong(ten, goc, tenTuDien.trim());
  }
  const dauMoi = [m.tienTo, m.soNha, ten].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (!dauMoi) return (viTri ?? "").replace(/\s+/g, " ").trim();
  return m.duoi ? `${dauMoi}, ${m.duoi}` : dauMoi;
}

/** Tên đường trần để tra từ điển từ một `vi_tri` ("đường huỳnh tấn phát số 1235" → "huỳnh tấn phát"); không có → "". */
export function tenDuongDeTra(viTri: string): string {
  const m = tachManhDiaChi(viTri);
  return catTenDuong(chuanTenDuong(m.tenDuong));
}
