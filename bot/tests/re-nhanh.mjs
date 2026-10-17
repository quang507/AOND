// re-nhanh.mjs — FR-223: bảng rẽ nhánh câu hỏi theo câu trả lời (extraction/re-nhanh.ts). Chạy: bun bot/tests/re-nhanh.mjs
import { reNhanh, apReNhanh, canReNhanh, RE_NHANH, nhanhCuaKhoa } from "../supabase/functions/_shared/extraction/re-nhanh.ts";
import { chonCauKe } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";
import { CAU_HOI_MAU, FACT_LABELS, cauHoiMau, nhanTheoLoai } from "../supabase/functions/_shared/prompts.ts";
let tong = 0, hong = 0;
const ok = (ten, dat, chi = "") => { tong++; if (!dat) hong++; console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`); };
const f = (q, a) => ({ question: q, answer: a });
const keys = (r) => r.them.map((t) => t.fact_key);

let r = reNhanh({ loai: "nha_pho", deal: null, facts: [f("phap_ly", "sổ hồng riêng")] });
ok("nhà phố + 'sổ hồng riêng' → hỏi hoàn công", keys(r).includes("hoan_cong"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: null, facts: [f("phap_ly", "sổ hồng riêng, hoàn công đủ")] });
ok("đã nói 'hoàn công đủ' → KHÔNG hỏi hoàn công", !keys(r).includes("hoan_cong"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: null, facts: [f("phap_ly", "sổ hồng riêng"), f("hien_trang", "đang cho Sacombank thuê")] });
ok("sổ riêng + đang cho thuê → KHÔNG hỏi hoàn công, bỏ hiện trạng + nội thất", !keys(r).includes("hoan_cong") && r.bo.has("hien_trang") && r.bo.has("noi_that"), JSON.stringify({ ...r, bo: [...r.bo] }));
// 24/09/2026 (chủ dự án, tin 152 Trần Đình Xu): đang cho thuê / kinh doanh LÀ tiềm năng sử dụng — không hỏi lại.
ok("đang cho thuê → bỏ câu tiềm năng sử dụng", r.bo.has("tiem_nang"), JSON.stringify([...r.bo]));
// 25/09/2026 (chủ dự án: "Loại bds khác nhau sẽ có những thứ khác nhau cần làm rõ").
r = reNhanh({ loai: "chung_cu", deal: "ban", facts: [f("du_an_ten", "Sunrise City"), f("toa_thap", "S2")] }, []);
ok("căn hộ đã nói dự án → KHÔNG hỏi đường / số nhà", r.bo.has("vi_tri"), JSON.stringify([...r.bo]));
r = reNhanh({ loai: "chung_cu", deal: "ban", facts: [f("tang", "15")] }, []);
ok("căn hộ chưa nói dự án → vẫn hỏi vị trí", !r.bo.has("vi_tri"));
r = reNhanh({ loai: "dat", deal: "ban", facts: [f("_mo_ta", "Bán đất thổ cư 100% hẻm xe hơi Nguyễn Duy Trinh")] }, []);
ok("đất thổ cư trong hẻm → KHÔNG hỏi 'xây tự do hay theo mẫu chủ đầu tư'", r.bo.has("xay_dung"), JSON.stringify([...r.bo]));
r = reNhanh({ loai: "dat", deal: "ban", facts: [f("_mo_ta", "Bán nền dự án KDC Phú Mỹ")] }, []);
ok("đất nền dự án → vẫn hỏi xây tự do hay theo mẫu", !r.bo.has("xay_dung"));
// SRS-5.1zzzzzzz3 (14/10/2026): căn hộ — tên chung cư / dự án là ô riêng `du_an_ten`; ô vị trí căn hộ hỏi đường, khu (không số nhà).
ok("nhãn vị trí theo loại: đất vườn / kho không đòi số nhà, căn hộ: vị trí = đường/khu, tên chung cư ở ô du_an_ten",
  /không cần số nhà/.test(nhanTheoLoai("vi_tri", "dat_nong_nghiep")) && /không cần số nhà/.test(nhanTheoLoai("vi_tri", "kho_xuong")) &&
  /không cần số nhà/.test(nhanTheoLoai("vi_tri", "chung_cu")) && /chung cư/.test(nhanTheoLoai("du_an_ten", "chung_cu")) &&
  /chung cư/.test(cauHoiMau("du_an_ten", "anh", CAU_HOI_MAU, "chung_cu")) && nhanTheoLoai("vi_tri", "nha_pho") === FACT_LABELS.vi_tri);
ok("câu hỏi vị trí theo loại: kho xưởng hỏi khu công nghiệp, không hỏi số nhà",
  /khu công nghiệp/.test(cauHoiMau("vi_tri", "anh", CAU_HOI_MAU, "kho_xuong")) && !/số mấy|số nhà/.test(cauHoiMau("vi_tri", "anh", CAU_HOI_MAU, "kho_xuong")));
// 24/09/2026 (bắn 10 tin): toà nhà CHDV "đang thu 250 triệu/tháng" — cho thuê từng phòng, không hỏi hạn hợp đồng thuê.
r = reNhanh({ loai: "toa_nha", deal: "ban", rent_income_vnd: 25e7, facts: [f("doanh_thu", "250 triệu"), f("phap_ly", "sổ hồng riêng")] }, ["phap_ly"]);
ok("toà nhà CHDV có thu nhập, không nói cho ai thuê → KHÔNG hỏi hạn hợp đồng", !keys(r).includes("han_hop_dong_thue"), JSON.stringify(r.them));
r = reNhanh({ loai: "toa_nha", deal: "ban", facts: [f("hien_trang", "đang cho ngân hàng thuê nguyên toà"), f("phap_ly", "sổ hồng riêng")] }, ["phap_ly"]);
ok("toà nhà đang cho ngân hàng thuê → vẫn hỏi hạn hợp đồng", keys(r).includes("han_hop_dong_thue"), JSON.stringify(r.them));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("bo_sung", "tầng 1 và 2 để kinh doanh đang cho techcombank thuê")] });
ok("'tầng 1 và 2 để kinh doanh đang cho techcombank thuê' → nhánh đang cho thuê, bỏ tiềm năng", r.bo.has("tiem_nang"), JSON.stringify([...r.bo]));
ok("đang cho thuê chưa nói hạn hợp đồng, chưa nói tiền thuê → hỏi hạn hợp đồng rồi tiền thuê", keys(r).join() === "han_hop_dong_thue,doanh_thu", JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("hien_trang", "đang cho thuê 30 triệu/tháng")] });
ok("'đang cho thuê 30 triệu/tháng' → không hỏi lại tiền thuê", !keys(r).includes("doanh_thu"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("_mo_ta", "bán nhà mặt tiền, đang cho ngân hàng thuê, giá 25 tỷ"), f("han_hop_dong_thue", "tới năm 2030 em")] }, ["han_hop_dong_thue"]);
ok("'cho ngân hàng thuê, giá 25 tỷ' KHÔNG phải tiền thuê → trả lời hạn hợp đồng xong thì hỏi tiền thuê (bắn thật 24/09 rn-test-g)", keys(r).join() === "doanh_thu", JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("kien_thuc", "hợp đồng thuê Sacombank đến năm 2031")] });
ok("đã nói 'đến năm 2031' → KHÔNG hỏi hạn hợp đồng", !keys(r).includes("han_hop_dong_thue"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("_mo_ta", "bán nhà mặt tiền Nguyễn Trãi, đang cho ngân hàng thuê, giá 25 tỷ"), f("phap_ly", "sổ hồng riêng")] });
ok("câu RAO gốc 'đang cho ngân hàng thuê' (không có fact) → nhánh đang cho thuê, KHÔNG hỏi hoàn công (bắn thật 24/09)", !keys(r).includes("hoan_cong") && r.bo.has("hoan_cong") && keys(r).includes("han_hop_dong_thue"), JSON.stringify({ ...r, bo: [...r.bo] }));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [], rent_income_vnd: 150000000 });
ok("cột thu nhập thuê có số → coi là đang cho thuê", r.bo.has("hien_trang"), JSON.stringify({ ...r, bo: [...r.bo] }));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "chưa có sổ, hợp đồng mua bán")] });
ok("'chưa có sổ, HĐMB' → đã biết giấy tờ (HĐMB) nên chỉ hỏi bao giờ ra sổ, không hỏi hoàn công", keys(r).join() === "du_kien_ra_so" && !keys(r).includes("hoan_cong"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "chưa có sổ em")] });
ok("'chưa có sổ' trống trơn → hai ý chính theo thứ tự: giấy tờ đang có, rồi bao giờ ra sổ", keys(r).join() === "giay_to_hien_co,du_kien_ra_so", JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "chưa có sổ, hợp đồng mua bán, cuối năm nay ra sổ")] });
ok("nói đủ cả hai ý → nhánh chưa sổ không hỏi gì thêm", keys(r).length === 0, JSON.stringify(r));
r = reNhanh({ loai: "chung_cu", deal: "ban", facts: [f("phap_ly", "đang chờ sổ")] });
ok("căn hộ chờ sổ → hỏi giấy tờ, bao giờ ra sổ, đã nhận bàn giao chưa", ["giay_to_hien_co", "du_kien_ra_so", "ban_giao"].every((k) => keys(r).includes(k)), JSON.stringify(r));
r = reNhanh({ loai: "chung_cu", deal: "ban", facts: [f("phap_ly", "sổ hồng riêng")] });
ok("căn hộ sổ hồng riêng → KHÔNG hỏi hoàn công (không phải nhà tự xây)", !keys(r).includes("hoan_cong"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "sổ chung với anh trai")] });
ok("'sổ chung với anh trai' → đã biết chung với ai, chỉ hỏi các bên đồng ý bán chưa; không hỏi hoàn công", keys(r).join() === "dong_y_ban", JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "sổ chung")] });
ok("'sổ chung' → hỏi đứng tên chung với ai trước", keys(r)[0] === "dong_so_huu_voi", JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("hien_trang", "nhà nát, mua đất tặng nhà")] });
ok("nhà nát → bỏ phòng ngủ, toilet, nội thất", r.bo.has("so_phong_ngu") && r.bo.has("so_wc") && r.bo.has("noi_that"), JSON.stringify([...r.bo]));
r = reNhanh({ loai: "dat", deal: "ban", facts: [f("tho_cu", "100m2 thổ cư")] });
ok("đất thổ cư một phần → hỏi lên thổ cư", keys(r).includes("len_tho_cu"), JSON.stringify(r));
r = reNhanh({ loai: "dat", deal: "ban", facts: [f("tho_cu", "full thổ cư")] });
ok("đất full thổ cư → KHÔNG hỏi lên thổ cư", !keys(r).includes("len_tho_cu"), JSON.stringify(r));
// SRS-5.1zzzzy (khách mô phỏng 11/10): ô thổ cư nguyên văn "toàn thổ cư" / "ko biết, toàn thổ cư" → bot vẫn hỏi "lên được thổ cư không".
for (const [ma, v] of [["ZZZZY-R1 (ca gốc)", "ko biết, toàn thổ cư"], ["ZZZZY-R2 (cách nói mới)", "đất này trọn thổ cư"]]) {
  r = reNhanh({ loai: "dat", deal: "ban", facts: [f("tho_cu", v)] });
  ok(`${ma} thổ cư '${v}' → KHÔNG hỏi lên thổ cư`, !keys(r).includes("len_tho_cu"), JSON.stringify(r));
}
r = reNhanh({ loai: "nha_pho", deal: "cho_thue", facts: [f("phap_ly", "sổ hồng riêng")] });
ok("tin CHO THUÊ sổ riêng → KHÔNG hỏi hoàn công", !keys(r).includes("hoan_cong"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: null, facts: [f("phap_ly", "sổ hồng riêng"), f("hoan_cong", "rồi em")] });
ok("đã trả lời câu hoàn công → không thêm lại", !keys(r).includes("hoan_cong"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: null, facts: [], legal_status: "so_hong_rieng" });
ok("cột legal_status 'so_hong_rieng' (bóc từ câu rao) cũng tính là sổ riêng", keys(r).includes("hoan_cong"), JSON.stringify(r));
// 27/09/2026 (chủ dự án: "hỏi hơi nhiều"): tin BÁN hỏi hoàn công trong câu pháp lý thứ hai, sau khi lên tin — không rẽ nhánh
// thêm một lượt trước bản nháp. Các ca trên dùng tin chưa rõ bán/thuê (deal null), nơi nhánh này còn chạy.
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "sổ hồng riêng")] }, ["phap_ly"]);
ok("tin BÁN + 'sổ hồng riêng' → KHÔNG rẽ nhánh hoàn công trước bản nháp", !keys(r).includes("hoan_cong"), JSON.stringify(r));

// Chọn câu kế: vừa trả lời pháp lý "sổ hồng riêng" → câu kế là hoàn công, trước phường / ảnh.
const thieu = [{ fact_key: "phuong", priority: 17, nhom: "co_ban" }, { fact_key: "hinh_anh", priority: 19, nhom: "co_ban" }];
const ds = apReNhanh(thieu, { loai: "nha_pho", deal: null, facts: [f("phap_ly", "sổ hồng riêng")] }, ["phap_ly"]);
ok("chonCauKe sau 'sổ hồng riêng' → hoan_cong", chonCauKe(["phap_ly"], ds) === "hoan_cong", JSON.stringify(ds));
const ds5 = apReNhanh([{ fact_key: "phuong", priority: 17, nhom: "co_ban" }], { loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "chưa có sổ"), f("giay_to_hien_co", "vi bằng")] }, ["giay_to_hien_co"]);
ok("vừa trả lời một ý của nhánh (giấy tờ) → hỏi tiếp ý còn thiếu của nhánh (bao giờ ra sổ)", chonCauKe(["giay_to_hien_co"], ds5) === "du_kien_ra_so", JSON.stringify(ds5));
const ds2 = apReNhanh([{ fact_key: "hien_trang", priority: 4, nhom: "co_ban" }, { fact_key: "phuong", priority: 17, nhom: "co_ban" }],
  { loai: "nha_cap4", deal: "ban", facts: [f("hien_trang", "đang cho thuê 20 triệu/tháng")] });
const ds3 = apReNhanh([{ fact_key: "ket_cau", priority: 4, nhom: "co_ban" }], { loai: "nha_pho", deal: null, facts: [f("phap_ly", "sổ hồng riêng")] }, ["gia"]);
ok("câu nhánh CHỈ hỏi ngay sau câu kích (vừa trả lời giá thì không chen hoàn công)", !ds3.some((x) => x.fact_key === "hoan_cong"), JSON.stringify(ds3));
const ds4 = apReNhanh([{ fact_key: "ket_cau", priority: 4, nhom: "co_ban" }], { loai: "nha_pho", deal: null, facts: [f("phap_ly", "sổ hồng riêng")] }, ["phap_ly"]);
ok("vừa trả lời pháp lý → hoàn công đứng ĐẦU, trước cả câu cơ bản còn thiếu", chonCauKe(["phap_ly"], ds4) === "hoan_cong", JSON.stringify(ds4));
ok("apReNhanh bỏ hiện trạng khỏi danh sách khi đang cho thuê", !ds2.some((x) => x.fact_key === "hien_trang"), JSON.stringify(ds2));

ok("nhanhCuaKhoa('du_kien_ra_so') → nhánh 'chưa có sổ' với 2 ý", nhanhCuaKhoa("du_kien_ra_so")?.ten === "chưa có sổ" && nhanhCuaKhoa("du_kien_ra_so")?.cacY.length === 2, JSON.stringify(nhanhCuaKhoa("du_kien_ra_so")));
// Mọi câu nhánh phải có câu mẫu + nhãn (không thì bot đọc tên trường cho khách).
// FR-225 a (25/09/2026, chủ dự án test Zalo): "nở hậu nhé" (chưa có số) → câu kế hỏi nở hậu bao nhiêu mét.
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("bo_sung", "nở hậu nhé")], lichSu: "5x12 · nở hậu nhé · a bán 4t" }, ["gia"]);
ok("NOHAU-01 nói 'nở hậu' chưa có số → thêm no_hau ngay lượt kế", keys(r).includes("no_hau"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("no_hau", "6m")], lichSu: "nở hậu nhé" }, ["gia"]);
ok("NOHAU-02 đã có fact nở hậu → không hỏi", !keys(r).includes("no_hau"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [], rear_width_m: 6, lichSu: "nở hậu nhé" }, ["gia"]);
ok("NOHAU-03 đã có cột nở hậu → không hỏi", !keys(r).includes("no_hau"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [], lichSu: "4x15 nở hậu 5m" }, ["gia"]);
ok("NOHAU-04 đã nói số ('nở hậu 5m') → không hỏi", !keys(r).includes("no_hau"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [], lichSu: "đất vuông vức, không nở hậu" }, ["gia"]);
ok("NOHAU-05 'không nở hậu' → không hỏi", !keys(r).includes("no_hau"), JSON.stringify(r));
ok("NOHAU-06 canReNhanh: chữ gần đây có 'nở hậu' → đọc DB; không có → không", canReNhanh([], ["gia"], "nở hậu nhé") && !canReNhanh([], ["gia"], "a bán 4t"));

// FR-229 (chủ dự án 25/09/2026, nhóm pháp lý): đứng tên nhiều người → hỏi các bên đồng ý bán chưa.
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "sổ hồng riêng"), f("nguoi_dung_ten", "hai vợ chồng anh đứng tên")] }, ["nguoi_dung_ten"]);
ok("PL229-01 'hai vợ chồng anh đứng tên' → hỏi các bên đồng ý bán chưa", keys(r).includes("dong_y_ban"), JSON.stringify(r.them));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("nguoi_dung_ten", "mấy anh em thừa kế")] }, ["nguoi_dung_ten"]);
ok("PL229-02 'anh em thừa kế' → hỏi đồng ý bán", keys(r).includes("dong_y_ban"), JSON.stringify(r.them));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("nguoi_dung_ten", "một mình anh đứng tên, không có đồng sở hữu")] }, ["nguoi_dung_ten"]);
ok("PL229-03 'một mình anh đứng tên, không đồng sở hữu' → KHÔNG hỏi đồng ý bán", !keys(r).includes("dong_y_ban"), JSON.stringify(r.them));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("nguoi_dung_ten", "tên anh")] }, ["nguoi_dung_ten"]);
ok("PL229-04 'tên anh' → KHÔNG hỏi đồng ý bán", !keys(r).includes("dong_y_ban"), JSON.stringify(r.them));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("nguoi_dung_ten", "vợ chồng anh, cả nhà đồng ý bán rồi")] }, ["nguoi_dung_ten"]);
ok("PL229-05 đã nói 'đồng ý bán' → KHÔNG hỏi lại", !keys(r).includes("dong_y_ban"), JSON.stringify(r.them));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "sổ chung")] }, ["phap_ly"]);
ok("PL229-06 'sổ chung' → bỏ câu 'sổ đứng tên ai' (đã hỏi đứng tên chung với ai)", r.bo.has("nguoi_dung_ten") && keys(r).includes("dong_so_huu_voi"), JSON.stringify({ ...r, bo: [...r.bo] }));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "chưa có sổ, hợp đồng mua bán")] }, ["phap_ly"]);
ok("PL229-07 chưa có sổ → bỏ người đứng tên, thế chấp, khớp sổ", ["nguoi_dung_ten", "the_chap", "dien_tich_khop_so"].every((k) => r.bo.has(k)), JSON.stringify([...r.bo]));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "sổ hồng riêng"), f("hoan_cong", "rồi em")] }, []);
ok("PL229-08 đã trả lời hoàn công → bỏ câu 'diện tích xây khớp sổ, đã hoàn công chưa'", r.bo.has("dien_tich_khop_so"), JSON.stringify([...r.bo]));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("phap_ly", "sổ hồng riêng")] }, []);
ok("PL229-09 chưa nói hoàn công → vẫn hỏi khớp sổ", !r.bo.has("dien_tich_khop_so"), JSON.stringify([...r.bo]));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("_mo_ta", "bán nhà nát đập xây lại")] }, []);
ok("PL229-10 nhà nát → không hỏi khớp sổ", r.bo.has("dien_tich_khop_so"));
// Dải ưu tiên: câu pháp lý (16–21) đi trước phường (22), gấp (23), ảnh (24); câu liên quan không vượt dải.
const phapLyTruoc = chonCauKe(["phap_ly"], [
  { fact_key: "nguoi_dung_ten", priority: 17, nhom: "co_ban" }, { fact_key: "tranh_chap", priority: 20, nhom: "co_ban" },
  { fact_key: "phuong", priority: 22, nhom: "co_ban" }, { fact_key: "hinh_anh", priority: 24, nhom: "co_ban" },
]);
ok("PL229-11 vừa trả lời sổ → câu kế là 'sổ đứng tên ai', không nhảy sang ảnh", phapLyTruoc === "nguoi_dung_ten", String(phapLyTruoc));
// Hết câu pháp lý → câu kế là ẢNH, tức bản nháp như câu sổ trước đây (gấp để nháp lo). Phường còn thiếu thì chat-reply hỏi
// phường trước khi gửi nháp — đo ở e2e RENHANH-04b.
ok("PL229-12 hết câu pháp lý → câu kế là ảnh (bản nháp), không hỏi gấp",
  chonCauKe(["tranh_chap"], [{ fact_key: "gap", priority: 23, nhom: "co_ban" }, { fact_key: "hinh_anh", priority: 24, nhom: "co_ban" }]) === "hinh_anh");
ok("PL229-12b giữa dải pháp lý → câu pháp lý kế, không nhảy sang ảnh",
  chonCauKe(["the_chap"], [{ fact_key: "tranh_chap", priority: 20, nhom: "co_ban" }, { fact_key: "hinh_anh", priority: 24, nhom: "co_ban" }]) === "tranh_chap");
for (const k of ["nguoi_dung_ten", "tranh_chap", "dien_tich_khop_so", "the_chap", "quy_hoach"]) {
  ok(`PL229-13 câu pháp lý '${k}' có câu mẫu + nhãn`, !!CAU_HOI_MAU[k] && !!FACT_LABELS[k], k);
}

// 27/09/2026 (test Zalo, đất Cần Đước 425m2): thổ cư "425m2" = cả lô → không hỏi lên thổ cư.
r = reNhanh({ loai: "dat", deal: "ban", area_m2: 425, facts: [f("tho_cu", "425m2")] }, ["tho_cu"]);
ok("THOCU-01 thổ cư bằng diện tích → KHÔNG hỏi lên thổ cư", !keys(r).includes("len_tho_cu"), JSON.stringify(r.them));
r = reNhanh({ loai: "dat", deal: "ban", area_m2: 425, facts: [f("tho_cu", "200m2")] }, ["tho_cu"]);
ok("THOCU-02 thổ cư một phần → hỏi lên thổ cư", keys(r).includes("len_tho_cu"), JSON.stringify(r.them));

// 01/10/2026 (chủ dự án: "nếu 137/28 thì là hẻm rồi, đường số 59 hoặc đường có tên là đường lớn").
const thieuNha = [{ fact_key: "dien_tich_dat", priority: 3, nhom: "co_ban" }, { fact_key: "do_rong_hem", priority: 7, nhom: "co_ban" }, { fact_key: "gia", priority: 12, nhom: "co_ban" }];
let dsMt = apReNhanh(thieuNha, { loai: "nha_pho", deal: "ban", facts: [f("vi_tri", "156 Nguyễn Trãi")] }, ["vi_tri"]);
ok("MT-01 số nhà trơn '156 Nguyễn Trãi' → hỏi đường trước nhà thay câu hẻm",
  dsMt.some((t) => t.fact_key === "do_rong_duong") && !dsMt.some((t) => t.fact_key === "do_rong_hem"), JSON.stringify(dsMt));
ok("MT-02 câu đường trước nhà giữ chỗ câu hẻm (không chen trước diện tích)", chonCauKe(["vi_tri"], dsMt) === "dien_tich_dat", chonCauKe(["vi_tri"], dsMt));
dsMt = apReNhanh(thieuNha, { loai: "nha_pho", deal: "ban", facts: [f("vi_tri", "156 đường số 59")] }, ["gia"]);
ok("MT-03 '156 đường số 59' ở lượt sau (vừa trả lời giá) → vẫn đường trước nhà", dsMt.some((t) => t.fact_key === "do_rong_duong") && !dsMt.some((t) => t.fact_key === "do_rong_hem"), JSON.stringify(dsMt));
dsMt = apReNhanh(thieuNha, { loai: "nha_pho", deal: "ban", facts: [f("vi_tri", "137/28 Đường số 59")] }, ["vi_tri"]);
ok("MT-04 '137/28' là hẻm → vẫn câu hẻm", dsMt.some((t) => t.fact_key === "do_rong_hem") && !dsMt.some((t) => t.fact_key === "do_rong_duong"), JSON.stringify(dsMt));
dsMt = apReNhanh(thieuNha, { loai: "nha_pho", deal: "ban", facts: [f("vi_tri", "156 Nguyễn Trãi"), f("_mo_ta", "Bán nhà hẻm xe hơi 156 Nguyễn Trãi")] }, ["vi_tri"]);
ok("MT-05 câu rao có chữ hẻm → vẫn câu hẻm", dsMt.some((t) => t.fact_key === "do_rong_hem") && !dsMt.some((t) => t.fact_key === "do_rong_duong"), JSON.stringify(dsMt));
dsMt = apReNhanh([{ fact_key: "do_rong_duong", priority: 5, nhom: "co_ban" }], { loai: "dat", deal: "ban", facts: [f("vi_tri", "156 Nguyễn Trãi")] }, ["vi_tri"]);
ok("MT-06 đất → luật không đụng", dsMt.length === 1 && dsMt[0].priority === 5, JSON.stringify(dsMt));
ok("MT-07 câu đường trước nhà cho nhà phố nói 'mặt tiền … trước nhà'", /mặt tiền.*trước nhà/.test(cauHoiMau("do_rong_duong", "anh", undefined, "nha_pho")));

const moiKhoa = [...new Set(RE_NHANH.flatMap((l) => (l.them ?? []).map((t) => t.fact_key)))];
for (const k of moiKhoa) ok(`câu nhánh '${k}' có câu mẫu + nhãn`, (!!CAU_HOI_MAU[k] || !!CAU_HOI_MAU[`${k}@nha_pho`]) && !!FACT_LABELS[k], k);

// SRS-5.1zzzzzl (test Zalo 13/10): "dễ dàng kinh doanh hoặc cho thuê" là TIỀM NĂNG — bỏ dấu chứa "dang kinh doanh" từng mở nhánh đang cho thuê.
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("bo_sung", "phù hợp cho gia đình hoặc đầu tư · dễ dàng kinh doanh hoặc cho thuê")] }, ["phap_ly"]);
ok("ZZZZZL-RN1 'dễ dàng kinh doanh hoặc cho thuê' → KHÔNG nhánh đang cho thuê, không hỏi hợp đồng / doanh thu", !keys(r).includes("han_hop_dong_thue") && !keys(r).includes("doanh_thu") && !r.luat.includes("dang_cho_thue"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("tiem_nang", "kinh doanh hay cho thuê đều được"), f("bo_sung", "mặt tiền rộng dễ kinh doanh")] }, ["phap_ly"]);
ok("ZZZZZL-RN1b (cách nói mới) ô tiềm năng 'kinh doanh hay cho thuê đều được' → không nhánh đang cho thuê", !r.luat.includes("dang_cho_thue"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("hien_trang_su_dung", "đang ở"), f("bo_sung", "trước đây có cho thuê")] }, ["phap_ly"]);
ok("ZZZZZL-RN2 ô hiện trạng sử dụng 'đang ở' là chủ → không nhánh đang cho thuê", !r.luat.includes("dang_cho_thue"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("hien_trang_su_dung", "đang cho thuê")] }, ["phap_ly"]);
ok("ZZZZZL-RN3 đối chứng hiện trạng 'đang cho thuê' → vẫn hỏi hạn hợp đồng", keys(r).includes("han_hop_dong_thue"), JSON.stringify(r));
r = reNhanh({ loai: "nha_pho", deal: "ban", facts: [f("bo_sung", "nha dang cho thue 15 trieu")] }, ["phap_ly"]);
ok("ZZZZZL-RN4 đối chứng không dấu 'dang cho thue' → vẫn nhánh đang cho thuê", r.luat.includes("dang_cho_thue"), JSON.stringify(r));
console.log(hong ? `\nRẼ NHÁNH: ${hong}/${tong} CA HỎNG` : `\nRẼ NHÁNH: ${tong}/${tong} CA ĐẠT`);
process.exit(hong ? 1 : 0);
