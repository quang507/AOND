import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/format";

// NFR-09 — trang riêng tư / theo tài khoản không cho cào.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // IA-11 `/ds/` (danh sách riêng, token) và IA-02 kết quả tìm kiếm `/api/` không cào.
      // 28/09/2026: URL có tham số lọc của trang duyệt (`/mua-ban?gia=…&dt=…`) là tổ hợp vô tận, trang động — bot quét
      // 15.672 tổ hợp/giờ, hết hạn mức gọi hàm Vercel. Trang gốc vẫn cào được; tin lẻ đi qua sitemap và trang tag.
      disallow: ["/admin", "/quan-ly", "/tai-khoan", "/yeu-thich", "/dang-nhap", "/ds/", "/api/", "/mua-ban?", "/cho-thue?"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
