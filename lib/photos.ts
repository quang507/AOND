// FR-165: ảnh thật của tin nằm trên Supabase Storage, bucket `listing-public`,
// đường dẫn "<listing UUID>/<media UUID>.<đuôi>" — neo vào ID BẤT BIẾN của tin,
// không neo vào mã tin (mã đổi được, đổi là ảnh rơi khỏi tin). Bảng
// `listing_media` giữ metadata; web và bot đọc chung qua view `listing_photos_v`.
// Tin chưa có ảnh thì rơi về ảnh minh hoạ (placeholderImg).
//
// THỨ TỰ: xếp theo (sort_order, created_at, media_id) — KHÔNG xếp theo tên file.
// Xếp theo tên thì "1.jpg, 10.jpg, 2.jpg" ra 1, 10, 2, và ảnh bìa phụ thuộc
// người đặt tên file. Ảnh bìa lấy thẳng cờ `is_cover` do DB giữ tất định.
import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";

// Hai trang /mua-ban và /cho-thue đọc searchParams nên Next dựng chúng LẠI TỪ
// ĐẦU mỗi request (build in ƒ, không ISR được vì tổ hợp bộ lọc là vô hạn).
// Không bọc cache thì mỗi lượt tải là +1 query ảnh nữa. unstable_cache đặt kết
// quả vào Data Cache của Next (trên Vercel là kho dùng chung giữa các lambda),
// khoá theo chính tham số truyền vào — trùng bộ lọc là dùng lại, khỏi hỏi DB.
// 03/10/2026 (giảm egress Supabase, SRS-5.1zl): 300 → 10800 (3 giờ). Ảnh tin mới hiện trên lưới thẻ chậm tối đa 3 giờ.
const TTL = 10800;

/** Ảnh bìa (cờ is_cover do DB giữ) cho một loạt mã tin — dùng cho lưới thẻ. */
export const coverByCode = unstable_cache(
  _coverByCode,
  ["listing-covers"],
  { revalidate: TTL, tags: ["listing-photos"] },
);

async function _coverByCode(
  codes: (string | null | undefined)[],
): Promise<Record<string, string>> {
  const list = [...new Set(codes.filter(Boolean) as string[])];
  if (!list.length) return {};
  const { data } = await supabase
    .from("listing_photos_v")
    .select("code, url")
    .in("code", list)
    .eq("is_cover", true);
  const cover: Record<string, string> = {};
  for (const r of data ?? []) {
    if (!cover[r.code as string]) cover[r.code as string] = r.url as string;
  }
  return cover;
}

/** Toàn bộ ảnh của một tin, xếp theo sort_order — dùng cho trang chi tiết. */
export const photosOfCode = unstable_cache(
  _photosOfCode,
  ["listing-photos"],
  { revalidate: TTL, tags: ["listing-photos"] },
);

async function _photosOfCode(code: string, limit = 12): Promise<string[]> {
  // Cùng lý do với getListing ở app/nha-dat/[code]: mã đi thẳng vào chuỗi .or().
  if (!/^[A-Za-z0-9-]{1,40}$/.test(code)) return [];
  const { data } = await supabase
    .from("listing_photos_v")
    .select("url, sort_order, created_at, media_id")
    .or(`code.ilike.${code},legacy_code.ilike.${code}`)
    .order("sort_order")
    .order("created_at")
    .order("media_id")
    .limit(limit);
  return (data ?? []).map((r) => r.url as string);
}
