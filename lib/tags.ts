// FR-12 / IA §4.4 — trang tag SEO. Một keyword ↔ một URL duy nhất, slug
// `{giao-dịch}-{loại-hình}-{thuộc-tính}-{khu-vực}`, không dấu, "tỉ" → "ty".
//
// 12/11/2026 (SRS-5.1zzzzzzz433, chủ dự án "Làm 100 tag"): ĐÚNG 100 tag, phủ Sài Gòn + Long An theo tên quận / huyện người ta
// vẫn gõ trên Google ("bán nhà quận 8", "bán nhà bình thạnh"). Bản cũ là 64 tag toàn Quận 5 theo PHƯỜNG CŨ (trước sáp nhập 2025)
// trong khi kho tin rải khắp thành phố. Bộ TOP-100 keyword gốc (`ndCC-TOP-KW-2014-01.xlsm`, OPEN-06) vẫn chưa có — danh sách dưới
// đây chọn theo (1) quận có tin trong kho, (2) tổ hợp loại × thuộc tính phổ biến của từng khu (mặt bằng cho thuê ở quận trung tâm,
// đất ở ngoại thành / Long An, căn hộ ở Quận 7 / Thủ Đức / Bình Thạnh). Có file keyword thật thì thay mảng `DS`.
//
// Lọc khu bằng `district IN (...)` — KHÔNG ilike: "%Quận 1%" khớp cả Quận 10, 11, 12.
// Tag cũ theo phường Q5 → trang chuyển hẳn (308) về tag quận (`tagCuChuyen`, app/[tag]/page.tsx).
//
// Bộ lọc của mỗi tag là TẬP CON của bộ lọc /mua-ban (ListingBrowse) — cùng cột,
// cùng luật "chỉ tin đang lên kệ có giá" — để hai đường không bao giờ cho hai
// kết quả khác nhau cho cùng một câu hỏi.

const TY = 1_000_000_000;

export type TagFilter = {
  deal: "ban" | "cho_thue";
  types?: string[];
  access?: string[];
  priceMax?: number;
  bedroomsMin?: number;
  legal?: string[];
  /** Giá trị cột `district` (mọi biến thể chữ đã gặp); không có = không lọc khu. */
  districts?: string[];
};

export type TagDef = {
  slug: string;
  /** H1 — keyword hiển thị (giữ "tỉ", có dấu). */
  keyword: string;
  filter: TagFilter;
  /** Tham số `quan` cho link "Xem cả … tin" sang /mua-ban, /cho-thue (một quận); không có = không lọc. */
  quan?: string;
  /** Thành phần để tính tag liên quan (IA-P4: link chéo 6–8 tag). */
  parts: { deal: string; type: string; attr: string; area: string };
};

type Khu = { slug: string; label: string; districts?: string[]; quan?: string };

const quan = (ten: string): string[] => (/^\d+$/.test(ten) ? [`Quận ${ten}`] : [`Quận ${ten}`, ten]);
const huyen = (ten: string): string[] => [`Huyện ${ten}`, ten];

const HCM: Record<string, Khu> = {
  q1: { slug: "quan-1", label: "Quận 1", districts: quan("1"), quan: "Quận 1" },
  q3: { slug: "quan-3", label: "Quận 3", districts: quan("3"), quan: "Quận 3" },
  q5: { slug: "quan-5", label: "Quận 5", districts: quan("5"), quan: "Quận 5" },
  q6: { slug: "quan-6", label: "Quận 6", districts: quan("6"), quan: "Quận 6" },
  q7: { slug: "quan-7", label: "Quận 7", districts: quan("7"), quan: "Quận 7" },
  q8: { slug: "quan-8", label: "Quận 8", districts: quan("8"), quan: "Quận 8" },
  q10: { slug: "quan-10", label: "Quận 10", districts: quan("10"), quan: "Quận 10" },
  q11: { slug: "quan-11", label: "Quận 11", districts: quan("11"), quan: "Quận 11" },
  q12: { slug: "quan-12", label: "Quận 12", districts: quan("12"), quan: "Quận 12" },
  bth: { slug: "binh-thanh", label: "Bình Thạnh", districts: quan("Bình Thạnh"), quan: "Bình Thạnh" },
  pn: { slug: "phu-nhuan", label: "Phú Nhuận", districts: quan("Phú Nhuận"), quan: "Phú Nhuận" },
  gv: { slug: "go-vap", label: "Gò Vấp", districts: quan("Gò Vấp"), quan: "Gò Vấp" },
  tb: { slug: "tan-binh", label: "Tân Bình", districts: quan("Tân Bình"), quan: "Tân Bình" },
  tp: { slug: "tan-phu", label: "Tân Phú", districts: quan("Tân Phú"), quan: "Tân Phú" },
  bt: { slug: "binh-tan", label: "Bình Tân", districts: quan("Bình Tân"), quan: "Bình Tân" },
  td: {
    slug: "thu-duc", label: "Thủ Đức",
    districts: ["Thành phố Thủ Đức", "TP. Thủ Đức", "TP Thủ Đức", "Quận Thủ Đức", "Thủ Đức", "Quận 2", "Quận 9"], quan: "Thủ Đức",
  },
  bc: { slug: "binh-chanh", label: "Bình Chánh", districts: huyen("Bình Chánh"), quan: "Bình Chánh" },
  hm: { slug: "hoc-mon", label: "Hóc Môn", districts: huyen("Hóc Môn"), quan: "Hóc Môn" },
  nb: { slug: "nha-be", label: "Nhà Bè", districts: huyen("Nhà Bè"), quan: "Nhà Bè" },
};

const KHAC_HCM = [...quan("4"), ...huyen("Củ Chi"), ...huyen("Cần Giờ")];

const LA: Record<string, Khu> = {
  bl: { slug: "ben-luc", label: "Bến Lức, Long An", districts: huyen("Bến Lức"), quan: "Bến Lức" },
  dh: { slug: "duc-hoa", label: "Đức Hòa, Long An", districts: huyen("Đức Hòa"), quan: "Đức Hòa" },
  cg: { slug: "can-giuoc", label: "Cần Giuộc, Long An", districts: huyen("Cần Giuộc"), quan: "Cần Giuộc" },
};
const LA_CON = [...huyen("Cần Đước"), ...huyen("Thủ Thừa"), ...huyen("Đức Huệ"), ...huyen("Tân Trụ"), "Thành phố Tân An", "Tân An"];

const SG: Khu = { slug: "sai-gon", label: "Sài Gòn", districts: [...Object.values(HCM).flatMap((k) => k.districts ?? []), ...KHAC_HCM] };
const LONG_AN: Khu = { slug: "long-an", label: "Long An", districts: [...Object.values(LA).flatMap((k) => k.districts ?? []), ...LA_CON] };

type Loai = { slug: string; label: string; types: string[] };
const NHA: Loai = { slug: "nha", label: "nhà", types: ["nha_pho", "nha_cap4", "biet_thu"] };
const CAN_HO: Loai = { slug: "can-ho", label: "căn hộ", types: ["chung_cu"] };
const DAT: Loai = { slug: "dat", label: "đất", types: ["dat", "dat_nong_nghiep", "dat_kinh_doanh"] };
const MAT_BANG: Loai = { slug: "mat-bang", label: "mặt bằng", types: ["mat_bang"] };
const PHONG_TRO: Loai = { slug: "phong-tro", label: "phòng trọ", types: ["phong_tro"] };

type ThuocTinh = { slug: string; label: string; f: Partial<TagFilter> };
const RONG: ThuocTinh = { slug: "", label: "", f: {} };
const HXH: ThuocTinh = { slug: "hem-xe-hoi", label: "hẻm xe hơi", f: { access: ["mat_tien", "hem_xe_tai", "hem_xe_hoi"] } };
const MT: ThuocTinh = { slug: "mat-tien", label: "mặt tiền", f: { access: ["mat_tien"] } };
const DUOI_5: ThuocTinh = { slug: "duoi-5-ty", label: "dưới 5 tỉ", f: { priceMax: 5 * TY } };

const h = HCM;
/** [giao dịch, loại, thuộc tính, các khu] — tổng ĐÚNG 100 tag. */
const DS: Array<["ban" | "cho_thue", Loai, ThuocTinh, Khu[]]> = [
  // Toàn thành phố / toàn tỉnh (9)
  ["ban", NHA, RONG, [SG, LONG_AN]],
  ["ban", NHA, HXH, [SG]],
  ["ban", NHA, MT, [SG]],
  ["ban", NHA, DUOI_5, [SG]],
  ["ban", CAN_HO, RONG, [SG]],
  ["ban", DAT, RONG, [LONG_AN]],
  ["cho_thue", NHA, RONG, [SG]],
  ["cho_thue", MAT_BANG, RONG, [SG]],
  // Bán nhà theo quận / huyện (19 + 2 Long An)
  ["ban", NHA, RONG, [h.q1, h.q3, h.q5, h.q6, h.q7, h.q8, h.q10, h.q11, h.q12, h.bth, h.pn, h.gv, h.tb, h.tp, h.bt, h.td, h.bc, h.hm, h.nb, LA.bl, LA.cg]],
  // Bán nhà hẻm xe hơi (12)
  ["ban", NHA, HXH, [h.q3, h.q5, h.q6, h.q8, h.q10, h.q11, h.bth, h.pn, h.gv, h.tb, h.tp, h.bt]],
  // Bán nhà mặt tiền (10)
  ["ban", NHA, MT, [h.q1, h.q3, h.q5, h.q6, h.q10, h.q11, h.bth, h.tb, h.tp, h.gv]],
  // Bán nhà dưới 5 tỉ — quận ven / ngoại thành (8)
  ["ban", NHA, DUOI_5, [h.q8, h.q12, h.gv, h.tp, h.bt, h.bc, h.hm, h.nb]],
  // Bán căn hộ (8)
  ["ban", CAN_HO, RONG, [h.q6, h.q7, h.q8, h.bth, h.td, h.bt, h.tp, h.nb]],
  // Bán đất (5 + 3 Long An)
  ["ban", DAT, RONG, [h.q12, h.td, h.bc, h.hm, h.nb, LA.bl, LA.dh, LA.cg]],
  // Cho thuê nhà (10)
  ["cho_thue", NHA, RONG, [h.q1, h.q3, h.q5, h.q6, h.q7, h.q8, h.q10, h.bth, h.pn, h.tb]],
  // Cho thuê căn hộ (4)
  ["cho_thue", CAN_HO, RONG, [h.q1, h.q7, h.bth, h.td]],
  // Cho thuê mặt bằng (6)
  ["cho_thue", MAT_BANG, RONG, [h.q1, h.q3, h.q5, h.q10, h.tb, h.bth]],
  // Cho thuê phòng trọ (4)
  ["cho_thue", PHONG_TRO, RONG, [h.q10, h.bth, h.tb, h.gv]],
];

const DEAL = { ban: { slug: "ban", label: "bán" }, cho_thue: { slug: "cho-thue", label: "cho thuê" } } as const;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function build(): TagDef[] {
  const out: TagDef[] = [];
  for (const [deal, loai, tt, khus] of DS) {
    for (const k of khus) {
      out.push({
        slug: [DEAL[deal].slug, loai.slug, tt.slug, k.slug].filter(Boolean).join("-"),
        keyword: cap([DEAL[deal].label, loai.label, tt.label, k.label].filter(Boolean).join(" ")),
        filter: { deal, types: loai.types, districts: k.districts, ...tt.f },
        quan: k.quan,
        parts: { deal: DEAL[deal].slug, type: loai.slug, attr: tt.slug, area: k.slug },
      });
    }
  }
  return out;
}

export const TAG_DEFS: TagDef[] = build();
const BY_SLUG = new Map(TAG_DEFS.map((t) => [t.slug, t]));

export function tagBySlug(slug: string): TagDef | undefined {
  return BY_SLUG.get(slug);
}

/** Tag cũ (trước 12/11/2026: 64 tag Quận 5 theo phường cũ, thuộc tính 2–3 phòng ngủ, toà nhà, kho xưởng…) → slug tag còn sống. */
export function tagCuChuyen(slug: string): string | null {
  const m = /^(ban|cho-thue)-(.+)-quan-5$/.exec(slug);
  if (!m) return null;
  const dich = `${m[1]}-nha-quan-5`;
  return BY_SLUG.has(dich) ? dich : null;
}

/** Khu-slug của một quận / huyện bộ đọc câu tìm nhận ra ("Quận 8", "Bình Thạnh", "Huyện Bình Chánh") — dùng ghép URL tag. */
export function slugKhu(district?: string): string | null {
  if (!district) return SG.slug;
  const loi = district.replace(/^(Quận|Huyện|Thành phố|TP\.?)\s+/i, "").trim().toLowerCase();
  for (const k of [...Object.values(HCM), ...Object.values(LA)]) {
    if ((k.quan ?? "").replace(/^Quận\s+/, "").toLowerCase() === loi) return k.slug;
  }
  return null;
}

/** 6–8 tag liên quan: chung nhiều thành phần nhất, ưu tiên khác đúng một thành phần. */
export function relatedTags(t: TagDef, n = 8): TagDef[] {
  const score = (o: TagDef) => {
    if (o.slug === t.slug) return -1;
    let s = 0;
    if (o.parts.deal === t.parts.deal) s += 3;
    if (o.parts.type === t.parts.type) s += 2;
    if (o.parts.area === t.parts.area) s += 2;
    if (o.parts.attr === t.parts.attr) s += 1;
    return s;
  };
  return [...TAG_DEFS]
    .map((o) => ({ o, s: score(o) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.o.slug.localeCompare(b.o.slug))
    .slice(0, n)
    .map((x) => x.o);
}

/** Tag nổi bật cho trang chủ / feed điện thoại (thay chip đẩy sang Zalo, IA-P4). */
export const FEATURED_TAGS = [
  "ban-nha-hem-xe-hoi-sai-gon",
  "ban-nha-duoi-5-ty-sai-gon",
  "ban-nha-mat-tien-sai-gon",
  "ban-can-ho-sai-gon",
  "ban-dat-long-an",
  "cho-thue-nha-sai-gon",
  "cho-thue-mat-bang-sai-gon",
].map((s) => BY_SLUG.get(s)).filter(Boolean) as TagDef[];

// SRS-5.1zzzzzzz436: danh sách khu cho khối "giới thiệu khu" (trang tag) và khối khu trang chủ — cùng bộ tên / biến thể
// `district` với tag, để số tin ở hai nơi luôn khớp số tin của trang tag.
export type KhuInfo = { slug: string; label: string; districts: string[]; tinh: "sg" | "la" };
const khuLe = (k: Khu, tinh: "sg" | "la"): KhuInfo => ({ slug: k.slug, label: k.label, districts: k.districts ?? [], tinh });
/** 19 quận huyện Sài Gòn + 3 huyện Long An có trang tag riêng. */
export const KHU_LE: KhuInfo[] = [...Object.values(HCM).map((k) => khuLe(k, "sg")), ...Object.values(LA).map((k) => khuLe(k, "la"))];
const KHU_GOP: KhuInfo[] = [khuLe(SG, "sg"), khuLe(LONG_AN, "la")];

export function khuBySlug(slug: string): KhuInfo | undefined {
  return [...KHU_LE, ...KHU_GOP].find((k) => k.slug === slug);
}

/** Trang tag "bán nhà" của khu nếu có, không thì tag bán đầu tiên của khu (Đức Hòa chỉ có "bán đất"). */
export function tagChinhCuaKhu(k: KhuInfo): TagDef | undefined {
  return BY_SLUG.get(`ban-nha-${k.slug}`) ?? TAG_DEFS.find((t) => t.parts.area === k.slug && t.parts.deal === "ban");
}
