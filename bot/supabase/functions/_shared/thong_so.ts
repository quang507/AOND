// FR-172 — thông số có cấu trúc của tin rao (migration 20260902e), dùng chung
// cho chat-reply (KHO, căn khách nhắc) và nudge (follow-up căn). Một chỗ định
// nghĩa cột + một chỗ viết ra chữ, để bot không nói hai giọng về cùng một căn.
//
// Ngắn cố ý: mỗi dòng KHO là chữ-máy KHÔNG nhớ tạm (FR-171 i) — chỉ đưa thứ
// khách Quận 5 hỏi đầu tiên: ngang×dài, kết cấu, WC, đường vào, pháp lý, hướng.

export const SPEC_COLS =
  "frontage_m, length_m, floors, floors_text, bathrooms, access_type, alley_width_m, legal_status, has_completion, direction";

export type SpecRow = {
  frontage_m?: number | null; length_m?: number | null;
  floors?: number | null; floors_text?: string | null;
  bathrooms?: number | null;
  access_type?: string | null; alley_width_m?: number | null;
  legal_status?: string | null; has_completion?: boolean | null;
  direction?: string | null;
};

const ACCESS_VI: Record<string, string> = {
  mat_tien: "mặt tiền", hem_xe_tai: "hẻm xe tải", hem_xe_hoi: "hẻm xe hơi",
  hem_xe_may: "hẻm xe máy", hem: "trong hẻm",
};
const LEGAL_VI: Record<string, string> = {
  so_hong_rieng: "sổ hồng riêng", so_hong_chung: "sổ hồng chung", so_hong: "có sổ",
  hdmb: "hợp đồng mua bán", giay_tay: "giấy tay",
};

/** " · 4x15m · trệt + 2 lầu · 3WC · hẻm xe hơi 6m · sổ hồng riêng, hoàn công" — rỗng nếu tin chưa có gì. */
export function thongSoNgan(l: SpecRow): string {
  const p: string[] = [];
  if (l.frontage_m && l.length_m) p.push(`${l.frontage_m}x${l.length_m}m`);
  if (l.floors_text) p.push(l.floors_text);
  else if (l.floors) p.push(`${l.floors} tầng`);
  if (l.bathrooms) p.push(`${l.bathrooms}WC`);
  if (l.access_type) {
    p.push(`${ACCESS_VI[l.access_type] ?? l.access_type}${l.alley_width_m ? ` ${l.alley_width_m}m` : ""}`);
  }
  if (l.legal_status) {
    p.push(`${LEGAL_VI[l.legal_status] ?? l.legal_status}${l.has_completion ? ", hoàn công" : ""}`);
  }
  if (l.direction) p.push(`hướng ${l.direction}`);
  return p.length ? " · " + p.join(" · ") : "";
}
