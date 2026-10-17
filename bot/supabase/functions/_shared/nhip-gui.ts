// nhip-gui.ts — nghỉ "đang gõ" giữa các bong bóng (05/10/2026, SRS-5.1zzm — theo demo AOND delivery.py).
//
// Quyết định 25/08/2026 là KHÔNG delay nhân tạo (bong bóng đầu đi ngay, giữa các bong bóng 300 ms cho Zalo
// giao đúng thứ tự). Chủ dự án 05/10 chọn lấy nhịp gõ của demo → công tắc `app_config.nhip_go`
// (`tat` mặc định = giữ 300 ms; `bat` = nghỉ theo độ dài tin TRƯỚC, như người đang gõ tin kế).
// chat-reply tính sẵn mảng mili-giây trả về `nhip_go[]` để webhook OA và bridge dùng CÙNG MỘT nhịp —
// bridge là Node, không import được TS này.

export const NHIP_MAC_DINH_MS = 300;

/** Thời gian nghỉ TRƯỚC khi gửi bong bóng thứ i (i ≥ 1), tính từ độ dài bong bóng trước đó. */
export function thoiGianGo(truoc: string, o: { chuMoiGiay?: number; toiThieuMs?: number; toiDaMs?: number } = {}): number {
  const chuMoiGiay = o.chuMoiGiay ?? 25; // người gõ Zalo nhanh ~ 25 ký tự/giây
  const toiThieu = o.toiThieuMs ?? 600;
  const toiDa = o.toiDaMs ?? 2500; // trên 2,5 giây là khách tưởng bot treo
  const ms = Math.round((truoc?.length ?? 0) / chuMoiGiay * 1000);
  return Math.max(toiThieu, Math.min(toiDa, ms));
}

/** Mảng nghỉ cho từng bong bóng: phần tử 0 luôn 0 (tin đầu đi ngay). */
export function nhipGui(bubbles: string[], bat: boolean): number[] {
  return bubbles.map((_, i) => i === 0 ? 0 : bat ? thoiGianGo(bubbles[i - 1]) : NHIP_MAC_DINH_MS);
}
