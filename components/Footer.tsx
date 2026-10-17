"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { zaloLink } from "@/lib/format";
import { FEATURED_TAGS } from "@/lib/tags";

export default function Footer() {
  // Dưới /admin/* là khung CRM, không có chân trang công khai (09/09/2026).
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return (
    <>
      <footer className="bg-navy text-white/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 text-xl font-bold text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/img/logo.svg" alt="" width={36} height={36} className="rounded bg-white p-0.5" />
              AI Ơi Nhà Đất
            </p>
            <p className="mt-3 text-sm leading-6">
              Môi giới bất động sản Sài Gòn và Long An, trực 24/7 qua Zalo. Không thu số điện
              thoại, không spam - trò chuyện tới khi anh chị tìm được nhà.
            </p>
          </div>
          <div className="text-sm">
            <p className="mb-3 font-semibold text-white">Khu vực</p>
            <ul className="space-y-2">
              <li><Link href="/mua-ban" className="hover:text-brand">Mua bán nhà đất Sài Gòn & Long An</Link></li>
              <li><Link href="/cho-thue" className="hover:text-brand">Cho thuê nhà đất</Link></li>
              <li><Link href="/ban-do" className="hover:text-brand">Bản đồ nhà đất</Link></li>
              <li><Link href="/tinh-lai-vay" className="hover:text-brand">Tính lãi vay</Link></li>
              <li><Link href="/thong-ke" className="hover:text-brand">Giá theo phường</Link></li>
              <li><Link href="/dang-nhap" className="hover:text-brand">Dành cho nhà môi giới</Link></li>
            </ul>
          </div>
          <div className="text-sm">
            {/* FR-12 / IA-P4: link chéo sang trang tag để Google đi được từ chân trang */}
            <p className="mb-3 font-semibold text-white">Tìm nhiều</p>
            <ul className="space-y-2">
              {FEATURED_TAGS.map((t) => (
                <li key={t.slug}><Link href={`/${t.slug}`} className="hover:text-brand">{t.keyword}</Link></li>
              ))}
            </ul>
          </div>
          <div className="text-sm">
            <p className="mb-3 font-semibold text-white">Liên hệ</p>
            <ul className="space-y-2">
              <li><a href={zaloLink("footer")} className="hover:text-brand">Zalo AI Ơi Nhà Đất</a></li>
              <li>admin.buyerside@nhadat.cc</li>
              <li className="text-white/50">Địa giới hiển thị theo quận/phường trước 1/7/2025</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
          © 2026 AI Ơi Nhà Đất - Người môi giới thường trực của anh chị
        </div>
      </footer>
      {/* Bỏ nút sticky mobile cũ ở đây: nó trùng y hệt ZaloWidget (FR-145) vốn
          đã nổi sẵn mọi trang, nên trên mobile hiện hai nút Zalo chồng nhau. */}
    </>
  );
}
