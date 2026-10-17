// VAN CỦA LƯỚI VÉT DỰ ÁN (FR-199) — phần TIỀN ĐỊNH, không import gì.
//
// Nằm riêng khỏi `_shared/ai/boc-du-an.ts` vì hai lý do, cả hai đều là luật của
// dự án: `bot/tests/ranh-gioi.mjs` bắt tầng bóc tách phải chạy được mà không
// chạm model; và bài kiểm chạy bằng bun không nạp được specifier `npm:` của
// Deno, nên phần nào đáng kiểm thì phải đứng ở đây.
//
// Hai việc: quyết ĐÁNG GỌI MODEL KHÔNG (van giữ tiền), và DỌN kết quả model
// trước khi cho vào hàng chờ duyệt (van giữ hàng chờ sạch).

export type DuAnBoc = {
  ten_du_an: string | null;
  facts: Array<{ khoa: string; gia_tri: string }>;
};

/** Mùi dự án: có thì mới đáng gọi model. Rẻ, chạy trước mọi lượt gọi. */
const MUI_DU_AN =
  /(dự\s*án|du\s*an|khu\s*đô\s*thị|chung\s*cư|chung\s*cu|to[àa]\s|tòa\s|block|phí\s*quản\s*lý|phi\s*quan\s*ly|phí\s*giữ\s*xe|tiện\s*ích|tien\s*ich|nội\s*khu|noi\s*khu|chủ\s*đầu\s*tư|chu\s*dau\s*tu|bàn\s*giao|ban\s*giao|hồ\s*bơi|ho\s*boi|gym|compound|bảo\s*vệ\s*24|mật\s*độ\s*xây|thang\s*máy)/i;

export function coMuiDuAn(t: string): boolean {
  return MUI_DU_AN.test(t ?? "");
}

/** Dọn kết quả model trước khi cho vào hàng chờ duyệt. */
export function donKetQua(k: DuAnBoc | null): DuAnBoc {
  if (!k) return { ten_du_an: null, facts: [] };
  const ten = (k.ten_du_an ?? "").trim()
    .replace(/\s+(quận|quan|phường|phuong|huyện|huyen|thành phố|tp)\b.*$/iu, "")
    .trim();
  return {
    // Tên 2 ký tự hay dài hơn 6 chữ thì gần như chắc chắn không phải tên dự án.
    ten_du_an: ten.length >= 3 && ten.split(/\s+/).length <= 6 ? ten : null,
    facts: (k.facts ?? [])
      .filter((f) => f?.gia_tri?.trim())
      .map((f) => ({ khoa: f.khoa, gia_tri: f.gia_tri.trim().slice(0, 120) }))
      .slice(0, 6),
  };
}
