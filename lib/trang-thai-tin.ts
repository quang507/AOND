// Trạng thái tin đọc cho người (20/10/2026, SRS-5.1zzzzzzz89). DB chỉ có `cho_thong_tin` cho HAI việc khác nhau: tin còn thiếu ý,
// và tin ĐỦ ý nhưng chờ khách duyệt bản nháp (trigger `listings_quyet_dinh_dang_tin`: tin chat chỉ lên web khi có `chu_duyet_at`).
// Admin cần phân biệt hai việc đó, nên nhãn tách ở đây — một nguồn cho rổ hàng và màn Sửa, không thêm trạng thái mới vào DB.

export type TinTrangThai = {
  status: string;
  price_vnd: number | null;
  area_m2: number | null;
  ward: string | null;
  can_chu_duyet?: boolean | null;
  chu_duyet_at?: string | null;
};

/** Cùng điều kiện với hàm DB `listing_du_dang_tin`: có giá, diện tích, phường. */
export function thieuDeDang(t: Pick<TinTrangThai, "price_vnd" | "area_m2" | "ward">): string[] {
  return [t.price_vnd == null && "giá", t.area_m2 == null && "diện tích", !t.ward?.trim() && "phường"].filter(Boolean) as string[];
}

/** Tin đủ ý để lên web nhưng còn chờ khách đồng ý bản nháp trong chat. */
export function choKhachDuyet(t: TinTrangThai): boolean {
  return t.status === "cho_thong_tin" && !!t.can_chu_duyet && !t.chu_duyet_at && thieuDeDang(t).length === 0;
}
