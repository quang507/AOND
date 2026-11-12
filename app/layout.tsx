import type { Metadata } from "next";
import localFont from "next/font/local";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChiNgoaiAdmin from "@/components/ChiNgoaiAdmin";
import ZaloWidget from "@/components/ZaloWidget";
import { SITE_URL } from "@/lib/format";
import "./globals.css";
import "./king.css";

// Font Nunito — font của theme King (SRS-5.1zzzzzzz430, 12/11/2026). Ghim trong repo (`app/fonts/`, OFL, bản variable của
// @fontsource-variable/nunito 5.1.0) theo đúng cách SRS-5.1zzzzzzz351 ghim Plus Jakarta Sans: next/font/google tải metadata từ Google
// mỗi lượt dựng, CI lúc lấy được lúc không. Mỗi subset một lần gọi (unicode-range lấy nguyên từ fontsource), `--font-king`
// (globals.css) ghép ba họ. Chỉ họ CUỐI giữ font dự phòng đã chỉnh cỡ — để ở họ đầu thì chữ tiếng Việt rơi vào font dự phòng trước.
const nunitoLatin = localFont({
  src: "./fonts/nunito-latin-wght-normal.woff2",
  weight: "200 1000",
  variable: "--font-nunito-latin",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
const nunitoViet = localFont({
  src: "./fonts/nunito-vietnamese-wght-normal.woff2",
  weight: "200 1000",
  variable: "--font-nunito-viet",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB" }],
});
const nunitoLatinExt = localFont({
  src: "./fonts/nunito-latin-ext-wght-normal.woff2",
  weight: "200 1000",
  variable: "--font-nunito-latin-ext",
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
    <html lang="vi" className={`${nunitoLatin.variable} ${nunitoViet.variable} ${nunitoLatinExt.variable}`}>
      <head>
        {/* SRS-5.1zzzzzzz447: ảnh .anh-dan hiện dần khi tải xong (kiểu theme King). Nghe sự kiện load ở pha bắt của document,
            chạy trước khi trình duyệt đọc tới thẻ <img> nào — không chờ React, ảnh đã có trong bộ nhớ đệm cũng không bị kẹt mờ.
            Lỗi tải cũng gắn cờ để khung không trống trơn. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'function f(e){var t=e.target;if(t&&t.classList&&t.classList.contains("anh-dan"))t.setAttribute("data-da-tai","")}document.addEventListener("load",f,true);document.addEventListener("error",f,true);',
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <Header />
        <main className="min-h-screen">{children}</main>
        <ChiNgoaiAdmin><Footer /></ChiNgoaiAdmin>
        <ZaloWidget />
      </body>
    </html>
  );
}
