"use client";

import { useState } from "react";
import Link from "next/link";
import { CURATED_LISTINGS } from "@/lib/curated";
import FavButton from "@/components/FavButton";
import { IconPin } from "@/components/icons";

const CATEGORIES = [
  { id: "all", label: "Tất cả", count: 7 },
  { id: "nha", label: "Nhà phố & Hẻm ô tô", count: 2 },
  { id: "can_ho", label: "Căn hộ chung cư", count: 1 },
  { id: "biet_thu", label: "Biệt thự compound", count: 1 },
  { id: "mat_bang", label: "Mặt bằng kinh doanh", count: 1 },
  { id: "dat", label: "Đất thổ cư", count: 1 },
  { id: "toa_nha", label: "Toà nhà dòng tiền", count: 1 },
];

export default function CuratedShowcase() {
  const [selectedCat, setSelectedCat] = useState("all");

  const filtered = selectedCat === "all"
    ? CURATED_LISTINGS
    : CURATED_LISTINGS.filter((item) => item.kind === selectedCat);

  return (
    <section className="mx-auto max-w-6xl px-4 py-10" id="kho-tin-tuyen-chon">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#DDF2FD] text-[#0068FF] text-xs font-bold tracking-wide uppercase mb-2">
            <span>Kho tin tiêu biểu</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-navy tracking-tight [text-wrap:balance]">
            Nhà đất tuyển chọn · Sài Gòn & Long An
          </h2>
          <p className="mt-1 text-mute text-xs sm:text-sm max-w-2xl leading-relaxed">
            Tuyển chọn 7 căn tiêu biểu đa dạng loại hình. Thông tin xác thực, giá niêm yết chính xác, liên hệ trực tiếp qua Zalo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/mua-ban"
            className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-bold text-navy shadow-xs transition hover:border-brand hover:text-brand"
          >
            Mua bán →
          </Link>
          <Link
            href="/cho-thue"
            className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-bold text-navy shadow-xs transition hover:border-brand hover:text-brand"
          >
            Cho thuê →
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 no-scrollbar">
        {CATEGORIES.map((cat) => {
          const active = selectedCat === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-md text-xs font-bold transition-all duration-200 border ${
                active
                  ? "bg-brand text-white border-brand shadow-xs"
                  : "bg-white text-mute border-line hover:border-brand/40 hover:text-navy"
              }`}
            >
              {cat.label} <span className={`ml-1 text-[11px] ${active ? "text-white/80" : "text-mute/70"}`}>({cat.count})</span>
            </button>
          );
        })}
      </div>

      {/* Grid: 4 columns standard layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="group flex flex-col rounded-lg bg-white border border-slate-200 overflow-hidden shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200"
          >
            {/* Thumbnail link */}
            <Link href={`/nha-dat/${item.code}`} className="relative aspect-[16/10] overflow-hidden bg-slate-100 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image}
                alt={item.title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {/* Verified badge on photo */}
              {item.verified && (
                <span className="absolute top-2 right-2 rounded bg-emerald-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 backdrop-blur-xs shadow-xs">
                  ✓ Xác thực
                </span>
              )}
            </Link>

            {/* Card Body */}
            <div className="p-3 sm:p-3.5 flex flex-col flex-1">
              {/* Title (2 lines clamp) */}
              <Link
                href={`/nha-dat/${item.code}`}
                className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-brand transition-colors"
                title={item.title}
              >
                {item.title}
              </Link>

              {/* Price & Area */}
              <div className="mt-2 flex items-baseline gap-2 text-sm">
                <span className="text-[#DC2626] font-extrabold text-base">{item.price_display}</span>
                <span className="text-slate-300 font-normal">|</span>
                <span className="text-slate-600 font-semibold text-xs">{item.area_display}</span>
              </div>

              {/* Location */}
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 truncate">
                <IconPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{item.location}</span>
              </div>

              {/* Footer: Date posted + Square Fav Button */}
              <div className="mt-auto pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>{item.posted_time}</span>
                <FavButton code={item.code} variant="square" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
