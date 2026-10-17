// ui.tsx — bộ thành phần dùng chung cho khu quản trị (09/09/2026, chủ dự án:
// "thiết kế lại cho chuẩn NN/g, bỏ hết yếu tố làm web giống AI").
// Nguyên tắc rút từ 10 heuristic của Nielsen Norman Group (docs/06 §6.11):
//   · nút là nút — chữ nghĩa rõ, góc bo nhỏ, một màu chính, không emoji, không bóng;
//   · trạng thái hệ thống luôn nhìn thấy (đang tải, đã lưu, lỗi có cách sửa);
//   · hành động huỷ hoại phải xác nhận và nói rõ hậu quả;
//   · nhất quán: cùng một việc, cùng một chữ, cùng một chỗ trên mọi trang.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Variant = "primary" | "secondary" | "danger" | "ghost";
// 10/09/2026: giữ góc bo nhỏ cho khu dữ liệu dày, nhưng thêm đúng những thứ
// một cái nút thật phải có — chiều cao chung, phản hồi khi nhấn, và nút phụ
// đậm hơn viền khung một nấc để không bị đọc nhầm thành cái thẻ.
const BTN: Record<Variant, string> = {
  primary: "bg-brand text-white border border-brand-dark/40 hover:bg-brand-dark hover:shadow-[0_5px_14px_-6px_rgba(236,99,36,0.7)] active:translate-y-px active:shadow-none",
  secondary: "bg-white text-navy border border-mute/35 hover:border-brand hover:text-brand active:translate-y-px",
  danger: "bg-white text-red-700 border border-red-300 hover:bg-red-50 hover:border-red-400 active:translate-y-px",
  ghost: "bg-transparent text-navy border border-transparent hover:bg-navy/[0.06] active:translate-y-px",
};
const BTN_BASE =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3.5 text-sm font-semibold leading-none transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-55";

export function Btn({ variant = "secondary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`${BTN_BASE} ${BTN[variant]} ${className}`} {...rest} />;
}
export function BtnLink({ href, variant = "secondary", className = "", children, title }: { href: string; variant?: Variant; className?: string; children: ReactNode; title?: string }) {
  return <Link href={href} title={title} className={`${BTN_BASE} ${BTN[variant]} ${className}`}>{children}</Link>;
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-lg border border-line bg-white ${className}`}>{children}</section>;
}
export function CardHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <h2 className="text-base font-bold text-navy">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-mute">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, crumbs, actions }: { title: string; sub?: ReactNode; crumbs?: Array<{ href?: string; label: string }>; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        {crumbs && (
          <nav aria-label="Đường dẫn" className="flex items-center gap-1.5 text-xs text-mute">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                {c.href ? <Link href={c.href} className="font-semibold text-brand hover:underline">{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy">{title}</h1>
        {sub && <p className="mt-1 text-sm text-mute">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type Tone = "neutral" | "info" | "ok" | "warn" | "danger";
const BADGE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-blue-50 text-blue-800",
  ok: "bg-emerald-50 text-emerald-800",
  warn: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
};
export function Badge({ tone = "neutral", className = "", children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold leading-tight ${BADGE[tone]} ${className}`}>{children}</span>;
}

export function Alert({ tone = "warn", children, onClose }: { tone?: Tone; children: ReactNode; onClose?: () => void }) {
  const mau = tone === "danger" ? "border-red-300 bg-red-50 text-red-800" : tone === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900";
  return (
    <div role="alert" className={`mt-4 flex items-start justify-between gap-3 rounded-md border px-4 py-2.5 text-sm ${mau}`}>
      <div>{children}</div>
      {onClose && <button type="button" onClick={onClose} aria-label="Đóng" className="font-bold opacity-70 hover:opacity-100">×</button>}
    </div>
  );
}

export const INPUT = "rounded-md border border-line bg-white px-3 py-2 text-sm text-navy outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30";

export function EmptyState({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-semibold text-navy">{title}</p>
      {hint && <p className="mt-1 text-sm text-mute">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KhuVucQuanTri({ role }: { role: "anon" | "user" }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-navy">Khu vực quản trị</h1>
      <p className="mt-2 text-sm text-mute">{role === "anon" ? "Cần đăng nhập bằng tài khoản quản trị." : "Tài khoản này không có quyền quản trị."}</p>
      {role === "anon" && <BtnLink href="/dang-nhap" variant="primary" className="mt-5">Đăng nhập</BtnLink>}
    </div>
  );
}
