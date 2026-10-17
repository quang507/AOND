"use client";
// Yêu thích không cần tài khoản (FR-121, port từ NhaDat-Radar): lưu mã tin
// vào localStorage, xem lại ở /yeu-thich. Try/catch vì storage có thể bị chặn.
import { useEffect, useState } from "react";
import { IconHeart } from "@/components/icons";

const KEY = "nhadatcc_favs";

export function readFavs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function FavButton({ code, small }: { code: string; small?: boolean }) {
  const [fav, setFav] = useState(false);
  useEffect(() => setFav(readFavs().includes(code)), [code]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const cur = readFavs();
      const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
      localStorage.setItem(KEY, JSON.stringify(next));
      setFav(next.includes(code));
    } catch { /* storage bị chặn thì nút chỉ không nhớ */ }
  };

  return (
    <button
      onClick={toggle}
      aria-label={fav ? "Bỏ lưu tin" : "Lưu tin"}
      className={`grid place-items-center rounded-full bg-white/90 text-brand shadow transition hover:scale-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-brand ${small ? "h-8 w-8" : "h-10 w-10"}`}
    >
      <IconHeart className={small ? "h-4 w-4" : "h-5 w-5"} filled={fav} />
    </button>
  );
}
