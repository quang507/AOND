"use client";
// FR-145: widget Zalo nổi góc TRÁI dưới (vị trí widget chat quen thuộc) — bấm
// là mở chat Zalo (acc clone trong lúc chờ OA, xem lib/format.ts ZALO_OA_URL).
// Ở trang chi tiết căn (/nha-dat/…) thì ẨN widget — trang đó đã có nút
// "Chat Zalo về căn này" mang ngữ cảnh nằm ngay trong bài (FR-13/14).
import { usePathname } from "next/navigation";
import { zaloLink } from "@/lib/format";

export default function ZaloWidget() {
  const pathname = usePathname();
  if (pathname?.startsWith("/nha-dat/")) return null;
  // Khung CRM /admin/* là chỗ làm việc của admin, không mời chat Zalo (09/09/2026).
  if (pathname?.startsWith("/admin")) return null;
  return (
    <a
      href={zaloLink(`widget:${pathname ?? "/"}`)}
      target="_blank"
      rel="noopener"
      aria-label="Chat Zalo với AI Ơi Nhà Đất"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-zalo py-2.5 pl-3 pr-4 font-bold text-white shadow-lg shadow-zalo/30 transition hover:opacity-90 active:scale-[0.97]"
    >
      {/* logo chat bubble tối giản, không kéo thư viện icon */}
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden>
        <path d="M12 3C6.5 3 2 6.9 2 11.7c0 2.7 1.4 5.1 3.6 6.7-.1 1-.5 2.1-1.3 3 1.6-.2 3-.8 4-1.5 1.1.3 2.4.5 3.7.5 5.5 0 10-3.9 10-8.7S17.5 3 12 3Z" />
      </svg>
      Chat Zalo
    </a>
  );
}
