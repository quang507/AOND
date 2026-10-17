// Logo chính thức "AI Ơi Nhà Đất" (chủ dự án gửi 09/09/2026). File đang dùng là
// bản SVG dựng lại ở public/img/logo.svg; có PNG gốc thì thả vào public/img/logo.png
// và đổi SRC bên dưới — mọi chỗ (Header, Footer, khung CRM) đổi theo.
import Link from "next/link";

const SRC = "/img/logo.svg";

export default function Logo({ href = "/", size = 40, className = "" }: { href?: string; size?: number; className?: string }) {
  return (
    <Link href={href} aria-label="AI Ơi Nhà Đất - về trang chủ" className={`inline-flex items-center gap-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SRC} alt="AI Ơi Nhà Đất" width={size} height={size} className="shrink-0" />
      <span className="text-lg font-bold leading-none text-navy">AI Ơi Nhà Đất</span>
    </Link>
  );
}
