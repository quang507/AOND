import Link from "next/link";
import { Phone, Mail, Clock, ShieldCheck, Compass } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-[var(--line)] bg-[var(--surface)]">
      <div className="max-w-6xl mx-auto px-5 py-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div>
          <div className="flex items-center gap-2 font-extrabold tracking-tight mb-3">
            <span className="w-7 h-7 rounded-lg grid place-items-center text-white text-xs bg-brand shadow-sm font-black">
              RD
            </span>
            NhaDat<span className="text-brand">Radar</span>
          </div>
          <p className="text-[var(--ink-soft)] leading-relaxed">
            Nền tảng tìm kiếm và so sánh bất động sản minh bạch: tổng hợp đa nguồn, kiểm tra giá lệch theo khu vực và xác minh dữ liệu thực tế.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Dữ liệu xác minh &amp; cập nhật liên tục</span>
          </div>
        </div>

        <div>
          <div className="font-bold mb-3">Khám phá</div>
          <ul className="space-y-2 text-[var(--ink-soft)]">
            <li><Link className="hover:text-brand transition-colors" href="/search">Tìm kiếm bất động sản</Link></li>
            <li><Link className="hover:text-brand transition-colors" href="/search?deal=ban">Nhà đất bán</Link></li>
            <li><Link className="hover:text-brand transition-colors" href="/search?deal=cho_thue">Nhà đất cho thuê</Link></li>
            <li><Link className="hover:text-brand transition-colors" href="/projects">Dự án nổi bật</Link></li>
            <li><Link className="hover:text-brand transition-colors" href="/thong-ke">Bản đồ giá thị trường</Link></li>
            <li><Link className="hover:text-brand transition-colors" href="/tin-tuc">Tin tức &amp; xu hướng</Link></li>
          </ul>
        </div>

        <div>
          <div className="font-bold mb-3">Công cụ &amp; Hướng dẫn</div>
          <ul className="space-y-2 text-[var(--ink-soft)]">
            <li><Link className="hover:text-brand transition-colors" href="/dinh-gia">AI Định giá bất động sản</Link></li>
            <li><Link className="hover:text-brand transition-colors" href="/tinh-lai-vay">Máy tính lãi vay ngân hàng</Link></li>
            <li><Link className="hover:text-brand transition-colors" href="/thue-hay-mua">So sánh Thuê hay Mua</Link></li>
            <li><Link className="hover:text-brand transition-colors" href="/huong-dan/mua">Kinh nghiệm mua &amp; thuê</Link></li>
            <li><Link className="hover:text-brand transition-colors" href="/huong-dan/ban">Kinh nghiệm bán nhà</Link></li>
            <li><Link className="hover:text-brand transition-colors" href="/agents">Mạng lưới môi giới uy tín</Link></li>
          </ul>
        </div>

        <div>
          <div className="font-bold mb-3 text-brand">Trung tâm tư vấn</div>
          <div className="space-y-3 text-[var(--ink-soft)]">
            <div>
              <span className="text-xs text-[var(--ink-faint)] block mb-0.5">Hotline hỗ trợ (8:00 - 21:00):</span>
              <a href="tel:0346689460" className="inline-flex items-center gap-2 text-base font-extrabold text-brand hover:underline">
                <Phone className="w-4 h-4" />
                0346 689 460
              </a>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-4 h-4 text-[var(--ink-faint)] shrink-0" />
              <span>Hỗ trợ các ngày trong tuần (T2 - CN)</span>
            </div>
            <p className="text-xs text-[var(--ink-faint)] leading-relaxed pt-1 border-t border-[var(--line)]">
              Tư vấn kiểm tra pháp lý, quy hoạch, thẩm định giá và đặt lịch dẫn xem nhà thực tế miễn phí.
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--line)] py-5 text-center text-xs text-[var(--ink-faint)] space-y-2">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-medium">
          <Link href="/gioi-thieu" className="hover:text-brand transition-colors">Giới thiệu</Link>
          <Link href="/lien-he" className="hover:text-brand transition-colors">Liên hệ</Link>
          <Link href="/chinh-sach-bao-mat" className="hover:text-brand transition-colors">Chính sách bảo mật</Link>
          <Link href="/dieu-khoan-su-dung" className="hover:text-brand transition-colors">Điều khoản sử dụng</Link>
        </div>
        <div>
          © {new Date().getFullYear()} NhaDat Radar. Dữ liệu tổng hợp từ các nguồn công khai, chỉ mang tính chất tham khảo.
        </div>
      </div>
    </footer>
  );
}
