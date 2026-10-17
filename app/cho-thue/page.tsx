import type { Metadata } from "next";
import ListingBrowse from "@/components/ListingBrowse";

// Đọc `searchParams` → route ƒ; `revalidate` ở đây là chữ chết (xem /mua-ban).
type SP = Promise<{ phuong?: string; trang?: string; q?: string }>;

// IA-02: kết quả tìm kiếm tự nhiên (`?q=`) không index (xem /mua-ban).
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const thamSo = await searchParams;
  const { q } = thamSo;
  // 28/09/2026: mọi URL có tham số lọc (không riêng `?q=`) là trang mỏng vô tận — noindex, nofollow (xem robots.ts).
  const coLoc = Object.values(thamSo).some((v) => v != null && v !== "");
  return {
    title: "Cho thuê nhà đất Sài Gòn & Long An",
    description:
      "Nhà, mặt bằng, phòng cho thuê tại Sài Gòn và Long An. Hỏi chi tiết qua Zalo, không cần để lại số điện thoại.",
    ...(coLoc ? { robots: { index: false, follow: !!q && Object.keys(thamSo).length === 1 } } : {}),
  };
}

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <ListingBrowse
      deal="cho_thue"
      title="Cho thuê nhà đất"
      basePath="/cho-thue"
      searchParams={searchParams}
    />
  );
}
