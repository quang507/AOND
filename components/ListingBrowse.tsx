import Link from "next/link";
import { unstable_cache } from "next/cache";
import { NHAN_HOP_LE } from "@/bot/supabase/functions/_shared/extraction/nhan";
import { coverByCode } from "@/lib/photos";
import { MAP_COLS, supabase, type ListingCard as CardRow, TRANG_THAI_HIEN } from "@/lib/supabase";
import { oTheoLoai, zaloLink } from "@/lib/format";
import { parseQuery } from "@/lib/parse-query";
import BrowseWithMap from "@/components/BrowseWithMap";

const PAGE_SIZE = 24;
const TY = 1_000_000_000;
const TR = 1_000_000;

const GIA: Record<string, { key: string; label: string; min?: number; max?: number }[]> = {
  ban: [
    { key: "duoi-5", label: "Dưới 5 tỷ", max: 5 * TY },
    { key: "5-8", label: "5–8 tỷ", min: 5 * TY, max: 8 * TY },
    { key: "8-12", label: "8–12 tỷ", min: 8 * TY, max: 12 * TY },
    { key: "tren-12", label: "Trên 12 tỷ", min: 12 * TY },
  ],
  cho_thue: [
    { key: "duoi-10tr", label: "Dưới 10 tr/tháng", max: 10 * TR },
    { key: "10-20tr", label: "10–20 tr", min: 10 * TR, max: 20 * TR },
    { key: "tren-20tr", label: "Trên 20 tr", min: 20 * TR },
  ],
};
const DT = [
  { key: "duoi-40", label: "Dưới 40 m²", max: 40 },
  { key: "40-60", label: "40–60 m²", min: 40, max: 60 },
  { key: "60-100", label: "60–100 m²", min: 60, max: 100 },
  { key: "tren-100", label: "Trên 100 m²", min: 100 },
];
const XEP = [
  { key: "moi", label: "Mới nhất" },
  { key: "gia-tang", label: "Giá thấp - cao" },
  { key: "gia-giam", label: "Giá cao - thấp" },
  { key: "dt-lon", label: "Diện tích lớn" },
];
const PN = [1, 2, 3, 4];
const VAO = [
  { key: "mt", label: "Mặt tiền", types: ["mat_tien"] },
  { key: "hxh", label: "Hẻm xe hơi trở lên", types: ["mat_tien", "hem_xe_tai", "hem_xe_hoi"] },
  { key: "hem", label: "Trong hẻm", types: ["hem_xe_tai", "hem_xe_hoi", "hem_xe_may", "hem"] },
];
const TANG = [2, 3, 4];
const PL = [
  { key: "so-rieng", label: "Sổ hồng riêng", statuses: ["so_hong_rieng"] },
  { key: "co-so", label: "Có sổ", statuses: ["so_hong_rieng", "so_hong_chung", "so_hong"] },
];

type Params = {
  phuong?: string; trang?: string; gia?: string; dt?: string; xep?: string; pn?: string;
  vao?: string; tang?: string; pl?: string;
  q?: string; gmin?: string; gmax?: string; dtmin?: string; dtmax?: string;
  quan?: string; loai?: string; duong?: string; moc?: string;
  nhan?: string[];
};

const LOAI_HOP_LE = new Set(["nha_pho", "nha_cap4", "chung_cu", "dat", "biet_thu", "phong_tro", "mat_bang", "toa_nha", "dat_nong_nghiep", "dat_kinh_doanh", "kho_xuong", "chua_ro"]);
const sachIlike = (v?: string) => (v ?? "").replace(/[,()%*"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const soDuong = (v?: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };

type Truy = {
  deal: "ban" | "cho_thue";
  phuong?: string;
  giaMin?: number; giaMax?: number; loGia: boolean;
  dtMin?: number; dtMax?: number; loDt: boolean;
  pn: number | null;
  vao?: string[]; tang?: number; pl?: string[];
  quan?: string; loai?: string[]; duong?: string; moc?: string;
  nhan?: string[];
  xep: string;
  page: number;
};

const layTin = unstable_cache(
  async (t: Truy) => {
    let q = supabase
      .from("listings")
      // MAP_COLS (thẻ + lat, lng): nút "Xem bản đồ" cần toạ độ — với CARD_COLS ghim rơi về wardPoint, chỉ biết phường Q5 cũ, nên
      // bản đồ trang này trống mọi ghim (thấy khi chụp 26/10, SRS-5.1zzzzzzz206).
      .select(MAP_COLS, { count: "exact" })
      .eq("deal", t.deal)
      .in("status", TRANG_THAI_HIEN)
      .not("price_raw", "is", null)
      .neq("price_raw", "");

    if (t.phuong) q = q.eq("ward", t.phuong);
    if (t.quan) q = q.ilike("district", `%${t.quan}%`);
    if (t.duong) q = q.ilike("street", `%${t.duong}%`);
    if (t.moc) q = q.ilike("location_raw", `%${t.moc}%`);
    if (t.loai && t.loai.length > 0) q = q.in("property_type", t.loai);

    if (t.giaMin != null) q = q.gte("price_vnd", t.giaMin);
    if (t.giaMax != null) q = q.lte("price_vnd", t.giaMax);
    if (t.dtMin != null) q = q.gte("area_m2", t.dtMin);
    if (t.dtMax != null) q = q.lte("area_m2", t.dtMax);

    if (t.pn != null) q = q.gte("bedrooms", t.pn);
    if (t.tang != null) q = q.gte("floors", t.tang);
    if (t.vao && t.vao.length > 0) q = q.in("access_type", t.vao);
    if (t.pl && t.pl.length > 0) q = q.in("legal_status", t.pl);
    if (t.nhan && t.nhan.length > 0) q = q.overlaps("tags", t.nhan);

    switch (t.xep) {
      case "gia-tang": q = q.order("price_vnd", { ascending: true, nullsFirst: false }); break;
      case "gia-giam": q = q.order("price_vnd", { ascending: false, nullsFirst: false }); break;
      case "dt-lon": q = q.order("area_m2", { ascending: false, nullsFirst: false }); break;
      default: q = q.order("created_at", { ascending: false }); break;
    }

    const from = (t.page - 1) * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data, count } = await q;
    return { data: (data ?? []) as CardRow[], total: count ?? 0 };
  },
  ["listing-browse-v3"],
  { revalidate: 10800, tags: ["listings"] }, // SRS-5.1zl: 3 giờ (giảm egress Supabase); b9e03c3 hạ về 300 s → SRS-5.1zzzzzzz25 trả lại
);

export default async function ListingBrowse({
  deal,
  title,
  basePath,
  searchParams,
}: {
  deal: "ban" | "cho_thue";
  title: string;
  basePath: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const sp: Params = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (typeof v === "string") (sp as Record<string, unknown>)[k] = v;
  }

  const q = sp.q?.trim();
  const dienGiai = q ? parseQuery(q) : undefined;

  let giaMin = soDuong(sp.gmin);
  let giaMax = soDuong(sp.gmax);
  if (sp.gia) {
    const g = GIA[deal].find((x) => x.key === sp.gia);
    if (g) {
      if (g.min != null) giaMin = g.min;
      if (g.max != null) giaMax = g.max;
    }
  }

  let dtMin = soDuong(sp.dtmin);
  let dtMax = soDuong(sp.dtmax);
  if (sp.dt) {
    const d = DT.find((x) => x.key === sp.dt);
    if (d) {
      if (d.min != null) dtMin = d.min;
      if (d.max != null) dtMax = d.max;
    }
  }

  const quan = sp.quan ? sachIlike(sp.quan) : dienGiai?.filters.district;
  const duong = sp.duong ? sachIlike(sp.duong) : dienGiai?.filters.street;
  const moc = sp.moc ? sachIlike(sp.moc) : dienGiai?.filters.landmark;

  let loai: string[] | undefined;
  if (sp.loai) {
    const arr = sp.loai.split(",").map((s) => s.trim()).filter((s) => LOAI_HOP_LE.has(s));
    if (arr.length > 0) loai = arr;
  } else if (dienGiai?.filters.types && dienGiai.filters.types.length > 0) {
    loai = dienGiai.filters.types;
  }

  const vao = sp.vao ? VAO.find((x) => x.key === sp.vao)?.types : undefined;
  const tang = sp.tang ? Number(sp.tang) || undefined : undefined;
  const pl = sp.pl ? PL.find((x) => x.key === sp.pl)?.statuses : undefined;

  const coLocPN = !loai || loai.some((t) => oTheoLoai(t).phongNgu);
  const pn = coLocPN && sp.pn ? Number(sp.pn) || null : null;

  const xep = XEP.find((x) => x.key === sp.xep) ?? XEP[0];
  const page = Math.max(1, Number(sp.trang) || 1);

  const truy: Truy = {
    deal,
    phuong: sp.phuong,
    giaMin,
    giaMax,
    loGia: giaMin != null || giaMax != null,
    dtMin,
    dtMax,
    loDt: dtMin != null || dtMax != null,
    pn,
    vao,
    tang,
    pl,
    quan,
    loai,
    duong,
    moc,
    xep: xep.key,
    page,
  };

  const { data: listings, total } = await layTin(truy);
  const covers = await coverByCode(listings.map((l) => l.code).filter(Boolean) as string[]);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const withParam = (updates: Record<string, string | undefined>) => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string" && v !== "") next[k] = v;
    }
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    const qs = new URLSearchParams(next).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const chip = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? "border-brand bg-brand text-white shadow-xs"
        : "border-line bg-white text-slate-700 hover:border-brand/50 hover:text-brand"
    }`;

  const filterSection = (
    <div className="space-y-2.5 rounded-lg bg-white p-4 shadow-sm border border-slate-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 eyebrow text-mute">Giá</span>
        {GIA[deal].map((g) => (
          <Link key={g.key} rel="nofollow" prefetch={false} href={withParam({ gia: sp.gia === g.key ? undefined : g.key })} className={chip(sp.gia === g.key)}>
            {g.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 eyebrow text-mute">Diện tích</span>
        {DT.map((d) => (
          <Link key={d.key} rel="nofollow" prefetch={false} href={withParam({ dt: sp.dt === d.key ? undefined : d.key })} className={chip(sp.dt === d.key)}>
            {d.label}
          </Link>
        ))}
      </div>
      {coLocPN && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 eyebrow text-mute">Phòng ngủ</span>
          {PN.map((n) => (
            <Link key={n} rel="nofollow" prefetch={false} href={withParam({ pn: sp.pn === String(n) ? undefined : String(n) })} className={chip(sp.pn === String(n))}>
              {n}+ PN
            </Link>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 eyebrow text-mute">Đường vào</span>
        {VAO.map((v) => (
          <Link key={v.key} rel="nofollow" prefetch={false} href={withParam({ vao: sp.vao === v.key ? undefined : v.key })} className={chip(sp.vao === v.key)}>
            {v.label}
          </Link>
        ))}
      </div>
      {deal === "ban" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 eyebrow text-mute">Tầng · Sổ</span>
          {TANG.map((n) => (
            <Link key={n} rel="nofollow" prefetch={false} href={withParam({ tang: sp.tang === String(n) ? undefined : String(n) })} className={chip(sp.tang === String(n))}>
              {n}+ tầng
            </Link>
          ))}
          {PL.map((p) => (
            <Link key={p.key} rel="nofollow" prefetch={false} href={withParam({ pl: sp.pl === p.key ? undefined : p.key })} className={chip(sp.pl === p.key)}>
              {p.label}
            </Link>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 eyebrow text-mute">Xếp theo</span>
        {XEP.map((x) => (
          <Link key={x.key} rel="nofollow" prefetch={false} href={withParam({ xep: x.key === "moi" ? undefined : x.key })} className={chip(xep.key === x.key)}>
            {x.label}
          </Link>
        ))}
      </div>
    </div>
  );

  const paginationSection = totalPages > 1 ? (
    <div className="flex items-center justify-center gap-2 text-xs">
      {page > 1 && (
        <Link rel="nofollow" prefetch={false} href={withParam({ trang: String(page - 1) })} className="rounded-md border border-line bg-white px-4 py-2 font-semibold transition hover:border-brand hover:text-brand">
          ← Trước
        </Link>
      )}
      <span className="px-3 text-mute tabular-nums">Trang {page}/{totalPages}</span>
      {page < totalPages && (
        <Link rel="nofollow" prefetch={false} href={withParam({ trang: String(page + 1) })} className="rounded-md border border-line bg-white px-4 py-2 font-semibold transition hover:border-brand hover:text-brand">
          Sau →
        </Link>
      )}
    </div>
  ) : null;

  return (
    <>
      {/* Hero Header */}
      <div className="bg-navy pb-16 pt-10 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/10 text-[#60A5FA] text-xs font-bold tracking-wide uppercase mb-2">
            <span>🏠</span>
            <span>Kho tin · Sài Gòn & Long An</span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">
            {title} {sp.phuong ? `- ${sp.phuong}` : sp.quan ? `- ${sachIlike(sp.quan)}` : "Sài Gòn & Long An"}
          </h1>
          {dienGiai && !dienGiai.empty ? (
            <p className="mt-2 text-white/80 text-sm">
              Tìm thấy <strong className="text-white">{total}</strong> tin theo yêu cầu:{" "}
              <span className="font-semibold text-white">{dienGiai.title}</span>
              <span className="text-white/50"> · anh chị hỏi “{q}”</span>
            </p>
          ) : (
            <p className="mt-2 text-white/70 text-sm">
              {total} bất động sản · Giá thật, xác minh trực tiếp qua Zalo
            </p>
          )}
        </div>
      </div>

      {/* Main Browse with Split Map toggle */}
      <BrowseWithMap
        listings={listings}
        covers={covers}
        total={total}
        basePath={basePath}
        filterSection={filterSection}
        paginationSection={paginationSection}
        q={q}
      />
    </>
  );
}
