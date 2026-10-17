// fr176-khop-cau-tra-loi.mjs — bài kiểm tầng tiền định "câu chủ nhà nhắn có
// phải câu trả lời không" (FR-176). Chạy bằng bun (import thẳng .ts):
//   bun bot/tests/fr176-khop-cau-tra-loi.mjs
// Mỗi dòng dưới là một câu THẬT hoặc gần thật từ log 07/09/2026. Thêm ca khi
// bắt được một câu bot ghi sai chỗ ngoài đời — đó là cách file này lớn lên.
import { batXungHo, laBaoDang, laChiLenhDang, laKhongGiHet, nhanDienFact, phanLoaiCauTraLoi } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";

const CA = [
  // [câu hỏi đang treo, câu chủ nhà nhắn, loại mong đợi, kiểm thêm]
  ["phap_ly", "Kêu chị nha", "xung_ho", (k) => k.xungHo === "chị"],
  ["phap_ly", "gọi anh đi em", "xung_ho", (k) => k.xungHo === "anh"],
  ["phap_ly", "chị nha", "xung_ho", (k) => k.xungHo === "chị"],
  ["phap_ly", "sổ hồng riêng rồi em", "khop"],
  ["phap_ly", "chị nha, sổ hồng riêng đã hoàn công", "khop", (k) => k.xungHo === "chị"],
  ["phap_ly", "16m nha", "lech"],
  ["phap_ly", "ok", "ack"],
  ["phap_ly", "để coi", "ack"],
  ["phap_ly", "phí bên em sao?", "hoi"],
  ["phap_ly", "chưa có sổ, đang làm", "khop"],
  ["huong", "16m nha", "lech"],
  ["huong", "đông nam", "khop"],
  ["huong", "hướng tây", "khop"],
  ["huong", "không rõ em ơi", "khop"],
  ["dien_tich_dat", "Ngang 5", "lech", (k) => k.chuyenSang?.question === "mat_tien" && k.chuyenSang?.answer === "5m"],
  ["dien_tich_dat", "ngang 4,5m", "lech", (k) => k.chuyenSang?.answer === "4,5m"],
  ["dien_tich_dat", "5x16", "khop"],
  ["dien_tich_dat", "5 x 16m", "khop"],
  ["dien_tich_dat", "80m2", "khop"],
  ["dien_tich_dat", "80", "khop"],
  ["dien_tich_dat", "ngang 5 dài 16", "khop"],
  ["dien_tich", "5 tỷ", "lech"],
  ["ket_cau", "5 tấm em", "khop"],
  ["ket_cau", "1 trệt 2 lầu", "khop"],
  ["ket_cau", "một trệt hai lầu", "khop"],
  ["ket_cau", "Kêu chị nha", "xung_ho"],
  ["nam_xay", "2015", "khop"],
  ["nam_xay", "không nhớ", "khop"],
  ["nam_xay", "5 tỷ", "lech"],
  ["gia", "5 tỷ 8", "khop"],
  ["gia", "5 tỏi rưỡi", "khop"],
  // 11/09/2026, lượt bắn 42 ca: câu xin dừng không phải câu trả lời; tên phường
  // bằng chữ phải ngắn và không có từ nói chuyện; số trần "4m" không đoán.
  ["phuong", "hỏi gì hỏi lắm vậy em, anh bận", "hoan"],
  ["vi_tri", "để anh hỏi vợ đã em", "hoan"],
  ["gap", "để anh bàn với vợ", "hoan"],
  ["phuong", "Nguyễn Cư Trinh", "khop"],
  ["phuong", "Bàn Cờ", "khop"],
  ["phuong", "phường 5 nha, anh bận", "khop"],
  ["vi_tri", "4m", "lech"],
  ["gia", "5 tỷ được không?", "hoi"],
  ["gia", "80m2", "lech"],
  ["quy_hoach", "không dính gì", "khop"],
  ["quy_hoach", "16m nha", "lech"],
  ["hien_trang", "nhà mới toanh, sơn lại năm ngoái", "khop"],
  ["hien_trang", "ừ", "ack"],
  // FR-176 / 20260907e: giá + phường giờ là câu hỏi thật.
  ["phuong", "phường 5", "khop"],
  ["phuong", "5", "khop"],
  ["phuong", "p4", "khop"],
  ["phuong", "Nguyễn Cư Trinh", "khop"],
  ["phuong", "ừ", "ack"],
  ["gia", "10 tỷ rưỡi", "khop"],
  ["gia", "kêu chị nha", "xung_ho"],
  // FR-229 (25/09/2026): câu pháp lý hỏi trước bản nháp.
  ["nguoi_dung_ten", "anh", "khop"],
  ["nguoi_dung_ten", "mẹ em đứng tên", "khop"],
  ["nguoi_dung_ten", "vợ chồng tôi", "khop"],
  ["nguoi_dung_ten", "5 tỷ", "lech"],
  ["tranh_chap", "không", "khop"],
  ["tranh_chap", "sạch sẽ", "khop"],
  ["tranh_chap", "hẻm 4m", "lech"],
  ["dien_tich_khop_so", "khớp", "khop"],
  ["dien_tich_khop_so", "đúng sổ", "khop"],
  ["dien_tich_khop_so", "hoàn công đủ rồi", "khop"],
  ["dien_tich_khop_so", "xây lố 1 chút", "khop"],
  // 27/09/2026 (chủ dự án test Zalo): vặn lại câu trước về loại sổ khi đang hỏi hoàn công — không phải câu trả lời.
  ["hoan_cong", "Làm gì có sổ chung", "ack"],
  ["hoan_cong", "sổ riêng mà em", "ack"],
  ["hoan_cong", "rồi em", "khop"],
  ["hoan_cong", "chưa hoàn công", "khop"],
  ["hoan_cong", "rồi, sổ riêng hoàn công đủ", "khop"],
  ["do_rong_hem", "Hxm nhé", "khop"],
  // 27/09/2026 (chủ dự án test Zalo): số tiền viết đủ khi đang hỏi diện tích → lệch sang giá.
  ["dien_tich_dat", "Giá 8.000.000.000", "lech", (k) => k.chuyenSang?.question === "gia"],
  ["nguoi_dung_ten", "Anh đứng tên chính nhé", "khop"],
  ["nguoi_dung_ten", "ba a thôi", "khop"],
  ["phap_ly", "sổ riêng. chính chủ. ba a dứng tên", "khop"],
  ["phuong", "Ở cầu kho em ơi", "khop"],
  ["vi_tri", "ở hẻm 45 Nguyễn Trãi", "khop"],
  // 27/09/2026 (test Zalo, đất Cần Đước): tên đường / ấp trơn trả lời câu địa chỉ.
  ["vi_tri", "xoài đôi", "khop"],
  ["vi_tri", "trần hưng đạo", "khop"],
  ["vi_tri", "hay quá", "lech"],
  ["vi_tri", "không biết nữa", "lech"],
  // 27/09/2026 (test Zalo): số nhà + tên đường khi đang hỏi câu khác → lệch sang địa chỉ (không phải hẻm / giá).
  ["do_rong_hem", "312 Nguyễn Thuơbgj Hiền", "lech", (k) => k.chuyenSang?.question === "vi_tri"],
  ["gia", "45 Ngô Y Linh", "lech", (k) => k.chuyenSang?.question === "vi_tri"],
];

let hong = 0;
for (const [q, text, mong, them] of CA) {
  const kq = phanLoaiCauTraLoi(q, text);
  const ok = kq.loai === mong && (!them || them(kq));
  if (!ok) hong++;
  console.log(`${ok ? "✓" : "✗"} [${q}] "${text}" → ${kq.loai}${kq.xungHo ? ` (${kq.xungHo})` : ""}${kq.chuyenSang ? ` → ${kq.chuyenSang.question}=${kq.chuyenSang.answer}` : ""}${ok ? "" : `  MONG ${mong}`}`);
}
const xh = [["Kêu chị nha", "chị"], ["kêu anh", "anh"], ["sổ hồng riêng", null], ["em là chị", "chị"], ["anh chứ không phải chị", "anh"]];
for (const [t, mong] of xh) {
  const kq = batXungHo(t);
  const ok = kq === mong;
  if (!ok) hong++;
  console.log(`${ok ? "✓" : "✗"} xưng hô "${t}" → ${kq}${ok ? "" : `  MONG ${mong}`}`);
}
// 27/09 (FR-232): câu phủ định chung cho câu hỏi gộp quy hoạch / tranh chấp / xây lố.
const kgh = [["không có gì hết em", true], ["ko dính gì", true], ["Dạ không", true], ["sạch sẽ hết em", true], ["làm gì có", true],
  ["không dính quy hoạch nhưng có tranh chấp", false], ["không biết nữa em", false], ["lộ giới 2m", false], ["có dính quy hoạch", false],
  ["không rõ lắm", false], ["không, để anh hỏi lại", false]];
for (const [t, mong] of kgh) {
  const kq = laKhongGiHet(t);
  if (kq !== mong) hong++;
  console.log(`${kq === mong ? "✓" : "✗"} không gì hết "${t}" → ${kq}${kq === mong ? "" : `  MONG ${mong}`}`);
}
// 28/09 (FR-234): bảo ĐĂNG trong câu hoãn — "đăng" khác "đang" (đang bận); "chưa / khoan đăng" không tính.
const bd = [["Bảo cứ đăng như này trước đi chiều anh gửi thêm thông tin với ảnh các thứ h đang bận", true], ["cu dang nhu nay truoc di", true],
  ["lên tin trước đi em", true], ["đăng tin luôn đi em, tối gửi ảnh", true], ["h đang bận", false], ["anh đang đi làm", false],
  ["dang ban lam em", false], ["chưa đăng đâu em", false], ["khoan đăng đã", false], ["đăng ký gì vậy em", false]];
for (const [t, mong] of bd) {
  const kq = laBaoDang(t);
  if (kq !== mong) hong++;
  console.log(`${kq === mong ? "✓" : "✗"} bảo đăng "${t}" → ${kq}${kq === mong ? "" : `  MONG ${mong}`}`);
}
// 28/09 (bắn thật lx-40): "ở ai cũng khá lên" (phong thuỷ) không phải tiềm năng sử dụng; "để ở hoặc kinh doanh" vẫn là.
const tn = [["ở ai cũng khá lên", null], ["ở đây yên tĩnh lắm", null], ["để ở hoặc kinh doanh", "tiem_nang"]];
for (const [t, mong] of tn) {
  const kq = nhanDienFact(t)?.question ?? null;
  if (kq !== mong) hong++;
  console.log(`${kq === mong ? "✓" : "✗"} tiềm năng "${t}" → ${kq}${kq === mong ? "" : `  MONG ${mong}`}`);
}
// 30/09/2026 (bắn thử vector): "nhà có giếng trời" không phải nguồn nước tưới; "1 phòng ngủ ngay tầng trệt" không phải
// tổng số phòng ngủ, cũng không phải kết cấu nhà.
const vt = [
  ["nhà có giếng trời", (f) => f?.question !== "nguon_nuoc"],
  ["đất có giếng khoan tưới rẫy", (f) => f?.question === "nguon_nuoc"],
  ["nhà có 1 phòng ngủ ngay tầng trệt cho người già", (f) => f?.question !== "so_phong_ngu" && f?.question !== "ket_cau"],
  ["nhà 4 phòng ngủ", (f) => f?.question === "so_phong_ngu" && f.answer === "4"],
];
for (const [c, kiem] of vt) {
  const f = nhanDienFact(c);
  if (kiem(f)) console.log(`✓ nhanDienFact ${JSON.stringify(c)} → ${f?.question ?? "—"}`);
  else { hong++; console.log(`✗ nhanDienFact ${JSON.stringify(c)} → ${JSON.stringify(f)}`); }
}
// SRS-5.1zzu (06/10/2026, bắn lại thu-ai-0610): CẢ TIN chỉ là lệnh đăng → luật chắc khi AI đọc binh_thuong; câu có thêm ý thì không.
const ld = [["ok đăng đi", true], ["đăng luôn đi em", true], ["lên tin giúp anh nha", true], ["cứ đăng như vậy trước đi", true], ["Đăng đi.", true],
  ["chiều anh gửi ảnh, giờ đăng trước đi", false], ["đăng đi, nhà 4x16 nha", false], ["chưa đăng đâu em", false], ["h đang bận", false], ["ok", false]];
for (const [t, mong] of ld) {
  const kq = laChiLenhDang(t);
  if (kq !== mong) hong++;
  console.log(`${kq === mong ? "✓" : "✗"} chỉ lệnh đăng "${t}" → ${kq}${kq === mong ? "" : `  MONG ${mong}`}`);
}
const tong176 = CA.length + xh.length + kgh.length + bd.length + tn.length + vt.length + ld.length;
console.log(hong ? `\nFR-176: ${hong}/${tong176} CA HỎNG` : `\nFR-176: ${tong176}/${tong176} CA ĐẠT`);
process.exit(hong ? 1 : 0);
