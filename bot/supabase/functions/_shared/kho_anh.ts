// kho_anh.ts — FR-185 (09/09/2026): kéo ảnh chủ nhà gửi qua Zalo về KHO của
// mình rồi ghi `listing_media`. Chủ dự án: "thì ảnh phải gắn vào kho chứ".
//
// Vì sao phải kéo về: URL CDN Zalo là URL TẠM (FR-111) — vài ngày là chết, web
// hiện ô trống, khách xin hình thì bot đưa link hỏng. Và ảnh GIẤY TỜ (sổ hồng,
// CCCD) từng thành fact `hinh_anh` rồi gửi thẳng cho khách mua (OPEN-32): giờ
// giấy tờ đi bucket `listing-private` (link ký 15 phút, NFR-06), ảnh nhà đi
// `listing-public`; không phân loại được thì cất RIÊNG TƯ — thà web thiếu một
// tấm còn hơn sổ đỏ người ta nằm trên CDN công khai.
//
// Hai luật chép từ CLAUDE.md §6 (up-anh.mjs): `sort_order` int4 CHECK 0..9999
// (đếm dòng hiện có + 1, không lấy dấu thời gian); Storage trả 200 rồi không cất
// file là chuyện có thật — insert `listing_media` chỉ sau khi upload trả về
// không lỗi, và có lỗi thì trả null để tầng gọi rơi về đường cũ (fact URL).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const KICH_THUOC_TOI_DA = 8 * 1024 * 1024; // 8 MB — ảnh Zalo nén ≤ 3 MB

/** Tải ảnh về bộ nhớ (hạn 15 s, trần 8 MB). Lỗi → null, không ném. */
export async function taiAnh(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const mime = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim().toLowerCase();
    if (!/^image\/(jpeg|jpg|png|webp|heic|gif)$/.test(mime)) return null;
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > KICH_THUOC_TOI_DA) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > KICH_THUOC_TOI_DA) return null;
    return { bytes: buf, mime: mime === "image/jpg" ? "image/jpeg" : mime };
  } catch {
    return null;
  }
}

export type LoaiMedia = "mat_tien" | "trong_nha" | "phong_ngu" | "bep" | "wc" | "san_thuong" | "view" | "hem" | "so_do" | "giay_to" | "khac";
const DUOI: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/gif": "gif",
};

/**
 * Cất một tấm vào kho + ghi `listing_media`. Trả về {bucket, path, url} — `url`
 * chỉ có với bucket công khai (đọc `app_config.storage_public_base_url` như view
 * `listing_photos_v`); giấy tờ trả url null vì không được phát ra ngoài.
 */
export async function catAnhVaoKho(
  client: SupabaseClient,
  o: { listingId: string; bytes: Uint8Array; mime: string; loai: LoaiMedia; moTa?: string | null; ocr?: unknown; nguon?: string },
): Promise<{ bucket: string; path: string; url: string | null } | null> {
  const rieng = o.loai === "so_do" || o.loai === "giay_to";
  const bucket = rieng ? "listing-private" : "listing-public";
  const duoi = DUOI[o.mime] ?? "jpg";
  const path = `${o.listingId}/chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${duoi}`;
  const { error: upErr } = await client.storage.from(bucket).upload(path, o.bytes, {
    contentType: o.mime, upsert: false,
  });
  if (upErr) return null;
  // Thứ tự = số dòng hiện có (0..9999 theo CHECK của 20260907a). Đếm trước rồi
  // chèn — hai ảnh gửi liền tay có thể trùng số, nhưng cột không UNIQUE, chỉ để xếp.
  const { count } = await client.from("listing_media")
    .select("id", { count: "exact", head: true }).eq("listing_id", o.listingId);
  const sort = Math.min(9999, count ?? 0);
  const { error: insErr } = await client.from("listing_media").insert({
    listing_id: o.listingId, bucket, storage_path: path, media_type: o.loai,
    mime_type: o.mime, sort_order: sort, is_cover: false,
    nguon: o.nguon ?? "seller_chat", mo_ta: o.moTa ?? null, ocr: o.ocr ?? null,
  });
  if (insErr) {
    // File đã lên mà dòng không ghi được → gỡ file kẻo thành ảnh mồ côi
    // (view `media_mo_coi_storage` sẽ bắt, nhưng gỡ ngay thì sạch hơn).
    await client.storage.from(bucket).remove([path]).catch(() => {});
    return null;
  }
  let url: string | null = null;
  if (!rieng) {
    const { data: cfg } = await client.from("app_config").select("value")
      .eq("key", "storage_public_base_url").maybeSingle();
    const base = (cfg?.value as string | undefined)?.replace(/\/$/, "");
    url = base ? `${base}/${bucket}/${path}` : null;
  }
  return { bucket, path, url };
}
