// o-theo-loai.mjs — ô thông số theo LOẠI BĐS của web (`O_THEO_LOAI`, lib/format.ts) phải khớp bộ câu bot hỏi theo loại
// (required_facts — mock e2e chép đúng bảng thật). Lớp lỗi 01/10/2026: form admin dùng một bộ ô cho mọi loại ("phòng ngủ"
// cho lô đất) trong khi bot hỏi theo loại; hai nơi lệch nhau mà không ai thấy. Chạy: bun bot/tests/o-theo-loai.mjs
import { O_THEO_LOAI, TYPE_LABEL } from "../../lib/format.ts";
import { FakeDB } from "./e2e/mock-supabase.mjs";

let tong = 0, hong = 0;
const ok = (ten, dat, chi = "") => { tong++; if (!dat) hong++; console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`); };

const db = new FakeDB();
for (const loai of Object.keys(TYPE_LABEL)) {
  db.t.listings.push({ id: `l-${loai}`, property_type: loai, deal: "ban", status: "cho_thong_tin" });
}
const cau = (loai) => new Set(db.rows("listing_missing_facts").filter((r) => r.listing_id === `l-${loai}`).map((r) => r.fact_key));
/** Ưu tiên câu phòng ngủ của loại (null = bot không hỏi). */
const uuTienPn = (loai) => db.rows("listing_missing_facts").find((r) => r.listing_id === `l-${loai}` && r.fact_key === "so_phong_ngu")?.priority ?? null;
// Phòng ngủ là thông số CHÍNH khi bot hỏi nó trước pháp lý (ưu tiên < 16, như căn hộ = 4); hỏi sau cùng (nhà = 24, 20261001c)
// thì không phải — form không có ô trống (chủ dự án 01/10: "bỏ ô phòng ngủ khỏi form với nhà").
const PN_CHINH = 16;

for (const loai of Object.keys(TYPE_LABEL)) {
  ok(`${loai}: có trong O_THEO_LOAI`, !!O_THEO_LOAI[loai]);
  const c = cau(loai);
  if (!c.size) { ok(`${loai}: mock có bộ câu`, false, "mock không trả câu nào"); continue; }
  ok(`${loai}: ô phòng ngủ ⇔ bot có câu số phòng ngủ`, !!O_THEO_LOAI[loai]?.phongNgu === c.has("so_phong_ngu"),
    JSON.stringify({ o: O_THEO_LOAI[loai]?.phongNgu, cau: c.has("so_phong_ngu") }));
  const pn = uuTienPn(loai);
  ok(`${loai}: ô phòng ngủ TRỐNG trên form ⇔ bot hỏi phòng ngủ sớm (thông số chính)`,
    !!O_THEO_LOAI[loai]?.oPhongNguTrong === (pn != null && pn < PN_CHINH), JSON.stringify({ o: O_THEO_LOAI[loai]?.oPhongNguTrong, uuTien: pn }));
  // Loại bot hỏi kết cấu thì form phải có ô kết cấu (chiều ngược không bắt buộc: nhà cấp 4 hỏi hiện trạng, vẫn có kết cấu).
  if (c.has("ket_cau")) ok(`${loai}: bot hỏi kết cấu → có ô kết cấu`, !!O_THEO_LOAI[loai]?.ketCau);
}

console.log(`\n${tong - hong}/${tong} đạt`);
if (hong) process.exit(1);
