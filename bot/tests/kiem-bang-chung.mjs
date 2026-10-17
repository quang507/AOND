// kiem-bang-chung.mjs — FR-208 (TS-AIBOC-01): code kiểm bằng chứng cho đề xuất bóc tách của model.
// Không mạng, không DB, không model.   bun bot/tests/kiem-bang-chung.mjs
//
// Hai loại ca: BỊA (model nói điều tin không có / gán nhầm ô) phải BỎ đúng lý do; ĐÚNG phải
// ĐẠT. Một ca bịa lọt vào `dat` là cổng đỏ — đó là thứ duy nhất FR-208 hứa.
import { nhanDienNhieuFact } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { boCauNhanXet, nhanXetKhongCanCu, coCauHoi, damBaoCauHoi, coMenhDeDaDang, boHuaDaDang } from "../supabase/functions/_shared/extraction/van-tra-loi.ts";
import { trichCoTrongTin as trichCoTrongTinT, docDongY as docDongYT, canTheoAi, docLaiHopLe, chuDeSoDo, laKiemNhe as laKiemNheTest, yLuotLech, kiemYCuocRao } from "../supabase/functions/_shared/extraction/kiem-bang-chung.ts";
import { anCauDaDap } from "../supabase/functions/_shared/extraction/van-tra-loi.ts";
import { giaTriCoTrongLoi, locGiaTriHoSo } from "../supabase/functions/_shared/extraction/kiem-bang-chung.ts";
import { diaChiTuYThem, boSungDiaChiTuKienThuc } from "../supabase/functions/_shared/extraction/kiem-bang-chung.ts";
import { cacQuanTrong } from "../supabase/functions/_shared/dia_ban.ts";
import { cungNoiDungDiaChi } from "../supabase/functions/_shared/extraction/kiem-bang-chung.ts";
import { chiLechChinhTa, gotManhOKhac, soSauTenDuong, traLoiThuocOKhac, cumGocTrongTin, giaTriNguyenVan, laONguyenVan, datKiemNhe, docTuXung, docMuaKem, docCamXuc, docCauKe, docVai, docYDinh, docHoiLai, docKhongCanHoi, kiemXacNhan, laCauChonHai, laChiGat, nangXacNhanChac, boPhuDinhKetCau, chonDeGhi, chonViTri, tenDuongDayDu, laSoHemKhongPhaiDoRong, coMuiDuLieuRao, docAiChinh, giaTriChoCauTreo, KHOA_FACT_AI_BIET, coNoiDungTraLoi, kiemCapNhat, kiemDeXuat, kiemKienThuc, kiemTraLoiCau, laTrongCapNhat, soSanhVoiDb } from "../supabase/functions/_shared/extraction/kiem-bang-chung.ts";

let hong = 0, tong = 0;
const ok = (ten, dat, chi = "") => { tong++; if (!dat) hong++; console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`); };
const mot = (tin, khoa, gia_tri, trich_dan) => kiemDeXuat([{ khoa, gia_tri, trich_dan }], tin);
const bo = (ten, tin, khoa, gia_tri, trich_dan, lyDo) => {
  const k = mot(tin, khoa, gia_tri, trich_dan);
  ok(`BỎ ${ten}`, k.dat.length === 0 && k.bo[0]?.ly_do === lyDo, JSON.stringify(k));
};
const dat = (ten, tin, khoa, gia_tri, trich_dan) => {
  const k = mot(tin, khoa, gia_tri, trich_dan);
  ok(`ĐẠT ${ten}`, k.dat.length === 1, JSON.stringify(k));
};

const MT = "bán nhà mặt tiền đường Châu Văn Liêm phường 14 quận 5, ngang 4.2m dài 18m nở hậu 5m, 1 trệt 1 lửng 3 lầu sân thượng, đang cho thuê 45 triệu/tháng, giá 32 tỷ còn thương lượng";
const MB = "sang nhượng mặt bằng quán cà phê Quận 1 đường Nguyễn Trãi, 8x20, thuê 60 triệu/tháng, phí sang 350 triệu";
const GT = "bán đất thổ cư Nhà Bè 120m2, 45tr/m2 tổng 5 tỷ 4, đã có người cọc 200tr nhưng bể cọc";
const C4 = "hẻm rộng tầm 2m5 thôi em, cách mặt tiền 50m";
const TT = "cần bán nhà phường Hiệp Bình Chánh TP Thủ Đức, diện tích 62,5m², 1 trệt 1 lầu, hẻm 5m thông, giá 5,9 tỷ";

// ── BỊA: lớp 1 — trích dẫn không có trong tin ──
bo("trích dẫn bịa ('giá 35 tỷ' không có trong tin)", MT, "gia", "35 tỷ", "giá 35 tỷ", "trich_dan_khong_co_trong_tin");
bo("trích dẫn ghép hai chỗ xa nhau", MT, "duong", "Châu Văn Liêm quận 5", "Châu Văn Liêm quận 5", "trich_dan_khong_co_trong_tin");
bo("tự điền quận từ tên đường (tin không nói quận)", "bán nhà hẻm Nguyễn Trãi 4x15 giá 5 tỷ", "quan", "Quận 5", "Nguyễn Trãi", "quan_khong_khop_trich_dan");
bo("trích dẫn rỗng", MT, "gia", "32 tỷ", "", "trich_dan_khong_co_trong_tin");
// ── BỊA: lớp 2 — cụm có thật nhưng giá trị đọc ra khác ──
bo("giá 30 tỷ, trích 'giá 32 tỷ'", MT, "gia", "30 tỷ", "giá 32 tỷ", "tien_khong_khop_trich_dan");
bo("diện tích 80 từ '8x20'? (8x20 = 160)", MB, "dien_tich", "80", "8x20", "so_khong_co_trong_trich_dan");
bo("số phòng ngủ 3, trích '1 trệt 1 lửng 3 lầu'", MT, "so_phong_ngu", "4", "1 trệt 1 lửng 3 lầu", "so_khong_co_trong_trich_dan");
bo("loại căn hộ từ 'bán nhà mặt tiền'", MT, "loai_bds", "chung_cu", "bán nhà mặt tiền", "trich_dan_khong_noi_loai_nay");
bo("gấp = có, trích 'giá 32 tỷ còn thương lượng'", MT, "gap", "co", "giá 32 tỷ còn thương lượng", "trich_dan_khong_noi_gap");
bo("phường 4, trích 'phường 14'", MT, "phuong", "4", "phường 14", "phuong_khong_khop_trich_dan");
bo("'ko có phường' không phải tên phường", "ko có phường", "phuong", "ko có phường", "ko có phường", "phuong_khong_co_that");
bo("'không biết phường nào' không phải tên phường", "không biết phường nào em", "phuong", "không biết phường", "không biết phường nào", "phuong_khong_co_that");
bo("đường diễn đạt lại ('CVL')", MT, "duong", "CVL", "đường Châu Văn Liêm", "gia_tri_khong_nam_trong_trich_dan");
bo("loại BĐS ngoài danh sách", MT, "loai_bds", "nha_mat_tien", "nhà mặt tiền", "gia_tri_ngoai_danh_sach");
bo("khoá lạ", MT, "so_dien_thoai", "0903", "mặt tiền", "khoa_la");
// ── GÁN NHẦM Ô: lớp 3 — ngữ cảnh ──
bo("tiền thuê đang thu làm GIÁ tin bán", MT, "gia", "45 triệu", "45 triệu/tháng", "tien_thue_khong_phai_gia_ban");
bo("tiền cọc làm giá", GT, "gia", "200 triệu", "200tr", "ngu_canh_coc_phi_hoa_hong");
bo("phí sang làm giá", MB, "gia", "350 triệu", "350 triệu", "ngu_canh_coc_phi_hoa_hong");

// ── ĐÚNG ──
dat("giá 32 tỷ", MT, "gia", "32 tỷ", "giá 32 tỷ còn thương lượng");
dat("thu nhập thuê 45 triệu", MT, "thu_nhap_thue", "45 triệu", "đang cho thuê 45 triệu/tháng");
dat("giá thuê mặt bằng 60 triệu/tháng (tin cho thuê)", MB, "gia", "60 triệu", "thuê 60 triệu/tháng");
dat("loại giao dịch cho thuê", MB, "loai_giao_dich", "cho_thue", "thuê 60 triệu/tháng");
dat("diện tích từ ngang×dài 8x20 = 160", MB, "dien_tich", "160", "8x20");
dat("diện tích '62,5m²'", TT, "dien_tich", "62.5", "diện tích 62,5m²");
dat("hẻm '2m5' = 2.5", C4, "do_rong_hem", "2.5", "hẻm rộng tầm 2m5");
dat("cách mặt tiền 50", C4, "cach_mat_tien", "50", "cách mặt tiền 50m");
dat("số tầng 5 từ '1 trệt 1 lửng 3 lầu'? không — 3 lầu + trệt = 4", MT, "so_tang", "4", "1 trệt 1 lửng 3 lầu sân thượng");
dat("quận 5", MT, "quan", "Quận 5", "quận 5");
dat("phường 14", MT, "phuong", "Phường 14", "phường 14");
dat("phường tên chữ", TT, "phuong", "Hiệp Bình Chánh", "phường Hiệp Bình Chánh");
dat("đường", MT, "duong", "Châu Văn Liêm", "đường Châu Văn Liêm");
dat("loại nhà phố", MT, "loai_bds", "nha_pho", "bán nhà mặt tiền");
dat("loại đất", GT, "loai_bds", "dat", "bán đất thổ cư");
dat("giá/m² 45tr", GT, "gia_m2", "45 triệu", "45tr/m2");
dat("thương lượng = có", MT, "thuong_luong", "co", "còn thương lượng");
dat("gấp = có", "cần bán gấp nhà q8 3 tỷ", "gap", "co", "cần bán gấp");
dat("pháp lý chữ", "sổ hồng riêng, hoàn công đủ", "phap_ly", "sổ hồng riêng", "sổ hồng riêng");
dat("sửa lời: 'đất trống'", "à anh nói lại, là đất trống chưa xây nha em, giá 10 tỷ 5 thôi", "loai_bds", "dat", "là đất trống chưa xây");
dat("sửa lời: giá mới 10 tỷ 5", "à anh nói lại, là đất trống chưa xây nha em, giá 10 tỷ 5 thôi", "gia", "10 tỷ 5", "giá 10 tỷ 5");
dat("trích dẫn khác hoa/thường + dấu vẫn khớp", MT, "duong", "Châu Văn Liêm", "DUONG CHAU VAN LIEM");

// ── lượt đo bóng thật 14/09 (33 lượt, 203 đề xuất): các ca LỌT mà sai + các ca bị bỏ oan ──
const MBT = "sang nhượng mặt bằng quán cà phê Quận 1 đường Nguyễn Trãi, 8x20, thuê 60 triệu/tháng, phí sang 350 triệu";
bo("thật: 'sang nhượng mặt bằng' → ban", MBT, "loai_giao_dich", "ban", "sang nhượng mặt bằng", "trich_dan_khong_noi_ban");
bo("thật: giá 350 triệu, trích 'phí sang 350 triệu' (chữ phí nằm TRONG cụm)", MBT, "gia", "350 triệu", "phí sang 350 triệu", "ngu_canh_coc_phi_hoa_hong");
bo("thật: thu nhập thuê 60 triệu ở tin sang nhượng mặt bằng", MBT, "thu_nhap_thue", "60 triệu/tháng", "thuê 60 triệu/tháng", "khong_phai_thu_nhap_thue");
dat("thật: 'sang nhượng mặt bằng' → cho_thue", MBT, "loai_giao_dich", "cho_thue", "sang nhượng mặt bằng");
bo("thật: số tầng 3 cho '1 trệt 1 lửng 3 lầu' (đếm lầu, quên trệt)", MT, "so_tang", "3", "1 trệt 1 lửng 3 lầu sân thượng", "so_tang_khong_khop_trich_dan");
bo("thật: số tầng 2 cho 'trệt 2 lầu st'", "e bán nhà hxh Nguyễn Kiệm Phú Nhuận 4x15 trệt 2 lầu st 3pn, giá 8 tỏi 3", "so_tang", "2", "trệt 2 lầu st", "so_tang_khong_khop_trich_dan");
dat("thật: số tầng 3 cho 'trệt 2 lầu st'", "e bán nhà hxh Nguyễn Kiệm Phú Nhuận 4x15 trệt 2 lầu st 3pn, giá 8 tỏi 3", "so_tang", "3", "trệt 2 lầu st");
const B3 = "cho thuê căn hộ Sunrise City quận 7, 76m2, 2 phòng ngủ, tầng 15 view sông, full nội thất, 18 triệu một tháng";
bo("thật: hướng = 'view sông'", B3, "huong", "view sông", "view sông", "gia_tri_khong_dung_loai_truong");
bo("thật: pháp lý = 'thổ cư hết'", "bán đất Củ Chi 100m2 thổ cư hết, 900tr, cần bán gấp", "phap_ly", "thổ cư hết", "thổ cư hết", "gia_tri_khong_dung_loai_truong");
bo("thật: kết cấu = 'xây tự do'", "bán lô đất nền KDC Trung Sơn Bình Chánh, 5x20, giá 95 triệu/m2, đường 12m, sổ riêng xây tự do", "ket_cau", "xây tự do", "sổ riêng xây tự do", "gia_tri_khong_dung_loai_truong");
bo("thật: dự án = 'Thảo Điền' (tên khu)", "biệt thự Thảo Điền quận 2, đất 300m2, xây 1 hầm 3 lầu, giá 95 tỷ", "du_an", "Thảo Điền", "biệt thự Thảo Điền", "khong_co_dau_hieu_du_an");
bo("thật: lý do bán = 'gấp'", "🏡 CHÍNH CHỦ BÁN GẤP NHÀ QUẬN 3", "ly_do_ban", "gấp", "BÁN GẤP", "gia_tri_khong_dung_loai_truong");
dat("thật: dự án 'Trung Sơn' trích 'KDC Trung Sơn'", "bán lô đất nền KDC Trung Sơn Bình Chánh, 5x20", "du_an", "Trung Sơn", "KDC Trung Sơn");
dat("thật: dự án 'Vinhomes Grand Park'", "bán căn hộ Vinhomes Grand Park Thủ Đức, căn S1.02", "du_an", "Vinhomes Grand Park", "căn hộ Vinhomes Grand Park");
dat("thật: hướng 'Đông Nam'", "hướng ban công Đông Nam, sổ hồng", "huong", "Đông Nam", "hướng ban công Đông Nam");
// bị bỏ OAN ở lượt đo (model đúng, bộ kiểm đọc không ra)
dat("oan: giá số trần '5.2' cho '5 tỷ 2'", "bán nhà quận 10 phường 12, 48m2, giá 5 tỷ 2", "gia", "5.2", "5 tỷ 2");
dat("oan: giá '3150' cho 'giá 3 tỷ 150'", "căn S1.02 tầng 12, 69m2, giá 3 tỷ 150 bao thuế phí", "gia", "3150", "giá 3 tỷ 150");
dat("oan: giá '900' cho '900tr'", "bán đất Củ Chi 100m2 thổ cư hết, 900tr, cần bán gấp", "gia", "900", "900tr");
dat("oan: giá '8.3' cho '8 tỏi 3'", "e bán nhà hxh Nguyễn Kiệm 4x15, giá 8 tỏi 3", "gia", "8.3", "8 tỏi 3");
dat("oan: giá/m² '95' cho '95 triệu/m2'", "lô 5x20, giá 95 triệu/m2, đường 12m", "gia_m2", "95", "95 triệu/m2");
dat("oan: quận '5' cho 'quận 5'", MT, "quan", "5", "quận 5");
dat("oan: quận '11' cho 'q11'", "bán nhà q11", "quan", "11", "q11");
dat("oan: cọc '2 tháng'", "cọc 2 tháng, thuê tối thiểu 1 năm", "tien_coc", "2 tháng", "cọc 2 tháng");
bo("oan không phải oan: giá '6' cho '6 tỷ' mà ghi nhầm '60'", "bán nhà quận 5 phường 7, 50m2, 6 tỷ", "gia", "60", "6 tỷ", "tien_khong_khop_trich_dan");

// ── lượt đo bóng lần 2 (33 lượt, 196 đề xuất, 186 đạt): 2 ca còn lọt ──
bo("lần 2: tiền cọc = 'phí sang 350 triệu'", MBT, "tien_coc", "350 triệu", "phí sang 350 triệu", "trich_dan_khong_noi_coc");
bo("lần 2: nội thất = 'để ở hoặc cho thuê đều được'", "nhà hướng đông nam, để ở hoặc cho thuê đều được em", "noi_that", "để ở hoặc cho thuê đều được", "để ở hoặc cho thuê đều được", "gia_tri_khong_dung_loai_truong");
dat("lần 2: cọc 60 triệu", "cho thuê nhà 20 triệu/tháng, cọc 60 triệu", "tien_coc", "60 triệu", "cọc 60 triệu");
dat("lần 2: nội thất full", "căn hộ 2pn full nội thất, 18 triệu", "noi_that", "full nội thất", "full nội thất");
{
  const s = soSanhVoiDb([{ khoa: "do_rong_hem", gia_tri: "2m5", trich_dan: "hẻm rộng tầm 2m5" }], { alley_width_m: 2.5 }, {});
  ok("lần 2: so DB 'hẻm 2m5' với 2.5 → trùng (không phải lệch)", s.trung.includes("do_rong_hem"), JSON.stringify(s));
}

// ── loạt nhiều trường: tách đúng đạt / bỏ ──
{
  const k = kiemDeXuat([
    { khoa: "gia", gia_tri: "32 tỷ", trich_dan: "giá 32 tỷ" },
    { khoa: "gia", gia_tri: "45 triệu", trich_dan: "45 triệu/tháng" },
    { khoa: "quan", gia_tri: "Quận 5", trich_dan: "quận 5" },
    { khoa: "huong", gia_tri: "Đông Nam", trich_dan: "hướng Đông Nam" },
    null,
    { khoa: "gia" },
  ], MT);
  ok("loạt: 2 đạt, 2 bỏ (thuê làm giá, hướng bịa), phần tử hỏng bị bỏ qua", k.dat.length === 2 && k.bo.length === 2, JSON.stringify(k));
}

// ── mùi dữ liệu ──
ok("mùi: 'ok em' → không gọi model", !coMuiDuLieuRao("ok em"));
ok("mùi: 'dạ' → không", !coMuiDuLieuRao("dạ"));
ok("mùi: '5 tỷ 800' → có", coMuiDuLieuRao("5 tỷ 800"));
ok("mùi: 'hướng đông nam nha' → có", coMuiDuLieuRao("hướng đông nam nha"));

// ── so với DB ──
{
  const dat = [
    { khoa: "gia", gia_tri: "32 tỷ", trich_dan: "giá 32 tỷ" },
    { khoa: "quan", gia_tri: "Quận 5", trich_dan: "quận 5" },
    { khoa: "loai_giao_dich", gia_tri: "ban", trich_dan: "bán nhà" },
    { khoa: "dien_tich", gia_tri: "75.6", trich_dan: "ngang 4.2m dài 18m" },
    { khoa: "no_hau", gia_tri: "5", trich_dan: "nở hậu 5m" },
    { khoa: "ly_do_ban", gia_tri: "cần tiền", trich_dan: "cần tiền" },
  ];
  const dong = { price_vnd: 45e6, district: "Quận 5", deal: "cho_thue", area_m2: 75.6, rear_width_m: null };
  const s = soSanhVoiDb(dat, dong, {});
  ok("so DB: giá 32 tỷ ≠ DB 45 triệu → lech; quận trung; deal lech; diện tích trung; nở hậu + lý do → ai_them",
    s.lech.map((x) => x.khoa).sort().join() === "gia,loai_giao_dich" && s.trung.sort().join() === "dien_tich,quan" &&
      s.ai_them.map((x) => x.khoa).sort().join() === "ly_do_ban,no_hau", JSON.stringify(s));
  const s2 = soSanhVoiDb([{ khoa: "ly_do_ban", gia_tri: "cần tiền", trich_dan: "cần tiền" }], null, { ly_do_ban: "gia đình cần tiền" });
  ok("so DB: fact có sẵn chứa giá trị → trung", s2.trung.includes("ly_do_ban"), JSON.stringify(s2));
  const s3 = soSanhVoiDb([{ khoa: "gia", gia_tri: "25 tỷ", trich_dan: "25 tỷ", can: 2 }], { price_vnd: 3.6e9 }, {});
  ok("so DB: trường của căn thứ 2 không đem so với tin căn 1", !s3.lech.length && !s3.trung.length && !s3.ai_them.length, JSON.stringify(s3));
}

// ── FR-208 bước 2 (17/09/2026): chonDeGhi — AI GHI CÓ KIỂM, chỉ trường luật không ghi, trong khoảng hợp lệ ──
{
  const dx = (khoa, gia_tri, trich_dan, can = null) => ({ khoa, gia_tri, trich_dan, can });
  const chon = (dat, dong, facts = {}) => chonDeGhi(dat, soSanhVoiDb(dat, dong, facts), dong, facts);
  const lyDo = (r, khoa) => r.bo.find((b) => b.khoa === khoa)?.ly_do;

  const r1 = chon([dx("gia", "32 tỷ", "giá 32 tỷ"), dx("huong", "Đông Nam", "hướng Đông Nam"), dx("dien_tich", "240", "diện tích tổng 240m2")],
    { price_vnd: 32e9, direction: null, area_m2: null, deal: "ban" });
  ok("ghi: giá luật đã ghi (trùng) → AI không đụng; hướng trống → ghi 'huong'; 'diện tích tổng' không phải đất → bỏ",
    r1.ghi.map((g) => `${g.question}=${g.answer}`).join() === "huong=Đông Nam" && lyDo(r1, "dien_tich") === "dien_tich_khong_phai_dat", JSON.stringify(r1));
  // 24/09/2026 (chủ dự án test Zalo): "thời hạn thuê tối thiểu" chỉ cho tin CHO THUÊ — tin bán đang cho thuê thì không ghi.
  const rTh = chon([dx("thoi_han_thue", "4 năm", "cho thuê 4 năm rồi")], { deal: "ban" });
  ok("tin BÁN: AI đọc 'thời hạn thuê 4 năm' → KHÔNG ghi", rTh.ghi.length === 0 && lyDo(rTh, "thoi_han_thue") === "thoi_han_thue_chi_cho_tin_thue", JSON.stringify(rTh));
  const rTh2 = chon([dx("thoi_han_thue", "1 năm", "thuê tối thiểu 1 năm")], { deal: "cho_thue" });
  ok("tin CHO THUÊ: 'thuê tối thiểu 1 năm' vẫn ghi", rTh2.ghi.some((g) => g.question === "thoi_han_thue"), JSON.stringify(rTh2));
  const r2 = chon([dx("gia", "30 tỷ", "giá 30 tỷ")], { price_vnd: 32e9, deal: "ban" });
  ok("ghi: luật và AI LỆCH giá → không ghi, không đè", r2.ghi.length === 0 && r2.bo.length === 0, JSON.stringify(r2));
  const r3 = chon([dx("so_phong_ngu", "3", "3 phòng ngủ"), dx("so_wc", "70", "70 wc"), dx("so_tang", "4", "trệt 3 lầu"), dx("do_rong_hem", "5", "hẻm 5m"), dx("phuong", "14", "phường 14"), dx("gap", "co", "cần bán gấp")],
    { bedrooms: null, bathrooms: null, floors: null, alley_width_m: null, ward: null, gap: null, district: "Quận Gò Vấp" });
  // SRS-5.1zzzzj: phường số chỉ ghi qua cửa `tenPhuongCot` — "phường 14" + Quận Gò Vấp → Phường An Hội Tây (không "Phường 14").
  ok("ghi: số trong khoảng → ghi đúng dạng (3 · '4 tầng' vào ket_cau · '5m' · phường 14 Gò Vấp = 'Phường An Hội Tây' · cụm gấp); 70 wc ngoài khoảng → bỏ",
    r3.ghi.map((g) => `${g.question}=${g.answer}`).join("|") === "so_phong_ngu=3|ket_cau=4 tầng|do_rong_hem=5m|phuong=Phường An Hội Tây|gap=cần bán gấp" && lyDo(r3, "so_wc") === "so_ngoai_khoang", JSON.stringify(r3));
  // Cách nói mới: phường số không có trong bảng phường cũ ("phường 7" + Quận 4 — chưa có văn bản, OPEN-60) → KHÔNG ghi, lý do
  // phuong_khong_chuan; không quận thì phường số cũng không ghi.
  const r3b = chon([dx("phuong", "7", "phường 7")], { ward: null, district: "Quận 4" });
  const r3c = chon([dx("phuong", "Phường 7", "p.7")], { ward: null, district: null });
  ok("ghi: phường số không ra phường mới (P7 Q4 · P7 không quận) → bỏ 'phuong_khong_chuan', không bao giờ 'Phường N'",
    r3b.ghi.length === 0 && lyDo(r3b, "phuong") === "phuong_khong_chuan" && r3c.ghi.length === 0 && lyDo(r3c, "phuong") === "phuong_khong_chuan", JSON.stringify({ r3b, r3c }));
  // SRS-5.1zzzzl (OPEN-60): Phường 6 Quận 3 gộp vào Võ Thị Sáu năm 2020 (NQ 1111/NQ-UBTVQH14 Điều 2 khoản 1 điểm a) → nay Xuân Hòa.
  const r3d = chon([dx("phuong", "6", "phường 6")], { ward: null, district: "Quận 3" });
  ok("ghi: «phường 6» + Quận 3 (gộp 2020, có văn bản, 20261009d) → phuong=Phường Xuân Hòa",
    r3d.ghi.map((g) => `${g.question}=${g.answer}`).join("|") === "phuong=Phường Xuân Hòa", JSON.stringify(r3d));
  const r4 = chon([dx("quan", "Quận 5", "quận 5"), dx("duong", "Châu Văn Liêm", "đường Châu Văn Liêm"), dx("ma_can", "S1.02", "căn S1.02")], { district: null, street: null, unit_code: null });
  ok("ghi: quận / đường / mã căn không có chỗ ghi fact → bỏ khoa_khong_co_cho_ghi", r4.ghi.length === 0 && r4.bo.every((b) => b.ly_do === "khoa_khong_co_cho_ghi") && r4.bo.length === 3, JSON.stringify(r4));
  // 05/10/2026 (SRS-5.1zz): hai khoá cùng đổ về ket_cau → cụm chữ thắng số, bất kể AI liệt kê cái nào trước.
  const r5 = chon([dx("so_tang", "4", "trệt 3 lầu"), dx("ket_cau", "trệt 3 lầu", "trệt 3 lầu")], { floors: null });
  ok("ghi: so_tang trước, ket_cau sau → ghi 'trệt 3 lầu', so_tang fact_da_co", r5.ghi.length === 1 && r5.ghi[0].answer === "trệt 3 lầu" && r5.bo.some((b) => b.khoa === "so_tang" && b.ly_do === "fact_da_co"), JSON.stringify(r5));
  const r5b = chon([dx("ket_cau", "trệt 3 lầu", "trệt 3 lầu"), dx("so_tang", "4", "trệt 3 lầu")], { floors: null });
  ok("ghi: ket_cau trước, so_tang sau → vẫn 'trệt 3 lầu'", r5b.ghi.length === 1 && r5b.ghi[0].answer === "trệt 3 lầu", JSON.stringify(r5b));
  const r5c = chon([dx("so_tang", "3", "3 tầng")], { floors: null });
  ok("ghi: chỉ có so_tang → vẫn ghi '3 tầng'", r5c.ghi.length === 1 && r5c.ghi[0].answer === "3 tầng", JSON.stringify(r5c));
  // 30/09/2026 (bắn thử bán lx-ban-292b): "phí quản lý 15k/m2" → AI "15 nghìn" mất đơn vị.
  const rPql = chon([dx("phi_quan_ly", "15 nghìn", "phí quản lý 15k/m2")], {});
  ok("ghi: phí quản lý AI '15 nghìn' mà chữ khách '15k/m2' → giữ '15k/m2'", rPql.ghi.map((g) => `${g.question}=${g.answer}`).join() === "phi_quan_ly=15k/m2", JSON.stringify(rPql));
  const rPql2 = chon([dx("phi_quan_ly", "15k/m2", "phí quản lý 15k/m2")], {});
  ok("ghi: phí quản lý AI đã có đơn vị → giữ nguyên", rPql2.ghi.map((g) => g.answer).join() === "15k/m2", JSON.stringify(rPql2));
  const rPql3 = chon([dx("phi_quan_ly", "500 nghìn/tháng", "phí quản lý 500k một tháng")], {});
  ok("ghi: phí quản lý không có /m2 trong chữ khách → giá trị AI", rPql3.ghi.map((g) => g.answer).join() === "500 nghìn/tháng", JSON.stringify(rPql3));
  ok("kiemTraLoiCau: '15 nghìn' trích 'phí quản lý 15k/m2' → '15 nghìn/m2'", kiemTraLoiCau({ co_tra_loi: true, gia_tri: "15 nghìn", trich_dan: "phí quản lý 15k/m2" }, "sổ hồng rồi em, phí quản lý 15k/m2")?.giaTri === "15 nghìn/m2");
  ok("kiemTraLoiCau: '15k/m2' đã có đơn vị → giữ", kiemTraLoiCau({ co_tra_loi: true, gia_tri: "15k/m2", trich_dan: "phí quản lý 15k/m2" }, "phí quản lý 15k/m2")?.giaTri === "15k/m2");
  ok("kiemTraLoiCau: '68m2' không bị gắn thêm", kiemTraLoiCau({ co_tra_loi: true, gia_tri: "68m2", trich_dan: "68m2" }, "căn 68m2")?.giaTri === "68m2");
  const r6 = chon([dx("huong", "Tây", "hướng Tây", 2)], { direction: null });
  ok("ghi: trường căn thứ 2 → không ghi vào tin căn 1", r6.ghi.length === 0 && r6.bo.length === 0, JSON.stringify(r6));
  const r7 = chon([dx("gia", "32 tỷ", "giá 32 tỷ")], { price_vnd: null, deal: "cho_thue" });
  ok("ghi: giá thuê 32 tỷ ngoài khoảng thuê → bỏ gia_ngoai_khoang", r7.ghi.length === 0 && lyDo(r7, "gia") === "gia_ngoai_khoang", JSON.stringify(r7));
  const r8 = chon([dx("gia", "45 triệu", "45 triệu/tháng"), dx("tien_coc", "2 tháng", "cọc 2 tháng"), dx("dien_tich", "62,5", "62,5m²")], { price_vnd: null, deal: "cho_thue", area_m2: null });
  ok("ghi: giá thuê trong khoảng, cọc theo tháng, diện tích '62,5' → '62.5m2'",
    r8.ghi.map((g) => `${g.question}=${g.answer}`).join("|") === "gia=45 triệu|tien_coc=2 tháng|dien_tich=62.5m2", JSON.stringify(r8));
  const r9 = chon([dx("dien_tich", "80", "80m2")], { area_m2: null }, { dien_tich_san: "240m2" });
  ok("ghi: tin đã có fact sàn → AI không ghi diện tích đất (luật cố ý để trống)", r9.ghi.length === 0 && lyDo(r9, "dien_tich") === "dien_tich_khong_phai_dat", JSON.stringify(r9));
}

// ── 17/09/2026: AI đọc trước cho câu treo + kiến thức thêm ──
{
  const dx = (khoa, gia_tri, trich_dan, can = null) => ({ khoa, gia_tri, trich_dan, can });
  dat("pháp lý CHUẨN HOÁ: 'sổ hồng riêng' từ trích 'shr' (cùng mã)", "shr, nhà ở từ 2019 rồi", "phap_ly", "sổ hồng riêng", "shr");
  bo("pháp lý bịa mã khác: 'sổ hồng chung' từ trích 'shr'", "shr, nhà ở từ 2019 rồi", "phap_ly", "sổ hồng chung", "shr", "gia_tri_khong_nam_trong_trich_dan");
  dat("nội thất chuẩn hoá: 'full nội thất' từ 'full nt'", "full nt, 2 máy lạnh", "noi_that", "full nội thất", "full nt");
  ok("câu treo pháp lý: AI 'sổ hồng riêng' → giá trị cho luật ghi", giaTriChoCauTreo([dx("phap_ly", "sổ hồng riêng", "shr")], "phap_ly", {}) === "sổ hồng riêng");
  ok("câu treo diện tích đất: AI dien_tich '62,5' → '62.5m2'", giaTriChoCauTreo([dx("dien_tich", "62,5", "62,5m²")], "dien_tich_dat", { area_m2: null }) === "62.5m2");
  ok("câu treo giá: AI không có khoá đó → null", giaTriChoCauTreo([dx("huong", "Đông", "hướng Đông")], "gia", {}) === null);
  ok("câu treo số WC: AI '70' ngoài khoảng → null", giaTriChoCauTreo([dx("so_wc", "70", "70 wc")], "so_wc", {}) === null);
  const tin = "shr, nhà ở từ 2019 rồi, gần chợ Bình Tây, khu an ninh, gần chợ bình tây";
  const kt = kiemKienThuc(["gần chợ Bình Tây", "khu an ninh", "gần chợ bình tây", "có hồ bơi", "nhà ở từ 2019 rồi"], tin, [dx("hien_trang", "nhà ở từ 2019 rồi", "nhà ở từ 2019 rồi")]);
  ok("kiến thức: nguyên văn giữ, trùng bỏ, bịa ('có hồ bơi') bỏ, trùng trích dẫn đã có khoá bỏ", kt.join("|") === "gần chợ Bình Tây|khu an ninh", JSON.stringify(kt));
  // SRS-5.1zzzzzw: trần 3 ý / 80 ký tự từng cắt bài rao KDC Cầu Tràm còn một tiện ích — nay 12 ý / 160 ký tự.
  ok("kiến thức: tối đa 12 (không còn cắt ở 3)", kiemKienThuc(["a1 b", "c2 d", "e3 f", "g4 h"], "a1 b c2 d e3 f g4 h", []).length === 4);
  ok("kiến thức: 13 ý → giữ 12", kiemKienThuc(Array.from({ length: 13 }, (_, i) => `y so ${i} x`), Array.from({ length: 13 }, (_, i) => `y so ${i} x`).join(". "), []).length === 12);
  const TIN_CT = "Tiện ích xung quanh:\nChợ Rạch Kiến hoặc Chợ Phước Vân ~ 3 - 5 phút.\nUBND xã và trạm y tế ~ 2 - 3 phút.\nHệ thống trường học các cấp ~ 10 phút.\nKhu công nghiệp Cầu Tràm ~ 10 phút.\nChợ Bình Chánh ~ 20 phút.\nVinhomes Hưng Long Bình Chánh ~ 20 phút.\nThuận tiện kết nối các trục giao thông huyết mạch như: DT835, DT826, Quốc lộ 1A, cao tốc Bến Lức - Long Thành, cao tốc TP Hồ Chí Minh - Trung Lương, Đại lộ Võ Văn Kiệt, Đại lộ Nguyễn Văn Linh.";
  const Y_CT = ["Chợ Rạch Kiến hoặc Chợ Phước Vân ~ 3 - 5 phút", "UBND xã và trạm y tế ~ 2 - 3 phút", "Hệ thống trường học các cấp ~ 10 phút", "Khu công nghiệp Cầu Tràm ~ 10 phút",
    "Chợ Bình Chánh ~ 20 phút", "Vinhomes Hưng Long Bình Chánh ~ 20 phút", "cao tốc Bến Lức - Long Thành", "cao tốc TP Hồ Chí Minh - Trung Lương", "Đại lộ Võ Văn Kiệt"];
  const ktCT = kiemKienThuc(Y_CT, TIN_CT, []);
  ok("ZZZZZW-K1 (ca gốc KDC Cầu Tràm) 9 tiện ích nguyên văn → giữ ĐỦ 9, không cắt", ktCT.length === 9 && ktCT.includes("Khu công nghiệp Cầu Tràm ~ 10 phút"), JSON.stringify(ktCT));
 // SRS-5.1zzzzzx: số có m² không bao giờ là số đo mét; gật câu bot xác nhận có số.
  {
    const r1 = kiemDeXuat([dx("ngang", "80", "Diện tích đất 80m²")], "Thiết kế 1 trệt 1 lửng 3 lầu. Diện tích đất 80m²*. Nhà phố 2 mặt tiền");
    ok("ZZZZZX-K1 (ca gốc The Sholi) ngang 80 trích 'Diện tích đất 80m²' → BỊ BỎ (m² là diện tích, không phải ngang)", r1.dat.length === 0 && r1.bo.length === 1, JSON.stringify(r1));
    const r2 = kiemDeXuat([dx("do_rong_hem", "80", "80m2")], "nhà 80m2 hẻm xe hơi");
    ok("ZZZZZX-K1b hẻm 80 trích '80m2' → bỏ, và không đọc ra '2' sau chữ m", r2.dat.length === 0, JSON.stringify(r2));
    const r3 = kiemDeXuat([dx("do_rong_duong", "12", "đường trước nhà 12m"), dx("ngang", "4.1", "ngang 4,1m")], "đường trước nhà 12m, ngang 4,1m và dài 28,4m");
    ok("ZZZZZX-K1c đối chứng: '12m', 'ngang 4,1m' vẫn là số đo mét", r3.dat.length === 2, JSON.stringify(r3));
    const tl = kiemTraLoiCau({ co_tra_loi: true, gia_tri: "đúng, diện tích đất 80m²", trich_dan: "đúng rồi" }, "đúng rồi", "Vâng ạ. Diện tích đất mỗi căn là 80m² đó có đúng không ạ?", { cauHoi: "dien_tich_dat", loai: "nha_pho" });
    ok("ZZZZZX-K2 (ca gốc) bot hỏi xác nhận '80m² đó có đúng không', khách 'đúng rồi' → nhận giá trị đúng cụm số trong câu bot '80m2'", tl?.co === true && /^80\s*m2$/i.test(tl?.giaTri ?? ""), JSON.stringify(tl));
    const tl2 = kiemTraLoiCau({ co_tra_loi: true, gia_tri: "đúng, diện tích đất 80m²", trich_dan: "đúng rồi" }, "đúng rồi", "Nhà mình diện tích bao nhiêu m² vậy anh chị?", { cauHoi: "dien_tich_dat", loai: "nha_pho" });
    ok("ZZZZZX-K2b đối chứng: câu bot KHÔNG phải câu xác nhận → gật trơn không mang giá trị (như cũ)", tl2?.co === true && tl2?.giaTri === null, JSON.stringify(tl2));
    const tl3 = kiemTraLoiCau({ co_tra_loi: true, gia_tri: "đúng, 90m²", trich_dan: "đúng rồi" }, "đúng rồi", "Diện tích đất 80m² đó có đúng không ạ?", { cauHoi: "dien_tich_dat", loai: "nha_pho" });
    ok("ZZZZZX-K2c đối chứng: số AI trả không có trong câu bot → bỏ", tl3?.co === true && tl3?.giaTri === null, JSON.stringify(tl3));
  }
  ok("ZZZZZW-K1b ý dài 81–160 ký tự nguyên văn → giữ", kiemKienThuc(["Thuận tiện kết nối các trục giao thông huyết mạch như: DT835, DT826, Quốc lộ 1A, cao tốc Bến Lức - Long Thành"], TIN_CT, []).length === 1);
}

// ── 21/09/2026 chế độ `chinh` — AI là đường chính: `docAiChinh` + câu treo mặt tiền / diện tích từ ngang×dài ──
{
  const dx = (khoa, gia_tri, trich_dan, can = null) => ({ khoa, gia_tri, trich_dan, can });
  ok("câu treo MẶT TIỀN: AI ngang 4 + dài 16 → 'ngang 4m dài 16m'", giaTriChoCauTreo([dx("ngang", "4", "ngang 4"), dx("dai", "16", "dài 16")], "mat_tien", {}) === "ngang 4m dài 16m");
  ok("câu treo MẶT TIỀN: chỉ ngang → '4.5m'", giaTriChoCauTreo([dx("ngang", "4.5", "ngang 4.5")], "mat_tien", {}) === "4.5m");
  ok("câu treo DIỆN TÍCH ĐẤT chưa có m², có ngang×dài → '5x20'", giaTriChoCauTreo([dx("ngang", "5", "5x20"), dx("dai", "20", "5x20")], "dien_tich_dat", {}) === "5x20");
  ok("câu treo diện tích: có dien_tich thì ưu tiên dien_tich", giaTriChoCauTreo([dx("dien_tich", "100", "100m2"), dx("ngang", "5", "5x20"), dx("dai", "20", "5x20")], "dien_tich", {}) === "100m2");
  const a = docAiChinh([
    dx("gia", "1 tỷ 8", "giá 1 tỷ 8"), dx("loai_bds", "chung_cu", "căn hộ"), dx("loai_giao_dich", "ban", "bán"),
    dx("quan", "quận 7", "quận 7"), dx("duong", "Nguyễn Lương Bằng", "đường Nguyễn Lương Bằng"), dx("du_an", "Sunrise City", "Sunrise City"),
    dx("so_phong_ngu", "2", "2 phòng ngủ"), dx("ngang", "5", "5x20"), dx("dai", "20", "5x20"), dx("gap", "co", "cần bán gấp"), dx("ma_can", "a12-05", "căn a12-05"),
    dx("no_hau", "6", "nở hậu 6m"),
  ], null);
  const ghi = Object.fromEntries(a.ghi.map((g) => [g.question, g.answer]));
  ok("docAiChinh: fact ghép đủ — dien_tich '5x20' (ngang×dài, chưa có m²), vi_tri, du_an_ten, loai_giao_dich, loai_bds, gia, so_phong_ngu, gap (cụm khách nói)",
    ghi.dien_tich === "5x20" && ghi.vi_tri === "đường Nguyễn Lương Bằng" /* SRS-5.1zzr: nguyên văn cụm khách */ && ghi.du_an_ten === "Sunrise City" && ghi.loai_giao_dich === "ban" && ghi.loai_bds === "chung_cu" &&
      ghi.gia === "1 tỷ 8" && ghi.so_phong_ngu === "2" && ghi.gap === "cần bán gấp" && !("mat_tien" in ghi), JSON.stringify(a));
  ok("docAiChinh: cột lõi — quận chuẩn hoá 'Quận 7', loại, giao dịch, giá, 2 PN, ngang/dài, gấp true, mã căn A12-05, dienTich null (đã là AxB)",
    a.quan === "Quận 7" && a.loaiBds === "chung_cu" && a.loaiGiaoDich === "ban" && a.gia === "1 tỷ 8" && a.soPhongNgu === 2 && a.ngang === 5 && a.dai === 20 &&
      a.gap === true && a.maCan === "A12-05" && a.dienTich === null && a.duong === "đường Nguyễn Lương Bằng" && a.duAn === "Sunrise City", JSON.stringify(a));
  // 02/10/2026 (đối chiếu AI ↔ code, SRS-5.1zb): bản trước khẳng định "nở hậu chưa có ô → bỏ vào `bo`" — tức AI đọc đúng mà code vứt.
  ok("docAiChinh: nở hậu có ô — fact no_hau '6m', không còn nằm trong `bo`", ghi.no_hau === "6m" && !a.bo.some((b) => b.khoa === "no_hau"), JSON.stringify({ nh: ghi.no_hau, bo: a.bo }));
  const b = docAiChinh([dx("dien_tich", "80", "80m2"), dx("ngang", "4", "ngang 4m"), dx("dai", "20", "dài 20m"), dx("quan", "Quận Ba Đình", "quận Ba Đình"), dx("loai_bds", "nha_mat_tien", "nhà mặt tiền")], null);
  const ghiB = Object.fromEntries(b.ghi.map((g) => [g.question, g.answer]));
  ok("docAiChinh: có m² lẫn ngang×dài → dien_tich '80m2' + mat_tien 'ngang 4m dài 20m'; dienTich 80; quận ngoài TP.HCM → tên vùng (như đường luật, SRS-5.1zq); loại ngoài danh sách → null",
    ghiB.dien_tich === "80m2" && ghiB.mat_tien === "ngang 4m dài 20m" && b.dienTich === 80 && b.quan === "Hà Nội" && b.loaiBds === null, JSON.stringify(b));
  ok("docAiChinh: quận không đọc ra được ('Quận Xyz') → null", docAiChinh([dx("quan", "Quận Xyz", "quận Xyz")], null).quan === null);
  const c = docAiChinh([], null);
  ok("docAiChinh: AI không nói gì → ghi rỗng, mọi cột null (nơi gọi rơi về luật)", c.ghi.length === 0 && c.gia === null && c.quan === null && c.loaiBds === null && c.gap === null);
  bo("hiện trạng 'xe hơi' từ 'hẻm xe hơi' (không tả tình trạng nhà)", "ngang 5 dài 20 nha, hẻm xe hơi", "hien_trang", "xe hơi", "hẻm xe hơi", "gia_tri_khong_dung_loai_truong");
  dat("hiện trạng 'trống' từ 'nhà đang trống'", "phường 7, nhà đang trống dọn vô ở liền", "hien_trang", "trống", "nhà đang trống");
  dat("hiện trạng 'mới sơn sửa lại'", "nhà mới sơn sửa lại", "hien_trang", "mới sơn sửa lại", "nhà mới sơn sửa lại");
  ok("kiến thức: lời hứa / lời nói chuyện ('để em coi lại sổ rồi báo', 'cảm ơn em') KHÔNG vào mô tả; 'gần chợ' vẫn vào",
    kiemKienThuc(["để em coi lại sổ rồi báo", "cảm ơn em nha", "gần chợ Bình Chánh"], "ngang 5 dài 20, để em coi lại sổ rồi báo, cảm ơn em nha, gần chợ Bình Chánh", []).join("|") === "gần chợ Bình Chánh");
  // Tạo tin: khoảng giá theo loại giao dịch AI đọc (bắn thật mau-v-06: "2tr8/tháng" phòng trọ).
  const d6 = docAiChinh([dx("gia", "2tr8", "2tr8/thang"), dx("loai_giao_dich", "cho_thue", "cho thue")], null);
  ok("docAiChinh: thuê 2tr8 đạt khoảng giá THUÊ nhờ loai_giao_dich AI đọc; 'cho_thue' chuẩn hoá đúng", d6.gia === "2tr8" && d6.loaiGiaoDich === "cho_thue" && d6.ghi.some((g) => g.question === "loai_giao_dich" && g.answer === "cho_thue"), JSON.stringify(d6));
  ok("docAiChinh: thuê 2tr8 mà AI không nói loại, dong.deal = cho_thue (luật đỡ) → vẫn đạt", docAiChinh([dx("gia", "2tr8", "2tr8/thang")], { deal: "cho_thue" }).gia === "2tr8");
  // FR-208 (g): KHỚP MỜ trích dẫn ≤ 3 ký tự, chữ số phải y hệt, cụm ≥ 10 ký tự.
  const kMo = kiemDeXuat([dx("duong", "Châu Văn Liêm", "đường Châu Văn Liên")], MT);
  ok("khớp mờ: trích 'đường Châu Văn Liên' (lệch 1 chữ) → đạt, ghi lại cụm thật", kMo.dat.length === 1 && kMo.dat[0].trich_dan_sua === "duong chau van liem", JSON.stringify(kMo));
  bo("khớp mờ KHÔNG đổi chữ số: 'dài 16m' khi tin là 'dài 18m'", MT, "dai", "16", "ngang 4.2m dài 16m", "trich_dan_khong_co_trong_tin");
  bo("khớp mờ tối đa 3 ký tự: lệch 4 → bỏ", MT, "duong", "Châu Văn Liêm", "đường Chou Vin Liun", "trich_dan_khong_co_trong_tin");
  bo("khớp mờ không áp cho cụm ngắn (< 10 ký tự)", "sổ hồng riêng, hẻm 5m", "phap_ly", "sổ hồng", "sô hùng", "trich_dan_khong_co_trong_tin");
  ok("khớp mờ vẫn qua kiểm lớp 2: 'giá 30 tỷ' trích 'giá 32 tỷ còn thương lượng' lệch chữ → tiền không khớp vẫn bỏ",
    kiemDeXuat([dx("gia", "30 tỷ", "giá 32 tỷ còn thương lương")], MT).bo[0]?.ly_do === "tien_khong_khop_trich_dan");
  dat("thu nhập thuê của toà nhà BÁN: 'thu nhập 180 triệu/tháng'", "Bán toà CHDV Phú Nhuận 6x22, thu nhập 180 triệu/tháng, giá 45 tỷ", "thu_nhap_thue", "180 triệu", "thu nhập 180 triệu/tháng");
  bo("thu nhập thuê KHÔNG áp cho tin cho thuê: 'thuê 60 triệu/tháng' của mặt bằng", MB, "thu_nhap_thue", "60 triệu", "thuê 60 triệu/tháng", "khong_phai_thu_nhap_thue");
  const dTN = docAiChinh([dx("thu_nhap_thue", "120 triệu", "thu nhập 120 triệu/tháng"), dx("loai_giao_dich", "ban", "Bán toà")], null);
  ok("docAiChinh: thu_nhap_thue → fact doanh_thu '120 triệu'; tiền không đọc được thì bỏ", dTN.ghi.some((g) => g.question === "doanh_thu" && g.answer === "120 triệu") &&
    docAiChinh([dx("thu_nhap_thue", "nhiều", "thu nhập nhiều")], null).bo.some((b) => b.khoa === "thu_nhap_thue" && b.ly_do === "khong_doc_duoc_tien"), JSON.stringify(dTN));
  // 21/09/2026 (Zalo thật): câu VỊ TRÍ lấy `duong` của AI, đã phục hồi dấu.
  const kDau = kiemDeXuat([dx("duong", "Phạm Thế Hiển", "pham the hien"), dx("quan", "Quận 8", "q8"), dx("phuong", "4", "p4")], "nhà của anh ở hem 4m pham the hien, p4 q8 nha");
  ok("phục hồi dấu: 'Phạm Thế Hiển' từ trích 'pham the hien' đạt (chữ cái y hệt, chỉ thêm dấu); 'Quận 8' từ 'q8', phường 4 từ 'p4' đạt", kDau.dat.length === 3 && kDau.bo.length === 0, JSON.stringify(kDau.bo));
  bo("phục hồi dấu KHÔNG được đổi chữ cái: 'Phạm Thế Hiếu' từ 'pham the hien'", "hem 4m pham the hien", "duong", "Phạm Thế Hiếu", "pham the hien", "gia_tri_khong_nam_trong_trich_dan");
  ok("giới hạn đã biết: dấu SAI trên cùng chữ cái ('Phạm Thế Hiền') lớp kiểm không phân biệt được — chấp nhận, hại chỉ ở dấu", kiemDeXuat([dx("duong", "Phạm Thế Hiền", "pham the hien")], "hem 4m pham the hien").dat.length === 1);
  ok("câu treo VỊ TRÍ: AI duong → 'Phạm Thế Hiển' (không ghép hẻm / phường)", giaTriChoCauTreo(kDau.dat, "vi_tri", {}) === "Phạm Thế Hiển");
  ok("câu treo VỊ TRÍ: AI không có duong → null (luật đỡ)", giaTriChoCauTreo([dx("do_rong_hem", "4", "hem 4m")], "vi_tri", {}) === null);
  // 02/10/2026 (đợt 1 chuyển luật sang AI, SRS-5.1v): tiện ích gần / năm xây / thế chấp / hẻm thông nay AI có ô — luật chỉ đỡ
  // khi model chết. Câu đứng tên vẫn là đường riêng (giữ chữ khách, không xin họ tên).
  // SRS-5.1zzzo: nguoi_dung_ten nay là khoá AI (xem O-13).
  ok("KHOA_FACT_AI_BIET có gia / phap_ly / vi_tri / mat_tien + tien_ich_gan / nam_xay / the_chap / hem_thong / nguoi_dung_ten",
    ["gia", "phap_ly", "vi_tri", "mat_tien", "loai_bds", "tien_ich_gan", "nam_xay", "the_chap", "hem_thong", "nguoi_dung_ten"].every((k) => KHOA_FACT_AI_BIET.has(k)));
}

{
  // SRS-5.1zzzzzzk (Zalo thật 14/10): lượt chốt đọc "đường huỳnh tấn phát số 1235" ↔ đã ghi "1235 Huỳnh Tấn Phát" → cùng nội dung, không ghi đè.
  ok("cungNoiDungDiaChi: '1235 Huỳnh Tấn Phát' ↔ 'đường huỳnh tấn phát số 1235' → cùng nội dung", cungNoiDungDiaChi("1235 Huỳnh Tấn Phát", "đường huỳnh tấn phát số 1235"));
  ok("cungNoiDungDiaChi: '12 Trần Bình Trọng' ↔ 'Đường Trần Bình Trọng số 12' → cùng nội dung", cungNoiDungDiaChi("12 Trần Bình Trọng", "Đường Trần Bình Trọng số 12"));
  ok("cungNoiDungDiaChi: '12 Trần Bình Trọng' ↔ 'hẻm 12 Trần Bình Trọng' → KHÁC (thêm hẻm là sửa thật)", !cungNoiDungDiaChi("12 Trần Bình Trọng", "hẻm 12 Trần Bình Trọng"));
  ok("cungNoiDungDiaChi: '1235 Huỳnh Tấn Phát' ↔ '1237 Huỳnh Tấn Phát' → KHÁC (đổi số nhà)", !cungNoiDungDiaChi("1235 Huỳnh Tấn Phát", "1237 Huỳnh Tấn Phát"));
  ok("cungNoiDungDiaChi: rỗng → không", !cungNoiDungDiaChi("", "đường X") && !cungNoiDungDiaChi(null, null));
  ok("chonViTri: luật 'hẻm 6m 12 Trần Hưng Đạo' + AI 'Trần Hưng Đạo' → '12 Trần Hưng Đạo' (số nhà luật + tên AI)",
    chonViTri("hẻm 6m 12 Trần Hưng Đạo", "Trần Hưng Đạo") === "12 Trần Hưng Đạo", chonViTri("hẻm 6m 12 Trần Hưng Đạo", "Trần Hưng Đạo"));
  ok("chonViTri: AI sửa chính tả 'Phạm Thế Hiển' ≠ luật 'pham the hier' → tin AI", chonViTri("hem 4m pham the hier", "Phạm Thế Hiển") === "Phạm Thế Hiển");
  ok("chonViTri: 'hem 4m Pham The Hien' không có số nhà → AI có dấu thắng (AIBOC-14)", chonViTri("hem 4m Pham The Hien", "Phạm Thế Hiển") === "Phạm Thế Hiển");
  ok("chonViTri: luật không dấu '123/4 an duong vuong' + AI có dấu → '123/4 An Dương Vương'", chonViTri("hem 5m 123/4 an duong vuong", "An Dương Vương") === "123/4 An Dương Vương");
  ok("chonViTri: 'Hung Vuong Plaza 126 Hung Vuong' + AI 'Hùng Vương' → '126 Hùng Vương' (lấy lần xuất hiện có số nhà)",
    chonViTri("Hung Vuong Plaza 126 Hung Vuong", "Hùng Vương") === "126 Hùng Vương", chonViTri("Hung Vuong Plaza 126 Hung Vuong", "Hùng Vương"));
  ok("chonViTri: thiếu một bên → lấy bên còn lại; cả hai rỗng → null", chonViTri(null, "Trần Hưng Đạo") === "Trần Hưng Đạo" && chonViTri("12 Trần Hưng Đạo", null) === "12 Trần Hưng Đạo" && chonViTri("", "") === null);
}

// ── 24/09/2026 (chủ dự án test Zalo): số nhà "137/28" không phải số đo; "dài 16m" ghép ngang đã có trong tin ──
{
  const dx = (khoa, gia_tri, trich_dan) => ({ khoa, gia_tri, trich_dan });
  const T = "137/28 nhé em, cần bán gấp giá 5 tỏi 9 thương lượng 5 tỏi 5 là bán được";
  bo("số nhà 137/28 đọc thành diện tích 137m2", T, "dien_tich", "137", "137/28", "so_khong_co_trong_trich_dan");
  bo("số nhà 137/28 đọc thành ngang 28", T, "ngang", "28", "137/28", "so_khong_co_trong_trich_dan");
  dat("diện tích thật vẫn đạt khi câu có cả số nhà", "137/28 đường số 59, 80m2", "dien_tich", "80", "80m2");
  ok("câu treo diện tích: AI chỉ 'dài 16', tin có ngang 5 → '5x16'", giaTriChoCauTreo([dx("dai", "16", "dài 16m")], "dien_tich_dat", { frontage_m: 5 }) === "5x16", String(giaTriChoCauTreo([dx("dai", "16", "dài 16m")], "dien_tich_dat", { frontage_m: 5 })));
  ok("câu treo diện tích: AI chỉ 'dài 16', ngang trong tin là chuỗi '5' → '5x16'", giaTriChoCauTreo([dx("dai", "16", "dài 16m")], "dien_tich", { frontage_m: "5" }) === "5x16");
  ok("câu treo diện tích: AI chỉ 'ngang 5' (tin có dài) → null, không tự nhân", giaTriChoCauTreo([dx("ngang", "5", "ngang 5m")], "dien_tich", { length_m: 16 }) === null);
  ok("câu treo diện tích: AI chỉ 'dài 16', tin CHƯA có ngang → null", giaTriChoCauTreo([dx("dai", "16", "dài 16m")], "dien_tich_dat", { frontage_m: null }) === null);
}

{
  // FR-223 (bắn thật 24/09): model viết lại SẠCH theo prompt (bỏ từ đệm "em") → vẫn là bằng chứng hợp lệ.
  const t = "chưa có sổ em, đang chờ ra sổ";
  const r1 = kiemDeXuat([{ khoa: "phap_ly", gia_tri: "chưa có sổ, đang chờ ra sổ", trich_dan: t, can: null }], t);
  ok("pháp lý bỏ từ đệm 'em' khỏi giá trị → vẫn ĐẠT", r1.dat.length === 1, JSON.stringify(r1));
  const r2 = kiemDeXuat([{ khoa: "phap_ly", gia_tri: "sổ hồng riêng", trich_dan: t, can: null }], t);
  ok("bỏ từ đệm KHÔNG mở đường bịa: 'sổ hồng riêng' từ 'chưa có sổ em…' → vẫn LOẠI", r2.dat.length === 0, JSON.stringify(r2));
  const t3 = "nội thất để lại hết nha anh";
  const r3 = kiemDeXuat([{ khoa: "noi_that", gia_tri: "để lại hết", trich_dan: t3, can: null }], t3);
  ok("nội thất 'để lại hết nha anh' → 'để lại hết' ĐẠT", r3.dat.length === 1, JSON.stringify(r3));
}

// 24/09/2026 (chủ dự án test Zalo): "Hợp đồng 10 năm cho thuê 4 năm rồi đó" — AI xếp vào pháp lý, lọt vì "hợp đồng" có trong hình pháp lý.
{
  const tin = "Hợp đồng 10 năm cho thuê 4 năm rồi đó";
  const r = kiemDeXuat([{ khoa: "phap_ly", gia_tri: tin, trich_dan: tin }], tin);
  ok("pháp lý = hợp đồng THUÊ → bỏ (phap_ly_la_hop_dong_thue)", r.dat.length === 0 && r.bo[0]?.ly_do === "phap_ly_la_hop_dong_thue", JSON.stringify(r));
  const t2 = "sổ hồng riêng, đang cho thuê";
  const r2 = kiemDeXuat([{ khoa: "phap_ly", gia_tri: "sổ hồng riêng", trich_dan: "sổ hồng riêng" }], t2);
  ok("pháp lý 'sổ hồng riêng' (câu có chữ thuê) vẫn ĐẠT", r2.dat.length === 1, JSON.stringify(r2));
}

// 24/09/2026 — bắn 10 tin bán đủ loại trên production (ID giả bn10-*).
{
  const ghiCua = (d, dong) => docAiChinh(d, dong).ghi.map((g) => `${g.question}=${g.answer}`).join();
  ok("toà nhà ĐANG BÁN: 'cho thuê từng phòng' → AI KHÔNG lật loại giao dịch", ghiCua([{ khoa: "loai_giao_dich", gia_tri: "cho_thue", trich_dan: "cho thuê từng phòng" }], { deal: "ban" }) === "");
  ok("'cho thuê chứ không bán' → vẫn đổi được sang cho thuê", ghiCua([{ khoa: "loai_giao_dich", gia_tri: "cho_thue", trich_dan: "cho thuê chứ không bán" }], { deal: "ban" }) === "loai_giao_dich=cho_thue");
  ok("tạo tin (chưa có loại giao dịch) → AI đọc 'cho thuê' vẫn ghi", ghiCua([{ khoa: "loai_giao_dich", gia_tri: "cho_thue", trich_dan: "cho thuê căn hộ" }], null) === "loai_giao_dich=cho_thue");
  const pn = (v, c) => kiemDeXuat([{ khoa: "so_phong_ngu", gia_tri: v, trich_dan: c }], c).bo[0]?.ly_do ?? null;
  ok("'20 phòng như em nói đó' → KHÔNG phải phòng ngủ", pn("20", "20 phòng như em nói đó") === "khong_noi_phong_ngu");
  ok("'3PN' / '5 phòng ngủ' vẫn là phòng ngủ", pn("3", "3PN 3WC") === null && pn("5", "5 phòng ngủ") === null);
  // 30/09/2026: tên CŨ (trước 07/2025) đổi sang phường MỚI có thật (OPEN-27: lưu tên mới) — Phước Vĩnh An gộp vào Xã Củ Chi.
  ok("'xã Phước Vĩnh An' (cũ) → 'Xã Củ Chi' (mới)", ghiCua([{ khoa: "phuong", gia_tri: "Phường Phước Vĩnh An", trich_dan: "xã Phước Vĩnh An" }], { deal: "ban" }) === "phuong=Xã Củ Chi");
  ok("'thị trấn Nhà Bè' (cũ) → 'Xã Nhà Bè' (mới)", ghiCua([{ khoa: "phuong", gia_tri: "thị trấn Nhà Bè", trich_dan: "thị trấn Nhà Bè" }], { deal: "ban" }) === "phuong=Xã Nhà Bè");
}

// FR-224 (25/09/2026): AI trả lời thẳng câu đang hỏi — code chỉ kiểm trích dẫn có thật + mọi con số có trong tin.
{
  const tl = (co, v, td, tin) => kiemTraLoiCau({ co_tra_loi: co, gia_tri: v, trich_dan: td }, tin);
  ok("TRALOI 'hxh.' → 'hẻm xe hơi' (dấu chấm cuối không làm gãy trích dẫn)", tl(true, "hẻm xe hơi", "hxh", "hxh.")?.giaTri === "hẻm xe hơi");
  ok("TRALOI trích dẫn KHÔNG DẤU khớp tin có dấu", tl(true, "hẻm xe hơi vào tới cửa", "xe hoi chay vo toi cua", "nhà trong hẻm, xe hơi chạy vô tới cửa luôn")?.giaTri === "hẻm xe hơi vào tới cửa");
  ok("TRALOI BỎ trích dẫn bịa (không có trong tin)", tl(true, "sổ hồng riêng", "sổ hồng riêng", "shr em")?.giaTri === null);
  ok("TRALOI BỎ số bịa: 'trệt 2 lầu' không được thành '3 tầng'", tl(true, "3 tầng", "trệt 2 lầu", "nhà trệt 2 lầu nha")?.giaTri === null);
  ok("TRALOI số có trong tin: '5 tỷ 2' từ '5ty2'", tl(true, "5 tỷ 2", "5ty2", "5ty2 thương lượng")?.giaTri === "5 tỷ 2");
  ok("TRALOI '3m5' ↔ '3,5m' cùng số", tl(true, "hẻm 3,5m", "hem 3m5", "hem 3m5 nha")?.giaTri === "hẻm 3,5m");
  ok("TRALOI trích dẫn chỉ là MẢNH của một từ ('co' trong 'cong') → bỏ", tl(true, "có", "co", "nha cong ty")?.giaTri === null);
  ok("TRALOI BỎ số lấy từ ý khác: hỏi hẻm, 'hxh, 5x12' → 'hẻm xe hơi 5 mét' (5 không nằm trong cụm trích 'hxh')", tl(true, "hẻm xe hơi 5 mét", "hxh", "hxh, 5x12, trệt 3 lầu")?.giaTri === null);
  ok("TRALOI AI nói KHÔNG trả lời → { co: false }", JSON.stringify(tl(false, null, null, "hàng xóm xây năm 2019")) === JSON.stringify({ co: false, giaTri: null }));
  ok("TRALOI AI không nói gì (bản cũ / thiếu ô) → null", kiemTraLoiCau(null, "x") === null && kiemTraLoiCau(undefined, "x") === null);
}

// FR-226 b (25/09/2026): AI gộp / sửa ô đang ghi — mọi chữ + số của giá trị mới phải có trong giá trị cũ hoặc trong tin.
{
  const dg = { vi_tri: "Ngô Y Linh", ket_cau: "trệt + 3 lầu", do_rong_hem: "hẻm xe hơi" };
  const gop = (k, v, tin) => kiemCapNhat([{ khoa: k, gia_tri_moi: v, cach: "gop" }], tin, dg).map((x) => x.answer).join("|");
  ok("GOP 'số 45 nha' + 'Ngô Y Linh' → '45 Ngô Y Linh'", gop("vi_tri", "45 Ngô Y Linh", "số 45 nha") === "45 Ngô Y Linh");
  ok("GOP BỎ số bịa '45/12' (12 không có trong tin)", gop("vi_tri", "45/12 Ngô Y Linh", "số 45 nha") === "");
  ok("GOP 'có sân thượng nữa em' → 'trệt + 3 lầu + sân thượng'", gop("ket_cau", "trệt + 3 lầu + sân thượng", "có sân thượng nữa em") === "trệt + 3 lầu + sân thượng");
  ok("GOP BỎ chữ bịa 'thang máy'", gop("ket_cau", "trệt + 3 lầu + sân thượng + thang máy", "có sân thượng nữa em") === "");
  ok("GOP 'hẻm 6m nha' + 'hẻm xe hơi' → 'hẻm xe hơi 6m' (6m ↔ 6 m)", gop("do_rong_hem", "hẻm xe hơi 6 m", "hẻm 6m nha") === "hẻm xe hơi 6 m");
  ok("GOP BỎ khi giá trị mới y hệt giá trị cũ", gop("vi_tri", "Ngô Y Linh", "ok em") === "");
  ok("GOP BỎ khi ô chưa có giá trị đang ghi (không có gì để gộp)", gop("phap_ly", "sổ hồng riêng", "shr") === "");
  ok("GOP sửa: 'à nhầm, 2 lầu thôi' → 'trệt + 2 lầu'", gop("ket_cau", "trệt + 2 lầu", "à nhầm, 2 lầu thôi") === "trệt + 2 lầu");
  ok("laTrongCapNhat: kiến thức 'số 45' nằm trong '45 Ngô Y Linh' → trùng; 'gần chợ' → không", laTrongCapNhat("số 45", [{ answer: "45 Ngô Y Linh" }]) && !laTrongCapNhat("gần chợ", [{ answer: "45 Ngô Y Linh" }]));
  ok("coNoiDungTraLoi: 'hxh', 'có sân thượng nữa em' → có; 'ok em', 'dạ', 'cảm ơn anh' → không",
    coNoiDungTraLoi("hxh") && coNoiDungTraLoi("có sân thượng nữa em") && !coNoiDungTraLoi("ok em") && !coNoiDungTraLoi("dạ") && !coNoiDungTraLoi("cảm ơn anh"));
}

// ── 27/09/2026 (chủ dự án test Zalo): hỏi hẻm, "Hxm nhé" → AI "hẻm xe hơi" lọt vì lớp kiểm chỉ soát chữ số ──
{
  ok("HXM-01 câu trả lời AI 'hẻm xe hơi' cho 'Hxm nhé' → bỏ (luật đọc lại)", kiemTraLoiCau({ co_tra_loi: true, gia_tri: "hẻm xe hơi", trich_dan: "Hxm" }, "Hxm nhé").giaTri === null);
  ok("HXM-02 AI 'hẻm xe máy' cho 'Hxm nhé' → nhận", kiemTraLoiCau({ co_tra_loi: true, gia_tri: "hẻm xe máy", trich_dan: "Hxm" }, "Hxm nhé").giaTri === "hẻm xe máy");
  ok("HXM-03 AI 'hẻm xe hơi' cho 'hxh' → nhận", kiemTraLoiCau({ co_tra_loi: true, gia_tri: "hẻm xe hơi", trich_dan: "hxh" }, "hxh").giaTri === "hẻm xe hơi");
  const r = kiemDeXuat([{ khoa: "do_rong_hem", gia_tri: "hẻm xe hơi", trich_dan: "hxm" }], "nhà hxm 3m nha em");
  ok("MATTIEN-01 'mặt tiền đường 5m e' → AI '5 mét' (mất mặt tiền) → bỏ (luật giữ chữ mặt tiền)", kiemTraLoiCau({ co_tra_loi: true, gia_tri: "5 mét", trich_dan: "mặt tiền đường 5m" }, "mặt tiền đường 5m e").giaTri === null);
  ok("MATTIEN-02 AI giữ 'mặt tiền đường 5m' → nhận", kiemTraLoiCau({ co_tra_loi: true, gia_tri: "mặt tiền đường 5m", trich_dan: "mặt tiền đường 5m" }, "mặt tiền đường 5m e").giaTri === "mặt tiền đường 5m");
  ok("MATTIEN-03 'cách mặt tiền 30m' không phải nhà mặt tiền → AI '5 mét' vẫn nhận", kiemTraLoiCau({ co_tra_loi: true, gia_tri: "5 mét", trich_dan: "5m" }, "đường 5m, cách mặt tiền 30m").giaTri === "5 mét");
  ok("HXM-04 đề xuất trường độ rộng hẻm 'hẻm xe hơi' trích 'hxm' → bỏ", !r.dat.length && r.bo[0]?.ly_do === "loai_duong_nguoc_chu_khach", JSON.stringify(r));
}

// ── 30/09/2026 (bắn thật lx-ban-a): "hẻm 45 Nguyễn Trãi" → AI độ rộng hẻm 45m, bản nháp "Đường vào: 45m" ──
{
  bo("HEMSO-01 'hẻm 45 Nguyễn Trãi' → độ rộng hẻm 45m", "hẻm 45 Nguyễn Trãi phường 2 quận 5", "do_rong_hem", "45m", "hẻm 45", "so_hem_khong_phai_do_rong");
  bo("HEMSO-02 'hem 45 nguyen trai' không dấu", "hem 45 nguyen trai p2 q5", "do_rong_hem", "45", "hem 45", "so_hem_khong_phai_do_rong");
  bo("HEMSO-03 'hẻm 12/3 Trần Phú' → 12m", "nhà hẻm 12/3 Trần Phú", "do_rong_hem", "12m", "hẻm 12/3", "so_hem_khong_phai_do_rong");
  bo("HEMSO-04 'hẻm 5 Nguyễn Trãi' (số nhỏ + tên đường viết hoa)", "hẻm 5 Nguyễn Trãi quận 5", "do_rong_hem", "5m", "hẻm 5", "so_hem_khong_phai_do_rong");
  dat("HEMSO-05 'hẻm 6m 12 Trần Hưng Đạo' → 6m vẫn đạt", "hẻm 6m 12 Trần Hưng Đạo", "do_rong_hem", "6m", "hẻm 6m");
  dat("HEMSO-06 'hẻm 4 xe hơi' → 4m vẫn đạt", "nhà hẻm 4 xe hơi vào tận nơi", "do_rong_hem", "4m", "hẻm 4");
  dat("HEMSO-07 'hẻm 10m Lê Lợi' → 10m vẫn đạt", "hẻm 10m Lê Lợi", "do_rong_hem", "10m", "hẻm 10m");
  ok("HEMSO-08 laSoHemKhongPhaiDoRong('hẻm 3.5 mét', '3.5') = false", laSoHemKhongPhaiDoRong("hẻm 3.5 mét", "3.5") === false);
  ok("HEMSO-09 chonViTri: luật 'hẻm 45 Nguyễn Trãi quận 5' + AI 'Nguyễn Trãi' → 'hẻm 45 Nguyễn Trãi' (giữ chữ hẻm)",
    chonViTri("hẻm 45 Nguyễn Trãi quận 5", "Nguyễn Trãi") === "hẻm 45 Nguyễn Trãi", chonViTri("hẻm 45 Nguyễn Trãi quận 5", "Nguyễn Trãi"));
  ok("HEMSO-10 chonViTri: 'hẻm 4 Trần Phú' (mập mờ số hẻm / bề rộng) → tin AI 'Trần Phú'",
    chonViTri("hẻm 4 Trần Phú", "Trần Phú") === "Trần Phú", chonViTri("hẻm 4 Trần Phú", "Trần Phú"));
}

// 30/09/2026 (bắn thử vector, nhà phố Trần Bình Trọng): "1 phòng ngủ ngay tầng trệt" là phòng ngủ theo TẦNG, không phải tổng số.
{
  const T = "nhà có 1 phòng ngủ ngay tầng trệt cho người già, sau nhà có sân phơi rộng, đi bộ ra chợ 5 phút";
  bo("phòng ngủ theo tầng: '1 phòng ngủ ngay tầng trệt' không phải tổng số", T, "so_phong_ngu", "1", "1 phòng ngủ", "phong_ngu_theo_tang");
  bo("phòng ngủ theo tầng: '2pn trên lầu'", "nhà 1 trệt 2 lầu, 2pn trên lầu", "so_phong_ngu", "2", "2pn trên lầu", "phong_ngu_theo_tang");
  dat("tổng 3pn kèm '1 phòng ngủ dưới trệt' → 3 vẫn đạt", "nhà 3pn, 1 phòng ngủ dưới trệt, 2 wc", "so_phong_ngu", "3", "3pn");
  dat("'4 phòng ngủ' trơn vẫn đạt", "nhà 4 phòng ngủ 3 wc", "so_phong_ngu", "4", "4 phòng ngủ");
  dat("căn hộ '2pn tầng 12' — tầng của căn, 2 vẫn là tổng số (do-boc R02)", "76m2 2pn tầng 12", "so_phong_ngu", "2", "2pn");
  bo("'1pn trệt' không chữ chỉ chỗ vẫn là theo tầng", "nhà 3 lầu, 1pn trệt cho ông bà", "so_phong_ngu", "1", "1pn trệt", "phong_ngu_theo_tang");
  const kt = kiemKienThuc(["phòng ngủ ngay tầng trệt cho người già", "đi bộ ra chợ 5 phút"], T, []);
  ok("kiến thức: bản model cắt ngắn của cùng vế không lặp", kt.length === 2, JSON.stringify(kt));
  ok("kiến thức: giữ vế 'phòng ngủ ngay tầng trệt' dù model không xếp vào", kt.includes("nhà có 1 phòng ngủ ngay tầng trệt cho người già") && kt.includes("đi bộ ra chợ 5 phút"), JSON.stringify(kt));
}

// Chế độ `ai` (01/10/2026): AI quyết nghĩa (đồng nghĩa, gõ sai), máy chỉ chặn bịa — trích dẫn, số, danh sách, địa danh thật.
{
  datKiemNhe(true);
  dat("[ai] 'xhr' (gõ sai shr) → pháp lý 'sổ hồng riêng'", "nhà hẻm 4m, xhr, giá 8 tỷ", "phap_ly", "sổ hồng riêng", "xhr");
  dat("[ai] 'nhà ống' → nha_pho", "bán căn nhà ống 3 tầng hẻm 5m", "loai_bds", "nha_pho", "nhà ống");
  dat("[ai] 'đông tứ trạch' → hướng chữ", "nhà hướng đông tứ trạch nha", "huong", "Đông", "đông tứ trạch");
  dat("[ai] 'ko cần bán vội' → gap khong", "ko cần bán vội đâu em", "gap", "khong", "ko cần bán vội");
  dat("[ai] 'bớt chút đỉnh' → thương lượng có", "8 tỷ bớt chút đỉnh", "thuong_luong", "co", "bớt chút đỉnh");
  bo("[ai] trích dẫn không có trong tin", "nhà hẻm 4m giá 8 tỷ", "phap_ly", "sổ hồng riêng", "sổ hồng riêng", "trich_dan_khong_co_trong_tin");
  bo("[ai] số bịa trong chữ", "nhà có ban công", "ket_cau", "trệt 3 lầu", "ban công", "so_khong_co_trong_trich_dan");
  bo("[ai] tiền không khớp trích", "giá 8 tỷ", "gia", "9 tỷ", "8 tỷ", "tien_khong_khop_trich_dan");
  dat("[ai] 'cọc 3 tháng' (mặt bằng cho thuê) → đạt", "cho thuê mặt bằng 60tr/tháng cọc 3 tháng", "tien_coc", "3 tháng", "cọc 3 tháng");
  bo("[ai] '3 tỏi 9 TL' trích cắt '3 tỏi' → tiền cắt thiếu", "Nhà ống 3 tấm, sổ chug, 3 tỏi 9 TL", "gia", "3 tỷ", "3 tỏi", "tien_cat_thieu");
  dat("[ai] '3 tỏi 9' trích đủ → đạt", "Nhà ống 3 tấm, sổ chug, 3 tỏi 9 TL", "gia", "3 tỷ 9", "3 tỏi 9");
  dat("[ai] '8 tỷ 4 phòng ngủ' — số sau là phòng, không cắt", "giá 8 tỷ 4 phòng ngủ", "gia", "8 tỷ", "8 tỷ");
  dat("[ai] '5 tỷ, 60m2' — dấu phẩy ngăn, không cắt", "5 tỷ, 60m2", "gia", "5 tỷ", "5 tỷ");
  bo("[ai] số đo không có trong trích", "hẻm xe hơi", "do_rong_hem", "6", "hẻm xe hơi", "so_khong_co_trong_trich_dan");
  bo("[ai] loại ngoài danh sách", "nhà ống", "loai_bds", "nha_ong", "nhà ống", "gia_tri_ngoai_danh_sach");
  bo("[ai] pháp lý = 'hẻm xe hơi' (sai ô) → bỏ", "nhà hẻm 4m, xhr, giá 8 tỉ", "phap_ly", "hẻm xe hơi", "xhr", "gia_tri_khong_dung_loai_truong");
  { const k = mot("3 lầu 4 phòng ngủ", "so_tang", "3", "3 lầu");
    ok("[ai] so_tang 3 «3 lầu» → sửa thành 4 (tính cả trệt)", k.dat.length === 1 && k.dat[0].gia_tri === "4", JSON.stringify(k)); }
  bo("[ai] 'nhà 4 tầng' → nha_cap4 bị loại (không có chữ cấp 4; bắn thử lx-tam-12)", "Cần bán nhà 4 tầng hẻm xe hơi quận Gò Vấp", "loai_bds", "nha_cap4", "nhà 4 tầng", "trich_dan_khong_noi_loai_nay");
  dat("[ai] 'nha cap 4' → nha_cap4 đạt", "ban nha cap 4 duong Xo Viet Nghe Tinh", "loai_bds", "nha_cap4", "nha cap 4");
  ok("[ai] xác nhận 'sổ hồng riêng' khi khách gõ đúng nguyên chữ → không hỏi lại (lx-tam-22)",
    kiemXacNhan([{ khoa: "phap_ly", gia_tri: "sổ hồng riêng", trich_dan: "sổ hồng riêng" }], "sổ hồng riêng") === null, "");
  ok("[ai] xác nhận 'xhr' → vẫn hỏi lại", kiemXacNhan([{ khoa: "phap_ly", gia_tri: "sổ hồng riêng", trich_dan: "xhr" }], "nhà hẻm 4m, xhr")?.gia_tri === "sổ hồng riêng", "");
  ok("[ai] kết cấu 'trệt + 3 lầu (không có lửng)' → bỏ cụm phủ định (lx-tam-31: DB từng đọc ra có lửng)",
    boPhuDinhKetCau("trệt + 3 lầu (không có lửng)") === "trệt + 3 lầu" && boPhuDinhKetCau("trệt + lửng + 2 lầu") === "trệt + lửng + 2 lầu", "");
  ok("chonViTri: '12 hẻm 4m Trần Bình Trọng' + AI 'Trần Bình Trọng' → giữ số nhà (lx-tam-32)",
    chonViTri("12 hẻm 4m Trần Bình Trọng", "Trần Bình Trọng") === "12 hẻm 4m Trần Bình Trọng", String(chonViTri("12 hẻm 4m Trần Bình Trọng", "Trần Bình Trọng")));
  ok("chonViTri: 'hem 4m Pham The Hien' (không số nhà) + AI có dấu → AI", chonViTri("hem 4m Pham The Hien", "Phạm Thế Hiển") === "Phạm Thế Hiển", "");
  bo("[ai] 'ko có phường' vẫn không phải phường", "ko có phường", "phuong", "ko có phường", "ko có phường", "phuong_khong_co_that");
  datKiemNhe(false);
}

// 01/10/2026: khách HỎI LẠI — AI nói, code kiểm câu hỏi có trong tin.
{
  const h = (co_hoi, cau_hoi, chu_de) => ({ co_hoi, cau_hoi, chu_de });
  ok("HL-01 AI không nói (null) → undefined (rơi về luật cũ)", docHoiLai(null, "abc", false) === undefined);
  ok("HL-02 AI nói không hỏi → null", docHoiLai(h(false, null, null), "sổ hồng riêng", true) === null);
  const r3 = docHoiLai(h(true, "bao lâu thì bán được em", "dich_vu"), "bao lâu thì bán được em", false);
  ok("HL-03 cả tin là câu hỏi → caTin, chủ đề dich_vu", r3?.caTin === true && r3.chuDe === "dich_vu" && r3.cau === "bao lâu thì bán được em", JSON.stringify(r3));
  const r4 = docHoiLai(h(true, "phí bên em sao", "dich_vu"), "sổ hồng riêng, phí bên em sao", true);
  ok("HL-04 vừa trả lời vừa hỏi → chỉ câu hỏi, không caTin", r4?.caTin === false && r4.cau === "phí bên em sao", JSON.stringify(r4));
  const r5 = docHoiLai(h(true, "giá thị trường khu vực", "thi_truong"), "giá khu này giờ sao em", false);
  ok("HL-05 trích không có trong tin (AI chép câu khác) → undefined, rơi về lưới từ khoá", r5 === undefined, JSON.stringify(r5));
  const r6 = docHoiLai(h(true, "nhà mình phường mấy anh/chị nhỉ?", "tin_cua_minh"), "ben minh co bat doc quyen ko", false);
  ok("HL-06 AI chép câu BOT vừa hỏi làm câu hỏi của khách → undefined", r6 === undefined, JSON.stringify(r6));
  const r7 = docHoiLai(h(true, "khu nay de ban hong em", "thi_truong"), "khu này dễ bán hông em", false);
  ok("HL-07 trích khác dấu vẫn là câu trong tin → nhận", r7?.chuDe === "thi_truong", JSON.stringify(r7));
}

// 01/10/2026 (lx-tt-08): viết tắt AI để "cần xác nhận" mà từ điển tiền định cũng đọc ra CÙNG ô → chắc, ghi thẳng (SRS-5.1s).
{
  const xn = (trich, khoa = "phap_ly", gia = "sổ hồng riêng") => [{ khoa, gia_tri: gia, trich_dan: trich }];
  const a = nangXacNhanChac(xn("shr"), "shr", nhanDienNhieuFact);
  ok("XNC-01 'shr' → AI + từ điển cùng nói pháp lý → chac", a.chac.length === 1 && a.chac[0].gia_tri === "sổ hồng riêng" && !a.conLai.length, JSON.stringify(a));
  const b = nangXacNhanChac(xn("xhr"), "xhr", nhanDienNhieuFact);
  ok("XNC-02 'xhr' (từ điển không đọc) → vẫn hỏi lại", !b.chac.length && b.conLai.length === 1, JSON.stringify(b));
  const c = nangXacNhanChac(xn("SHR"), "nhà hẻm 4m, SHR nha", nhanDienNhieuFact);
  ok("XNC-03 'SHR' viết hoa giữa câu (cách nói mới) → chac", c.chac.length === 1, JSON.stringify(c));
  const d = nangXacNhanChac(xn("shr"), "anh bán nhà nha", nhanDienNhieuFact);
  ok("XNC-04 trích không có trong tin → không chac, không bịa", !d.chac.length, JSON.stringify(d));
  const e = nangXacNhanChac(xn("hxh", "phap_ly"), "hxh", nhanDienNhieuFact);
  ok("XNC-05 AI gán sai ô ('hxh' → pháp lý), từ điển đọc ô khác → không chac", !e.chac.length, JSON.stringify(e));
}

// 01/10/2026 SRS-5.1t: ngữ cảnh (câu chọn A/B), cảm xúc, câu không áp dụng, nhận xét không căn cứ.
{
  const chon = "Dạ sổ riêng thì dễ bán lắm. Mình cần ra hàng gấp hay được giá thì thôi ạ?";
  ok("NC-01 câu chọn 'gấp hay được giá thì thôi?' là câu chọn hai", laCauChonHai(chon));
  ok("NC-02 'có gấp không ạ?' / 'bán gấp hay không?' KHÔNG phải câu chọn", !laCauChonHai("Mình có cần bán gấp không ạ?") && !laCauChonHai("bán gấp hay không anh?"));
  ok("NC-03 'dạ đúng rồi em', 'ok' là gật trơn; 'ừ gấp' thì không", laChiGat("dạ đúng rồi em") && laChiGat("ok") && !laChiGat("ừ gấp"));
  ok("NC-04 'ừ' cho câu chọn → AI đoán vế nào cũng bỏ",
    kiemTraLoiCau({ co_tra_loi: true, gia_tri: "được giá thì thôi", trich_dan: "ừ" }, "ừ", chon)?.co === false);
  ok("NC-05 'ừ gấp lắm' cho câu chọn → giữ (có nội dung)",
    kiemTraLoiCau({ co_tra_loi: true, gia_tri: "cần bán gấp", trich_dan: "gấp lắm" }, "ừ gấp lắm", chon)?.giaTri === "cần bán gấp");
  ok("CXK-01 bực, trích có trong tin → nhận", docCamXuc({ muc: "buc", trich_dan: "hỏi hoài" }, "em hỏi hoài vậy")?.muc === "buc");
  ok("CXK-02 trích không có trong tin → không báo", docCamXuc({ muc: "nghi_ngo", trich_dan: "lừa đảo" }, "anh bán nhà") === null);
  ok("CXK-03 bình thường → null", docCamXuc({ muc: "binh_thuong", trich_dan: null }, "ok em") === null);
  const kh = docKhongCanHoi([
    { khoa: "do_rong_hem", ly_do: "trong KCN", trich_dan: "trong khu công nghiệp" },
    { khoa: "gia", ly_do: "x", trich_dan: "kho" },
    { khoa: "so_wc", ly_do: "x", trich_dan: "không có chữ này" },
    { khoa: "tram_bien_ap", ly_do: "không có trong danh sách", trich_dan: "kho" },
  ], "cho thuê kho trong khu công nghiệp Tân Tạo", ["do_rong_hem", "gia", "so_wc"]);
  ok("KHK-01 chỉ nhận câu có trong danh sách, không phải câu lõi, trích có thật", kh.length === 1 && kh[0].khoa === "do_rong_hem", JSON.stringify(kh));
  const loi = "Nhà phố hẻm sâu yên tĩnh, kết cấu 4x15 ạ. Nhà mình ở phường nào anh chị?";
  const bo = nhanXetKhongCanCu([{ cau: "Nhà phố hẻm sâu yên tĩnh, kết cấu 4x15 ạ.", can_cu: "hẻm sâu" }, { cau: "Nhà mình ở phường nào anh chị?", can_cu: null }], "ban nha 4x15 tret 2 lau hxh");
  ok("NX-01 căn cứ AI đưa không có trong lời chủ nhà → bỏ; câu hỏi không bao giờ bỏ", bo.length === 1 && boCauNhanXet(loi, bo) === "Nhà mình ở phường nào anh chị?", JSON.stringify([bo, boCauNhanXet(loi, bo)]));
  ok("NX-02 căn cứ có thật ('hxh') → giữ", nhanXetKhongCanCu([{ cau: "Nhà hẻm xe hơi ạ.", can_cu: "hxh" }], "ban nha hxh q10").length === 0);
  // SRS-5.1zzy (chat thử 07/10): đánh giá KHU / THỊ TRƯỜNG luôn bỏ, kể cả khi AI trích tên khu có thật làm căn cứ.
  const loiDv = "Khu Hà Huy Giáp đất vàng quận 12 anh. Diện tích bao nhiêu mét vuông ạ?";
  const boDv = nhanXetKhongCanCu([{ cau: "Khu Hà Huy Giáp đất vàng quận 12 anh.", can_cu: "khu hà huy giáp", danh_gia_thi_truong: true }], "khu hà huy giáp quận 12 em ạ, chỗ đường thạnh lộc 41");
  ok("NX-08 'đất vàng' (đánh giá thị trường) có căn cứ tên khu → vẫn bỏ, câu hỏi giữ", boDv.length === 1 && boCauNhanXet(loiDv, boDv) === "Diện tích bao nhiêu mét vuông ạ?", JSON.stringify([boDv, boCauNhanXet(loiDv, boDv)]));
  ok("NX-09 cách nói mới 'Bình Thạnh giá đang lên lắm' → bỏ", nhanXetKhongCanCu([{ cau: "Bình Thạnh giá đang lên lắm anh.", can_cu: "bình thạnh", danh_gia_thi_truong: true }], "nha o binh thanh").length === 1);
  ok("NX-10 khen gắn đặc điểm (không phải thị trường) có căn cứ → giữ", nhanXetKhongCanCu([{ cau: "Hẻm xe hơi tới cửa là khách chuộng lắm.", can_cu: "hxh", danh_gia_thi_truong: false }], "ban nha hxh q10").length === 0);
  ok("NX-03 bỏ hết chữ → null (dùng câu mẫu)", boCauNhanXet("Hẻm sâu yên tĩnh lắm ạ.", ["Hẻm sâu yên tĩnh lắm ạ."]) === null);
  // SRS-5.1zh (bắn thử 02/10): AI trích nhận xét KHÔNG kèm mặt cười → bỏ cả câu khẳng định, không trơ ")".
  const nx4 = boCauNhanXet("Hẻm 5m Lê Văn Sỹ thì khách tìm nhiều lắm, dễ ra hàng :) Em tra thấy đường Lê Văn Sỹ thuộc Phường Nhiêu Lộc, đúng không anh chị?", ["khách tìm nhiều lắm, dễ ra hàng"]);
  ok("NX-04 vế khen trước ':)' bị bỏ → không còn ')' trơ", nx4 === "Em tra thấy đường Lê Văn Sỹ thuộc Phường Nhiêu Lộc, đúng không anh chị?", JSON.stringify(nx4));
  const nx5 = boCauNhanXet("Theo em biết, dự án Sunrise City có hồ bơi rộng lắm :)\nCăn mình ở tầng mấy vậy ạ?", ["dự án Sunrise City có hồ bơi rộng lắm"]);
  ok("NX-05 'Theo em biết, <nhận xét> :)' → bỏ cả dòng, không còn 'Theo em biết, )'", nx5 === "Căn mình ở tầng mấy vậy ạ?", JSON.stringify(nx5));
  const nx6 = boCauNhanXet("Mặt tiền đẹp vậy dễ bán lắm ^^ mình cần bán gấp không anh?", ["Mặt tiền đẹp vậy dễ bán lắm"]);
  ok("NX-06 vế khen dính câu hỏi → cắt vế, gọt luôn '^^'", nx6 === "Mình cần bán gấp không anh?", JSON.stringify(nx6));
}

// ── Đợt 1 chuyển luật sang AI (02/10/2026, SRS-5.1v): ô trước đây chỉ luật ghi — AI nói, code kiểm ──
for (const nhe of [false, true]) {
  datKiemNhe(nhe);
  const m = nhe ? "nhẹ" : "đủ";
  const KCN = "cho thuê kho xưởng 500m2 trong KCN Tân Tạo Bình Tân giá 60 triệu/tháng, nằm trong khu công nghiệp nên không có hẻm";
  dat(`O-01 (${m}) "không có hẻm" (KCN) → loai_duong_vao khong_hem`, KCN, "loai_duong_vao", "khong_hem", "nằm trong khu công nghiệp nên không có hẻm");
  bo(`O-02 (${m}) "không có hẻm" mà AI nói hẻm xe hơi → bỏ`, KCN, "loai_duong_vao", "hem_xe_hoi", "không có hẻm", "trich_dan_noi_khong_co_hem");
  bo(`O-03 (${m}) "hxm" mà AI nói hẻm xe hơi → bỏ (ngược chữ khách)`, "nhà hxm 3m quận 8", "loai_duong_vao", "hem_xe_hoi", "hxm 3m", "loai_duong_nguoc_chu_khach");
  bo(`O-04 (${m}) khong_hem mà cụm trích không có phủ định / nội khu → bỏ`, "nhà trong hẻm Lê Văn Sỹ", "loai_duong_vao", "khong_hem", "trong hẻm Lê Văn Sỹ", "trich_dan_khong_noi_khong_hem");
  bo(`O-05 (${m}) mã ngoài danh sách → bỏ`, "nhà mặt tiền", "loai_duong_vao", "mat_pho", "nhà mặt tiền", "gia_tri_ngoai_danh_sach");
  dat(`O-06 (${m}) "chưa có thang máy" → thang_may khong`, "nhà 5 tầng chưa có thang máy", "thang_may", "khong", "chưa có thang máy");
  bo(`O-07 (${m}) thang_may giá trị lạ → bỏ`, "nhà có thang máy", "thang_may", "thang máy Mitsubishi", "có thang máy", "gia_tri_ngoai_danh_sach");
  dat(`O-08 (${m}) năm xây 2015 có trong cụm`, "nhà xây năm 2015 kiên cố", "nam_xay", "2015", "xây năm 2015");
  bo(`O-09 (${m}) năm xây không có trong cụm → bỏ`, "nhà xây năm 2015 kiên cố", "nam_xay", "2018", "xây năm 2015", "so_khong_co_trong_trich_dan");
}
datKiemNhe(true);
{
  const ghi = docAiChinh(kiemDeXuat([
    { khoa: "loai_duong_vao", gia_tri: "khong_hem", trich_dan: "không có hẻm" },
    { khoa: "duong_container", gia_tri: "xe container vào tận nơi em", trich_dan: "xe container vào tận nơi em" },
    { khoa: "thang_may", gia_tri: "khong", trich_dan: "không có thang máy" },
    { khoa: "thuong_luong", gia_tri: "co", trich_dan: "bớt lộc" },
  ], "kho trong KCN không có hẻm, xe container vào tận nơi em, không có thang máy, bớt lộc").dat, { deal: "cho_thue" }).ghi;
  const q = (k) => ghi.find((g) => g.question === k)?.answer;
  ok("O-10 ghi chữ chuẩn: loai_duong_vao 'không có hẻm', thang_may 'không', thương lượng 'có thương lượng' (trigger DB đọc ra cột)",
    q("loai_duong_vao") === "không có hẻm" && q("thang_may") === "không" && q("thuong_luong") === "có thương lượng", JSON.stringify(ghi));
  ok("O-15 ô dạng câu có / không mà AI trả 'co' → 'có'", docAiChinh(kiemDeXuat([{ khoa: "duong_container", gia_tri: "co", trich_dan: "xe container vào tận nơi" }], "xe container vào tận nơi em").dat, { deal: "cho_thue" }).ghi.find((g) => g.question === "duong_container")?.answer === "có");
  ok("O-11 ô chữ bỏ tiểu từ cuối: 'xe container vào tận nơi em' → 'xe container vào tận nơi'", q("duong_container") === "xe container vào tận nơi", JSON.stringify(ghi));
  ok("O-12 khoá luật cũ nay là khoá AI biết (luật không ghi khi AI chạy): duong_container, the_chap, loai_duong_vao",
    ["duong_container", "the_chap", "loai_duong_vao", "thang_may"].every((k) => KHOA_FACT_AI_BIET.has(k)));
  // SRS-5.1zzzo (08/10/2026): đứng tên nay LÀ khoá AI (không có khoá thì AI hiểu đúng mà không ghi được — "anh dung ten" vào ô
  // bằng chữ không dấu); "giữ chữ khách" do bảng ô NGUYÊN VĂN lo (`laONguyenVan`), không phải do cấm AI.
  ok("O-13 câu đứng tên là khoá AI VÀ là ô nguyên văn (giữ chữ khách)", KHOA_FACT_AI_BIET.has("nguoi_dung_ten") && laONguyenVan("nha_pho", "nguoi_dung_ten"));
}
datKiemNhe(false);
ok("O-14 luật (model chết) cũng bỏ tiểu từ cuối: 'xe container vào tận nơi em'",
  nhanDienNhieuFact("kho xưởng 500m2, xe container vào tận nơi em").every((f) => !/\bem$/.test(f.answer)), JSON.stringify(nhanDienNhieuFact("kho xưởng 500m2, xe container vào tận nơi em")));

// ── Đợt 2 (02/10/2026, SRS-5.1w): ý định / vai do AI đọc, code kiểm trích dẫn ──
ok("YD-01 đã bán, trích có trong tin → nhận", docYDinh({ loai: "ban_roi", trich_dan: "có người lấy rồi" }, "nhà chị có người lấy rồi em")?.loai === "ban_roi");
ok("YD-02 trích KHÔNG có trong tin → bỏ", docYDinh({ loai: "ban_roi", trich_dan: "bán rồi" }, "hàng xóm vừa dọn đi") === null);
ok("YD-03 bình thường / loại lạ → null", docYDinh({ loai: "binh_thuong", trich_dan: null }, "x") === null && docYDinh({ loai: "xoa", trich_dan: "x" }, "x") === null);
ok("VAI-01 tự xưng môi giới, trích có trong tin → nhận", docVai({ la: "moi_gioi", trich_dan: "em làm bên sàn" }, "à em làm bên sàn nha anh")?.la === "moi_gioi");
// SRS-5.1zzzzk (bắn production 09/10 + sổ AI thật …kb2chau): trích có thật nhưng KHÔNG gọi tên vai («bán lô đất», «chú có», «chú có căn
// nhà», «sổ hồng chính chủ») → không nhận; trích gọi tên vai → nhận.
for (const [la, td, tin, mong] of [
  ["chinh_chu", "bán lô đất", "bán lô đất 10x50 củ chi xã tân an hội, giấy tay", null],
  ["chinh_chu", "chú có", "chú có căn nhà muốn bán", null],
  ["chinh_chu", "chú có căn nhà", "chú có căn nhà muốn bán", null],
  ["chinh_chu", "sổ hồng chính chủ", "bán nhà MTKD Võ Văn Tần, sổ hồng chính chủ", null],
  ["chinh_chu", "chú", "thôi để mai chú nói tiếp", null],
  ["chinh_chu", "anh là chủ đất", "anh là chủ đất, cần bán lô đất củ chi", "chinh_chu"],
  ["chinh_chu", "nhà của tôi", "nhà của tôi ở hẻm 5", "chinh_chu"],
  ["chinh_chu", "không phải môi giới", "anh không phải môi giới đâu em", "chinh_chu"],
  ["moi_gioi", "em làm bên sàn", "à em làm bên sàn nha anh", "moi_gioi"],
  // SRS-5.1zzzzzn (test Zalo 13/10/2026): bài rao mở bằng "Nhà chính chủ cần bán!" là tự nói vai; "giấy tờ chính chủ" vẫn không.
  ["chinh_chu", "Nhà chính chủ cần bán", "Nhà chính chủ cần bán! Khu dân cư, Gần chợ Gấu - Đông Thạnh, Hóc Môn. 6x22", "chinh_chu"],
  ["chinh_chu", "chính chủ gửi bán", "chính chủ gửi bán căn góc 2 mặt hẻm Phan Xích Long", "chinh_chu"],
  ["chinh_chu", "giấy tờ chính chủ", "bán nhà hẻm 4m, giấy tờ chính chủ đầy đủ", null],
]) ok(`VAI-ZZZZK «${td}» (${la}) → ${mong ?? "không nhận"}`, (docVai({ la, trich_dan: td }, tin)?.la ?? null) === mong, JSON.stringify(docVai({ la, trich_dan: td }, tin)));
// SRS-5.1zzzzzo (test Zalo 13/10): xã mới mang tên huyện cũ — "nhà cô ở Hóc Môn" là HUYỆN, không ghi phường Xã Hóc Môn.
for (const [gt, td, tin, mong] of [
  ["Xã Hóc Môn", "nhà cô ở Hóc Môn", "nhà cô ở Hóc Môn", false],
  ["Xã Bình Chánh", "ở Bình Chánh em", "đất ở Bình Chánh em", false],
  ["Phường Gò Vấp", "nhà quận Gò Vấp", "bán nhà quận Gò Vấp", false],
  ["Phường Gò Vấp", "phường Gò Vấp", "nhà ở phường Gò Vấp", true],
  ["Xã Hóc Môn", "xã Hóc Môn", "nhà ở xã Hóc Môn", true],
  ["Xã Đông Thạnh", "Đông Thạnh, Hóc Môn", "gần chợ Gấu Đông Thạnh, Hóc Môn", true],
]) ok(`PHUONG-HUYEN «${td}» → ${mong ? "nhận" : "bỏ"} ${gt}`, kiemDeXuat([{ khoa: "phuong", gia_tri: gt, trich_dan: td }], tin).dat.length === (mong ? 1 : 0), JSON.stringify(kiemDeXuat([{ khoa: "phuong", gia_tri: gt, trich_dan: td }], tin)));
ok("VAI-02 khong_noi → null; trích bịa → null", docVai({ la: "khong_noi", trich_dan: null }, "x") === null && docVai({ la: "chinh_chu", trich_dan: "nhà của tôi" }, "mấy bên môi giới gọi suốt") === null);

ok("CK-01 câu kế AI chọn có trong danh sách → nhận; ngoài danh sách / null → null",
  docCauKe({ khoa: "phap_ly" }, ["phap_ly", "huong"]) === "phap_ly" && docCauKe({ khoa: "ten_lua" }, ["phap_ly"]) === null && docCauKe(null, ["phap_ly"]) === null);

// HS-01…06 (02/10/2026, SRS-5.1y — đường JSON cũ nhánh mua): giá trị hồ sơ phải là chữ khách nói. Bắn thật thu-trl-04/06:
// "nhà có 2 con nhỏ" → "vợ chồng + 2 con nhỏ" và 2 phòng ngủ. Viết tắt / chữ đệm vẫn nhận ("q5" → "Quận 5", "6 tỏi" → "tầm 6 tỷ").
{
  const loi = "minh tim nha hem xe hoi quan 5 tam 7 ty, nha co 2 con nho";
  const r = locGiaTriHoSo({ nguoi_o_cung: "vợ chồng + 2 con nhỏ", bedrooms: 2, alley: "hẻm xe hơi", notes: "có 2 con nhỏ" }, loi);
  ok("HS-01 'vợ chồng' khách không nói → bỏ người ở cùng", r.profile.nguoi_o_cung === null && r.bo.includes("nguoi_o_cung"), JSON.stringify(r));
  ok("HS-02 '2 con nhỏ' không phải 2 phòng ngủ → bỏ", r.profile.bedrooms === null && r.bo.includes("bedrooms"), JSON.stringify(r));
  ok("HS-03 'hẻm xe hơi' / 'có 2 con nhỏ' (có dấu từ chữ không dấu) → giữ", r.profile.alley === "hẻm xe hơi" && r.profile.notes === "có 2 con nhỏ", JSON.stringify(r));
  const r2 = locGiaTriHoSo({ area: "Quận 5", budget: "tầm 6 tỷ", property_type: "căn hộ", bedrooms: 3, alley: "hẻm xe hơi" }, "can mua chung cu q5 3pn hxh 6 toi");
  ok("HS-04 cách nói mới: 'chung cu q5 3pn hxh 6 toi' → Quận 5, tầm 6 tỷ, căn hộ, 3 phòng ngủ, hẻm xe hơi đều giữ",
    r2.bo.length === 0 && r2.profile.bedrooms === 3, JSON.stringify(r2));
  ok("HS-05 số sai khu ('q5' → 'Quận 7') → bỏ", locGiaTriHoSo({ area: "Quận 7" }, "nha q5").profile.area === null);
  ok("HS-06 'mẹ già ở cùng' từ 'nhà có mẹ già' → giữ (ở cùng là chữ đệm)", giaTriCoTrongLoi("mẹ già ở cùng", "nhà có mẹ già"));
}

// 02/10/2026 (bắn lại thu-tay-01, SRS-5.1ze): "Nhà a 4 tầng tính cả lửng" → AI so_tang 3 bị bỏ (3 không có trong cụm), không ghi gì.
{
  datKiemNhe(true);
  const tinL = "Nhà a 4 tầng tính cả lửng";
  const r1 = kiemDeXuat([{ khoa: "so_tang", gia_tri: "3", trich_dan: "4 tầng tính cả lửng", can: null }], tinL);
  ok("LUNG-K1 so_tang 3 «4 tầng tính cả lửng» → ket_cau 'trệt + lửng + 2 lầu', không bị bỏ",
    r1.dat.length === 1 && r1.dat[0].khoa === "ket_cau" && r1.dat[0].gia_tri === "trệt + lửng + 2 lầu" && !r1.bo.length, JSON.stringify(r1));
  const r2 = kiemDeXuat([{ khoa: "ket_cau", gia_tri: "5 tấm có thêm lửng", trich_dan: "5 tấm có thêm lửng", can: null }], "nhà 5 tấm có thêm lửng nha em");
  ok("LUNG-K2 «5 tấm có thêm lửng» (cách nói mới) → 'trệt + lửng + 4 lầu'", r2.dat[0]?.gia_tri === "trệt + lửng + 4 lầu", JSON.stringify(r2));
  const r3 = kiemDeXuat([{ khoa: "so_tang", gia_tri: "4", trich_dan: "4 tầng", can: null }], "nhà 4 tầng em");
  ok("LUNG-K3 «4 tầng» không nói lửng → vẫn so_tang 4 như cũ", r3.dat[0]?.khoa === "so_tang" && r3.dat[0]?.gia_tri === "4", JSON.stringify(r3));
  datKiemNhe(false);
}

// SRS-5.1zj (bắn thử địa chỉ 03/10): tên đường bằng số / mã; số hẻm có "/" sau chữ hẻm.
ok("DC-01 tenDuongDayDu '3/2' → 'đường 3/2'", tenDuongDayDu("3/2") === "đường 3/2");
ok("DC-02 tenDuongDayDu '30/4' → 'đường 30/4'", tenDuongDayDu("30/4") === "đường 30/4");
ok("DC-03 tenDuongDayDu 'D2' → 'đường D2'; 'Âu Cơ' giữ", tenDuongDayDu("D2") === "đường D2" && tenDuongDayDu("Âu Cơ") === "Âu Cơ");
ok("DC-04 tenDuongDayDu 'N12' (cách nói mới) → 'đường N12'", tenDuongDayDu("N12") === "đường N12");
ok("DC-05 chonViTri luật 'hẻm 18/5 đường Cách Mạng Tháng 8' + AI tên đường → giữ số hẻm 18/5",
  chonViTri("hẻm 18/5 đường Cách Mạng Tháng 8", "Cách Mạng Tháng 8") === "hẻm 18/5 đường Cách Mạng Tháng 8", chonViTri("hẻm 18/5 đường Cách Mạng Tháng 8", "Cách Mạng Tháng 8"));
ok("DC-06 chonViTri 'hẻm 284 đường Lê Văn Sỹ' (số > 12, cách nói mới) → giữ hẻm 284",
  chonViTri("hẻm 284 đường Lê Văn Sỹ", "Lê Văn Sỹ") === "hẻm 284 đường Lê Văn Sỹ", chonViTri("hẻm 284 đường Lê Văn Sỹ", "Lê Văn Sỹ"));
ok("DC-07 chonViTri 'hẻm 4 đường Trần Phú' (số nhỏ, mập mờ bề rộng) → để AI", chonViTri("hẻm 4 đường Trần Phú", "Trần Phú") === "Trần Phú");
{
  const dx = kiemDeXuat([{ khoa: "duong", gia_tri: "30/4", trich_dan: "đường 30/4", can: null }], "bán nhà mặt tiền đường 30/4 quận Tân Phú");
  const ac = docAiChinh(dx.dat, null);
  ok("DC-08 AI duong '30/4' → aiChinh.duong 'đường 30/4' (không bị ngưỡng độ dài gạt)", ac.duong === "đường 30/4", JSON.stringify(ac.duong));
}
// SRS-5.1zk (03/10, chủ dự án: "hẻm số người ta sẽ ghi số còn độ rộng thì sẽ ghi 4m 4 mét"): địa chỉ AI viết bỏ bề rộng,
// tên đường trần vào `ten_duong` → aiChinh.tenDuong (nơi gọi ghi cột street).
{
  const tin = "bán nhà 88 hẻm 6m Tân Kỳ Tân Quý quận Tân Phú";
  const dx = kiemDeXuat([
    { khoa: "duong", gia_tri: "88 hẻm Tân Kỳ Tân Quý", trich_dan: "88 hẻm 6m Tân Kỳ Tân Quý", can: null },
    { khoa: "ten_duong", gia_tri: "Tân Kỳ Tân Quý", trich_dan: "88 hẻm 6m Tân Kỳ Tân Quý", can: null },
  ], tin);
  ok("DC-09 duong '88 hẻm Tân Kỳ Tân Quý' (bỏ '6m' khỏi trích dẫn) qua kiểm", dx.dat.some((d) => d.khoa === "duong") && !dx.bo.some((b) => b.khoa === "duong"), JSON.stringify(dx.bo));
  const ac = docAiChinh(dx.dat, null);
  ok("DC-10 ten_duong → aiChinh.tenDuong 'Tân Kỳ Tân Quý', không vào danh sách bỏ", ac.tenDuong === "Tân Kỳ Tân Quý" && !ac.bo?.some?.((b) => b.khoa === "ten_duong"), JSON.stringify({ t: ac.tenDuong, bo: ac.bo }));
  const dx2 = kiemDeXuat([{ khoa: "duong", gia_tri: "12 hẻm Lê Văn Sỹ", trich_dan: "12 hẻm rộng 4 mét Lê Văn Sỹ", can: null }], "nhà 12 hẻm rộng 4 mét Lê Văn Sỹ q3");
  ok("DC-11 'hẻm rộng 4 mét' (cách nói mới) → duong '12 hẻm Lê Văn Sỹ' qua kiểm", dx2.dat.length === 1, JSON.stringify(dx2.bo));
  const dx3 = kiemDeXuat([{ khoa: "duong", gia_tri: "88 hẻm Tân Kỳ Tân Quý quận 5", trich_dan: "88 hẻm 6m Tân Kỳ Tân Quý", can: null }], tin);
  ok("DC-12 duong THÊM chữ không có trong trích dẫn → vẫn bị loại", dx3.dat.length === 0, JSON.stringify(dx3));
  const dx4 = kiemDeXuat([{ khoa: "duong", gia_tri: "88 hẻm 6 Tân Kỳ Tân Quý", trich_dan: "88 hẻm 6m Tân Kỳ Tân Quý", can: null }], tin);
  ok("DC-13 bề rộng '6m' biến thành số hẻm '6' → bị loại", dx4.dat.length === 0, JSON.stringify(dx4));
  const ac5 = docAiChinh(kiemDeXuat([{ khoa: "ten_duong", gia_tri: "đường 3/2", trich_dan: "hẻm 18 đường 3/2", can: null }], "nhà hẻm 18 đường 3/2 q10").dat, null);
  ok("DC-14 ten_duong 'đường 3/2' → tenDuong 'đường 3/2'", ac5.tenDuong === "đường 3/2", JSON.stringify(ac5.tenDuong));
}
// SRS-5.1zn (bắn thử thu-mc-05): khách chỉ nói bề rộng → loại hẻm theo ngưỡng chủ dự án chốt; lệch thì bỏ để DB xếp theo bề rộng.
{
  const k = (gt, tc, tin) => kiemDeXuat([{ khoa: "loai_duong_vao", gia_tri: gt, trich_dan: tc, can: null }], tin);
  ok("HR-01 'hẻm 3m' + AI hem_xe_may → bỏ (3–3,5m là 'trong hẻm')", k("hem_xe_may", "hẻm 3m", "bán nhà hẻm 3m Tân Bình").dat.length === 0);
  ok("HR-02 'hẻm 3m2' + AI hem → đạt; 'hẻm 3m5' (= 3,5m) + AI hem → bỏ", k("hem", "hẻm 3m2", "nhà hẻm 3m2 em").dat.length === 1 && k("hem", "hẻm 3m5", "nhà hẻm 3m5 em").dat.length === 0);
  ok("HR-03 'hẻm 3,5m' + AI hem_xe_hoi → đạt", k("hem_xe_hoi", "hẻm 3,5m", "nhà hẻm 3,5m").dat.length === 1);
  ok("HR-04 'hẻm 2m5' + AI hem_xe_may; 'hẻm 6m' + AI hem_xe_tai → đạt", k("hem_xe_may", "hẻm 2m5", "hẻm 2m5 nha").dat.length === 1 && k("hem_xe_tai", "hẻm 6m", "hẻm 6m").dat.length === 1);
  ok("HR-05 (cách nói mới) 'hẻm rộng 3 mét' + AI hem_xe_hoi → bỏ", k("hem_xe_hoi", "hẻm rộng 3 mét", "nhà trong hẻm rộng 3 mét").dat.length === 0);
  ok("HR-06 khách nói thẳng 'hẻm xe hơi 3m' → theo lời khách, giữ hem_xe_hoi", k("hem_xe_hoi", "hẻm xe hơi 3m", "hẻm xe hơi 3m").dat.length === 1);
}
// Bộ đo 03/10 (SRS-5.1zq…zt): bốn ca rớt production — mỗi ca một cách nói gốc + một cách nói MỚI chưa từng bắn.
{
  datKiemNhe(true);
  const q = (gt, tc, tin) => kiemDeXuat([{ khoa: "quan", gia_tri: gt, trich_dan: tc, can: null }], tin);
  ok("S01-a 'Huyện Nhơn Trạch' cho 'đất Nhơn Trạch' → đạt (vùng ngoài TP.HCM)", q("Huyện Nhơn Trạch", "đất Nhơn Trạch", "bán đất Nhơn Trạch 2 tỷ").dat.length === 1);
  ok("S01-b (mới) 'Nhơn Trạch, Đồng Nai' cho 'nhon trach' không dấu → đạt", q("Nhơn Trạch, Đồng Nai", "dat nhon trach", "ban dat nhon trach 1ty8").dat.length === 1);
  ok("S01-c vùng ngoài nhưng KHÁC vùng trong trích ('Bình Dương' cho 'Nhơn Trạch') → bỏ", q("Bình Dương", "đất Nhơn Trạch", "bán đất Nhơn Trạch 2 tỷ").dat.length === 0);
  const acS = docAiChinh(q("Huyện Nhơn Trạch", "đất Nhơn Trạch", "bán đất Nhơn Trạch 2 tỷ").dat, null);
  ok("S01-d docAiChinh quận vùng ngoài → 'Đồng Nai' (không rơi null)", acS.quan === "Đồng Nai", JSON.stringify(acS.quan));
  const ch = (dat, dong = null) => docAiChinh(dat.map((d) => ({ can: null, ...d })), dong);
  const acR = ch([{ khoa: "loai_bds", gia_tri: "chung_cu", trich_dan: "căn hộ" }, { khoa: "dien_tich_san", gia_tri: "76", trich_dan: "76m2" }]);
  ok("R02-a căn hộ: AI ghi dien_tich_san 76 → dienTich 76 (đổ area_m2)", acR.dienTich === 76 && acR.ghi.some((g) => /76/.test(g.answer)), JSON.stringify({ dt: acR.dienTich, ghi: acR.ghi }));
  const acR2 = ch([{ khoa: "dien_tich_san", gia_tri: "68", trich_dan: "68 mét vuông" }], { property_type: "chung_cu" });
  ok("R02-b (mới) tin đã là chung cư trong DB, '68 mét vuông' vào dien_tich_san → dienTich 68", acR2.dienTich === 68, JSON.stringify(acR2.dienTich));
  const acR3 = ch([{ khoa: "loai_bds", gia_tri: "nha_pho", trich_dan: "nhà" }, { khoa: "dien_tich", gia_tri: "60", trich_dan: "60m2" }, { khoa: "dien_tich_san", gia_tri: "180", trich_dan: "sàn 180m2" }]);
  ok("R02-c nhà phố giữ diện tích SÀN riêng (không đè dien_tich)", acR3.dienTich === 60, JSON.stringify(acR3.dienTich));
  const st = (gt, tc, tin) => kiemDeXuat([{ khoa: "so_tang", gia_tri: gt, trich_dan: tc, can: null }], tin);
  const s7 = st("4", "3 tầng", "4x16, 3 tầng");
  ok("S07-a '3 tầng' mà AI ghi 4 → sửa thành 3, không bỏ cả ô", s7.dat.length === 1 && s7.dat[0].gia_tri === "3", JSON.stringify(s7));
  const s7b = st("6", "nhà 5 tang", "nha 5 tang hem 4m");
  ok("S07-b (mới) 'nhà 5 tang' không dấu, AI ghi 6 → 5", s7b.dat.length === 1 && s7b.dat[0].gia_tri === "5", JSON.stringify(s7b));
  const s7c = st("4", "trệt 3 lầu", "nhà trệt 3 lầu");
  ok("S07-c 'trệt 3 lầu' = 4 vẫn đúng như cũ", s7c.dat.length === 1 && s7c.dat[0].gia_tri === "4", JSON.stringify(s7c));
  const X = "em bán căn hộ q7 3 tỷ để mua nhà Bình Thạnh 6 tỷ";
  const x1 = docMuaKem({ khu_vuc: "Bình Thạnh", ngan_sach: "6 tỷ", loai: "nhà", trich_dan: "mua nhà Bình Thạnh 6 tỷ" }, X);
  ok("X04-a vế mua → area Bình Thạnh, budget 6 tỷ", /Bình Thạnh/.test(x1?.area ?? "") && x1?.budget === "6 tỷ", JSON.stringify(x1));
  const x2 = docMuaKem({ khu_vuc: "Bình Thạnh", ngan_sach: "3 tỷ", loai: null, trich_dan: "mua nhà Bình Thạnh 6 tỷ" }, X);
  ok("X04-b AI lấy nhầm giá căn BÁN (3 tỷ) làm ngân sách → không nhận budget", x2 && !x2.budget, JSON.stringify(x2));
  ok("X04-c khu vực không nằm trong cụm trích (q7 là căn bán) → không nhận area", !docMuaKem({ khu_vuc: "q7", ngan_sach: null, loai: null, trich_dan: "mua nhà Bình Thạnh 6 tỷ" }, X));
  ok("X04-d cụm trích bịa → null", docMuaKem({ khu_vuc: "Bình Thạnh", ngan_sach: "6 tỷ", loai: null, trich_dan: "mua nhà Gò Vấp 6 tỷ" }, X) === null);
  const x5 = docMuaKem({ khu_vuc: "quận 2", ngan_sach: "tầm 5 tỷ rưỡi", loai: "căn hộ", trich_dan: "anh tính mua căn hộ quận 2 tầm 5 tỷ rưỡi" }, "bán xong căn này anh tính mua căn hộ quận 2 tầm 5 tỷ rưỡi");
  const bd = (x) => x.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cq = (t) => JSON.stringify(cacQuanTrong(t, bd));
  ok("ZU-a 'bán căn hộ q7 … để mua nhà Bình Thạnh' → HAI quận (luật không được đoán một)", cq(X) === '["Quận 7","Quận Bình Thạnh"]', cq(X));
  ok("ZU-b 'Cần Đước, Long An' là MỘT nơi; 'quận 1 … quận 10' là HAI", cq("bán đất Cần Đước, Long An") === '["Cần Đước, Long An"]' && cq("bán nhà quận 1, còn căn quận 10") === '["Quận 1","Quận 10"]', cq("bán đất Cần Đước, Long An"));
  ok("ZU-c câu một quận → một ('Lê Văn Sỹ quận 3 phường 9')", cq("bán nhà hẻm Lê Văn Sỹ quận 3 phường 9 4x15 7 tỷ") === '["Quận 3"]');
  ok("X04-e (mới) 'bán xong … tính mua căn hộ quận 2 tầm 5 tỷ rưỡi' → đủ 3 ô", x5?.area === "Quận 2" && x5?.budget === "tầm 5 tỷ rưỡi" && x5?.property_type === "căn hộ", JSON.stringify(x5));
}
// 05/10/2026 (SRS-5.1zx): AI đọc tự xưng có trích dẫn nằm trong TIN CŨ của chủ nhà (khối bộ nhớ) → nhận; không có ở đâu → bỏ.
{
  const cu = ["bán nhà hẻm Trương Đình", "Anh nói đó được giá thì thôi"];
  ok("XH-LS-01 trích 'Anh nói đó' nằm trong tin cũ → anh", docTuXung({ la: "anh", trich_dan: "Anh nói đó" }, "Shr", cu)?.la === "anh");
  ok("XH-LS-02 không có tin cũ → không nhận", docTuXung({ la: "anh", trich_dan: "Anh nói đó" }, "Shr") === null);
  ok("XH-LS-03 trích không có ở tin nào → bỏ", docTuXung({ la: "anh", trich_dan: "anh đang muốn bán" }, "Shr", cu) === null);
  ok("XH-LS-04 trích ở tin cũ nhưng không có chữ 'chị' → bỏ", docTuXung({ la: "chị", trich_dan: "Anh nói đó" }, "Shr", cu) === null);
  ok("XH-LS-05 (mới) 'Nhà a 4 tầng' ở tin cũ, trích 'Nhà a' → anh", docTuXung({ la: "anh", trich_dan: "Nhà a" }, "sổ riêng", ["Nhà a 4 tầng tính cả lửng"])?.la === "anh");
}
// 05/10/2026 (SRS-5.1zz): quan / ma_can / gia_m2 đã đọc vào cột lõi thì không còn ghi "bỏ, khoá không có chỗ ghi" (tiếng ồn).
{
  const T = (khoa, gia_tri, trich_dan) => ({ khoa, gia_tri, trich_dan, can: null });
  const r = docAiChinh([T("quan", "Quận 5", "quận 5"), T("ma_can", "S1.02", "căn S1.02"), T("gia_m2", "95 triệu/m2", "95 triệu/m2"), T("gia", "5 tỷ", "5 tỷ")], null);
  ok("ON-01 quận / mã căn / giá m² đã vào cột lõi → không nằm trong bỏ", r.quan === "Quận 5" && r.maCan === "S1.02" && r.giaM2Raw === "95 triệu/m2" && !r.bo.some((b) => ["quan", "ma_can", "gia_m2"].includes(b.khoa)), JSON.stringify(r.bo));
  const r2 = docAiChinh([T("quan", "Quận Mặt Trăng", "quận mặt trăng"), T("ma_can", "căn góc đẹp lắm nha", "căn góc đẹp lắm nha")], null);
  ok("ON-02 quận lạ / mã căn sai dạng → vẫn báo bỏ", r2.quan === null && r2.maCan === null && r2.bo.filter((b) => ["quan", "ma_can"].includes(b.khoa)).length === 2, JSON.stringify(r2.bo));
}
// ── 06/10/2026 (SRS-5.1zzo, bắn thử thu-srd-a1 / b1): bốn lớp lỗi sửa ở gốc ──
{
  // Lớp 1 — mở ô chờ mà không hỏi: lời model không câu hỏi → nối câu hỏi của ô đã mở.
  ok("GOC-U01 'Dạ em cảm ơn anh.' không có câu hỏi", !coCauHoi("Dạ em cảm ơn anh."));
  ok("GOC-U02 câu hỏi có '?' / đuôi hỏi không dấu chấm hỏi", coCauHoi("Anh dự định giá bao nhiêu ạ?") && coCauHoi("Nhà mình mấy tầng rồi anh") && coCauHoi("sổ riêng hay chung ạ"));
  ok("GOC-U03 nối câu hỏi khi thiếu, giữ nguyên khi đã có", damBaoCauHoi("Dạ em cảm ơn anh", "Anh dự định giá bao nhiêu ạ?") === "Dạ em cảm ơn anh. Anh dự định giá bao nhiêu ạ?"
    && damBaoCauHoi("Em ghi rồi. Nhà mình mấy tầng ạ?", "Giá?") === "Em ghi rồi. Nhà mình mấy tầng ạ?" && damBaoCauHoi("Dạ em cảm ơn anh.", null) === "Dạ em cảm ơn anh.");
  // Lớp 2 — cổng nhiều căn: AI đánh số `can` → chia theo AI dù regex không thấy căn (câu dùng dấu phẩy phân cách thông số).
  const B1 = "Em có 2 căn gửi bán: căn 1 hẻm 5m Phạm Văn Chí P7 Q6, 4x12, 6.9 tỷ; căn 2 mặt tiền Trần Phú Q5, 4x20, 18 tỷ";
  const T = (khoa, gia_tri, trich_dan, can) => ({ khoa, gia_tri, trich_dan, can });
  const datB1 = [T("duong", "hẻm 5m Phạm Văn Chí", "hẻm 5m Phạm Văn Chí", 1), T("quan", "Quận 6", "Q6", 1), T("ngang", "4", "4x12", 1), T("dai", "12", "4x12", 1), T("gia", "6.9 tỷ", "6.9 tỷ", 1),
    T("duong", "Trần Phú", "mặt tiền Trần Phú", 2), T("quan", "Quận 5", "Q5", 2), T("ngang", "4", "4x20", 2), T("dai", "20", "4x20", 2), T("gia", "18 tỷ", "18 tỷ", 2), T("loai_duong_vao", "mat_tien", "mặt tiền", 2)];
  const cB1 = canTheoAi(B1, datB1, 2);
  ok("GOC-U04 'căn 1 …, 4x12, 6.9 tỷ; căn 2 …' → 2 căn theo AI, mỗi căn đúng quận / giá / đoạn chữ của mình",
    cB1.length === 2 && cB1[0].quan === "Quận 6" && cB1[0].gia === "6.9 tỷ" && /^căn 1 hẻm 5m Phạm Văn Chí/.test(cB1[0].goc) && !/Trần Phú/.test(cB1[0].goc)
      && cB1[1].quan === "Quận 5" && cB1[1].gia === "18 tỷ" && /^căn 2 mặt tiền Trần Phú/.test(cB1[1].goc) && cB1[1].ngang === "4" && cB1[1].dai === "20", JSON.stringify(cB1));
  const B2 = "Bên anh đang có hai sản phẩm nhờ em đăng: nhà Lê Quang Định Bình Thạnh 4x18 giá 9 tỷ 2, và căn hộ Sunrise City Q7 70m2 3 tỷ 8";
  const cB2 = canTheoAi(B2, [T("loai_bds", "nha_pho", "nhà", 1), T("duong", "Lê Quang Định", "Lê Quang Định", 1), T("quan", "Quận Bình Thạnh", "Bình Thạnh", 1), T("gia", "9 tỷ 2", "9 tỷ 2", 1),
    T("loai_bds", "chung_cu", "căn hộ", 2), T("du_an", "Sunrise City", "Sunrise City", 2), T("quan", "Quận 7", "Q7", 2), T("dien_tich", "70", "70m2", 2), T("gia", "3 tỷ 8", "3 tỷ 8", 2)], 2);
  ok("GOC-U05 (cách nói MỚI, không 'căn 1/căn 2') → vẫn 2 căn, loại nhà / căn hộ theo AI", cB2.length === 2 && cB2[0].loai === "nha_pho" && cB2[1].loai === "chung_cu" && cB2[1].dt === "70" && /Sunrise City/.test(cB2[1].goc) && !/Sunrise/.test(cB2[0].goc), JSON.stringify(cB2));
  ok("GOC-U06 AI nói 1 căn / không đánh số → [] (regex đỡ)", canTheoAi(B1, datB1.map((d) => ({ ...d, can: null })), 2).length === 0 && canTheoAi(B1, datB1, 1).length === 0);
  // Lớp 3 — "khách hỏi" ve_bot phải có bằng chứng về bot; khách tự nói vai thì không phải câu hỏi.
  const hoiVeBot = (cau) => ({ co_hoi: true, cau_hoi: cau, chu_de: "ve_bot" });
  ok("GOC-U07 'Anh là môi giới nha' + AI nói ve_bot → không tin AI (undefined, luật đỡ)", docHoiLai(hoiVeBot("Anh là môi giới nha"), "Anh là môi giới nha", false) === undefined);
  ok("GOC-U08 cùng câu, AI đọc ra vai môi giới → không hỏi (null)", docHoiLai(hoiVeBot("Anh là môi giới nha"), "Anh là môi giới nha", false, true) === null);
  ok("GOC-U09 (mới) 'bên anh là sàn nha em' → không phải hỏi về bot", docHoiLai(hoiVeBot("bên anh là sàn nha em"), "bên anh là sàn nha em", false, true) === null
    && docHoiLai(hoiVeBot("mình làm sale bên Hưng Thịnh"), "mình làm sale bên Hưng Thịnh", false) === undefined);
  ok("GOC-U10 câu hỏi về bot thật vẫn nhận", docHoiLai(hoiVeBot("em là người hay máy vậy"), "em là người hay máy vậy", false)?.chuDe === "ve_bot"
    && docHoiLai(hoiVeBot("bên em công ty nào"), "bên em công ty nào", false)?.chuDe === "ve_bot" && docHoiLai(hoiVeBot("em la bot ha"), "em la bot ha", false)?.chuDe === "ve_bot");
  // Lớp 4 — khẳng định trạng thái tin: nhận ra mệnh đề, bỏ khi không còn tin mở; vế phủ định giữ.
  const r3 = ["Tin căn Trần Phú của anh đang rao, có khách quan tâm em báo anh liền nhé."];
  ok("GOC-U11 'Tin căn X đang rao' là mệnh đề trạng thái; bỏ xong còn vế báo khách", coMenhDeDaDang(r3) && !/đang rao/.test(boHuaDaDang(r3)[0]) && /có khách quan tâm/i.test(boHuaDaDang(r3)[0]), JSON.stringify(boHuaDaDang(r3)));
  const phuDinh = ["Dạ hiện em không thấy tin nào của anh đang rao. Khi nào có căn khác anh nhắn em nha."];
  ok("GOC-U12 vế phủ định 'không thấy tin nào đang rao' không phải mệnh đề sai, giữ nguyên", !coMenhDeDaDang(phuDinh) && boHuaDaDang(phuDinh)[0] === phuDinh[0], JSON.stringify(boHuaDaDang(phuDinh)));
  ok("GOC-U13 bong bóng 🤖 / câu hỏi không tính", !coMenhDeDaDang(["🤖 Bóc tách được: tin đang rao", "Tin mình đang rao chưa anh?"]));
}
// ── SRS-5.1zzr (06/10/2026, chủ dự án: "trông vào model, nhưng thông tin quan trọng ghi nguyên văn; mỗi loại BĐS một bộ trường"):
// ô NGUYÊN VĂN theo loại — model chỉ ra CỤM, ô ghi đúng cụm khách gõ. Ca gốc test Zalo 14:06: "hẻm 137 Nguyễn Trãi" → "137 hẻm Nguyễn Trãi". ──
{
  const dx = (khoa, gia_tri, trich_dan) => ({ khoa, gia_tri, trich_dan });
  const soSanh = (khoa, ai) => ({ trung: [], lech: [], ai_them: [{ khoa, ai }] });
  const k1 = kiemDeXuat([dx("duong", "137 hẻm Nguyễn Trãi", "hẻm 137 Nguyễn Trãi")], "Nhà ở hẻm 137 Nguyễn Trãi quận 5");
  ok("NV-01 kiemDeXuat điền cum_goc = cụm nguyên văn trong tin", k1.dat[0]?.cum_goc === "hẻm 137 Nguyễn Trãi", JSON.stringify(k1));
  ok("NV-02 ca gốc: model đảo '137 hẻm Nguyễn Trãi' → ô vị trí ghi 'hẻm 137 Nguyễn Trãi'", giaTriNguyenVan("vi_tri", k1.dat[0]) === "hẻm 137 Nguyễn Trãi", giaTriNguyenVan("vi_tri", k1.dat[0]));
  ok("NV-03 câu treo vị trí cũng ra cụm khách", giaTriChoCauTreo(k1.dat, "vi_tri", {}) === "hẻm 137 Nguyễn Trãi", giaTriChoCauTreo(k1.dat, "vi_tri", {}));
  ok("NV-04 docAiChinh (câu rao) ghi vi_tri nguyên văn", docAiChinh(k1.dat, null).ghi.find((g) => g.question === "vi_tri")?.answer === "hẻm 137 Nguyễn Trãi", JSON.stringify(docAiChinh(k1.dat, null).ghi));
  const k2 = kiemDeXuat([dx("duong", "Hùng Vương", "126 Hung Vuong")], "co can ho Hung Vuong Plaza 126 Hung Vuong p12");
  ok("NV-05 model chỉ thêm dấu cho một phần → '126 Hùng Vương' (số nhà giữ, dấu lấy của model)", giaTriNguyenVan("vi_tri", k2.dat[0]) === "126 Hùng Vương", giaTriNguyenVan("vi_tri", k2.dat[0]));
  const k3 = kiemDeXuat([dx("duong", "Phạm Thế Hiển", "pham the hien")], "nhà của anh ở hem 4m pham the hien, p4 q8 nha");
  ok("NV-06 cả cụm chỉ thêm dấu → 'Phạm Thế Hiển'", giaTriNguyenVan("vi_tri", k3.dat[0]) === "Phạm Thế Hiển", giaTriNguyenVan("vi_tri", k3.dat[0]));
  const k4 = kiemDeXuat([dx("duong", "88 hẻm Tân Kỳ Tân Quý", "88 hẻm 6m Tân Kỳ Tân Quý")], "bán nhà số 88 hẻm 6m Tân Kỳ Tân Quý quận Tân Phú, 4x15");
  ok("NV-07 bề rộng hẻm trong cụm không vào địa chỉ (ô riêng)", giaTriNguyenVan("vi_tri", k4.dat[0]) === "88 hẻm Tân Kỳ Tân Quý", giaTriNguyenVan("vi_tri", k4.dat[0]));
  const k5 = kiemDeXuat([dx("duong", "Trần Hưng Đạo", "ở 12 Trần Hưng Đạo phường 2 quận 5")], "nhà ở 12 Trần Hưng Đạo phường 2 quận 5 nha em");
  ok("NV-08 cụm trích thừa 'ở' đầu và phường / quận đuôi → '12 Trần Hưng Đạo'", giaTriNguyenVan("vi_tri", k5.dat[0]) === "12 Trần Hưng Đạo", JSON.stringify({ k5, v: giaTriNguyenVan("vi_tri", k5.dat[0]) }));
  const k6 = kiemDeXuat([dx("phap_ly", "sổ hồng riêng", "shr")], "shr, nhà ở từ 2019 rồi");
  ok("NV-09 viết tắt 'shr' → giữ bản viết đủ của model (đã kiểm cùng mã)", giaTriNguyenVan("phap_ly", k6.dat[0]) === "sổ hồng riêng", JSON.stringify({ k6, v: giaTriNguyenVan("phap_ly", k6.dat[0]) }));
  const k7 = kiemDeXuat([dx("phap_ly", "Sổ hồng riêng (chính chủ)", "sổ hồng riêng chính chủ rồi em")], "sổ hồng riêng chính chủ rồi em");
  ok("NV-10 pháp lý: cụm khách 'sổ hồng riêng chính chủ' (gọt tiểu từ), không lấy chữ model thêm ngoặc", giaTriNguyenVan("phap_ly", k7.dat[0]) === "sổ hồng riêng chính chủ", JSON.stringify({ k7, v: giaTriNguyenVan("phap_ly", k7.dat[0]) }));
  const k8 = kiemDeXuat([dx("ket_cau", "trệt 2 lầu", "1 trệt 2 lầu")], "nhà 1 trệt 2 lầu, 3 phòng ngủ");
  const g8 = chonDeGhi(k8.dat, soSanh("ket_cau", "trệt 2 lầu"), { property_type: "nha_pho" }, {});
  ok("NV-11 kết cấu nhà phố: cụm khách '1 trệt 2 lầu' thay vì chữ model", g8.ghi[0]?.answer === "1 trệt 2 lầu", JSON.stringify({ k8, g8 }));
  ok("NV-12 bảng theo loại: thổ cư nguyên văn với đất, không với nhà phố; kết cấu nguyên văn với nhà, không với đất; địa chỉ với mọi loại",
    laONguyenVan("dat", "tho_cu") && !laONguyenVan("nha_pho", "tho_cu") && laONguyenVan("nha_pho", "ket_cau") && !laONguyenVan("dat", "ket_cau") && laONguyenVan(null, "vi_tri") && laONguyenVan("kho_xuong", "duong_container"));
  const k9 = kiemDeXuat([dx("tho_cu", "100", "thổ cư 100m2 full")], "đất 120m2 thổ cư 100m2 full, giá 3 tỷ");
  const g9 = chonDeGhi(k9.dat, soSanh("tho_cu", "100"), { property_type: "dat" }, {});
  ok("NV-13 đất: ô thổ cư ghi cụm khách 'thổ cư 100m2 full'", g9.ghi[0]?.answer === "thổ cư 100m2 full", JSON.stringify({ k9, g9 }));
  const g14 = chonDeGhi(kiemDeXuat([dx("noi_that", "full nội thất", "full nt")], "full nt, 2 máy lạnh").dat, soSanh("noi_that", "full nội thất"), { property_type: "nha_pho" }, {});
  ok("NV-14 ô ngoài bảng (nội thất, nhà phố) vẫn lấy chữ model", g14.ghi[0]?.answer === "full nội thất", JSON.stringify(g14));
  const tl = kiemTraLoiCau({ co_tra_loi: true, gia_tri: "137 hẻm Nguyễn Trãi", trich_dan: "hẻm 137 Nguyễn Trãi" }, "Nhà ở hẻm 137 Nguyễn Trãi quận 5", "Nhà anh ở đâu vậy?", { cauHoi: "vi_tri", loai: "nha_pho" });
  ok("NV-15 trả lời câu treo địa chỉ: cụm khách 'hẻm 137 Nguyễn Trãi', không phải câu model đảo", tl?.giaTri === "hẻm 137 Nguyễn Trãi", JSON.stringify(tl));
  ok("NV-16 không truyền ô → như cũ (chữ model)", kiemTraLoiCau({ co_tra_loi: true, gia_tri: "137 hẻm Nguyễn Trãi", trich_dan: "hẻm 137 Nguyễn Trãi" }, "Nhà ở hẻm 137 Nguyễn Trãi quận 5")?.giaTri === "137 hẻm Nguyễn Trãi");
  ok("NV-17 cumGocTrongTin: giữ dấu / hoa thường của khách, bỏ dấu phẩy dính; không có → null", cumGocTrongTin("Sổ Hồng Riêng, anh đứng tên", "so hong rieng") === "Sổ Hồng Riêng" && cumGocTrongTin("abc", "xyz") === null);
  ok("NV-19 chữ đầu là tên thật: 'Nam Kỳ Khởi Nghĩa', 'lô 5 đường số 7' không bị gọt", giaTriNguyenVan("vi_tri", kiemDeXuat([dx("duong", "Nam Kỳ Khởi Nghĩa", "Nam Kỳ Khởi Nghĩa")], "nhà 12 Nam Kỳ Khởi Nghĩa quận 3").dat[0]) === "Nam Kỳ Khởi Nghĩa"
    && giaTriNguyenVan("vi_tri", kiemDeXuat([dx("duong", "lô 5 đường số 7", "lô 5 đường số 7")], "đất lô 5 đường số 7 phường 12").dat[0]) === "lô 5 đường số 7");
  ok("NV-20 tên đường gõ không dấu trùng chữ hành chính ('huyen tran cong chua', 'quan hoa') không bị cắt đuôi; 'quận 3' thì cắt",
    giaTriNguyenVan("vi_tri", kiemDeXuat([dx("duong", "Huyền Trân Công Chúa", "huyen tran cong chua")], "nha o huyen tran cong chua q1").dat[0]) === "Huyền Trân Công Chúa"
    && giaTriNguyenVan("vi_tri", kiemDeXuat([dx("duong", "12 Nguyễn Trãi", "12 Nguyễn Trãi quận 3")], "nhà 12 Nguyễn Trãi quận 3 nha").dat[0]) === "12 Nguyễn Trãi");
  ok("NV-18 cụm không dấu trong tin thì ô cũng không dấu khi model đổi thứ tự (không mượn dấu sai chỗ)", giaTriNguyenVan("vi_tri", kiemDeXuat([dx("duong", "137 hẻm Nguyễn Trãi", "hem 137 nguyen trai")], "nha o hem 137 nguyen trai q5").dat[0]) === "hem 137 nguyen trai");
  // SRS-5.1zzzzx (khách mô phỏng 11/10): trích dẫn rộng cả câu kèm lời phàn nàn → ô chỉ mang đoạn model chỉ ra, chữ vẫn của khách.
  const tl21 = kiemTraLoiCau({ co_tra_loi: true, gia_tri: "đường 3/2", trich_dan: "duong 3/2 so nha thi da noi roi" }, "duong 3/2 so nha thi da noi roi", "Nhà anh ở đường nào, số bao nhiêu vậy ạ?", { cauHoi: "vi_tri", loai: "nha_pho" });
  ok("NV-21 ca gốc: 'duong 3/2 so nha thi da noi roi' → ô địa chỉ 'đường 3/2', không kèm lời phàn nàn", tl21?.giaTri === "đường 3/2", JSON.stringify(tl21));
  ok("NV-22 cách nói mới: 'Tên Lửa á, nói rồi mà em' (truong) → 'Tên Lửa'",
    giaTriNguyenVan("vi_tri", kiemDeXuat([dx("duong", "Tên Lửa", "Tên Lửa á, nói rồi mà em")], "Tên Lửa á, nói rồi mà em").dat[0]) === "Tên Lửa",
    giaTriNguyenVan("vi_tri", kiemDeXuat([dx("duong", "Tên Lửa", "Tên Lửa á, nói rồi mà em")], "Tên Lửa á, nói rồi mà em").dat[0]));
  ok("NV-23 model làm rơi con số khách nói ('Nguyễn Trãi' từ 'hẻm 137 Nguyễn Trãi') → giữ cả cụm",
    giaTriNguyenVan("vi_tri", kiemDeXuat([dx("duong", "Nguyễn Trãi", "hẻm 137 Nguyễn Trãi")], "nhà hẻm 137 Nguyễn Trãi").dat[0]) === "hẻm 137 Nguyễn Trãi");
  // SRS-5.1zzzzx (khách mô phỏng 11/10): "3/2 q10" khi hỏi địa chỉ — tên đường 3 ký tự từng bị ngưỡng độ dài gạt.
  const vt = (gt, td, tin) => giaTriChoCauTreo(kiemDeXuat([dx("duong", gt, td)], tin).dat, "vi_tri", { property_type: "nha_pho" });
  ok("VT-01 ca gốc: AI duong '3/2' «3/2» (tin '3/2 q10') → địa chỉ 'đường 3/2', không rơi", vt("3/2", "3/2", "3/2 q10") === "đường 3/2", vt("3/2", "3/2", "3/2 q10"));
  ok("VT-02 cách nói mới: '30/4 nha em' → 'đường 30/4'; mã 'D2' → 'đường D2'",
    vt("30/4", "30/4", "30/4 nha em") === "đường 30/4" && vt("D2", "D2", "D2 binh thanh") === "đường D2", `${vt("30/4", "30/4", "30/4 nha em")} | ${vt("D2", "D2", "D2 binh thanh")}`);
  ok("VT-03 số nhà hẻm '137/28' (137 > 31) không bị thêm chữ 'đường'", vt("137/28", "137/28", "137/28 nha anh") === "137/28", vt("137/28", "137/28", "137/28 nha anh"));
  // SRS-5.1zzzzx (khách mô phỏng 11/10): câu trả lời tự nhiên cho ô ĐANG HỎI không bị danh sách từ khoá hình dạng loại oan.
  const ht = (gt, td, tin, hoi) => kiemDeXuat([dx("hien_trang", gt, td)], tin, hoi ? { cauDangHoi: hoi } : {});
  ok("HT-01 ca gốc: đang hỏi tình trạng, 'đang ở tình trạng bình thường' → nhận 'bình thường'",
    ht("bình thường", "đang ở tình trạng bình thường", "nhà chú đang ở tình trạng bình thường, sổ riêng từ lâu", "hien_trang").dat.length === 1);
  ok("HT-02 cách nói mới: đang hỏi tình trạng, 'vẫn ổn anh, chưa phải làm gì' → nhận",
    ht("vẫn ổn, chưa phải làm gì", "vẫn ổn anh, chưa phải làm gì", "vẫn ổn anh, chưa phải làm gì", "hien_trang").dat.length === 1);
  ok("HT-03 đang hỏi tình trạng mà cụm là 'hẻm xe hơi' (ô đường vào) → vẫn loại 'xe hơi'",
    ht("xe hơi", "hẻm xe hơi", "hẻm xe hơi", "hien_trang").bo[0]?.ly_do === "gia_tri_khong_dung_loai_truong");
  ok("HT-04 KHÔNG hỏi tình trạng → danh sách hình dạng vẫn soát như cũ",
    ht("bình thường", "đang ở tình trạng bình thường", "nhà chú đang ở tình trạng bình thường").bo[0]?.ly_do === "gia_tri_khong_dung_loai_truong");
  ok("NV-24 pháp lý trích kèm chữ đệm: 'sổ riêng nguyên căn từ lâu rồi chú' với giá trị 'sổ riêng' → 'sổ riêng'",
    giaTriNguyenVan("phap_ly", kiemDeXuat([dx("phap_ly", "sổ riêng", "sổ riêng nguyên căn từ lâu rồi chú")], "4 tỷ rưỡi chú, sổ riêng nguyên căn từ lâu rồi chú").dat[0]) === "sổ riêng");
}
// ── SRS-5.1zzu (06/10/2026, bắn lại thu-ai-0610): ô ĐO ĐẾM — câu trả lời AI phải mang số / loại đường; không thì để luật đọc ──
{
  const o = (q) => ({ cauHoi: q, loai: "nha_pho" });
  const tlO = (v, td, tin, q) => kiemTraLoiCau({ co_tra_loi: true, gia_tri: v, trich_dan: td }, tin, null, o(q));
  ok("KIEU-01 hỏi hẻm, AI 'anh đứng tên, không thế chấp' (ca gốc) → BỎ: không số, không loại đường", tlO("anh đứng tên, không thế chấp", "anh đứng tên, không thế chấp", "anh đứng tên, không thế chấp", "do_rong_hem")?.giaTri === null);
  ok("KIEU-02 hỏi hẻm, '4 mét' → nhận", tlO("4 mét", "4m", "hẻm 4m", "do_rong_hem")?.giaTri === "4 mét");
  ok("KIEU-03 hỏi hẻm, 'hẻm xe hơi' → nhận", tlO("hẻm xe hơi", "hxh", "hxh nha", "do_rong_hem")?.giaTri === "hẻm xe hơi");
  ok("KIEU-04 hỏi hẻm, 'nhà mặt tiền' → nhận", tlO("nhà mặt tiền", "mặt tiền", "nhà mặt tiền đó em", "do_rong_hem")?.giaTri === "nhà mặt tiền");
  ok("KIEU-05 hỏi phòng ngủ, AI 'sổ hồng riêng' → bỏ", tlO("sổ hồng riêng", "shr", "shr nha em", "so_phong_ngu")?.giaTri === null);
  ok("KIEU-06 hỏi phí quản lý, 'không có phí' → nhận", tlO("không có phí", "không có phí", "chung cư này không có phí gì hết", "phi_quan_ly")?.giaTri === "không có phí");
  ok("KIEU-07 hỏi phí quản lý, AI 'anh đứng tên' → bỏ ('không thế chấp' không phải 'không có')", tlO("anh đứng tên, không thế chấp", "anh đứng tên, không thế chấp", "anh đứng tên, không thế chấp", "phi_quan_ly")?.giaTri === null);
  ok("KIEU-08 ô CHỮ (pháp lý) không bị đòi số: 'sổ hồng riêng' → nhận", tlO("sổ hồng riêng", "shr", "shr nha em", "phap_ly")?.giaTri === "sổ hồng riêng");
  ok("KIEU-09 hỏi số tầng, '3 tầng' (trích '3 tầng') → nhận; hỏi năm xây, 'mới xây' → bỏ", tlO("3 tầng", "3 tầng", "nhà 3 tầng nha", "so_tang")?.giaTri === "3 tầng"
    && tlO("mới xây", "mới xây", "nhà mới xây", "nam_xay")?.giaTri === null);
  ok("KIEU-10 không truyền ô (nơi gọi cũ) → không kiểm kiểu, như trước", kiemTraLoiCau({ co_tra_loi: true, gia_tri: "anh đứng tên", trich_dan: "anh đứng tên" }, "anh đứng tên")?.giaTri === "anh đứng tên");
}
// ── SRS-5.1zzw (06/10/2026, bắn lại thu-ai-0610 lần 3–4): một cụm chỉ trả lời một ô ──
{
  const L = (question, answer) => ({ question, answer });
  const D = (khoa, gia_tri, trich_dan) => ({ khoa, gia_tri, trich_dan });
  const luatDT = [L("nguoi_dung_ten", "anh đứng tên"), L("the_chap", "không thế chấp")];
  ok("MC-01 (ca gốc 14:20) hỏi gấp, trích 'anh đứng tên, không thế chấp', cùng lượt đã vào ô đứng tên + thế chấp → thuộc ô khác",
    traLoiThuocOKhac("anh đứng tên, không thế chấp", "gap", [], luatDT) === true);
  ok("MC-02 (ca gốc 13:30) hỏi hẻm, cùng câu → thuộc ô khác", traLoiThuocOKhac("anh đứng tên, không thế chấp", "do_rong_hem", [], luatDT) === true);
  ok("MC-03 'không gấp, anh đứng tên' → còn 'không gấp' → VẪN là câu trả lời câu gấp", traLoiThuocOKhac("không gấp, anh đứng tên", "gap", [], luatDT) === false);
  ok("MC-04 'có, sổ hồng riêng' hỏi gấp → còn 'có' (câu trả lời có/không) → không gạt",
    traLoiThuocOKhac("có, sổ hồng riêng", "gap", [D("phap_ly", "sổ hồng riêng", "sổ hồng riêng")], []) === false);
  ok("MC-05 (cách nói MỚI) hỏi thang máy, 'giá 5 tỷ 2 nha em' — AI đã gán cụm cho ô giá → thuộc ô khác",
    traLoiThuocOKhac("giá 5 tỷ 2 nha em", "thang_may", [D("gia", "5 tỷ 2", "giá 5 tỷ 2")], []) === true);
  ok("MC-06 fact cùng ô đang hỏi không tính là 'ô khác': hỏi thế chấp, 'không thế chấp' → không gạt",
    traLoiThuocOKhac("không thế chấp", "the_chap", [], luatDT) === false);
  ok("MC-07 không có cụm ô khác nào khớp → không gạt; không có trích → không gạt",
    traLoiThuocOKhac("hẻm 4m xe hơi vào", "do_rong_hem", [], luatDT) === false && traLoiThuocOKhac(null, "gap", [], luatDT) === false);
  ok("MC-08 (cách nói MỚI) hỏi hẻm, 'hẻm 137 Nguyễn Trãi' mà AI gán cụm cho ô địa chỉ → thuộc ô khác (địa chỉ không phải độ rộng hẻm)",
    traLoiThuocOKhac("hẻm 137 Nguyễn Trãi", "do_rong_hem", [D("duong", "hẻm 137 Nguyễn Trãi", "hẻm 137 Nguyễn Trãi")], []) === true);
}
// SRS-5.1zzzb (07/10/2026, chat thử): lưới loại đường vào soi CỤM TRÍCH, không phải cả tin. Khách trả lời câu hỏi trước rồi nói thêm.
{
  const TL = (g, t) => ({ co_tra_loi: true, gia_tri: g, trich_dan: t });
  ok("ZZZB-01 hỏi hạ tầng, 'không có mặt tiền đẹp em', AI trích 'không có' → nhận (chữ 'mặt tiền' ở ý thêm không bác)",
    kiemTraLoiCau(TL("không vướng gì", "không có"), "không có mặt tiền đẹp em", null, { cauHoi: "ha_tang", loai: "nha_pho" })?.giaTri === "không vướng gì");
  ok("ZZZB-02 (cách nói MỚI) hỏi quy hoạch, 'ko dính gì hết, nhà mặt tiền kinh doanh' AI trích 'ko dính gì hết' → nhận",
    kiemTraLoiCau(TL("không dính quy hoạch", "ko dính gì hết"), "ko dính gì hết, nhà mặt tiền kinh doanh", null, { cauHoi: "quy_hoach", loai: "nha_pho" })?.giaTri === "không dính quy hoạch");
  ok("ZZZB-03 hỏi hẻm, 'Hxm nhé' AI nói 'hẻm xe hơi' → vẫn bác (loại đường trong cụm trích khác giá trị)",
    kiemTraLoiCau(TL("hẻm xe hơi", "Hxm"), "Hxm nhé", null, { cauHoi: "do_rong_hem", loai: "nha_pho" })?.giaTri === null);
}
// SRS-5.1zzzc (chat thử 07/10): đường ĐÁNH SỐ ("Thạnh Lộc 41") không được cắt mất số; một cụm nguyên văn chỉ một ô.
{
  for (const [tin, cum, so] of [["bán lô đất 45 Thạnh Lộc 41 quận 12, 5x20", "45 Thạnh Lộc", "41"], ["đường Hiệp Thành 13 hẻm 4m", "Hiệp Thành", "13"],
    // cách nói MỚI chưa từng bắn
    ["nhà Tân Chánh Hiệp 10 nha em", "Tân Chánh Hiệp", "10"],
    ["nhà 12 Nguyễn Trãi 4 tầng", "12 Nguyễn Trãi", null], ["nhà 12 Nguyễn Trãi 5x20", "12 Nguyễn Trãi", null], ["Lê Văn Sỹ 3 tỷ", "Lê Văn Sỹ", null],
    ["nhà 12 Nguyễn Trãi 2 mặt tiền", "12 Nguyễn Trãi", null], ["hẻm 45 Nguyễn Trãi", "hẻm 45", null], ["nhà Trần Hưng Đạo 120m2", "Trần Hưng Đạo", null]]) {
    ok(`ZZZC-so '${tin}' sau '${cum}' → ${so}`, soSauTenDuong(tin, cum) === so, String(soSauTenDuong(tin, cum)));
  }
  const tinTL = "bán lô đất 45 Thạnh Lộc 41 quận 12, 5x20, giá 5 tỷ";
  const kd = kiemDeXuat([{ khoa: "duong", gia_tri: "45 Thạnh Lộc", trich_dan: "45 Thạnh Lộc" }, { khoa: "ten_duong", gia_tri: "Thạnh Lộc", trich_dan: "45 Thạnh Lộc" }], tinTL).dat;
  ok("ZZZC-01 AI trích '45 Thạnh Lộc' → địa chỉ '45 Thạnh Lộc 41', tên đường 'Thạnh Lộc 41'",
    kd.find((d) => d.khoa === "duong")?.cum_goc === "45 Thạnh Lộc 41" && kd.find((d) => d.khoa === "ten_duong")?.gia_tri === "Thạnh Lộc 41", JSON.stringify(kd));
  const tinKC = "nhà cấp 4 1 tầng thôi em, 3 phòng ngủ";
  const kc = kiemTraLoiCau({ co_tra_loi: true, gia_tri: "1 tầng", trich_dan: tinKC }, tinKC, null, { cauHoi: "ket_cau", loai: "nha_pho" });
  ok("ZZZC-02 hỏi kết cấu, trích cả câu có '3 phòng ngủ' → ô kết cấu không mang '3 phòng ngủ'", !!kc?.giaTri && !/phòng ngủ/.test(kc.giaTri), JSON.stringify(kc));
  ok("ZZZC-03 (cách nói MỚI) 'trệt 2 lầu, sổ hồng riêng, có gác lửng' cho ô kết cấu → bỏ mảnh pháp lý",
    gotManhOKhac("ket_cau", "trệt 2 lầu, sổ hồng riêng, có gác lửng") === "trệt 2 lầu, có gác lửng");
}
// ── SRS-5.1zzzh (07/10/2026, chủ dự án: "sếp bảo giữ nguyên những gì khách chat nhưng… mình cần đính chính lại"): ô nguyên văn
// giữ CHỮ khách nhưng đính chính lỗi gõ nhẹ theo bản model; địa chỉ không (từ điển đường hỏi xác nhận); nghĩa khác thì không.
{
  const nv = (q, cum, v) => giaTriNguyenVan(q, { khoa: q, gia_tri: v, trich_dan: cum, cum_goc: cum });
  ok("ZZZH-01 'nhà còn nguyê' + model 'còn nguyên' → 'còn nguyên'", nv("hien_trang", "nhà còn nguyê", "còn nguyên") === "còn nguyên", nv("hien_trang", "nhà còn nguyê", "còn nguyên"));
  ok("ZZZH-02 (cách gõ MỚI) 'sổ hồng riêg' → 'sổ hồng riêng'", nv("phap_ly", "sổ hồng riêg", "sổ hồng riêng") === "sổ hồng riêng");
  ok("ZZZH-03 không dấu 'so hong rieng' → bản có dấu", nv("phap_ly", "so hong rieng", "sổ hồng riêng") === "sổ hồng riêng");
  ok("ZZZH-04 số khác ('2 lầu' / '3 lầu') → GIỮ chữ khách", nv("ket_cau", "1 trệt 2 lầu", "1 trệt 3 lầu") === "1 trệt 2 lầu");
  ok("ZZZH-05 nghĩa khác ('sổ chung' / 'sổ riêng') → GIỮ chữ khách", nv("phap_ly", "sổ chung", "sổ riêng") === "sổ chung");
  ok("ZZZH-06 ĐỊA CHỈ gõ sai không tự sửa (từ điển đường hỏi xác nhận)", nv("vi_tri", "45 Pham The Hier", "45 Phạm Thế Hiển") === "45 Pham The Hier");
  ok("ZZZH-07 câu khác hẳn ('đang cho thuê' / 'đang trống') → GIỮ", nv("hien_trang", "đang cho thuê", "đang trống") === "đang cho thuê");
  ok("ZZZH-08 chiLechChinhTa: tỉ/tỷ đúng, chung/riêng sai, 2/3 sai", chiLechChinhTa("tỉ", "tỷ") && !chiLechChinhTa("chung", "riêng") && !chiLechChinhTa("2", "3"));
}
// ── SRS-5.1zzzn (08/10/2026, bắn thử …kc1tatt / …kc2chau): bản AI đọc lại tin không dấu; câu model trùng bong bóng tiền định.
{
  ok("ZZZN-01 'anh dung ten' → 'anh đứng tên' nhận", docLaiHopLe("anh đứng tên", "anh dung ten") === "anh đứng tên");
  ok("ZZZN-02 (cách gõ MỚI) 'ok up lun e' → 'ok up luôn em' nhận (viết đủ chữ tắt)", docLaiHopLe("ok up luôn em", "ok up lun e") === "ok up luôn em");
  ok("ZZZN-03 AI thêm số ('7ty2' → '7 tỷ 2 hay 8 tỷ') → bỏ", docLaiHopLe("7 tỷ 2 hay 8 tỷ", "7ty2") === null);
  ok("ZZZN-04 AI viết thành câu khác hẳn → bỏ", docLaiHopLe("anh muốn bán căn hộ ở quận 7 gấp lắm em ơi", "ok e") === null);
  ok("ZZZN-05 giống hệt tin gốc / null → null", docLaiHopLe("sổ hồng riêng", "sổ hồng riêng") === null && docLaiHopLe(null, "abc") === null);
}
// ── SRS-5.1zzzq (08/10/2026): câu khách hỏi đã có bong bóng tiền định trả lời bị CẮT khỏi tin đưa model (thay lưới cắt câu trùng).
{
  ok("ZZZQ-01 cả tin là câu hỏi phí → rỗng (model không thấy gì để trả lời lại)", anCauDaDap("phí sao cháu", "phí sao cháu") === "");
  ok("ZZZQ-02 AI trích thiếu đuôi ('phí sao') → đuôi 'cháu' cùng vế cũng cắt", anCauDaDap("phí sao cháu", "phí sao") === "");
  ok("ZZZQ-03 (cách nói MỚI) trả lời kèm hỏi: '4 tầng nha, mà phí bên cháu tính sao vậy?' → còn '4 tầng nha'",
    anCauDaDap("4 tầng nha, mà phí bên cháu tính sao vậy?", "phí bên cháu tính sao vậy") === "4 tầng nha", anCauDaDap("4 tầng nha, mà phí bên cháu tính sao vậy?", "phí bên cháu tính sao vậy"));
  ok("ZZZQ-04 tin gõ KHÔNG DẤU, AI trích có dấu → vẫn khớp, giữ phần trả lời nguyên chữ gốc",
    anCauDaDap("so hong rieng. phi ben e tinh sao", "phí bên e tính sao") === "so hong rieng", anCauDaDap("so hong rieng. phi ben e tinh sao", "phí bên e tính sao"));
  ok("ZZZQ-05 câu hỏi đứng đầu: 'em là bot hả? nhà 4x15 hẻm 5m' → còn 'nhà 4x15 hẻm 5m'",
    anCauDaDap("em là bot hả? nhà 4x15 hẻm 5m", "em là bot hả") === "nhà 4x15 hẻm 5m", anCauDaDap("em là bot hả? nhà 4x15 hẻm 5m", "em là bot hả"));
  ok("ZZZQ-06 trích không có trong tin / rỗng → trả nguyên tin", anCauDaDap("giá 15 tỷ", "phí sao") === "giá 15 tỷ" && anCauDaDap("giá 15 tỷ", null) === "giá 15 tỷ");
}
// ── SRS-5.1zzzp (08/10/2026, chủ dự án: "chiều rộng đường, mặt tiền bla bla có bị ghi sai nữa ko"): số đo vào đúng ô theo CHỮ cạnh nó.
{
  // Chạy ở CẢ HAI chế độ kiểm: nhẹ (production, `boc_tach_ai = ai`) và đủ.
  const cuNhe = laKiemNheTest();
  const lyDo = [];
  const kt1 = (tin, khoa, gt, td) => { const x = kiemDeXuat([{ khoa, gia_tri: gt, trich_dan: td }], tin); lyDo.push(`${khoa}:${x.dat.length ? "đạt" : x.bo[0]?.ly_do}`); return x.dat.length === 1; };
  const kt = (tin, khoa, gt, td) => { datKiemNhe(true); const a = kt1(tin, khoa, gt, td); datKiemNhe(false); const b = kt1(tin, khoa, gt, td); datKiemNhe(cuNhe); return a === b ? a : !a; };
  ok("ZZZP-01 'mặt tiền 4m' → ngang đạt; KHÔNG phải nhà mặt tiền đường; KHÔNG phải bề rộng đường",
    kt("mặt tiền 4m dài 16m", "ngang", "4", "mặt tiền 4m") && !kt("mặt tiền 4m dài 16m", "loai_duong_vao", "mat_tien", "mặt tiền 4m") && !kt("mặt tiền 4m dài 16m", "do_rong_duong", "4", "mặt tiền 4m"), lyDo.join(" "));
  // SRS-5.1zzzzzl: AI đặt số đo nhầm ô hẻm ↔ đường mà cụm trích nói rõ ô kia → CHUYỂN sang đúng ô (trước đây bỏ mất).
  const oVe = (tin, khoa, gt, td) => kiemDeXuat([{ khoa, gia_tri: gt, trich_dan: td }], tin).dat.map((d) => d.khoa).join();
  ok("ZZZP-02 'hẻm 4m' → chỉ bề rộng hẻm (không ngang); AI đặt nhầm ô đường thì chuyển về ô hẻm", kt("hẻm 4m", "do_rong_hem", "4", "hẻm 4m") && !kt("hẻm 4m", "ngang", "4", "hẻm 4m") && oVe("hẻm 4m", "do_rong_duong", "4", "hẻm 4m") === "do_rong_hem");
  ok("ZZZP-03 'đường trước nhà 10m' → bề rộng đường; AI đặt nhầm ô hẻm thì chuyển về ô đường", kt("đường trước nhà 10m", "do_rong_duong", "10", "đường trước nhà 10m") && oVe("đường trước nhà 10m", "do_rong_hem", "10", "đường trước nhà 10m") === "do_rong_duong");
  ok("ZZZZZL-K1 bài rao 'Ngõ rộng 6m' AI ghi ô đường → ô hẻm 6; 'Mặt tiền 6m' AI ghi cách mặt tiền → ngang 6",
    oVe("+ Ngõ rộng 6m, ô tô vào thoải mái.", "do_rong_duong", "6", "Ngõ rộng 6m") === "do_rong_hem" && oVe("+ Mặt tiền 6m, dễ dàng kinh doanh.", "cach_mat_tien", "6", "Mặt tiền 6m") === "ngang");
  ok("ZZZZZL-K1b (cách nói mới) 'kiệt rộng 3m' ô đường → ô hẻm; đối chứng 'cách mặt tiền 30m' giữ cach_mat_tien; 'mặt tiền 5m' đã có ngang thì không đè",
    oVe("nhà trong kiệt rộng 3m", "do_rong_duong", "3", "kiệt rộng 3m") === "do_rong_hem" && oVe("nhà cách mặt tiền 30m", "cach_mat_tien", "30", "cách mặt tiền 30m") === "cach_mat_tien" &&
    kiemDeXuat([{ khoa: "cach_mat_tien", gia_tri: "5", trich_dan: "mặt tiền 5m" }, { khoa: "ngang", gia_tri: "5", trich_dan: "mặt tiền 5m" }], "mặt tiền 5m dài 20").dat.map((d) => d.khoa).join() === "ngang");
  ok("ZZZP-04 (cách nói MỚI) 'nhà mặt tiền hẻm 6m' → hẻm 6m, KHÔNG phải mặt tiền đường", kt("nhà mặt tiền hẻm 6m", "do_rong_hem", "6", "mặt tiền hẻm 6m") && !kt("nhà mặt tiền hẻm 6m", "loai_duong_vao", "mat_tien", "mặt tiền hẻm 6m"));
  ok("ZZZP-05 'nhà mặt tiền đường 8m' → mặt tiền + đường 8m; 'mặt tiền Nguyễn Trãi' → mặt tiền",
    kt("nhà mặt tiền đường 8m", "loai_duong_vao", "mat_tien", "nhà mặt tiền đường 8m") && kt("nhà mặt tiền đường 8m", "do_rong_duong", "8", "mặt tiền đường 8m") && kt("bán nhà mặt tiền Nguyễn Trãi", "loai_duong_vao", "mat_tien", "mặt tiền Nguyễn Trãi"));
  ok("ZZZP-06 chỉ có số ('4m', trả lời câu bot hỏi) → không bị chặn ô nào", kt("4m", "do_rong_hem", "4", "4m") && kt("4m", "ngang", "4", "4m") && kt("4m", "do_rong_duong", "4", "4m"));
  ok("ZZZP-07 (cách nói MỚI) 'MT 5m', '4x16' là ngang; 'hẻm 5m đường Phan Xích Long' vẫn là hẻm", kt("MT 5m nở hậu 6m", "ngang", "5", "MT 5m") && kt("4x16", "ngang", "4", "4x16") && kt("hẻm 5m đường Phan Xích Long", "do_rong_hem", "5", "hẻm 5m đường Phan Xích Long"));
  ok("ZZZP-08 chuDeSoDo: 'lô đất ngang 5m' không bị coi là đường", !chuDeSoDo("lo dat ngang 5m").duong && chuDeSoDo("lo dat ngang 5m").ngang);
}
// ── SRS-5.1zzzt (08/10/2026, bắn thử …kc1tatt "dang di"): hai lượt AI đọc cùng tin ra hai ý ngược nhau → hỏi lại.
{
  const dang = { la: "dong_y", dangDi: true }, gat = { la: "dong_y", dangDi: false }, khong = { la: "khong_dong_y", dangDi: false };
  ok("ZZZT-01 'dang di': ý lượt = bảo đăng, bóc tách = hoãn → lệch [dang, hoan]", JSON.stringify(yLuotLech(dang, { loai: "hoan" })) === '["dang","hoan"]');
  ok("ZZZT-02 (cách nói MỚI) 'thoi dang di' kiểu: bảo đăng ↔ ngưng rao / bán rồi → lệch", !!yLuotLech(dang, { loai: "ngung_rao" }) && !!yLuotLech(dang, { loai: "ban_roi" }));
  ok("ZZZT-03 bóc tách 'du_roi' ↔ ý lượt 'không đồng ý' → lệch [dang, khong_dang]", JSON.stringify(yLuotLech(khong, { loai: "du_roi" })) === '["dang","khong_dang"]');
  ok("ZZZT-04 hai lượt cùng ý (bảo đăng + du_roi; gật + bán rồi) → KHÔNG lệch", yLuotLech(dang, { loai: "du_roi" }) === null && yLuotLech(gat, { loai: "ban_roi" }) === null);
  ok("ZZZT-05 một lượt không chạy / không có ý → không lệch", yLuotLech(undefined, { loai: "hoan" }) === null && yLuotLech(dang, null) === null);
  ok("ZZZT-06 (bắn thử …kf1tatt) gật và hoãn trích CÙNG cụm 'dang di' → lệch [gat, hoan]",
    JSON.stringify(yLuotLech({ la: "dong_y", dangDi: false, trich: "dang di" }, { loai: "hoan", trich: "dang di" })) === '["gat","hoan"]');
  ok("ZZZT-07 (cách nói MỚI) 'ok em, để mai anh nói tiếp': gật ở 'ok em', hoãn ở 'để mai…' → KHÔNG lệch",
    yLuotLech({ la: "dong_y", dangDi: false, trich: "ok em" }, { loai: "hoan", trich: "để mai anh nói tiếp" }) === null);
  ok("ZZZV-01 (chủ dự án chat thử …hua2) ý thêm 'chợ quán' trùng phường đã ghi 'Phường Chợ Quán' → bỏ",
    kiemKienThuc(["chợ quán"], "chợ quán e", [], ["Phường Chợ Quán"]).length === 0);
  ok("ZZZV-02 (cách nói MỚI) ý thêm 'gần chợ Bến Thành' không trùng gì đã ghi → giữ; 'đang ở' vẫn giữ",
    kiemKienThuc(["gần chợ Bến Thành", "đang ở"], "nhà gần chợ Bến Thành, đang ở", [], ["Phường Bến Thành", "sổ hồng riêng"]).length === 2);
}
// ── 09/10/2026 bắn production (SRS-5.1zzzzc / zzzzd / zzzzi). Chạy cả kiểm đủ lẫn kiểm nhẹ (production). ──
{
  const { viTriGhiDuoc, phuongTuSoCu, phuongNhacTrongCau } = await import("../supabase/functions/_shared/extraction/khop-phuong.ts");
  const cu = laKiemNheTest();
  for (const nhe of [false, true]) {
    datKiemNhe(nhe);
    const m = nhe ? "nhẹ" : "đủ";
    const pn = kiemDeXuat([{ khoa: "phuong", gia_tri: "Phường Phú Nhuận", trich_dan: "phường 13" }], "nhà ở lê văn sỹ phường 13 phú nhuận");
    ok(`ZZZZC-01 (${m}, thu-kg2) «phường 13» + 'phú nhuận' trong tin → Phường Phú Nhuận ĐẠT (bảng phường cũ)`, pn.dat.length === 1, JSON.stringify(pn));
    const pnQ = kiemDeXuat([{ khoa: "phuong", gia_tri: "Phường Phú Nhuận", trich_dan: "phường 13" }], "phường 13 nha em", { quan: "Quận Phú Nhuận" });
    ok(`ZZZZC-02 (${m}) chỉ «phường 13», quận tin đã biết Phú Nhuận (ngữ cảnh nơi gọi) → ĐẠT`, pnQ.dat.length === 1, JSON.stringify(pnQ));
    const pnK = kiemDeXuat([{ khoa: "phuong", gia_tri: "Phường Phú Nhuận", trich_dan: "phường 13" }], "phường 13 nha em");
    ok(`ZZZZC-03 (${m}) «phường 13» không quận nào → vẫn BỎ (không đoán)`, pnK.bo[0]?.ly_do === "phuong_khong_khop_trich_dan", JSON.stringify(pnK));
    const nl = kiemDeXuat([{ khoa: "phuong", gia_tri: "Phường Nhiêu Lộc", trich_dan: "phường 12 quận 3" }], "nhà chị hẻm 5m trần quốc thảo phường 12 quận 3 cũ");
    ok(`ZZZZC-04 (${m}, cách nói MỚI) «phường 12 quận 3» → Phường Nhiêu Lộc ĐẠT`, nl.dat.length === 1, JSON.stringify(nl));
    const bc = kiemDeXuat([{ khoa: "phuong", gia_tri: "Phường Bàn Cờ", trich_dan: "phường 12 quận 3" }], "nhà chị hẻm 5m trần quốc thảo phường 12 quận 3 cũ");
    ok(`ZZZZC-05 (${m}) «phường 12 quận 3» mà AI ghi Bàn Cờ (sai bảng) → BỎ`, bc.bo[0]?.ly_do === "phuong_khong_khop_trich_dan", JSON.stringify(bc));
    const dc = kiemDeXuat([{ khoa: "duong", gia_tri: "Củ Chi xã Tân An Hội", trich_dan: "10x50 củ chi xã tân an hội" },
      { khoa: "ten_duong", gia_tri: "Củ Chi xã Tân An Hội", trich_dan: "củ chi xã tân an hội" }], "đất 10x50 củ chi xã tân an hội giấy tay");
    ok(`ZZZZD-01 (${m}, thu-kg5) duong / ten_duong chỉ là kích thước + tên hành chính → BỎ cả hai`,
      dc.dat.length === 0 && dc.bo.every((b) => b.ly_do === "dia_chi_chi_la_hanh_chinh"), JSON.stringify(dc));
    const dg = kiemDeXuat([{ khoa: "ten_duong", gia_tri: "Tân Sơn Nhì", trich_dan: "đường tân sơn nhì" }], "nhà mặt tiền đường tân sơn nhì tân phú");
    ok(`ZZZZD-02 (${m}) đường trùng tên phường nhưng trích có chữ 'đường' → vẫn ĐẠT`, dg.dat.length === 1, JSON.stringify(dg));
    const mt = kiemDeXuat([{ khoa: "loai_duong_vao", gia_tri: "mat_tien", trich_dan: "MT" }], "Bán nhà MT Nguyễn Trãi Q5, 5x20, 4 tầng thang máy");
    ok(`ZZZZI-01 (${m}, thu-kg3) «MT» → loai_duong_vao mat_tien ĐẠT`, mt.dat.length === 1, JSON.stringify(mt));
    const mtkd = kiemDeXuat([{ khoa: "loai_duong_vao", gia_tri: "mat_tien", trich_dan: "MTKD" }], "Bán nhà MTKD Hai Bà Trưng Q1, 4x18, 5 tầng, 25 tỷ");
    ok(`ZZZZI-02 (${m}, cách nói MỚI) «MTKD» → mat_tien ĐẠT`, mtkd.dat.length === 1, JSON.stringify(mtkd));
    const mt5 = kiemDeXuat([{ khoa: "loai_duong_vao", gia_tri: "mat_tien", trich_dan: "MT 5m" }], "nhà MT 5m dài 20m");
    ok(`ZZZZI-03 (${m}) «MT 5m» (số đo ngay sau) vẫn là chiều ngang → BỎ`, mt5.bo[0]?.ly_do === "mat_tien_kem_so_la_chieu_ngang", JSON.stringify(mt5));
  }
  datKiemNhe(cu);
  ok("ZZZZC-06 phuongTuSoCu: (13, Quận Phú Nhuận) → Phú Nhuận; (15, Phú Nhuận) chia hai phường không 'toàn bộ' → null",
    phuongTuSoCu(13, "Quận Phú Nhuận")?.ten === "Phú Nhuận" && phuongTuSoCu(15, "phú nhuận") === null, JSON.stringify([phuongTuSoCu(13, "Quận Phú Nhuận"), phuongTuSoCu(15, "phú nhuận")]));
  ok("ZZZZC-07 lưới đỡ khi AI im: 'phường 13 phú nhuận' → Phú Nhuận; 'p4 q5' → Chợ Quán; 'phường 13' + quận tin Phú Nhuận → Phú Nhuận",
    phuongNhacTrongCau("nhà ở lê văn sỹ phường 13 phú nhuận")?.ten === "Phú Nhuận" && phuongNhacTrongCau("p4 q5")?.ten === "Chợ Quán" &&
      phuongNhacTrongCau("phường 13", "Quận Phú Nhuận")?.ten === "Phú Nhuận");
  ok("ZZZZD-03 viTriGhiDuoc: kích thước / hành chính → null; địa chỉ thật giữ, bỏ kích thước",
    viTriGhiDuoc("10x50 Củ Chi xã Tân An Hội") === null && viTriGhiDuoc("lô đất 8x40 xã Phước Vĩnh An huyện Củ Chi") === null &&
      viTriGhiDuoc("Xã Tân An Hội") === null && viTriGhiDuoc("120m2") === null &&
      viTriGhiDuoc("hẻm 45 Nguyễn Trãi") === "hẻm 45 Nguyễn Trãi" && viTriGhiDuoc("137/28 đường số 59") === "137/28 đường số 59" &&
      viTriGhiDuoc("Trần Hưng Đạo 4x16") === "Trần Hưng Đạo" && viTriGhiDuoc("Lò Gốm") === "Lò Gốm");
  const ac = docAiChinh(kiemDeXuat([{ khoa: "duong", gia_tri: "10x50 Củ Chi xã Tân An Hội", trich_dan: "10x50 củ chi xã tân an hội" }], "đất 10x50 củ chi xã tân an hội").dat, null);
  ok("ZZZZD-04 docAiChinh: AI đưa cụm kích thước + hành chính vào duong → KHÔNG ghi vi_tri, không tên đường", !ac.duong && !ac.tenDuong && !ac.ghi.some((g) => g.question === "vi_tri"), JSON.stringify(ac));
}
// SRS-5.1zzzzu: trích dẫn loại / ý giao dịch ở tin chủ nhà TRƯỚC được nhận (ô trống do nơi gọi quyết); khoá khác vẫn chỉ soi tin này.
{
  const ds = [{ khoa: "loai_bds", gia_tri: "dat", trich_dan: "mieng dat" }, { khoa: "gia", gia_tri: "5 tỷ", trich_dan: "5 ty" }, { khoa: "dien_tich", gia_tri: "100", trich_dan: "5x20" }];
  const k = kiemYCuocRao(ds, "5x20 tho cu het", "e co mieng dat can ban 5 ty");
  ok("ZZZZU-U1 «mieng dat» ở tin trước → loai_bds ĐẠT; «5 ty» (khoá giá) chỉ ở tin trước → vẫn BỎ; «5x20» tin này ĐẠT",
    k.dat.some((d) => d.khoa === "loai_bds") && !k.dat.some((d) => d.khoa === "gia") && k.dat.some((d) => d.khoa === "dien_tich"), JSON.stringify(k));
  const k2 = kiemYCuocRao([{ khoa: "loai_bds", gia_tri: "nha_pho", trich_dan: "nha pho" }], "5x20 tho cu het", "e co mieng dat can ban");
  ok("ZZZZU-U2 trích dẫn không có ở tin nào → BỎ", k2.dat.length === 0 && k2.bo.length === 1, JSON.stringify(k2));
  const k3 = kiemYCuocRao([{ khoa: "loai_bds", gia_tri: "dat", trich_dan: "mieng dat" }], "5x20 tho cu het", "");
  ok("ZZZZU-U3 không có tin cũ → như kiemDeXuat (BỎ)", k3.dat.length === 0, JSON.stringify(k3));
}
// SRS-5.1zzzzy (khách mô phỏng 11/10): chuyện riêng / nhận định giá model xếp `ke_rieng` không lên dòng "Thêm"; so CÙNG Ý theo từ.
{
  const { boKeRieng } = await import("../supabase/functions/_shared/extraction/kiem-bang-chung.ts");
  const { trungY } = await import("../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts");
  const k1 = boKeRieng(["con chị bây giờ ở Úc", "sẽ tăng giá lắm", "gần chợ Phú Nhuận"], ["con chị ở Úc", "căn này sẽ tăng giá"]);
  ok("ZZZZY-K1 (ca gốc) kien_thuc 'con chị bây giờ ở Úc', 'sẽ tăng giá lắm' trùng ý ke_rieng → bỏ, 'gần chợ Phú Nhuận' giữ",
    k1.length === 1 && k1[0] === "gần chợ Phú Nhuận", JSON.stringify(k1));
  const k2 = boKeRieng(["con cái đi làm xa hết nên bán", "hẻm thông"], ["con cai di lam xa"]);
  ok("ZZZZY-K2 (cách nói mới, không dấu) 'con cai di lam xa' bỏ 'con cái đi làm xa hết nên bán'", k2.length === 1 && k2[0] === "hẻm thông", JSON.stringify(k2));
  ok("ZZZZY-K3 đối chứng: trungY không nhận hai ý khác nhau chung một từ ('gần chợ' ↔ 'gần trường')", !trungY("gần chợ", "gần trường"));
  ok("ZZZZY-K4 trungY: cụm một từ khớp đúng từ đó ('Úc' ↔ 'con ở Úc')", trungY("Úc", "con chị ở Úc"));
  const { tachKeRieng } = await import("../supabase/functions/_shared/extraction/kiem-bang-chung.ts");
  const t5 = tachKeRieng(["gần chợ", "riêng: con chị ở Úc", "Riêng:sẽ tăng giá"]);
  ok("ZZZZY-K5 tachKeRieng: tiền tố 'riêng:' (hoa / thường, có / không cách) tách ra, ý căn nhà giữ", t5.canNha.join() === "gần chợ" && t5.rieng.join("|") === "con chị ở Úc|sẽ tăng giá", JSON.stringify(t5));
}
// SRS-5.1zzzzz (khách mô phỏng 11/10): ô đếm không nhận KHOẢNG; xưng hô đầu cụm ô mô tả bị gọt; "không biết" phải có trích dẫn trong tin.
{
  const { docKhongBiet, khongBietCua } = await import("../supabase/functions/_shared/extraction/kiem-bang-chung.ts");
  for (const nhe of [false, true]) {
    datKiemNhe(nhe);
    const t1 = "Dạ, con chị nó nói có thể chia được khoảng 4-5 phòng để cho thuê";
    const k1 = kiemDeXuat([{ khoa: "so_phong_ngu", gia_tri: "4-5", trich_dan: "chia được khoảng 4-5 phòng để cho thuê", can: null }], t1);
    ok(`ZZZZZ-K1${nhe ? " (kiểm nhẹ)" : ""} (ca gốc) so_phong_ngu '4-5' (chia phòng cho thuê) → bỏ`, k1.dat.length === 0, JSON.stringify(k1));
    const t2 = "nhà chắc tầm 3 hoặc 4 phòng ngủ gì đó em";
    const k2 = kiemDeXuat([{ khoa: "so_phong_ngu", gia_tri: "3 hoặc 4", trich_dan: "3 hoặc 4 phòng ngủ", can: null }], t2);
    ok(`ZZZZZ-K2${nhe ? " (kiểm nhẹ)" : ""} (cách nói mới) '3 hoặc 4 phòng ngủ' → bỏ`, k2.dat.length === 0, JSON.stringify(k2));
    const k3 = kiemDeXuat([{ khoa: "so_phong_ngu", gia_tri: "3", trich_dan: "3 phòng ngủ", can: null }], "nhà có 3 phòng ngủ em");
    ok(`ZZZZZ-K3${nhe ? " (kiểm nhẹ)" : ""} đối chứng '3 phòng ngủ' → giữ`, k3.dat.length === 1, JSON.stringify(k3));
  }
  datKiemNhe(false);
  const g1 = giaTriNguyenVan("hien_trang_su_dung", { khoa: "hien_trang_su_dung", gia_tri: "cũ, còn sử dụng được", trich_dan: "nhà bác cũ rồi nhưng còn sử dụng được", cum_goc: "nhà bác cũ rồi nhưng còn sử dụng được" });
  ok("ZZZZZ-K4 (ca gốc) hiện trạng 'nhà bác cũ rồi nhưng còn sử dụng được' → không còn chữ 'bác'", !!g1 && !/bác/.test(g1) && /cũ rồi/.test(g1), String(g1));
  const g2 = giaTriNguyenVan("phap_ly", { khoa: "phap_ly", gia_tri: "sổ hồng riêng", trich_dan: "chú có sổ hồng riêng", cum_goc: "chú có sổ hồng riêng" });
  ok("ZZZZZ-K5 (cách nói mới) pháp lý 'chú có sổ hồng riêng' → không còn 'chú'", !!g2 && !/^chú/i.test(g2), String(g2));
  const g3 = giaTriNguyenVan("vi_tri", { khoa: "vi_tri", gia_tri: "Cô Giang", trich_dan: "đường Cô Giang", cum_goc: "đường Cô Giang" });
  ok("ZZZZZ-K6 đối chứng địa chỉ 'đường Cô Giang' giữ nguyên chữ 'Cô'", /Cô Giang/.test(g3 ?? ""), String(g3));
  ok("ZZZZZ-K7 docKhongBiet: cụm có trong tin → nhận; cụm bịa → null",
    docKhongBiet("ko biết cụ thể đường", "ko biết cụ thể đường, chỉ biết xã thôi") === "ko biết cụ thể đường" && docKhongBiet("không nhớ số nhà", "ko biết cụ thể đường") === null);
  ok("ZZZZZ-K8 khongBietCua đọc boc_tach.khong_biet, rỗng khi không có", khongBietCua({ khong_biet: ["phuong", 3] }).join() === "phuong" && khongBietCua(null).length === 0);
}
// SRS-5.1zzzzzb: AI ghi dien_tich dạng ngang × dài ("4 x 16") — đọc là kích thước, không đọc số đầu làm m².
{
  const d1 = docAiChinh([{ khoa: "dien_tich", gia_tri: "4 x 16", trich_dan: "4 mét x 16 mét", can: null }], null);
  ok("ZZZZZB-K1 (ca gốc) dien_tich '4 x 16' → ghi '4x16' (không bỏ 'số ngoài khoảng')", d1.ghi.some((g) => g.question === "dien_tich" && g.answer === "4x16") && !d1.bo.length, JSON.stringify(d1));
  const d2 = docAiChinh([{ khoa: "dien_tich", gia_tri: "5m x 20m", trich_dan: "5m x 20m", can: null }], null);
  ok("ZZZZZB-K2 (cách viết mới) '5m x 20m' → '5x20'", d2.ghi.some((g) => g.answer === "5x20"), JSON.stringify(d2));
  const d3 = docAiChinh([{ khoa: "dien_tich", gia_tri: "60", trich_dan: "60m2", can: null }], null);
  ok("ZZZZZB-K3 đối chứng '60' → '60m2' như cũ", d3.ghi.some((g) => g.answer === "60m2"), JSON.stringify(d3));
}
// SRS-5.1zzzzzc (khách mô phỏng lần năm): lời "không biết" không phải giá trị; giá trị phải đúng loại ô; số suy ra rõ ràng có bằng chứng;
// "hẻm ngang N" là chiều ngang căn; xưng hô giữa cụm nguyên văn; quận chung của lô trích từ tin trước.
{
  const kbc = await import("../supabase/functions/_shared/extraction/kiem-bang-chung.ts");
  const tl = (gia_tri, trich_dan, tin, cauHoi) => kiemTraLoiCau({ co_tra_loi: true, gia_tri, trich_dan }, tin, null, { cauHoi, loai: "dat" });
  // SRS-5.1zzzzzd: gỡ luật từ khoá "không biết" / "thổ cư phải có số" (đoán nghĩa). Bộ kiểm chỉ còn soát trích dẫn có trong tin; lời
  // "không biết" do AI đọc (`khong_biet`, chat-reply cho nó thắng — e2e ZZZZZC-01/02), ô thổ cư theo luật bóc tách.
  ok("ZZZZZD-K1 luật từ khoá 'không biết' đã gỡ khỏi bộ kiểm", !("laLoiKhongBiet" in kbc));
  ok("ZZZZZD-K2 trích dẫn có trong tin → bộ kiểm không phán nghĩa (giá trị đi qua, AI chịu trách nhiệm)", tl("được", "được", "được, lên thổ cư được", "tho_cu")?.giaTri === "được");
  ok("ZZZZZD-K3 trích dẫn KHÔNG có trong tin → vẫn bỏ", tl("toàn thổ cư", "toàn thổ cư", "uh ko biết cái đó", "tho_cu")?.giaTri == null);
  const pn = kiemDeXuat([{ khoa: "so_phong_ngu", gia_tri: "4", trich_dan: "3 phòng ngủ ở lầu với 1 phòng ở trệt" }], "mà nhà chị có 3 phòng ngủ ở lầu với 1 phòng ở trệt nữa");
  ok("ZZZZZC-K4 (ca gốc) 'có 3 phòng ngủ ở lầu với 1 phòng ở trệt' → so_phong_ngu 4 (tổng) đạt", pn.dat.some((d) => d.khoa === "so_phong_ngu"), JSON.stringify(pn.bo));
  const pn2 = kiemDeXuat([{ khoa: "so_phong_ngu", gia_tri: "5", trich_dan: "3 phòng ngủ ở lầu với 1 phòng ở trệt" }], "mà nhà chị có 3 phòng ngủ ở lầu với 1 phòng ở trệt nữa");
  ok("ZZZZZC-K5 đối chứng: số không phải tổng (5) → vẫn bỏ", !pn2.dat.length);
  // Production chạy kiểm NHẸ (chế độ `ai`) — các ca dưới soi đúng lớp đó.
  datKiemNhe(true);
  const kc = kiemDeXuat([{ khoa: "ket_cau", gia_tri: "trệt + 1 lầu", trich_dan: "trệt lầu" }, { khoa: "so_tang", gia_tri: "2", trich_dan: "trệt lầu" }], "phường 3 cháu, sổ hồng bác có rồi, nhà 4x16 trệt lầu, đẹp lắm");
  const h = kiemDeXuat([{ khoa: "do_rong_hem", gia_tri: "2", trich_dan: "Hẻm ngang khoảng 2m" }], "Hẻm ngang khoảng 2m thôi em, xe máy vào được");
  const h2 = kiemDeXuat([{ khoa: "do_rong_hem", gia_tri: "4", trich_dan: "hẻm rộng 4m" }], "hẻm rộng 4m, ngang 5 dài 18");
  datKiemNhe(false);
  ok("ZZZZZC-K6 (ca gốc) 'nhà 4x16 trệt lầu' → kết cấu 'trệt + 1 lầu' và số tầng 2 đạt", kc.dat.length === 2, JSON.stringify(kc.bo));
  // SRS-5.1zzzzzd: luật "cụm có chữ ngang thì không phải bề rộng hẻm" (5.1zzzzzc) đã gỡ — nó bỏ luôn câu đúng ở khách mô phỏng lần sáu.
  ok("ZZZZZD-K7 (ca gốc lần sáu) «Hẻm ngang khoảng 2m» → độ rộng hẻm 2 đạt", h.dat.length === 1, JSON.stringify(h));
  ok("ZZZZZC-K8 đối chứng «hẻm rộng 4m» → vẫn là độ rộng hẻm", h2.dat.length === 1, JSON.stringify(h2));
  // SRS-5.1zzzzzd: gỡ luật cắt xưng hô GIỮA cụm — cụm gọn do AI trích (luật bóc tách dặn); code chỉ gọt chữ đệm đầu cụm.
  const nv1 = giaTriNguyenVan("phap_ly", { khoa: "phap_ly", gia_tri: "sổ hồng riêng", trich_dan: "sổ hồng", cum_goc: "sổ hồng" });
  const nv3 = giaTriNguyenVan("hien_trang_su_dung", { khoa: "hien_trang_su_dung", gia_tri: "đang ở", trich_dan: "nhà anh đang ở", cum_goc: "nhà anh đang ở" });
  ok("ZZZZZD-K9 nguyên văn: cụm AI trích gọn 'sổ hồng' giữ nguyên; 'nhà anh đang ở' không bị cắt cụt", nv1 === "sổ hồng" && /đang ở/.test(nv3 ?? ""), JSON.stringify({ nv1, nv3 }));
  const q = kiemYCuocRao([{ khoa: "quan", gia_tri: "Quận 5", trich_dan: "quận 5" }], "căn thứ 2 hẻm Nguyễn Trãi 3x12 2 tầng 6 tỷ 5 bạn", "chào bạn, mình bên môi giới, có mấy căn quận 5 cần đăng", {}, ["quan"]);
  ok("ZZZZZC-K10 (ca gốc) căn thứ 2 của môi giới: quận chung «quận 5» ở tin trước → nhận khi khoá cho phép là quan", q.dat.some((d) => d.khoa === "quan"), JSON.stringify(q));
  const q2 = kiemYCuocRao([{ khoa: "gia", gia_tri: "18 tỷ", trich_dan: "18 tỷ" }], "căn thứ 2 hẻm Nguyễn Trãi", "1 căn mt Trần Hưng Đạo giá 18 tỷ", {}, ["quan"]);
  ok("ZZZZZC-K11 đối chứng: GIÁ của căn trước không được trích sang căn thêm", !q2.dat.length, JSON.stringify(q2));
}
// SRS-5.1zzzzze (khách mô phỏng lần bảy, ca phát lại `bot/tests/phat-lai/ca/`): luật bóc tách cho AI tính diện tích = ngang × dài, kiểm số
// phải nhận tích đó; cụm trích CHUNG của nhiều căn không định vị căn nào.
{
  for (const nhe of [false, true]) {
    datKiemNhe(nhe);
    const e1 = kiemDeXuat([{ khoa: "dien_tich", gia_tri: "64", trich_dan: "4 mét rộng 16 mét sâu" }], "nhà chú 4 mét rộng 16 mét sâu cháu ạ");
    ok(`ZZZZZE-K1${nhe ? " (kiểm nhẹ)" : ""} (ca gốc) dien_tich 64 trích «4 mét rộng 16 mét sâu» → nhận (tích ngang × dài)`, e1.dat.length === 1, JSON.stringify(e1));
    const e2 = kiemDeXuat([{ khoa: "dien_tich", gia_tri: "60", trich_dan: "ngang 5 dài 12" }], "đất ngang 5 dài 12 sổ riêng");
    ok(`ZZZZZE-K2${nhe ? " (kiểm nhẹ)" : ""} (cách nói mới) dien_tich 60 trích «ngang 5 dài 12» → nhận`, e2.dat.length === 1, JSON.stringify(e2));
    const e3 = kiemDeXuat([{ khoa: "dien_tich", gia_tri: "70", trich_dan: "4x16" }], "nhà cháu 4x16 trệt 2 lầu");
    ok(`ZZZZZE-K3${nhe ? " (kiểm nhẹ)" : ""} đối chứng dien_tich 70 trích «4x16» (không phải tích) → bỏ`, e3.dat.length === 0, JSON.stringify(e3));
  }
  datKiemNhe(false);
  const T = (khoa, gia_tri, trich_dan, can) => ({ khoa, gia_tri, trich_dan, can });
  for (const [ma, tin, chungTd] of [
    ["K4 (ca gốc)", "Còn 2 căn nữa em muốn đăng luôn, hẻm Nguyễn Trãi 3x12 2 tầng 6 tỷ 5, và hẻm An Dương Vương 4x10 cấp 4 5 tỷ", "em muốn đăng luôn"],
    ["K5 (cách nói mới)", "hai căn này đều sổ riêng: một căn hẻm Nguyễn Trãi 3x12 6 tỷ 5, một căn hẻm An Dương Vương 4x10 5 tỷ", "sổ riêng"],
  ]) {
    const dat = [T("ghi_chu", chungTd, chungTd, 2), T("duong", "hẻm Nguyễn Trãi", "hẻm Nguyễn Trãi", 2), T("ngang", "3", "3x12", 2), T("gia", "6 tỷ 5", "6 tỷ 5", 2),
      T("ghi_chu", chungTd, chungTd, 3), T("duong", "hẻm An Dương Vương", "hẻm An Dương Vương", 3), T("ngang", "4", "4x10", 3), T("gia", "5 tỷ", "5 tỷ", 3)];
    const c = canTheoAi(tin, dat, 2);
    ok(`ZZZZZE-${ma} cụm «${chungTd}» AI gán cho cả hai căn → vẫn chia 2 căn, mỗi căn đúng giá`,
      c.length === 2 && c[0].gia === "6 tỷ 5" && c[1].gia === "5 tỷ" && /Nguyễn Trãi/.test(c[0].goc) && /An Dương Vương/.test(c[1].goc) && !/An Dương Vương/.test(c[0].goc), JSON.stringify(c));
  }
}
// SRS-5.1zzzzzf: dài nói riêng → fact chieu_dai; tên đường theo chữ khách.
{
  const a1 = docAiChinh([{ khoa: "dai", gia_tri: "16", trich_dan: "chiều sâu thì 16 mét", can: null }], { property_type: "nha_pho", deal: "ban" });
  ok("ZZZZZF-K1 (ca gốc) chỉ có dài 16 → ghi chieu_dai 'dài 16m', không còn 'bỏ: không có chỗ ghi'",
    a1.ghi.some((g) => g.question === "chieu_dai" && g.answer === "dài 16m") && !a1.bo.some((b) => b.khoa === "dai"), JSON.stringify(a1));
  const a2 = docAiChinh([{ khoa: "ngang", gia_tri: "4", trich_dan: "4x16", can: null }, { khoa: "dai", gia_tri: "16", trich_dan: "4x16", can: null }], { property_type: "nha_pho", deal: "ban" });
  ok("ZZZZZF-K2 đối chứng ngang + dài → 'dien_tich 4x16', không chieu_dai, dài không nằm trong 'bỏ'",
    a2.ghi.some((g) => g.question === "dien_tich" && g.answer === "4x16") && !a2.ghi.some((g) => g.question === "chieu_dai") && !a2.bo.some((b) => b.khoa === "dai"), JSON.stringify(a2));
  const t1 = docAiChinh([{ khoa: "ten_duong", gia_tri: "Phạm Xích Long", trich_dan: "hẻm Phan Xích Long", can: null }], null);
  const t2 = docAiChinh([{ khoa: "ten_duong", gia_tri: "Lê Văn Sĩ", trich_dan: "đường Lê Văn Sỹ", can: null }], null);
  const t3 = docAiChinh([{ khoa: "ten_duong", gia_tri: "Nguyễn Trãi", trich_dan: "hem nguyen trai", can: null }], null);
  ok("ZZZZZF-K3 tên đường AI viết khác chữ khách → lấy chữ khách ('Phan Xích Long', 'Lê Văn Sỹ'); khách gõ không dấu, AI thêm dấu → giữ bản AI",
    t1.tenDuong === "Phan Xích Long" && t2.tenDuong === "Lê Văn Sỹ" && t3.tenDuong === "Nguyễn Trãi", JSON.stringify([t1.tenDuong, t2.tenDuong, t3.tenDuong]));
}
// ── SRS-5.1zzzzzg (test Zalo 12/10): số của ô số đo mét phải là SỐ ĐO; "N tầng có lửng" không phải câu đáp "có, tính cả lửng". ──
{
  const { soDoMet } = await import("../supabase/functions/_shared/extraction/kiem-bang-chung.ts");
  const { lungChuaRoDem } = await import("../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts");
  const so = (v) => soDoMet(v)?.[0] ?? null;
  ok("ZZZZZG-K1 (ca gốc) 'nhà mặt tiền …, đường lớn 2 chiều' không có số đo", so("nhà mặt tiền đường Trương Đình Hội, đường lớn 2 chiều") === null, String(so("nhà mặt tiền đường Trương Đình Hội, đường lớn 2 chiều")));
  ok("ZZZZZG-K1b (cách nói mới) 'đường 2 làn xe', '3 xe máy tránh nhau' không có số đo", so("đường 2 làn xe") === null && so("hẻm 3 xe máy tránh nhau") === null, "");
  ok("ZZZZZG-K1c (đối chứng) '4m', 'hẻm 3m5', '5 mét', '6', 'rộng 4 m' là số đo",
    so("4m") === "4" && so("hẻm 3m5") === "3.5" && so("5 mét") === "5" && so("6") === "6" && so("rộng 4 m") === "4", JSON.stringify(["4m", "hẻm 3m5", "5 mét", "6", "rộng 4 m"].map(so)));
  datKiemNhe(true);
  const tinG = "mặt tiền là đường trương đình hội, đường lớn 2 chiều em rộng thoải mái";
  const kq = kiemDeXuat([{ khoa: "do_rong_hem", gia_tri: "nhà mặt tiền đường Trương Đình Hội, đường lớn 2 chiều", trich_dan: "mặt tiền là đường trương đình hội, đường lớn 2 chiều" }], tinG);
  ok("ZZZZZG-K2 AI đặt chữ không số đo vào do_rong_hem → bỏ", kq.dat.length === 0, JSON.stringify(kq));
  const kq2 = kiemDeXuat([{ khoa: "do_rong_hem", gia_tri: "hẻm 3 xe máy tránh nhau", trich_dan: "hẻm 3 xe máy tránh nhau" }], "hẻm 3 xe máy tránh nhau thoải mái anh");
  ok("ZZZZZG-K2b (cách nói mới) cụm nói hẻm nhưng '3' là số xe, không phải mét → bỏ", kq2.dat.length === 0, JSON.stringify(kq2));
  const tinL = "3 tầng có lửng em ơi";
  const kqL = kiemDeXuat([{ khoa: "ket_cau", gia_tri: "trệt + lửng + 1 lầu", trich_dan: "3 tầng có lửng" }], tinL);
  ok("ZZZZZG-K3 (ca gốc) '3 tầng có lửng' → không đổi thành 'trệt + lửng + 1 lầu'", !kqL.dat.some((d) => d.gia_tri === "trệt + lửng + 1 lầu"), JSON.stringify(kqL.dat));
  const kqT = kiemDeXuat([{ khoa: "ket_cau", gia_tri: "4 tầng tính cả lửng", trich_dan: "4 tầng tính cả lửng" }], "nhà 4 tầng tính cả lửng nha");
  ok("ZZZZZG-K3b (đối chứng) '4 tầng tính cả lửng' vẫn ra 'trệt + lửng + 2 lầu'", kqT.dat.some((d) => d.gia_tri === "trệt + lửng + 2 lầu"), JSON.stringify(kqT.dat));
  datKiemNhe(false);
  ok("ZZZZZG-K4 lungChuaRoDem: '3 tầng có lửng', 'nhà 4 tấm có gác lửng' mơ hồ; 'tính cả lửng', 'lửng thêm nữa', 'không có lửng' rõ",
    lungChuaRoDem("3 tầng có lửng")?.n === 3 && lungChuaRoDem("nhà 4 tấm có gác lửng")?.n === 4 &&
      !lungChuaRoDem("4 tầng tính cả lửng") && !lungChuaRoDem("3 tầng, có lửng thêm nữa") && !lungChuaRoDem("không có gác lửng, 4 tầng"), "");
}
// SRS-5.1zzzzzh (bắn production 12/10, thu-kb-dat): "đường trước đất rộng 6m xe tải vô được" → do_rong_duong 6 + loai_duong_vao hem_xe_tai cùng
// lượt — bề rộng của ĐƯỜNG, loại nói HẺM, khách không nhắc hẻm → bỏ loại hẻm. Cách nói mới: "lộ giới 8m, container vào tận nơi". Đối chứng: "hẻm 6m".
{
  const T = (k, g, t) => ({ khoa: k, gia_tri: g, trich_dan: t, can: null });
  const a = kiemDeXuat([T("do_rong_duong", "6", "đường trước đất rộng 6m"), T("loai_duong_vao", "hem_xe_tai", "xe tải vô được")], "đường trước đất rộng 6m xe tải vô được");
  ok("ZZZZZH-K1 (ca gốc) đường trước đất 6m + 'xe tải vô được' → không loại hẻm, giữ bề rộng đường",
    !a.dat.some((d) => d.khoa === "loai_duong_vao") && a.dat.some((d) => d.khoa === "do_rong_duong") && a.bo.some((b) => b.ly_do === "duong_truoc_khong_phai_hem"), JSON.stringify(a));
  const b = kiemDeXuat([T("do_rong_duong", "8", "lộ giới 8m"), T("loai_duong_vao", "hem_xe_tai", "container vào tận nơi")], "lộ giới 8m, container vào tận nơi");
  ok("ZZZZZH-K1b (cách nói mới) 'lộ giới 8m, container vào tận nơi' → không loại hẻm", !b.dat.some((d) => d.khoa === "loai_duong_vao"), JSON.stringify(b));
  const c = kiemDeXuat([T("do_rong_hem", "6", "hẻm 6m"), T("loai_duong_vao", "hem_xe_tai", "xe tải vô được")], "hẻm 6m xe tải vô được");
  ok("ZZZZZH-K1c (đối chứng) 'hẻm 6m xe tải vô được' → giữ hem_xe_tai", c.dat.some((d) => d.khoa === "loai_duong_vao" && d.gia_tri === "hem_xe_tai"), JSON.stringify(c));
}
// SRS-5.1zzzzzh (test Zalo 12/10): hỏi pháp lý, "sổ hồng riêng, anh đứng tên" → ô pháp lý ghi cả vế đứng tên (đứng tên CÙNG HỌ pháp lý nhưng là ô
// riêng). Cách nói mới: "sổ đỏ, không thế chấp". Đối chứng: địa chỉ + phường, ngang + dài vẫn ghép một giá trị.
ok("ZZZZZH-K2 (ca gốc) gotManhOKhac pháp lý bỏ vế 'anh đứng tên'", gotManhOKhac("phap_ly", "sổ hồng riêng, anh đứng tên") === "sổ hồng riêng", gotManhOKhac("phap_ly", "sổ hồng riêng, anh đứng tên"));
ok("ZZZZZH-K2b (cách nói mới) pháp lý bỏ vế 'không thế chấp'", gotManhOKhac("phap_ly", "sổ đỏ, không thế chấp") === "sổ đỏ", gotManhOKhac("phap_ly", "sổ đỏ, không thế chấp"));
ok("ZZZZZH-K2c (đối chứng) vị trí giữ phường, diện tích giữ ngang + dài",
  gotManhOKhac("vi_tri", "hẻm 12 Lê Lợi, phường 4") === "hẻm 12 Lê Lợi, phường 4" && gotManhOKhac("dien_tich", "ngang 4, dài 16") === "ngang 4, dài 16", "");
{
  const r = kiemTraLoiCau({ co_tra_loi: true, gia_tri: "sổ hồng riêng, anh đứng tên", trich_dan: "sổ hồng riêng, anh đứng tên" }, "sổ hồng riêng, anh đứng tên",
    "Sổ nhà mình riêng hay chung vậy ạ?", { cauHoi: "phap_ly", loai: "nha_pho" });
  ok("ZZZZZH-K2d câu treo pháp lý → giá trị ghi 'sổ hồng riêng' (không dính đứng tên)", r?.giaTri === "sổ hồng riêng", JSON.stringify(r));
}
// SRS-5.1zzzzzi: cụm trích MỘT chữ là bằng chứng khi đứng riêng thành một từ trong tin; không khớp gần, không khớp giữa từ.
{
  const ca = [["ừ", "ừ", true], ["ờ", "ờ em", true], ["k", "k biết nữa", true], ["5", "5 lầu", true], ["ừ", "chưa", false], ["u", "uống nước", false], ["a", "bán", false], ["", "ừ", false], ["ừ", "", false]];
  for (const [td, tin, mong] of ca) ok(`ZZZZZI-K1 trichCoTrongTin(«${td}», «${tin}») = ${mong}`, trichCoTrongTinT(td, tin) === mong);
  ok("ZZZZZI-K2 docDongY gật «ừ» trích «ừ» → dong_y", docDongYT({ la: "dong_y", trich_dan: "ừ" }, "ừ")?.la === "dong_y");
  ok("ZZZZZI-K2b docDongY trích «ừ» mà tin «chưa» → null", docDongYT({ la: "dong_y", trich_dan: "ừ" }, "chưa") === null);
}
// SRS-5.1zzzzzr (Zalo thật 13/10/2026 04:59Z, nhà Nhà Bè): "Dtsd: 42,8m, 2pn, 1 trệt, 1 lầu." → AI trả `dien_tich` trích "Dtsd: 42,8m" → area_m2
// = 42,8 (đất thật là 3x14 ở lượt sau). Viết tắt diện tích SỬ DỤNG / XÂY DỰNG là ô sàn: kiểm bằng chứng đổi khoá, không bỏ im. Căn hộ thì sàn
// chính là diện tích căn (SRS-5.1zr) nên giữ dien_tich. Cách nói mới: "dtxd 120 m2", "DT SD: 80m".
{
  const a = mot("Dtsd: 42,8m, 2pn, 1 trệt, 1 lầu.", "dien_tich", "42,8", "Dtsd: 42,8m");
  ok("ZZZZZR-K1 (ca gốc) 'Dtsd: 42,8m' → dien_tich_san, KHÔNG dien_tich", a.dat.some((d) => d.khoa === "dien_tich_san") && !a.dat.some((d) => d.khoa === "dien_tich"), JSON.stringify(a));
  const b = mot("nhà 3 lầu dtxd 120 m2", "dien_tich", "120", "dtxd 120 m2");
  ok("ZZZZZR-K1b (cách nói mới) 'dtxd 120 m2' → dien_tich_san", b.dat.some((d) => d.khoa === "dien_tich_san") && !b.dat.some((d) => d.khoa === "dien_tich"), JSON.stringify(b));
  const c = kiemDeXuat([{ khoa: "loai_bds", gia_tri: "chung_cu", trich_dan: "căn hộ" }, { khoa: "dien_tich", gia_tri: "76", trich_dan: "DT SD: 76m" }], "căn hộ DT SD: 76m 2pn");
  ok("ZZZZZR-K1c (đối chứng) căn hộ 'DT SD: 76m' → giữ dien_tich (sàn = diện tích căn)", c.dat.some((d) => d.khoa === "dien_tich" && !c.dat.some((x) => x.khoa === "dien_tich_san")), JSON.stringify(c));
  const d = mot("đất 5x20 100m2", "dien_tich", "100", "100m2");
  ok("ZZZZZR-K1d (đối chứng) '100m2' không chữ sàn → dien_tich như cũ", d.dat.some((x) => x.khoa === "dien_tich"), JSON.stringify(d));
}
// SRS-5.1zzzzzt (Zalo thật 13/10/2026 13:43, nhà cho thuê): "ưu tiên khách thuê lâu dài" → AI ghi thoi_han_su_dung (thời hạn sử dụng ĐẤT)
// vì khớp "lâu dài". Cụm nói về thuê → bỏ; đất "sổ lâu dài" → giữ. Cách nói mới: "cho thuê dài hạn 5 năm".
{
  const a = mot("Điều kiện thuê: cọc 2 tháng, ưu tiên khách thuê lâu dài", "thoi_han_su_dung", "lâu dài", "ưu tiên khách thuê lâu dài");
  ok("ZZZZZT-K1 (ca gốc) 'ưu tiên khách thuê lâu dài' → không ghi thời hạn sử dụng đất", !a.dat.some((d) => d.khoa === "thoi_han_su_dung") && a.bo.some((b) => b.ly_do === "thoi_han_su_dung_khong_phai_thue"), JSON.stringify(a));
  const b = mot("cho thuê dài hạn 5 năm", "thoi_han_su_dung", "5 năm", "cho thuê dài hạn 5 năm");
  ok("ZZZZZT-K1b (cách nói mới) 'cho thuê dài hạn 5 năm' → không ghi thời hạn sử dụng đất", !b.dat.some((d) => d.khoa === "thoi_han_su_dung"), JSON.stringify(b));
  const c = mot("đất thổ cư, sổ lâu dài", "thoi_han_su_dung", "lâu dài", "sổ lâu dài");
  ok("ZZZZZT-K1c (đối chứng) 'sổ lâu dài' của đất → giữ", c.dat.some((d) => d.khoa === "thoi_han_su_dung"), JSON.stringify(c));
}
// SRS-5.1zzzzzu (chủ dự án 13/10: "lầu 1+2 3.5x6.5m dư, thông tin ghi đủ đúng vào trong ô bóc tách thôi"): mảnh chỉ là số đo không vào kiến thức thêm.
{
  const T = "Cho thuê nhà nguyên căn Dương Bá Trạc, trong hẻm làng ốc, hẻm 5m. Diện tích trệt 3m x 5,5m. Lầu 1 + 2 : 3,5m x 6,5m. Gần trung tâm thuận tiện qua các quận 1, 5, 7";
  const kt = kiemKienThuc(["trong hẻm làng ốc", "Lầu 1 + 2 : 3,5m x 6,5m", "Gần trung tâm thuận tiện qua các quận 1, 5, 7"], T, []);
  ok("ZZZZZU-K1 (ca gốc) 'Lầu 1 + 2 : 3,5m x 6,5m' là số đo → không vào kiến thức thêm; hai ý chữ giữ", kt.length === 2 && !kt.some((k) => /3,5m/.test(k)), JSON.stringify(kt));
  ok("ZZZZZU-K1b (cách nói mới) 'sân sau 12m2' là số đo → bỏ", kiemKienThuc(["sân sau 12m2"], "nhà có sân sau 12m2", []).length === 0);
}
// SRS-5.1zzzzzy (Zalo thật 13/10/2026 16:12–16:15, Trương Đình Hội): "hoàn thiện theo ý gia chủ tầm 1,2 tỷ" thành giá, đè 6.950 tỷ; "Tại đường
// Trương Đình Hội" thành kiến thức thêm thay vì địa chỉ. Cách nói mới: "nội thất chủ làm thêm khoảng 800 triệu", "ở hẻm 45 Nguyễn Trãi".
{
  const RAO = "KHU NHÀ PHỐ BIỆT LẬP chỉ 6.950 TỶ. Bên trong hoàn thiện theo ý gia chủ tầm 1,2 tỷ - Trương Đình Hội, MT 20 mét";
  for (const nhe of [false, true]) {
    datKiemNhe(nhe);
    const a = mot(RAO, "gia", "1,2 tỷ", "tầm 1,2 tỷ");
    ok(`ZZZZZY-K1 (ca gốc, kiểm ${nhe ? "nhẹ" : "đủ"}) giá 1,2 tỷ trích "tầm 1,2 tỷ" sau "hoàn thiện theo ý gia chủ" → BỎ (tiền làm thêm)`,
      a.dat.length === 0 && a.bo.some((b) => b.ly_do === "gia_la_chi_phi_lam_them"), JSON.stringify(a));
    const a2 = mot(RAO, "gia", "1,2 tỷ", "hoàn thiện theo ý gia chủ tầm 1,2 tỷ");
    ok(`ZZZZZY-K1b (trích cả vế, kiểm ${nhe ? "nhẹ" : "đủ"}) → bỏ`, a2.dat.length === 0, JSON.stringify(a2));
    const b = mot("bán nhà hẻm Lê Quang Định 7,5 tỷ, nội thất chủ làm thêm khoảng 800 triệu", "gia", "800 triệu", "khoảng 800 triệu");
    ok(`ZZZZZY-K1c (cách nói mới, kiểm ${nhe ? "nhẹ" : "đủ"}) "nội thất chủ làm thêm khoảng 800 triệu" → không phải giá`, b.dat.length === 0, JSON.stringify(b));
    const c = mot(RAO, "gia", "6.950 tỷ", "chỉ 6.950 TỶ");
    ok(`ZZZZZY-K1d (đối chứng, kiểm ${nhe ? "nhẹ" : "đủ"}) giá rao "chỉ 6.950 TỶ" vẫn nhận`, c.dat.length === 1, JSON.stringify(c));
    const d = mot("nhà full nội thất, giá 5 tỷ", "gia", "5 tỷ", "giá 5 tỷ");
    ok(`ZZZZZY-K1e (đối chứng, kiểm ${nhe ? "nhẹ" : "đủ"}) "full nội thất, giá 5 tỷ" có chữ giá chen giữa → nhận`, d.dat.length === 1, JSON.stringify(d));
  }
  datKiemNhe(false);
  // Địa chỉ trong kiến thức thêm → đề xuất duong + ten_duong; kiemKienThuc bỏ.
  const T = "Tại đường Trương Đình Hội";
  ok("ZZZZZY-K2 (ca gốc) diaChiTuYThem('Tại đường Trương Đình Hội') → duong 'đường Trương Đình Hội', tên 'Trương Đình Hội'",
    JSON.stringify(diaChiTuYThem(T)) === JSON.stringify({ duong: "đường Trương Đình Hội", tenDuong: "Trương Đình Hội" }), JSON.stringify(diaChiTuYThem(T)));
  ok("ZZZZZY-K2b (cách nói mới) 'ở hẻm 45 Nguyễn Trãi' → duong 'hẻm 45 Nguyễn Trãi', tên 'Nguyễn Trãi'",
    diaChiTuYThem("ở hẻm 45 Nguyễn Trãi")?.tenDuong === "Nguyễn Trãi" && diaChiTuYThem("ở hẻm 45 Nguyễn Trãi")?.duong === "hẻm 45 Nguyễn Trãi", JSON.stringify(diaChiTuYThem("ở hẻm 45 Nguyễn Trãi")));
  ok("ZZZZZY-K2c (đối chứng) 'ở gần đường Nguyễn Trãi', 'thông ra đường Lê Lợi 200m', 'gần chợ Bà Chiểu' → không phải địa chỉ",
    diaChiTuYThem("ở gần đường Nguyễn Trãi") === null && diaChiTuYThem("ra đường Lê Lợi 200m") === null && diaChiTuYThem("gần chợ Bà Chiểu") === null, "");
  const kt = kiemKienThuc([T], T, []);
  ok("ZZZZZY-K2d kiemKienThuc bỏ 'Tại đường Trương Đình Hội' (không vào bo_sung)", kt.length === 0, JSON.stringify(kt));
  const bs = boSungDiaChiTuKienThuc([], [T], T);
  ok("ZZZZZY-K2e boSungDiaChiTuKienThuc: AI không đưa duong → thêm đề xuất duong + ten_duong qua kiểm bằng chứng",
    bs.some((d) => d.khoa === "duong" && d.gia_tri === "đường Trương Đình Hội") && bs.some((d) => d.khoa === "ten_duong" && d.gia_tri === "Trương Đình Hội"), JSON.stringify(bs));
  const daCo = [{ khoa: "duong", gia_tri: "hẻm 12 Lê Lợi", trich_dan: "hẻm 12 Lê Lợi", can: null }];
  ok("ZZZZZY-K2f (đối chứng) AI đã đưa duong → không thêm", boSungDiaChiTuKienThuc(daCo, [T], `${T}, hẻm 12 Lê Lợi`).length === 1, "");
  const dc = docAiChinh(boSungDiaChiTuKienThuc([], [T], T), null);
  ok("ZZZZZY-K2g docAiChinh từ đề xuất đó → vi_tri 'đường Trương Đình Hội', tenDuong 'Trương Đình Hội'",
    dc.duong === "đường Trương Đình Hội" && dc.tenDuong === "Trương Đình Hội", JSON.stringify({ d: dc.duong, t: dc.tenDuong }));
}
console.log(hong ? `\nKIỂM BẰNG CHỨNG: ${hong}/${tong} CA HỎNG` : `\nKIỂM BẰNG CHỨNG: ${tong}/${tong} CA ĐẠT`);
process.exit(hong ? 1 : 0);

