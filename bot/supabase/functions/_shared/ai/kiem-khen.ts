// kiem-khen.ts — AI SOÁT LỜI NHẬN XÉT của bot với lời chủ nhà (01/10/2026).
//
// Bắn thử lx-tt-08: chủ nhà "ban nha 4x15 tret 2 lau 3pn hxh q10 gia 9ty" → bot "Nhà phố hẻm sâu, kết cấu 4x15 thì dễ bán
// lắm" — "hẻm sâu" chủ nhà không nói. Lưới cũ (`boKhenKhongCanCu`, `boMenhDeKhenSai`) là DANH SÁCH cặp cụm khen ↔ cụm bằng
// chứng viết tay: cụm khen mới ("hẻm sâu", "khu yên tĩnh"…) lọt cho tới khi có người thêm dòng. Chủ dự án 01/10: lỗi lớp
// từ khoá thì đưa quyết định sang AI, code kiểm trích dẫn. Ở đây AI liệt kê từng câu NHẬN XÉT kèm căn cứ chép nguyên văn từ
// lời chủ nhà; code (`nhanXetKhongCanCu`, van-tra-loi.ts) kiểm căn cứ có thật rồi mới giữ câu. Danh sách cũ vẫn chạy làm
// lưới đỡ khi AI hỏng.
// SRS-5.1zzzzj (bắn production 09/10/2026: "Dạ vâng, nhà hẻm xe hơi đường Phạm Văn Chiêu là khách chuộng lắm anh."): luật cũ cho qua
// lời khen "khách chuộng / dễ bán" khi gắn với một đặc điểm có thật — mà điều đó là đoán NGƯỜI MUA, bot không có số liệu. Nay lời nói
// về người mua / khả năng bán luôn là đánh giá thị trường (bỏ); câu lệnh giọng (TONE_RULES, SELLER_FEWSHOT) dạy cùng một điều — bài
// `bot/tests/luat-khong-mau-thuan.mjs` đỏ khi ví dụ trong câu lệnh lại dạy câu mà lượt soát này bỏ.
// Tầng này KHÔNG ghi DB (luật `bot/tests/ranh-gioi.mjs`). Model hỏng thì NÉM — nơi gọi ghi sổ (FR-152 d).
import { z } from "npm:zod@4";
import { dinhDangLong, docLong } from "./doc-long.ts";

const NhanXet = z.object({
  cau: z.string().describe("Câu hoặc vế NHẬN XÉT trong lời bot, COPY NGUYÊN VĂN (không sửa một chữ)."),
  khang_dinh: z.string().describe("Điều câu đó khẳng định về căn nhà / khu vực / khả năng bán (ngắn)."),
  can_cu: z.string().nullable().describe("Cụm COPY NGUYÊN VĂN trong LỜI CHỦ NHÀ hoặc THÔNG TIN ĐÃ GHI nói ĐÚNG điều đó. Không có thì null."),
  // SRS-5.1zzzzx: căn cứ có thật chưa đủ — "hẻm 4m" là căn cứ cho con số, không cho "ô tô vào tới nhà". AI phân loại quan hệ giữa
  // câu và căn cứ; code bỏ `suy_ra` / `danh_gia` dù căn cứ có thật.
  kieu: z.enum(["nhac_lai", "khen_nhac_lai", "loi_ich", "suy_ra", "danh_gia"]).nullish().describe(
    "nhac_lai = nói lại đúng điều chủ nhà đã nói BẰNG CHỮ (cùng nghĩa, không thêm tính chất). khen_nhac_lai = lời khen NGẮN gắn với điểm mạnh chủ nhà NÓI BẰNG CHỮ, nhắc đúng chữ đó và không gắn thêm tính chất nào (\"hẻm xe hơi tới cửa, sổ riêng, vậy là ổn rồi anh\"; \"sổ riêng vậy là gọn rồi\" KHÔNG phải — \"gọn\" là tính chất mới). loi_ich = bot GẮN THÊM lợi ích / tính chất cho một đặc điểm chủ nhà đã nói (\"ô tô vào tới nơi\" → \"đi lại tiện\"; \"sổ riêng\" → \"giấy tờ gọn\") — chủ nhà không nói điều được gắn thêm. suy_ra = tính chất chủ nhà KHÔNG nói, suy từ con số hay dữ kiện khác (\"hẻm 4m\" → \"ô tô vào tới nhà\"; \"4 lầu\" → \"kết cấu chắc\"). danh_gia = chấm điểm tốt / xấu / vừa, nói điểm yếu hay khuyên răn (\"4x16 là diện tích vừa phải\", \"rộng rãi\", \"hẻm hẹp thì đi lại cần cẩn thận\").",
  ),
  // SRS-5.1zzzzb: chỉ lượt soát lời gửi NGƯỜI MUA dùng ô này (nhánh bán luôn false).
  noi_co_hang: z.boolean().nullish().describe("true khi câu nói bên em CÓ / còn / đang có căn, đã tìm thấy căn, hay đang lọc / tìm căn cho khách (\"dạ có anh\", \"em đang lọc căn 2 lầu cho anh\", \"em tìm thấy mấy căn\"). Không thì false."),
  // SRS-5.1zzzzk: câu nói TRẠNG THÁI TIN — chủ là lưới trạng thái ở đường ra (đối chiếu DB), không phải lưới nhận xét.
  noi_trang_thai_tin: z.boolean().nullish().describe("true khi câu KHẲNG ĐỊNH tin / bài của chủ nhà đã đăng, đang rao, đã lên web / kệ / sóng, đã duyệt, đang có khách xem tin (\"em vừa đăng tin rồi ạ\", \"tin mình lên sóng rồi\", \"bài đang chạy rồi anh\"). Lời hứa có điều kiện (\"có giá là em đăng liền\") và câu hỏi → false."),
  // SRS-5.1zzzzzzz16 (Zalo thật 14/10 10:30: tin ĐÃ lên kệ mà bot nói "Tin sẽ lên kệ trong hôm nay"): chiều ngược của ô trên — cùng chủ là
  // lưới trạng thái ở đường ra, đối chiếu DB: tin đang lên kệ thì câu này sai.
  noi_chua_len_ke: z.boolean().nullish().describe("true khi câu KHẲNG ĐỊNH tin / bài của chủ nhà CHƯA đăng, SẼ lên kệ / lên web sau, đang chờ duyệt (\"tin sẽ lên kệ trong hôm nay\", \"em chờ duyệt xong mới đăng\", \"tin chưa lên đâu anh\"). Câu hỏi → false."),
  // SRS-5.1zzzzzb: câu HỎI đưa sẵn một giá trị chủ nhà chưa nói ("nhà bác ở phường Thạnh Lộc đúng không?") là khẳng định trá hình.
  goi_y: z.boolean().nullish().describe("true khi câu là CÂU HỎI mà đưa sẵn một giá trị cụ thể (tên phường / đường / quận, con số, loại nhà…) để chủ nhà gật (\"nhà bác ở phường Thạnh Lộc đúng không?\", \"giá 5 tỷ phải không anh?\"). Câu hỏi mở (\"phường nào ạ?\") → false."),
  // SRS-5.1zzzzzc (khách mô phỏng lần năm: "anh cứ bận, tối em gọi lại nha" — bot không gọi điện được).
  hua_khong_lam: z.boolean().nullish().describe("true khi câu là LỜI HỨA bot làm việc bot KHÔNG tự làm được: gọi điện / gọi lại, đi xem nhà, gặp mặt, kiểm tra quy hoạch / sổ / giá giao dịch rồi báo (\"tối em gọi lại nha\", \"em qua xem nhà\", \"để em check quy hoạch rồi báo\"). Hứa báo khi có khách, đăng khi đủ, chờ khách nhắn → false."),
  // SRS-5.1zzzzzf (khách mô phỏng lần bảy: "Vâng ạ, 4x16 cháu ghi rồi bác ơi." — lượt đó chỉ ghi hẻm 4m + kết cấu; model ghép hẻm 4 với
  // dài 16 thành "4x16"). Câu nói bot ĐÃ GHI một giá trị cụ thể là khẳng định về sổ ghi: căn cứ chỉ ở khối EM VỪA GHI.
  ghi_nhan: z.boolean().nullish().describe("true khi câu nói bot ĐÃ GHI / lưu / ghi nhận một GIÁ TRỊ CỤ THỂ (con số, kích thước, tên đường, loại giấy tờ…): \"4x16 cháu ghi rồi\", \"em ghi hẻm 4m rồi ạ\", \"dạ sổ hồng riêng em lưu rồi\". Ghi nhận chung không kèm giá trị (\"dạ em ghi rồi ạ\") → false."),
  danh_gia_thi_truong: z.boolean().describe("true khi câu ĐÁNH GIÁ giá trị / thị trường / khả năng bán của KHU VỰC hay MỨC GIÁ, không gắn với một đặc điểm của căn (\"đất vàng\", \"khu đó bán được lắm\", \"giá khu này đang lên\")."),
});
const KetSoat = z.object({ nhan_xet: z.array(NhanXet) });
export type NhanXetLLM = z.infer<typeof NhanXet>;
const FORMAT = dinhDangLong(KetSoat);

const LUAT = `SOÁT LỜI BOT GỬI CHỦ NHÀ — bot chỉ được KHẲNG ĐỊNH điều có NGUỒN: lời chủ nhà, thông tin đã ghi, dữ liệu tra cứu của
hệ thống, hoặc CHÍNH SÁCH CỦA BÊN EM (phí bên em, ai trả, khi nào thu — khối đó là chính sách thật, nói đúng nó là có nguồn). Kiến thức riêng của người viết KHÔNG phải nguồn (tên phường của một con đường, giá khu vực, quy hoạch, dự án…).
Đọc lời bot, liệt kê MỌI câu / vế KHẲNG ĐỊNH đặc điểm căn nhà hoặc khu vực, ĐỊA DANH (đường / hẻm thuộc phường, quận nào; gần chỗ
nào), giá / thị trường, pháp lý, quy hoạch, dự án, hay khen dựa trên một đặc điểm (hẻm sâu, ô tô vào tận nhà, gần chợ, khu yên tĩnh,
xuyên thoáng, nở hậu, kết cấu chắc, "… thì dễ bán lắm", "khách chuộng …").
- LIỆT KÊ cả CÂU HỎI đưa sẵn một giá trị cụ thể chủ nhà chưa nói ("nhà bác ở phường Thạnh Lộc đúng không bác?", "giá mình 5 tỷ phải
  không?") với goi_y = true — câu đó khẳng định giá trị trước khi hỏi; can_cu như mọi khẳng định khác.
- KHÔNG liệt kê: câu hỏi mở, lời chào, cảm ơn, ghi nhận chung không kèm giá trị ("dạ em ghi rồi ạ"), lời hứa bot LÀM ĐƯỢC (báo khi có
  khách, đăng khi đủ, chờ khách nhắn).
- LIỆT KÊ câu nói bot ĐÃ GHI một giá trị cụ thể ("4x16 cháu ghi rồi", "em ghi hẻm 4m rồi") với ghi_nhan = true — can_cu chỉ chép từ khối
  EM VỪA GHI LƯỢT NÀY (đúng giá trị được nói); giá trị không có trong khối đó (kể cả khi chủ nhà có nói) thì can_cu = null.
- LIỆT KÊ lời hứa bot KHÔNG tự làm được (gọi điện, "tối em gọi lại", đi xem nhà, gặp mặt, kiểm tra quy hoạch / sổ / giá giao dịch rồi báo)
  với hua_khong_lam = true, can_cu = null.
- LIỆT KÊ cả câu nói TRẠNG THÁI TIN ("em vừa đăng tin rồi ạ", "tin mình lên sóng rồi", "bài đang chạy") với noi_trang_thai_tin = true,
  và câu nói tin CHƯA đăng / SẼ lên kệ / đang chờ duyệt ("tin sẽ lên kệ trong hôm nay") với noi_chua_len_ke = true; can_cu = null — code
  đối chiếu trạng thái thật của tin.
- can_cu: cụm chép NGUYÊN VĂN từ LỜI CHỦ NHÀ, THÔNG TIN ĐÃ GHI, DỮ LIỆU TRA CỨU hoặc CHÍNH SÁCH CỦA BÊN EM nói ĐÚNG điều được khẳng định — gần giống thì không tính
  ("hxh" là hẻm xe hơi, KHÔNG phải "hẻm sâu"; "4x15" không phải "nở hậu"). Không có thì null.
- danh_gia_thi_truong = true khi câu đánh giá KHU VỰC / THỊ TRƯỜNG / MỨC GIÁ ("khu Hà Huy Giáp đất vàng", "khu đó bán được lắm", "giá
  khu này đang lên", "quận 7 đang sốt") — bot không có số liệu thị trường nên câu đó luôn bị bỏ; tên khu chủ nhà nói KHÔNG phải căn
  cứ cho lời đánh giá về khu.
- danh_gia_thi_truong = true CẢ khi câu nói BÊN EM / hệ thống có khách, hay có khách tìm, nhiều người hỏi khu này ("quận 5 bên em hay có khách
  tìm", "khu này bên em đang có khách") — bot không có số liệu khách.
- LIỆT KÊ cả câu nói về THUẾ, phí nhà nước, thủ tục, ai chịu khoản nào ("thuế chuyển nhượng người bán chịu", "phí sang tên khoảng 1%") —
  can_cu chỉ có khi DỮ LIỆU TRA CỨU nói đúng điều đó; lời chủ nhà hỏi không phải căn cứ.
- danh_gia_thi_truong = true CẢ khi câu nói về NGƯỜI MUA hay KHẢ NĂNG BÁN của căn, dù gắn với một đặc điểm có thật ("hẻm xe hơi là
  khách chuộng lắm", "nở hậu lại sổ riêng, căn này dễ bán lắm", "mặt tiền thì bán nhanh", "đắt khách", "thanh khoản cao", "nhiều
  người tìm"): bot không có số liệu người mua — đặc điểm thật chỉ là căn cứ cho chính đặc điểm đó, không cho lời đoán thị trường.
- Khen gắn lợi ích cho đặc điểm có thật ("ô tô tới tận nhà, đi lại tiện lắm", "sổ riêng thì giấy tờ gọn") là kieu loi_ich (không phải
  đánh giá thị trường) — code bỏ: bot không gắn thêm điều chủ nhà không nói.
- SRS-5.1zzzzzr (chủ dự án 13/10: "Khen vào"): lời khen NGẮN chỉ nhắc đúng điểm mạnh chủ nhà NÓI BẰNG CHỮ, không thêm tính chất ("hẻm xe hơi tới cửa,
  sổ riêng, vậy là ổn rồi anh") là kieu khen_nhac_lai, can_cu chép đúng cụm chủ nhà nói — code GIỮ khi căn cứ có thật. Khen từ CON SỐ ("hẻm 4m
  rộng") vẫn là suy_ra / danh_gia.
- kieu: căn cứ có thật CHƯA ĐỦ — xét câu có nói ĐÚNG điều chủ nhà nói không. Chủ nhà chỉ đưa CON SỐ ("hẻm 4m", "4x16", "hẻm 2m5") thì
  mọi tính chất bot gắn thêm là suy_ra ("hẻm 4m ô tô vào tới nhà": chủ nhà chưa nói xe vào) hoặc danh_gia ("4x16 là diện tích vừa
  phải", "hẻm hẹp thì đi lại cần cẩn thận"). Chủ nhà NÓI "ô tô vào tới nơi" rồi bot nói "đi lại tiện lắm" là loi_ich.`;

// SRS-5.1zzzza (bắn production 09/10/2026): người MUA "cần mua nhà quận 5 tầm 7 tỷ, hẻm xe hơi" → trợ lý "Hẻm xe hơi tới cửa là
// khách chuộng lắm, vị trí tốt lắm" — lời khen dành cho người BÁN về căn của họ, nói với người mua chưa có căn nào trong tay. Cùng
// lượt AI soát, đổi đối tượng: AI chỉ LIỆT KÊ câu nhận xét (đọc theo nghĩa); nơi gọi quyết (không căn nào trong tay → bỏ hết).
const LUAT_MUA = `SOÁT LỜI BOT GỬI NGƯỜI MUA / THUÊ — bot CHƯA đưa căn nào cho khách xem; điều khách nói là TIÊU CHÍ TÌM, chưa phải một căn.
Đọc lời bot, liệt kê MỌI câu / vế NHẬN XÉT hay KHEN về nhà, đặc điểm nhà, tiêu chí khách đặt, khu vực, mức giá hay thị trường
("hẻm xe hơi tới cửa là khách chuộng lắm", "vị trí tốt lắm", "mặt tiền đắt khách", "khu này giá đang lên", "tầm giá đó dễ mua").
- Liệt kê CẢ câu nói có hàng / đang có căn / đã tìm thấy / đang lọc căn cho khách ("dạ có anh", "dạ còn chị", "em đang lọc căn 2 lầu
  cho anh", "em tìm thấy mấy căn hợp tầm giá") với noi_co_hang = true — bot chưa có căn nào nên câu đó sai. Câu HỨA sẽ tìm / lọc / gửi
  căn ngay ("dạ em tìm cho anh chị", "để em tìm giúp chú", "em kiếm liền cho mình") cũng noi_co_hang = true: khách đang hỏi có căn không
  mà bot không có căn nào, câu đó né câu trả lời thật.
- KHÔNG liệt kê: câu hỏi, lời chào, ghi nhận chung ("dạ em ghi nhận rồi anh"), câu nói thật là chưa có căn.
- KIẾN THỨC DỰ ÁN (SRS-5.1zzzzzq): câu nói về một DỰ ÁN (vị trí, chủ đầu tư, loại căn, diện tích từng loại căn, số căn, giá từ, tiện ích,
  bàn giao) cũng LIỆT KÊ, noi_co_hang = false; can_cu chép NGUYÊN VĂN cụm trong DỮ LIỆU TRA CỨU (khối dự án) nói ĐÚNG điều đó, kieu =
  nhac_lai. Câu tự TÍNH ra (giá căn = giá/m² × diện tích), NỐI dự án với khu / đường khách đang tìm ("gần Phạm Thế Hiển lắm") hay gắn
  thêm điều khối không nói ("tiện ích đầy đủ", "khớp ngân sách của anh") → can_cu = null, hoặc kieu suy_ra / danh_gia. Một câu nói NHIỀU
  điều thì mỗi điều MỘT dòng, cùng chép nguyên câu đó vào cau.
- Câu nói BÊN EM CÓ dự án / căn của dự án ("dạ bên em có Hà Đô Centrosa") là noi_co_hang = true: khối dự án là kiến thức, không phải hàng.
- can_cu: ngoài khối dự án ở DỮ LIỆU TRA CỨU thì luôn null (người mua chưa có căn nào để làm căn cứ).
- danh_gia_thi_truong = true khi câu đánh giá KHU VỰC / THỊ TRƯỜNG / MỨC GIÁ.`;

type ClientModel = {
  messages: {
    parse: (p: Record<string, unknown>) => Promise<{ parsed_output?: unknown; usage?: unknown }>;
  };
};

/** AI liệt kê câu nhận xét trong `loiBot` kèm căn cứ. Kết quả THÔ — đưa qua `nhanXetKhongCanCu` (van-tra-loi.ts). */
export async function soatNhanXetBangModel(
  ai: ClientModel,
  model: string,
  loiBot: string,
  loiChuNha: string,
  daGhi = "",
  doiTuong: "chu_nha" | "nguoi_mua" = "chu_nha",
  duLieuTra = "",
  /** SRS-5.1zzzzze: chính sách thật của bên em (luật phí) — nguồn hợp lệ cho câu bot nói về phí / ai trả. */
  chinhSach = "",
  /** SRS-5.1zzzzzf: sổ ghi của lượt này ("nhãn: giá trị" mỗi dòng) — nguồn DUY NHẤT cho câu "em ghi X rồi". */
  vuaGhi = "",
): Promise<{ nhanXet: NhanXetLLM[]; usage: unknown }> {
  const r = await ai.messages.parse({
    model,
    max_tokens: doiTuong === "nguoi_mua" && duLieuTra ? 900 : 500,
    output_config: { effort: "low", format: FORMAT },
    system: [{ type: "text", text: doiTuong === "nguoi_mua" ? LUAT_MUA : LUAT, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: `${doiTuong === "nguoi_mua" ? "LỜI KHÁCH MUA" : "LỜI CHỦ NHÀ"}:\n${loiChuNha.slice(-1500)}\n${daGhi ? `THÔNG TIN ĐÃ GHI:\n${daGhi.slice(0, 600)}\n` : ""}${duLieuTra ? `DỮ LIỆU TRA CỨU:\n${duLieuTra.slice(0, doiTuong === "nguoi_mua" ? 3500 : 800)}\n` : ""}${chinhSach ? `CHÍNH SÁCH CỦA BÊN EM:\n${chinhSach.slice(0, 1800)}\n` : ""}EM VỪA GHI LƯỢT NÀY:\n${vuaGhi.trim() ? vuaGhi.slice(0, 600) : "(không ghi gì)"}\nLỜI BOT:\n${loiBot.slice(0, 800)}`,
    }],
  });
  const k = docLong(KetSoat, r.parsed_output);
  return { nhanXet: k.success ? k.data.nhan_xet : [], usage: r.usage };
}
