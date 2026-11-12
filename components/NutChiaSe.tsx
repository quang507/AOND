"use client";
// SRS-5.1zzzzzzz430: nút Chia sẻ trên feed điện thoại — có Web Share (điện thoại) thì mở bảng chia sẻ của máy, không có thì chép link.
import { useState } from "react";

export default function NutChiaSe({ url, title }: { url: string; title: string }) {
  const [daChep, setDaChep] = useState(false);

  const chiaSe = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ url, title });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDaChep(true);
      setTimeout(() => setDaChep(false), 1500);
    } catch {
      /* người dùng đóng bảng chia sẻ / trình duyệt chặn clipboard: không làm gì */
    }
  };

  return (
    <button type="button" onClick={chiaSe} className="feed-nut" aria-label="Chia sẻ căn này">
      <span className="feed-tron">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v14" />
        </svg>
      </span>
      {daChep ? "Đã chép" : "Chia sẻ"}
    </button>
  );
}
