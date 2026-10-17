"use client";

import { useEffect, useState } from "react";
import { IconHeart } from "@/components/icons";

const KEY = "nhadatcc_favs";

export function readFavs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function FavButton({
  code,
  small,
  variant = "circle",
  className = "",
}: {
  code: string;
  small?: boolean;
  variant?: "circle" | "square";
  className?: string;
}) {
  const [fav, setFav] = useState(false);

  useEffect(() => {
    setFav(readFavs().includes(code));
  }, [code]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const cur = readFavs();
      const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
      localStorage.setItem(KEY, JSON.stringify(next));
      setFav(next.includes(code));
      window.dispatchEvent(new CustomEvent("ndr:favs"));
    } catch {
      /* storage bị chặn thì nút chỉ không nhớ */
    }
  };

  if (variant === "square") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={fav ? "Bỏ lưu tin" : "Lưu tin"}
        className={`w-8 h-8 rounded-md border border-slate-200 flex items-center justify-center transition-all hover:bg-slate-50 hover:border-slate-300 ${
          fav ? "text-red-500 bg-red-50/50 border-red-200" : "text-slate-400 hover:text-red-500"
        } ${className}`}
      >
        <IconHeart className="h-4 w-4" filled={fav} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={fav ? "Bỏ lưu tin" : "Lưu tin"}
      className={`grid place-items-center rounded-full bg-white/90 text-brand shadow transition hover:scale-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-brand ${
        small ? "h-8 w-8" : "h-10 w-10"
      } ${className}`}
    >
      <IconHeart className={small ? "h-4 w-4" : "h-5 w-5"} filled={fav} />
    </button>
  );
}
