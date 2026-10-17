"use client";

import { useState } from "react";
import Link from "next/link";
import { CURATED_LISTINGS, type CuratedListing } from "@/lib/curated";
import { zaloLink } from "@/lib/format";
import FavButton from "@/components/FavButton";
import { IconHouse, IconPin } from "@/components/icons";

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
    <section className="mx-auto max-w-6xl px-4 py-12" id="kho-tin-tuyen-chon">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-bold tracking-wide uppercase mb-2">
            <span>⭐</span>
            <span>Kho tin tuyển chọn</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-navy tracking-tight [text-wrap:balance]">
            7 Căn nhà đất tiêu biểu · Đa dạng loại hình
          </h2>
          <p className="mt-2 text-mute text-sm max-w-2xl leading-6">
            Mỗi căn đại diện cho một phân khúc bất động sản thực tế tại Sài Gòn & Long An. Chuẩn 4 gạch đầu dòng cốt lõi, không giấu thông số, xác minh tận nơi.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/mua-ban"
            className="rounded-lg border border-line bg-white px-4 py-2 text-xs font-bold text-navy shadow-sm transition hover:border-brand hover:text-brand"
          >
            Tất cả nhà bán →
          </Link>
          <Link
            href="/cho-thue"
            className="rounded-lg border border-line bg-white px-4 py-2 text-xs font-bold text-navy shadow-sm transition hover:border-brand hover:text-brand"
          >
            Tất cả cho thuê →
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar">
        {CATEGORIES.map((cat) => {
          const active = selectedCat === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 border ${
                active
                  ? "bg-navy text-white border-navy shadow-sm"
                  : "bg-white text-mute border-line hover:border-brand/40 hover:text-navy"
              }`}
            >
              {cat.label} <span className={`ml-1 text-[11px] ${active ? "text-brand" : "text-mute/70"}`}>({cat.count})</span>
            </button>
          );
        })}
      </div>

      {/* Grid of 7 Curated Listings */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((item) => (
          <article
            key={item.id}
            className="group flex flex-col rounded-2xl bg-white border border-line overflow-hidden shadow-[0_2px_14px_rgba(13,37,61,0.06)] hover:shadow-[0_12px_28px_rgba(13,37,61,0.12)] hover:border-brand/30 transition-all duration-300"
          >
            {/* Image Thumbnail */}
            <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image}
                alt={item.title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />

              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-navy/20 to-transparent opacity-80" />

              {/* Top Badges */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
                <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold tracking-wide uppercase bg-white/95 text-navy shadow-sm backdrop-blur-sm">
                  {item.deal === "cho_thue" ? "Cho thuê" : "Đang bán"}
                </span>
                <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-navy/80 text-white backdrop-blur-sm">
                  {item.kindLabel}
                </span>
                {item.badge && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-brand text-white shadow-sm">
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Top-Right Favorite Button */}
              <div className="absolute top-3 right-3">
                <FavButton code={item.code} small />
              </div>

              {/* Bottom Info on Image */}
              <div className="absolute bottom-3 left-3 right-3 flex items-baseline justify-between text-white">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-amber-400 drop-shadow-md">
                    {item.price_display}
                  </span>
                  {item.price_sub && (
                    <span className="text-xs text-white/80 font-medium">
                      {item.price_sub}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-black/40 text-white/90">
                  {item.area_m2}m²
                </span>
              </div>
            </div>

            {/* Content Card Body */}
            <div className="p-5 flex flex-col flex-1">
              {/* Code & Location */}
              <div className="flex items-center justify-between text-xs text-mute mb-2">
                <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                  <IconPin className="w-3.5 h-3.5 text-brand shrink-0" />
                  <span className="truncate">{item.location}</span>
                </span>
                <span className="font-mono text-mute/70 text-[11px]">#{item.code}</span>
              </div>

              {/* Title (15-25 words) */}
              <h3 className="font-bold text-navy text-sm md:text-base leading-snug line-clamp-2 group-hover:text-brand transition-colors mb-4">
                {item.title}
              </h3>

              {/* Exactly 4 Core Bullet Points */}
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 mb-5 flex-1 text-xs space-y-2 text-slate-700">
                {item.bullets.map((bullet, idx) => (
                  <div key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 mt-auto pt-3 border-t border-line">
                <a
                  href={zaloLink(`tin_${item.code}`)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-xs font-bold transition hover:bg-brand-dark shadow-sm"
                >
                  <span>💬</span>
                  <span>Hỏi qua Zalo</span>
                </a>
                <Link
                  href={`/nha-dat/${item.code}`}
                  className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-line bg-white text-xs font-bold text-navy hover:border-brand hover:text-brand transition"
                >
                  Xem chi tiết
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Bottom helper text */}
      <div className="mt-8 text-center">
        <p className="text-xs text-mute">
          Cần tìm căn tương tự theo tầm tài chính hoặc khu vực cụ thể?{" "}
          <a href={zaloLink("curated_bottom")} className="font-bold text-brand hover:underline">
            Nhắn một câu qua Zalo tụi em tìm ngay →
          </a>
        </p>
      </div>
    </section>
  );
}
