// BẢN NHÁP TIN RAO — viết như một TIN RAO THẬT (mẫu tin lẻ trên mogi.vn).
//
// Chủ dự án 12/09/2026: "xem cái mogi.vn nếu mà tin lẻ thì người ta đăng tin
// ntn… mấy cái bóc tách đã ghi vào supabase thật thì đưa ra trong 1 tin trước
// đó sau đó đưa em đăng tin như này nhé".
//
// Tin lẻ trên mogi có bốn tầng, đúng thứ tự mắt người đọc:
//   1. TIÊU ĐỀ một dòng gộp đủ thứ đáng tiền: loại · kết cấu · đường · phường
//      quận · diện tích · pháp lý · GIÁ ("Bán nhà 1 trệt 1 lầu đường Nguyễn Văn
//      Hoa P.Thống Nhất. SHR Giá 4,8 tỷ").
//   2. Địa chỉ đầy đủ.  3. Giá.  4. Khối thông số, rồi lời mời liên hệ.
// Bản cũ của mình mở bằng "🏠 NHÀ PHỐ BÁN" rồi mới tới địa chỉ, còn giá nằm tận
// cuối — người bán đọc không ra hình dạng một tin rao.
//
// LUẬT KHÔNG ĐỔI: mọi chữ trong đây đến từ CỘT hoặc FACT chủ nhà đã nói. Thiếu
// thì bỏ dòng. Không đoán, không khen thay chủ nhà — model KHÔNG tham gia dựng
// bản nháp, nên nó kiểm được offline và không tốn lượt tiền nào.
//
// Tách khỏi chat-reply để: (a) `scripts/xem-tin-nhap.mjs` dựng thử trên dữ liệu
// THẬT mà không phải deploy; (b) kiểm bằng bun trong `bot/tests/tin-nhap-rao.mjs`.

import { SPEC_COLS, thongSoNgan, type SpecRow } from "./thong_so.ts";
import { tenNhan, tenNhanKhongTrung } from "./extraction/nhan.ts";
import { donViGiaDep, vndThanhChu } from "./extraction/luat-tien.ts";
import { laBoSungTrung, trungY } from "./extraction/khop-cau-tra-loi.ts";
import { diaChiHienThi, duongGiuaCau, duongHienThi, ghepDiaChi } from "./extraction/hien-thi-dia-chi.ts";
import { dangChoThue } from "./extraction/re-nhanh.ts";

/** FR-241 j: hiện trạng sử dụng gõ không dấu ("dang o", "de trong") → có dấu; chữ có dấu / cụm lạ giữ nguyên. */
const HIEN_TRANG_KD: Array<[RegExp, string]> = [
  [/^dang o$/, "đang ở"], [/^(?:dang )?cho thue$|^dang cho thue$|^dang thue$/, "đang cho thuê"], [/^(?:de|bo) trong$/, "để trống"],
  [/^con o$/, "còn ở"], [/^khong cho thue,? dang o$/, "không cho thuê, đang ở"],
];
/** SRS-5.1zzzzzo: so một ý thêm với ý AI chép lại — bỏ dấu, bỏ "có / nhà có" đầu câu, gộp dấu câu (AI hay bỏ chữ "có"). */
export const chuanY = (x: string): string =>
  boDau(x ?? "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^(?:nha co|can co|co)\s+/, "");

export function chuanHienTrang(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const kd = boDau(t).replace(/[.!]+$/, "").trim();
  if (kd !== t.toLowerCase().replace(/[.!]+$/, "").trim()) return t;
  for (const [re, co] of HIEN_TRANG_KD) if (re.test(kd)) return co;
  return t;
}

export const COT_TIN_NHAP =
  `code, location_raw, street, ward, district, deal, area_m2, price_raw, price_vnd, bedrooms, property_type, gap, negotiable, furnishing, floor, rear_width_m, nhan, rent_income_vnd, ${SPEC_COLS}`;

export type TinNhapRow = SpecRow & {
  code?: string | null;
  location_raw?: string | null;
  street?: string | null; // SRS-5.1zzzzj: tên đường từ điển, in thay chữ khách
  ward?: string | null;
  district?: string | null;
  deal?: string | null;
  area_m2?: number | string | null;
  price_raw?: string | null;
  bedrooms?: number | null;
  property_type?: string | null;
  gap?: boolean | null;
  negotiable?: boolean | null;
  furnishing?: string | null;
  floor?: number | null;
  rear_width_m?: number | null;
  /** FR-211: nhãn tìm kiếm (khoá từ điển `extraction/nhan.ts`). */
  nhan?: string[] | null;
  /** Tin BÁN đang cho thuê: tiền thuê mỗi tháng (trigger đọc từ fact `doanh_thu`). */
  rent_income_vnd?: number | string | null;
};

export type FactNhap = { question: string; answer: string | null };

export type ThamSoNhap = {
  l: TinNhapRow;
  /** MỚI NHẤT trước — lấy câu trả lời mới nhất mỗi khoá. */
  facts: FactNhap[];
  diem: number;
  thieu: string[];
  soAnh: number;
  /** Gửi lại sau khi sửa theo lời chủ nhà (đổi câu hỏi cuối). */
  lai: boolean;
  /** 24/09/2026: chủ nói "đăng đi" và tin đã lên kệ — tiêu đề "đã lên kệ", KHÔNG hỏi duyệt lại. */
  daDang?: boolean;
  /** SRS-5.1zzzzzq: khách xin xem lại nội dung tin — dòng đầu thay tiêu đề mặc định ("📋 Bên em sẽ đăng như vậy nhé bác:"). */
  tieuDeDau?: string | null;
  /** SRS-5.1zzzzzl: tiêu đề chủ nhà gửi lúc duyệt (`boc_tach.tieu_de_khach`, đã qua kiểm trích dẫn) — in thay tiêu đề bot viết. */
  tieuDeKhach?: string | null;
  /** SRS-5.1zzzzzr: tiêu đề AI viết (đã qua `tieuDeHopLe`) — dùng khi chủ nhà không đưa tiêu đề. */
  tieuDeAi?: string | null;
  /** SRS-5.1zzzzzl: câu khen AI viết (đã qua `khenHopLe` + lượt soát) — mở đầu bong bóng thứ hai. */
  khen?: string | null;
  /** SRS-5.1zzzzzn: ý thêm (`bo_sung`) AI xếp là QUY MÔ / không gian căn ("nhà bếp - phòng khách rộng", "sân rộng") — in ở dòng Quy mô. */
  quyMo?: string[];
  /** SRS-5.1zzzzzo: ý thêm AI xếp là tiện ích / xung quanh (chỉ nhận ý có trong danh sách ý thêm) → phần tiện ích đầu dòng 📝 Thêm (SRS-5.1zzzzzzj). */
  tienIch?: string[];
  /**
   * SRS-5.1zzzzzz: tiện ích AI CHỌN LỌC (tối đa 4, đã qua `tienIchNoiBatHopLe`): `goc` = ý thêm gốc, `in` = chữ in gọn. Có danh sách này thì phần
   * tiện ích chỉ in các ý được chọn (thay cho toàn bộ ý thêm xếp tiện ích); không có (AI không chạy / dưới 4 ý) → in đủ như cũ. DB vẫn giữ đủ mọi ý.
   */
  tienIchNoiBat?: Array<{ goc: string; in: string }>;
  cauTD:(khoa: string, o?: Record<string, string | number | null | undefined>) => string;
  /** SRS-5.1zzzzzzz26: tin chưa đủ điểm lên kệ — câu thay cho câu hỏi duyệt (không xin gật, không hứa báo khách). */
  chuaDuDang?: string | null;
};

export const LOAI_VI: Record<string, string> = {
  nha_pho: "Nhà phố", nha_cap4: "Nhà cấp 4", chung_cu: "Căn hộ", dat: "Đất",
  biet_thu: "Biệt thự", phong_tro: "Phòng trọ", mat_bang: "Mặt bằng",
  toa_nha: "Toà nhà / CHDV", dat_nong_nghiep: "Đất nông nghiệp",
  dat_kinh_doanh: "Đất kinh doanh", kho_xuong: "Kho xưởng",
};

// Chữ trong TIÊU ĐỀ ngắn hơn trong khối thông số — tiêu đề chỉ có một dòng.
const LOAI_TIEU_DE: Record<string, string> = {
  nha_pho: "nhà", nha_cap4: "nhà cấp 4", chung_cu: "căn hộ", dat: "đất",
  biet_thu: "biệt thự", phong_tro: "phòng trọ", mat_bang: "mặt bằng",
  toa_nha: "toà nhà", dat_nong_nghiep: "đất nông nghiệp",
  dat_kinh_doanh: "đất kinh doanh", kho_xuong: "kho xưởng",
};

/** FR-236: loại BĐS đọc thường cho câu "Tin {loai} mình lên kệ" — tin đất không được gọi là "tin nhà". */
export const loaiDoc = (pt: string | null | undefined): string => LOAI_TIEU_DE[pt ?? ""] ?? "nhà";

const DUONG_VAO_TIEU_DE: Record<string, string> = {
  mat_tien: "mặt tiền", hem_xe_hoi: "hẻm xe hơi", hem_xe_may: "hẻm", hem: "hẻm",
};

const PHAP_LY_TIEU_DE: Record<string, string> = {
  so_hong_rieng: "SHR", so_do_rieng: "SHR", so_chung: "sổ chung",
  hdmb: "HĐMB", giay_tay: "giấy tay", dang_cho_so: "đang chờ sổ",
};

const boDau = (s: string): string =>
  s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");

const so = (x: number | string): string => String(Number(x));

/**
 * Địa chỉ in cho khách từ các mảnh (mảnh đầu = `location_raw` nguyên văn). SRS-5.1zzzzj: không còn luật riêng — mảnh đầu qua
 * `duongHienThi` (cắt đuôi phường / quận khách gõ kèm, chuẩn từ loại), các mảnh sau là cột chuẩn; ghép bỏ trùng (`ghepDiaChi`).
 */
export function diaChiGon(...manh: Array<string | null | undefined>): string {
  return ghepDiaChi(duongHienThi(manh[0]), ...manh.slice(1));
}

/** "Phường 3" → "P.3"; "Quận 5" → "Q.5"; tên chữ giữ nguyên (mogi viết vậy). */
function gonHanhChinh(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const kd = boDau(t);
  const soHc = kd.replace(/\D+/g, "");
  if (/^phuong\s*0*\d{1,2}$/.test(kd)) return `P.${soHc}`;
  if (/^quan\s*0*\d{1,2}$/.test(kd)) return `Q.${soHc}`;
  return t;
}

/**
 * TIÊU ĐỀ kiểu tin lẻ mogi: một dòng, gộp thứ đáng tiền, KẾT bằng giá.
 * Chỉ ghép từ cột + fact; thiếu phần nào thì bỏ phần đó.
 */
/** Giá in lên tin. 27/09/2026 (bắn thật lx-36): "Giá 8.000.000.000" → bản nháp in nguyên dãy số; nay "8 tỷ" (`donViGiaDep`). */
export function giaHienThi(l: Pick<TinNhapRow, "price_raw">): string | null {
  return l.price_raw ? donViGiaDep(l.price_raw) : null;
}

/**
 * SRS-5.1zzzzy (khách mô phỏng 11/10: "hẻm khoảng 2-3 mét" → tin in "hẻm 2m"): cột `alley_width_m` là MỘT số (số đầu của khoảng); tin
 * in đúng khoảng khách nói khi fact độ rộng là khoảng bắt đầu bằng đúng số trong cột. Một chỗ cho tiêu đề và dòng đường vào.
 */
function rongDuongVao(l: Pick<TinNhapRow, "alley_width_m">, fact: (k: string) => string | null): string | null {
  if (!l.alley_width_m) return null;
  const f = boDau(fact("do_rong_hem") ?? fact("do_rong_duong") ?? "");
  const m = /(\d+(?:[.,]\d+)?)\s*(?:m|met)?\s*(?:-|–|den|toi)\s*(\d+(?:[.,]\d+)?)/.exec(f);
  const a = m ? Number(m[1].replace(",", ".")) : NaN;
  return m && a === Number(l.alley_width_m) ? `${so(a)}-${so(m[2].replace(",", "."))}m` : `${so(l.alley_width_m)}m`;
}

/** "Phường Bình Hưng Hòa" → "Bình Hưng Hòa"; "Phường 3" → "P.3" — tên khu vực trong tiêu đề "Chỉ X tỷ … tại …". */
function tenKhuVuc(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  if (/^(?:phuong|quan)\s*0*\d{1,2}$/.test(boDau(t))) return gonHanhChinh(t);
  return t.replace(/^(?:phường|quận|xã|thị trấn|huyện|thành phố|tp\.?)\s+/iu, "").trim() || t;
}

// Cụm "ô tô tận cửa" chủ nhà tự viết — tiêu đề lấy NGUYÊN chữ khách (không dịch "hẻm xe hơi" thành "tận cửa": hẻm xe hơi chưa chắc
// xe vào tới cửa).
const O_TO_TAN_CUA = /(?:ô\s*tô|oto|xe\s+hơi)\s+(?:vào\s+|đỗ\s+|đậu\s+)?(?:tận|tới|trước)\s+(?:cửa|nhà)/iu;

/**
 * SRS-5.1zzzzzl (chủ dự án 13/10/2026: "Em sẽ rao như vậy nhé. Chỉ 7.6 tỉ ô tô tận cửa"): điểm mạnh đặt sau giá trong tiêu đề — chỉ lấy
 * từ dữ liệu khách đã nói: cụm "ô tô tận cửa" nguyên văn trong fact, không có thì loại đường vào mặt tiền / hẻm xe hơi. Không đoán.
 */
function diemManhTieuDe(l: TinNhapRow, facts: FactNhap[]): string | null {
  for (const f of [...facts, { question: "vi_tri", answer: l.location_raw ?? null }]) {
    const m = f.answer ? O_TO_TAN_CUA.exec(f.answer) : null;
    if (m) return m[0].toLocaleLowerCase("vi").replace(/\s+/g, " ");
  }
  // Căn hộ: "mặt tiền / hẻm xe hơi" là đường vào CẢ TOÀ, không phải điểm mạnh của căn (bản nháp 14/10 "căn hộ mặt tiền tại Tân Nhựt").
  if (l.property_type === "chung_cu") return null;
  return l.access_type === "mat_tien" || l.access_type === "hem_xe_hoi" ? DUONG_VAO_TIEU_DE[l.access_type] : null;
}

/**
 * SRS-5.1zzzzzzz19 (chủ dự án 14/10/2026: "nhà ở dự án thì phải nêu tiêu đề là tên dự án ra, tên chung cư ra chứ không phải địa chỉ"): tên
 * chung cư / dự án của căn hộ (ô `du_an_ten` — lời chủ nhà, hoặc tên dự án kho đã gắn, chat-reply nạp vào cùng ô). Bỏ chữ dẫn "dự án /
 * chung cư" khách gõ kèm. Không phải căn hộ hoặc chưa có tên → null.
 */
export function tenChungCuTieuDe(l: Pick<TinNhapRow, "property_type">, fact: (k: string) => string | null): string | null {
  if (l.property_type !== "chung_cu") return null;
  const ten = (fact("du_an_ten") ?? "").replace(/^\s*(?:dự án|du an|chung cư|chung cu|khu căn hộ|cc)\s+/iu, "").replace(/\s+/g, " ").trim();
  return ten.length >= 2 ? ten : null;
}

/**
 * TIÊU ĐỀ bản nháp. SRS-5.1zzzzzl (chủ dự án chọn "Cả hai"): tin bán có giá → "Chỉ {giá} {điểm mạnh} tại {phường}, {quận}"; chủ nhà
 * gửi tiêu đề riêng (`tieuDeKhach`, đã qua kiểm trích dẫn) thì in đúng câu đó. Tin cho thuê / chưa có giá giữ kiểu tin lẻ mogi.
 */
export function tieuDeTin(l: TinNhapRow, fact: (k: string) => string | null, facts: FactNhap[] = [], tieuDeKhach?: string | null): string {
  const tdk = (tieuDeKhach ?? "").replace(/\s+/g, " ").trim();
  if (tdk) return tdk;
  const giaBan = l.deal !== "cho_thue" ? giaHienThi(l)?.replace(/\s*\(?\s*(?:còn\s+)?(?:thương lượng|tl|còn bớt|fix|cố định)\b.*$/iu, "").trim() : null;
  // Căn hộ có tên dự án: tiêu đề nêu TÊN DỰ ÁN thay cho phường / địa chỉ (quận giữ để khách lọc khu vực).
  const tenDA = tenChungCuTieuDe(l, fact);
  if (giaBan && tenDA) {
    const q = tenKhuVuc(l.district);
    return `Chỉ ${giaBan} căn hộ ${tenDA}${l.bedrooms ? ` ${l.bedrooms}PN` : ""}${l.gap === true ? " cần bán gấp" : ""}${q ? ` tại ${q}` : ""}`.replace(/\s+/g, " ").trim();
  }
  if (giaBan) {
    const loaiChen = l.property_type && l.property_type !== "nha_pho" ? ` ${LOAI_TIEU_DE[l.property_type] ?? ""}`.trimEnd() : "";
    const dm = diemManhTieuDe(l, facts);
    const kv = [...new Set([tenKhuVuc(l.ward), tenKhuVuc(l.district)].filter((x): x is string => !!x))].join(", ");
    // Cột `gap` chỉ hiện ở tiêu đề (dòng thông số không có) — giữ "cần bán gấp" như tiêu đề kiểu cũ.
    return `Chỉ ${giaBan}${loaiChen}${dm ? ` ${dm}` : ""}${l.gap === true ? " cần bán gấp" : ""}${kv ? ` tại ${kv}` : ""}`.replace(/\s+/g, " ").trim();
  }
  return tieuDeTinLe(l, fact);
}

/** Tiêu đề kiểu tin lẻ mogi (tin cho thuê / chưa có giá): một dòng, gộp thứ đáng tiền, KẾT bằng giá. */
export function tieuDeTinLe(l: TinNhapRow, fact: (k: string) => string | null): string {
  const thue = l.deal === "cho_thue";
  // Tách CỤM bằng dấu phẩy, đúng thứ tự người ta đọc một tin rao: chỗ nào →
  // bao nhiêu m² → nhà thế nào → giấy tờ → giá. Nhét hết vào một chuỗi dài
  // không dấu phẩy thì đọc như máy đọc ("Bán nhà trệt + 2 lầu 3PN hẻm…").
  const vitri: string[] = [thue ? "Cho thuê" : "Bán", LOAI_TIEU_DE[l.property_type ?? ""] ?? "bất động sản"];
  // SRS-5.1zzzzzzz19: căn hộ có tên dự án → "Cho thuê căn hộ {dự án}, quận", không đường vào / địa chỉ / phường.
  const tenDA = tenChungCuTieuDe(l, fact);
  if (tenDA) vitri.push(tenDA);
  const duongVao = tenDA ? null : DUONG_VAO_TIEU_DE[l.access_type ?? ""] ?? null;
  const rong = rongDuongVao(l, fact);
  if (duongVao) vitri.push(duongVao + (rong ? ` ${rong}` : ""));
  // Đường/hẻm: lời chủ nhà nói, bỏ phần phường/quận vì đã có ở vế sau, và bỏ
  // chữ "hẻm xe hơi 5m" nếu vế đường vào ngay trên đã nói rồi.
  // Giữa câu tiêu đề: từ loại đầu chữ thường ("Bán nhà phố hẻm 45 …"), tên riêng giữ hoa.
  const duong = tenDA ? "" : duongGiuaCau(l.location_raw, l.street).split(",")[0].trim();
  if (duong) {
    // 01/10/2026 (bắn thật lx-tam-42): "12 hẻm 4m Trần Bình Trọng" — chữ "hẻm 4m" đứng SAU số nhà nên tiêu đề lặp "hẻm xe hơi 4m
    // 12 hẻm 4m …". Bề rộng hẻm (có "m") ở giữa câu cũng bỏ; "hẻm 45" (số hẻm, không "m") giữ.
    // SRS-5.1zzzzy (khách mô phỏng 11/10): "MT Trần Hưng Đạo" (địa chỉ chuẩn thành "Mặt tiền Trần Hưng Đạo") → tiêu đề "Bán nhà mặt tiền
    // mặt tiền Trần Hưng Đạo". Chữ đường vào ở ĐẦU địa chỉ (mặt tiền / MT / MTKD / hẻm…) đã nằm ở vế đường vào thì bỏ.
    const gon = duongVao
      ? duong.replace(/^(?:m[aặ]t\s+ti[eề]n(?:\s+kinh\s+doanh)?|mtkd|mt)\s+/iu, "")
        .replace(/^h[eẻ]m(\s+xe\s+h[oơ]i|\s+xe\s+m[aá]y)?\s*[\d.,]*\s*m?\s*/i, "")
        .replace(/(\s)h[eẻ]m(?:\s+xe\s+h[oơ]i|\s+xe\s+m[aá]y)?\s*\d+(?:[.,]\d+)?\s*m(?![\p{L}\d])\s*/iu, "$1").trim()
      : duong;
    vitri.push(gon || duong);
  }
  const hc = [tenDA ? null : gonHanhChinh(l.ward), gonHanhChinh(l.district)].filter(Boolean).join(" ");
  if (hc) vitri.push(hc);

  const cum: string[] = [vitri.join(" ")];
  if (l.area_m2 != null && l.area_m2 !== "") cum.push(`${so(l.area_m2)}m²`);
  const ketCau = l.floors_text ?? (l.floors ? `${l.floors} tầng` : null);
  if (ketCau) cum.push(ketCau);
  if (l.bedrooms) cum.push(`${l.bedrooms}PN`);
  // 24/09/2026 (bắn 10 tin): cột chỉ có "giay_tay" cho cả vi bằng — khách nói "vi bằng" thì in đúng chữ khách.
  const viBang = l.legal_status === "giay_tay" && /\bvi bang\b/.test(boDau(fact("phap_ly") ?? ""));
  const pl = viBang ? "vi bằng" : PHAP_LY_TIEU_DE[l.legal_status ?? ""] ?? null;
  if (pl) cum.push(pl);
  if (l.gap === true) cum.push(thue ? "cần cho thuê gấp" : "cần bán gấp");
  const gia = giaHienThi(l);
  const cumGia = gia ? `giá ${gia}${thue && !/thang/.test(boDau(gia)) ? "/tháng" : ""}` : null;
  const t = [...cum, ...(cumGia ? [cumGia] : [])].join(", ").replace(/\s+/g, " ").trim();
  if (t.length <= 120) return t;
  // 01/10/2026 (chủ dự án test Zalo: "…, SHR, cần bán…" — cắt đuôi làm mất GIÁ, thứ đáng tiền nhất): dài quá thì cắt phần
  // giữa, giữ nguyên ", giá X" ở cuối.
  const duoi = cumGia ? `, ${cumGia}` : "";
  const dau = cum.join(", ").replace(/\s+/g, " ").trim();
  return dau.slice(0, 117 - duoi.length).replace(/[\s,]+\S*$/, "") + "…" + duoi;
}

/**
 * SRS-5.1zzzzzzz8 (chủ dự án test Zalo 14/10/2026 16:38: "lấy tên chung cư bỏ lên trên tiêu đề đi em … thường đăng chung cư thì phải có đi kèm
 * tên chung cư á"): tiêu đề căn hộ có tên chung cư (ô `du_an_ten`). Một chỗ chèn cho cả tiêu đề code ghép lẫn tiêu đề AI viết; tên đã có
 * trong tiêu đề thì giữ nguyên. Bỏ chữ dẫn "dự án / chung cư" khách gõ kèm để không thành "căn hộ chung cư dự án …".
 */
/**
 * SRS-5.1zzzzzzz13: tên dự án KHO (bảng `projects`, nạp từ web — còn mã HTML như "Chung Cư CONIC &#8211; Đông Nam Á") thành chữ in được cho
 * bản nháp. Rỗng / quá dài → null (không in).
 */
export function tenDuAnKho(ten: string | null | undefined): string | null {
  const t = String(ten ?? "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ").trim();
  return t.length >= 2 && t.length <= 80 ? t : null;
}

export function themTenChungCu(tieuDe: string, l: Pick<TinNhapRow, "property_type">, fact: (k: string) => string | null): string {
  if (l.property_type !== "chung_cu") return tieuDe;
  const ten = (fact("du_an_ten") ?? "").replace(/^\s*(?:dự án|du an|chung cư|chung cu|khu căn hộ|cc)\s+/iu, "").replace(/\s+/g, " ").trim();
  if (!ten || boDau(tieuDe).includes(boDau(ten))) return tieuDe;
  if (/căn hộ|chung cư/iu.test(tieuDe)) return tieuDe.replace(/căn hộ|chung cư/iu, (m) => `${m} ${ten}`);
  return `Căn hộ ${ten}, ${tieuDe.charAt(0).toLocaleLowerCase("vi")}${tieuDe.slice(1)}`;
}

/** Bản nháp đầy đủ — một chuỗi, mỗi dòng một ý (giống một tin rao thật). */
export function soanTinNhap(t: ThamSoNhap): string {
  const { than, duoi, hoi } = soanTinNhapHaiBong(t);
  return [than, duoi, hoi].filter(Boolean).join("\n");
}

/**
 * 13/10/2026 (chủ dự án, ảnh Zalo: "cái chỗ độ đầy đủ trở xuống cho xuống bong bóng chat thứ 2"): bản nháp gửi HAI bong bóng —
 * `than` là tin rao (📋 … dòng thông số / ảnh), `duoi` là phần nói với chủ nhà (điểm đầy đủ + gợi ý, câu hỏi duyệt, lời hứa báo lại).
 * Tách theo VỊ TRÍ dòng trong hàm dựng, không theo chữ "Độ đầy đủ" (câu tiền định sửa được ở dashboard).
 */
export function soanTinNhapHaiBong(t: ThamSoNhap): { than: string; duoi: string; hoi: string } {
  const { l, facts, diem, thieu, soAnh, lai, cauTD, daDang, tieuDeKhach, tieuDeAi, khen, quyMo, tienIch: tienIchAi, tienIchNoiBat, tieuDeDau, chuaDuDang } = t;
  const fact = (k: string) => facts.find((f) => f.question === k)?.answer ?? null;
  // Dán nhãn mà không lặp chữ: "thuê tối thiểu 3 năm" đã có nhãn thì không thành
  // "thuê tối thiểu thuê tối thiểu 3 năm". So theo TỪNG CHỮ của nhãn.
  const coChu = (v: string, n: string) =>
    boDau(n).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 2)
      .some((w) => new RegExp(`\\b${w}`).test(boDau(v)));
  // FR-239 j (phát lại test 27/09): AI ghi "Còn 4 năm" → dòng in "hợp đồng Còn 4 năm". Giá trị đứng SAU nhãn mà mở bằng
  // từ thường viết hoa đầu câu thì hạ chữ đầu; tên riêng ("Sacombank", "Vinhomes") không đụng.
  const thuongDau = (v: string) =>
    /^(?:Còn|Khoảng|Tầm|Hết|Đến|Tới|Được|Có|Không|Chưa|Đã|Hơn|Gần|Trên|Dưới|Tới)(?=\s|$)/u.test(v) ? v.charAt(0).toLocaleLowerCase("vi") + v.slice(1) : v;
  const nhan = (n: string, v: string | null, sep = " ") => v ? (coChu(v, n) ? v : `${n}${sep}${thuongDau(v)}`) : null;
  const hau = (v: string | null, n: string) => v ? (coChu(v, n) ? v : `${v} ${n}`) : null;
  const loai = l.property_type ?? "";
  const thue = l.deal === "cho_thue";
  const dong: string[] = [];
  const them = (icon: string, ten: string, phan: Array<string | null | undefined | false>) => {
    // Chủ nhà nhắn "để ở hoặc cho thuê đều được em" → tin rao không được in
    // "Phù hợp: … đều được em" (lượt bắn 12/09). Bỏ tiểu từ chat ở đuôi.
    const p = phan.filter((x): x is string => !!x && String(x).trim().length > 0)
      // 25/09/2026 (chủ dự án test Zalo): "sang tên ngay và luôn" in thành "sang tên ngay và" — "và luôn" là thành ngữ, giữ.
      .map((x) => String(x).replace(/(?:[\s,]+(?:em|anh|chị|nha|nhé|nhe|nhen|ạ|(?<!\svà\s)luôn|đó|á|nghen|thôi))+\s*[.!]*$/iu, "").trim())
      .filter(Boolean);
    if (p.length) dong.push(`${icon} ${ten}: ${p.join(" · ")}`);
  };

  dong.push(tieuDeDau?.trim() ? tieuDeDau.trim() : cauTD(daDang ? "nhap_da_dang" : "nhap_tieu_de", { loai: loaiDoc(l.property_type) }));
  const tdKhach = (tieuDeKhach ?? "").trim();
  // SRS-5.1zzzzzzz19: căn hộ có tên dự án → tiêu đề code ghép (tên dự án), không dùng tiêu đề AI (hay kéo địa chỉ đường vào).
  const td = tieuDeTin(l, fact, facts, tdKhach || (tenChungCuTieuDe(l, fact) ? null : tieuDeAi) || null);
  // Tiêu đề khách tự đặt giữ nguyên chữ khách; tiêu đề máy / AI viết thì căn hộ phải mang tên chung cư (SRS-5.1zzzzzzz8).
  dong.push(tdKhach ? td : themTenChungCu(td, l, fact));
  // Chủ nhà gõ "hẻm 5m Nguyễn Trãi" thì địa chỉ mở đầu bằng chữ thường — một
  // tin rao thật không bắt đầu bằng chữ thường.
  const dc = diaChiHienThi(l);
  // SRS-5.1zzzzzzz3: căn hộ có địa chỉ đường VÀ tên chung cư (ô `du_an_ten`) — in cả hai; tên đã nằm trong địa chỉ thì không lặp.
  const duAn = loai === "chung_cu" ? fact("du_an_ten") : null;
  const duAnIn = duAn && !boDau(dc).includes(boDau(duAn).trim()) ? ` · ${duAn}` : "";
  dong.push(`📍 ${dc.charAt(0).toLocaleUpperCase("vi") + dc.slice(1)}${duAnIn}${fact("khu_compound") ? ` · ${fact("khu_compound")}` : ""}`);
  // SRS-5.1zzzzzo (chủ dự án 13/10/2026: "giá để ở cuối cùng"): dòng giá soạn ở đây, in ở CUỐI thân tin (bản 09/09 để ngay dưới địa chỉ).
  let dongGia: string | null = null;
  const gia = giaHienThi(l);
  if (gia) {
    const giaDaNoi = /thuong luong|\btl\b|con bot|fix|co dinh/.test(boDau(gia));
    const tl = giaDaNoi
      ? ""
      : l.negotiable === true || /thuong luong|\btl\b|con bot|fix/.test(boDau(fact("thuong_luong") ?? ""))
      ? " (còn thương lượng)"
      : l.negotiable === false
      ? " (giá cố định)"
      : "";
    // SRS-5.1zzzzzr (chủ dự án 13/10: "Giá để dưới cùng in đậm lên"): Zalo không in đậm chữ thường được → in HOA cả dòng giá cho nổi.
    const giaNoi = `${gia}${thue && !/thang/.test(boDau(gia)) ? "/tháng" : ""}`.toLocaleUpperCase("vi");
    dongGia = `💰 GIÁ ${giaNoi}${tl}${
      fact("ly_do_ban") ? ` · lý do bán: ${fact("ly_do_ban")}` : ""
    }`;
  }
  // SRS-5.1zzzzzl (chủ dự án 13/10: "Ko ghi ngang ghi mặt tiền, Mặt tiền đi chung với tiện ích" — chọn "Gộp chung một dòng"): bề ngang
  // in là "mặt tiền Nm" ở dòng 🏫 Tiện ích; dòng diện tích còn diện tích, dài, nở hậu, thổ cư, hình dạng.
  // SRS-5.1zzzzzx: chỉ in từ CỘT `frontage_m` (số đã qua trigger kiểm) — fact "mat_tien" thô mà DB không nhận (vd "80m" đọc nhầm từ diện tích) không in.
  const matTien = l.frontage_m ? `mặt tiền ${so(l.frontage_m)}m` : "";
  them("📐", "Diện tích", [
    l.area_m2 != null && l.area_m2 !== ""
      ? `${so(l.area_m2)}m²`
      : (fact("dien_tich") ?? fact("dien_tich_dat") ?? fact("dien_tich_tim_tuong")),
    l.length_m ? `dài ${so(l.length_m)}m` : null,
    l.rear_width_m ? `nở hậu ${so(l.rear_width_m)}m` : fact("no_hau") ? `nở hậu ${fact("no_hau")}` : null,
    nhan("thổ cư", fact("tho_cu")),
    fact("hinh_dang"),
  ]);
  // 17/09/2026 (chủ dự án): "các trường mà khách nói bổ sung sẽ ghi vào mô tả" — mọi fact
  // `bo_sung` (AI đọc thêm hay chủ nhà nói lệch câu hỏi) vào một dòng, cũ trước, không lặp.
  const boSung: string[] = [];
  const factMap: Record<string, string> = {};
  for (const f of facts) if (f.answer && f.question !== "bo_sung") factMap[f.question] = f.answer;
  const nhanKd = (l.nhan ?? []).map((k) => boDau(tenNhan([k])));
  for (const f of [...facts].reverse()) {
    const a = (f.question === "bo_sung" ? f.answer : null)?.replace(/\s+/g, " ").trim();
    // 25/09/2026: mảnh chỉ nói lại ô đã có (kết cấu / đường vào / sổ) hoặc trùng nhãn thì không in lại — lọc cả dữ liệu cũ.
    if (!a || laBoSungTrung(a, { facts: factMap, floors_text: l.floors_text, access_type: l.access_type, alley_width_m: l.alley_width_m, legal_status: l.legal_status, nhan: l.nhan ?? [], rear_width_m: l.rear_width_m })) continue;
    const aKd = boDau(a).replace(/^(?:co|nha co|can co)\s+/, "");
    if (nhanKd.some((n) => n === aKd)) continue;
    if (!boSung.some((x) => boDau(x) === boDau(a))) boSung.push(a);
  }
  // SRS-5.1zzzzzn (chủ dự án 13/10/2026, ảnh bản nháp Hóc Môn: "kết cấu sửa thành quy mô, Nhà bếp - Phòng khách rộng · sân rộng thì sẽ đưa
  // lên chỗ quy mô, còn mới, hiện đang ở đưa xuống chỗ mô tả thêm"): dòng "Quy mô" = số tầng / phòng / WC / sân… + ý thêm AI xếp là không gian
  // (`quyMo`, chỉ nhận ý có đúng trong danh sách ý thêm); tình trạng nhà + hiện trạng sử dụng xuống dòng "Thêm".
  const laQuyMo = new Set((quyMo ?? []).map(chuanY));
  // SRS-5.1zzzzzz: ý AI chọn lọc cũng là tiện ích (kể cả khi AI quên xếp nó vào `tien_ich`).
  const laTienIch = new Set([...(tienIchAi ?? []), ...(tienIchNoiBat ?? []).map((x) => x.goc)].map(chuanY));
  const boSungQuyMo = boSung.filter((x) => laQuyMo.has(chuanY(x)));
  const boSungTienIch = boSung.filter((x) => !boSungQuyMo.includes(x) && laTienIch.has(chuanY(x)));
  const boSungThem = boSung.filter((x) => !boSungQuyMo.includes(x) && !boSungTienIch.includes(x));
  them("🏗", "Quy mô", [
    l.floors_text ?? (l.floors ? `${l.floors} tầng` : fact("ket_cau")),
    nhan("toà", fact("toa_thap")),
    l.floor ? `tầng ${l.floor}` : nhan("tầng", fact("tang")),
    l.bedrooms ? `${l.bedrooms} phòng ngủ` : hau(fact("so_phong_ngu"), "phòng ngủ"),
    l.bathrooms ? `${l.bathrooms} WC` : hau(fact("so_wc"), "WC"),
    nhan("thang máy:", fact("thang_may")),
    nhan("sân vườn:", fact("san_vuon")),
    ...boSungQuyMo,
    nhan("xây", fact("nam_xay")),
    nhan("căn góc:", fact("can_goc")),
    nhan("view:", fact("view")),
  ]);
  them("🛣", "Đường vào", [
    l.access_type
      ? thongSoNgan({ access_type: l.access_type, alley_width_m: null } as SpecRow).replace(/^ · /, "") + (rongDuongVao(l, fact) ? ` ${rongDuongVao(l, fact)}` : "")
      : (fact("do_rong_hem") ?? fact("do_rong_duong") ?? fact("duong_vao")),
    nhan("cách mặt tiền", fact("cach_mat_tien")),
    fact("hem_thong"),
    nhan("ngập nước:", fact("ngap_nuoc")),
    fact("ha_tang"),
    nhan("container:", fact("duong_container")),
  ]);
  // FR-236: luật ghi nguyên cụm khách gõ ("hướng đông") → "🧭 Hướng: hướng đông". Bỏ chữ "hướng" lặp, viết hoa đầu.
  const huong = (l.direction ?? fact("huong") ?? "").replace(/^\s*hướng\s+/iu, "").trim();
  them("🧭", "Hướng", [huong ? huong.charAt(0).toLocaleUpperCase("vi") + huong.slice(1) : null]);
  them("📜", "Pháp lý", [
    l.legal_status === "giay_tay" && /\bvi bang\b/.test(boDau(fact("phap_ly") ?? ""))
      ? "vi bằng"
      : l.legal_status
      ? thongSoNgan({ legal_status: l.legal_status, has_completion: l.has_completion } as SpecRow).replace(/^ · /, "")
      : fact("phap_ly"),
    nhan("quy hoạch:", fact("quy_hoach")),
    // 27/09/2026 (test Zalo, đất Cần Đước): dòng pháp lý in trơn "· tự do · ko có gì hết" — không biết là gì. Gắn nhãn.
    nhan("sổ:", fact("the_chap")),
    nhan("xây:", fact("xay_dung")),
    fact("so_huu"),
    fact("thoi_han_su_dung"),
    fact("hinh_thuc_thue_dat"),
    nhan("lên thổ cư:", fact("len_tho_cu")),
  ]);
  // 24/09/2026 (chủ dự án: "Tiền thuê ghi vào"): tin BÁN đang cho thuê in tiền thuê mỗi tháng (cột đã đọc ra số,
  // không in nguyên câu chat) + hạn hợp đồng. Toà nhà / kho xưởng in trong khối khai thác bên dưới.
  const tienThue = Number(l.rent_income_vnd ?? 0) > 0 ? `${vndThanhChu(Number(l.rent_income_vnd))}/tháng` : null;
  // SRS-5.1zzzzzl (test Zalo 13/10: khách "đang ở không cho thuê" → bản nháp vẫn in "💵 Đang cho thuê: hợp đồng đang ở không cho thuê"):
  // dòng này chỉ in khi nhà ĐANG cho thuê theo cùng một chủ với bảng rẽ nhánh (`dangChoThue`, ô hien_trang_su_dung quyết), không vì ô
  // hợp đồng có chữ.
  const choThueThat = fact("hien_trang_su_dung")
    ? dangChoThue({ loai, deal: l.deal ?? null, facts, rent_income_vnd: l.rent_income_vnd, aiDoc: true })
    : Number(l.rent_income_vnd ?? 0) > 0 || !!fact("han_hop_dong_thue");
  if (!thue && loai !== "toa_nha" && loai !== "kho_xuong" && choThueThat) {
    them("💵", "Đang cho thuê", [tienThue, nhan("hợp đồng", fact("han_hop_dong_thue"))]);
  }
  if (loai === "toa_nha" || loai === "kho_xuong") {
    them("🏢", loai === "toa_nha" ? "Khai thác" : "Kho xưởng", [
      hau(fact("so_phong"), "phòng"),
      nhan("lấp đầy", fact("ty_le_lap_day")),
      tienThue ? `thu ${tienThue}` : fact("doanh_thu"),
      nhan("PCCC:", fact("pccc")),
      nhan("cao", fact("chieu_cao")),
      nhan("tải trọng", fact("tai_trong_san")),
      nhan("điện", fact("tram_bien_ap")),
      nhan("nước thải:", fact("xu_ly_nuoc_thai")),
    ]);
  }
  if (loai === "dat_nong_nghiep" || loai === "dat_kinh_doanh") {
    them("🌱", "Đất", [
      nhan("nước:", fact("nguon_nuoc")),
      nhan("ranh:", fact("ranh_gioi")),
      nhan("mật độ XD", fact("mat_do_xd")),
      fact("tang_cao_toi_da") ? `xây tối đa ${hau(fact("tang_cao_toi_da"), "tầng")}` : null,
    ]);
  }
  // FR-241 j (10 ca test làm khó 28/09): khách gõ "dang o" → bản tin in "🛋 Nội thất: hiện: dang o" — hiện trạng sử dụng không phải
  // nội thất, và chữ không dấu in nguyên. Tách dòng riêng; mấy cụm hiện trạng quen gõ không dấu thì in có dấu.
  // SRS-5.1zzzzzo (chủ dự án 13/10/2026: "cái gì ko có thì ko được ghi vào, sao nó lại ghi thêm nội thất"; bản nháp in "🛋 Nội thất: khong"): mã
  // cột in thành chữ, "không có nội thất" thì không in dòng nào.
  them("🛋", "Nội thất", [l.furnishing === "khong" ? null : l.furnishing === "full" ? "đầy đủ" : l.furnishing === "co_ban" ? "cơ bản" : l.furnishing ?? fact("noi_that")]);
  // SRS-5.1zzzzz (khách mô phỏng 11/10: "🏗 Kết cấu: … · cũ, còn sử dụng được" + "🏠 Hiện trạng: bác cũ rồi nhưng còn sử dụng được"): một ý
  // một dòng — hiện trạng sử dụng cùng ý tình trạng nhà đã in ở dòng kết cấu thì không in lần hai.
  // SRS-5.1zzzzzo ("hiện trạng trống chứ chữ trống ko ai đọc mà hiểu được"): hiện trạng sử dụng in kèm nhãn khi chữ chưa tự nói nó là gì.
  const htSuDung0 = chuanHienTrang(fact("hien_trang_su_dung"));
  const htSuDung = htSuDung0 && !/^hiện\s*trạng/iu.test(htSuDung0) ? `hiện trạng ${htSuDung0.charAt(0).toLowerCase()}${htSuDung0.slice(1)}` : htSuDung0;
  const htNha = fact("hien_trang");
  if (thue) {
    them("📝", "Điều kiện thuê", [
      // SRS-5.1zzzzzu (chủ dự án 13/10: "Điều kiện thuê là cọc 2 tháng chứ không phải là 2 tháng không"): ô cọc in kèm chữ "cọc" khi khách chỉ nói số.
      nhan("cọc", fact("tien_coc")),
      nhan("thuê tối thiểu", fact("thoi_han_thue")),
      nhan("tăng", fact("truot_gia")),
      nhan("sửa chữa miễn phí", fact("fit_out")),
      nhan("phí QL", fact("phi_quan_ly")),
      nhan("gửi xe", fact("phi_gui_xe")),
      nhan("điện nước", fact("gia_dien_nuoc")),
      fact("gio_giac"),
    ]);
  } else {
    them("🏢", "Phí", [nhan("phí QL", fact("phi_quan_ly")), nhan("gửi xe", fact("phi_gui_xe"))]);
  }
  // SRS-5.1zzzzzl: một dòng "🏫 Tiện ích: mặt tiền 6m · gần trường mầm non · chợ · công viên" — danh sách khách liệt kê bằng dấu phẩy
  // tách thành từng mục (chữ khách, không thêm bớt).
  const tienIch = (fact("tien_ich_gan") ?? "").split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean)
    .map((x, i) => i === 0 ? thuongDau(x).replace(/^Gần(?=\s)/u, "gần") : x);
  // SRS-5.1zzzzzz (chủ dự án 13/10: "Chọn lọc các tiện ích trong tin dự án để đưa ra ý ngon nghẻ"): có danh sách AI chọn lọc (đã kiểm) → ý thêm
  // tiện ích chỉ in các ý được chọn, bằng chữ gọn; ý không chọn vẫn nằm trong DB (fact `bo_sung`), không lên dòng này. Không có → in đủ như cũ.
  const chonLoc = (tienIchNoiBat ?? []).filter((x) => boSungTienIch.some((b) => chuanY(b) === chuanY(x.goc)));
  const yThemIn = chonLoc.length ? chonLoc.map((x) => x.in) : boSungTienIch;
  // SRS-5.1zzzzzzj (chủ dự án 14/10/2026: "để ô tiện ích và thêm gộp lại luôn"): MỘT dòng "📝 Thêm" — tiện ích đi trước (mặt tiền, tiện ích
  // khách liệt kê, ý thêm xếp tiện ích / chọn lọc), rồi tình trạng nhà, hiện trạng sử dụng, ý thêm còn lại. Không còn dòng 🏫 riêng.
  // SRS-5.1zzzzzzs (Zalo thật 14/10 11:47, tin Cao Lỗ): khách gửi bài rao HAI lần (lần đầu thiếu chữ "tỷ") → hai ý gần như một
  // ("Vị trí gần kề các trường Đại Học Lớn: …" / "Gần kề các trường Đại Học Lớn: …") cùng nằm trên dòng này. Một ý in một lần, ý đầu thắng.
  // So CHẶT (`gioiTrung`: ý ngắn nằm trọn trong ý dài và dài ≥ 80% ý dài) — `trungY` lỏng hơn, gộp nhầm "chợ" với "gần chợ Bình Tây".
  const gioiTrung = (a: string, b: string) => {
    const x = chuanY(a), y = chuanY(b);
    if (x === y) return true;
    const [ngan, dai] = x.length <= y.length ? [x, y] : [y, x];
    return ngan.length >= 12 && dai.includes(ngan) && ngan.length / dai.length >= 0.8;
  };
  const yDong: string[] = [];
  for (const y of [
    matTien, ...tienIch, ...yThemIn.filter((x) => !tienIch.some((t) => chuanY(t) === chuanY(x))),
    htNha, htSuDung0 && htNha && trungY(htSuDung0, htNha) ? null : htSuDung, ...boSungThem,
  ]) if (y && !yDong.some((d) => gioiTrung(d, y))) yDong.push(y);
  them("📝", "Thêm", yDong);
  // FR-211: nhãn tìm kiếm — khách mua lọc được ("yên tĩnh", "gần chợ"…).
  // 25/09/2026: nhãn mà các dòng trên đã nói ("sân thượng" trong kết cấu) không in lặp.
  them("🏷", "Nhãn", [l.nhan?.length ? tenNhanKhongTrung(l.nhan, dong.join("\n")) || null : null]);
  // Tiềm năng CHỈ khi chủ nhà nói (không bịa thay họ).
  them("💡", "Phù hợp", [fact("tiem_nang") ?? fact("muc_dich") ?? fact("nganh_hang_phu_hop")]);
  if (soAnh) dong.push(`📷 ${soAnh} ảnh`);
  if (dongGia) dong.push(dongGia);
  const hetThan = dong.length;
  // SRS-5.1zzzzzl: câu khen (AI viết, đã soát) mở đầu bong bóng thứ hai; không có thì thôi.
  if (khen?.trim()) dong.push(khen.trim());
  // Điểm đầy đủ đi CUỐI, chung một dòng với lời gợi ý — để trên câu mở thì tin
  // rao mở đầu bằng một con số nội bộ, không giống tin rao.
  // Gamification (chủ dự án 12/09: "để kích thích người ta đưa nhiều thông tin
  // để điểm bds cao hơn"): còn ĐÚNG một hai thứ thì nói thẳng thêm vào là đủ
  // 100/100 — thấy được đích thì người ta gửi nốt; thiếu dài thì nói chung.
  dong.push(
    !thieu.length
      ? cauTD("nhap_diem", { diem })
      : thieu.length <= 2
      ? cauTD("nhap_goi_y_tron", { diem, thieu: thieu.join(" và ") })
      : cauTD("nhap_goi_y", { diem, thieu: thieu.slice(0, 2).join(" và ") }),
  );
  // SRS-5.1zzzzzl (chủ dự án 13/10: "Điểm càng cao công ty càng ưu tiên chào bán"): khoá riêng — khoá điểm cũ có thể đã sửa ở DB.
  dong.push(cauTD("nhap_uu_tien"));
  // 13/10/2026 (chủ dự án: câu điểm "tách ra với câu dưới"): điểm + ưu tiên là một bong bóng, câu hỏi duyệt + lời hứa báo lại là bong bóng riêng.
  const hetDuoi = dong.length;
  // SRS-5.1zzzzzzz26: chưa đủ điểm lên kệ → câu "bản nháp soạn trước, chỉ cần thêm …" thay câu hỏi duyệt, và không hứa "có khách là báo".
  if (!daDang) dong.push(chuaDuDang?.trim() ? chuaDuDang.trim() : lai ? cauTD("nhap_sua_xong") : cauTD("nhap_hoi_duyet"));
  // FR-178: không đọc mã tin cho khách — mã chỉ ở web, CTV, admin.
  // 24/09/2026 (chủ dự án): lời hứa báo lại người rao đứng SAU CÙNG. Tin đã lên kệ (daDang) thì câu
  // `dang_luon_cuoi` nói đúng ý đó ngay sau — không lặp.
  if (!daDang && !chuaDuDang?.trim()) dong.push(cauTD("nhap_goi_hanh_dong"));
  return { than: dong.slice(0, hetThan).filter(Boolean).join("\n"), duoi: dong.slice(hetThan, hetDuoi).filter(Boolean).join("\n"), hoi: dong.slice(hetDuoi).filter(Boolean).join("\n") };
}
