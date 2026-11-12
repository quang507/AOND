// SRS-5.1zzzzzzz443: chân trang viết lại. Bản cũ (từ lúc gộp repo 17/10) là chân trang của NhaDat-Radar: ghi tên "NhaDat Radar",
// "Dữ liệu tổng hợp từ các nguồn công khai", một số hotline không rõ của ai, và 12 link tới trang aond không có (/search, /projects,
// /tin-tuc, /dinh-gia, /huong-dan, /agents, /gioi-thieu, /lien-he…) → 404. Giờ chỉ link trang có thật; liên hệ qua Zalo như cả web.
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
      ["/raoban", "Rao bán miễn phí"],
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
      <div className="border-t border-line py-5 text-center text-xs text-mute">
        © {new Date().getFullYear()} AI Ơi Nhà Đất. Tin rao ghi theo lời chủ nhà và môi giới; điều chưa xác minh có ghi rõ.
      </div>
    </footer>
  );
}
