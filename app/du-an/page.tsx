import type { Metadata } from "next";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatPrice, placeholderImg } from "@/lib/format";
import FavButton from "@/components/FavButton";
import { IconPin, IconSearch } from "@/components/icons";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Danh sách Dự án Bất động sản Sài Gòn & Long An | AI Ơi Nhà Đất",
  description:
    "Tra cứu hơn 2.300 dự án căn hộ, khu dân cư, biệt thự và khu đô thị tại TP. Hồ Chí Minh và Long An. Giá bán, tình trạng bàn giao và thông tin xác thực.",
};

const PAGE_SIZE = 32;

const POPULAR_DISTRICTS = [
  { id: "all", label: "Tất cả" },
  { id: "Quận 7", label: "Quận 7" },
  { id: "Quận 8", label: "Quận 8" },
  { id: "Bình Chánh", label: "Bình Chánh" },
  { id: "Nhà Bè", label: "Nhà Bè" },
  { id: "Thủ Đức", label: "TP. Thủ Đức" },
  { id: "Bình Thạnh", label: "Bình Thạnh" },
  { id: "Bình Tân", label: "Bình Tân" },
  { id: "Long An", label: "Long An" },
];

type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  developer: string | null;
  district: string | null;
  ward: string | null;
  province: string | null;
  price_min: number | null;
  price_max: number | null;
  status_text: string | null;
  handover: string | null;
  images: unknown;
  is_partner?: boolean | null;
};

function formatProjectPrice(min: number | null, max: number | null): string {
  if (min && max && min !== max) {
    return `${formatPrice(min, null)} - ${formatPrice(max, null)}`;
  }
  if (min) return `Từ ${formatPrice(min, null)}`;
  if (max) return `Đến ${formatPrice(max, null)}`;
  return "Liên hệ báo giá";
}

function getProjectImage(p: ProjectRow): string {
  if (Array.isArray(p.images) && p.images.length > 0) {
    const first = p.images[0];
    if (typeof first === "string" && /^https?:\/\//.test(first)) return first;
    if (first && typeof first === "object" && "url" in first && typeof first.url === "string") return first.url;
  }
  return placeholderImg(p.slug);
}

export default async function DuAnPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; quan?: string; trang?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const q = resolvedParams.q?.trim() || "";
  const quan = resolvedParams.quan?.trim() || "all";
  const trang = Math.max(1, parseInt(resolvedParams.trang || "1", 10) || 1);

  const from = (trang - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("projects")
    .select(
      "id, name, slug, developer, district, ward, province, price_min, price_max, status_text, handover, images, is_partner",
      { count: "exact" }
    )
    .order("name", { ascending: true })
    .range(from, to);

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  if (quan !== "all") {
    query = query.ilike("district", `%${quan}%`);
  }

  const { data: rawProjects, count } = await query;
  const projects = (rawProjects ?? []) as ProjectRow[];
  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      {/* Page Header */}
      <div className="bg-navy text-white py-12 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/10 text-[#60A5FA] text-xs font-bold tracking-wide uppercase mb-3">
            <span>🏢</span>
            <span>Kho dự án bất động sản</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Dự án Bất động sản Sài Gòn & Long An
          </h1>
          <p className="mt-2 text-white/75 text-sm sm:text-base max-w-2xl leading-relaxed">
            Tra cứu thông tin {totalCount > 0 ? totalCount.toLocaleString("vi-VN") : "2.300+"} dự án căn hộ, khu dân cư, biệt thự đô thị. Đầy đủ pháp lý, bảng giá và tiến độ bàn giao.
          </p>

          {/* Search Bar in Header */}
          <form method="get" action="/du-an" className="mt-6 flex flex-col sm:flex-row gap-2 max-w-xl">
            {quan !== "all" && <input type="hidden" name="quan" value={quan} />}
            <div className="relative flex-1">
              <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Tìm tên dự án (VD: Sunrise, Mizuki, Glory...)"
                className="w-full pl-10 pr-4 py-2.5 rounded-md bg-white text-navy text-sm font-medium outline-none placeholder:text-slate-400 shadow-sm"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-md bg-brand text-white text-sm font-bold shadow transition hover:bg-brand-dark shrink-0"
            >
              Tìm kiếm
            </button>
          </form>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-4 pt-8">
        {/* District Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar">
          {POPULAR_DISTRICTS.map((d) => {
            const active = (quan === d.id) || (d.id === "all" && quan === "all");
            const href = d.id === "all"
              ? `/du-an${q ? `?q=${encodeURIComponent(q)}` : ""}`
              : `/du-an?quan=${encodeURIComponent(d.id)}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
            return (
              <Link
                key={d.id}
                href={href}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-md text-xs font-bold transition-all border ${
                  active
                    ? "bg-brand text-white border-brand shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:border-brand hover:text-brand"
                }`}
              >
                {d.label}
              </Link>
            );
          })}
        </div>

        {/* Total stats */}
        <div className="mb-4 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>
            Tìm thấy <strong className="text-navy font-bold">{totalCount.toLocaleString("vi-VN")}</strong> dự án
            {quan !== "all" ? ` tại ${quan}` : ""}
            {q ? ` khớp từ khoá "${q}"` : ""}
          </span>
          <span>
            Trang {trang} / {Math.max(1, totalPages)}
          </span>
        </div>

        {/* 4-column Grid matching Image 2 */}
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {projects.map((p) => {
              const imageSrc = getProjectImage(p);
              const priceDisplay = formatProjectPrice(p.price_min, p.price_max);
              const loc = [p.district, p.province].filter(Boolean).join(", ") || "TP. Hồ Chí Minh";
              const tagText = p.status_text || (p.handover ? `Bàn giao ${p.handover}` : "Đang cập nhật");

              return (
                <div
                  key={p.id}
                  className="group flex flex-col rounded-xl bg-white border border-slate-200/90 overflow-hidden shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200"
                >
                  {/* Thumbnail */}
                  <Link href={`/du-an/${p.slug}`} className="relative aspect-[16/10] overflow-hidden bg-slate-100 block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageSrc}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </Link>

                  {/* Body */}
                  <div className="p-3.5 sm:p-4 flex flex-col flex-1">
                    {/* Project Name */}
                    <Link
                      href={`/du-an/${p.slug}`}
                      className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-brand transition-colors"
                      title={p.name}
                    >
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 mr-1.5 align-middle tracking-wide">
                        ✓ XÁC THỰC
                      </span>
                      <span>{p.name}</span>
                    </Link>

                    {/* Price & Developer */}
                    <div className="mt-2 flex items-baseline gap-1.5 text-[15px] sm:text-base font-bold">
                      <span className="text-[#DC2626] font-extrabold truncate">{priceDisplay}</span>
                    </div>

                    {/* Location */}
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 truncate">
                      <IconPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{loc}</span>
                    </div>

                    {/* Footer: Handover status + Fav Button */}
                    <div className="mt-auto pt-3 flex items-center justify-between text-xs text-slate-400 border-t border-slate-100">
                      <span className="truncate max-w-[70%]">{tagText}</span>
                      <FavButton code={p.slug} variant="square" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-white p-12 text-center text-slate-500 shadow-sm">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-bold text-navy text-lg">Không tìm thấy dự án phù hợp</p>
            <p className="mt-1 text-sm text-slate-500">
              Vui lòng thử tìm kiếm với từ khoá khác hoặc chọn lại khu vực.
            </p>
            <Link
              href="/du-an"
              className="mt-5 inline-block px-5 py-2.5 rounded-xl bg-navy text-white text-xs font-bold shadow"
            >
              Xem tất cả dự án
            </Link>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            {trang > 1 && (
              <Link
                href={`/du-an?trang=${trang - 1}${quan !== "all" ? `&quan=${encodeURIComponent(quan)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-navy hover:border-brand hover:text-brand transition"
              >
                ← Trang trước
              </Link>
            )}

            <div className="flex items-center gap-1 text-xs font-bold text-navy px-3 py-2 bg-white rounded-xl border border-slate-200">
              <span>Trang {trang} / {totalPages}</span>
            </div>

            {trang < totalPages && (
              <Link
                href={`/du-an?trang=${trang + 1}${quan !== "all" ? `&quan=${encodeURIComponent(quan)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-navy hover:border-brand hover:text-brand transition"
              >
                Trang sau →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
