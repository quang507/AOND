// FR-208 (g) — VÍ DỤ MẪU cho model bóc tách tin người bán (21/09/2026, học từ google/langextract:
// schema dạy bằng ví dụ có đáp án, trích dẫn nguyên văn). Mỗi ví dụ là một tin THẬT kiểu khách
// gõ + đáp án đúng. File này KHÔNG import gì để `bot/tests/vi-du-boc-rao.mjs` chạy được bằng bun:
// bài đó bắt MỌI trường trong đáp án phải qua `kiemDeXuat` — ví dụ dạy model thứ code sẽ bỏ là đỏ.
// Bốn ví dụ cuối là bốn chỗ model đọc SAI ở lượt bắn 21/09 (TS-AIBOC-07): "hẻm xe hơi" thành hiện
// trạng, "2000m2" thành chiều dài, "Thảo Điền" thành dự án, "25m2" ghi kèm đơn vị, lời hứa thành kiến thức.
import type { DeXuat } from "../extraction/kiem-bang-chung.ts";

export type ViDuBocRao = {
  cau_dang_hoi: string | null;
  tin: string;
  so_can: number;
  truong: DeXuat[];
  kien_thuc: string[];
  /** SRS-5.1zzzzy: điều chủ nhà kể mà không lên tin rao (chuyện riêng, nhận định giá) — in vào đáp án thành kien_thuc tiền tố "riêng: ". */
  ke_rieng?: string[];
  /** Vì sao đáp án như vậy — in vào prompt để model hiểu luật, không chỉ chép mẫu. */
  luu_y?: string;
};

const t = (khoa: string, gia_tri: string, trich_dan: string): DeXuat => ({ khoa, gia_tri, trich_dan, can: null });

export const VI_DU_BOC_RAO: ViDuBocRao[] = [
  {
    // SRS-5.1zzzzzzz14 (Zalo thật 14/10/2026, Conic Boulevard: "vào quận 5 khoản 20 phút, qua Phú Mỹ Hưng Q7 cũng 20 phút" → quận 5 thành địa chỉ;
    // chủ dự án: "Nó là thông tin bổ sung mà… để AI đọc schematic thôi"). Cách nói khác ca gốc.
    cau_dang_hoi: null,
    tin: "Bán căn hộ 3 tỷ 2, ra quận 1 chỉ 15 phút",
    so_can: 1,
    truong: [t("loai_giao_dich", "ban", "Bán căn hộ"), t("loai_bds", "chung_cu", "căn hộ"), t("gia", "3 tỷ 2", "3 tỷ 2"),
      t("tien_ich_gan", "ra quận 1 chỉ 15 phút", "ra quận 1 chỉ 15 phút")],
    kien_thuc: [],
    luu_y: "Nơi ĐI TỚI kèm thời gian là tiện ích, không phải nơi căn nằm → KHÔNG đưa quan.",
  },
  {
    // SRS-5.1zzzzzzz10 (Zalo thật 14/10/2026 10:04: chờ duyệt, "căn của mình tại địa chỉ Ấp 18 … bạn sửa lại giúp mình" → AI để địa chỉ trong tra_loi).
    // Cách nói khác ca gốc.
    cau_dang_hoi: "duyet_tin",
    tin: "nhà chị ở 45 Nguyễn Văn Cừ chứ không phải chỗ đó, em sửa lại giúp chị",
    so_can: 0,
    truong: [t("duong", "45 Nguyễn Văn Cừ", "45 Nguyễn Văn Cừ"), t("ten_duong", "Nguyễn Văn Cừ", "45 Nguyễn Văn Cừ")],
    kien_thuc: [],
    luu_y: "Chờ duyệt mà đưa địa chỉ đúng → truong, không để ở tra_loi.",
  },
  {
    // SRS-5.1zzzzzza (Zalo thật 13/10/2026 16:44–16:53): "Điều chỉnh cho mình giá 6,950 tỷ" / "Sửa cho chị giá từ 1,2 tỷ thành 6,950 tỷ" lúc chờ
    // duyệt → model trả rỗng bốn lần. Lệnh sửa kèm giá trị là lời sửa dữ liệu. Cách nói khác ca gốc.
    cau_dang_hoi: "duyet_tin",
    tin: "Sửa cho chị giá từ 8 tỷ thành 7 tỷ 5 nha em",
    so_can: 1,
    truong: [t("gia", "7 tỷ 5", "thành 7 tỷ 5")],
    kien_thuc: [],
    luu_y: "Đang chờ duyệt mà bảo sửa kèm giá trị mới → truong gia = giá trị MỚI (7 tỷ 5), không phải lời nói với bot, không để trống.",
  },
  {
    // SRS-5.1zzzzzy (Zalo thật 13/10/2026, Trương Đình Hội): "chỉ 6.950 TỶ … hoàn thiện theo ý gia chủ tầm 1,2 tỷ" → gia 1,2 tỷ đè giá rao;
    // "Tại đường Trương Đình Hội" xếp vào kien_thuc. Cách nói khác ca gốc cho cả hai.
    cau_dang_hoi: null,
    tin: "Bán nhà ở đường Lê Quang Định chỉ 7,5 tỷ. Nội thất gia chủ làm thêm khoảng 800 triệu, sổ hồng riêng.",
    so_can: 1,
    truong: [t("loai_giao_dich", "ban", "Bán nhà"), t("loai_bds", "nha_pho", "Bán nhà"), t("duong", "đường Lê Quang Định", "đường Lê Quang Định"),
      t("ten_duong", "Lê Quang Định", "đường Lê Quang Định"), t("gia", "7,5 tỷ", "chỉ 7,5 tỷ"), t("phap_ly", "sổ hồng riêng", "sổ hồng riêng")],
    kien_thuc: ["Nội thất gia chủ làm thêm khoảng 800 triệu"],
    luu_y: "800 triệu là tiền chủ nhà LÀM THÊM, không phải giá — giá rao là 7,5 tỷ; \"ở đường Lê Quang Định\" là địa chỉ (duong + ten_duong), không phải kien_thuc.",
  },
  {
    // SRS-5.1zzzzzx (Zalo thật 13/10/2026, The Sholi): "Diện tích đất 80m²*" bị đọc thành ngang 80 → "mặt tiền 80m". Cách nói khác ca gốc.
    cau_dang_hoi: null,
    tin: "Nhà phố 2 mặt tiền đường Tên Lửa & số 7. Thiết kế 1 trệt 1 lửng 2 lầu. Diện tích đất 72m²*. Chỉ 600m tới Aeon Mall.",
    so_can: 1,
    truong: [t("loai_bds", "nha_pho", "Nhà phố"), t("ket_cau", "1 trệt 1 lửng 2 lầu", "1 trệt 1 lửng 2 lầu"), t("dien_tich", "72", "Diện tích đất 72m²")],
    kien_thuc: ["2 mặt tiền đường Tên Lửa & số 7", "Chỉ 600m tới Aeon Mall"],
    luu_y: "72m² là DIỆN TÍCH đất, không phải ngang / mặt tiền (ô số đo mét không bao giờ nhận số có m²); \"2 mặt tiền\" là nhà góc, vào kien_thuc.",
  },
  {
    // SRS-5.1zzzzy (khách mô phỏng 11/10: "con chị bây giờ ở Úc", "sẽ tăng giá lắm" lên dòng "Thêm" của tin rao). Cách nói khác ca gốc.
    cau_dang_hoi: null,
    tin: "nhà gần chợ Bà Chiểu, con cái đi làm xa hết nên bán, nghe nói khu này sắp lên giá",
    so_can: 1,
    truong: [],
    kien_thuc: ["gần chợ Bà Chiểu"],
    ke_rieng: ["con cái đi làm xa hết", "khu này sắp lên giá"],
    luu_y: "Chuyện gia đình, nhận định giá → tiền tố \"riêng: \"; chỉ đặc điểm căn mới không tiền tố.",
  },
  {
    // SRS-5.1zzzzq (bắn production 09/10/2026): "chào em, chị muốn bán lô đất" → rỗng ba lần, "chị muốn bán lô đất" → đúng. Cách nói khác ca gốc.
    cau_dang_hoi: null,
    tin: "chào cháu, cô có miếng đất cần bán",
    so_can: 1,
    truong: [t("loai_giao_dich", "ban", "cần bán"), t("loai_bds", "dat", "miếng đất")],
    kien_thuc: [],
    luu_y: "Lời chào đầu tin không làm tin rỗng: vẫn bóc phần sau.",
  },
  {
    // SRS-5.1zzzzv (bắn production 10/10/2026, thu-cmp46-2): "e co mieng dat can ban" → AI trả rỗng hai lượt liền, bot phải hỏi loại
    // cho lô đất. Tin gõ KHÔNG DẤU (cách nói khác ca gốc: "lo dat", "muon ban").
    cau_dang_hoi: null,
    tin: "a co lo dat muon ban",
    so_can: 1,
    truong: [t("loai_giao_dich", "ban", "muon ban"), t("loai_bds", "dat", "lo dat")],
    kien_thuc: [],
    luu_y: "Không dấu đọc như có dấu ('lo dat' = lô đất); trích dẫn giữ đúng chữ khách gõ.",
  },
  {
    // SRS-5.1zzzzi (bắn production 09/10/2026, thu-kg3): "Bán nhà MT Nguyễn Trãi Q5, 5x20, 4 tầng thang máy…" → AI đọc đủ mọi ô trừ
    // loại đường vào (cột access_type trống). Dạy viết tắt "MT" / "MTKD" = mặt tiền bằng ví dụ (cách nói khác ca gốc).
    cau_dang_hoi: null,
    tin: "Bán nhà MTKD Hai Bà Trưng Q1, 4x18, 5 tầng, 25 tỷ",
    so_can: 1,
    truong: [
      t("loai_giao_dich", "ban", "Bán nhà"), t("loai_bds", "nha_pho", "Bán nhà"), t("loai_duong_vao", "mat_tien", "MTKD"),
      t("duong", "Hai Bà Trưng", "Hai Bà Trưng"), t("ten_duong", "Hai Bà Trưng", "Hai Bà Trưng"), t("quan", "Quận 1", "Q1"),
      t("ngang", "4", "4x18"), t("dai", "18", "4x18"), t("so_tang", "5", "5 tầng"), t("gia", "25 tỷ", "25 tỷ"),
    ],
    kien_thuc: [],
    luu_y: "MT / MTKD = nhà mặt tiền đường → loai_duong_vao mat_tien (trích 'MTKD'). 4x18 là ngang × dài.",
  },
  {
    // SRS-5.1zzzzd (thu-kg5): tên xã / huyện + kích thước KHÔNG phải địa chỉ — không đưa duong / ten_duong (cách nói khác ca gốc).
    cau_dang_hoi: null,
    tin: "bán lô đất 8x30 xã Phước Vĩnh An huyện Củ Chi, sổ chung",
    so_can: 1,
    truong: [
      t("loai_giao_dich", "ban", "bán lô đất"), t("loai_bds", "dat", "lô đất"), t("ngang", "8", "8x30"), t("dai", "30", "8x30"),
      t("phuong", "Xã Phước Vĩnh An", "xã Phước Vĩnh An"), t("quan", "Huyện Củ Chi", "huyện Củ Chi"), t("phap_ly", "sổ chung", "sổ chung"),
    ],
    kien_thuc: [],
    luu_y: "Không có tên đường / hẻm / số nhà thì KHÔNG đưa duong, ten_duong; xã, huyện có ô riêng.",
  },
  {
    // 03/10/2026 (chủ dự án: "hẻm số người ta sẽ ghi số còn độ rộng thì sẽ ghi 4m 4 mét, dạy AI đi"; SRS-5.1zk): số hẻm vào địa
    // chỉ, bề rộng (có "m") vào do_rong_hem; tên đường trần vào ten_duong (ghi thẳng cột street).
    cau_dang_hoi: null,
    tin: "bán nhà 88 hẻm 6m Tân Kỳ Tân Quý",
    so_can: 1,
    truong: [
      t("loai_giao_dich", "ban", "bán nhà"), t("duong", "88 hẻm Tân Kỳ Tân Quý", "88 hẻm 6m Tân Kỳ Tân Quý"),
      t("ten_duong", "Tân Kỳ Tân Quý", "88 hẻm 6m Tân Kỳ Tân Quý"), t("do_rong_hem", "6", "hẻm 6m"), t("loai_duong_vao", "hem_xe_tai", "hẻm 6m"),
    ],
    kien_thuc: [],
    luu_y: "Số sau 'hẻm' không có m/mét = số hẻm (vào duong); có m/mét = bề rộng (không vào duong). ≥ 6m xe tải, ≥ 3,5m xe hơi.",
  },
  {
    // 02/10/2026 (đợt 1 chuyển luật sang AI, bắn thử lx-t6-02): model bỏ sót "chưa hoàn công", "đang thế chấp", "bớt lộc" —
    // các ô trước đây chỉ luật ghi. Ví dụ dạy ĐỌC PHỦ ĐỊNH theo nghĩa và các ô mới (cách nói khác ca bắn thử).
    cau_dang_hoi: null,
    tin: "bán nhà hẻm ba gác Tân Bình 5 tầng có thang máy, chưa hoàn công, xây 2019, sổ đang cầm ngân hàng, 9 tỷ 5 có bớt",
    so_can: 1,
    truong: [
      t("loai_giao_dich", "ban", "bán nhà"), t("quan", "Quận Tân Bình", "Tân Bình"), t("loai_duong_vao", "hem_xe_may", "hẻm ba gác"),
      t("so_tang", "5", "5 tầng"), t("thang_may", "co", "có thang máy"), t("hoan_cong", "khong", "chưa hoàn công"),
      t("nam_xay", "2019", "xây 2019"), t("the_chap", "sổ đang cầm ngân hàng", "sổ đang cầm ngân hàng"),
      t("gia", "9 tỷ 5", "9 tỷ 5"), t("thuong_luong", "co", "có bớt"),
    ],
    kien_thuc: [],
    luu_y: "Có / không đọc theo NGHĨA ('chưa hoàn công' → khong). Hẻm ba gác = hẻm xe máy. Sổ cầm ngân hàng = thế chấp.",
  },
  {
    // Bắn thật 21/09 (mau-tdt): câu chào có tên đường lẫn trong câu → model trả RỖNG, tin không có địa chỉ.
    cau_dang_hoi: null,
    tin: "chào em, anh có căn nhà ở trần đình trọng muốn bán, em tư vấn giúp anh",
    so_can: 1,
    truong: [t("loai_giao_dich", "ban", "muốn bán"), t("loai_bds", "nha_pho", "căn nhà"), t("duong", "Trần Đình Trọng", "trần đình trọng")],
    kien_thuc: [],
    luu_y: "Câu chào vẫn có dữ liệu. Tên đường KHÔNG đổi chữ cái dù nghi gõ sai — hệ thống hỏi lại.",
  },
  {
    cau_dang_hoi: null,
    tin: "Bán nhà mặt tiền đường Châu Văn Liêm phường 14 quận 5, ngang 4.2m dài 18m, 1 trệt 3 lầu, đang cho thuê 45 triệu/tháng, giá 32 tỷ còn thương lượng",
    so_can: 1,
    truong: [
      t("loai_giao_dich", "ban", "Bán nhà"), t("loai_bds", "nha_pho", "nhà mặt tiền"),
      t("duong", "Châu Văn Liêm", "đường Châu Văn Liêm"), t("phuong", "14", "phường 14"), t("quan", "Quận 5", "quận 5"),
      t("ngang", "4.2", "ngang 4.2m"), t("dai", "18", "dài 18m"), t("so_tang", "4", "1 trệt 3 lầu"),
      t("thu_nhap_thue", "45 triệu", "đang cho thuê 45 triệu/tháng"), t("gia", "32 tỷ", "giá 32 tỷ"), t("thuong_luong", "co", "còn thương lượng"),
    ],
    kien_thuc: [],
    luu_y: "Tin BÁN đang cho thuê: 45 triệu/tháng là thu_nhap_thue, không phải gia. 1 trệt 3 lầu = 4 tầng.",
  },
  {
    cau_dang_hoi: null,
    tin: "🏠 BÁN GẤP NHÀ Q6 📍 Hẻm 5m Phạm Văn Chí, P.7 📐 4.2 x 12, nở hậu 4.5 🏗 Trệt lửng 2 lầu, 3PN 3WC 📜 SHR, hoàn công 2021 💰 6.9 tỷ TL",
    so_can: 1,
    truong: [
      t("loai_giao_dich", "ban", "BÁN GẤP NHÀ"), t("gap", "co", "BÁN GẤP"), t("quan", "Quận 6", "Q6"),
      t("do_rong_hem", "5", "Hẻm 5m"), t("duong", "Phạm Văn Chí", "Phạm Văn Chí"), t("phuong", "7", "P.7"),
      t("ngang", "4.2", "4.2 x 12"), t("dai", "12", "4.2 x 12"), t("no_hau", "4.5", "nở hậu 4.5"),
      t("so_tang", "3", "Trệt lửng 2 lầu"), t("so_phong_ngu", "3", "3PN"), t("so_wc", "3", "3WC"),
      t("phap_ly", "SHR, hoàn công 2021", "SHR, hoàn công 2021"), t("gia", "6.9 tỷ", "6.9 tỷ"), t("thuong_luong", "co", "TL"),
    ],
    // 24/09/2026 (AI khác soát prompt): bản trước đưa "hoàn công 2021" vào kien_thuc trong khi phap_ly đã có — tự phạm luật "không lặp ý đã có khoá".
    kien_thuc: [],
    luu_y: "Tin Facebook: bỏ biểu tượng, mỗi mảnh một trường. Lửng không tính so_tang.",
  },
  {
    cau_dang_hoi: "noi_that",
    tin: "khách chốt nhanh anh bớt 50 triệu",
    so_can: 0,
    truong: [],
    kien_thuc: [],
    luu_y: "\"bớt / giảm N\" là MỨC GIẢM, không phải gia, không phải thương lượng → không trường nào.",
  },
  {
    cau_dang_hoi: "phuong",
    tin: "ngang 5 dài 20 nha, hẻm xe hơi, để em coi lại sổ rồi báo",
    so_can: 0,
    truong: [t("ngang", "5", "ngang 5"), t("dai", "20", "dài 20")],
    kien_thuc: [],
    luu_y: "\"hẻm xe hơi\" không số mét → không phải do_rong_hem, không phải hien_trang. Lời hứa không vào kien_thuc.",
  },
  {
    cau_dang_hoi: null,
    tin: "Bán 2000m2 đất vườn Củ Chi đường Nguyễn Thị Rành xã Trung Lập Thượng, có 300m2 thổ, giá 1 tỷ 2 cả lô, gấp",
    so_can: 1,
    truong: [
      t("loai_giao_dich", "ban", "Bán 2000m2 đất vườn"), t("loai_bds", "dat_nong_nghiep", "đất vườn"), t("dien_tich", "2000", "2000m2"),
      t("quan", "Huyện Củ Chi", "Củ Chi"), t("duong", "Nguyễn Thị Rành", "đường Nguyễn Thị Rành"), t("gia", "1 tỷ 2", "giá 1 tỷ 2"), t("gap", "co", "gấp"),
    ],
    kien_thuc: ["có 300m2 thổ"],
    luu_y: "\"2000m2\" là dien_tich, không phải dai. Xã: chưa có ô.",
  },
  {
    cau_dang_hoi: null,
    tin: "Chào em, chị có villa Thảo Điền Thủ Đức 10x20 hồ bơi sân vườn 5 phòng ngủ, giá 68 tỷ, nội thất full, sổ hồng riêng hoàn công đủ",
    so_can: 1,
    truong: [
      t("loai_bds", "biet_thu", "villa"), t("quan", "TP Thủ Đức", "Thủ Đức"), t("ngang", "10", "10x20"), t("dai", "20", "10x20"),
      t("so_phong_ngu", "5", "5 phòng ngủ"), t("gia", "68 tỷ", "giá 68 tỷ"), t("noi_that", "full", "nội thất full"),
      t("phap_ly", "sổ hồng riêng hoàn công đủ", "sổ hồng riêng hoàn công đủ"),
    ],
    kien_thuc: ["hồ bơi sân vườn"],
    luu_y: "\"Thảo Điền\" là tên KHU, không phải du_an. Không nói bán hay thuê → không loai_giao_dich.",
  },
  {
    cau_dang_hoi: null,
    tin: "cho thue phong tro gan dh spkt thu duc 25m2 co gac may lanh 2tr8/thang coc 1 thang gio giac tu do",
    so_can: 1,
    truong: [
      t("loai_giao_dich", "cho_thue", "cho thue phong tro"), t("loai_bds", "phong_tro", "phong tro"), t("quan", "TP Thủ Đức", "thu duc"),
      t("dien_tich", "25", "25m2"), t("gia", "2tr8", "2tr8/thang"), t("tien_coc", "1 tháng", "coc 1 thang"),
    ],
    kien_thuc: ["gan dh spkt", "co gac may lanh", "gio giac tu do"],
    luu_y: "Trường số chỉ ghi SỐ (\"25\", không \"25m2\"). Cọc: \"1 tháng\".",
  },
  {
    cau_dang_hoi: null,
    tin: "Bán toà CHDV Phú Nhuận 6x22 hầm 6 tầng 24 phòng full khách, thu nhập 180 triệu/tháng, giá 45 tỷ, hẻm xe hơi 8m thông",
    so_can: 1,
    truong: [
      t("loai_giao_dich", "ban", "Bán toà CHDV"), t("loai_bds", "toa_nha", "toà CHDV"), t("quan", "Quận Phú Nhuận", "Phú Nhuận"),
      t("ngang", "6", "6x22"), t("dai", "22", "6x22"), t("ket_cau", "hầm 6 tầng", "hầm 6 tầng"),
      t("thu_nhap_thue", "180 triệu", "thu nhập 180 triệu/tháng"), t("gia", "45 tỷ", "giá 45 tỷ"), t("do_rong_hem", "8", "hẻm xe hơi 8m thông"),
    ],
    kien_thuc: ["24 phòng full khách"],
    luu_y: "Toà nhà BÁN: \"thu nhập N/tháng\" là thu_nhap_thue. Hẻm có số mét mới là do_rong_hem.",
  },
  {
    cau_dang_hoi: "vi_tri",
    tin: "nhà của anh ở hem 4m pham the hien, p4 q8 nha",
    so_can: 0,
    truong: [
      t("duong", "Phạm Thế Hiển", "pham the hien"), t("do_rong_hem", "4", "hem 4m"), t("phuong", "4", "p4"), t("quan", "Quận 8", "q8"),
    ],
    kien_thuc: [],
    luu_y: "Tên đường viết lại CÓ DẤU, trích dẫn nguyên văn. Chỉ tên đường vào duong; hẻm, phường ô riêng.",
  },
  // 24/09/2026 (chủ dự án chuyển nhận xét của AI khác sau khi đọc prompt xuất ra, lượt Trần Đình Xu): ý không có khoá
  // chép NGUYÊN VĂN, không đặt nhãn diễn giải (luật thoi_han_thue chỉ cho tin cho thuê nằm ở LUAT, boc-rao.ts).
  {
    cau_dang_hoi: "so_phong_ngu",
    tin: "4 phòng ngủ em, còn tầng 1 và 2 là để kinh doanh",
    so_can: 0,
    truong: [t("so_phong_ngu", "4", "4 phòng ngủ")],
    kien_thuc: ["tầng 1 và 2 là để kinh doanh"],
    luu_y: "Ý không có khoá → CHÉP NGUYÊN VĂN vào kien_thuc, không đặt nhãn. \"tầng 1 và 2\" không phải tang.",
  },
  // 01/10/2026 (bắn thử chế độ `ai`): đang hỏi câu khác, khách nhắn "50m2", "5 tỷ" → model trả RỖNG vì tin không trả lời
  // câu đang hỏi (lx-ai-06); "3 lầu" → model ghi so_tang 3, quên trệt (lx-ai-03).
  // SRS-5.1zzzzzh (bắn production 12/10, thu-kb-dat): đang hỏi độ rộng đường, "sổ hồng riêng anh đứng tên" → truong RỖNG, cả câu vào
  // tra_loi của câu đường; bot ghi không được gì rồi hỏi lại pháp lý. Gộp vào ví dụ cùng lớp (trần độ dài bản chữ), cách nói khác ca gốc.
  {
    cau_dang_hoi: "do_rong_duong",
    tin: "50m2, 3 lầu, giá 5 tỷ, sổ đỏ riêng ba anh đứng tên",
    so_can: 0,
    truong: [t("dien_tich", "50", "50m2"), t("so_tang", "4", "3 lầu"), t("gia", "5 tỷ", "giá 5 tỷ"), t("phap_ly", "sổ đỏ riêng", "sổ đỏ riêng"),
      t("nguoi_dung_ten", "ba anh đứng tên", "ba anh đứng tên")],
    kien_thuc: [],
    luu_y: "Lạc câu đang hỏi: dữ liệu vẫn vào truong, tra_loi.co_tra_loi = false. Mỗi cụm một ô (đứng tên tách khỏi pháp lý). 3 lầu = 4.",
  },
  // SRS-5.1zzzzzzh (bắn production 14/10/2026 thu-gc-01, đất Q8): đang hỏi mặt tiền đường, "Đất có sổ đỏ chính chủ" → model trả RỖNG hoàn toàn
  // (không số, chỉ chữ; "chính chủ" đứng cạnh sổ) → pháp lý mất. Cách nói khác ca gốc.
  {
    cau_dang_hoi: "do_rong_duong",
    tin: "Lô này sổ đỏ chính chủ nha em",
    so_can: 0,
    truong: [t("phap_ly", "sổ đỏ", "sổ đỏ")],
    kien_thuc: [],
    luu_y: "Câu chỉ nói GIẤY TỜ, không trả lời câu đường → vẫn truong phap_ly, tra_loi.co_tra_loi = false, không trả rỗng. \"chính chủ\" ở đây nói về sổ (giấy tờ của chủ), không phải vai.",
  },
];

/** Bản chữ để dán vào system prompt (sau LUAT, cùng khối cache). */
export function viDuThanhChu(ds: ViDuBocRao[] = VI_DU_BOC_RAO): string {
  return ds.map((v, i) => {
    const dau = v.cau_dang_hoi ? `Câu bot vừa hỏi chủ nhà: ${v.cau_dang_hoi}\n` : "";
    const ra = JSON.stringify({ so_can: v.so_can, truong: v.truong, kien_thuc: [...v.kien_thuc, ...(v.ke_rieng ?? []).map((r) => `riêng: ${r}`)] });
    return `VÍ DỤ ${i + 1}\n${dau}Tin nhắn chủ nhà: "${v.tin}"\nĐáp án: ${ra}${v.luu_y ? `\nVì sao: ${v.luu_y}` : ""}`;
  }).join("\n\n");
}
