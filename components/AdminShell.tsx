"use client";
// AdminShell — khung CRM cho mọi trang /admin/* (09/09/2026). Bố cục lấy từ
// ZaloCRM (chỉ bố cục, mã của họ là AGPL); chuẩn trình bày theo NN/g
// (docs/06 §6.11): icon SVG kèm chữ, không emoji, không pill, không bóng;
// tab là URL để chia sẻ link; trạng thái (việc chờ, lỗi bot) luôn nhìn thấy;
// đăng xuất có chữ, không giấu sau avatar.
import { Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { IconBell, IconChart, IconChat, IconEdit, IconGrid, IconList, IconLogout, IconPlus, IconSettings, IconUsers } from "@/components/icons";

type Tab = { href: string; label: string; Icon: (p: { className?: string }) => ReactNode; khop: (p: string, tab: string | null) => boolean; title?: string };

const TABS: Tab[] = [
  { href: "/admin", label: "Bàn làm việc", Icon: IconGrid, khop: (p, t) => p === "/admin" && (!t || t === "todo") },
  { href: "/admin?tab=crm", label: "Khách hàng", Icon: IconUsers, khop: (p, t) => p === "/admin" && t === "crm" },
  { href: "/admin/tin-nhan", label: "Tin nhắn", Icon: IconChat, khop: (p) => p.startsWith("/admin/tin-nhan") },
  { href: "/admin/ro-hang", label: "Rổ hàng", Icon: IconList, khop: (p) => p.startsWith("/admin/ro-hang") || p.startsWith("/admin/dang-tin") },
  { href: "/admin/mau-cau", label: "Mẫu câu", Icon: IconEdit, khop: (p) => p.startsWith("/admin/mau-cau"), title: "Câu chuẩn để huấn luyện giọng bot (FR-180)" },
  { href: "/admin?tab=stats", label: "Báo cáo", Icon: IconChart, khop: (p, t) => p === "/admin" && t === "stats" },
  { href: "/admin?tab=ops", label: "Vận hành", Icon: IconSettings, khop: (p, t) => p === "/admin" && t === "ops" },
];

function ThanhTren() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const tab = sp.get("tab");
  const [email, setEmail] = useState<string | null>(null);
  const [chuong, setChuong] = useState<{ viec: number; loi: number; zaloLoi: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [moMenu, setMoMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let song = true;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!song || !user) return;
      setEmail(user.email ?? null);
      const d1 = new Date(Date.now() - 86400e3).toISOString();
      const [v, l, z] = await Promise.all([
        supabase.from("reminders").select("id", { count: "exact", head: true }).eq("status", "pending").in("kind", ["escalation", "report"]),
        // Đếm theo LOẠI lỗi, không đếm từng dòng: một sự cố lặp 80 lần vẫn là MỘT
        // việc phải xử. Trước bản này chuông đứng "99+" trong khi ô "Cần xử lý"
        // là 0 — con số không nói được gì thì người ta thôi nhìn nó (10/09).
        supabase.from("bot_errors").select("source").gte("at", d1).limit(500),
        // FR-203 f: Zalo clone chưa đăng nhập = bot không nhận, không gửi được tin
        // Zalo nào → chấm đỏ trên tab Vận hành, thấy được từ MỌI trang /admin/*.
        supabase.from("bridge_dang_nhap").select("trang_thai, yeu_cau_quet_lai").eq("id", 1).maybeSingle(),
      ]);
      const loai = new Set(((l.data ?? []) as { source: string | null }[]).map((x) => x.source ?? "?"));
      const dn = z.data as { trang_thai: string; yeu_cau_quet_lai: boolean } | null;
      const zaloLoi = !!dn && (dn.trang_thai !== "dang_nhap" || dn.yeu_cau_quet_lai);
      if (song) setChuong({ viec: v.count ?? 0, loi: loai.size, zaloLoi });
    });
    return () => { song = false; };
  }, [pathname]);

  useEffect(() => {
    if (!moMenu) return;
    const dong = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMoMenu(false); };
    document.addEventListener("mousedown", dong);
    return () => document.removeEventListener("mousedown", dong);
  }, [moMenu]);

  const tim = (e: FormEvent) => {
    e.preventDefault();
    const k = q.trim();
    if (k) router.push(`/admin/ro-hang?q=${encodeURIComponent(k)}`);
  };
  const dangXuat = () => supabase.auth.signOut().then(() => location.assign("/"));
  const tongChuong = (chuong?.viec ?? 0) + (chuong?.loi ?? 0);

  return (
    <header className="sticky top-0 z-40 border-b border-navy-soft bg-navy text-white">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-1 px-3">
        <Link href="/admin" className="mr-3 flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/10" aria-label="Về bàn làm việc">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/logo.svg" alt="" width={32} height={32} className="h-8 w-8 rounded-md bg-white p-0.5" />
          <span className="hidden leading-tight md:block">
            <span className="block text-sm font-bold">AI Ơi Nhà Đất</span>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-white/60">Quản trị</span>
          </span>
        </Link>
        <nav aria-label="Phân hệ" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {TABS.map((t) => {
            const on = t.khop(pathname, tab);
            // FR-203 f: Zalo clone chưa đăng nhập → tab Vận hành mang chấm đỏ.
            const loiTab = t.href === "/admin?tab=ops" && !!chuong?.zaloLoi;
            return (
              <Link
                key={t.href}
                href={t.href}
                title={loiTab ? "Zalo clone chưa đăng nhập, bot không nhận/gửi được tin Zalo. Vào quét mã QR" : t.title ?? t.label}
                aria-current={on ? "page" : undefined}
                className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${on ? "bg-white text-navy" : "text-white/85 hover:bg-white/10 hover:text-white"}`}
              >
                <t.Icon className="h-4 w-4" />
                {/* 14/09/2026 (WCAG 4.1.2): `hidden` là display:none — dưới 1280px 6/7 link không có tên đọc được. */}
                <span className={on || loiTab ? "" : "sr-only xl:not-sr-only"}>{t.label}</span>
                {loiTab && (
                  <span aria-label="đang lỗi" className="inline-block h-2 w-2 rounded-full bg-brand ring-2 ring-navy" />
                )}
              </Link>
            );
          })}
        </nav>
        <form onSubmit={tim} role="search" className="hidden lg:block">
          <label className="sr-only" htmlFor="tim-crm">Tìm trong rổ hàng</label>
          <input
            id="tim-crm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã tin, đường, người bán"
            className="w-44 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/50 outline-none focus:border-white/60 focus:bg-white/15 2xl:w-64"
          />
        </form>
        <Link href="/admin/dang-tin" className="ml-1 hidden shrink-0 items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark sm:flex">
          <IconPlus className="h-4 w-4" /> Đăng tin
        </Link>
        <Link
          href="/admin?tab=todo"
          title={chuong ? `${chuong.viec} việc chờ · ${chuong.loi} lỗi bot 24 giờ qua` : "Việc chờ"}
          aria-label="Việc chờ"
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-white/10"
        >
          <IconBell className="h-5 w-5" />
          {tongChuong > 0 && (
            <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded bg-brand px-1 text-center text-[10px] font-bold leading-4">
              {tongChuong > 99 ? "99+" : tongChuong}
            </span>
          )}
        </Link>
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMoMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={moMenu}
            title={email ?? "Tài khoản"}
            className="flex h-9 items-center gap-2 rounded-md px-1.5 hover:bg-white/10"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold uppercase">{(email ?? "?").slice(0, 1)}</span>
            <span className="hidden max-w-[140px] truncate text-xs text-white/80 xl:block">{email ?? ""}</span>
          </button>
          {moMenu && (
            <div role="menu" className="absolute right-0 mt-1 w-56 rounded-md border border-line bg-white p-1 text-navy shadow-lg">
              <div className="truncate px-3 py-2 text-xs text-mute">{email}</div>
              <button type="button" role="menuitem" onClick={dangXuat} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-medium hover:bg-cream/70">
                <IconLogout className="h-4 w-4" /> Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream/50">
      <Suspense fallback={<div className="h-14 bg-navy" />}>
        <ThanhTren />
      </Suspense>
      {children}
    </div>
  );
}
