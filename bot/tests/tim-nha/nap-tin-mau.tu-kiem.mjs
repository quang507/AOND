// Tự kiểm OFFLINE của bộ sinh tin mẫu (SRS-5.1zzzzzzz144): tất định, đủ 100 tin theo kế hoạch, mã liên tục SEED0031..0130, giá / phường hợp lệ,
// không có số giống SĐT trong tin gốc (repo công khai, §5), câu SQL đúng khuôn và thoát được dấu '.
import assert from "node:assert/strict";
import { KE_HOACH, KE_HOACH_DAU_30, QUAN, sinhTatCa, sinhTin, sqlNapTin } from "./nap-tin-mau-lib.mjs";

const a = sinhTin(100, 31), b = sinhTin(100, 31);
assert.deepEqual(a, b, "cùng hạt giống phải ra cùng dữ liệu (chạy lại không đẻ dữ liệu khác)");
assert.equal(a.length, 100);
assert.equal(KE_HOACH.reduce((t, k) => t + k[3], 0), 100);
assert.deepEqual(a.map((t) => t.code), Array.from({ length: 100 }, (_, i) => `SEED${String(31 + i).padStart(4, "0")}`));
assert.equal(new Set(a.map((t) => t.tin_goc)).size, 100, "mọi tin gốc khác nhau");

const LOAI = new Set(["nha_pho", "chung_cu", "nha_cap4", "dat", "dat_nong_nghiep", "dat_kinh_doanh", "biet_thu", "kho_xuong", "toa_nha", "phong_tro", "mat_bang"]);
const PHUONG = new Map(Object.entries(QUAN).map(([q, v]) => [q, new Set(v.phuong)]));
for (const t of a) {
  assert.ok(["ban", "cho_thue"].includes(t.deal) && LOAI.has(t.ptype), `${t.code}: deal / loại lạ`);
  assert.ok(PHUONG.get(t.district)?.has(t.ward), `${t.code}: phường ${t.ward} không thuộc ${t.district}`);
  assert.ok(t.area > 0 && Number.isFinite(t.area), `${t.code}: diện tích hỏng`);
  assert.match(t.price_raw, /^\d+(,\d)? (tỷ|triệu)(\/tháng)?$/, `${t.code}: giá chữ lạ "${t.price_raw}"`);
  assert.equal(t.deal === "cho_thue", t.price_raw.endsWith("/tháng"), `${t.code}: thuê phải có /tháng, bán thì không`);
  assert.ok(t.tin_goc.length > 40, `${t.code}: tin gốc quá ngắn`);
  assert.ok(!/\d[\d .-]{7,}\d/.test(t.tin_goc), `${t.code}: tin gốc có chuỗi số giống SĐT`);
  assert.ok(!t.tin_goc.includes("undefined") && !t.tin_goc.includes("null") && !t.descr.includes("undefined"), `${t.code}: lọt undefined/null vào chữ`);
}
// đủ số tin theo từng nhóm kế hoạch và nhóm nào cũng có ≥ 2 tin cạnh tranh trong cùng quận (để phép đo có đối thủ thật)
const theoNhom = new Map();
for (const [deal, loai, , n] of KE_HOACH) theoNhom.set(`${deal}/${loai}`, (theoNhom.get(`${deal}/${loai}`) || 0) + n);
for (const [nhom, n] of theoNhom) assert.equal(a.filter((t) => `${t.deal}/${t.ptype}` === nhom).length, n, nhom);
// tin mới KHÔNG được lặp chi tiết là điểm phân biệt duy nhất của đáp án các câu hỏi cũ (cau-hoi.json) — nếu lặp thì đáp án đã soạn không còn đầy đủ
for (const cam of ["đang cho thuê sẵn", "view sông", "gần công viên", "căn góc", "trẻ con chạy chơi", "chó mèo", "Lotte", "Bình Tây", "Landmark", "sân bay", "hồ bơi riêng"])
  assert.ok(!a.some((t) => t.tin_goc.includes(cam)), `tin mới không được chứa "${cam}" (trùng chi tiết đáp án câu hỏi cũ)`);
assert.ok(!a.some((t) => /QPhú|QBình|QGò|QTân|QHuyện|^\d+\/\d+:\s{2}/.test(t.tin_goc)), "chữ quận / khoảng trắng xấu");
const cungQuan = new Map();
for (const t of a.filter((x) => x.deal === "ban" && x.ptype === "nha_pho")) cungQuan.set(t.district, (cungQuan.get(t.district) || 0) + 1);
assert.ok([...cungQuan.values()].some((n) => n >= 3), "nhà phố bán phải có quận ≥ 3 tin để có đối thủ cùng khu");

// 130 tin: mã liên tục SEED0001..0130, không trùng mã / tin gốc, 30 tin đầu tất định, mọi tin qua cùng luật hợp lệ như 100 tin sau
const tat = sinhTatCa();
assert.deepEqual(tat, sinhTatCa(), "130 tin phải tất định");
assert.equal(KE_HOACH_DAU_30.reduce((t, k) => t + k[3], 0), 30);
assert.deepEqual(tat.map((t) => t.code), Array.from({ length: 130 }, (_, i) => `SEED${String(1 + i).padStart(4, "0")}`));
assert.equal(new Set(tat.map((t) => t.tin_goc)).size, 130, "130 tin gốc phải khác nhau");
assert.deepEqual(tat.slice(30), a, "100 tin sau phải y hệt bản đã nạp trước đó");
for (const t of tat.slice(0, 30)) {
  assert.ok(PHUONG.get(t.district)?.has(t.ward) && t.area > 0 && t.tin_goc.length > 40, `${t.code}: tin sinh lại hỏng`);
  assert.equal(t.deal === "cho_thue", t.price_raw.endsWith("/tháng"), `${t.code}: giá thuê/bán lệch`);
  assert.ok(!/\d[\d .-]{7,}\d/.test(t.tin_goc) && !t.tin_goc.includes("undefined"), `${t.code}: tin gốc xấu`);
}

const s = sqlNapTin([{ ...a[0], tin_goc: "nhà ông O'Neil gần chợ" }]);
assert.ok(s.includes("insert into listings") && s.includes("insert into listing_noi_bo") && s.includes("'thu-seed-001'") && s.includes("'seed_thu'"));
assert.ok(s.includes("O''Neil") && !s.includes("O'Neil"), "dấu ' phải được thoát");
console.log(`OK nap-tin-mau tự kiểm: 130 tin (30 sinh lại + 100), ${new Set(a.map((t) => t.district)).size} quận, ${new Set(a.map((t) => t.ptype)).size} loại`);
