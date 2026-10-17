import type { Metadata } from "next";
import ListingBrowse from "@/components/ListingBrowse";

// Trang này đọc `searchParams` nên Next dựng lại từng request (ƒ); dòng
// `export const revalidate` từng nằm đây là CHỮ CHẾT — cache thật là
// `unstable_cache` trong ListingBrowse (NFR-17). Bỏ để khỏi gây hiểu lầm.
type SP = Promise<{ phuong?: string; trang?: string; q?: string }>;

// IA-02: trang kết quả tìm kiếm tự nhiên (`?q=`) KHÔNG index — tránh sinh vô
// số trang mỏng cạnh tranh với trang tag (IA-P2). Không có `q` thì index như cũ.
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const thamSo = await searchParams;
  const { q } = thamSo;
  // 28/09/2026: mọi URL có tham số lọc (không riêng `?q=`) là trang mỏng vô tận — noindex, nofollow (xem robots.ts).
  const coLoc = Object.values(thamSo).some((v) => v != null && v !== "");
  return {
    title: "Mua bán nhà đất Sài Gòn & Long An - giá mới nhất",
    description:
      "Danh sách nhà đất đang bán tại Sài Gòn (các phường mới, khởi điểm khu Quận 5 cũ) và Long An: nhà phố, hẻm xe hơi, mặt tiền. Hỏi chi tiết từng căn qua Zalo, không cần để lại số điện thoại.",
    ...(coLoc ? { robots: { index: false, follow: !!q && Object.keys(thamSo).length === 1 } } : {}),
  };
}

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <ListingBrowse
      deal="ban"
      title="Mua bán nhà đất"
      basePath="/mua-ban"
      searchParams={searchParams}
    />
  );
}
