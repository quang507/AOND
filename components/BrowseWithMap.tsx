"use client";

import { useState } from "react";
import ListingCard from "@/components/ListingCard";
import MapView from "@/components/MapView";
import type { ListingCard as CardRow, MapRow } from "@/lib/supabase";

export default function BrowseWithMap({
  listings,
  covers,
  total,
  basePath,
  filterSection,
  paginationSection,
  q,
}: {
  listings: CardRow[];
  covers: Record<string, string>;
  total: number;
  basePath: string;
  filterSection: React.ReactNode;
  paginationSection: React.ReactNode;
  q?: string;
}) {
  const [showMap, setShowMap] = useState(false);

  // Map rows from listings
  const mapRows: MapRow[] = listings.map((l) => ({
    ...l,
    lat: (l as unknown as { lat?: number }).lat ?? null,
    lng: (l as unknown as { lng?: number }).lng ?? null,
  }));

  return (
    <div className="mx-auto w-full px-4 pb-12 transition-all duration-300">
      {/* Top Search & Actions bar */}
      <div className="-mt-10 mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-lg bg-white p-3.5 shadow-[0_12px_32px_rgba(13,37,61,0.12)] border border-slate-100">
        <form
          action={basePath}
          method="get"
          className="flex flex-1 items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Nhập địa điểm, tên đường, khu vực..."
              className="w-full rounded-md border border-slate-200 px-3.5 py-2 text-sm font-medium text-navy placeholder:text-slate-400 outline-none focus:border-brand"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-[#DC2626] px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#B91C1C] transition"
          >
            Tìm kiếm
          </button>
        </form>

        {/* Nút Xem bản đồ / Đóng bản đồ theo phong cách Batdongsan.com.vn */}
        <button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-bold shadow-sm transition shrink-0 ${
            showMap
              ? "bg-[#0052CC] text-white hover:bg-[#0043A8]"
              : "bg-[#0068FF] text-white hover:bg-[#0052CC]"
          }`}
        >
          {showMap ? (
            <>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              <span>Đóng bản đồ</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2" aria-hidden>
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
              <span>Xem bản đồ</span>
            </>
          )}
        </button>
      </div>

      {/* Filter Chips Bar */}
      <div className="mb-6">{filterSection}</div>

      {/* Content Area: Full width OR Split Screen View */}
      {showMap ? (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Left Column: Listings in 2-column grid */}
          <div className="w-full lg:w-[55%] xl:w-[57%] flex flex-col">
            <div className="mb-3 text-xs text-slate-500 font-medium">
              Hiển thị <strong className="text-navy">{listings.length}</strong> / {total} bất động sản
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {listings.map((l) => (
                <ListingCard key={l.id} listing={l} photo={l.code ? covers[l.code] : null} />
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-8">{paginationSection}</div>
          </div>

          {/* Right Column: Sticky Interactive Map with Close Button (matching Image 2) */}
          <div className="hidden lg:block lg:w-[45%] xl:w-[43%] sticky top-20">
            <div className="relative h-[calc(100vh-120px)] w-full overflow-hidden rounded-lg border border-slate-200/90 shadow-md bg-slate-100">
              {/* Floating Close Button on Map */}
              <button
                type="button"
                onClick={() => setShowMap(false)}
                className="absolute top-3 right-3 z-[1000] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0068FF] text-white text-xs font-bold shadow-md hover:bg-[#0052CC] transition backdrop-blur-sm"
              >
                <span>✕</span>
                <span>Đóng bản đồ</span>
              </button>

              <MapView listings={mapRows} />
            </div>
          </div>
        </div>
      ) : (
        /* Full width 4-column grid */
        <div>
          <div className="mb-3 text-xs text-slate-500 font-medium">
            Hiển thị <strong className="text-navy">{listings.length}</strong> / {total} bất động sản
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} photo={l.code ? covers[l.code] : null} />
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-8">{paginationSection}</div>
        </div>
      )}
    </div>
  );
}
