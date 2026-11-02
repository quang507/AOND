import type { Metadata } from "next";
import localFont from "next/font/local";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChiNgoaiAdmin from "@/components/ChiNgoaiAdmin";
import ZaloWidget from "@/components/ZaloWidget";
import { SITE_URL } from "@/lib/format";
import "./globals.css";

// 02/11/2026 (SRS-5.1zzzzzzz351): font ghim trong repo (`app/fonts/`, OFL, bản variable 200–800 của fontsource 5.3.0) thay
// `next/font/google` — bản cũ tải metadata font từ Google mỗi lượt dựng, runner CI lúc lấy được lúc không ("Cannot read properties
// of null (reading '1')" ở loader.js), cổng web đỏ oan. next/font/local không khai unicode-range theo từng file, nên mỗi subset là
// một lần gọi (unicode-range lấy nguyên từ fontsource) và `--font-jakarta` (globals.css) ghép ba họ: trình duyệt chọn họ theo từng
// ký tự. Chỉ họ CUỐI giữ font dự phòng đã chỉnh cỡ — để ở họ đầu thì chữ tiếng Việt rơi vào font dự phòng trước khi tới họ vietnamese.
const jakartaLatin = localFont({
  src: "./fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-jakarta-latin",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
const jakartaViet = localFont({
  src: "./fonts/plus-jakarta-sans-vietnamese-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-jakarta-viet",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB" }],
});
const jakartaLatinExt = localFont({
  src: "./fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-jakarta-latin-ext",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
});

// NFR-09: metadataBase để canonical/OpenGraph ở trang con ghi đường dẫn tương
// đối; trang không tự khai canonical thì mặc định là chính URL của nó.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AI Ơi Nhà Đất - Mua bán nhà đất Sài Gòn và Long An, chat là xong",
    template: "%s | AI Ơi Nhà Đất",
  },
  description:
    "Môi giới bất động sản Sài Gòn (các phường mới) và Long An, trực 24/7 qua Zalo. Không thu số điện thoại, không spam. Nhà phố, hẻm xe hơi, mặt tiền - hỏi là có.",
  alternates: { canonical: "./" },
  openGraph: {
    siteName: "AI Ơi Nhà Đất",
    locale: "vi_VN",
    type: "website",
    images: [{ url: "/img/house1.jpg", width: 1200, height: 800, alt: "Nhà phố Sài Gòn" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${jakartaLatin.variable} ${jakartaViet.variable} ${jakartaLatinExt.variable}`}>
      <body className="font-sans antialiased">
        <Header />
        <main className="min-h-screen">{children}</main>
        <ChiNgoaiAdmin><Footer /></ChiNgoaiAdmin>
        <ZaloWidget />
      </body>
    </html>
  );
}
