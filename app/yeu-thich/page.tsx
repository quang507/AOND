"use client";
// Tin đã lưu (FR-121 — port từ NhaDat-Radar): đọc mã tin từ localStorage,
// fetch bằng anon key ngay từ trình duyệt. Không cần tài khoản — đúng lời hứa
// không bắt khách đăng ký.
import { useEffect, useState } from "react";
import ListingCard from "@/components/ListingCard";
import { readFavs } from "@/components/FavButton";
import { CARD_COLS, supabase, type ListingCard as CardRow } from "@/lib/supabase";
import { zaloLink } from "@/lib/format";

export default function Page() {
  const [listings, setListings] = useState<CardRow[] | null>(null);

  useEffect(() => {
    const codes = readFavs();
    if (codes.length === 0) return setListings([]);
    supabase
      .from("listings")
      .select(CARD_COLS) // FR-171 j
      .in("code", codes.slice(0, 48))
      .then(({ data }) => setListings((data ?? []) as CardRow[]));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-extrabold">Tin anh chị đã lưu</h1>
      <p className="mt-2 text-mute">
        Lưu trên máy này, không cần tài khoản. Muốn giữ lâu dài qua nhiều thiết
        bị thì nhắn Zalo - tụi em nhớ giùm.
      </p>

      {listings === null && (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-king bg-line" />
          ))}
        </div>
      )}

      {listings?.length === 0 && (
        <div className="mt-10 rounded-king border border-line bg-white p-10 text-center">
          <p className="font-semibold">Chưa lưu tin nào.</p>
          <p className="mt-1 text-sm text-mute">
            Bấm hình trái tim trên tin nào ưng để lưu lại đây.
          </p>
          <a
            href={zaloLink("fav-empty")}
            className="mt-5 inline-block rounded-md bg-zalo px-6 py-2.5 font-semibold text-white transition hover:opacity-90 active:scale-[0.98]"
          >
            Hoặc nhắn Zalo để tụi em tìm giùm
          </a>
        </div>
      )}

      {listings && listings.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {listings.map((l) => <ListingCard key={l.id} listing={l} />)}
        </div>
      )}
    </div>
  );
}
