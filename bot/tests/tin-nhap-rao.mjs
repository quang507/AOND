// tin-nhap-rao.mjs — BẢN NHÁP TIN RAO phải đọc như một tin rao thật (mẫu tin lẻ
// mogi.vn). Tiền định: không mạng, không DB, không model.
//   bun bot/tests/tin-nhap-rao.mjs         # kiểm
//   bun bot/tests/tin-nhap-rao.mjs --in    # in cả ba bản nháp mẫu để đọc bằng mắt
//
// Ba mẫu dưới đây là ba hình dạng hay gặp nhất của rổ hàng: nhà phố hẻm xe hơi
// (đủ thông số), căn hộ CHO THUÊ (điều kiện thuê), và đất (chỉ có vài dòng).
import { soanTinNhap, soanTinNhapHaiBong, tieuDeTin, tieuDeTinLe, themTenChungCu } from "../supabase/functions/_shared/tin-nhap.ts";
import { CAU_TIEN_DINH, dienCau } from "../supabase/functions/_shared/prompts.ts";

const cachGoi = "anh";
const cauTD = (khoa, o = {}) =>
  dienCau(CAU_TIEN_DINH[khoa] ?? "", { ...o, ac: cachGoi, Ac: "Anh", web: "aioinhadat.vercel.app", ten: "R•ai" });

const NHA_PHO = {
  l: {
    code: "BDS-NP-Q5-0016", property_type: "nha_pho", deal: "ban",
    location_raw: "hẻm 5m Nguyễn Trãi", ward: "Phường 3", district: "Quận 5",
    area_m2: 60, price_raw: "7 tỷ 2", bedrooms: 3, bathrooms: 2,
    floors: 3, floors_text: "trệt + 2 lầu", frontage_m: 4, length_m: 15,
    access_type: "hem_xe_hoi", alley_width_m: 5,
    legal_status: "so_hong_rieng", has_completion: true, direction: "Đông Nam",
    negotiable: true, gap: false,
  },
  facts: [
    { question: "tiem_nang", answer: "ở hoặc cho thuê" },
    { question: "tien_ich_gan", answer: "gần chợ An Đông, trường Hùng Vương" },
    { question: "hien_trang", answer: "nhà mới sửa 2024" },
    // 17/09/2026: kiến thức thêm (AI đọc / chủ nhà nói lệch câu hỏi) → dòng "📝 Thêm", cũ trước, không lặp.
    { question: "bo_sung", answer: "gần chợ bình tây" },
    { question: "bo_sung", answer: "gần chợ Bình Tây" },
    { question: "bo_sung", answer: "khu an ninh" },
  ],
  diem: 82, thieu: ["vài tấm ảnh (nhà, sổ, hẻm — ảnh nào cũng được)"], soAnh: 0,
};

const CAN_HO_THUE = {
  l: {
    code: "BDS-CH-Q7-0003", property_type: "chung_cu", deal: "cho_thue",
    location_raw: "Sunrise City, đường Nguyễn Hữu Thọ", ward: "Phường Tân Hưng", district: "Quận 7",
    area_m2: 76, price_raw: "18 triệu", bedrooms: 2, bathrooms: 2, floor: 15,
    furnishing: "full nội thất", legal_status: null, negotiable: false,
  },
  facts: [
    { question: "tien_coc", answer: "cọc 2 tháng" },
    { question: "thoi_han_thue", answer: "1 năm" },
    { question: "phi_quan_ly", answer: "14 nghìn/m2" },
    { question: "view", answer: "view sông" },
  ],
  diem: 74, thieu: ["vài tấm ảnh (nhà, sổ, hẻm — ảnh nào cũng được)"], soAnh: 2,
};

const DAT = {
  l: {
    code: "BDS-DAT-CUCHI-0001", property_type: "dat", deal: "ban",
    location_raw: null, ward: null, district: "Huyện Củ Chi",
    area_m2: 100, price_raw: "900tr", gap: true,
  },
  facts: [{ question: "tho_cu", answer: "100m2" }],
  diem: 47, thieu: ["chiều ngang mặt tiền", "pháp lý (loại sổ, hoàn công)"], soAnh: 0,
};

const dung = (m, lai = false) => soanTinNhap({ ...m, lai, cauTD });
const fact = (m) => (k) => m.facts.find((f) => f.question === k)?.answer ?? null;

if (process.argv.includes("--in")) {
  for (const m of [NHA_PHO, CAN_HO_THUE, DAT]) {
    console.log("═".repeat(76));
    console.log(dung(m));
    console.log();
  }
  process.exit(0);
}

let dat = 0, hong = 0;
const la = (ten, ok, chiTiet = "") => {
  if (ok) { dat++; console.log(`\x1b[32m✓\x1b[0m ${ten}`); }
  else { hong++; console.log(`\x1b[31m✗\x1b[0m ${ten}${chiTiet ? "\n    " + chiTiet : ""}`); }
};

console.log("BẢN NHÁP TIN RAO — đọc như tin lẻ trên mogi\n");

const tdNha = tieuDeTin(NHA_PHO.l, fact(NHA_PHO), NHA_PHO.facts);
const tdNhaLe = tieuDeTinLe(NHA_PHO.l, fact(NHA_PHO));
la("tiêu đề kiểu tin lẻ (cho thuê / chưa giá): cụm tách bằng dấu phẩy — chỗ nào, bao nhiêu m², nhà thế nào, giấy tờ, KẾT bằng giá",
  /^Bán nhà hẻm xe hơi 5m Nguyễn Trãi P\.3 Q\.5, 60m², trệt \+ 2 lầu, 3PN, SHR, giá 7 tỷ 2$/.test(tdNhaLe), tdNhaLe);
la("tiêu đề KHÔNG lặp 'hẻm 5m' hai lần", (tdNhaLe.match(/hẻm/gi) ?? []).length === 1, tdNha);
la("tiêu đề ≤ 120 ký tự", tdNhaLe.length <= 120, `${tdNhaLe.length} ký tự`);
// 01/10/2026 (bắn thật lx-tam-42): số nhà đứng trước "hẻm 4m" → tiêu đề từng lặp "hẻm xe hơi 4m 12 hẻm 4m Trần Bình Trọng".
{
  const l12 = { ...NHA_PHO.l, location_raw: "12 hẻm 4m Trần Bình Trọng", alley_width_m: 4 };
  const td12 = tieuDeTinLe(l12, fact(NHA_PHO));
  la("tiêu đề: '12 hẻm 4m Trần Bình Trọng' → không lặp chữ hẻm, giữ số nhà 12", (td12.match(/hẻm/gi) ?? []).length === 1 && /\b12 Trần Bình Trọng\b/.test(td12), td12);
}

// SRS-5.1zzzzy (khách mô phỏng 11/10): "MT Trần Hưng Đạo" → địa chỉ "Mặt tiền Trần Hưng Đạo" → tiêu đề từng ra "nhà mặt tiền mặt tiền …";
// "hẻm khoảng 2-3 mét" → cột 2, tin từng in "hẻm 2m".
{
  const lMt = { ...NHA_PHO.l, location_raw: "Mặt tiền Trần Hưng Đạo", access_type: "mat_tien", alley_width_m: null };
  const tdMt = tieuDeTinLe(lMt, fact(NHA_PHO));
  la("ZZZZY-T1 (ca gốc) địa chỉ 'Mặt tiền Trần Hưng Đạo' + đường vào mặt tiền → tiêu đề một lần 'mặt tiền'", (tdMt.match(/mặt tiền/gi) ?? []).length === 1 && /Trần Hưng Đạo/.test(tdMt), tdMt);
  const tdMt2 = tieuDeTinLe({ ...lMt, location_raw: "MTKD Hai Bà Trưng" }, fact(NHA_PHO));
  la("ZZZZY-T2 (cách viết mới) 'MTKD Hai Bà Trưng' → không 'mặt tiền MTKD'", !/MTKD/i.test(tdMt2) && (tdMt2.match(/mặt tiền/gi) ?? []).length === 1, tdMt2);
  const khoang = { ...NHA_PHO, facts: [...NHA_PHO.facts, { question: "do_rong_hem", answer: "2-3" }] };
  const lK = { ...NHA_PHO.l, location_raw: "hẻm Phan Xích Long", access_type: "hem_xe_may", alley_width_m: 2 };
  const tdK = tieuDeTinLe(lK, fact(khoang));
  const banK = soanTinNhap({ l: lK, facts: khoang.facts, diem: 80, thieu: [], soAnh: 0, lai: false, cauTD });
  la("ZZZZY-T3 (ca gốc) hẻm '2-3' (cột 2) → tiêu đề và dòng đường vào in 'hẻm 2-3m', không 'hẻm 2m'", /hẻm 2-3m/.test(tdK) && /Đường vào: [^\n]*2-3m/.test(banK) && !/\b2m\b/.test(banK), tdK + " || " + banK);
  const kD = { ...NHA_PHO, facts: [...NHA_PHO.facts, { question: "do_rong_hem", answer: "khoảng 3 tới 4 mét" }] };
  const tdD = tieuDeTinLe({ ...lK, alley_width_m: 3 }, fact(kD));
  la("ZZZZY-T4 (cách nói mới) 'khoảng 3 tới 4 mét' → 'hẻm 3-4m'", /hẻm 3-4m/.test(tdD), tdD);
  const tdN = tieuDeTinLe({ ...lK, alley_width_m: 5 }, fact(khoang));
  la("ZZZZY-T5 đối chứng: khoảng không khớp số trong cột (cột 5, fact 2-3) → in đúng cột 5m", /hẻm 5m/.test(tdN), tdN);
}

const tdThue = tieuDeTin(CAN_HO_THUE.l, fact(CAN_HO_THUE));
la("tiêu đề cho thuê: mở bằng 'Cho thuê căn hộ', giá kèm '/tháng'",
  /^Cho thuê căn hộ/.test(tdThue) && /giá 18 triệu\/tháng$/.test(tdThue), tdThue);

const tdDat = tieuDeTinLe(DAT.l, fact(DAT));
la("tin thiếu đường/kết cấu vẫn ra tiêu đề gọn, có 'cần bán gấp'",
  /^Bán đất Huyện Củ Chi, 100m², cần bán gấp, giá 900 triệu$/.test(tdDat), tdDat);
// 27/09/2026 (bắn thật lx-36): "Giá 8.000.000.000" → bản nháp in nguyên dãy số. Nay in bằng chữ khi chẵn triệu.
const tdDaySo = tieuDeTinLe({ ...DAT.l, price_raw: "8.000.000.000" }, fact(DAT));
la("giá dãy số '8.000.000.000' → tiêu đề 'giá 8 tỷ'", /giá 8 tỷ$/.test(tdDaySo), tdDaySo);
// 01/10/2026 (chủ dự án test Zalo): tiêu đề dài bị cắt đuôi "…, SHR, cần bán…" — mất GIÁ. Cắt phần giữa, giữ giá.
const tdDai = tieuDeTinLe({ ...NHA_PHO.l, location_raw: "137/28 đường số 59 khu dân cư Bàu Cát gần chợ Gò Vấp", gap: true, price_raw: "14 tỷ" }, fact(NHA_PHO));
la("tiêu đề dài > 120 ký tự → cắt phần giữa, VẪN kết bằng giá", tdDai.length <= 120 && /…, giá 14 tỷ$/.test(tdDai), `${tdDai.length}: ${tdDai}`);
const tdLe = tieuDeTinLe({ ...DAT.l, price_raw: "8.500.000" }, fact(DAT));
la("giá dãy số lẻ triệu '8.500.000' giữ nguyên (không làm tròn thành 9 triệu)", /giá 8\.500\.000$/.test(tdLe), tdLe);

const nha = dung(NHA_PHO);
const dongNha = nha.split("\n");
// SRS-5.1zzzzzo (chủ dự án 13/10/2026: "giá để ở cuối cùng"): dòng 💰 là dòng CUỐI của thân tin.
const dongGiaNha = dongNha.find((d) => d.startsWith("💰")) ?? "";
la("dòng 1 câu mở (KHÔNG kèm điểm), dòng 2 TIÊU ĐỀ, dòng 3 địa chỉ 📍 viết HOA, GIÁ 💰 là dòng cuối thân tin",
  /^📋 Em sẽ rao như vầy nhé anh:$/.test(dongNha[0]) && dongNha[1] === tdNha && /^📍 Hẻm 5m Nguyễn Trãi/.test(dongNha[2]) && (dongNha[dongNha.findIndex((d) => /^Độ đầy đủ/.test(d)) - 1] ?? "").startsWith("💰"),
  dongNha.join(" | "));
la("giá có '(còn thương lượng)' khi cột negotiable = true", /^💰 GIÁ 7 TỶ 2 \(còn thương lượng\)$/.test(dongGiaNha), dongGiaNha);
// SRS-5.1zzzzzzj (chủ dự án 14/10: "để ô tiện ích và thêm gộp lại luôn"): MỘT dòng 📝 Thêm — mặt tiền + tiện ích trước, rồi tình trạng, ý thêm.
la("kiến thức thêm: dòng '📝 Thêm' gộp tiện ích (mặt tiền, tiện ích gần) + tình trạng + mọi fact bo_sung, cũ trước, không lặp; không còn dòng 🏫 riêng",
  dongNha.some((d) => d === "📝 Thêm: mặt tiền 4m · gần chợ An Đông · trường Hùng Vương · nhà mới sửa 2024 · khu an ninh · gần chợ Bình Tây") && !/🏫/u.test(nha), dongNha.join(" | "));
la("có đủ khối thông số: diện tích, kết cấu, đường vào, hướng, pháp lý",
  /📐 Diện tích: 60m² · dài 15m$/m.test(nha) && /🏗 Quy mô: trệt \+ 2 lầu · 3 phòng ngủ · 2 WC$/m.test(nha) &&
  /🛣 Đường vào: hẻm xe hơi 5m/.test(nha) && /🧭 Hướng: Đông Nam/.test(nha) && /📜 Pháp lý: sổ hồng riêng, hoàn công/.test(nha), nha);
// 24/09/2026 (chủ dự án): bỏ "Khách quan tâm nhắn Zalo cho em để hẹn xem nhà" — lời hứa báo lại người rao, có tên
// trợ lý, đứng SAU CÙNG.
la("kết bằng điểm, câu hỏi duyệt, rồi SAU CÙNG '👉 … R•ai báo lại anh …'",
  /^Độ đầy đủ 82\/100, thêm /.test(dongNha.at(-4) ?? "") && /^Điểm càng cao, công ty càng ưu tiên chào bán\.$/.test(dongNha.at(-3) ?? "") && /hấp dẫn chưa|ổn chưa|được chưa/.test(dongNha.at(-2) ?? "") &&
  /^👉 Có khách quan tâm là R•ai báo lại anh liền ạ\.$/.test(dongNha.at(-1) ?? "") && !/hẹn xem nhà/.test(nha),
  dongNha.slice(-4).join(" | "));
la("thiếu tên trợ lý thì BỎ câu 👉, không in '{ten}' hay dòng rỗng",
  (() => { const t = soanTinNhap({ ...NHA_PHO, lai: false, cauTD: (k, o = {}) => dienCau(CAU_TIEN_DINH[k] ?? "", { ...o, ac: "anh", Ac: "Anh" }) });
    return !/👉|\{ten\}/.test(t) && !/\n\s*\n/.test(t); })());
la("KHÔNG đọc mã tin cho khách (FR-178)", !nha.includes("BDS-"), nha);
// FR-221 c (24/09/2026): chủ nói "đăng đi" và tin đã lên kệ → tiêu đề "lên kệ … rồi", KHÔNG còn câu hỏi duyệt.
{
  const daDang = soanTinNhap({ ...NHA_PHO, lai: false, cauTD, daDang: true }).split("\n");
  // (Gạch dài trong danh sách "thiếu" của DB được `boGachDai` lọc ở chỗ gửi đi — van-tra-loi.mjs kiểm.)
  la("tin ĐÃ ĐĂNG: tiêu đề 'lên kệ … rồi nha', không câu hỏi duyệt",
    /lên kệ .* rồi nha anh:$/.test(daDang[0]) && !daDang.some((d) => /hấp dẫn chưa|ổn chưa|được chưa/.test(d)) &&
    // câu `dang_luon_cuoi` gửi ngay sau đã hứa báo lại — không lặp 👉 trong tin.
    !daDang.some((d) => /^👉/.test(d)),
    daDang[0] + " | " + daDang.at(-1));
}
la("không có dòng rỗng thừa", !/\n\s*\n/.test(nha));
// 24/09/2026 (chủ dự án: "Tiền thuê ghi vào"): tin BÁN đang cho thuê in tiền thuê (số đã đọc từ cột, không in câu chat) + hạn hợp đồng.
{
  const t = soanTinNhap({ ...NHA_PHO, l: { ...NHA_PHO.l, rent_income_vnd: 4e8 }, facts: [...NHA_PHO.facts, { question: "doanh_thu", answer: "Cái này bí mật nhé khoảng 400 triệu" }, { question: "han_hop_dong_thue", answer: "tới năm 2030 em" }], lai: false, cauTD });
  la("tin bán đang cho thuê: '💵 Đang cho thuê: 400 triệu/tháng · hợp đồng tới năm 2030', không in câu chat",
    /^💵 Đang cho thuê: 400 triệu\/tháng · hợp đồng tới năm 2030$/m.test(t) && !/bí mật/.test(t), t);
  la("tin chưa có tiền thuê: không có dòng 💵", !/💵/.test(nha));
  // 24/09/2026 (bắn 10 tin): khách nói "vi bằng", cột lưu giay_tay → in "vi bằng", không in "giấy tay".
  const vb = soanTinNhap({ ...NHA_PHO, l: { ...NHA_PHO.l, legal_status: "giay_tay" }, facts: [{ question: "phap_ly", answer: "vi bằng" }], lai: false, cauTD });
  la("vi bằng: dòng pháp lý in 'vi bằng'", /📜 Pháp lý: vi bằng/.test(vb) && !/giấy tay/.test(vb), vb);
  // 27/09/2026 (test Zalo, đất Cần Đước): dòng pháp lý in trơn "· tự do · ko có gì hết" — gắn nhãn cho người đọc hiểu.
  const nhanPl = soanTinNhap({ ...NHA_PHO, facts: [...NHA_PHO.facts, { question: "xay_dung", answer: "tự do" }, { question: "len_tho_cu", answer: "được" }], lai: false, cauTD });
  la("pháp lý: 'xây: tự do', 'lên thổ cư: được' có nhãn", /📜 Pháp lý:.*xây: tự do/.test(nhanPl) && /lên thổ cư: được/.test(nhanPl) && !/ · tự do/.test(nhanPl), nhanPl);
  const toa = soanTinNhap({ ...NHA_PHO, l: { ...NHA_PHO.l, property_type: "toa_nha", rent_income_vnd: 12e7 }, lai: false, cauTD });
  la("toà nhà: tiền thuê vào khối Khai thác ('thu 120 triệu/tháng'), không có dòng 💵 riêng", /🏢 Khai thác: .*thu 120 triệu\/tháng/.test(toa) && !/💵/.test(toa), toa);
}

const thue = dung(CAN_HO_THUE);
la("cho thuê: giá kèm '/tháng', có khối điều kiện thuê, có ảnh",
  /💰 GIÁ 18 TRIỆU\/THÁNG \(giá cố định\)/.test(thue) && /📝 Điều kiện thuê: cọc 2 tháng · thuê tối thiểu 1 năm · phí QL 14 nghìn\/m2/.test(thue) &&
  /📷 2 ảnh/.test(thue), thue);
la("cho thuê: tầng 15 và nội thất vào đúng khối kết cấu / nội thất",
  /🏗 Quy mô: tầng 15 · 2 phòng ngủ · 2 WC · view sông/.test(thue) && /🛋 Nội thất: full nội thất/.test(thue), thue);
// SRS-5.1zzzzzu (chủ dự án 13/10: "Điều kiện thuê là cọc 2 tháng chứ không phải là 2 tháng không"): khách chỉ nói số → in kèm chữ "cọc".
const thue2 = dung({ ...CAN_HO_THUE, facts: CAN_HO_THUE.facts.map((f) => f.question === "tien_coc" ? { ...f, answer: "2 tháng" } : f) });
la("cho thuê: tiền cọc '2 tháng' → in 'cọc 2 tháng' (không 'cọc cọc' khi khách đã nói chữ cọc)", /📝 Điều kiện thuê: cọc 2 tháng · /.test(thue2) && !/cọc cọc/.test(thue), thue2);

const datNhap = dung(DAT);
la("tin nghèo thông tin: chỉ có mấy dòng, không bịa dòng nào",
  datNhap.split("\n").length <= 9 && !/🏗|🧭|📜/.test(datNhap), datNhap);
la("gửi lại sau khi sửa thì câu cuối đổi", /Em sửa lại rồi/.test(dung(NHA_PHO, true)), dung(NHA_PHO, true).split("\n").at(-1));

// 25/09/2026 (chủ dự án test Zalo): "sang tên ngay và luôn" in thành "sang tên ngay và" — "và luôn" là thành ngữ.
{
  const tin = { ...NHA_PHO, facts: [...NHA_PHO.facts, { question: "bo_sung", answer: "sang tên ngay và luôn" }, { question: "bo_sung", answer: "để ở hay cho thuê đều được luôn em" }] };
  const them = dung(tin).split("\n").find((x) => x.startsWith("📝")) ?? "";
  la("VALUON-01 📝 Thêm giữ 'sang tên ngay và luôn', vẫn bỏ tiểu từ đuôi 'luôn em'", /sang tên ngay và luôn/.test(them) && /đều được(?! luôn)/.test(them), them);
}

// 25/09/2026 (chủ dự án "ko ghi trùng"): 📝 Thêm không in lại điều kết cấu / đường vào / sổ / nhãn đã có — lọc cả dữ liệu cũ.
{
  const tin = { ...NHA_PHO, l: { ...NHA_PHO.l, floors_text: "trệt + lửng + 2 lầu + sân thượng", alley_width_m: 3, access_type: "hem_xe_may", nhan: ["san_thuong", "gac_lung"] },
    facts: [...NHA_PHO.facts, { question: "do_rong_hem", answer: "3m" },
      { question: "bo_sung", answer: "sân thượng" }, { question: "bo_sung", answer: "xe hơi không vào được" },
      { question: "bo_sung", answer: "sổ hồng riêng" }, { question: "bo_sung", answer: "trần cao 4m thông suốt" }] };
  const them = dung(tin).split("\n").find((x) => x.startsWith("📝")) ?? "";
  la("TRUNG-01 📝 Thêm bỏ 'sân thượng', 'xe hơi không vào được', 'sổ hồng riêng' (ô đã có), giữ 'trần cao 4m thông suốt'",
    !/sân thượng|xe hơi không vào|sổ hồng riêng/.test(them) && /trần cao 4m thông suốt/.test(them), them);
  const nhanDong = dung(tin).split("\n").find((x) => x.startsWith("🏷")) ?? "";
  const tinNhan = { ...tin, l: { ...tin.l, nhan: ["san_thuong", "gac_lung", "yen_tinh"] }, facts: [...tin.facts, { question: "bo_sung", answer: "khu yên tĩnh" }, { question: "bo_sung", answer: "khu an ninh" }] };
  const them3 = dung(tinNhan).split("\n").find((x) => x.startsWith("📝")) ?? "";
  la("TRUNG-03 📝 Thêm bỏ 'khu yên tĩnh' (tin mang nhãn yên tĩnh), giữ 'khu an ninh' (tin chưa có nhãn an ninh)", !/yên tĩnh/.test(them3) && /khu an ninh/.test(them3), them3);
  la("TRUNG-02 🏷 Nhãn không in lặp 'sân thượng' / 'có gác lửng' khi dòng kết cấu đã có", !/sân thượng|lửng/.test(nhanDong), nhanDong || "(không có dòng nhãn)");
}

// FR-236 (bắn thật lx-43, 28/09/2026): tin ĐẤT lên kệ mở bằng "Tin nhà mình"; hướng luật ghi nguyên cụm "hướng đông" in thành
// "🧭 Hướng: hướng đông".
{
  const datDang = soanTinNhap({ ...DAT, lai: false, cauTD, daDang: true, facts: [...DAT.facts, { question: "huong", answer: "hướng đông" }] });
  la("LOAI-01 tin đất đã lên kệ → 'Tin đất mình lên kệ', không 'Tin nhà mình'", /Tin đất mình lên kệ/.test(datDang) && !/Tin nhà mình/.test(datDang), datDang.split("\n")[0]);
  la("LOAI-02 căn hộ → 'Tin căn hộ mình lên kệ'", /Tin căn hộ mình lên kệ/.test(soanTinNhap({ ...CAN_HO_THUE, lai: false, cauTD, daDang: true })), "");
  la("HUONG-01 fact 'hướng đông' → '🧭 Hướng: Đông' (không lặp chữ hướng)", /🧭 Hướng: Đông$/m.test(datDang), datDang.split("\n").find((x) => x.startsWith("🧭")) ?? "(không có dòng hướng)");
  la("LOAI-03 câu dang_xong đất → 'tin đất mình lên kệ'", /tin đất mình lên kệ/.test(cauTD("dang_xong", { diem: 70, loai: "đất" })), cauTD("dang_xong", { diem: 70, loai: "đất" }));
}

// FR-239 j (phát lại test 27/09): "💵 Đang cho thuê: 400 triệu/tháng · hợp đồng Còn 4 năm" — chữ đầu giá trị viết hoa giữa dòng.
{
  const tin = { ...NHA_PHO, l: { ...NHA_PHO.l, rent_income_vnd: 400000000 }, facts: [{ question: "han_hop_dong_thue", answer: "Còn 4 năm" }, ...NHA_PHO.facts] };
  const dong = soanTinNhap({ ...tin, lai: false, cauTD }).split("\n").find((x) => x.startsWith("💵")) ?? "";
  la("THUONG-01 'hợp đồng Còn 4 năm' → 'hợp đồng còn 4 năm'", /hợp đồng còn 4 năm/.test(dong), dong);
  const tin2 = { ...NHA_PHO, facts: [{ question: "tien_ich_gan", answer: "Vincom 5 phút" }, ...NHA_PHO.facts] };
  la("THUONG-02 tên riêng đầu giá trị ('Vincom') giữ hoa", /Vincom/.test(soanTinNhap({ ...tin2, lai: false, cauTD })), "");
}

// SRS-5.1zzzzz (khách mô phỏng 11/10): hiện trạng sử dụng cùng ý tình trạng nhà đã in ở dòng kết cấu → không in dòng 🏠 lần hai.
{
  const goc = NHA_PHO.facts.filter((f) => !/^hien_trang/.test(f.question));
  const hai = { ...NHA_PHO, facts: [...goc, { question: "hien_trang", answer: "cũ, còn sử dụng được" }, { question: "hien_trang_su_dung", answer: "cũ rồi nhưng còn sử dụng được" }] };
  const b1 = soanTinNhap({ l: NHA_PHO.l, facts: hai.facts, diem: 80, thieu: [], soAnh: 0, lai: false, cauTD });
  la("ZZZZZ-T1 (ca gốc) 'cũ, còn sử dụng được' (kết cấu) + 'cũ rồi nhưng còn sử dụng được' (hiện trạng) → ý in một lần", (b1.match(/sử dụng được/g) ?? []).length === 1 && !/🏠/u.test(b1), b1);
  const khac = { ...NHA_PHO, facts: [...goc, { question: "hien_trang", answer: "mới sơn lại" }, { question: "hien_trang_su_dung", answer: "đang cho thuê" }] };
  const b2 = soanTinNhap({ l: NHA_PHO.l, facts: khac.facts, diem: 80, thieu: [], soAnh: 0, lai: false, cauTD });
  la("ZZZZZ-T2 đối chứng 'mới sơn lại' + 'đang cho thuê' (hai ý) → giữ cả hai ý trên dòng Thêm (sau phần tiện ích)", /📝 Thêm:.*mới sơn lại · hiện trạng đang cho thuê/u.test(b2), b2);
}
// 13/10/2026 (chủ dự án): bản nháp hai bong bóng — thân là tin rao, đuôi từ "Độ đầy đủ" trở xuống; ghép lại đúng bằng bản một chuỗi.
{
  const hb = soanTinNhapHaiBong({ ...NHA_PHO, lai: false, cauTD });
  la("HAIBONG-1 thân không có điểm / câu duyệt / 👉, đuôi mở bằng 'Độ đầy đủ' và kết bằng 👉",
    !/Độ đầy đủ|👉|hấp dẫn chưa/.test(hb.than) && /^Độ đầy đủ \d+\/100/.test(hb.duoi) && !/👉|hấp dẫn chưa/.test(hb.duoi) && /hấp dẫn chưa/.test(hb.hoi) && /👉/.test(hb.hoi.split("\n").at(-1)), JSON.stringify(hb));
  // 13/10/2026 (chủ dự án): câu điểm tách bong bóng riêng với câu hỏi duyệt → ba phần: than · duoi (điểm + ưu tiên) · hoi (hỏi duyệt + 👉).
  la("HAIBONG-2 than + duoi + hoi = soanTinNhap (một nguồn)", `${hb.than}\n${hb.duoi}\n${hb.hoi}` === soanTinNhap({ ...NHA_PHO, lai: false, cauTD }));
  const hd = soanTinNhapHaiBong({ ...NHA_PHO, lai: false, cauTD, daDang: true });
  la("HAIBONG-3 tin đã lên kệ: đuôi chỉ còn dòng điểm", /^Độ đầy đủ/.test(hd.duoi) && !/👉|hấp dẫn chưa/.test(hd.duoi), JSON.stringify(hd));
}
// SRS-5.1zzzzzl (chủ dự án 13/10/2026, test Zalo tin Hương Lộ 3): "Em sẽ rao như vậy nhé. Chỉ 7.6 tỉ ô tô tận cửa. Ko ghi ngang ghi mặt
// tiền, Mặt tiền đi chung với tiện ích. Điểm càng cao công ty càng ưu tiên chào bán … Tin nháp phải có khen nữa".
{
  const HL = {
    l: { property_type: "nha_pho", deal: "ban", location_raw: "Hương Lộ 3", ward: "Phường Bình Hưng Hòa", district: "Quận Bình Tân",
      area_m2: 60, price_raw: "7,6 tỷ", frontage_m: 6, length_m: 10, access_type: "hem_xe_hoi", alley_width_m: 6, floors_text: "trệt + 2 lầu" },
    facts: [{ question: "tien_ich_gan", answer: "Gần trường mầm non, chợ, Bách Hóa Xanh, công viên" }, { question: "bo_sung", answer: "ô tô tận cửa" }],
    diem: 85, thieu: ["vài tấm ảnh"], soAnh: 0,
  };
  const fHL = fact(HL);
  const td = tieuDeTin(HL.l, fHL, HL.facts);
  la("TIEUDE-1 (ca gốc) tin bán có giá → 'Chỉ 7,6 tỷ ô tô tận cửa tại Bình Hưng Hòa, Bình Tân' (cụm khách nói, khu vực bỏ chữ Phường/Quận)",
    td === "Chỉ 7,6 tỷ ô tô tận cửa tại Bình Hưng Hòa, Bình Tân", td);
  const td2 = tieuDeTin(HL.l, fHL, HL.facts.filter((f) => f.question !== "bo_sung"));
  la("TIEUDE-1b khách không nói 'tận cửa' → điểm mạnh theo cột đường vào 'hẻm xe hơi', KHÔNG tự viết 'tận cửa'", td2 === "Chỉ 7,6 tỷ hẻm xe hơi tại Bình Hưng Hòa, Bình Tân", td2);
  const td3 = tieuDeTin({ ...HL.l, property_type: "dat", access_type: "hem" }, fHL, []);
  la("TIEUDE-1c (cách khác) đất, hẻm thường → 'Chỉ 7,6 tỷ đất tại …' (loại khác nhà phố có chữ loại, không điểm mạnh bịa)", td3 === "Chỉ 7,6 tỷ đất tại Bình Hưng Hòa, Bình Tân", td3);
  const tdk = "Chỉ với 7,6 tỷ ô tô tận cửa tại Bình Hưng Hòa Bình Tân";
  const ban = soanTinNhapHaiBong({ ...HL, lai: true, cauTD, tieuDeKhach: tdk });
  la("TIEUDE-2 chủ nhà gửi tiêu đề → dòng 2 bản nháp đúng câu của khách", ban.than.split("\n")[1] === tdk, ban.than.split("\n")[1]);
  la("TIEUDE-3 tin cho thuê vẫn tiêu đề kiểu tin lẻ ('Cho thuê …')", /^Cho thuê căn hộ/.test(tieuDeTin(CAN_HO_THUE.l, fact(CAN_HO_THUE), CAN_HO_THUE.facts)));
  const t = soanTinNhap({ ...HL, lai: false, cauTD });
  la("TIENICH-1 không in 'ngang', bề ngang thành 'mặt tiền 6m' đứng đầu dòng 📝 Thêm cùng các mục khách liệt kê, ý thêm khác đi sau",
    !/ngang/.test(t) && /^📝 Thêm: mặt tiền 6m · gần trường mầm non · chợ · Bách Hóa Xanh · công viên$/m.test(t) && /^📐 Diện tích: 60m² · dài 10m$/m.test(t), t);
  la("UUTIEN-1 bong bóng hai có 'Điểm càng cao, công ty càng ưu tiên chào bán.' ngay dưới dòng điểm",
    /Độ đầy đủ 85\/100[^\n]*\nĐiểm càng cao, công ty càng ưu tiên chào bán\./.test(ban.duoi), ban.duoi);
  const khen = "Căn mình ô tô tận cửa, mặt tiền 6m lại gần trường mầm non, chợ, anh giới thiệu chi tiết quá ạ.";
  const coKhen = soanTinNhapHaiBong({ ...HL, lai: false, cauTD, khen });
  la("KHEN-1 câu khen (đã soát) mở đầu bong bóng hai, thân tin không đổi", coKhen.duoi.split("\n")[0] === khen && coKhen.than === soanTinNhapHaiBong({ ...HL, lai: false, cauTD }).than, coKhen.duoi);
  la("KHEN-2 không có câu khen → bong bóng hai mở bằng dòng điểm (không câu thay thế)", /^Độ đầy đủ/.test(soanTinNhapHaiBong({ ...HL, lai: false, cauTD, khen: null }).duoi));
}
// SRS-5.1zzzzzl (production 13/10): khách "đang ở không cho thuê" → bản nháp từng in "💵 Đang cho thuê: hợp đồng đang ở không cho thuê".
{
  const tuChoi = { ...NHA_PHO, facts: [...NHA_PHO.facts, { question: "hien_trang_su_dung", answer: "đang ở không cho thuê" }, { question: "han_hop_dong_thue", answer: "đang ở không cho thuê" }] };
  la("RENT-1 (ca gốc) hiện trạng 'đang ở không cho thuê' → không có dòng 💵 dù ô hợp đồng có chữ", !/💵/.test(dung(tuChoi)), dung(tuChoi));
  const that = { ...NHA_PHO, facts: [...NHA_PHO.facts, { question: "hien_trang_su_dung", answer: "đang cho shop thời trang thuê" }, { question: "han_hop_dong_thue", answer: "tới 2028" }] };
  la("RENT-2 (cách nói khác) 'đang cho shop thời trang thuê' → có dòng 💵 với hợp đồng tới 2028", /^💵 Đang cho thuê: hợp đồng tới 2028$/m.test(dung(that)), dung(that));
}
// SRS-5.1zzzzzn (chủ dự án 13/10, ảnh bản nháp Hóc Môn): "kết cấu sửa thành quy mô, Nhà bếp - Phòng khách rộng · sân rộng thì sẽ đưa lên chỗ
// quy mô, còn mới, hiện đang ở đưa xuống chỗ mô tả thêm".
{
  const HM = { l: { property_type: "nha_cap4", deal: "ban", location_raw: "Đt 7-4A", ward: "Xã Đông Thạnh", district: "Huyện Hóc Môn", area_m2: 132, length_m: 22,
      price_raw: "3,6 tỷ", bedrooms: 2, bathrooms: 2, floors_text: "gác lửng gỗ", access_type: "hem_xe_hoi", legal_status: "so_hong_rieng" },
    facts: [{ question: "hien_trang", answer: "còn mới, hiện đang ở" }, { question: "bo_sung", answer: "gần chợ Gấu" }, { question: "bo_sung", answer: "sân rộng" },
      { question: "bo_sung", answer: "Nhà bếp - Phòng khách rộng" }, { question: "bo_sung", answer: "khu dân cư" }],
    diem: 80, thieu: [], soAnh: 0 };
  const t = soanTinNhap({ ...HM, lai: false, cauTD, quyMo: ["Nhà bếp - Phòng khách rộng", "sân rộng", "không có trong danh sách"] });
  const qm = t.split("\n").find((x) => x.startsWith("🏗")) ?? "", them = t.split("\n").find((x) => x.startsWith("📝")) ?? "";
  la("QUYMO-1 (ca gốc) dòng 'Quy mô' (không còn 'Kết cấu') có 'Nhà bếp - Phòng khách rộng · sân rộng'; 'còn mới, hiện đang ở' ở dòng Thêm, không ở Quy mô",
    /^🏗 Quy mô: gác lửng gỗ · 2 phòng ngủ · 2 WC · Nhà bếp - Phòng khách rộng · sân rộng$/.test(qm) && /còn mới, hiện đang ở/.test(them) && !/còn mới/.test(qm) && !/Kết cấu/.test(t) &&
      /gần chợ Gấu/.test(them) && /khu dân cư/.test(them) && !/sân rộng|Nhà bếp/.test(them), `${qm} || ${them}`);
  const t2 = soanTinNhap({ ...HM, lai: false, cauTD });
  la("QUYMO-2 không có danh sách AI xếp (AI không chạy) → ý thêm ở dòng Thêm như cũ, không đoán bằng từ khoá", /sân rộng/.test(t2.split("\n").find((x) => x.startsWith("📝")) ?? "") && !/sân rộng/.test(t2.split("\n").find((x) => x.startsWith("🏗")) ?? ""), t2);
}

// SRS-5.1zzzzzzs (Zalo thật 14/10 11:47, tin Cao Lỗ): bài rao gửi hai lần → hai ý gần như một nằm cùng dòng 📝 Thêm. Một ý in một lần;
// ý ngắn nằm trong ý dài khác hẳn ("chợ" / "gần chợ Bình Tây") vẫn giữ cả hai.
{
  const y1 = "Vị trí gần kề các trường Đại Học Lớn: Đại học Công nghệ Sài Gòn, Đại học Sài Gòn, Đại học Y Dược";
  const y2 = "Gần kề các trường Đại Học Lớn: Đại học Công nghệ Sài Gòn, Đại học Sài Gòn, Đại học Y Dược";
  const t = soanTinNhap({ ...NHA_PHO, facts: [...NHA_PHO.facts, { question: "bo_sung", answer: y1 }, { question: "bo_sung", answer: y2 }, { question: "bo_sung", answer: "Ngay Parc Mall" }], lai: false, cauTD });
  const d = t.split("\n").find((x) => x.startsWith("📝 Thêm")) ?? "";
  la("THEM-TRUNG-1 (ca gốc Cao Lỗ) hai ý gần như một → in một lần; ý khác ('Ngay Parc Mall') giữ", (d.match(/Đại Học Lớn/g) ?? []).length === 1 && /Ngay Parc Mall/.test(d), d);
  const t2 = soanTinNhap({ ...NHA_PHO, facts: [...NHA_PHO.facts, { question: "bo_sung", answer: "gần chợ Bình Tây" }], lai: false, cauTD });
  const d2 = t2.split("\n").find((x) => x.startsWith("📝 Thêm")) ?? "";
  la("THEM-TRUNG-2 (đối chứng) 'gần chợ An Đông' và 'gần chợ Bình Tây' là hai ý → giữ cả hai", /gần chợ An Đông/.test(d2) && /gần chợ Bình Tây/.test(d2), d2);
}

console.log(`\n${dat} đạt · ${hong} hỏng`);
// SRS-5.1zzzzzo (test Zalo 13/10/2026): "nhà trống" → bản nháp từng in "🛋 Nội thất: khong" và "🏠 Hiện trạng: trống".
{
  const f0 = NHA_PHO.facts.filter((f) => !/^hien_trang|^noi_that/.test(f.question));
  const b = soanTinNhap({ l: { ...NHA_PHO.l, furnishing: "khong" }, facts: [...f0, { question: "hien_trang_su_dung", answer: "trống" }], diem: 80, thieu: [], soAnh: 0, lai: false, cauTD });
  la("TRONG-1 (ca gốc) nội thất mã 'khong' → không in dòng 🛋; hiện trạng sử dụng 'trống' → '📝 Thêm: … hiện trạng trống'", !/🛋/u.test(b) && !/khong/.test(b) && /hiện trạng trống/u.test(b), b);
  const b2 = soanTinNhap({ l: { ...NHA_PHO.l, furnishing: "full" }, facts: [...f0, { question: "hien_trang_su_dung", answer: "để trống từ tết" }], diem: 80, thieu: [], soAnh: 0, lai: false, cauTD });
  la("TRONG-2 (cách nói mới) nội thất 'full' → '🛋 Nội thất: đầy đủ'; 'để trống từ tết' → 'hiện trạng để trống từ tết'", /🛋 Nội thất: đầy đủ/u.test(b2) && /hiện trạng để trống từ tết/u.test(b2), b2);
}

// SRS-5.1zzzzzo (test Zalo 13/10 10:50): ý thêm AI xếp tiện ích → dòng 🏫 Tiện ích; AI chép thiếu chữ "có" vẫn nhận (so lỏng).
{
  const f0 = NHA_PHO.facts.filter((f) => f.question !== "bo_sung" && f.question !== "tien_ich_gan");
  const facts = [...f0, { question: "bo_sung", answer: "có sân rộng, phòng khách rộng, bếp riêng" }, { question: "bo_sung", answer: "gần chợ Gấu Đông Thạnh" }, { question: "bo_sung", answer: "phù hợp xây dựng lại" }];
  const b = soanTinNhap({ l: NHA_PHO.l, facts, diem: 80, thieu: [], soAnh: 0, lai: false, cauTD, quyMo: ["sân rộng, phòng khách rộng, bếp riêng"], tienIch: ["gần chợ Gấu Đông Thạnh"] });
  const d = b.split("\n");
  const qm = d.find((x) => x.startsWith("🏗")) ?? "", th = d.find((x) => x.startsWith("📝")) ?? "";
  la("TIENICH-AI-1 (ca gốc) 'gần chợ Gấu Đông Thạnh' → đầu dòng 📝 Thêm (phần tiện ích, trước ý khác); 'có sân rộng…' (AI chép thiếu 'có') → 🏗 Quy mô",
    th.indexOf("gần chợ Gấu Đông Thạnh") >= 0 && th.indexOf("gần chợ Gấu Đông Thạnh") < th.indexOf("phù hợp xây dựng lại") && qm.includes("sân rộng, phòng khách rộng, bếp riêng") && !th.includes("sân rộng"), b);
  const b2 = soanTinNhap({ l: NHA_PHO.l, facts: [...f0, { question: "bo_sung", answer: "cách trường cấp 2 khoảng 300m" }], diem: 80, thieu: [], soAnh: 0, lai: false, cauTD, tienIch: ["cách trường cấp 2 khoảng 300m"] });
  la("TIENICH-AI-2 (cách nói mới) 'cách trường cấp 2 khoảng 300m' → dòng 📝 Thêm, ngay sau mặt tiền (phần tiện ích)", /📝 Thêm: mặt tiền 4m · cách trường cấp 2 khoảng 300m/u.test(b2), b2);
}

// SRS-5.1zzzzzz (chủ dự án 13/10/2026: "Chọn lọc các tiện ích trong tin dự án để đưa ra ý ngon nghẻ"): bài rao KDC 9 ý → dòng 🏫 chỉ in các ý
// AI chọn (đã kiểm), chữ gọn; không có danh sách chọn (AI không chạy / dưới 4 ý) → in đủ như cũ; DB vẫn đủ 9 ý.
{
  const f0 = NHA_PHO.facts.filter((f) => f.question !== "bo_sung" && f.question !== "tien_ich_gan");
  const Y = ["Thông ra ĐT 835D chỉ 200 mét", "Chợ Rạch Kiến hoặc Chợ Phước Vân ~ 3 - 5 phút", "UBND xã và trạm y tế ~ 2 - 3 phút", "Hệ thống trường học các cấp ~ 10 phút",
    "Khu công nghiệp Cầu Tràm ~ 10 phút", "Chợ Bình Chánh ~ 20 phút", "Vinhomes Hưng Long Bình Chánh ~ 20 phút", "cao tốc Bến Lức - Long Thành", "sân trước và giếng trời sân sau"];
  const facts = [...f0, ...Y.map((y) => ({ question: "bo_sung", answer: y }))];
  const chon = [{ goc: Y[0], in: "ra ĐT 835D 200m" }, { goc: Y[1], in: "chợ Rạch Kiến, Phước Vân 3–5 phút" }, { goc: Y[4], in: "KCN Cầu Tràm 10 phút" }, { goc: Y[7], in: "cao tốc Bến Lức - Long Thành" }];
  const b = soanTinNhap({ l: NHA_PHO.l, facts, diem: 80, thieu: [], soAnh: 0, lai: false, cauTD, tienIch: Y.slice(0, 8), quyMo: [Y[8]], tienIchNoiBat: chon });
  const ti = b.split("\n").find((x) => x.startsWith("📝 Thêm")) ?? "";
  la("TIENICH-CHON-1 (ca gốc) 9 ý, AI chọn 4 → phần tiện ích của dòng 📝 Thêm chỉ 4 ý chữ gọn, không UBND / Chợ Bình Chánh / Vinhomes; ý không chọn không in",
    ti.startsWith("📝 Thêm: mặt tiền 4m · ra ĐT 835D 200m · chợ Rạch Kiến, Phước Vân 3–5 phút · KCN Cầu Tràm 10 phút · cao tốc Bến Lức - Long Thành") &&
      !/UBND|Vinhomes|Bình Chánh ~/.test(b) && /🏗 Quy mô:.*sân trước và giếng trời/.test(b), b);
  const b2 = soanTinNhap({ l: NHA_PHO.l, facts, diem: 80, thieu: [], soAnh: 0, lai: false, cauTD, tienIch: Y.slice(0, 8), quyMo: [Y[8]] });
  const ti2 = b2.split("\n").find((x) => x.startsWith("📝 Thêm")) ?? "";
  la("TIENICH-CHON-2 (đối chứng) không có danh sách chọn lọc → in đủ 8 ý tiện ích như cũ", Y.slice(0, 8).every((y) => ti2.includes(y)), ti2);
  const b3 = soanTinNhap({ l: NHA_PHO.l, facts, diem: 80, thieu: [], soAnh: 0, lai: false, cauTD, tienIch: Y.slice(0, 8), quyMo: [Y[8]], tienIchNoiBat: [{ goc: "Siêu thị Co.opmart", in: "Co.opmart" }] });
  la("TIENICH-CHON-3 (đối chứng) ý chọn không có trong ý thêm của tin → coi như không có danh sách, in đủ", Y.slice(0, 8).every((y) => b3.includes(y)) && !/Co\.opmart/.test(b3), b3);
}
// SRS-5.1zzzzzzz3 (Zalo thật 14/10/2026): căn hộ "2225 Phạm Thế Hiển" — tên chung cư (ô du_an_ten) phải in cạnh địa chỉ đường; tên đã nằm
// trong địa chỉ (location_raw do trigger điền từ tên) thì không lặp.
{
  const l = { code: "BDS-CH-Q8-0009", property_type: "chung_cu", deal: "ban", location_raw: "2225 Phạm Thế Hiển", ward: "Phường Chánh Hưng", district: "Quận 8", area_m2: 70, price_raw: "3 tỷ", bedrooms: 2, floor: 12 };
  const b = soanTinNhap({ l, facts: [{ question: "du_an_ten", answer: "Chung cư Sky Garden" }], diem: 80, thieu: [], soAnh: 0, lai: false, cauTD });
  const dc = b.split("\n").find((x) => x.startsWith("📍")) ?? "";
  la("CC-TEN-1 căn hộ có địa chỉ đường + tên chung cư → dòng 📍 in cả hai", /2225 Phạm Thế Hiển/.test(dc) && /Chung cư Sky Garden/.test(dc), dc);
  const b2 = soanTinNhap({ l: { ...l, location_raw: "Chung cư Sky Garden" }, facts: [{ question: "du_an_ten", answer: "Chung cư Sky Garden" }], diem: 80, thieu: [], soAnh: 0, lai: false, cauTD });
  const dc2 = b2.split("\n").find((x) => x.startsWith("📍")) ?? "";
  la("CC-TEN-2 tên chung cư đã là địa chỉ → không in lặp", (dc2.match(/Sky Garden/g) ?? []).length === 1, dc2);
}
// SRS-5.1zzzzzzz8 (chủ dự án test Zalo 14/10 16:38: "lấy tên chung cư bỏ lên trên tiêu đề"): tiêu đề căn hộ mang tên chung cư.
{
  const l = { code: "BDS-CH-Q8-0001", property_type: "chung_cu", deal: "ban", location_raw: "2225 Phạm Thế Hiển", ward: "Phường Bình Đông", district: "Quận 8", area_m2: 60, price_raw: "2,850 tỷ", floor: 5 };
  const f = [{ question: "du_an_ten", answer: "Green river" }];
  const t2 = (o) => soanTinNhap({ l, facts: f, diem: 78, thieu: [], soAnh: 0, lai: false, cauTD, ...o }).split("\n")[1];
  la("CC-TEN-3 (ca gốc) tiêu đề code ghép → có tên chung cư sau chữ căn hộ", /căn hộ Green river/.test(t2({})), t2({}));
  // SRS-5.1zzzzzzz19: căn hộ có tên dự án → tiêu đề code ghép (tên dự án), tiêu đề AI không dùng.
  la("CC-TEN-4 (cách khác) có tiêu đề AI mà căn hộ có tên dự án → vẫn tiêu đề tên dự án, không lấy tiêu đề AI", /^Chỉ 2,850? tỷ căn hộ Green river tại Q\.8$/.test(t2({ tieuDeAi: "View sông, nội thất đủ, chỉ 2,85 tỷ" })), t2({ tieuDeAi: "View sông, nội thất đủ, chỉ 2,85 tỷ" }));
  la("CC-TEN-5 tiêu đề đã có tên → không lặp", (t2({ tieuDeAi: "Căn hộ Green River 60m² chỉ 2,85 tỷ" }).match(/green river/gi) ?? []).length === 1, t2({ tieuDeAi: "Căn hộ Green River 60m² chỉ 2,85 tỷ" }));
  la("CC-TEN-6 tiêu đề khách tự đặt → giữ nguyên chữ khách", t2({ tieuDeKhach: "Bán gấp căn 60m2 Q8" }) === "Bán gấp căn 60m2 Q8", t2({ tieuDeKhach: "Bán gấp căn 60m2 Q8" }));
  la("CC-TEN-7 khách gõ 'Dự án Green river' → tiêu đề không thành 'căn hộ Dự án …'", themTenChungCu("Chỉ 2 tỷ căn hộ tại Q8", l, () => "Dự án Green river") === "Chỉ 2 tỷ căn hộ Green river tại Q8");
  la("CC-TEN-8 đối chứng nhà phố → không chèn", themTenChungCu("Chỉ 5 tỷ nhà phố", { property_type: "nha_pho" }, () => "Green river") === "Chỉ 5 tỷ nhà phố");
}
// SRS-5.1zzzzzzz19 (chủ dự án 14/10/2026: "nhà ở dự án thì phải nêu tiêu đề là tên dự án ra, tên chung cư ra chứ không phải địa chỉ"). Ca gốc:
// bản nháp 14/10 10:34 "Chỉ 1,3 tỷ căn hộ mặt tiền tại Tân Nhựt, Bình Chánh" — căn hộ đã gắn dự án Conic Boulevard.
{
  const l = { code: "BDS-CH-HUYENBINHCHANH-0001", property_type: "chung_cu", deal: "ban", location_raw: "Ấp 18 Khu dân cư 584 - Huỳnh Bá Chánh",
    ward: "Xã Tân Nhựt", district: "Huyện Bình Chánh", area_m2: 60, price_raw: "1,3 tỷ", bedrooms: 3, access_type: "mat_tien" };
  const f = [{ question: "du_an_ten", answer: "Conic Boulevard" }];
  const td = soanTinNhap({ l, facts: f, diem: 80, thieu: [], soAnh: 0, lai: false, cauTD }).split("\n")[1];
  la("DA-TD-1 (ca gốc) căn hộ dự án → tiêu đề 'Chỉ 1,3 tỷ căn hộ Conic Boulevard 3PN tại Bình Chánh', không xã / địa chỉ / 'mặt tiền'",
    td === "Chỉ 1,3 tỷ căn hộ Conic Boulevard 3PN tại Bình Chánh", td);
  const tdThue = tieuDeTinLe({ ...l, deal: "cho_thue", price_raw: "8 triệu" }, (k) => k === "du_an_ten" ? "Chung cư Sky Garden" : null);
  la("DA-TD-2 (cách nói mới) cho thuê căn hộ 'Chung cư Sky Garden' → 'Cho thuê căn hộ Sky Garden …', không 'Huỳnh Bá Chánh', không 'Tân Nhựt'",
    /^Cho thuê căn hộ Sky Garden/.test(tdThue) && !/Huỳnh Bá Chánh|Tân Nhựt|mặt tiền/.test(tdThue), tdThue);
  const tdKhongTen = tieuDeTin(l, () => null, []);
  la("DA-TD-3 căn hộ chưa có tên dự án → giữ tiêu đề khu vực, nhưng không 'mặt tiền' (đường vào của toà)", /tại Tân Nhựt, Bình Chánh/.test(tdKhongTen) && !/mặt tiền/.test(tdKhongTen), tdKhongTen);
  const tdNha = tieuDeTin({ ...l, property_type: "nha_pho" }, (k) => k === "du_an_ten" ? "Conic Boulevard" : null, []);
  la("DA-TD-4 đối chứng nhà phố có ô dự án → không đổi kiểu tiêu đề", /mặt tiền tại Tân Nhựt/.test(tdNha), tdNha);
}
if (hong) { console.log("\x1b[31mBẢN NHÁP TIN RAO HỎNG\x1b[0m"); process.exitCode = 1; }
else console.log("\x1b[32mBẢN NHÁP TIN RAO ĐẠT\x1b[0m");
