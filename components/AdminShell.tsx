"use client";
// AdminShell — khung CRM cho mọi trang /admin/* (09/09/2026; bố cục lại 19/10/2026, SRS-5.1zzzzzzz72).
// Chuẩn trình bày theo NN/g (docs/06 §6.11): icon SVG kèm chữ, không emoji, không pill, không bóng; tab là URL để
// chia sẻ link; trạng thái (việc chờ, lỗi bot, Zalo clone) luôn nhìn thấy; đăng xuất có chữ.
// 19/10: điều hướng sang CỘT TRÁI chia ba nhóm theo việc (hằng ngày · rổ hàng · hệ thống) — thanh trên chỉ còn tìm,
// Đăng tin, chuông. Trước đó 6 tab nằm ngang cùng 4 thẻ số liệu cũng chuyển tab: hai lối đi cho một việc, và mọi tab
// của /admin lặp cùng một tiêu đề nên không biết đang đứng ở đâu. Dưới 1024px cột trái thành một hàng cuộn ngang.
import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { IconBell, IconChart, IconChat, IconEdit, IconGrid, IconList, IconLogout, IconPlus, IconSettings, IconUsers } from "@/components/icons";

type Tab = { href: string; label: string; Icon: (p: { className?: string }) => ReactNode; khop: (p: string, tab: string | null) => boolean };
type Nhom = { ten: string; tabs: Tab[] };
type Chuong = { viec: number; loi: number; zaloLoi: boolean };

const NHOM: Nhom[] = [
  {
    ten: "Hằng ngày",
    tabs: [
      { href: "/admin", label: "Bàn làm việc", Icon: IconGrid, khop: (p, t) => p === "/admin" && (!t || t === "todo") },
      { href: "/admin/tin-nhan", label: "Tin nhắn", Icon: IconChat, khop: (p) => p.startsWith("/admin/tin-nhan") },
      { href: "/admin/cau-chuan", label: "Câu chuẩn", Icon: IconEdit, khop: (p) => p.startsWith("/admin/cau-chuan") },
      { href: "/admin?tab=crm", label: "Khách hàng", Icon: IconUsers, khop: (p, t) => p === "/admin" && t === "crm" },
    ],
  },
  {
    ten: "Rổ hàng",
    tabs: [
      { href: "/admin/ro-hang", label: "Rổ hàng", Icon: IconList, khop: (p) => p.startsWith("/admin/ro-hang") },
      { href: "/admin/dang-tin", label: "Đăng tin", Icon: IconPlus, khop: (p) => p.startsWith("/admin/dang-tin") },
    ],
  },
  {
    ten: "Hệ thống",
    tabs: [
      { href: "/admin?tab=stats", label: "Báo cáo", Icon: IconChart, khop: (p, t) => p === "/admin" && t === "stats" },
      { href: "/admin?tab=ops", label: "Vận hành", Icon: IconSettings, khop: (p, t) => p === "/admin" && t === "ops" },
    ],
  },
];

function useChuong(pathname: string) {
  const [email, setEmail] = useState<string | null>(null);
  const [chuong, setChuong] = useState<Chuong | null>(null);
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
        // Zalo nào → chấm đỏ trên mục Vận hành, thấy được từ MỌI trang /admin/*.
        supabase.from("bridge_dang_nhap").select("trang_thai, yeu_cau_quet_lai").eq("id", 1).maybeSingle(),
      ]);
      const loai = new Set(((l.data ?? []) as { source: string | null }[]).map((x) => x.source ?? "?"));
      const dn = z.data as { trang_thai: string; yeu_cau_quet_lai: boolean } | null;
      const zaloLoi = !!dn && (dn.trang_thai !== "dang_nhap" || dn.yeu_cau_quet_lai);
      if (song) setChuong({ viec: v.count ?? 0, loi: loai.size, zaloLoi });
    });
    return () => { song = false; };
  }, [pathname]);
  return { email, chuong };
}

const dangXuat = () => supabase.auth.signOut().then(() => location.assign("/"));

function DauMuc({ t, on, chuong, ngang }: { t: Tab; on: boolean; chuong: Chuong | null; ngang?: boolean }) {
  // FR-203 f: Zalo clone chưa đăng nhập → mục Vận hành mang chấm đỏ.
  const loiTab = t.href === "/admin?tab=ops" && !!chuong?.zaloLoi;
  const mau = ngang
    ? on ? "border-brand text-navy" : "border-transparent text-mute hover:text-navy"
    : on ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white";
  return (
    <Link
      href={t.href}
      title={loiTab ? "Zalo clone chưa đăng nhập, bot không nhận/gửi được tin Zalo. Vào quét mã QR" : t.label}
      aria-current={on ? "page" : undefined}
      className={ngang
        ? `flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold ${mau}`
        : `relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${mau}`}
    >
      {!ngang && on && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded bg-brand" />}
      <t.Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{t.label}</span>
      {loiTab && <span aria-label="đang lỗi" className="inline-block h-2 w-2 rounded-full bg-brand" />}
    </Link>
  );
}

function KhungCrm({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const tab = sp.get("tab");
  const { email, chuong } = useChuong(pathname);
  const [q, setQ] = useState("");

  const tim = (e: FormEvent) => {
    e.preventDefault();
    const k = q.trim();
    if (k) router.push(`/admin/ro-hang?q=${encodeURIComponent(k)}`);
  };
  const tongChuong = (chuong?.viec ?? 0) + (chuong?.loi ?? 0);
  const tatCa = NHOM.flatMap((n) => n.tabs);

  return (
    <div className="min-h-screen bg-cream/50 lg:flex">
      {/* Cột trái (≥1024px): logo · ba nhóm mục · tài khoản */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-navy text-white lg:flex">
        <Link href="/admin" className="flex h-14 items-center gap-2.5 border-b border-white/10 px-4" aria-label="Về bàn làm việc">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/logo.svg" alt="" width={32} height={32} className="h-8 w-8 rounded-md bg-white p-0.5" />
          <span className="leading-tight">
            <span className="block text-sm font-bold">AI Ơi Nhà Đất</span>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-white/55">Quản trị</span>
          </span>
        </Link>
        <nav aria-label="Phân hệ" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NHOM.map((n) => (
            <div key={n.ten}>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">{n.ten}</div>
              <div className="space-y-0.5">
                {n.tabs.map((t) => <DauMuc key={t.href} t={t} on={t.khop(pathname, tab)} chuong={chuong} />)}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="truncate px-3 text-xs text-white/60" title={email ?? ""}>{email ?? ""}</div>
          <button type="button" onClick={dangXuat} className="mt-1 flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-white/75 hover:bg-white/5 hover:text-white">
            <IconLogout className="h-4 w-4" /> Đăng xuất
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-line bg-white">
          <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
            <Link href="/admin" className="flex items-center gap-2 lg:hidden" aria-label="Về bàn làm việc">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/img/logo.svg" alt="" width={28} height={28} className="h-7 w-7 rounded-md" />
              <span className="text-sm font-bold text-navy">Quản trị</span>
            </Link>
            <form onSubmit={tim} role="search" className="hidden flex-1 md:block">
              <label className="sr-only" htmlFor="tim-crm">Tìm trong rổ hàng</label>
              <input
                id="tim-crm"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm mã tin, đường, người bán"
                className="w-full max-w-md rounded-md border border-line bg-cream/60 px-3 py-1.5 text-sm text-navy outline-none placeholder:text-mute focus:border-brand focus:bg-white"
              />
            </form>
            <div className="ml-auto flex items-center gap-1">
              <Link href="/admin/dang-tin" className="hidden shrink-0 items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark sm:flex">
                <IconPlus className="h-4 w-4" /> Đăng tin
              </Link>
              <Link
                href="/admin?tab=todo"
                title={chuong ? `${chuong.viec} việc chờ · ${chuong.loi} loại lỗi bot 24 giờ qua` : "Việc chờ"}
                aria-label={chuong ? `Việc chờ: ${chuong.viec} việc, ${chuong.loi} loại lỗi bot` : "Việc chờ"}
                className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md text-navy hover:bg-cream"
              >
                <IconBell className="h-5 w-5" />
                {tongChuong > 0 && (
                  <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded bg-brand px-1 text-center text-[10px] font-bold leading-4 text-white">
                    {tongChuong > 99 ? "99+" : tongChuong}
                  </span>
                )}
              </Link>
              <button type="button" onClick={dangXuat} className="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-navy hover:bg-cream lg:hidden">
                <IconLogout className="h-4 w-4" /> <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </div>
          </div>
          {/* Dưới 1024px: mọi mục trên một hàng cuộn ngang, chữ luôn hiện. */}
          <nav aria-label="Phân hệ" className="flex overflow-x-auto border-t border-line px-2 lg:hidden">
            {tatCa.map((t) => <DauMuc key={t.href} t={t} on={t.khop(pathname, tab)} chuong={chuong} ngang />)}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream/50" />}>
      <KhungCrm>{children}</KhungCrm>
    </Suspense>
  );
}
