// Tự kiểm OFFLINE của bộ đo tìm nhà (SRS-5.1zzzzzzz144): hàm thuần đúng, câu SQL đúng chữ ký, và — quan trọng — MỌI đáp án trong cau-hoi.json
// thoả điều kiện CỨNG (bán/thuê, loại, giá) của chính câu đó, để lỗi do người soạn bộ câu hỏi bị bắt trước khi tốn lượt nhúng.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chiSo, cosine, esc, hang, hopLocCung, sqlTimNha } from "./do-tim-nha-lib.mjs";

// --- hàm thuần
assert.equal(esc("O'Neil"), "'O''Neil'");
assert.ok(Math.abs(cosine([1, 2, 3], [1, 2, 3]) - 1) < 1e-12);
assert.equal(cosine([1, 0], [0, 1]), 0);
assert.equal(hang(["a", "b", "c"], ["c"]), 3);
assert.equal(hang(["a", "b", "c"], ["z"]), null);
assert.equal(hang(["a", "b", "c", "d", "e", "f"], ["f"]), null, "chỉ tính trong top 5");
const m = chiSo([1, 3, null, 5]);
assert.equal(m.n, 4); assert.equal(m.hit3, 0.5); assert.equal(m.hit5, 0.75);
assert.ok(Math.abs(m.mrr - (1 + 1 / 3 + 0 + 1 / 5) / 4) < 1e-12);
assert.deepEqual(chiSo([]), { n: 0, hit3: 0, hit5: 0, mrr: 0 });

// --- SQL: đúng chữ ký tim_nha, thoát ' trong chữ, từ chối số hỏng
const s = sqlTimNha({ deal: "ban", loai: "nha_pho", gia_max: 7000000000, khu: "Quận 5", pn_min: 2, xe_hoi: true }, [0.1, -0.2], 5);
for (const mau of ["p_deal => 'ban'", "p_loai => 'nha_pho'", "p_gia_max => 7000000000::bigint", "p_khu => 'Quận 5'", "p_dt_min => null::numeric",
  "p_pn_min => 2::int", "p_xe_hoi => true", "p_vec => array[0.1,-0.2]::float8[]", "p_limit => 5"]) assert.ok(s.includes(mau), mau);
assert.ok(sqlTimNha({ deal: "ban" }, null).includes("p_vec => null::float8[]"));
assert.ok(sqlTimNha({ deal: "ban", khu: "Thủ'Đức" }, null).includes("'Thủ''Đức'"));
assert.throws(() => sqlTimNha({ deal: "ban", gia_max: "7 tỷ" }, null));
assert.throws(() => sqlTimNha({ deal: "ban" }, [NaN]));

// --- bộ câu hỏi: cấu trúc + đáp án thoả điều kiện cứng của câu
const F = (deal, property_type, giaMax) => ({ deal, property_type, price_vnd: giaMax });
const TIN = { // chỉ các cột cần cho lọc cứng; khớp lệnh nạp seed_thu 23/10/2026
  SEED0001: F("ban", "nha_pho", 6.5e9), SEED0002: F("ban", "nha_pho", 18e9), SEED0003: F("ban", "nha_cap4", 2.1e9), SEED0004: F("ban", "chung_cu", 3.8e9),
  SEED0005: F("ban", "chung_cu", 2.6e9), SEED0006: F("ban", "dat", 1.8e9), SEED0007: F("ban", "dat_nong_nghiep", 4e9), SEED0008: F("ban", "biet_thu", 35e9),
  SEED0009: F("ban", "kho_xuong", 12e9), SEED0010: F("cho_thue", "mat_bang", 120e6), SEED0011: F("cho_thue", "phong_tro", 3.5e6), SEED0012: F("cho_thue", "chung_cu", 14e6),
  SEED0013: F("ban", "nha_pho", 8.9e9), SEED0014: F("ban", "nha_pho", 11e9), SEED0015: F("ban", "nha_pho", 7.2e9), SEED0016: F("ban", "nha_pho", 5.5e9),
  SEED0017: F("ban", "nha_pho", 3.9e9), SEED0018: F("ban", "nha_pho", 15e9), SEED0019: F("ban", "nha_pho", 6.3e9), SEED0020: F("ban", "nha_pho", 7.5e9),
  SEED0021: F("ban", "chung_cu", 2.9e9), SEED0022: F("ban", "chung_cu", 14e9), SEED0023: F("ban", "nha_pho", 12e9), SEED0024: F("ban", "dat_kinh_doanh", 6e9),
  SEED0025: F("ban", "toa_nha", 65e9), SEED0026: F("ban", "nha_pho", 13e9), SEED0027: F("ban", "nha_cap4", 2.8e9), SEED0028: F("cho_thue", "nha_pho", 45e6),
  SEED0029: F("ban", "nha_pho", 4.2e9), SEED0030: F("ban", "chung_cu", 6.2e9),
};
const bo = JSON.parse(readFileSync(new URL("./cau-hoi.json", import.meta.url), "utf8")).cau_hoi;
assert.ok(bo.length >= 30, "bộ câu hỏi phải ≥ 30 câu");
const ids = new Set();
for (const c of bo) {
  assert.ok(!ids.has(c.id), `trùng id ${c.id}`); ids.add(c.id);
  assert.ok(["A", "B", "C"].includes(c.nhom), `${c.id}: nhóm lạ`);
  assert.ok(c.cau && c.cau.length > 8, `${c.id}: thiếu lời khách`);
  assert.ok(["ban", "cho_thue"].includes(c.loc.deal), `${c.id}: deal lạ`);
  assert.ok(c.dap_an.length >= 1, `${c.id}: thiếu đáp án`);
  sqlTimNha(c.loc, null);   // số hỏng thì ném
  for (const ma of c.dap_an) {
    assert.ok(TIN[ma], `${c.id}: đáp án ${ma} không có trong rổ mẫu`);
    assert.ok(hopLocCung({ ...TIN[ma] }, c.loc), `${c.id}: đáp án ${ma} KHÔNG thoả điều kiện cứng của chính câu hỏi (bán/thuê, loại, giá)`);
  }
}
// phủ đủ các loại tin: mỗi tin mẫu phải là đáp án của ít nhất một câu, nếu không rổ mẫu có tin thừa không đo được gì
const dung = new Set(bo.flatMap((c) => c.dap_an));
const thua = Object.keys(TIN).filter((ma) => !dung.has(ma));
assert.ok(thua.length <= 6, `quá nhiều tin mẫu không là đáp án câu nào: ${thua.join(", ")}`);
console.log(`OK do-tim-nha tự kiểm: ${bo.length} câu, ${Object.keys(TIN).length} tin mẫu, ${thua.length} tin chỉ làm nhiễu (${thua.join(", ") || "-"})`);
