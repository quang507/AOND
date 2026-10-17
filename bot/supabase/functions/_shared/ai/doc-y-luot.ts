// Ý NGẮN CỦA LƯỢT (02/10/2026, SRS-5.1zf) — một lượt AI NHỎ, chạy SONG SONG với lượt bóc tách, đọc lời chủ nhà theo NGHĨA:
// gật / không đồng ý / gật và bảo đăng. Trước đây do từ khoá quyết (`laDongY`, `laBaoDang`, regex "đúng rồi|ok").
//
// Vì sao tách khỏi `boc-rao.ts`: khuôn structured output của lượt bóc tách đã sát giới hạn grammar của Anthropic — #414 thêm
// MỘT ô là mọi lượt trả 400 "The compiled grammar is too large", AI không chạy, bot rơi về luật. Ý về HỘI THOẠI (không phải dữ
// liệu căn nhà) đi đường này; các đợt bỏ luật sau (xưng hô, hoãn, lời hứa, yêu cầu meta…) thêm trường ở ĐÂY.
//
// Tầng này KHÔNG ghi DB (luật `bot/tests/ranh-gioi.mjs`). Model hỏng thì NÉM — nơi gọi ghi sổ và dùng luật làm lưới đỡ.
import { z } from "npm:zod@4";
import { dinhDangLong } from "./doc-long.ts";

export const DONG_Y = ["dong_y", "dong_y_dang", "khong_dong_y", "khong_noi"] as const;
// Đợt 3 (02/10/2026, SRS-5.1zg): YÊU CẦU của chủ nhà — hỏi về chính tin của mình / hỏi bao lâu bán / xin số khách / xin xoá
// dữ liệu / xin bỏ một ô ghi nhầm. Trước đây do `hoiVeTin`, `laXinSoKhach`, `laXinXoaDuLieu`, `laXinBoTruong` (từ khoá) quyết.
// SRS-5.1zzzzzv (Zalo thật 13/10/2026 14:50–14:55): "Sửa lại giúp mình nhé!", "Phần quy mô vẫn chưa đúng ý mình" từng vào ghi chú "📝 Thêm";
// "sửa lại theo nội dung này giúp mình" bị đọc là GẬT → tin lên kệ. Hai yêu cầu mới: xin_sua (bảo sửa mà chưa đưa giá trị) và
// gui_noi_dung_sau (báo nội dung / phần sửa sắp gửi ở tin kế).
export const YEU_CAU = [
  "hoi_khach", "hoi_gia", "hoi_dien_tich", "hoi_dia_chi", "hoi_tang", "hoi_huong", "hoi_phap_ly", "hoi_trang_thai", "hoi_ban_chua",
  "hoi_noi_dang", "hoi_bao_lau_ban", "hoi_noi_dung", "xin_so_khach", "xin_xoa_du_lieu", "xin_bo_o", "xin_sua", "gui_noi_dung_sau", "khong",
] as const;
export const O_BO = ["do_rong_hem", "gia", "phuong", "quan", "dien_tich", "so_phong_ngu", "ket_cau", "phap_ly", "huong", "vi_tri", "bo_sung"] as const;
/** SRS-5.1zzl (05/10/2026, demo AOND thao tác phá dữ liệu chờ xác nhận): ngưng rao NHIỀU căn / chỉ giữ vài căn. */
export const KIEU_NHL = ["chi_giu", "an_het"] as const;
const YLuot = z.object({
  // SRS-5.1zzzn → 5.1zzzu (08/10/2026): bản đọc lại tin không dấu — từng nằm ở khuôn bóc tách, làm khuôn đó vượt giới hạn
  // grammar (15 trường cấp một, DC-13) → mọi lượt bóc tách 400. Đọc lại tin là việc của HỘI THOẠI (cần câu bot vừa nói), ở đây.
  // ĐỨNG ĐẦU khuôn: model sinh ô theo thứ tự — đọc lại trước rồi mới quyết gật / bảo đăng theo bản đọc đó (bắn thử …ke1tatt:
  // ô đứng sau, model chọn "dong_y" rồi mới đọc lại "dang di" = "đăng đi").
  doc_lai: z.string().nullable().describe("Tin chủ nhà NGẮN (dưới 200 chữ) gõ KHÔNG DẤU / viết tắt / sai chính tả → viết lại CÓ DẤU, đúng nghĩa theo câu bot vừa nói, chỉ thêm dấu và viết đủ chữ tắt, KHÔNG thêm ý, KHÔNG đổi số ('anh dung ten' → 'anh đứng tên'; 'dc e' → 'được em'). Tin đã có dấu đầy đủ, hoặc tin dài → null."),
  dong_y: z.enum(DONG_Y).describe("dong_y = GẬT / đồng ý / xác nhận điều bot VỪA nói; dong_y_dang = gật VÀ bảo đăng tin; khong_dong_y = nói không đúng / không đồng ý; khong_noi = không gật cũng không chối (chỉ đưa thông tin, hỏi lại, nói chuyện khác)."),
  dong_y_trich: z.string().nullable().describe("Cụm COPY NGUYÊN VĂN trong tin chủ nhà thể hiện ý ở dong_y. khong_noi thì null."),
  yeu_cau: z.enum(YEU_CAU).describe("Chủ nhà đang HỎI / XIN gì (xem LUẬT YÊU CẦU). Không thì khong."),
  yeu_cau_trich: z.string().nullable().describe("Cụm COPY NGUYÊN VĂN trong tin chủ nhà thể hiện yêu cầu. khong thì null."),
  yeu_cau_o: z.enum(O_BO).nullable().describe("CHỈ khi yeu_cau = xin_bo_o: ô chủ nhà xin bỏ / nói là sai (hẻm, giá, phường, quận, diện tích, phòng ngủ, số tầng, pháp lý, hướng, địa chỉ; bo_sung = một ý ở dòng \"Thêm\" của bản nháp). Không rõ ô nào thì null."),
  // SRS-5.1zzzzy: xin bỏ ý ở dòng "Thêm" — chỉ ra cụm, code chỉ bỏ mảnh có thật trong ghi chú đang lưu (`boYGhiChu`).
  bo_y: z.array(z.string()).nullable().describe("CHỈ khi yeu_cau_o = bo_sung: các ý chủ nhà xin bỏ khỏi dòng \"Thêm\", chép theo lời khách (\"con chị ở Úc\", \"sẽ tăng giá\"). Không thì null."),
  // SRS-5.1zzzzz (11/10/2026, khách mô phỏng: "ko biết cụ thể đường, chỉ biết xã thôi" → luật ghi địa chỉ = "Ko biết cụ thể đường";
  // "chị không biết phường nào" → bot hỏi phường bốn lần): lời KHÔNG BIẾT điều bot vừa hỏi là ý của hội thoại, đi lượt nhỏ này.
  khong_biet: z.string().nullable().describe("Chủ nhà nói KHÔNG BIẾT / không nhớ / không rõ điều bot VỪA HỎI (cả câu hỏi hay phần chính của nó): chép NGUYÊN VĂN cụm đó ('ko biết cụ thể đường', 'chị không rõ phường nào'). Biết phần khác mà không biết phần được hỏi thì vẫn chép cụm không biết. Có trả lời được câu đang hỏi, hay không biết chuyện KHÁC → null."),
  // SRS-5.1zzzzzl (test Zalo 13/10: bot gửi bản nháp, chủ nhà "Tiêu đề như vầy hay hơn nè: Chỉ với 7,6 tỷ ô tô tận cửa tại Bình Hưng Hòa
  // Bình Tân" → bot coi là gật, đăng luôn). Góp ý / đưa TIÊU ĐỀ là sửa bản nháp, không phải duyệt — ý của hội thoại, đi lượt nhỏ này.
  tieu_de: z.string().nullable().describe("Chủ nhà ĐƯA / đề xuất câu TIÊU ĐỀ cho tin rao ('tiêu đề như vầy hay hơn: …', 'đặt tít là …', hay gửi một câu tiêu đề ngay sau bản nháp): chép NGUYÊN VĂN chỉ câu tiêu đề, bỏ phần dẫn ('Chỉ với 7,6 tỷ ô tô tận cửa tại Bình Hưng Hòa Bình Tân'). Không có → null."),
  // 03/10/2026 (bộ đo X04, SRS-5.1zt): "em bán căn hộ q7 3 tỷ để mua nhà Bình Thạnh 6 tỷ" — câu vừa bán vừa mua chỉ vào nhánh bán,
  // khuôn bóc tách tin bán không có chỗ cho nhu cầu mua nên vế mua rơi. Vế mua là ý của NGƯỜI, đi lượt nhỏ này.
  mua_kem: z.object({
    khu_vuc: z.string().nullable().describe("Khu vực chủ nhà muốn MUA, chép như khách viết (\"Bình Thạnh\", \"q7\"). Không nói thì null."),
    ngan_sach: z.string().nullable().describe("Số tiền định MUA, chép như khách viết (\"6 tỷ\"). KHÔNG lấy giá căn đang bán. Không nói thì null."),
    loai: z.string().nullable().describe("Loại muốn mua, chép như khách viết (\"nhà\", \"căn hộ\", \"đất\"). Không nói thì null."),
    trich_dan: z.string().describe("Cụm COPY NGUYÊN VĂN trong tin chủ nhà nói về việc MUA."),
  }).nullable().describe("Chủ nhà NÓI MÌNH MUỐN MUA / TÌM MUA / ĐỔI SANG một bất động sản khác (ngoài căn đang rao). Không có thì null."),
  ngung_hang_loat: z.object({
    kieu: z.enum(KIEU_NHL).describe("chi_giu = chỉ giữ một / vài căn, ngưng rao các căn còn lại; an_het = ngưng rao / gỡ / ẩn TẤT CẢ căn."),
    giu: z.array(z.string()).describe("Cụm chỉ căn GIỮ LẠI, chép như khách viết ('căn Trần Hưng Đạo', 'căn 2', 'căn hẻm 4m'). an_het thì rỗng."),
    trich_dan: z.string().describe("Cụm COPY NGUYÊN VĂN trong tin thể hiện ý ngưng nhiều căn."),
  }).nullable().describe("Chủ nhà muốn ngưng rao / gỡ / ẩn NHIỀU căn một lúc, hoặc chỉ giữ một vài căn ('chỉ giữ căn A, ẩn hết còn lại', 'gỡ hết đi', 'ngưng rao hết trừ căn X'). Ngưng MỘT căn cụ thể, hỏi han, hay nói chuyện khác → null."),
});
const FORMAT_Y_LUOT = dinhDangLong(YLuot);

const LUAT = `Ý NGẮN CỦA LƯỢT — bạn đọc câu BOT VỪA NÓI với chủ nhà (người bán bất động sản) và TIN chủ nhà vừa nhắn, cho biết tin đó
có GẬT với điều bot vừa nói không. Đọc theo NGHĨA, có viết tắt, không dấu, tiếng lóng, emoji:
- dong_y: "ừ", "ừa", "ok e", "oke", "đúng rồi", "chuẩn rồi", "phải", "được em", "vậy cũng được", "ổn áp", "chốt", "👍" — đồng ý với câu
  bot hỏi / gợi ý (phường, tên đường, nghĩa chữ viết tắt), với bản nháp tin, hoặc với lời hẹn của bot.
- dong_y_dang: gật VÀ bảo đăng tin: "ok đăng đi", "cứ đăng như này trước", "triển luôn em", "lên tin luôn".
  "Đăng giúp chị (theo) nội dung này / nội dung sau nhé" mà câu bot vừa nói KHÔNG phải bản nháp tin và tin này không kèm nội dung căn
  (giá, diện tích, địa chỉ…) → KHÔNG phải dong_y_dang: chủ nhà sắp gửi nội dung → khong_noi + yeu_cau gui_noi_dung_sau. Bot vừa gửi
  bản nháp tin thì "đăng theo nội dung này nhé" là dong_y_dang.
- khong_dong_y: "không phải", "sai rồi", "không đúng", "chưa", "khoan đã". Chữ "ok / được / ổn" đứng sau "chưa / không / ko /
  hông" là PHỦ ĐỊNH: "chị thấy chưa ok", "chưa ổn em", "không ok lắm", "ko được đâu" → khong_dong_y, KHÔNG BAO GIỜ dong_y — đọc
  nghĩa CẢ câu, không bắt riêng chữ "ok". Gật nhầm bản nháp là đăng tin khách chưa duyệt.
- khong_noi: tin chỉ đưa thông tin căn nhà, hỏi lại bot, kể chuyện khác, hoặc không rõ. Góp ý SỬA bản nháp / đưa TIÊU ĐỀ khác
  ("tiêu đề như vầy hay hơn: …", "đổi tít thành …") là khong_noi — chưa duyệt; câu tiêu đề vào tieu_de. Bảo SỬA / LÀM LẠI / nói
  chưa đúng ý ("sửa lại giúp mình nhé", "phần quy mô vẫn chưa đúng ý mình", "sửa lại theo nội dung này giúp mình", "làm lại đi em")
  cũng là khong_noi — "giúp mình", "nhé", "theo nội dung này" KHÔNG phải gật.
Gật ở VẾ ĐẦU rồi nói thêm ("đúng rồi em, phường 2 quận 5"; "ok em, mà giá 9 tỷ 8") vẫn là dong_y — trích đúng cụm gật.
dong_y_trich phải chép NGUYÊN VĂN từ TIN chủ nhà, không lấy từ câu bot.

LUẬT YÊU CẦU (yeu_cau) — chủ nhà HỎI về CHÍNH TIN của mình (thứ đã nói / đã ghi) hoặc XIN bot làm gì:
- hoi_khach: hỏi có khách nào hỏi / quan tâm / xem căn chưa ("có ai hỏi chưa em", "nay có mống nào ko").
- hoi_gia / hoi_dien_tich / hoi_dia_chi / hoi_tang / hoi_huong / hoi_phap_ly: hỏi LẠI con số / chi tiết của tin mình đã nói
  ("hồi nãy anh nói giá bao nhiêu nhỉ", "tin ghi mấy m2 vậy em"). Hỏi giá KHU VỰC / thị trường, hỏi dự án khác → khong.
  Hỏi NGHĨA một từ ("cái chữ pháp lý là sao", "sổ hồng riêng nghĩa là gì", "thổ cư là sao em") là xin giải thích → khong.
- hoi_trang_thai: hỏi tin đã đăng / lên kệ / lên web chưa ("tin lên chưa em", "đăng được chưa").
- hoi_ban_chua: hỏi căn đã bán / chốt được chưa.
- hoi_noi_dang: hỏi tin đăng Ở ĐÂU (web nào, kênh nào).
- hoi_bao_lau_ban: hỏi bao lâu thì bán được / mất mấy tháng / có bán nhanh không.
- hoi_noi_dung: xin XEM LẠI / cho xin NỘI DUNG tin đăng, bản tin, bài rao của mình ("cho bác xin nội dung tin đăng của bác", "gửi lại
  tin cho anh coi với", "đưa lại bản tin mà bạn rao đi", "tin đăng ghi sao em", "bài rao của chị như nào"). Hỏi tin đăng Ở ĐÂU →
  hoi_noi_dang; hỏi đăng CHƯA → hoi_trang_thai. Chủ nhà xin BOT gửi bản nháp ("em bổ sung xong cho chị xem bản nháp trước khi rao
  nhé", "gửi bản nháp chị coi") → hoi_noi_dung, KHÔNG phải gui_noi_dung_sau (người sắp gửi là bot, không phải chủ nhà).
- xin_sua: bảo SỬA / LÀM LẠI bản nháp, KHÔNG ĐỒNG Ý / chưa ưng bản nháp, hay nói một phần CHƯA ĐÚNG Ý mà KHÔNG đưa giá trị mới và không
  chỉ ra ý cần bỏ ("sửa lại giúp mình nhé", "bản nháp trên mình không đồng ý", "chị thấy chưa được", "phần quy mô vẫn chưa đúng ý mình", "làm
  lại tiêu đề đi em", "chưa được, sửa lại"). Có giá trị mới ("sửa giá thành 9 tỷ") là lời sửa dữ liệu → khong; chỉ ra ý cần bỏ → xin_bo_o.
- gui_noi_dung_sau: báo nội dung / bài rao / phần cần sửa SẮP GỬI ở tin kế, tin này chưa có nội dung đó ("đăng bán giúp mình với nội
  dung sau", "sửa lại theo nội dung này giúp mình", "em đăng theo bài dưới nhé", "để chị gửi bài rao cho em"). Tin đã kèm luôn nội
  dung (có giá, diện tích, địa chỉ…) → khong.
- xin_so_khach: xin số điện thoại / Zalo / liên hệ của NGƯỜI MUA để tự gọi.
- xin_xoa_du_lieu: xin xoá tin / căn / hồ sơ / dữ liệu / tài khoản khỏi hệ thống (không phải ngưng rao vì bán rồi).
- xin_bo_o: xin bỏ / xoá MỘT chi tiết đã ghi nhầm mà KHÔNG đưa giá trị mới ("xoá cái hẻm 4m ghi nhầm đi"), hay nói MỘT chi tiết
  đang ghi / đang in trên bản nháp là SAI mà không đưa giá trị đúng ("căn chung cư không phải ở quận 5" → yeu_cau_o quan; "không phải
  hẻm đâu em" → do_rong_hem; "phường đó sai rồi" → phuong). Có giá trị mới
  ("bỏ hẻm 4m, hẻm đúng là 3m5") là lời sửa → khong. Xin bỏ ý ở dòng "Thêm" của bản nháp ("xoá mấy câu về con chị ở Úc đi",
  "bỏ cái sẽ tăng giá ra") → xin_bo_o, yeu_cau_o = bo_sung, bo_y là các ý đó — kể cả khi cùng tin có gật ("đồng ý rồi, nhưng xoá…").
  Chủ nhà bảo một dòng của bản nháp CHỈ CẦN / chỉ để / giữ lại một phần ("Quy mô chỉ cần để: trệt + 4 lầu · 6 phòng ngủ · 4 WC là
  được", "phần Thêm chỉ giữ 'gần chợ' thôi") → cũng là xin_bo_o, yeu_cau_o = bo_sung, bo_y = các ý KHÁC đang in trên dòng đó trong
  bản nháp ở "Câu BOT vừa nói" (chép nguyên văn từ bản nháp, ví dụ "rộng rãi, nhiều phòng thích hợp cho gia đình đông thành viên hay
  cho thuê lại"); không thấy bản nháp thì bo_y = null.
- khong: tin đưa THÔNG TIN căn nhà (kể cả kèm hỏi "giá 4 tỷ 3 được không?"), CHỈ gật / chào, hỏi về PHÍ / cách bên em làm việc, kể
  chuyện khác.
Gật / bảo đăng KÈM câu hỏi lại về tin ("hồi nãy anh nói giá bao nhiêu ok đăng đi", "ok em, tin ghi mấy m2 vậy") → ghi CẢ HAI: dong_y
(hay dong_y_dang) VÀ yeu_cau = hoi_gia / hoi_dien_tich…; mỗi ô trích đúng cụm của nó.
yeu_cau_trich phải chép NGUYÊN VĂN từ TIN chủ nhà.

LUẬT KHÔNG BIẾT (khong_biet) — bot vừa hỏi một điều, chủ nhà nói không biết / không nhớ / không rõ điều đó: "ko biết cụ thể đường,
chỉ biết xã thôi" (bot hỏi đường) → "ko biết cụ thể đường"; "chị thực ra không biết chính xác là phường nào đâu" (bot hỏi phường) →
"không biết chính xác là phường nào". Chủ nhà nói không biết MÀ vẫn đưa câu trả lời ("ko biết, chắc tầm 4m") → null. Không biết
điều bot KHÔNG hỏi ("con chị không rõ giá thị trường") → null.

LUẬT NGƯNG NHIỀU CĂN (ngung_hang_loat) — chủ nhà muốn ngưng rao / gỡ / ẩn NHIỀU căn trong một câu: "gỡ hết đi", "ngưng rao hết",
"chỉ giữ căn Trần Hưng Đạo, ẩn hết còn lại", "ngưng hết trừ căn 2" → kieu an_het hoặc chi_giu, giu là các cụm chỉ căn giữ lại.
Ngưng MỘT căn ("ngưng căn Nguyễn Trãi"), "bán rồi", hỏi "gỡ tin kiểu gì" → null.

LUẬT MUA KÈM (mua_kem) — chủ nhà nói CHÍNH MÌNH muốn mua / tìm mua / đổi sang căn khác ("bán căn này để mua nhà Bình Thạnh tầm 6
tỷ", "bán xong anh tính mua căn hộ q2"): khu_vuc, ngan_sach, loai chép NGUYÊN chữ khách trong phần nói về MUA, trich_dan là phần
đó. Giá / khu của căn đang BÁN không bao giờ vào mua_kem. Khách MUA HỘ người khác, kể chuyện đã mua trước đây ("anh mua căn này
năm 2019"), hỏi khách mua của tin mình → null.

ĐỌC LẠI (doc_lai) — tin NGẮN gõ không dấu / viết tắt → viết lại có dấu theo nghĩa câu bot vừa nói: "anh dung ten" (bot hỏi ai đứng
tên sổ) → "anh đứng tên"; "dc e" → "được em". Chữ không dấu đọc được HAI nghĩa mà câu bot không phân định → viết nghĩa
khớp câu bot vừa nói. Chỉ thêm dấu, viết đủ chữ tắt; không thêm ý, không đổi số.
Tin đã có dấu, hoặc dài → null. Đọc lại TRƯỚC, rồi chọn dong_y / yeu_cau theo đúng bản đọc lại đó.`;

type ClientModel = {
  messages: {
    parse: (p: Record<string, unknown>) => Promise<{ parsed_output?: unknown; usage?: unknown }>;
  };
};
export type YLuotLLM = {
  /** undefined = model không trả ô gật (nơi gọi dùng luật làm lưới đỡ). */
  dongY?: { la: typeof DONG_Y[number]; trich_dan: string | null; dang_di: boolean };
  /** undefined = model không trả ô yêu cầu. */
  yeuCau?: { loai: typeof YEU_CAU[number]; trich_dan: string | null; o: typeof O_BO[number] | null; boY: string[] };
  /** null = model nói không có vế mua; undefined = model không trả ô này. */
  muaKem?: { khu_vuc: string | null; ngan_sach: string | null; loai: string | null; trich_dan: string } | null;
  /** SRS-5.1zzl: null = model nói không có ý ngưng nhiều căn; undefined = model không trả ô này. */
  ngungHangLoat?: { kieu: typeof KIEU_NHL[number]; giu: string[]; trich_dan: string } | null;
  /** SRS-5.1zzzzz: cụm "không biết điều bot vừa hỏi" (nơi gọi kiểm trích dẫn `docKhongBiet`). null = không có; undefined = không trả. */
  khongBiet?: string | null;
  /** SRS-5.1zzzu: tin không dấu viết lại có dấu (nơi gọi kiểm `docLaiHopLe`). null / undefined = không có. */
  docLai?: string | null;
  /** SRS-5.1zzzzzl: câu tiêu đề chủ nhà đưa (nơi gọi kiểm trích dẫn). null = không có; undefined = không trả. */
  tieuDe?: string | null;
};

/** Hỏi model ý ngắn của lượt. `ket` null = model trả không đọc được (nơi gọi coi như AI không chạy). Model hỏng thì NÉM. */
export async function docYLuotBangModel(
  ai: ClientModel,
  model: string,
  tin: string,
  botVuaNoi: string | null,
  /** SRS-5.1zzzzzv: lượt đọc lại khi KHÔNG RÕ Ý — hội thoại trước đó (cũ → mới, "Chủ nhà: … / Bot: …") để hiểu tin theo mạch. */
  hoiThoaiTruoc: string | null = null,
): Promise<{ ket: YLuotLLM | null; usage: unknown }> {
  const r = await ai.messages.parse({
    model,
    max_tokens: 500,
    output_config: { effort: "low", format: FORMAT_Y_LUOT },
    system: [{ type: "text", text: LUAT, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      // SRS-5.1zzzzzv: đang chờ duyệt thì nơi gọi nối cả bản nháp 📋 vào "Câu BOT vừa nói" (để đọc "dòng X chỉ cần để…") — trần 1800 chữ.
      content: `${hoiThoaiTruoc?.trim() ? `Hội thoại trước đó (cũ → mới), đọc để hiểu tin chủ nhà đang nói về điều gì:\n${hoiThoaiTruoc.trim().slice(0, 6000)}\n\n` : ""}${botVuaNoi?.trim() ? `Câu BOT vừa nói: "${botVuaNoi.trim().slice(0, 1800)}"\n` : ""}Tin chủ nhà: "${(tin ?? "").slice(0, 6000)}"`,
    }],
  });
  // Mỗi ô đọc RIÊNG: ô này hỏng không kéo ô kia (ô hỏng = undefined = luật đỡ đúng việc đó).
  const o = (r.parsed_output && typeof r.parsed_output === "object" ? r.parsed_output : {}) as Record<string, unknown>;
  const str = (x: unknown) => typeof x === "string" && x.trim() ? x : null;
  const dy = (DONG_Y as readonly unknown[]).includes(o.dong_y) ? o.dong_y as typeof DONG_Y[number] : undefined;
  const yc = (YEU_CAU as readonly unknown[]).includes(o.yeu_cau) ? o.yeu_cau as typeof YEU_CAU[number] : undefined;
  const ket: YLuotLLM = {
    ...(dy ? { dongY: { la: dy === "dong_y_dang" ? "dong_y" : dy, trich_dan: str(o.dong_y_trich), dang_di: dy === "dong_y_dang" } } : {}),
    ...(yc ? { yeuCau: { loai: yc, trich_dan: str(o.yeu_cau_trich), o: (O_BO as readonly unknown[]).includes(o.yeu_cau_o) ? o.yeu_cau_o as typeof O_BO[number] : null,
      boY: Array.isArray(o.bo_y) ? o.bo_y.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [] } } : {}),
    ...("mua_kem" in o ? { muaKem: docMuaKemTho(o.mua_kem) } : {}),
    ...("ngung_hang_loat" in o ? { ngungHangLoat: docNHLTho(o.ngung_hang_loat) } : {}),
    ...(str(o.doc_lai) ? { docLai: str(o.doc_lai) } : {}),
    ...("khong_biet" in o ? { khongBiet: str(o.khong_biet) } : {}),
    ...("tieu_de" in o ? { tieuDe: str(o.tieu_de) } : {}),
  };
  return { ket: dy || yc || "ngung_hang_loat" in o ? ket : null, usage: r.usage };
}

function docNHLTho(x: unknown): YLuotLLM["ngungHangLoat"] {
  if (!x || typeof x !== "object") return null;
  const m = x as Record<string, unknown>;
  if (!(KIEU_NHL as readonly unknown[]).includes(m.kieu)) return null;
  const td = typeof m.trich_dan === "string" && m.trich_dan.trim() ? m.trich_dan.trim() : null;
  if (!td) return null;
  const giu = Array.isArray(m.giu) ? m.giu.filter((g): g is string => typeof g === "string" && g.trim().length > 0).map((g) => g.trim()) : [];
  return { kieu: m.kieu as typeof KIEU_NHL[number], giu, trich_dan: td };
}

function docMuaKemTho(x: unknown): YLuotLLM["muaKem"] {
  if (!x || typeof x !== "object") return null;
  const m = x as Record<string, unknown>;
  const str = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
  const td = str(m.trich_dan);
  return td ? { khu_vuc: str(m.khu_vuc), ngan_sach: str(m.ngan_sach), loai: str(m.loai), trich_dan: td } : null;
}
