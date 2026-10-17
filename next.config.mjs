/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ảnh listing hiện là placeholder local; khi nối OneDrive→Storage thì thêm remotePatterns
  images: { unoptimized: true },

  // ── Security header (P1-2, soát production 05/09/2026) ────────────────────
  // TRƯỚC: web không gửi một security header nào. `next.config.mjs` chỉ có
  // `images`, `vercel.json` chỉ có framework/install/build. Đo bằng cách đọc
  // hai file đó và grep toàn `app/` — không có `headers()` ở đâu cả.
  //
  // Bốn header dưới đây CỐ Ý chọn loại không đổi hành vi ứng dụng: chúng chỉ
  // dặn trình duyệt bớt suy diễn, không chặn tài nguyên nào đang tải.
  //
  // KHÔNG có Content-Security-Policy trong đợt này — có chủ ý, không phải quên.
  // Web đang tải từ 5 origin ngoài: `{s}.tile.openstreetmap.org` (tile bản đồ
  // Leaflet, components/MapView.tsx:29), `rqxmmqmctpklqcmbfxuj.supabase.co`
  // (PostgREST), `zalo.me` (link ra), `schema.org` (chỉ là @context của JSON-LD,
  // không fetch), `nhadat.cc` (canonical). Một CSP viết thiếu một origin là
  // trang chết IM LẶNG — bản đồ trắng, hoặc dữ liệu không tải, mà không có lỗi
  // nào trong `bot_errors` vì trình duyệt chặn chứ không phải server ném.
  // Muốn thêm CSP thì phải mở trình duyệt thật kiểm từng trang, việc đó cần
  // Playwright (docs/10 §10.3) — chưa có trong CI, nên để lại thành việc riêng.
  // 09/09/2026: domain cũ nhadat-cc.vercel.app vẫn gắn vào project → mọi đường
  // dẫn chuyển hẳn sang aioinhadat.vercel.app (308). Trước đó Supabase Auth
  // `site_url` còn trỏ domain cũ nên đăng nhập Google xong khách rơi về
  // nhadat-cc.vercel.app (phiên nằm ở đó), còn aioinhadat.vercel.app/admin thì
  // "cần đăng nhập" — hai domain là hai phiên. Auth đã đổi cùng ngày; redirect
  // này bịt nốt đường link cũ (Zalo, SEO, bookmark).
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "nhadat-cc.vercel.app" }],
        destination: "https://aioinhadat.vercel.app/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Chặn trình duyệt tự đoán kiểu file khác với Content-Type máy chủ
          // khai. Không đụng gì tới tài nguyên đang tải đúng kiểu.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Không có trang nào của web được nhúng iframe (đã grep `<iframe`
          // trong app/ và components/: 0 kết quả), nên chặn nhúng chéo miền là
          // an toàn. Chống clickjacking lên các nút hành động ở /quan-ly, /admin.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Rời sang miền khác thì chỉ gửi origin, không gửi đường dẫn đầy đủ.
          // Quan trọng ở đây vì link ra Zalo mang theo ngữ cảnh tin (FR-13):
          // đường dẫn `/nha-dat/<mã>` không nên nằm trong Referer của bên thứ ba.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Ép HTTPS cho lần truy cập sau. KHÔNG kèm `includeSubDomains` và
          // KHÔNG `preload`: cả hai đều khó rút lại, mà hiện chưa có subdomain
          // nào được kiểm. Rút lại bản này chỉ cần trả max-age=0.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
