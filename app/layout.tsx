import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ZaloWidget from "@/components/ZaloWidget";
import { SITE_URL } from "@/lib/format";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
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
    <html lang="vi" className={plusJakartaSans.variable}>
      <body className="font-sans antialiased">
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <ZaloWidget />
      </body>
    </html>
  );
}
