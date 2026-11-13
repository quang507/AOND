// SRS-5.1zzzzzzz443: chân trang viết lại. Bản cũ (từ lúc gộp repo 17/10) là chân trang của NhaDat-Radar: ghi tên "NhaDat Radar",
// "Dữ liệu tổng hợp từ các nguồn công khai", một số hotline không rõ của ai, và 12 link tới trang aond không có (/search, /projects,
// /tin-tuc, /dinh-gia, /huong-dan, /agents, /gioi-thieu, /lien-he…) → 404. Giờ chỉ link trang có thật; liên hệ qua Zalo như cả web.
// SRS-5.1zzzzzzz451: hotline 0346 689 460 là số của team (chủ dự án xác nhận 12/11/2026) → gắn lại, dưới nút Zalo.
import Link from "next/link";
import Logo from "@/components/Logo";
import { zaloLink } from "@/lib/format";

const COT: { tieuDe: string; link: [string, string][] }[] = [
  {
    tieuDe: "Tìm nhà",
    link: [
      ["/mua-ban", "Nhà đất bán"],
      ["/cho-thue", "Nhà đất cho thuê"],
      ["/du-an", "Dự án"],
      ["/ban-do", "Bản đồ"],
      ["/gan", "Nhà gần địa danh"],
    ],
  },
  {
    tieuDe: "Công cụ, cẩm nang",
    link: [
      ["/thong-ke", "Giá theo phường"],
      ["/tinh-lai-vay", "Tính lãi vay"],
      ["/thue-hay-mua", "Thuê hay mua"],
      ["/cam-nang", "Cẩm nang mua bán nhà"],
    ],
  },
  {
    tieuDe: "Người bán",
    link: [
      ["/raoban", "Rao bán nhà"],
      ["/moi-gioi", "Môi giới"],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo size={32} />
          <p className="mt-3 max-w-xs leading-6 text-mute">
            Tìm và rao nhà Sài Gòn, Long An qua Zalo. Không thu số điện thoại, không gọi làm phiền.
          </p>
          <a href={zaloLink("footer")} target="_blank" rel="noopener" className="nut nut-nho mt-4 bg-zalo text-white hover:opacity-90">
            Nhắn Zalo
          </a>
          <p className="mt-3 text-mute">
            Hotline{" "}
            <a href="tel:0346689460" className="font-semibold text-navy tabular-nums hover:text-brand">
              0346 689 460
            </a>
          </p>
        </div>
        {COT.map((c) => (
          <div key={c.tieuDe}>
            <h2 className="font-bold text-navy">{c.tieuDe}</h2>
            <ul className="mt-3 space-y-2 text-mute">
              {c.link.map(([href, nhan]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-brand">
                    {nhan}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {/* SRS-5.1zzzzzzz457: có lề ngang; chừa đáy cho bong bóng Zalo nổi trên điện thoại */}
      <div className="border-t border-line px-4 pb-20 pt-5 text-center text-xs text-mute md:pb-5">
        © {new Date().getFullYear()} AI Ơi Nhà Đất. Tin rao ghi theo lời chủ nhà và môi giới; điều chưa xác minh có ghi rõ.
      </div>
    </footer>
  );
}
