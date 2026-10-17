// fr177-hoi-nhu-moi-gioi-gioi.mjs — bài kiểm tầng tiền định FR-177:
//   nhanDienFact  — câu lệch đang nói fact NÀO (hỏi một đường, trả lời một nẻo → vẫn ghi)
//   chonCauKe     — câu kế bám theo điều chủ nhà vừa nói, trong nhóm ưu tiên cao nhất
//   laDongY       — chủ nhà gật bản nháp (AGREE_RULES, bản không model)
// Chạy: bun bot/tests/fr177-hoi-nhu-moi-gioi-gioi.mjs
import {
  chonCanTheoCau, chonCauKe, docTraLoiConBan, laDongY, laDuRoi, laGap, laNgungRao, nhanDienFact, phanLoaiCauTraLoi,
} from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { cauHoiMau, dsHoiBu, KHO_TEN_TRO_LY, tenTroLy, dienTen } from "../supabase/functions/_shared/prompts.ts";

let hong = 0, tong = 0;
const ok = (ten, dat, chiTiet = "") => { tong++; if (!dat) { hong++; console.log(`✗ ${ten}\n     → ${chiTiet}`); } else console.log(`✓ ${ten}`); };

// ── nhanDienFact ─────────────────────────────────────────────────────────────
const ND = [
  // [câu, fact mong đợi | null, đáp án mong đợi (regex) | undefined]
  ["sổ hồng riêng rồi em", "phap_ly"],
  ["đã hoàn công", "phap_ly"],
  ["hẻm 4m xe hơi vào được", "do_rong_hem", /4m/],
  ["hẻm xe hơi", "do_rong_hem"],
  ["Ngang 5", "mat_tien", /^5m$/],
  ["mặt tiền 4,5m", "mat_tien", /^4,5m$/],
  ["80m2", "dien_tich", /80m2/],
  ["5x16", "dien_tich", /5x16/],
  ["5 tỷ 8", "gia", /5 tỷ 8/],
  ["5 tỏi rưỡi", "gia", /5 tỏi rưỡi/],
  ["3 lầu 4 phòng ngủ", "ket_cau"],
  ["1 trệt 2 lầu", "ket_cau"],
  ["4 phòng ngủ", "so_phong_ngu", /^4$/],
  ["phường 5", "phuong", /^Phường 5$/],
  ["p12", "phuong", /^Phường 12$/],
  ["xây 2015", "nam_xay", /^2015$/],
  ["hướng đông nam", "huong"],
  ["không dính quy hoạch", "quy_hoach"],
  ["để ở hay kinh doanh đều được", "tiem_nang"],
  // 10/09 lần 7: chủ nhà KỂ VỀ MÌNH, không phải tiềm năng của căn.
  ["Anh đầu tư mua nhà cũ sửa lại bán", null],
  ["Chị chuyên mua bán đất nền khu này", null],
  ["Em làm nghề môi giới nhà phố", null],
  ["16m nha", null],           // số trần, không nhãn → bo_sung
  ["nhà nở hậu chút", null],
  ["ok", null],
  ["Kêu chị nha", null],
];
for (const [cau, fact, re] of ND) {
  const k = nhanDienFact(cau);
  ok(`nhanDienFact "${cau}" → ${fact ?? "không nhận"}`,
    (k?.question ?? null) === fact && (!re || re.test(k?.answer ?? "")), JSON.stringify(k));
}

// ── phanLoaiCauTraLoi: câu lệch trỏ sang fact khác ────────────────────────────
const LECH = [
  ["ket_cau", "sổ hồng riêng rồi em", "phap_ly"],
  ["nam_xay", "5 tỷ", "gia"],
  ["phap_ly", "hẻm 4m xe hơi vào được", "do_rong_hem"],
  ["gia", "ngang 5", "mat_tien"],
  ["phap_ly", "phường 5", "phuong"],
  ["huong", "16m nha", undefined],
  ["dien_tich_dat", "80m2", undefined], // khớp, không lệch
];
for (const [q, cau, sang] of LECH) {
  const k = phanLoaiCauTraLoi(q, cau);
  ok(`hỏi ${q}, nhắn "${cau}" → ${sang ? `lệch, ghi sang ${sang}` : k.loai === "khop" ? "khớp" : "lệch, không nhận ra"}`,
    sang ? k.loai === "lech" && k.chuyenSang?.question === sang : k.chuyenSang === undefined, JSON.stringify(k));
}
ok("hinh_anh: 'chiều gửi em' KHÔNG đóng câu ảnh", phanLoaiCauTraLoi("hinh_anh", "chiều gửi em").loai === "lech");
ok("hinh_anh: 'không có ảnh' là câu trả lời", phanLoaiCauTraLoi("hinh_anh", "không có ảnh em").loai === "khop");

// ── chonCauKe ────────────────────────────────────────────────────────────────
const CB = (k) => ({ fact_key: k, nhom: "co_ban" });
const CM = (k) => ({ fact_key: k, nhom: "chuyen_mon" });
ok("nghe 'ngang 5' (mat_tien) → hỏi diện tích, không hỏi phường trước",
  chonCauKe(["mat_tien"], [CB("phuong"), CB("dien_tich_dat"), CB("gia")]) === "dien_tich_dat");
ok("nghe diện tích → hỏi giá", chonCauKe(["dien_tich"], [CB("phuong"), CB("gia")]) === "gia");
// FR-241 l (chủ dự án 28/09: "sao cứ hỏi phòng ngủ ko z để sau rồi hỏi đi"): nghe kết cấu KHÔNG kéo phòng ngủ lên trước pháp lý.
ok("nghe '3 lầu' (ket_cau) → hỏi pháp lý trước phòng ngủ (FR-241)",
  chonCauKe(["ket_cau"], [CM("phap_ly"), CM("so_phong_ngu")]) === "phap_ly");
ok("nghe hẻm → hỏi kết cấu", chonCauKe(["do_rong_hem"], [CM("phap_ly"), CM("ket_cau")]) === "ket_cau");
ok("còn thiếu cơ bản thì KHÔNG nhảy sang chuyên môn dù liên quan",
  chonCauKe(["do_rong_hem"], [CB("gia"), CM("ket_cau")]) === "gia");
ok("không liên quan gì → câu đầu theo priority", chonCauKe(["gia"], [CM("do_rong_hem"), CM("phap_ly")]) === "do_rong_hem");
ok("view cũ không có cột nhom → tra bảng NHOM_FACT", chonCauKe(["mat_tien"], [{ fact_key: "phuong" }, { fact_key: "dien_tich" }]) === "dien_tich");
ok("hết câu → undefined", chonCauKe(["gia"], []) === undefined);

// ── laDongY ──────────────────────────────────────────────────────────────────
for (const s of ["ok", "ok em", "được đó", "đăng đi", "ừ", "vậy đi", "chốt", "👍", "❤️", "[sticker cảm xúc]", "ok nha em, đăng luôn", "Được rồi đăng đi em", "dạ được", "oke"]) {
  ok(`gật: "${s}"`, laDongY(s) === true);
}
for (const s of ["không, sửa giá lại", "sai rồi", "5 tỷ", "ok nhưng sửa giá", "chưa được", "thêm cái hẻm vào", "phí sao em?", "để coi", ""]) {
  ok(`không gật: "${s}"`, laDongY(s) === false);
}

// ── laDuRoi — FR-177 g: chủ nhà nói "đủ rồi" thì NGỪNG hỏi bù, điểm giữ nguyên ──
for (const s of ["đủ rồi em", "vậy đủ rồi", "thôi đủ rồi, đừng hỏi nữa", "hết rồi em", "không còn gì nữa", "chỉ vậy thôi", "bấy nhiêu thôi em", "đừng hỏi nữa", "thông tin đầy đủ rồi", "vậy thôi nha", "nhiêu đó thôi"]) {
  ok(`đủ rồi: "${s}"`, laDuRoi(s) === true);
}
for (const s of ["ok", "đăng đi em", "hẻm 4m", "sổ hồng riêng rồi em", "chưa đủ đâu", "thiếu cái hẻm", "còn nữa", "để em bổ sung thêm", "phí sao em?", "", "rồi", "đủ 3 lầu", "đồng ý hết rồi", "các bên đồng ý hết rồi em"]) {
  ok(`không phải đủ rồi: "${s}"`, laDuRoi(s) === false);
}

// ── laGap — cột listings.gap: chủ nhà có nói cần bán/cho thuê GẤP không ──────
for (const s of ["bán gấp nhà p4 5 tỷ", "cần bán gấp", "bán nhanh trong tháng", "cần tiền bán gấp", "thanh lý gấp", "gấp lắm em", "cho thuê gấp"]) {
  ok(`gấp: "${s}"`, laGap(s) === true);
}
for (const s of ["bán nhà hẻm trần bình trọng p4 giá 5 tỷ 8", "không gấp, từ từ cũng được", "chưa gấp đâu em", "ko gấp", "nhà gấp đôi nhà bên", ""]) {
  ok(`không gấp: "${s}"`, laGap(s) === false);
}

// ── FR-184 — laNgungRao: chủ nhà báo "bán rồi" (da_chot) / "ngưng bán" (an) ────
for (const s of ["bán rồi em", "căn đó anh bán được rồi nhé", "đã bán", "có người thuê rồi", "nhà đã cho thuê rồi", "nhận cọc rồi em", "đã nhận cọc", "chốt rồi", "bán xong rồi", "có khách mua rồi", "vừa sang tên xong"]) {
  ok(`bán rồi: "${s}"`, laNgungRao(s) === "ban_roi", String(laNgungRao(s)));
}
for (const s of ["ngưng bán nha em", "không bán nữa", "rút tin giúp anh", "gỡ tin đi em", "thôi không bán nữa, để lại ở", "huỷ ký gửi", "dừng rao nhé",
  // SRS-5.1zzc (05/10): "ngưng bán rồi" là lời DỪNG, từng ra "bán rồi" vì luật "bán … rồi" xét trước.
  "ngưng bán rồi", "thôi không bán rồi em"]) {
  ok(`rút: "${s}"`, laNgungRao(s) === "rut", String(laNgungRao(s)));
}
for (const s of ["chưa bán", "vẫn đang bán nha", "bán rồi hả em?", "bán nhà 5 tỷ", "chốt giá 5 tỷ", "ok đăng đi em", "sổ hồng riêng rồi", "hẻm 4m", "", "còn bán em", "bán chưa em?", "đã bàn với vợ, để 6 tỷ",
  // FR-235 (28/09): "bận rồi" / "bạn rồi" bỏ dấu cũng ra "ban roi" — không được gỡ tin.
  "giờ anh bận rồi em", "hướng đông. đăng bài được chưa. a bận rồi", "BẬN RỒI", "bạn rồi mà"]) {
  ok(`không phải báo ngưng: "${s}"`, laNgungRao(s) === null, String(laNgungRao(s)));
}

// ── SRS-5.1zzc (05/10/2026) — docTraLoiConBan: trả lời câu keep-alive "còn bán không" (LƯỚI ĐỠ khi AI không chạy) ──
for (const s of ["còn em", "còn", "vẫn đang bán nha", "còn bán", "ừ", "dạ còn ạ", "chưa bán được em ơi", "vẫn còn nhé", "còn chứ em"]) {
  ok(`còn bán: "${s}"`, docTraLoiConBan(s) === "con", String(docTraLoiConBan(s)));
}
for (const s of ["bán rồi em", "có người mua rồi", "nhận cọc rồi", "đã bán"]) {
  ok(`bán rồi (con_ban): "${s}"`, docTraLoiConBan(s) === "ban_roi", String(docTraLoiConBan(s)));
}
for (const s of ["không còn", "hết rồi em", "ngưng bán rồi", "thôi không bán nữa", "không bán nữa em"]) {
  ok(`ngưng (con_ban): "${s}"`, docTraLoiConBan(s) === "rut", String(docTraLoiConBan(s)));
}
for (const s of ["phí bên em bao nhiêu", "còn bán không em?", "mai anh gửi ảnh", "", "giá giờ còn bao nhiêu được"]) {
  ok(`không phải trả lời còn bán: "${s}"`, docTraLoiConBan(s) === null, String(docTraLoiConBan(s)));
}

// ── FR-184 — chonCanTheoCau: nhiều căn, chủ nhà chỉ căn nào ─────────────────
const CANS = [
  { id: "a", location_raw: "hẻm 123 Trần Bình Trọng", ward: "Phường 4", code: "BDS-Q5-0001" },
  { id: "b", location_raw: "99 Nguyễn Trãi", ward: "Phường 3", code: "BDS-Q5-0002" },
  { id: "c", location_raw: "7 Hồng Bàng", ward: "Phường 12", code: "BDS-Q5-0003" },
];
ok("chọn theo số thứ tự '2'", chonCanTheoCau("2", CANS)?.id === "b");
ok("chọn theo 'căn 3'", chonCanTheoCau("căn 3 nha", CANS)?.id === "c");
ok("chọn theo 'cái đầu'", chonCanTheoCau("cái đầu tiên", CANS)?.id === "a");
ok("chọn theo địa chỉ 'trần bình trọng'", chonCanTheoCau("căn trần bình trọng đó em", CANS)?.id === "a");
ok("chọn theo 'nguyễn trãi'", chonCanTheoCau("nguyễn trãi", CANS)?.id === "b");
ok("chọn theo phường 'p12'", chonCanTheoCau("căn bên p12", CANS)?.id === "c");
ok("không rõ → null", chonCanTheoCau("căn kia đó", CANS) === null);
ok("số ngoài danh sách → null", chonCanTheoCau("9", CANS) === null);
ok("một căn → chọn luôn", chonCanTheoCau("gì cũng được", [CANS[1]])?.id === "b");

// ── FR-186 — fact mới (cho thuê, đất, biệt thự) trong nhanDienFact ──────────
for (const [cau, fact, re] of [
  ["cọc 2 tháng em", "tien_coc", /2 tháng/], ["cọc 1 đóng 3", "tien_coc", /1 tháng/],
  ["tăng 5% mỗi năm", "truot_gia", /5%/], ["trượt giá 10%", "truot_gia", /10%/],
  ["không vướng cột điện hố ga gì", "ha_tang"], ["xây tự do em", "xay_dung"], ["phải xây theo mẫu chủ đầu tư", "xay_dung"],
  ["khu compound an ninh 24/7", "khu_compound"], ["để lại full nội thất", "noi_that"], ["bàn giao nhà trống", "noi_that"],
  // 20260909i — câu hỏi bù sau đăng + 4 loại mới (chat 21/06 lượt 38, 65–67; chat 07/09).
  ["nhà 2 wc em", "so_wc", /^2$/], ["cách mặt tiền 50m", "cach_mat_tien", /50m/], ["nở hậu 1.5m", "no_hau", /1.5m/],
  ["mưa lớn không ngập", "ngap_nuoc"], ["hẻm cụt, xe quay đầu được", "hem_thong"], ["sổ đang thế chấp ngân hàng", "the_chap"], // 22/09 (#237): thế chấp là TÌNH TRẠNG, cùng họ phap_ly
  ["sổ cầm tay", "the_chap"], ["giá còn thương lượng chút", "thuong_luong"], ["nhà đang cho thuê", "hien_trang_su_dung"],
  ["bán vì đi định cư", "ly_do_ban"], ["gần trường tiểu học", "tien_ich_gan"], ["căn góc 2 mặt thoáng", "can_goc"],
  ["có thang máy", "thang_may"], ["view sông", "view"], ["pccc nghiệm thu rồi", "pccc"], ["toà 20 phòng cho thuê", "so_phong", /^20$/],
  ["lấp đầy 90%", "ty_le_lap_day", /90%/], ["doanh thu 80 triệu mỗi tháng", "doanh_thu"], ["xưởng cao thông thủy 9m", "chieu_cao", /9m/],
  ["tải trọng sàn 2 tấn", "tai_trong_san", /2 tấn/], ["trạm 250kva", "tram_bien_ap", /250 kVA/], ["có xử lý nước thải", "xu_ly_nuoc_thai"],
  ["container 40 feet vào được", "duong_container"], ["lên thổ cư được", "len_tho_cu"], ["có kênh tưới sát đất", "nguon_nuoc"],
  ["đã cắm cọc ranh", "ranh_gioi"], ["trả tiền thuê đất hàng năm", "hinh_thuc_thue_dat"], ["căn hộ sở hữu 50 năm", "so_huu"],
  ["đất thời hạn sử dụng đến năm 2060", "thoi_han_su_dung"], ["mật độ xây dựng 60%", "mat_do_xd"], ["lô bóp hậu chút", "hinh_dang"],
  ["xây tối đa 5 tầng", "tang_cao_toi_da", /^5$/], ["fit-out 15 ngày", "fit_out", /15 ngày/], ["hợp làm showroom", "muc_dich"],
]) {
  const nd = nhanDienFact(cau);
  ok(`nhận diện "${cau}" → ${fact}`, nd?.question === fact && (!re || re.test(nd.answer)), JSON.stringify(nd));
}
ok("chonCauKe: chung cư trả lời tầng → hỏi phòng ngủ",
  chonCauKe(["tang"], [{ fact_key: "huong", priority: 12, nhom: "chuyen_mon" }, { fact_key: "so_phong_ngu", priority: 11, nhom: "chuyen_mon" }]) === "so_phong_ngu");
ok("chonCauKe: chung cư trả lời phòng ngủ → hỏi hướng ban công",
  chonCauKe(["so_phong_ngu"], [{ fact_key: "noi_that", priority: 13, nhom: "chuyen_mon" }, { fact_key: "huong", priority: 12, nhom: "chuyen_mon" }]) === "huong");
ok("chonCauKe: đất trả lời đường → hỏi hướng",
  chonCauKe(["do_rong_duong"], [{ fact_key: "ha_tang", priority: 12, nhom: "chuyen_mon" }, { fact_key: "huong", priority: 11, nhom: "chuyen_mon" }]) === "huong");
ok("chonCauKe: đất trả lời hạ tầng → hỏi xây tự do/theo mẫu",
  chonCauKe(["ha_tang"], [{ fact_key: "phap_ly", priority: 14, nhom: "chuyen_mon" }, { fact_key: "xay_dung", priority: 13, nhom: "chuyen_mon" }]) === "xay_dung");
ok("chonCauKe: cho thuê trả lời cọc → hỏi thời hạn thuê",
  chonCauKe(["tien_coc"], [{ fact_key: "truot_gia", priority: 18, nhom: "chuyen_mon" }, { fact_key: "thoi_han_thue", priority: 17, nhom: "chuyen_mon" }]) === "thoi_han_thue");
ok("câu mẫu hướng riêng cho chung cư", /ban công/i.test(cauHoiMau("huong", "anh", undefined, "chung_cu")));
ok("câu mẫu hướng riêng cho đất", /lô đất/i.test(cauHoiMau("huong", "anh", undefined, "dat")));
ok("câu mẫu hướng chung (nhà phố) không đổi", /quay hướng nào/i.test(cauHoiMau("huong", "anh", undefined, "nha_pho")));
// FR-237 (28/09/2026): câu xin ảnh theo loại — đất không có "mặt tiền nhà, hẻm".
ok("câu xin ảnh đất: lô đất + đường vào, không hẻm", /lô đất và đường vào/.test(cauHoiMau("hinh_anh", "anh", undefined, "dat")) && !/hẻm/.test(cauHoiMau("hinh_anh", "anh", undefined, "dat")));
ok("câu xin ảnh căn hộ: góc căn hộ, không hẻm", /căn hộ/.test(cauHoiMau("hinh_anh", "anh", undefined, "chung_cu")) && !/hẻm/.test(cauHoiMau("hinh_anh", "anh", undefined, "chung_cu")));
// FR-237 (bắn thật lx-46): hỏi bù (ask-seller) dùng nhãn trần → tin đất bị xin "ảnh sổ đỏ, mặt tiền và hẻm".
ok("hỏi bù tin đất: nhãn ảnh 'lô đất, đường vào', không 'mặt tiền nhà, hẻm'", /lô đất, đường vào/.test(dsHoiBu(["hinh_anh"], "dat")) && !/hẻm/.test(dsHoiBu(["hinh_anh"], "dat")), dsHoiBu(["hinh_anh"], "dat"));
ok("hỏi bù nhà phố giữ nhãn ảnh cũ", /mặt tiền nhà, hẻm/.test(dsHoiBu(["hinh_anh", "gia"], "nha_pho")) && dsHoiBu(["hinh_anh", "gia"], "nha_pho").split("\n").length === 2);
ok("câu đứng tên đất: 'Sổ đất mình', hỏi quan hệ, không hỏi tên", /^Sổ đất mình do chính anh đứng tên hay người nhà/.test(cauHoiMau("nguoi_dung_ten", "anh", undefined, "dat")));
ok("câu xin ảnh nhà phố không đổi (mặt tiền và hẻm)", /mặt tiền và hẻm/.test(cauHoiMau("hinh_anh", "anh", undefined, "nha_pho")));
// 09/09 chiều sếp chốt: hỏi địa chỉ kèm lý do "kiểm tra giá". 11/09 (lượt bắn 42 ca):
// khuôn 25 từ kèm lý do lặp nguyên văn 22/52 câu bot → lý do chỉ ở lần hỏi ĐẦU
// (`vi_tri@lan_dau`), các lần hỏi lại ngắn, không lý do.
// 06/10/2026 (chủ dự án: "Nhà anh ở đâu, ở Hồ Chí Minh đúng không?"): câu đầu hỏi như người quen, kèm phỏng đoán, không nêu lý do.
// 08/10/2026 (chủ dự án: "cho con bot lịch sự hơn tí nhưng vẫn cần ngắn"): câu mở "Dạ", câu hỏi kết "ạ".
ok("câu mẫu địa chỉ lần ĐẦU: hỏi thẳng kèm phỏng đoán, không nêu lý do", /nhà anh ở đâu/i.test(cauHoiMau("vi_tri@lan_dau", "anh")) && /đúng không ạ\?/.test(cauHoiMau("vi_tri@lan_dau", "anh")) && !/kiểm tra giá/.test(cauHoiMau("vi_tri@lan_dau", "anh")));
ok("câu mẫu địa chỉ hỏi LẠI: không lý do, dưới 12 từ", !/kiểm tra giá|giá thị trường/.test(cauHoiMau("vi_tri", "anh")) && cauHoiMau("vi_tri", "anh").split(/\s+/).length <= 12, cauHoiMau("vi_tri", "anh"));

// ── FR-181 — tên trợ lý theo khách: tất định, trong kho, giữ nguyên ─────────
// SRS-5.1zzzzzzz9 (14/10/2026): 20 tên người thật, không còn kiểu "T•ai"; không tên trùng địa danh hay trùng nhau.
ok("kho tên có 20 tên người thật, không có '•ai', không trùng", KHO_TEN_TRO_LY.length === 20 && KHO_TEN_TRO_LY.every((t) => !/•|ai$/i.test(t) && /^\p{Lu}\p{Ll}+$/u.test(t)) && new Set(KHO_TEN_TRO_LY).size === 20);
ok("kho tên không có tên trùng địa danh dễ nhầm (Bình, Long, Vinh, Nam, Hà)", !["Bình", "Long", "Vinh", "Nam", "Hà"].some((t) => KHO_TEN_TRO_LY.includes(t)));
ok("cùng Zalo ID → cùng tên", tenTroLy("zalo-123") === tenTroLy("zalo-123"));
ok("tên luôn nằm trong kho", ["a", "b", "c", "zalo-9", "7158321"].every((u) => KHO_TEN_TRO_LY.includes(tenTroLy(u))));
ok("khác ID có thể khác tên (ít nhất 3 tên trong 40 ID)", new Set(Array.from({ length: 40 }, (_, i) => tenTroLy(`u${i}`))).size >= 3);
ok("dienTen điền mọi {ten}", dienTen("em là {ten}, {ten} đây", "Thảo") === "em là Thảo, Thảo đây");

console.log(hong ? `\nFR-177: ${hong}/${tong} CA HỎNG` : `\nFR-177: ${tong}/${tong} CA ĐẠT`);
// 21/09/2026 (bắn thật mau-tdt): "nhà ở đường trần đình trọng quận 5" là ĐỊA CHỈ, từng thành tiềm năng "nhà ở"
// rồi lên bản nháp "💡 Phù hợp: nhà ở đường…". "ở" + đường/hẻm/số/phường/quận/khu/gần → không phải cách dùng.
ok("'nhà ở đường trần đình trọng quận 5' → vi_tri, không phải tiem_nang", nhanDienFact("nhà ở đường trần đình trọng quận 5")?.question === "vi_tri", JSON.stringify(nhanDienFact("nhà ở đường trần đình trọng quận 5")));
ok("'ở hẻm 12 lê văn việt' → vi_tri", nhanDienFact("ở hẻm 12 lê văn việt")?.question === "vi_tri");
ok("'nhà ở gia đình' vẫn là tiem_nang", nhanDienFact("nhà ở gia đình")?.question === "tiem_nang");
ok("'nhà ở hoặc kinh doanh đều được' vẫn là tiem_nang", nhanDienFact("nhà ở hoặc kinh doanh đều được")?.question === "tiem_nang");
ok("'để ở' vẫn là tiem_nang", nhanDienFact("để ở")?.question === "tiem_nang");

process.exit(hong ? 1 : 0);
