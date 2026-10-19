"use client";
// Bọc phần chỉ thuộc web công khai (chân trang). Khung CRM /admin/* có thanh riêng; trước 19/10/2026 chân trang công
// khai (thương hiệu, hotline) vẫn hiện dưới mọi trang CRM vì Footer là server component không đọc được đường dẫn.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function ChiNgoaiAdmin({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname?.startsWith("/admin") ? null : <>{children}</>;
}
