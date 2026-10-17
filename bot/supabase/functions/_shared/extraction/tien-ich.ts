// tien-ich.ts — KHÁCH MUA MUỐN Ở GẦN GÌ (11/09/2026). Tầng tiền định, không model.
//
// Người dùng 11/09: "sau nếu có khách hỏi tôi muốn tìm nhà gần bệnh viện cách
// 1 km thì có thể tìm kiếm ra được". Câu đó đi qua `docGanTienIch` thành
// {loai, ten_re, m}; SQL `tin_gan_tien_ich` tìm tin trong m mét quanh một điểm
// OSM cùng loại (và cùng tên nếu khách nêu tên: "gần bv Chợ Rẫy").
//
// Luật hai chế độ như FR-161: khớp trên bản BỎ DẤU, nhưng chữ "cho" thì nhìn lại
// bản gốc — có dấu thì "chợ" khác "cho"; không dấu thì "cho con/em/mình…" là
// giới từ, không phải chợ.

export type LoaiTienIch = "benh_vien" | "truong_hoc" | "cho" | "sieu_thi" | "cong_vien";
/**
 * Mốc khách muốn ở gần: một LOẠI tiện ích OSM, một DỰ ÁN trong kho ("gần
 * Ehome 3"), hoặc một ĐỊA DANH bất kỳ ("gần chỗ làm ở Landmark 81"). Hai loại
 * sau chỉ model đọc ra (`_shared/ai/boc-gan.ts`) — regex ở đây chỉ bắt 5 loại.
 */
export type LoaiMoc = LoaiTienIch | "du_an" | "dia_diem";

export type GanTienIch = {
  loai: LoaiMoc;
  /** Tên khách nêu, để nói lại ("Chợ Rẫy"); null = loại nào cũng được. */
  ten: string | null;
  /** Regex trên `tien_ich.ten_kd` (bỏ dấu, thường, bỏ ký tự lạ). */
  ten_re: string | null;
  /** Bán kính, mét, trong [100, 3000]. */
  m: number;
};

export const TEN_LOAI: Record<LoaiMoc, string> = {
  benh_vien: "bệnh viện",
  truong_hoc: "trường học",
  cho: "chợ",
  sieu_thi: "siêu thị",
  cong_vien: "công viên",
  du_an: "dự án",
  dia_diem: "địa điểm",
};

/** Bán kính mặc định khi khách chỉ nói "gần", và khi nói "sát / kế bên". */
export const BAN_KINH_GAN_M = 1000;
const BAN_KINH_SAT_M = 300;
/** Bảng `tien_ich` chỉ nạp điểm trong 3 km quanh mỗi tin — xa hơn là tìm mù. */
export const BAN_KINH_TOI_DA_M = 3000;

// NFC trước: bản gõ tổ hợp (NFD) làm lệch vị trí giữa chữ gốc và chữ bỏ dấu.
const boDau = (s: string): string =>
  s.normalize("NFC").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Chuẩn tên để so: bỏ dấu, thường, bỏ ký tự lạ ("Co.opmart" → "coopmart"). */
export function kdTen(s: string): string {
  return boDau(s).replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
}

/** Thoát ký tự regex — tên khách gõ đi thẳng vào `~` của Postgres. */
export const thoatRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Chữ neo "gần" — loại tiện ích phải đứng ngay sau (cho phép vài chữ đệm và
// một cụm bán kính: "cách 1km tới bệnh viện").
const NEO_RE =
  /\b(gan|sat|canh|ke ben|ke|ben canh|doi dien|quanh|xung quanh|cach|di bo(?: (?:ra|toi|den|qua|sang))?)\s+((?:(?:ngay|khu|toi|den|ra|voi|nhat|lam|xiu|chut|may|cac|mot|vai)\s+|\d+(?:[.,]\d+)?\s*(?:km|m|met|cay so|cay)\s+){0,3})/g;
const NEO_SAT = /^(sat|canh|ke ben|ke|ben canh|doi dien)$/;

// Loại theo thứ tự thử. Mẫu siêu thị có nhãn hiệu → nhãn thành bộ lọc tên.
const LOAI_RE: Array<[LoaiTienIch, RegExp]> = [
  ["benh_vien", /^(?:benh vien|bv|nha thuong|trung tam y te|tram y te)\b/],
  ["truong_hoc", /^(?:truong(?: hoc)?|mam non|mau giao|nha tre)\b/],
  ["sieu_thi", /^(?:sieu thi|trung tam thuong mai|tttm|co\.?op ?mart|coop ?food|big ?c|go!|lotte(?: ?mart)?|aeon(?: mall)?|bach hoa xanh|win ?mart|vin ?mart|mega ?market|e ?mart|vincom|emart)\b/],
  ["cong_vien", /^cong vien\b/],
  ["cho", /^cho\b/],
];

// Loại trường → bộ lọc tên (OSM ghi "Trường THCS…" lẫn "Trung học cơ sở…").
const CAP_TRUONG: Array<[RegExp, string]> = [
  [/^(?:mam non|mau giao|nha tre)\b/, "mam non|mau giao|nha tre"],
  [/^(?:tieu hoc|cap (?:1|i|mot))\b/, "tieu hoc"],
  [/^(?:thcs|trung hoc co so|cap (?:2|ii|hai))\b/, "thcs|trung hoc co so"],
  [/^(?:thpt|trung hoc pho thong|cap (?:3|iii|ba))\b/, "thpt|trung hoc pho thong"],
  [/^(?:dai hoc|cao dang)\b/, "dai hoc|cao dang"],
  [/^quoc te\b/, "quoc te"],
];

// Chữ dừng khi nhặt TÊN sau loại (bản bỏ dấu). "cho" nằm đây vì không dấu thì
// nó hay là giới từ ("trường cho con"); "chợ" có dấu thì xét riêng.
const DUNG = new Set([
  "cach", "tam", "khoang", "trong", "duoi", "ban", "khong", "ko", "k", "nha", "nhe", "nhen", "a", "ah", "de",
  "cho", "thi", "la", "gia", "co", "duoc", "dc", "mua", "thue", "va", "hoac", "hay", "voi", "em", "anh", "chi",
  "minh", "toi", "con", "di", "khu", "quan", "q", "phuong", "p", "nao", "gi", "o", "tai", "gan", "can", "tim",
  "muon", "lam", "nhat", "xiu", "chut", "nua", "luon", "it", "nhieu", "tren", "sau", "truoc", "may", "nhu",
  "the", "vay", "roi", "nhung", "xin", "hoi", "ben", "sat", "ke", "canh", "doi", "dien", "quanh", "cung",
  "nhaa", "nha.", "vs", "ma", "neu", "ok", "oke", "ha", "hen", "ne", "nhe.", "tu", "den", "ra", "vao",
]);
// Tên chỉ gồm những chữ này thì không phải tên ("bệnh viện lớn").
const CHUNG_CHUNG = new Set(["lon", "to", "tot", "dep", "xin", "cong", "tu", "gan", "xa", "moi", "cu", "nho", "de", "uy", "tin"]);

// "không cần gần…", "ko quan trọng gần…" — khách đang GỠ điều kiện.
const PHU_DINH_RE = /\b(?:khong|ko|k|chang|cha)\s+(?:can|quan trong|thich|muon|bat buoc)\s*$/;

// Bán kính khách nói. Đơn vị mét cần số ≥ 100 hoặc có chữ dẫn ("trong 500m"):
// "hẻm 5m" không phải bán kính.
const BK_RE =
  /(?:\b(cach|trong vong|trong ban kinh|ban kinh|trong|duoi|tam|khoang|chung|toi da|khong qua)\s*)?(\d+(?:[.,]\d+)?)\s*(km|ki lo met|kilomet|cay so|cay|kilo|met|m)(?![a-z0-9²])/g;
const DI_BO_RE = /(?:(\d+)\s*phut\s*di bo|di bo\b[^.!?\d]{0,24}?(\d+)\s*phut)/;

function docBanKinh(khung: string): number | null {
  const d = DI_BO_RE.exec(khung);
  if (d) return Number(d[1] ?? d[2]) * 80; // đi bộ ~80 m/phút
  for (const m of khung.matchAll(BK_RE)) {
    const so = Number(m[2].replace(",", "."));
    const donVi = m[3];
    if (!Number.isFinite(so) || so <= 0) continue;
    if (/^(km|ki lo met|kilomet|cay so|cay|kilo)$/.test(donVi)) {
      if (so <= 10) return so * 1000;
      continue;
    }
    // mét: bỏ "50 mét vuông"
    const sau = khung.slice((m.index ?? 0) + m[0].length);
    if (/^\s*vuong/.test(sau)) continue;
    if (so >= 100 || (m[1] && so >= 50)) return so;
  }
  if (/\bdi bo\b/.test(khung)) return 800;
  return null;
}

const kep = (m: number) => Math.min(BAN_KINH_TOI_DA_M, Math.max(100, Math.round(m)));

/**
 * Đọc "gần <tiện ích> [tên] [bán kính]" trong một câu khách mua.
 * Không thấy (hoặc khách đang gỡ điều kiện) → null.
 */
export function docGanTienIch(text: string): GanTienIch | null {
  const goc = (text ?? "").normalize("NFC");
  const t = boDau(goc);
  if (t.length !== goc.length) return null; // phòng hờ: vị trí phải khớp 1-1
  for (const neo of t.matchAll(NEO_RE)) {
    const batDau = neo.index ?? 0;
    const viTriLoai = batDau + neo[0].length;
    const conLai = t.slice(viTriLoai);
    if (PHU_DINH_RE.test(t.slice(Math.max(0, batDau - 24), batDau))) continue;
    for (const [loai, re] of LOAI_RE) {
      const lm = re.exec(conLai);
      if (!lm) continue;
      if (loai === "cho") {
        const chuGoc = goc.slice(viTriLoai, viTriLoai + 3);
        const coDauCau = /[À-ỹđĐ]/.test(goc);
        if (coDauCau ? !/^chợ$/i.test(chuGoc) : /^cho\s+(?:con|em|anh|chi|minh|toi|be|ba|me|gia dinh|khach|nguoi)\b/.test(conLai)) {
          continue;
        }
      }
      const hetLoai = viTriLoai + lm[0].length;
      let ten: string | null = null;
      let tenRe: string | null = null;

      if (loai === "truong_hoc") {
        // "gần mầm non" → chính loại đã là bộ lọc; "trường cấp 2" → chữ sau loại.
        const tuLoai = CAP_TRUONG.find(([r]) => r.test(lm[0]));
        const sauLoai = t.slice(hetLoai).trimStart();
        const cap = tuLoai ?? CAP_TRUONG.find(([r]) => r.test(sauLoai));
        if (cap) tenRe = cap[1];
      } else if (loai === "sieu_thi" && !/^(?:sieu thi|trung tam thuong mai|tttm)\b/.test(lm[0])) {
        ten = goc.slice(viTriLoai, hetLoai).trim();
        tenRe = thoatRe(kdTen(ten));
      } else if (loai === "benh_vien" && /y te/.test(lm[0])) {
        tenRe = "y te";
      }

      if (!tenRe) {
        // Nhặt tên: tối đa 5 chữ sau loại, dừng ở dấu câu, số, chữ dừng.
        const chuoi = goc.slice(hetLoai);
        const chuoiKd = t.slice(hetLoai);
        const tu: string[] = [];
        const reTu = /\S+/g;
        let mt: RegExpExecArray | null;
        while ((mt = reTu.exec(chuoiKd)) && tu.length < 5) {
          const tuKd = mt[0];
          const tuGoc = chuoi.slice(mt.index, mt.index + tuKd.length);
          const sach = tuKd.replace(/[,.;:!?)"']+$/, "");
          if (!sach || /[,;.!?]/.test(tuKd.slice(0, 1))) break;
          if (/^\d/.test(sach)) {
            // "bv 115": số 2-3 chữ số NGAY sau loại, không kèm đơn vị → là tên.
            const sauSo = chuoiKd.slice(mt.index + tuKd.length);
            const laTenSo = tu.length === 0 && /^\d{2,3}$/.test(sach) &&
              !/^\s*(?:km|ki lo|kilo|m\b|met|cay|phut|ty|trieu|tr\b|pn|phong|m2)/.test(sauSo);
            if (!laTenSo) break;
          } else if (DUNG.has(sach) && !(sach === "cho" && /^chợ/i.test(tuGoc))) break;
          tu.push(tuGoc.replace(/[,.;:!?)"']+$/, ""));
          if (sach !== tuKd) break; // có dấu câu dính đuôi → hết tên
        }
        const tenKd = kdTen(tu.join(" "));
        if (tenKd.length >= 2 && !tenKd.split(" ").every((w) => CHUNG_CHUNG.has(w))) {
          ten = tu.join(" ");
          tenRe = thoatRe(tenKd);
        }
      }

      // Bán kính: từ chữ neo tới hết mệnh đề (không vượt dấu chấm/xuống dòng).
      const khung = t.slice(batDau, hetLoai + 40).split(/[.!?\n]/)[0];
      const bk = docBanKinh(khung) ??
        (NEO_SAT.test(neo[1]) ? BAN_KINH_SAT_M : BAN_KINH_GAN_M);
      return { loai, ten, ten_re: tenRe, m: kep(bk) };
    }
  }
  return null;
}

/** "bệnh viện Chợ Rẫy, trong ~1 km" — dòng hồ sơ và dòng lọc KHO. */
export function nhanGan(g: GanTienIch): string {
  const bk = g.m >= 1000 ? `${String(g.m / 1000).replace(".", ",")} km` : `${g.m} m`;
  const noi = g.loai === "dia_diem"
    ? (g.ten ?? TEN_LOAI.dia_diem)
    : `${TEN_LOAI[g.loai]}${g.ten ? ` ${g.ten}` : ""}`;
  return `${noi}, trong ~${bk}`;
}

// Câu có "mùi vị trí" — cổng cho lượt model `bocGanBangModel` (_shared/ai/boc-gan.ts).
// Rộng tay có chủ ý: lọt một câu thừa chỉ tốn một lượt model nhỏ; sót một câu
// là khách nói "tiện đi khám bệnh" mà kho không lọc gì. "cho" không dấu bỏ ra
// (quá nhiều "cho em hỏi"); "chợ" có dấu xét riêng.
const MUI_VI_TRI_RE =
  /\b(gan|sat|canh|ke ben|doi dien|quanh|cach|di bo|tien di|thuan tien|chay xe|may phut|\d+\s*phut|di lam|cho lam|cong ty|truong|benh vien|bv|sieu thi|cong vien|du an|khu do thi|trung tam thuong mai|san bay|ben xe|nha ga|metro|landmark|vincom|aeon|coop ?mart)\b/;
export const coMuiViTri = (text: string): boolean =>
  MUI_VI_TRI_RE.test(boDau(text ?? "")) || /chợ/i.test(text ?? "");
