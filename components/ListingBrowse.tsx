import Link from "next/link";
import { unstable_cache } from "next/cache";
import { NHAN_HOP_LE } from "@/bot/supabase/functions/_shared/extraction/nhan";
import ListingCard from "@/components/ListingCard";
import { coverByCode } from "@/lib/photos";
import { CARD_COLS, supabase, type ListingCard as CardRow } from "@/lib/supabase";
import { oTheoLoai, zaloLink } from "@/lib/format";
import { parseQuery } from "@/lib/parse-query";

const PAGE_SIZE = 24;
const TY = 1_000_000_000;
const TR = 1_000_000;

// Bộ lọc giá theo loại giao dịch (FR-123 — port ý tưởng search NhaDat-Radar).
// Lọc số phòng ngủ chờ dữ liệu có cấu trúc (nằm rải trong listing_facts).
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
const PN = [1, 2, 3, 4]; // "từ N phòng ngủ trở lên" (FR-128)
// FR-172: ba bộ lọc trên cột có cấu trúc (migration 20260902e). "Hẻm xe hơi trở
// lên" gộp cả hẻm xe tải và mặt tiền — khách hỏi "xe hơi vô được không", không
// hỏi đúng cỡ hẻm.
const VAO = [
  { key: "mt", label: "Mặt tiền", types: ["mat_tien"] },
  { key: "hxh", label: "Hẻm xe hơi trở lên", types: ["mat_tien", "hem_xe_tai", "hem_xe_hoi"] },
  { key: "hem", label: "Trong hẻm", types: ["hem_xe_tai", "hem_xe_hoi", "hem_xe_may", "hem"] },
];
const TANG = [2, 3, 4]; // "từ N tầng trở lên"
const PL = [
  { key: "so-rieng", label: "Sổ hồng riêng", statuses: ["so_hong_rieng"] },
  { key: "co-so", label: "Có sổ", statuses: ["so_hong_rieng", "so_hong_chung", "so_hong"] },
];

type Params = {
  phuong?: string; trang?: string; gia?: string; dt?: string; xep?: string; pn?: string;
  vao?: string; tang?: string; pl?: string;
  // FR-08/09 (04/09/2026): tham số do /api/search sinh — khoảng giá / diện tích
  // tự do (VND, m²), quận/huyện, loại, tên đường, mốc, và câu gốc `q`.
  q?: string; gmin?: string; gmax?: string; dtmin?: string; dtmax?: string;
  quan?: string; loai?: string; duong?: string; moc?: string;
  /** FR-211: nhãn tìm kiếm, "yen_tinh,gan_cho". */
  nhan?: string;
};

// Cột enum có thật — chỉ nhận giá trị trong bảng này, không cho gõ tuỳ ý.
const LOAI_HOP_LE = new Set(["nha_pho", "nha_cap4", "chung_cu", "dat", "biet_thu", "phong_tro", "mat_bang", "toa_nha", "dat_nong_nghiep", "dat_kinh_doanh", "kho_xuong", "chua_ro"]);
// Chữ tự do đi vào `ilike`: bỏ ký tự cú pháp của bộ lọc PostgREST (dấu phẩy,
// ngoặc, %, *) để câu gõ không thành mệnh đề lọc; cắt 60 ký tự.
const sachIlike = (v?: string) => (v ?? "").replace(/[,()%*"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
const soDuong = (v?: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };

// Trang này ĐỌC searchParams nên Next đánh dấu ƒ — dựng lại từng request, ISR
// không với tới (tổ hợp bộ lọc là vô hạn, không prerender được). Chỗ tốn thật
// không phải HTML mà là query Supabase: gói nó vào Data Cache, khoá theo đúng
// bộ lọc. Hai người bấm cùng "Dưới 5 tỷ · Phường 5" trong 5 phút thì DB chỉ bị
// hỏi một lần. Free tier chỉ có 60 max_connections nên đây là chỗ đáng giữ.
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
      .select(CARD_COLS, { count: "exact" }) // FR-171 j: lưới thẻ không cần mô tả
      .eq("deal", t.deal)
      .in("status", ["dang_ban", "dang_quan_tam"]) // FR-139: chỉ tin đang lên kệ
      .not("price_raw", "is", null)
      .neq("price_raw", "");
    if (t.phuong) q = q.eq("ward", t.phuong);
    if (t.giaMin) q = q.gte("price_vnd", t.giaMin);
    if (t.giaMax) q = q.lt("price_vnd", t.giaMax);
    if (t.loGia) q = q.gt("price_vnd", 0);
    if (t.dtMin) q = q.gte("area_m2", t.dtMin);
    if (t.dtMax) q = q.lt("area_m2", t.dtMax);
    if (t.loDt) q = q.gt("area_m2", 0);
    if (t.pn) q = q.gte("bedrooms", t.pn);
    if (t.vao?.length) q = q.in("access_type", t.vao);
    if (t.tang) q = q.gte("floors", t.tang);
    if (t.pl?.length) q = q.in("legal_status", t.pl);
    // FR-09: tham số từ câu tìm kiếm tự nhiên (đã làm sạch ở trên).
    // Không bọc %: "%Quận 1%" khớp cả Quận 10/11/12. Giá trị đã chuẩn "Quận N".
    if (t.quan) q = q.ilike("district", t.quan);
    if (t.loai?.length) q = q.in("property_type", t.loai);
    if (t.nhan?.length) q = q.contains("nhan", t.nhan); // FR-211
    if (t.duong) q = q.ilike("street", `%${t.duong}%`);
    if (t.moc) q = q.or(`description.ilike.%${t.moc}%,location_raw.ilike.%${t.moc}%`);
    q =
      t.xep === "gia-tang" ? q.order("price_vnd", { ascending: true, nullsFirst: false })
      : t.xep === "gia-giam" ? q.order("price_vnd", { ascending: false, nullsFirst: false })
      : t.xep === "dt-lon" ? q.order("area_m2", { ascending: false, nullsFirst: false })
      : q.order("created_at", { ascending: false });
    q = q.range((t.page - 1) * PAGE_SIZE, t.page * PAGE_SIZE - 1);
    const { data, count } = await q;
    return { rows: (data ?? []) as CardRow[], total: count ?? 0 };
  },
  ["listing-browse"],
  { revalidate: 10800, tags: ["listings"] }, // SRS-5.1zl: 5 phút → 3 giờ (giảm egress Supabase)
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
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.trang) || 1);
  const gia = GIA[deal].find((g) => g.key === sp.gia);
  const dt = DT.find((d) => d.key === sp.dt);
  const xep = XEP.find((x) => x.key === sp.xep) ?? XEP[0];

  const pn = PN.includes(Number(sp.pn)) ? Number(sp.pn) : null;
  const vao = VAO.find((v) => v.key === sp.vao);
  const tang = TANG.includes(Number(sp.tang)) ? Number(sp.tang) : undefined;
  const pl = PL.find((p) => p.key === sp.pl);
  // FR-08/09: khoảng giá / diện tích tự do từ /api/search ưu tiên hơn chip cố định.
  const gmin = soDuong(sp.gmin), gmax = soDuong(sp.gmax);
  const dtmin = soDuong(sp.dtmin), dtmax = soDuong(sp.dtmax);
  const loai = (sp.loai ?? "").split(",").map((x) => x.trim()).filter((x) => LOAI_HOP_LE.has(x));
  // Bộ lọc phòng ngủ chỉ có nghĩa khi loại đang lọc có phòng ngủ (`O_THEO_LOAI`) — đang lọc đất / kho thì không hiện.
  const coLocPN = !loai.length || loai.some((l) => oTheoLoai(l).phongNgu);
  const nhan = (sp.nhan ?? "").split(",").map((x) => x.trim()).filter((x) => NHAN_HOP_LE.has(x));
  const q = (sp.q ?? "").slice(0, 300).trim();
  // Diễn giải lại câu hỏi bằng CÙNG bộ luật đã sinh URL — không lệch nhau.
  const dienGiai = q ? parseQuery(q) : null;
  const { rows: listings, total } = await layTin({
    deal,
    phuong: sp.phuong,
    giaMin: gmin ?? gia?.min, giaMax: gmax ?? gia?.max, loGia: !!gia || !!gmin || !!gmax,
    dtMin: dtmin ?? dt?.min, dtMax: dtmax ?? dt?.max, loDt: !!dt || !!dtmin || !!dtmax,
    pn,
    vao: vao?.types, tang, pl: pl?.statuses,
    quan: sachIlike(sp.quan) || undefined,
    loai: loai.length ? loai : undefined,
    nhan: nhan.length ? nhan : undefined,
    duong: sachIlike(sp.duong) || undefined,
    moc: sachIlike(sp.moc) || undefined,
    xep: xep.key,
    page,
  });
  const covers = await coverByCode(listings.map((l) => l.code)); // FR-148
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Link giữ nguyên các lọc khác, đổi một tham số (trang reset về 1). Bấm chip
  // là rời khỏi câu hỏi tự nhiên: bỏ `q` (tiêu đề diễn giải sẽ sai) và bỏ
  // khoảng giá/diện tích tự do khi chọn chip giá/diện tích tương ứng.
  // 28/09/2026: một bot crawl lần theo chip lọc (giá × diện tích × phòng ngủ × đường vào × tầng × pháp lý × xếp × phường ×
  // trang) — 15.672 tổ hợp khác nhau MỖI GIỜ vào trang động này, mỗi URL là một lần gọi hàm Vercel + nhiều truy vấn Supabase;
  // gói Hobby hết 1.000.000 lần gọi. Link bộ lọc: `rel="nofollow"` (bot tử tế không lần theo), `prefetch={false}` (không
  // bắn request nền cho mỗi chip lọt vào khung nhìn). robots.txt chặn URL có tham số; trang có tham số là noindex.
  const withParam = (patch: Partial<Params>) => {
    const merged: Record<string, string> = {};
    const bo: Partial<Params> = { trang: undefined };
    // Sang trang thì vẫn là câu hỏi đó: giữ `q` để tiêu đề diễn giải + hộp Zalo
    // (FR-13) không biến mất ở trang 2.
    if (!("trang" in patch)) bo.q = undefined;
    if ("gia" in patch) { bo.gmin = undefined; bo.gmax = undefined; }
    if ("dt" in patch) { bo.dtmin = undefined; bo.dtmax = undefined; }
    for (const [k, v] of Object.entries({ ...sp, ...bo, ...patch })) {
      if (v) merged[k] = String(v);
    }
    const qs = new URLSearchParams(merged).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const chip = (active: boolean) =>
    `rounded-md border px-3.5 py-1.5 text-sm transition ${
      active
        ? "border-brand bg-brand font-semibold text-white"
        : "border-line bg-white hover:border-brand hover:text-brand"
    }`;

  return (
    <>
      {/* Dải tiêu đề navy + thẻ lọc trắng nổi đè lên chân dải - đúng chỗ thanh
          "Search Property" của Veedoo, nhưng là link thuần nên không cần JS. */}
      <div className="bg-navy pb-16 pt-10 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <p className="eyebrow text-brand">Kho tin · Sài Gòn & Long An</p>
          <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">
            {title} {sp.phuong ? `- ${sp.phuong}` : sp.quan ? `- ${sachIlike(sp.quan)}` : "Sài Gòn & Long An"}
          </h1>
          {/* FR-08: "Tìm thấy N tin theo yêu cầu" + tiêu đề diễn giải lại truy vấn */}
          {dienGiai && !dienGiai.empty ? (
            <p className="mt-2 text-white/80">
              Tìm thấy <span className="font-bold text-white">{total}</span> tin theo yêu cầu:{" "}
              <span className="font-semibold text-white">{dienGiai.title}</span>
              <span className="text-white/50"> · anh chị hỏi “{q}”</span>
            </p>
          ) : (
            <p className="mt-2 text-white/60">
              {total} tin · hỏi chi tiết bất kỳ căn nào qua Zalo
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-12">
        {/* FR-13: hộp mời kết nối trên MỌI trang kết quả tìm kiếm - mang theo câu
            gốc sang Zalo (FR-14). Câu không bóc được gì thì hộp này là câu trả
            lời chính, không phải phụ. */}
        {q && (
          <div className={`-mt-10 mb-4 flex flex-col gap-3 rounded-king p-5 shadow-[0_18px_40px_rgba(13,37,61,0.14)] sm:flex-row sm:items-center ${
            dienGiai?.empty ? "bg-white" : "bg-white/95"
          }`}>
            <div className="flex-1">
              <p className="font-extrabold">
                {dienGiai?.empty
                  ? "Câu này tụi em chưa hiểu hết - nhắn Zalo, người thật trả lời liền."
                  : "Chưa đúng ý? Nhắn nguyên câu này qua Zalo, tụi em lọc tay cho anh chị."}
              </p>
              <p className="mt-1 text-sm text-mute">
                “{q}” - không cần để lại số điện thoại, ngắt kết nối bất cứ lúc nào.
              </p>
            </div>
            <a
              href={zaloLink(`search:${q}`)}
              className="nut nut-chinh"
            >
              Hỏi qua Zalo
            </a>
          </div>
        )}
        <div className={`${q ? "" : "-mt-10 "}space-y-3 rounded-king bg-white p-5 shadow-[0_18px_40px_rgba(13,37,61,0.14)]`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 eyebrow text-mute">Giá</span>
          {GIA[deal].map((g) => (
            <Link key={g.key} rel="nofollow" prefetch={false} href={withParam({ gia: sp.gia === g.key ? undefined : g.key })} className={chip(sp.gia === g.key)}>
              {g.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 eyebrow text-mute">Diện tích</span>
          {DT.map((d) => (
            <Link key={d.key} rel="nofollow" prefetch={false} href={withParam({ dt: sp.dt === d.key ? undefined : d.key })} className={chip(sp.dt === d.key)}>
              {d.label}
            </Link>
          ))}
        </div>
        {coLocPN && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 eyebrow text-mute">Phòng ngủ</span>
          {PN.map((n) => (
            <Link key={n} rel="nofollow" prefetch={false} href={withParam({ pn: sp.pn === String(n) ? undefined : String(n) })} className={chip(sp.pn === String(n))}>
              {n}+ PN
            </Link>
          ))}
        </div>
        )}
        {/* FR-172: lọc trên cột thông số - trước đây "hẻm xe hơi" chỉ nằm trong mô tả */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 eyebrow text-mute">Đường vào</span>
          {VAO.map((v) => (
            <Link key={v.key} rel="nofollow" prefetch={false} href={withParam({ vao: sp.vao === v.key ? undefined : v.key })} className={chip(sp.vao === v.key)}>
              {v.label}
            </Link>
          ))}
        </div>
        {deal === "ban" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 eyebrow text-mute">Tầng · sổ</span>
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
          <span className="w-24 shrink-0 eyebrow text-mute">Xếp theo</span>
          {XEP.map((x) => (
            <Link key={x.key} rel="nofollow" prefetch={false} href={withParam({ xep: x.key === "moi" ? undefined : x.key })} className={chip(xep.key === x.key)}>
              {x.label}
            </Link>
          ))}
        </div>
        </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {listings.map((l) => (
          <ListingCard key={l.id} listing={l} photo={l.code ? covers[l.code] : null} />
        ))}
      </div>

      {listings.length === 0 && (
        <div className="mt-10 rounded-king bg-white p-10 text-center shadow-[0_2px_14px_rgba(13,37,61,0.06)]">
          <p className="font-semibold">Chưa có tin nào khớp bộ lọc này.</p>
          <p className="mt-1 text-sm text-mute">
            Nới bớt một tiêu chí, hoặc nhắn Zalo - có khi hàng chưa kịp lên web.
          </p>
          <a
            href={zaloLink(q ? `search:${q}` : `empty:${sp.phuong ?? deal}`)}
            className="nut nut-chinh mt-5"
          >
            Hỏi qua Zalo
          </a>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link rel="nofollow" prefetch={false} href={withParam({ trang: String(page - 1) })} className="rounded-md border border-line bg-white px-5 py-2.5 font-semibold transition hover:border-brand hover:text-brand">
              Trước
            </Link>
          )}
          <span className="px-3 text-mute tabular-nums">Trang {page}/{totalPages}</span>
          {page < totalPages && (
            <Link rel="nofollow" prefetch={false} href={withParam({ trang: String(page + 1) })} className="rounded-md border border-line bg-white px-5 py-2.5 font-semibold transition hover:border-brand hover:text-brand">
              Sau -
            </Link>
          )}
        </div>
      )}
      </div>
    </>
  );
}
