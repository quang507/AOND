import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import FavButton from "@/components/FavButton";
import { IconPin, IconSearch } from "@/components/icons";
import { formatPrice, zaloLink } from "@/lib/format";
import { supabase } from "@/lib/supabase";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Danh sách Dự án Bất động sản HCM, Bình Dương, Đồng Nai, Long An, Tây Ninh | AI Ơi Nhà Đất",
  description:
    "Tra cứu thông tin dự án bất động sản căn hộ, khu dân cư, biệt thự tại TP.HCM, Bình Dương, Đồng Nai, Long An, Tây Ninh. Cập nhật bảng giá, tiến độ bàn giao và chủ đầu tư.",
};

const PROVINCE_TABS = [
  { id: "all", label: "Tất cả khu vực" },
  { id: "Hồ Chí Minh", label: "TP. Hồ Chí Minh" },
  { id: "Bình Dương", label: "Bình Dương" },
  { id: "Đồng Nai", label: "Đồng Nai" },
  { id: "Long An", label: "Long An" },
  { id: "Tây Ninh", label: "Tây Ninh" },
];

// 18/10/2026 (SRS-5.1zzzzzzz45, chủ dự án "mình cần data đúng"): trang này đọc file tĩnh `data/mogi_projects.json` (bản crawl
// cũ, thiếu dự án), gắn ảnh nhà mẫu khi thiếu ảnh và nhãn "✓ Xác thực" cho mọi dự án. Nay đọc bảng `projects` (2.361 dự án 5 tỉnh,
// ảnh mogi thật); trang đọc searchParams nên không ISR được → bọc `unstable_cache` 1 giờ theo (từ khoá, tỉnh, trang).
type DuAnThe = {
  name: string; slug: string; developer: string | null; location_raw: string | null; province: string | null;
  handover: string | null; status_text: string | null; price_min: number | null; price_max: number | null; cover: string | null;
};
const PAGE_SIZE = 16;

const timDuAn = unstable_cache(
  async (q: string, tinh: string, trang: number): Promise<{ items: DuAnThe[]; total: number }> => {
    let truyVan = supabase
      .from("projects")
      .select("name, slug, developer, location_raw, province, handover, status_text, price_min, price_max, cover:images->>0", { count: "exact" });
    if (tinh !== "all") truyVan = truyVan.eq("province", tinh);
    // Từ khoá đi thẳng vào chuỗi `.or()` của PostgREST — bỏ ký tự ngữ pháp / wildcard.
    const tu = q.replace(/[^\p{L}\p{N}\s.-]/gu, " ").replace(/\s+/g, " ").trim();
    if (tu) truyVan = truyVan.or(`name.ilike.*${tu}*,developer.ilike.*${tu}*,location_raw.ilike.*${tu}*`);
    const { data, count } = await truyVan.order("name").range((trang - 1) * PAGE_SIZE, trang * PAGE_SIZE - 1);
    return { items: (data ?? []) as unknown as DuAnThe[], total: count ?? 0 };
  },
  ["du-an-danh-sach"],
  { revalidate: 3600, tags: ["projects"] },
);

const demTheoTinh = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const dem: Record<string, number> = {};
    await Promise.all(
      PROVINCE_TABS.map(async (t) => {
        let truyVan = supabase.from("projects").select("id", { count: "exact", head: true });
        if (t.id !== "all") truyVan = truyVan.eq("province", t.id);
        const { count } = await truyVan;
        dem[t.id] = count ?? 0;
      }),
    );
    return dem;
  },
  ["du-an-dem-tinh"],
  { revalidate: 3600, tags: ["projects"] },
);

function giaDuAn(p: DuAnThe): string | null {
  const a = p.price_min, b = p.price_max;
  if (a && b && a !== b) return `${formatPrice(a, null)} – ${formatPrice(b, null)}`;
  if (a || b) return formatPrice((a || b) as number, null);
  return null;
}

export default async function DuAnPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; tinh?: string; trang?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const q = resolvedParams.q?.trim() || "";
  const tinh = resolvedParams.tinh?.trim() || "all";
  const trang = Math.max(1, parseInt(resolvedParams.trang || "1", 10) || 1);

  const { items: projects, total: totalCount } = await timDuAn(q, tinh, trang);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const provinceCounts = await demTheoTinh();

  return (
    <div className="min-h-screen bg-slate-50/70 pb-16">
      {/* Page Header */}
      <div className="bg-[#0B192C] text-white py-10 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#DDF2FD]/15 text-[#60A5FA] text-xs font-bold tracking-wide uppercase mb-3">
            <span>Kho dữ án bất động sản</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            Dự án Bất động sản TP.HCM & Vùng Phụ Cận
          </h1>
          <p className="mt-2 text-white/75 text-sm sm:text-base max-w-2xl leading-relaxed">
            Tra cứu thông tin {totalCount} dự án tại TP.HCM, Bình Dương, Đồng Nai, Long An, Tây Ninh.
            Cập nhật hình ảnh thực tế, bảng giá tham khảo, tiến độ bàn giao và chủ đầu tư.
          </p>

          {/* Search Bar */}
          <form method="get" action="/du-an" className="mt-6 flex flex-col sm:flex-row gap-2 max-w-xl">
            {tinh !== "all" && <input type="hidden" name="tinh" value={tinh} />}
            <div className="relative flex-1">
              <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Tìm tên dự án, chủ đầu tư (VD: Masteri, Mizuki, Sunrise...)"
                className="w-full pl-10 pr-4 py-2.5 rounded-md bg-white text-[#0B192C] text-sm font-medium outline-none placeholder:text-slate-400 shadow-xs"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-md bg-[#0068FF] text-white text-sm font-bold shadow-xs transition hover:bg-blue-600 shrink-0"
            >
              Tìm kiếm
            </button>
          </form>
        </div>
      </div>

      {/* Main Container */}
      <div className="mx-auto max-w-6xl px-4 pt-6">
        {/* Province Quick Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 no-scrollbar">
          {PROVINCE_TABS.map((tab) => {
            const active = (tinh === tab.id) || (tab.id === "all" && tinh === "all");
            const count = provinceCounts[tab.id] || 0;
            const href = tab.id === "all"
              ? `/du-an${q ? `?q=${encodeURIComponent(q)}` : ""}`
              : `/du-an?tinh=${encodeURIComponent(tab.id)}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
            return (
              <Link
                key={tab.id}
                href={href}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-md text-xs font-bold transition-all border flex items-center gap-1.5 ${
                  active
                    ? "bg-[#0068FF] text-white border-[#0068FF] shadow-xs"
                    : "bg-white text-slate-600 border-slate-200 hover:border-[#0068FF] hover:text-[#0068FF]"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {count}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Content Layout: Main List (Left) + Region Sidebar (Right) matching Mogi */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Main List Column */}
          <div className="lg:col-span-3">
            <div className="mb-4 flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>
                Tìm thấy <strong className="text-[#0B192C] font-bold">{totalCount}</strong> dự án
                {tinh !== "all" ? ` tại ${tinh}` : ""}
                {q ? ` khớp từ khoá "${q}"` : ""}
              </span>
              <span>
                Trang {trang} / {Math.max(1, totalPages)}
              </span>
            </div>

            {projects.length > 0 ? (
              <div className="space-y-4">
                {projects.map((p) => {
                  const gia = giaDuAn(p);
                  return (
                    <article
                      key={p.slug}
                      className="group bg-white rounded-lg border border-slate-200 p-3.5 sm:p-4 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col sm:flex-row gap-4"
                    >
                      {/* Photo Thumbnail */}
                      <Link
                        href={`/du-an/${p.slug}`}
                        className="relative w-full sm:w-56 aspect-[16/10] sm:aspect-[4/3] rounded-md overflow-hidden bg-slate-100 shrink-0 block"
                      >
                        {p.cover ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={p.cover}
                            alt={p.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-xs text-slate-400">Chưa có ảnh</span>
                        )}
                      </Link>

                      {/* Info Body */}
                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          {/* Title */}
                          <Link
                            href={`/du-an/${p.slug}`}
                            className="font-bold text-[#0B192C] text-base leading-snug hover:text-[#0068FF] transition-colors line-clamp-1"
                            title={p.name}
                          >
                            {p.name}
                          </Link>

                          {/* Developer / Investor */}
                          {p.developer && (
                            <p className="mt-1 text-xs font-semibold uppercase text-slate-500 tracking-wide line-clamp-1">
                              {p.developer}
                            </p>
                          )}

                          {/* Location & Handover */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                            <span className="flex items-center gap-1 text-slate-500">
                              <IconPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {p.location_raw}
                            </span>
                            {p.handover && (
                              <>
                                <span className="text-slate-300">|</span>
                                <span className="text-slate-500">Bàn giao: <strong className="text-slate-700">{p.handover}</strong></span>
                              </>
                            )}
                          </div>

                          {/* Price Range & Price/m2 */}
                          <div className="mt-2.5 flex items-baseline gap-2">
                            <span className="text-[#DC2626] font-extrabold text-base">
                              {gia ?? "Liên hệ báo giá"}
                            </span>
                          </div>
                        </div>

                        {/* Footer: Status Tags + Detail CTA */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {p.status_text && (
                              <span className="px-2 py-0.5 rounded bg-[#DDF2FD] text-[#0068FF] text-[11px] font-semibold">
                                {p.status_text}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium">
                              {p.province}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <FavButton code={p.slug} variant="square" />
                            <Link
                              href={`/du-an/${p.slug}`}
                              className="px-3.5 py-1.5 rounded-md bg-[#0068FF] text-white text-xs font-bold hover:bg-blue-600 transition"
                            >
                              Xem chi tiết
                            </Link>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-line bg-white p-12 text-center text-slate-500 shadow-sm">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-bold text-[#0B192C] text-lg">Không tìm thấy dự án phù hợp</p>
                <p className="mt-1 text-sm text-slate-500">
                  Vui lòng thử tìm kiếm với từ khoá khác hoặc chọn lại khu vực.
                </p>
                <Link
                  href="/du-an"
                  className="mt-5 inline-block px-5 py-2.5 rounded-md bg-[#0068FF] text-white text-xs font-bold shadow"
                >
                  Xem tất cả dự án
                </Link>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                {trang > 1 && (
                  <Link
                    href={`/du-an?trang=${trang - 1}${tinh !== "all" ? `&tinh=${encodeURIComponent(tinh)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                    className="px-4 py-2 rounded-md border border-slate-200 bg-white text-xs font-bold text-[#0B192C] hover:border-[#0068FF] hover:text-[#0068FF] transition"
                  >
                    ← Trang trước
                  </Link>
                )}

                <div className="flex items-center gap-1 text-xs font-bold text-[#0B192C] px-3.5 py-2 bg-white rounded-md border border-slate-200">
                  <span>Trang {trang} / {totalPages}</span>
                </div>

                {trang < totalPages && (
                  <Link
                    href={`/du-an?trang=${trang + 1}${tinh !== "all" ? `&tinh=${encodeURIComponent(tinh)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                    className="px-4 py-2 rounded-md border border-slate-200 bg-white text-xs font-bold text-[#0B192C] hover:border-[#0068FF] hover:text-[#0068FF] transition"
                  >
                    Trang sau →
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Right Sidebar: Regional List matching Mogi UI */}
          <aside className="space-y-6">
            <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#0B192C] border-b border-slate-100 pb-3">
                Dự án BĐS theo khu vực
              </h2>
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {PROVINCE_TABS.map((tab) => {
                  const count = provinceCounts[tab.id] || 0;
                  const isCur = (tinh === tab.id) || (tab.id === "all" && tinh === "all");
                  return (
                    <li key={tab.id}>
                      <Link
                        href={tab.id === "all" ? "/du-an" : `/du-an?tinh=${encodeURIComponent(tab.id)}`}
                        className={`flex items-center justify-between py-2.5 transition-colors ${
                          isCur ? "font-bold text-[#0068FF]" : "text-slate-700 hover:text-[#0068FF]"
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          isCur ? "bg-[#DDF2FD] text-[#0068FF] font-bold" : "bg-slate-100 text-slate-500 font-medium"
                        }`}>
                          {count}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Quick Zalo Consultation CTA */}
            <div className="bg-[#DDF2FD]/70 rounded-lg border border-[#0068FF]/20 p-5 shadow-xs">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white text-[#0068FF] text-[11px] font-bold uppercase mb-2">
                Hỗ trợ 24/7
              </div>
              <h3 className="font-bold text-[#0B192C] text-sm">
                Cần tư vấn chọn căn & pháp lý dự án?
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Nhắn tin Zalo với chuyên viên AOND để nhận bảng giá giỏ hàng mới nhất và kiểm tra quy hoạch miễn phí.
              </p>
              <a
                href={zaloLink("Tư vấn dự án bất động sản")}
                target="_blank"
                rel="noreferrer"
                className="mt-4 flex items-center justify-center min-h-[44px] w-full text-center py-2.5 px-4 rounded-md bg-[#0068FF] text-white text-xs font-bold shadow-xs hover:bg-blue-600 transition"
              >
                Nhắn Zalo tư vấn ngay
              </a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
