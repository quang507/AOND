"use client";
// Dưới /admin/* khung CRM (components/AdminShell.tsx) có thanh riêng — header
// công khai tự ẩn để không có hai thanh chồng nhau (09/09/2026).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconHeart } from "@/components/icons";
import Logo from "@/components/Logo";
import { zaloLink } from "@/lib/format";

const NAV = [
  { href: "/mua-ban", label: "Mua bán" },
  { href: "/cho-thue", label: "Cho thuê" },
  { href: "/du-an", label: "Dự án" },
  { href: "/ban-do", label: "Bản đồ" },
  { href: "/thong-ke", label: "Giá theo phường" },
  { href: "/moi-gioi", label: "Môi giới" },
  { href: "/raoban", label: "Rao bán" },
];

// SRS-5.1zzzzzzz457: dưới lg thanh nav ẩn hẳn mà không có gì thay — trên điện thoại không có đường nào tới Rao bán, Bản đồ,
// công cụ (đánh giá 13/11, H7/PURE bước "người bán tìm chỗ rao" chấm đỏ). Thêm nút Menu mở danh sách đủ đường.
const CONG_CU = [
  { href: "/gan", label: "Nhà gần địa danh" },
  { href: "/thue-hay-mua", label: "Thuê hay mua" },
  { href: "/tinh-lai-vay", label: "Tính lãi vay" },
  { href: "/cam-nang", label: "Cẩm nang" },
];

const nutTron =
  "grid h-11 w-11 place-items-center rounded-full border border-line text-navy transition hover:border-brand hover:text-brand";

export default function Header() {
  const pathname = usePathname();
  const [mo, setMo] = useState(false);

  useEffect(() => setMo(false), [pathname]);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: KeyboardEvent) => e.key === "Escape" && setMo(false);
    document.addEventListener("keydown", dong);
    return () => document.removeEventListener("keydown", dong);
  }, [mo]);

  if (pathname?.startsWith("/admin")) return null;
  const dangO = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo size={40} />
        <nav className="hidden items-center gap-5 text-sm font-medium lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition hover:text-brand">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/yeu-thich" aria-label="Tin đã lưu" className={nutTron}>
            <IconHeart className="h-4.5 w-4.5" />
          </Link>
          <Link href="/tai-khoan" aria-label="Tài khoản" className={`${nutTron} max-sm:hidden`}>
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 19.5c1.2-3 3.8-4.5 7-4.5s5.8 1.5 7 4.5" />
            </svg>
          </Link>
          {/* CTA chính của header dùng CAM thương hiệu (Veedoo để nút accent ở
              đúng chỗ này). Xanh Zalo chỉ dành cho widget nổi - trước đây cả
              hai cùng xanh nên trang có ba nút Zalo tranh nhau. */}
          {/* .nut nằm ngoài @layer nên thắng tiện ích display: cần ! để ẩn */}
          <a href={zaloLink("header")} className="nut nut-nho min-h-11 bg-zalo text-white hover:opacity-90 max-sm:!hidden">
            Chat Zalo
          </a>
          <button
            type="button"
            onClick={() => setMo((v) => !v)}
            aria-expanded={mo}
            aria-controls="menu-di-dong"
            aria-label={mo ? "Đóng menu" : "Mở menu"}
            className={`${nutTron} lg:hidden`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
              {mo ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {mo && (
        <div id="menu-di-dong" className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line bg-white lg:hidden">
          <nav className="mx-auto grid max-w-6xl gap-6 px-4 py-5 sm:grid-cols-2">
            <ul className="grid">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={() => setMo(false)}
                    aria-current={dangO(n.href) ? "page" : undefined}
                    className="flex min-h-11 items-center text-base font-bold text-navy hover:text-brand aria-[current=page]:text-brand"
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div>
              <p className="text-sm font-bold text-mute">Công cụ</p>
              <ul className="mt-1 grid">
                {CONG_CU.map((n) => (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      onClick={() => setMo(false)}
                      aria-current={dangO(n.href) ? "page" : undefined}
                      className="flex min-h-11 items-center text-navy hover:text-brand aria-[current=page]:text-brand"
                    >
                      {n.label}
                    </Link>
                  </li>
                ))}
                <li className="sm:hidden">
                  <Link href="/tai-khoan" onClick={() => setMo(false)} className="flex min-h-11 items-center text-navy hover:text-brand">
                    Tài khoản
                  </Link>
                </li>
              </ul>
              <a href={zaloLink("menu")} target="_blank" rel="noopener" className="nut mt-4 w-full bg-zalo text-white hover:opacity-90 sm:!hidden">
                Chat Zalo
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
