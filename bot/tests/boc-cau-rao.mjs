// boc-cau-rao.mjs — lượt bắn 14 tin RAO BÁN thật 14/09/2026, phần tiền định.
// Không mạng, không DB, không model.   bun bot/tests/boc-cau-rao.mjs
//
// Phần SQL của cùng lượt bắn (fact "cách mặt tiền" vào cột, "p5" dính tên đường, xe hơi
// trong nhà) ở migration 20260914b.
import { chonGiaRao, dealCauRao, dienTichCauRao, duAnLaTenDuong, DUOI_GIA, laSoNhaHem, ngangDaiCauRao, ngangNhanDai, phuongTenCauRao, phuongTenKhongDau } from "../supabase/functions/_shared/extraction/boc-cau-rao.ts";
import { bocViTriRao, catDapAn, laBoSungRac, laBoSungTrung, namXayTuongDoi, soNhaDau, nhanDienFact, nhanDienNhieuFact, phanLoaiCauTraLoi } from "../supabase/functions/_shared/extraction/khop-cau-tra-loi.ts";

let hong = 0, tong = 0;
const ok = (ten, dat, chi = "") => { tong++; if (!dat) hong++; console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`); };
const kd = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
// Cùng đuôi giá với chat-reply — một nguồn `DUOI_GIA` (15/09).
const gia = (c) => chonGiaRao(c, dealCauRao(kd(c)), DUOI_GIA);
// 15/09/2026 (bắn thật B1): đuôi giá dừng trước chữ của thứ khác.
for (const [c, mong] of [
  ["co lo dat 5x18 thu duc phuong hiep binh chanh gia 6ty2 shr thanh khoan nhanh ko ban", "6ty2"],
  ["bán nhà q5 giá 5 tỷ thương lượng", "5 tỷ thương lượng"],
  ["bán nhà q5 5 tỷ 8 50m2", "5 tỷ 8"],
  ["nhà mặt tiền giá 32 tỷ sổ hồng riêng, 5x20", "32 tỷ"],
  ["bán đất 2 tỷ 3 hẻm xe hơi", "2 tỷ 3"],
  ["cho thuê 25 triệu/tháng full nội thất", "25 triệu/tháng"],
]) ok("đuôi giá " + JSON.stringify(c.slice(0, 40)) + " → " + mong, gia(c)?.trim() === mong, JSON.stringify(gia(c)));

// ── bán hay cho thuê ──
for (const [c, mong] of [
  ["bán nhà mặt tiền đường Châu Văn Liêm phường 14 quận 5, ngang 4.2m dài 18m, đang cho thuê 45 triệu/tháng, giá 32 tỷ còn thương lượng", "ban"],
  ["sang nhượng mặt bằng quán cà phê Quận 1 đường Nguyễn Trãi, 8x20, thuê 60 triệu/tháng, phí sang 350 triệu", "cho_thue"],
  ["Cần sang nhượng căn hộ The Sun Avenue quận 2 3pn 96m2, HĐMB, giá 5 tỷ", "ban"],
  ["cho thuê căn hộ Sunrise City quận 7, 76m2, 18 triệu một tháng", "cho_thue"],
  ["cho thuê nhà nguyên căn, bán cũng được nếu giá tốt", "cho_thue"],
  ["bán nhà có hợp đồng thuê 20 triệu, giá 9 tỷ", "ban"],
  ["gia đình cần tiền nên để lại căn nhà 4x16 hẻm xe hơi Trần Hưng Đạo", "ban"],
  ["bán đất Củ Chi 100m2 thổ cư, 900tr", "ban"],
]) ok(`deal: '${c.slice(0, 60)}…' → ${mong}`, dealCauRao(kd(c)) === mong, dealCauRao(kd(c)));

// ── giá ──
for (const [c, mong] of [
  ["bán nhà mặt tiền Châu Văn Liêm, đang cho thuê 45 triệu/tháng, giá 32 tỷ còn thương lượng", "32 tỷ còn thương lượng"],
  ["sang nhượng mặt bằng Quận 1, 8x20, thuê 60 triệu/tháng, phí sang 350 triệu", "60 triệu/tháng"],
  ["cho thuê nhà nguyên căn, cọc 2 tháng 30 triệu, giá thuê 15 triệu", "15 triệu"],
  ["bán nhà quận 5 phường 7, 50m2, 6 tỷ", "6 tỷ"],
  ["bán nhà q8, hoa hồng 50 triệu, giá 4 tỷ 2", "4 tỷ 2"],
  ["bán đất thổ cư Nhà Bè 120m2, 45tr/m2 tổng 5 tỷ 4, đã có người cọc 200tr nhưng bể cọc", "45tr/m2 tổng 5 tỷ 4"],
  ["anh nói giá 5 tỷ nha em, nhà 4x15", "5 tỷ nha em"] /* đuôi tiểu từ do chuan_hoa_gia_raw gọt; trước 14/09 ra null vì "nói" khớp "no" (nợ) */,
  ["giá 8 tỷ thương lượng, cọc giữ chỗ 100 triệu", "8 tỷ thương lượng"],
  ["thương lượng 7 tỷ 5", "7 tỷ 5"],
]) ok(`giá: '${c.slice(0, 55)}…' → ${mong}`, gia(c) === mong, String(gia(c)));

// ── diện tích, giá mỗi m² ──
ok("diện tích: '62,5m²' → 62.5", dienTichCauRao(kd("diện tích 62,5m², 1 trệt 1 lầu")) === 62.5);
ok("diện tích: '70m2' → 70", dienTichCauRao(kd("DT: 5x14 (70m2)")) === 70);
ok("diện tích: '5x20' không phải m² → null", dienTichCauRao(kd("lô 5x20, đường 12m")) === null);
// 16/09/2026 (Zalo thật): sàn không phải đất.
ok("diện tích: 'nhà 4 tấm diện tích tổng 240m2' → null (sàn)", dienTichCauRao(kd("nhà 4 tấm diện tích tổng 240m2 giá 6 tỷ")) === null);
ok("diện tích: 'diện tích sàn 240m2, đất 60m2' → 60", dienTichCauRao(kd("diện tích sàn 240m2, đất 60m2")) === 60);
ok("diện tích: 'tổng diện tích 500m2' (không tầng) → 500", dienTichCauRao(kd("bán lô đất tổng diện tích 500m2")) === 500);
ok("diện tích: 'dtsd 120m2' → null", dienTichCauRao(kd("căn hộ dtsd 120m2 3pn")) === null);
ok("ngang × dài: '5x20' → 100 (để nhân giá/m²)", ngangNhanDai(kd("lô đất 5x20, giá 95 triệu/m2")) === 100);
ok("ngang × dài: '4.2m x 18m' → 75.6", ngangNhanDai(kd("ngang 4.2m x 18m")) === 75.6);
// FR-243 (kịch bản K3/K8/K9/K10, 29/09/2026): câu rao đầu "4x12" không vào diện tích khi AI im. Nguyên nhân: lúc tạo tin
// chat-reply chỉ đọc "m2" (`dienTichCauRao`); ngang × dài chỉ dùng để nhân giá/m². Nay tách hai chiều ra (`ngangDaiCauRao`).
ok("FR243 ngangDaiCauRao '4x12 trệt 2 lầu giá 7 tỷ' → [4, 12]", JSON.stringify(ngangDaiCauRao(kd("bán nhà hẻm Lý Thường Kiệt Q10 4x12 trệt 2 lầu giá 7 tỷ"))) === "[4,12]");
ok("FR243 ngangDaiCauRao 'ngang 4 dài 15' → [4, 15]", JSON.stringify(ngangDaiCauRao(kd("ngang 4 dài 15"))) === "[4,15]");
ok("FR243 không kích: 'giá 7 tỷ, 60m2' không có ngang × dài → null", ngangDaiCauRao(kd("giá 7 tỷ, 60m2")) === null);
// FR-244 (kịch bản L1/L5, 29/09/2026) — mỗi ca ghi NGUYÊN NHÂN.
// L1: giá "4ty6 phí quản lý 15k/m2". Nguyên nhân: đuôi giá (`DUOI_GIA`) giữ chữ lẻ tới dấu phẩy, không dừng trước "phí quản lý".
ok("FR244 giá dừng trước 'phí quản lý'", gia("bán căn hộ Sunrise City q7 tầng 12 76m2 2pn giá 4ty6 phí quản lý 15k/m2") === "4ty6", String(gia("bán căn hộ Sunrise City q7 tầng 12 76m2 2pn giá 4ty6 phí quản lý 15k/m2")));
ok("FR244 không kích: 'giá 5 tỷ thương lượng' vẫn giữ đuôi", gia("bán nhà q5 giá 5 tỷ thương lượng") === "5 tỷ thương lượng", String(gia("bán nhà q5 giá 5 tỷ thương lượng")));
// L5: "lô đất 5x25 … thổ cư 100m2" → diện tích 100 (lấy nhầm thổ cư). Nguyên nhân: `dienTichCauRao` lấy số m² ĐẦU TIÊN.
ok("FR244 'lô đất 5x25 … thổ cư 100m2' → không lấy 100 làm diện tích", dienTichCauRao(kd("bán lô đất 5x25 Hóc Môn thổ cư 100m2 giá 2 tỷ 9")) === null);
ok("FR244 không kích: 'đất thổ cư 100m2' (không cách nói khác) vẫn là diện tích", dienTichCauRao(kd("bán đất thổ cư 100m2 giá 2 tỷ")) === 100);
ok("FR244 không kích: '150m2 thổ cư 100m2' → 150", dienTichCauRao(kd("bán đất 150m2 thổ cư 100m2")) === 150);
// 20/09/2026 (bắn thật mau-y-D): "ngang 4 dài 15, giá 250 triệu/m2" không có "x" → phải nhân được.
ok("ngang × dài: 'ngang 4 dài 15' → 60", ngangNhanDai(kd("mặt tiền Nguyễn Chí Thanh quận 5, ngang 4 dài 15, giá 250 triệu/m2")) === 60);
ok("ngang × dài: 'ngang 5m, dài 20m' → 100", ngangNhanDai(kd("đất ngang 5m, dài 20m thổ cư")) === 100);
ok("ngang × dài: 'ngang 5m còn dọc 16m' → 80", ngangNhanDai(kd("ngang 5m còn dọc 16m")) === 80);
ok("ngang × dài: chỉ 'ngang 5m' → null", ngangNhanDai(kd("ngang 5m hẻm 4m")) === null);

// ── phường tên chữ ──
ok("phường: 'phường Hiệp Bình Chánh TP Thủ Đức' → Phường Hiệp Bình Chánh", phuongTenCauRao("cần bán nhà phường Hiệp Bình Chánh TP Thủ Đức, 62m2") === "Phường Hiệp Bình Chánh", String(phuongTenCauRao("cần bán nhà phường Hiệp Bình Chánh TP Thủ Đức, 62m2")));
ok("phường: 'Phường Bến Nghé Quận 1' → Phường Bến Nghé", phuongTenCauRao("bán nhà Phường Bến Nghé Quận 1") === "Phường Bến Nghé");
ok("phường: 'phường nào cũng được' (chữ thường) → null", phuongTenCauRao("ở phường nào cũng được") === null);
ok("phường: 'phường 7' (số) → null (soPhuong lo)", phuongTenCauRao("bán nhà phường 7") === null);
// 15/09/2026 (bắn thật B1): phường tên chữ KHÔNG DẤU → tên bỏ dấu để tra `wards`.
for (const [c, mong] of [
  ["co lo dat 5x18 thu duc phuong hiep binh chanh gia 6ty2 shr", "hiep binh chanh"],
  ["ban nha phuong tan hung quan 7 50m2", "tan hung"],
  ["ban nha phuong 7 quan 8", null],
  ["o phuong nao cung duoc", null],
  ["ban nha p. an lac binh tan", "an lac"],
]) ok("phường không dấu " + JSON.stringify(c.slice(0, 40)), phuongTenKhongDau(c) === mong, String(phuongTenKhongDau(c)));

// ── dự án trùng tên đường ──
ok("dự án: 'đường Huỳnh Tấn Phát' không phải 'Căn Hộ Cao Cấp Huỳnh Tấn Phát'", duAnLaTenDuong("Căn Hộ Cao Cấp Huỳnh Tấn Phát", "bán nhà phố quận 7 đường Huỳnh Tấn Phát 5x20 giá 11 tỷ"));
ok("dự án: câu nói 'căn hộ Vinhomes Grand Park' → giữ dự án", !duAnLaTenDuong("The Beverly - Vinhomes Grand Park", "bán căn hộ Vinhomes Grand Park Thủ Đức"));
ok("dự án: 'chung cư Huỳnh Tấn Phát' (có chữ chung cư) → giữ", !duAnLaTenDuong("Căn Hộ Cao Cấp Huỳnh Tấn Phát", "bán căn chung cư Huỳnh Tấn Phát quận 7"));
ok("dự án: tên dự án không trùng đường nào → giữ", !duAnLaTenDuong("Sunrise City", "bán nhà hẻm Nguyễn Hữu Thọ quận 7 gần Sunrise City"));

// ── vị trí trong câu rao ──
for (const [c, mong] of [
  ["nhà cấp 4 hẻm ba gác đường Phạm Thế Hiển p6 q8, 3.5x12", "hẻm ba gác đường Phạm Thế Hiển"],
  ["em bên môi giới ạ, có căn nhà phố Tân Bình đường Cộng Hòa p4, 4x20", "đường Cộng Hòa"],
  ["e bán nhà hxh Nguyễn Kiệm Phú Nhuận 4x15 trệt 2 lầu", "hxh Nguyễn Kiệm"],
  ["anh cần bán căn nhà hẻm xe hơi 5m Nguyễn Trãi phường 3 quận 5", "hẻm xe hơi 5m Nguyễn Trãi"],
  ["bán nhà 123/4 An Dương Vương p8 q5", "123/4 An Dương Vương"],
  ["nhà phố đường An Dương Vương q5", "đường An Dương Vương"],
  ["Hẻm 6m Lê Văn Sỹ, P.13, Q.3", "Hẻm 6m Lê Văn Sỹ"],
  // 15/09/2026 (Zalo thật): "mới làm lại" là lời tả, không phải tên đường.
  ["căn hộ 5 tầng có sổ hồng riêng, đường Lê Văn Việt mới làm lại rất rộng, số nhà tôi là số449", "đường Lê Văn Việt"],
  // 01/10/2026 (bắn thật lx-tam-12): số nhà đứng TRƯỚC chữ "đường" không được rơi; "đường 59" là đường đánh số.
  ["156 đường 59 Tây Thông Hội", "156 đường số 59"],
  ["bán nhà 156 đường 59 thong tay hoi go vap, 4x12", "156 đường số 59"],
  ["156 duong 59", "156 đường số 59"],
  ["nhà số 45 đường Lê Văn Sỹ", "45 đường Lê Văn Sỹ"],
  ["137/28 đường số 59", "137/28 đường số 59"],
  ["sn 12 hẻm 4 Trần Bình Trọng", "12 hẻm 4 Trần Bình Trọng"],
  ["đường 3 tháng 2 quận 10", "đường 3 tháng 2"],
  ["giá 5 tỷ đường Nguyễn Trãi", "đường Nguyễn Trãi"],
  ["dt 50 đường Nguyễn Trãi", "đường Nguyễn Trãi"],
  ["đường 5m xe hơi", null],
]) ok(`vị trí: '${c.slice(0, 50)}' → ${mong}`, bocViTriRao(c) === mong, String(bocViTriRao(c)));

// ── câu bổ sung sau khi tạo tin ──
{
  const f = nhanDienNhieuFact("hẻm rộng tầm 2m5 thôi em, cách mặt tiền 50m");
  const hem = f.find((x) => x.question === "do_rong_hem");
  ok("bổ sung: 'hẻm rộng tầm 2m5' → do_rong_hem 'hẻm 2.5m' (kèm cách mặt tiền 50m)", hem?.answer === "hẻm 2.5m" && f.some((x) => x.question === "cach_mat_tien"), JSON.stringify(f));
}
ok("bổ sung: '5m2' KHÔNG thành hẻm 5.2m", nhanDienFact("hẻm 5m2")?.answer !== "hẻm 5.2m", JSON.stringify(nhanDienFact("hẻm 5m2")));
ok("bổ sung: 'hẻm khoảng 4m' → hẻm 4m", nhanDienFact("hẻm khoảng 4m")?.answer === "hẻm 4m", JSON.stringify(nhanDienFact("hẻm khoảng 4m")));
{
  const t = "à anh nói lại, là đất trống chưa xây nha em";
  const k = phanLoaiCauTraLoi("gap", t);
  ok("gấp: đang hỏi gấp, 'là đất trống chưa xây' → lệch sang loại BĐS (không ghi vào ô gấp)", k.loai === "lech" && k.chuyenSang?.question === "loai_bds", JSON.stringify(k));
  ok("gấp: 'không gấp em' vẫn là câu trả lời gấp", phanLoaiCauTraLoi("gap", "không gấp em, bán được giá thì thôi").loai === "khop");
  ok("gấp: 'cần tiền nên bán nhanh' → khớp", phanLoaiCauTraLoi("gap", "cần tiền nên muốn bán nhanh").loai === "khop");
}
ok("loại: 'đất trống chưa xây' → loai_bds đất trống", nhanDienFact("là đất trống chưa xây nha")?.question === "loai_bds");
ok("loại: 'đất được xây 5 tầng' KHÔNG phải đổi loại", nhanDienFact("đất được xây 5 tầng")?.question !== "loai_bds", JSON.stringify(nhanDienFact("đất được xây 5 tầng")));
{
  const f = nhanDienNhieuFact("🏡 CHÍNH CHỦ BÁN GẤP NHÀ QUẬN 3\n🏢 Kết cấu: 3 tấm, 4PN 3WC\n📜 Sổ hồng riêng, hoàn công đủ");
  const pl = f.find((x) => x.question === "phap_ly");
  ok("rao Facebook: đáp án bỏ biểu tượng + nhãn ('📜 Sổ hồng riêng' → 'Sổ hồng riêng')", pl?.answer === "Sổ hồng riêng", JSON.stringify(f));
}

{
  // 24/09/2026 (xuất prompt lượt Trần Đình Xu): "và" giữa hai số không phải ranh mảnh; "tầng 1 và 2" không phải căn hộ tầng 1.
  const f = nhanDienNhieuFact("4 phòng ngủ em, còn tầng 1 và 2 là để kinh doanh");
  ok("'tầng 1 và 2 là để kinh doanh' → không cắt ra '2 là để kinh doanh'", !f.some((x) => /^2 là/.test(x.answer)), JSON.stringify(f));
  ok("'tầng 1 và 2' của nhà phố không thành tang=1", !f.some((x) => x.question === "tang"), JSON.stringify(f));
  ok("vẫn đọc 4 phòng ngủ", f.some((x) => x.question === "so_phong_ngu" && x.answer === "4"), JSON.stringify(f));
  const g = nhanDienNhieuFact("3 phòng ngủ và 2 wc");
  ok("'3 phòng ngủ và 2 wc' vẫn tách hai mảnh", g.some((x) => x.question === "so_wc" && x.answer === "2"), JSON.stringify(g));
  ok("'căn hộ tầng 12' vẫn là tang", nhanDienFact("căn hộ tầng 12 em")?.question === "tang");
}

{
  // FR-223 (bắn thật 24/09, rn-test-h): hỏi TIỀN THUÊ mà đáp một số tiền → khớp, KHÔNG lệch sang giá bán.
  ok("hỏi doanh_thu, đáp '150 triệu một tháng em' → khớp (không chuyển sang gia)", phanLoaiCauTraLoi("doanh_thu", "150 triệu một tháng em").loai === "khop", JSON.stringify(phanLoaiCauTraLoi("doanh_thu", "150 triệu một tháng em")));
  ok("hỏi tien_coc, đáp '2 tháng tiền nhà, tầm 30 triệu' → không lệch sang gia", phanLoaiCauTraLoi("tien_coc", "30 triệu em").chuyenSang?.question !== "gia", JSON.stringify(phanLoaiCauTraLoi("tien_coc", "30 triệu em")));
  ok("hỏi GIÁ vẫn nhận tiền như cũ", phanLoaiCauTraLoi("gia", "25 tỷ em").loai === "khop");
}

// 24/09/2026 (chủ dự án test Zalo, tin 152 Trần Đình Xu): hợp đồng THUÊ không phải pháp lý; mảnh rác không vào "📝 Thêm".
{
  const q = (s) => nhanDienFact(s)?.question;
  ok("'Hợp đồng 10 năm cho thuê 4 năm rồi đó' → han_hop_dong_thue (không phải pháp lý)", q("Hợp đồng 10 năm cho thuê 4 năm rồi đó") === "han_hop_dong_thue", q("Hợp đồng 10 năm cho thuê 4 năm rồi đó"));
  ok("'hợp đồng 10 năm' → han_hop_dong_thue", q("hợp đồng 10 năm") === "han_hop_dong_thue");
  ok("'còn hợp đồng 6 năm' → han_hop_dong_thue", q("còn hợp đồng 6 năm") === "han_hop_dong_thue");
  ok("'hợp đồng mua bán công chứng' vẫn là pháp lý", q("hợp đồng mua bán công chứng") === "phap_ly");
  ok("'HĐMB' vẫn là pháp lý", q("HĐMB") === "phap_ly");
  ok("hỏi 'thuê tối thiểu', đáp 'hợp đồng 1 năm' → khớp", phanLoaiCauTraLoi("thoi_han_thue", "hợp đồng 1 năm").loai === "khop");
  ok("hỏi hạn hợp đồng, đáp 'Hợp đồng 10 năm cho thuê 4 năm rồi đó' → khớp", phanLoaiCauTraLoi("han_hop_dong_thue", "Hợp đồng 10 năm cho thuê 4 năm rồi đó").loai === "khop");
  for (const r of ["Quận 1 em ơi", "mới", "phường 2 nha", "ok em"]) ok(`rác bổ sung: ${JSON.stringify(r)}`, laBoSungRac(r));
  // 01/10/2026 (chủ dự án test Zalo): "hình đây" gửi kèm album → "📝 Thêm: hình đây". Câu đưa ảnh không phải thông tin.
  for (const r of ["hình đây", "Hình đây em", "ảnh nè", "gửi hình nhé", "anh gửi ảnh nha", "vài tấm hình nè"]) ok(`rác bổ sung (câu đưa ảnh): ${JSON.stringify(r)}`, laBoSungRac(r));
  for (const r of ["hình đẹp mà sơn mới", "ảnh hưởng quy hoạch", "nhà có hình rồng ở cổng"]) ok(`KHÔNG rác (có chữ hình/ảnh nhưng là thông tin): ${JSON.stringify(r)}`, !laBoSungRac(r));
  for (const r of ["ko có lửng", "tầng 1 và 2 để kinh doanh đang cho techcombank thuê", "sổ đỏ", "gần chợ Bình Tây", "khu an ninh"]) ok(`KHÔNG rác: ${JSON.stringify(r)}`, !laBoSungRac(r));
}

// 24/09/2026 — bắn 10 tin bán đủ loại trên production (ID giả bn10-*).
{
  const ph = (t) => phuongTenCauRao(t);
  ok("rao 'xã Phước Vĩnh An huyện Củ Chi' → Xã Phước Vĩnh An", ph("Bán đất vườn 2000m2 xã Phước Vĩnh An huyện Củ Chi") === "Xã Phước Vĩnh An", ph("Bán đất vườn 2000m2 xã Phước Vĩnh An huyện Củ Chi"));
  ok("rao 'xã Tân Kiên Bình Chánh' → Xã Tân Kiên (cắt tên huyện dính liền)", ph("Bán kho xưởng 1500m2 xã Tân Kiên Bình Chánh, cao 10m") === "Xã Tân Kiên", ph("Bán kho xưởng 1500m2 xã Tân Kiên Bình Chánh, cao 10m"));
  ok("rao 'thị trấn Nhà Bè' → Thị trấn Nhà Bè", ph("Bán nhà hẻm 4m Huỳnh Tấn Phát thị trấn Nhà Bè, 4x12") === "Thị trấn Nhà Bè");
  ok("'phường Bến Thành' giữ nguyên (không cắt 'Thành')", ph("nhà phường Bến Thành") === "Phường Bến Thành", ph("nhà phường Bến Thành"));
  ok("'Phường Hiệp Bình Chánh' không bị cắt thành 'Hiệp'", ph("Phường Hiệp Bình Chánh TP Thủ Đức") === "Phường Hiệp Bình Chánh", ph("Phường Hiệp Bình Chánh TP Thủ Đức"));
  const nn = (t) => nhanDienNhieuFact(t);
  const bt = nn("Bán biệt thự sân vườn Thảo Điền quận 2, đất 300m2, 1 hầm 1 trệt 2 lầu, có hồ bơi");
  ok("'biệt thự sân vườn … quận 2' → KHÔNG ghi cả câu vào ô sân vườn", !bt.some((f) => f.question === "san_vuon"), JSON.stringify(bt));
  ok("'sân trước 20m2' vẫn là sân vườn", nn("sân trước 20m2").some((f) => f.question === "san_vuon" && f.answer === "sân trước 20m2"));
  ok("'cao 10m như anh nói rồi' → chiều cao 10m", nn("cao 10m như anh nói rồi").some((f) => f.question === "chieu_cao" && f.answer === "10m"));
  const chdv = nn("Bán tòa nhà CHDV 20 phòng hẻm 8m Cộng Hòa, 8x20, lấp đầy 100%");
  ok("'toà nhà CHDV 20 phòng' → số phòng 20, KHÔNG phải 20 phòng ngủ", chdv.some((f) => f.question === "so_phong" && f.answer === "20") && !chdv.some((f) => f.question === "so_phong_ngu"), JSON.stringify(chdv));
  ok("'2 lầu 3 phòng' (nhà ở) vẫn là 3 phòng ngủ", nn("2 lầu 3 phòng 2 wc").some((f) => f.question === "so_phong_ngu" && f.answer === "3"));
  ok("'vẫn bán nha em, không phải cho thuê' → loại giao dịch BÁN", nhanDienFact("vẫn bán nha em, không phải cho thuê")?.answer === "ban");
}

// 25/09/2026: số nhà có xuyệt → nhà trong hẻm (hỏi xác nhận); số trần → không suy ra gì.
{
  ok("'105/12 Trần Bình Trọng' → số nhà hẻm", laSoNhaHem("105/12 Trần Bình Trọng"));
  ok("'hẻm 12/3A Lê Lợi' → số nhà hẻm", laSoNhaHem("hẻm 12/3A Lê Lợi"));
  ok("'45 / 7 Nguyễn Trãi' (cách quanh xuyệt) → số nhà hẻm", laSoNhaHem("45 / 7 Nguyễn Trãi, Quận 5"));
  ok("'105 Trần Bình Trọng' → KHÔNG suy ra", !laSoNhaHem("105 Trần Bình Trọng, Quận 10"));
  ok("'Đường 3/2 Quận 10' → KHÔNG (tên đường)", !laSoNhaHem("Đường 3/2 Quận 10"));
  ok("rỗng → KHÔNG", !laSoNhaHem(null) && !laSoNhaHem(""));
}

// 25/09/2026 (chủ dự án "làm sao cho nó bóc thông tin đúng và ko ghi trùng"): mảnh bổ sung chỉ nói lại ô đã có → trùng.
{
  const ca = [
    ["xe hơi không vào được", { facts: { do_rong_hem: "3m" }, access_type: "hem_xe_may", alley_width_m: 3 }, true],
    ["xe hơi vào tới cửa (ô đang ghi hẻm xe máy) → thông tin mới, giữ", { facts: { do_rong_hem: "3m" }, access_type: "hem_xe_may", alley_width_m: 3 }, false, "xe hơi vào tới cửa"],
    ["xe hơi vào tới cửa", { facts: { do_rong_hem: "hẻm xe hơi 5m" }, access_type: "hem_xe_hoi" }, true],
    ["hẻm thông ra chợ", { facts: { do_rong_hem: "4m" }, access_type: "hem_xe_hoi" }, false],
    ["xe hơi không vào được (chưa có ô hẻm)", {}, false, "xe hơi không vào được"],
    ["sân thượng", { floors_text: "trệt + lửng + 2 lầu + sân thượng" }, true],
    ["ko có lửng", { floors_text: "trệt + 4 lầu" }, true],
    ["có gác lửng (kết cấu chưa có lửng) → mới", { floors_text: "trệt + 2 lầu" }, false, "có gác lửng"],
    ["có gác lửng", { floors_text: "trệt + lửng + 2 lầu" }, true],
    ["tầng trệt trần cao 4m thông suốt không vách ngăn", { floors_text: "trệt + 1 lầu" }, false],
    ["sổ hồng riêng", { legal_status: "so_hong_rieng" }, true],
    ["sổ hồng riêng chính chủ", { legal_status: "so_hong_rieng" }, false],
    ["chưa có sổ", { legal_status: "so_hong_rieng" }, false],
    ["mưa lớn không lo dột", { floors_text: "trệt + 2 lầu" }, false],
    ["tầng 1 và 2 để kinh doanh đang cho techcombank thuê", { floors_text: "trệt + 4 lầu" }, false],
  ];
  for (const [ten, c, mong, cau] of ca) ok(`TRUNG '${ten}' → ${mong ? "trùng" : "giữ"}`, laBoSungTrung(cau ?? ten, c) === mong);
}

// 25/09/2026 (dữ liệu thật: pháp lý "Shr em"): chữ đệm / xưng hô viết thường ở cuối câu trả lời không vào ô; tên riêng giữ.
{
  const ca = [["phap_ly", "Shr em", "Shr"], ["phap_ly", "sổ hồng riêng rồi em", "sổ hồng riêng rồi"], ["do_rong_hem", "hẻm 3m thôi nha", "hẻm 3m thôi"],
    ["vi_tri", "12 Cô Giang", "12 Cô Giang"], ["vi_tri", "45 Lê Văn Anh", "45 Lê Văn Anh"], ["ket_cau", "1 trệt 4 lầu đó anh", "1 trệt 4 lầu"],
    ["gap", "em", "em"], ["hoan_cong", "hoàn công rồi", "hoàn công rồi"]];
  for (const [q, a, m] of ca) ok(`DEM '${a}' (${q}) → '${m}'`, catDapAn(q, a) === m, catDapAn(q, a));
}

// 25/09/2026 (ảnh chat thật, "hxh nó vẫn ko đọc được"): đang hỏi hẻm, câu nói LOẠI đường vào là khớp (không cần số mét).
{
  for (const cau of ["hxh", "HXH", "hẻm xe hơi", "ô tô vô tận nhà", "xe hơi vào tận nhà", "HXH quay đầu", "hẻm ba gác", "xe hơi không vào được", "hẻm xe máy", "mặt tiền", "hẻm 4m"]) {
    ok(`HEM '${cau}' khi hỏi hẻm → khớp`, phanLoaiCauTraLoi("do_rong_hem", cau).loai === "khop", JSON.stringify(phanLoaiCauTraLoi("do_rong_hem", cau)));
  }
  ok("HEM 'cách mặt tiền 30m' khi hỏi hẻm → KHÔNG khớp (khoảng cách, không phải loại đường vào)", phanLoaiCauTraLoi("do_rong_hem", "cách mặt tiền 30m").loai !== "khop");
  ok("HEM 'đúng rồi' khi hỏi hẻm → KHÔNG khớp", phanLoaiCauTraLoi("do_rong_hem", "đúng rồi").loai !== "khop");
  ok("HEM 'hxh' → ghi 'hẻm xe hơi'", catDapAn("do_rong_hem", "hxh") === "hẻm xe hơi");
  // 27/09/2026 (chủ dự án test Zalo): "Hxm nhé" — kèm tiểu từ vẫn là cụm viết tắt, và là hẻm XE MÁY.
  ok("HEM 'Hxm nhé' → 'hẻm xe máy'", catDapAn("do_rong_hem", "Hxm nhé") === "hẻm xe máy", catDapAn("do_rong_hem", "Hxm nhé"));
  ok("HEM 'hxh nha em' → 'hẻm xe hơi'", catDapAn("do_rong_hem", "hxh nha em") === "hẻm xe hơi");
  // 27/09/2026 (test Zalo): "sổ riêng. chính chủ. ba a dứng tên" — mảnh người đứng tên tách riêng, không mất vào bổ sung.
  const nd = nhanDienNhieuFact("sổ riêng. chính chủ. ba a dứng tên");
  ok("DUNGTEN 'sổ riêng. chính chủ. ba a dứng tên' → pháp lý + người đứng tên", nd.some((f) => f.question === "phap_ly") && nd.some((f) => f.question === "nguoi_dung_ten" && /ba a/.test(f.answer)), JSON.stringify(nd));
  ok("PHUONG 'Ở cầu kho em ơi' → 'cầu kho'", catDapAn("phuong", "Ở cầu kho em ơi") === "cầu kho", catDapAn("phuong", "Ở cầu kho em ơi"));
  ok("DUNGTEN 'đứng tên chung với vợ' không phải câu người đứng tên (câu sổ chung)", !nhanDienNhieuFact("đứng tên chung với vợ").some((f) => f.question === "nguoi_dung_ten"));
  ok("HEM 'ô tô vô tận nhà' không còn thành tiềm năng", nhanDienFact("ô tô vô tận nhà")?.question === "do_rong_hem", JSON.stringify(nhanDienFact("ô tô vô tận nhà")));
  ok("HEM 'để ở hoặc cho thuê' vẫn là tiềm năng", nhanDienFact("để ở hoặc cho thuê")?.question === "tiem_nang");
}

// FR-225 (25/09/2026, chủ dự án test Zalo …3057): "sang tên 1 nốt nhạc ko phải tiện ích"; "nhãn mới sửa mới xây ghi lại".
{
  const q = (s) => JSON.stringify(nhanDienNhieuFact(s).map((x) => [x.question, x.answer]));
  ok("FR225 'sang tên công chứng 1 nốt nhạc' KHÔNG phải tiện ích gần", !nhanDienNhieuFact("sang tên công chứng 1 nốt nhạc").some((x) => x.question === "tien_ich_gan"), q("sang tên công chứng 1 nốt nhạc"));
  ok("FR225 'gần phòng công chứng, trường học' vẫn là tiện ích gần", nhanDienNhieuFact("gần phòng công chứng, trường học").some((x) => x.question === "tien_ich_gan"), q("gần phòng công chứng, trường học"));
  const nam = new Date(Date.now() + 7 * 3600e3).getUTCFullYear();
  ok("FR225 'nhà mới xây năm ngoái, 4 tấm' → năm xây = năm ngoái (số) + kết cấu", nhanDienNhieuFact("nhà mới xây năm ngoái, 4 tấm").some((x) => x.question === "nam_xay" && x.answer === String(nam - 1)), q("nhà mới xây năm ngoái, 4 tấm"));
  ok("FR225 namXayTuongDoi: 'xay nam nay' / 'xay nam kia' / không có → null", namXayTuongDoi("xay nam nay") === String(nam) && namXayTuongDoi("xay nam kia") === String(nam - 2) && namXayTuongDoi("nam ngoai ban") === null);
  ok("FR225 'hàng xóm mới xây năm 2019' KHÔNG thành năm xây căn này", !nhanDienNhieuFact("hàng xóm mới xây năm 2019 cao hơn nhà em").some((x) => x.question === "nam_xay"), q("hàng xóm mới xây năm 2019 cao hơn nhà em"));
  ok("FR225 câu năm xây đáp 'năm ngoái' → ô ghi năm số (trigger đọc 4 chữ số)", catDapAn("nam_xay", "năm ngoái") === `${nam - 1} (năm ngoái)`, catDapAn("nam_xay", "năm ngoái"));
  ok("FR225 câu năm xây đáp '2019' giữ nguyên", catDapAn("nam_xay", "2019") === "2019", catDapAn("nam_xay", "2019"));
  const ca = [
    ["nhà mới xây năm ngoái", { nhan: ["moi_sua"] }, true],
    ["nhà mới xây năm ngoái", { facts: { nam_xay: "2025" } }, true],
    ["nhà mới xây năm ngoái", {}, false],
    ["nhà mới xây năm ngoái, thiết kế châu Âu", { nhan: ["moi_sua"] }, false],
    ["nở hậu nhé", { facts: { no_hau: "6m" } }, true],
    ["nở hậu nhé", { rear_width_m: 6 }, true],
    ["nở hậu nhé", {}, false],
    ["nở hậu, khuôn đất đẹp", { rear_width_m: 6 }, false],
  ];
  // Bắn thật lx-19 sau #299: "nhà trong hẻm" (ở TRONG) từng thành hiện trạng "nhà trống"; câu hàng xóm thành hiện trạng.
  ok("FR225 'nhà trong hẻm, xe hơi chạy vô tới cửa' KHÔNG thành hiện trạng / nội thất 'nhà trống'", !nhanDienNhieuFact("nhà trong hẻm, xe hơi chạy vô tới cửa luôn").some((x) => ["hien_trang_su_dung", "noi_that"].includes(x.question)), q("nhà trong hẻm, xe hơi chạy vô tới cửa luôn"));
  ok("FR225 'nhà trống, giao ngay' vẫn đọc được", nhanDienNhieuFact("nhà trống, giao ngay").length > 0, q("nhà trống, giao ngay"));
  ok("FR225 'hàng xóm mới xây năm 2019 …' KHÔNG thành hiện trạng", !nhanDienNhieuFact("hàng xóm mới xây năm 2019 cao hơn nhà em").some((x) => x.question === "hien_trang"), q("hàng xóm mới xây năm 2019 cao hơn nhà em"));
  for (const [cau, c, mong] of ca) ok(`FR225 TRUNG '${cau}' ${JSON.stringify(c)} → ${mong ? "trùng" : "giữ"}`, laBoSungTrung(cau, c) === mong);
}

// FR-226 b (25/09/2026): số nhà nhỏ giọt "số 45 nha" ghép vào địa chỉ đang có; số trần không có chữ "số" thì không.
ok("FR226 soNhaDau 'số 45 nha' → 45; '137/28 nhé em' → 137/28; '45' trần / '4 tỷ' → null",
  soNhaDau("số 45 nha")?.soNha === "45" && soNhaDau("137/28 nhé em")?.soNha === "137/28" && soNhaDau("45") === null && soNhaDau("4 tỷ") === null,
  JSON.stringify([soNhaDau("số 45 nha"), soNhaDau("137/28 nhé em"), soNhaDau("45"), soNhaDau("4 tỷ")]));
ok("FR226 câu hẻm 'hxh, 5x12, trệt 3 lầu' → ô hẻm 'hẻm xe hơi' (không 'hxh' trần)", catDapAn("do_rong_hem", "hxh, 5x12, trệt 3 lầu") === "hẻm xe hơi", catDapAn("do_rong_hem", "hxh, 5x12, trệt 3 lầu"));

// FR-239 b/m (phát lại test 27–28/09).
ok("FR239 'Chưa xây gì hết em nhà cấp 4' → KHÔNG loai_bds đất trống", !nhanDienNhieuFact("Chưa xây gì hết em nhà cấp 4").some((f) => f.question === "loai_bds"), JSON.stringify(nhanDienNhieuFact("Chưa xây gì hết em nhà cấp 4")));
ok("FR239 'là đất trống chưa xây nha em' vẫn → loai_bds đất trống", nhanDienNhieuFact("à anh nói lại, là đất trống chưa xây nha em").some((f) => f.question === "loai_bds" && f.answer === "đất trống"));
ok("FR239 'chưa xây em' (không nói nhà) vẫn → đất trống", nhanDienNhieuFact("chưa xây em").some((f) => f.question === "loai_bds"));
ok("FR239 rác bổ sung: 'Cần đước, long an á e' (chỉ địa bàn)", laBoSungRac("Cần đước, long an á e"));
ok("FR239 KHÔNG rác: 'gần chợ Bình Chánh, Long An'", !laBoSungRac("gần chợ Bình Chánh, Long An"));
ok("FR239 trùng: 'thổ cư' khi ô thổ cư đã có", laBoSungTrung("thổ cư", { facts: { tho_cu: "425m2" } }));
ok("FR239 KHÔNG trùng: 'thổ cư' khi ô thổ cư trống", !laBoSungTrung("thổ cư", { facts: {} }));
ok("FR239 KHÔNG trùng: 'thổ cư lên được thêm' (thông tin mới)", !laBoSungTrung("thổ cư lên được thêm", { facts: { tho_cu: "100%" } }));

// 05/10/2026 (SRS-5.1zy): "Tổng diện tích sàn: 245m²" (có dấu hai chấm) không phải diện tích đất.
ok("DS-12 'Diện tích đất: 4m x 11m / Tổng diện tích sàn: 245m²' → không lấy 245 làm đất", dienTichCauRao(kd("Diện tích đất: 4m x 11m\nTổng diện tích sàn: 245m²\nKết cấu: 6 tầng")) === null);
ok("DS-13 'Diện tích đất: 60m2, Tổng diện tích sàn: 245m²' → 60", dienTichCauRao(kd("Diện tích đất: 60m2, Tổng diện tích sàn: 245m²")) === 60);
ok("DS-14 (mới) 'DTSD: 180m2, đất 50m2' → 50", dienTichCauRao(kd("nhà 3 lầu, DTSD: 180m2, đất 50m2")) === 50);

console.log(hong ? `\nBÓC CÂU RAO: ${hong}/${tong} CA HỎNG` : `\nBÓC CÂU RAO: ${tong}/${tong} CA ĐẠT`);
process.exit(hong ? 1 : 0);
