// nhan.mjs — FR-211 (TS-NHAN-01): từ điển nhãn tìm kiếm — nhận đúng, không nhận nhầm, phủ định.
// Tiền định: không mạng, không DB, không model.   bun bot/tests/nhan.mjs
import { ganNhan, laThuanNhan, tenNhan, tenNhanKhongTrung, NHAN_HOP_LE, TU_DIEN_NHAN } from "../supabase/functions/_shared/extraction/nhan.ts";

let hong = 0, tong = 0;
const ok = (ten, dat, chi = "") => { tong++; if (!dat) hong++; console.log(`${dat ? "✓" : "✗"} ${ten}${dat ? "" : `  → ${chi}`}`); };
const la = (cau, mong) => ok(`${JSON.stringify(cau)} → ${mong.join(",") || "∅"}`, ganNhan(cau).join(",") === mong.join(","), ganNhan(cau).join(","));

// PHẢI kích
la("khu này yên tĩnh lắm", ["yen_tinh"]);
la("gần chợ Bình Tây, nhà mới sơn sửa lại", ["gan_cho", "moi_sua"]);
// 18/09 bắn 10 tin thật (mau-x-01…10): dấu phẩy là ranh giới; "tiện xây mới" không phải nhà mới;
// "thang máy" trần khi liệt kê tiện nghi; "phù hợp quán ăn" là kinh doanh được.
la("khu yên tĩnh gần chợ, xe hơi vào tận nhà", ["yen_tinh", "gan_cho", "xe_hoi_vao_nha"]);
la("nhà cũ tiện xây mới, không ngập", ["khong_ngap"]);
la("sân vườn hồ bơi thang máy", ["thang_may", "san_vuon", "ho_boi"]);
la("chưa có thang máy, nhà mới xây", ["moi_sua"]);
la("mặt bằng phù hợp quán ăn", ["kinh_doanh"]);
// FR-244 (kịch bản L1, 29/09/2026): "view hồ bơi" từng gắn "view công viên". Nguyên nhân: mẫu "view hồ" (hồ nước) khớp luôn "view hồ bơi".
la("view hồ bơi", ["ho_boi"]);
la("view hồ Bán Nguyệt", ["view_cong_vien"]);
// 20/09 (4 kịch bản mới, mau-y-*): "ngõ" miền Bắc, "xe hơi vào được nhà" của khách mua.
la("ngõ 3 mét, ngõ thông không ngập, gần trường cấp 1", ["gan_truong", "hem_thong", "khong_ngap"]);
la("khu yên tĩnh gần chợ xe hơi vào được nhà", ["yen_tinh", "gan_cho", "xe_hoi_vao_nha"]);
la("ô tô vào tới nhà", ["xe_hoi_vao_nha"]);
la("xe hơi vào tận nhà, có gara", ["xe_hoi_vao_nha"]);
la("XE HOI VAO NHA duoc", ["xe_hoi_vao_nha"]);
// 23/09 (FR-216): "xe hơi quay đầu" thành nhãn; xe máy / phủ định không kích.
la("hẻm xe hơi quay đầu thoải mái", ["xe_hoi_quay_dau"]);
la("ô tô vào tận nhà, quay đầu xe hơi được", ["xe_hoi_vao_nha", "xe_hoi_quay_dau"]);
la("hẻm 6m xe 7 chỗ quay đầu", ["xe_hoi_quay_dau"]);
la("hẻm xe máy quay đầu được", []);
la("xe hơi không quay đầu được", []);
la("không có chỗ quay đầu xe hơi", []);
la("căn góc 2 mặt tiền view sông full nội thất", ["noi_that_full", "view_song", "can_goc"]);
la("không ngập, dân trí cao, đang cho thuê 15 triệu", ["dan_tri_cao", "khong_ngap", "dong_tien"]);
la("nhà 3 lầu sân thượng có gác lửng", ["san_thuong", "gac_lung"]);
la("gần trường tiểu học, gần bệnh viện Chợ Rẫy, gần siêu thị coop", ["gan_truong", "gan_benh_vien", "gan_sieu_thi"]);
la("hẻm thông ra hai đường, an ninh có bảo vệ 24/24", ["an_ninh", "hem_thong"]);
la("thổ cư 100%, đã hoàn công đầy đủ", ["nha_hoan_cong", "tho_cu_100"]);
la("tìm nhà quận 5 yên tĩnh gần trường học tầm 6 tỷ", ["yen_tinh", "gan_truong"]);
// KHÔNG ĐƯỢC kích (phủ định, chữ trùng nghĩa khác)
la("khu không yên tĩnh, hẻm cụt", ["hem_cut"]);
la("chưa có thang máy", []);
la("ko an ninh lắm", []);
la("bán nhà hẻm 4m Nguyễn Trãi quận 5, 60m2, giá 6 tỷ 5", []);
la("nhà ở từ 2019 rồi", []);
la("Dạ em ghi nhận rồi ạ", []);
la("gần chỗ làm của con", []);
// Từ điển: mọi khoá là snake_case, có tên, regex không rỗng; tenNhan
// 24/09/2026 (chủ dự án test Zalo): "không có tầng lửng" từng thành "có gác lửng" — phủ định có chữ chen giữa, mọi nhãn.
la("không có tầng lửng,", []);
la("chưa có sân thượng", []);
la("ko có gác lửng nha em", []);
la("không có thang máy", []);
la("có gác lửng, không ngập", ["khong_ngap", "gac_lung"]);
la("không ngập, có gác lửng", ["khong_ngap", "gac_lung"]);
ok("mọi khoá snake_case + có tên", Object.entries(TU_DIEN_NHAN).every(([k, n]) => /^[a-z0-9_]+$/.test(k) && n.ten.length >= 3 && n.khop instanceof RegExp));
ok("NHAN_HOP_LE khớp từ điển", NHAN_HOP_LE.size === Object.keys(TU_DIEN_NHAN).length && NHAN_HOP_LE.has("yen_tinh"));
ok("tenNhan: khoá lạ in thẳng", tenNhan(["yen_tinh", "la_lam"]) === "yên tĩnh · la lam", tenNhan(["yen_tinh", "la_lam"]));
ok("tenNhan: rỗng", tenNhan([]) === "" && tenNhan(null) === "");

// 25/09/2026 (bắn thật lx-13): thông số đã in "lửng … sân thượng" thì dòng nhãn không in lặp; nhãn khác vẫn in.
ok("tenNhanKhongTrung: bỏ 'sân thượng', 'có gác lửng' khi thông số đã có; giữ 'yên tĩnh'",
  tenNhanKhongTrung(["san_thuong", "gac_lung", "yen_tinh"], "4x15m · trệt + lửng + 2 lầu + sân thượng · sổ hồng riêng") === "yên tĩnh",
  tenNhanKhongTrung(["san_thuong", "gac_lung", "yen_tinh"], "4x15m · trệt + lửng + 2 lầu + sân thượng · sổ hồng riêng"));
ok("tenNhanKhongTrung: thông số chưa nói → in đủ", tenNhanKhongTrung(["san_thuong"], "4x15m · trệt + 2 lầu") === "sân thượng");
ok("tenNhanKhongTrung: rỗng", tenNhanKhongTrung([], "x") === "" && tenNhanKhongTrung(null, "x") === "");

// 25/09/2026 (bắn thật lx-14): mảnh chỉ nói đúng nhãn đã vào listings.nhan → không ghi "bổ sung" lần hai.
for (const [cau, mong] of [["khu yên tĩnh", true], ["sát chợ", true], ["không ngập", true], ["khu này yên tĩnh lắm", true],
  ["gần chợ Bình Tây", false], ["khu này yên tĩnh, gần chợ Bình Tây", false], ["hàng xóm thân thiện", false], ["yên tĩnh, hàng xóm thân thiện", false], ["mưa lớn không lo dột", false]]) {
  ok(`laThuanNhan('${cau}') → ${mong}`, laThuanNhan(cau) === mong);
}

ok("laThuanNhan: tin CHƯA mang nhãn đó → không trùng (giữ thông tin)", laThuanNhan("khu an ninh", ["yen_tinh"]) === false);
ok("laThuanNhan: tin đang mang nhãn đó → trùng", laThuanNhan("khu an ninh", ["an_ninh", "yen_tinh"]) === true);

ok("ganNhan: 'ô tô vô tận nhà' (miền Nam: vô = vào) → xe hơi vào nhà", ganNhan("ô tô vô tận nhà").includes("xe_hoi_vao_nha"));
// 25/09/2026 (bắn thật lx-19): nhà HÀNG XÓM mới xây không phải nhãn của căn đang rao.
la("hàng xóm mới xây năm 2019 cao hơn nhà em", []);
la("nhà bên cạnh mới xây lại", []);
la("nhà mới xây năm ngoái, 4 tấm", ["moi_sua"]);
// 25/09/2026 (bắn thật lx-21): "có sân thượng" / "có sẵn" không phải sân vườn.
la("có sân thượng nữa em", ["san_thuong"]);
la("nội thất có sẵn", []);
// SRS-5.1zzzzzzw (Zalo thật 14/10/2026): "đăng cho thuê" (đăng tin) không phải "đang cho thuê" (có dòng tiền). Câu có dấu đọc đúng chữ;
// câu không dấu vẫn như cũ (không phân biệt được).
la("Cho chị đăng cho thuê nhà", []);
la("Em muốn Đăng cho thuê căn này", []);
la("nhà đang cho thuê 12 triệu", ["dong_tien"]);
la("nha dang cho thue 12 trieu", ["dong_tien"]);

console.log(hong ? `\nNHÃN: ${hong}/${tong} CA HỎNG` : `\nNHÃN: ${tong}/${tong} CA ĐẠT`);
process.exit(hong ? 1 : 0);
