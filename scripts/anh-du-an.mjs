// anh-du-an.mjs — lấy ẢNH dự án từ trang chi tiết mogi.vn (docs/07 SRS-5.1zzzzzzz36).
//
// Chủ dự án 18/10/2026: "cứ lấy ảnh đi 4 5 ảnh trong 1 dự án … để người hỏi mua thì bot tự gửi ảnh". Đổi quyết định cũ của
// `thu-du-an.mjs` (không chép ảnh). Chỉ giữ ĐƯỜNG DẪN ảnh trên CDN mogi (`cloud.mogi.vn/project/…`), không tải về kho: 5 ảnh ×
// ~2.400 dự án ≈ 650 MB, gần chạm trần Storage gói Free. Đổi lại, ảnh vỡ nếu mogi gỡ — trang web và bot bỏ qua ảnh tải hỏng.
//
// Chỉ đọc khối thư viện `<div class="media-item"><img src|data-src=…>` (ảnh của CHÍNH dự án); ảnh dự án liên quan, logo, huy
// hiệu nằm ngoài khối đó. Bỏ trùng (thư viện in một ảnh nhiều lần), giữ thứ tự trang, tối đa `toiDa` ảnh.

const ANH = /<div class="media-item">\s*<img\b[^>]*?\b(?:data-src|src)="(https:\/\/cloud\.mogi\.vn\/project\/[^"\s]+\.(?:jpe?g|png|webp))"/gi;

/** html trang chi tiết mogi → mảng URL ảnh (≤ toiDa). */
export function bocAnhDuAn(html, toiDa = 5) {
  const ra = [];
  for (const m of String(html ?? "").matchAll(ANH)) {
    if (!ra.includes(m[1])) ra.push(m[1]);
    if (ra.length >= toiDa) break;
  }
  return ra;
}
