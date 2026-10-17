import Link from "next/link";
import FavButton from "@/components/FavButton";
import type { ListingCard as CardRow } from "@/lib/supabase";
import { formatArea, formatPrice, placeholderImg } from "@/lib/format";
import { IconPin } from "@/components/icons";

export default function ListingCard({
  listing,
  featured,
  photo,
}: {
  listing: CardRow;
  featured?: boolean;
  photo?: string | null;
}) {
  const code = listing.code ?? listing.id.slice(0, 8);
  const title =
    listing.street?.trim() ||
    `${listing.ward ?? ""} ${listing.district ?? ""}`.trim() ||
    "Bất động sản Sài Gòn & Long An";
  const loc = [listing.ward, listing.district].filter(Boolean).join(", ") || "TP. Hồ Chí Minh";
  const priceStr = formatPrice(listing.price_vnd, listing.price_raw);
  const areaStr = formatArea(listing.area_m2);

  return (
    <div className="group flex flex-col rounded-lg bg-white border border-slate-200 overflow-hidden shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200">
      {/* Thumbnail */}
      <Link href={`/nha-dat/${encodeURIComponent(code)}`} className="relative aspect-[16/10] overflow-hidden bg-slate-100 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo ?? placeholderImg(code)}
          alt={title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Deal Tag */}
        {listing.deal && (
          <span className="absolute top-2 left-2 rounded bg-slate-900/80 text-white text-[11px] font-semibold px-2 py-0.5 backdrop-blur-xs">
            {listing.deal === "cho_thue" ? "Cho thuê" : "Bán"}
          </span>
        )}
        {/* Verified Badge on Photo */}
        <span className="absolute top-2 right-2 rounded bg-emerald-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 backdrop-blur-xs shadow-xs">
          ✓ Xác thực
        </span>
      </Link>

      {/* Body */}
      <div className="p-3 sm:p-3.5 flex flex-col flex-1">
        {/* Title */}
        <Link
          href={`/nha-dat/${encodeURIComponent(code)}`}
          className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-brand transition-colors"
          title={title}
        >
          {title}
        </Link>

        {/* Price & Area */}
        <div className="mt-2 flex items-baseline gap-2 text-sm">
          <span className="text-[#DC2626] font-extrabold text-base">{priceStr}</span>
          {listing.area_m2 ? (
            <>
              <span className="text-slate-300 font-normal">|</span>
              <span className="text-slate-600 font-semibold text-xs">{areaStr}</span>
            </>
          ) : null}
        </div>

        {/* Location */}
        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 truncate">
          <IconPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{loc}</span>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span>Đăng hôm nay</span>
          <FavButton code={code} variant="square" />
        </div>
      </div>
    </div>
  );
}
