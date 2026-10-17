"use client";
// Ghi "tin đã xem gần đây" (FR-126): luôn lưu localStorage; nếu đã đăng nhập
// thì đồng bộ thêm lên listing_views để giữ qua nhiều thiết bị.
import { useEffect } from "react";

const KEY = "nhadatcc_recent";

export function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

// Có phiên đăng nhập trong máy này không — đọc thẳng localStorage, KHÔNG dựng
// client Supabase. supabase-js (kèm GoTrue) là ~63KB gzip; đây là component
// DUY NHẤT kéo nó vào bundle trang tin, mà trang tin là 164 trang SEO Google
// cào nhiều nhất và khách ẩn danh là tuyệt đại đa số. Chỉ khi thấy khoá phiên
// `sb-<ref>-auth-token` mới nạp client (FR-171 j).
function coPhienDangNhap(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
    }
  } catch { /* storage bị chặn */ }
  return false;
}

export default function TrackView({ code, listingId }: { code: string; listingId: string }) {
  useEffect(() => {
    try {
      const cur = readRecent().filter((c) => c !== code);
      cur.unshift(code);
      localStorage.setItem(KEY, JSON.stringify(cur.slice(0, 24)));
    } catch { /* storage bị chặn thì thôi */ }
    if (!coPhienDangNhap()) return;
    import("@/lib/supabase").then(async ({ supabase }) => {
      // getSession đọc phiên trong máy, không gọi GoTrue như getUser.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      await supabase.from("listing_views").upsert({
        auth_user_id: session.user.id,
        listing_id: listingId,
        viewed_at: new Date().toISOString(),
      });
    }).catch(() => { /* không ghi được lượt xem thì thôi */ });
  }, [code, listingId]);
  return null;
}
