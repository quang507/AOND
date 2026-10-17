// FR-12 / IA §4.4 — trang tag SEO. Một keyword ↔ một URL duy nhất, slug
// `{giao-dịch}-{loại-hình}-{thuộc-tính}-{khu-vực}`, không dấu, "tỉ" → "ty".
//
// Bộ TOP-100 keyword gốc (`ndCC-TOP-KW-2014-01.xlsm`) chưa có trong repo
// (OPEN-06), nên bảng dưới đây SINH từ taxonomy đang có (giao dịch × loại × thuộc
// tính × phường Quận 5 cũ) — đủ để dựng khung trang tag đúng đặc tả; khi có file
// keyword thật chỉ cần thêm dòng vào `TAG_DEFS`, không đổi cấu trúc. Địa bàn
// mới (FR-174) chờ bảng `wards` (OPEN-27 nửa sau) rồi mới mở tag theo khu mới.
//
// Bộ lọc của mỗi tag là TẬP CON của bộ lọc /mua-ban (ListingBrowse) — cùng cột,
// cùng luật "chỉ tin đang lên kệ có giá" — để hai đường không bao giờ cho hai
// kết quả khác nhau cho cùng một câu hỏi.
import { WARDS } from "@/lib/geo";

const TY = 1_000_000_000;

export type TagFilter = {
  deal: "ban" | "cho_thue";
  types?: string[];
  access?: string[];
  priceMax?: number;
  bedroomsMin?: number;
  legal?: string[];
  ward?: string;
};

export type TagDef = {
  slug: string;
  /** H1 — keyword hiển thị (giữ "tỉ", có dấu). */
  keyword: string;
  filter: TagFilter;
  /** Thành phần để tính tag liên quan (IA-P4: link chéo 6–8 tag). */
  parts: { deal: string; type: string; attr: string; area: string };
};

type Piece = { slug: string; label: string };

const DEAL: Record<"ban" | "cho_thue", Piece> = {
  ban: { slug: "ban", label: "Bán" },
  cho_thue: { slug: "cho-thue", label: "Cho thuê" },
};

const TYPE: Array<Piece & { types?: string[]; deals: Array<"ban" | "cho_thue"> }> = [
  { slug: "nha", label: "nhà", types: ["nha_pho", "nha_cap4", "biet_thu"], deals: ["ban", "cho_thue"] },
  { slug: "can-ho", label: "căn hộ", types: ["chung_cu"], deals: ["ban", "cho_thue"] },
  { slug: "dat", label: "đất", types: ["dat", "dat_nong_nghiep", "dat_kinh_doanh"], deals: ["ban"] },
  { slug: "mat-bang", label: "mặt bằng", types: ["mat_bang"], deals: ["cho_thue"] },
  { slug: "phong-tro", label: "phòng trọ", types: ["phong_tro"], deals: ["cho_thue"] },
  // 20260909i: loại mới theo chat Gemini 21/06.
  { slug: "toa-nha", label: "toà nhà", types: ["toa_nha"], deals: ["ban", "cho_thue"] },
  { slug: "kho-xuong", label: "kho xưởng", types: ["kho_xuong"], deals: ["ban", "cho_thue"] },
];

// Thuộc tính: chỉ ghép với loại "nhà" (là nhóm có đủ dữ liệu thông số FR-172).
const ATTR: Array<Piece & { f: Partial<TagFilter>; deals: Array<"ban" | "cho_thue"> }> = [
  { slug: "", label: "", f: {}, deals: ["ban", "cho_thue"] },
  { slug: "hem-xe-hoi", label: "hẻm xe hơi", f: { access: ["mat_tien", "hem_xe_tai", "hem_xe_hoi"] }, deals: ["ban", "cho_thue"] },
  { slug: "mat-tien", label: "mặt tiền", f: { access: ["mat_tien"] }, deals: ["ban", "cho_thue"] },
  { slug: "duoi-3-ty", label: "dưới 3 tỉ", f: { priceMax: 3 * TY }, deals: ["ban"] },
  { slug: "duoi-5-ty", label: "dưới 5 tỉ", f: { priceMax: 5 * TY }, deals: ["ban"] },
  { slug: "duoi-8-ty", label: "dưới 8 tỉ", f: { priceMax: 8 * TY }, deals: ["ban"] },
  { slug: "2-phong-ngu", label: "2 phòng ngủ", f: { bedroomsMin: 2 }, deals: ["ban", "cho_thue"] },
  { slug: "3-phong-ngu", label: "3 phòng ngủ", f: { bedroomsMin: 3 }, deals: ["ban", "cho_thue"] },
  { slug: "so-hong-rieng", label: "sổ hồng riêng", f: { legal: ["so_hong_rieng"] }, deals: ["ban"] },
];

const AREA_Q5: Piece = { slug: "quan-5", label: "Quận 5" };

function wardPiece(w: string): Piece {
  const n = w.replace(/\D/g, "");
  return { slug: `phuong-${n}-quan-5`, label: `${w}, Quận 5` };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function build(): TagDef[] {
  const out: TagDef[] = [];
  const push = (deal: "ban" | "cho_thue", t: (typeof TYPE)[number], a: (typeof ATTR)[number], area: Piece, ward?: string) => {
    const slug = [DEAL[deal].slug, t.slug, a.slug, area.slug].filter(Boolean).join("-");
    const keyword = cap([DEAL[deal].label.toLowerCase(), t.label, a.label, area.label].filter(Boolean).join(" "));
    out.push({
      slug,
      keyword,
      filter: { deal, types: t.types, ward, ...a.f },
      parts: { deal: DEAL[deal].slug, type: t.slug, attr: a.slug, area: area.slug },
    });
  };
  for (const deal of ["ban", "cho_thue"] as const) {
    for (const t of TYPE) {
      if (!t.deals.includes(deal)) continue;
      // Cấp quận: mọi thuộc tính cho "nhà", chỉ thuộc tính rỗng cho loại khác.
      for (const a of ATTR) {
        if (!a.deals.includes(deal)) continue;
        if (t.slug !== "nha" && a.slug !== "") continue;
        push(deal, t, a, AREA_Q5);
      }
    }
    // Cấp phường: "nhà" + rỗng và "nhà" + hẻm xe hơi (hai câu người ta gõ nhiều nhất).
    const nha = TYPE[0];
    for (const w of WARDS) {
      for (const a of ATTR.filter((x) => x.slug === "" || x.slug === "hem-xe-hoi")) {
        if (!a.deals.includes(deal)) continue;
        if (deal === "cho_thue" && a.slug !== "") continue;
        push(deal, nha, a, wardPiece(w), w);
      }
    }
  }
  return out;
}

export const TAG_DEFS: TagDef[] = build();
const BY_SLUG = new Map(TAG_DEFS.map((t) => [t.slug, t]));

export function tagBySlug(slug: string): TagDef | undefined {
  return BY_SLUG.get(slug);
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

/** Tag nổi bật cho trang chủ / chân trang (thay chip đẩy sang Zalo, IA-P4). */
export const FEATURED_TAGS = [
  "ban-nha-quan-5",
  "ban-nha-hem-xe-hoi-quan-5",
  "ban-nha-mat-tien-quan-5",
  "ban-can-ho-quan-5",
  "ban-nha-duoi-5-ty-quan-5",
  "cho-thue-nha-quan-5",
  "cho-thue-mat-bang-quan-5",
].map((s) => BY_SLUG.get(s)).filter(Boolean) as TagDef[];
