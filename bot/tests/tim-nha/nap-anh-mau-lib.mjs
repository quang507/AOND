// Phần thuần của nap-anh-mau.mjs (SRS-5.1zzzzzzz168): bốn ảnh minh hoạ cho mỗi tin mẫu `seed_thu`. Tách ra để tự kiểm offline được.
export const ANH_MAU = [
  { tep: "mat_tien.jpg", loai: "mat_tien" },
  { tep: "trong_nha.jpg", loai: "trong_nha" },
  { tep: "phong_ngu.jpg", loai: "phong_ngu" },
  { tep: "bep.jpg", loai: "bep" },
];

/** Bốn dòng `listing_media` cho một tin. Đường dẫn PHẢI bắt đầu bằng uuid tin (CHECK listing_media_duong_dan_theo_uuid), ảnh đầu là ảnh bìa. */
export function dongMedia(listingId) {
  return ANH_MAU.map((a, i) => ({
    listing_id: listingId, bucket: "listing-public", storage_path: `${listingId}/${i + 1}-${a.tep}`,
    media_type: a.loai, mime_type: "image/jpeg", sort_order: i, is_cover: i === 0,
  }));
}
