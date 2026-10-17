// SRS-5.1zzzzzq (Zalo thật 13/10/2026, khách mua hỏi Hà Đô Centrosa): kiến thức dự án là NGUỒN cho lời bot gửi người mua.
// (1) `cauDuAnCoNguon`: câu AI soát liệt kê kèm căn cứ chép từ khối dự án → giữ; câu tự tính / nối khu / nói có hàng → không.
// (2) `gopDuAnTrung` + `tienIchDuAnSach`: hai dòng mogi trùng tên → một; tiện ích là tiêu đề bài viết → bỏ.
// (3) `boCanBia` / `chanHuaCoHang` nhận danh sách câu giữ.
import { cauDuAnCoNguon } from "../supabase/functions/_shared/extraction/khen-hop-le.ts";
import { gopDuAnTrung, tienIchDuAnSach, khoaTenDuAn } from "../supabase/functions/_shared/extraction/du-an-kho.ts";
import { boCanBia, chanHuaCoHang } from "../supabase/functions/_shared/extraction/van-tra-loi.ts";

let dat = 0, hong = 0;
const la = (ten, ok, ct = "") => { if (ok) { dat++; console.log(`\x1b[32m✓\x1b[0m ${ten}`); } else { hong++; console.log(`\x1b[31m✗\x1b[0m ${ten}${ct ? `\n    ${ct}` : ""}`); } };

const KHOI = `• HaDo Centrosa Garden - CĐT Công ty Cổ phần Tập đoàn Hà Đô · 200 Đường 3 Tháng 2, Phường 12, Quận 10, TPHCM · tiện ích: Căn hộ 3 phòng ngủ và một phòng đa năng (3PN+) có diện tích từ 128 đến 138m², gồm 157 căn., Trung tâm thương mại cao cấp. · thông số: {"gia_dong":"Giá từ 3 tỷ 792 triệu (80 - 112 triệu/m2)","dien_tich_tu_m2":47,"dien_tich_den_m2":129}`;
const NX = (cau, can_cu, them = {}) => ({ cau, khang_dinh: "", can_cu, kieu: "nhac_lai", noi_co_hang: false, danh_gia_thi_truong: false, ...them });

// (1) ca gốc: câu đúng từ khối, bị ba lưới gọt.
const c1 = "Dạ căn 3PN của Hà Đô Centrosa từ 128-138m2 ạ.";
la("DAM-01 (ca gốc 11:15) câu diện tích 3PN có căn cứ trong khối → giữ",
  JSON.stringify(cauDuAnCoNguon([NX(c1, "3PN+) có diện tích từ 128 đến 138m²")], KHOI)) === JSON.stringify([c1]));
la("DAM-02 câu tự nhân giá ('tầm 10-12 tỷ rưỡi') có số không nằm trong căn cứ → bỏ",
  cauDuAnCoNguon([NX("Dạ Hà Đô Centrosa có căn 3PN từ 128-138m², tầm 10-12 tỷ rưỡi ạ.", "3PN+) có diện tích từ 128 đến 138m²")], KHOI).length === 0);
la("DAM-03 câu nối khu khách tìm ('gần Phạm Thế Hiển lắm') can_cu null → bỏ",
  cauDuAnCoNguon([NX("Dạ bên em có Hà Đô Centrosa Garden ở Quận 10, gần Phạm Thế Hiển lắm anh chị.", null, { noi_co_hang: true })], KHOI).length === 0);
la("DAM-04 một câu nhiều điều: một điều không căn cứ → cả câu bỏ (không cắt dở)",
  cauDuAnCoNguon([NX("Dự án ở 200 Đường 3 Tháng 2, Quận 10, tiện ích đầy đủ ạ.", "200 Đường 3 Tháng 2"), NX("Dự án ở 200 Đường 3 Tháng 2, Quận 10, tiện ích đầy đủ ạ.", null, { kieu: "danh_gia" })], KHOI).length === 0);
la("DAM-05 căn cứ không có trong khối (AI bịa căn cứ) → bỏ",
  cauDuAnCoNguon([NX("Dự án có hồ bơi Olympic ạ.", "hồ bơi Olympic")], KHOI).length === 0);
la("DAM-06 (cách nói mới) 'Giá niêm yết từ 3 tỷ 792 triệu, tầm 80-112 triệu/m2 ạ' có căn cứ gia_dong → giữ",
  cauDuAnCoNguon([NX("Giá niêm yết từ 3 tỷ 792 triệu, tầm 80-112 triệu/m2 ạ.", "Giá từ 3 tỷ 792 triệu (80 - 112 triệu/m2)")], KHOI).length === 1);
la("DAM-07 không có khối dự án → không giữ gì", cauDuAnCoNguon([NX(c1, "128 đến 138m²")], "").length === 0);
la("DAM-08 câu hỏi không vào danh sách giữ", cauDuAnCoNguon([NX("Anh chị muốn xem căn 128m2 không ạ?", "128")], KHOI).length === 0);

// (2) kho trùng + tiện ích rác.
const d1 = { name: "Hà Đô Centrosa Garden", developer: "Tập đoàn Hà Đô", amenities: ["- Chủ đầu tư dự án này có uy tín hay không?", "Đánh giá ưu điểm, nhược điểm dự án căn hộ Hà Đô Centrosa", "Có nên mua căn hộ Hà Đô Centrosa không? Ai là người nên đầu tư vào dự án này?"], specs: { gia_m2_min: 65000000 } };
const d2 = { name: "HaDo Centrosa Garden", developer: "Công ty Cổ phần Tập đoàn Hà Đô", location_raw: "200 Đường 3 Tháng 2", amenities: ["Phía Nam giáp đường 3/2", "Căn hộ 3 phòng ngủ và một phòng đa năng (3PN+) có diện tích từ 128 đến 138m², gồm 157 căn.", "Trung tâm thương mại cao cấp."], specs: { gia_m2_min: 80000000, gia_m2_max: 112000000 } };
la("DAM-09 khoá tên: 'HaDo Centrosa Garden' = 'Hà Đô Centrosa Garden'", khoaTenDuAn(d1.name) === khoaTenDuAn(d2.name));
la("DAM-10 hai dòng trùng → giữ dòng nhiều thông tin (HaDo, có địa chỉ số nhà)", (() => { const g = gopDuAnTrung([d1, d2]); return g.length === 1 && g[0].name === "HaDo Centrosa Garden"; })());
la("DAM-11 dòng khác tên không gộp", gopDuAnTrung([d2, { name: "Sunrise City", amenities: [] }]).length === 2);
la("DAM-12 tiện ích là câu hỏi / tiêu đề bài viết → bỏ hết", tienIchDuAnSach(d1.amenities).length === 0);
la("DAM-13 tiện ích thật giữ nguyên", tienIchDuAnSach(d2.amenities).length === 3);
la("DAM-14 amenities không phải mảng → rỗng", tienIchDuAnSach(null).length === 0 && tienIchDuAnSach("x").length === 0);

// (3) lưới kho trống nhận câu giữ.
la("DAM-15 boCanBia giữ câu diện tích dự án khi có trong danh sách giữ; không có thì vẫn bỏ",
  boCanBia([c1, "Anh chị muốn khu nào ạ?"], [c1]).length === 2 && boCanBia([c1, "Anh chị muốn khu nào ạ?"]).length === 1);
{
  const loi = "hiện bên em chưa có căn nào khớp đúng nhu cầu này ạ.";
  const r = chanHuaCoHang(["Dạ bên em có Hà Đô Centrosa Garden ạ. Căn 3PN+ có diện tích 128-138m2 ạ. Anh chị cần mấy phòng ngủ ạ?"], loi, true, ["Dạ bên em có Hà Đô Centrosa Garden ạ"], ["Căn 3PN+ có diện tích 128-138m2 ạ"]);
  la("DAM-16 chanHuaCoHang: câu 'bên em có' bị thay bằng lời thật, câu dự án có nguồn ĐỨNG SAU vẫn giữ (không bị cuốn theo), câu hỏi giữ",
    r.daChan && /chưa có căn nào/.test(r.replies[0]) && /128-138m2/.test(r.replies[0]) && /mấy phòng ngủ/.test(r.replies[0]), JSON.stringify(r.replies));
}

console.log(`\n${dat} đạt · ${hong} hỏng`);
if (hong) process.exitCode = 1;
