// HỎI BÙ (ask-seller, nhịp drip) — phần TIỀN ĐỊNH, không import gì, kiểm được bằng bun (`bot/tests/hoi-bu.mjs`).
//
// SRS-5.1zzzzzzz18 (Zalo thật 14/10/2026 11:22): tester đang có căn hộ Bình Chánh ĐÃ lên kệ, nhịp hỏi bù lại nhắn "Dạ em cảm ơn
// chị đã gửi tin nha. Chung cư mình nằm đường nào, khu nào chị ạ?" — hỏi về một VỎ TIN RỖNG (mở từ câu "cần bán căn hộ" trước
// bài rao, không giá / diện tích / địa chỉ), và mở đầu cảm ơn "đã gửi tin" giữa một cuộc trò chuyện đã sống cả giờ. Lớp lỗi: nhịp
// hỏi bù chọn tin theo TỪNG TIN, không nhìn người rao còn tin nào khác; câu mở đầu đoán "lần đầu" bằng việc tin đó chưa có câu
// hỏi nào, không phải bằng việc hai bên đã nói chuyện chưa.

export type TinHoiBu = {
  price_raw?: string | null;
  area_m2?: number | string | null;
  location_raw?: string | null;
  ward?: string | null;
  district?: string | null;
  project_id?: string | null;
};

/** Tin chưa mang dữ kiện nào để khách mua nhận ra căn — chỉ là cái vỏ mở từ câu "cần bán …". */
export function laVoTinRong(l: TinHoiBu): boolean {
  return !l.price_raw && (l.area_m2 == null || l.area_m2 === "") && !l.location_raw?.trim() && !l.ward && !l.district && !l.project_id;
}

/**
 * Câu mở đầu tin hỏi bù: nói rõ đang hỏi về căn nào (người rao có thể có nhiều tin), không cảm ơn "đã gửi tin" — nhịp hỏi bù chạy
 * khi chủ nhà đã im ≥ 10 phút, giữa một cuộc trò chuyện, không phải ngay sau khi gửi.
 */
export function moDauHoiBu(loai: string, noi: string | null | undefined): string {
  const n = (noi ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return `Dạ, em hỏi thêm một ý về ${loai}${n ? ` ở ${n}` : ""} nha. `;
}
