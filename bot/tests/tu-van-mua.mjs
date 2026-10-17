// tu-van-mua.mjs — bộ câu tư vấn người mua (FR-228). Tiền định: không mạng, không DB, không model.
//   bun bot/tests/tu-van-mua.mjs
import { cauThangMay, cauTuVanKe, laHoiNyah } from "../supabase/functions/_shared/extraction/tu-van-mua.ts";

let dat = 0, hong = 0;
const ok = (ten, dk, chi = "") => { if (dk) { dat++; console.log(`✓ ${ten}`); } else { hong++; console.log(`✗ ${ten}${chi ? `\n   → ${chi}` : ""}`); } };

const du = { khu_song: "yên tĩnh", nguoi_o_cung: "vợ chồng", noi_lam: "Quận 1", bedrooms: 3, dien_tich_mong_muon: "60m2", budget: "5 tỷ", nguoi_quyet_dinh: "hai vợ chồng", can_vay: false };
ok("TV-01 hồ sơ trống → câu 1 nguyên văn chủ dự án", cauTuVanKe({})?.cau === "Anh chị muốn mình sống ở một khu như thế nào ạ?");
ok("TV-02 đã có khu → câu 2 'Nhà mình gồm những ai ạ?'", cauTuVanKe({ khu_song: "x" })?.cau === "Nhà mình gồm những ai ạ?");
ok("TV-03 có số phòng, chưa diện tích → câu 4 kèm ghi chú 'đã biết số phòng'", /đã biết số phòng — chỉ hỏi phần còn lại/.test(cauTuVanKe({ khu_song: "x", nguoi_o_cung: "vợ chồng", noi_lam: "Q1", bedrooms: 3 })?.cau ?? ""));
ok("TV-04 người ở cùng KHÔNG có người lớn tuổi → bỏ câu thang máy, sang câu 6", /tài chính dự kiến/.test(cauTuVanKe({ ...du, budget: null, nguoi_quyet_dinh: null })?.cau ?? ""));
ok("TV-05 có ông bà → gợi ý chung thang máy / phòng ngủ dưới trệt", /thang máy hoặc phòng ngủ dưới trệt/.test(cauTuVanKe({ ...du, nguoi_o_cung: "vợ chồng và ông bà", thang_may: null })?.cau ?? ""));
ok("TV-06 có ông bà + hỏi Ny'ah Phú Định → câu 5 nguyên văn '2 mẫu'", cauTuVanKe({ ...du, nguoi_o_cung: "ba mẹ già", thang_may: null }, true)?.cau === "Bên em có 2 mẫu, có và không có thang máy. Nhà mình có ông bà thì em nghĩ mẫu thang máy sẽ tiện hơn. Anh chị thấy sao ạ?");
ok("TV-07 đã có tài chính → câu 6 chỉ hỏi người cùng quyết định (ghi chú 'đã biết tài chính')", /đã biết tài chính/.test(cauTuVanKe({ ...du, nguoi_quyet_dinh: null })?.cau ?? ""));
ok("TV-08 chưa nói vay → câu 7 hỏi vay", cauTuVanKe({ ...du, can_vay: null })?.cau === "Mình có cần em tư vấn thêm phần vay ngân hàng không ạ?");
ok("TV-09 can_vay=false là ĐÃ trả lời → hết câu", cauTuVanKe(du) === null);
ok("TV-10 'Ny'ah Phú Định' khớp dự án / câu khách; 'Ny'ah Bình Tây', 'phường Phú Định' thì không",
  laHoiNyah(["Ny'ah Phú Định"], "") && laHoiNyah([], "nyah phu dinh con can khong em") && !laHoiNyah(["Ny'ah Bình Tây"], "nhà ở phường Phú Định"));
ok("TV-11 không có người lớn tuổi, không hỏi Ny'ah → không có câu thang máy", cauThangMay("vợ chồng, 2 con nhỏ", false) === null);

console.log(`\nTƯ VẤN MUA: ${hong ? `${hong}/${dat + hong} CA HỎNG` : `${dat}/${dat} CA ĐẠT`}`);
if (hong) process.exitCode = 1;
