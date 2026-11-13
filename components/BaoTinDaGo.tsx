"use client";

// SRS-5.1zzzzzzz457: trang not-found của /nha-dat/<mã> báo về /api/tin-da-go để bộ đệm danh sách bỏ thẻ của tin đã gỡ.
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function BaoTinDaGo() {
  const path = usePathname();
  useEffect(() => {
    const code = decodeURIComponent(path?.split("/")[2] ?? "");
    if (!code) return;
    void fetch("/api/tin-da-go", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => {});
  }, [path]);
  return null;
}
