// FR-208 — MODEL ĐỀ XUẤT bóc tách tin nhắn người bán, KÈM TRÍCH DẪN (14/09/2026).
//
// Model chỉ được NÓI "trường X = giá trị Y, bằng chứng là cụm Z trong tin". Có đúng hay
// không là việc của `_shared/extraction/kiem-bang-chung.ts` (tiền định). Bước 1 chạy BÓNG:
// kết quả chỉ vào `boc_tach_bong` để đo, chưa ghi tin rao.
// Tầng này KHÔNG ghi DB (luật `bot/tests/ranh-gioi.mjs`).
import { z } from "npm:zod@4";
import { dinhDangLong, docLong } from "./doc-long.ts";
import { boKeRieng, MOI_KHOA, tachKeRieng, type DeXuat } from "../extraction/kiem-bang-chung.ts";
import { viDuThanhChu } from "./vi-du-boc-rao.ts";
import { danhSachPhuongChoAi } from "../extraction/khop-phuong.ts";

const TruongBoc = z.object({
  khoa: z.enum(MOI_KHOA),
  gia_tri: z.string().describe("Giá trị như khách nói. Số thì chỉ số + đơn vị ('32 tỷ', '62.5', '2.5'). Loại/enum theo danh sách trong câu lệnh."),
  trich_dan: z.string().describe("Cụm chữ COPY NGUYÊN VĂN từ tin nhắn khách chứng minh giá trị — không sửa, không thêm, không ghép hai chỗ xa nhau."),
  can: z.number().int().nullable().describe("Tin rao NHIỀU căn: căn số mấy (1, 2…). Một căn thì null."),
});
// FR-224 (25/09/2026, chủ dự án: "đừng bắt theo từ nữa, bắt theo nguyên cả câu của khách để AI đọc lại"): AI đọc NGUYÊN
// tin và trả lời thẳng câu bot đang hỏi — không phải điền ô theo từ khoá. Code kiểm trích dẫn + con số (`kiemTraLoiCau`).
const TraLoiCau = z.object({
  co_tra_loi: z.boolean().describe("Tin có TRẢ LỜI câu bot vừa hỏi không — đọc theo NGHĨA cả câu, không theo từ khoá. Không có câu đang hỏi, khách nói chuyện khác, hỏi lại, hẹn trả lời sau → false."),
  gia_tri: z.string().nullable().describe("Câu trả lời VIẾT GỌN, ĐỦ Ý, có dấu, bỏ từ đệm, đúng ý khách, không thêm điều khách không nói — CHỈ phần trả lời ĐÚNG câu đang hỏi: ý của ô khác trong cùng tin vào truong của ô đó, không gộp vào đây (hỏi phòng ngủ, khách \"căn chị 3 pn, 2wc\" → \"3 phòng ngủ\"; 2 WC vào ô so_wc). co_tra_loi = false thì null."),
  trich_dan: z.string().nullable().describe("Cụm COPY NGUYÊN VĂN từ tin chứa câu trả lời. co_tra_loi = false thì null."),
});
// FR-226 (25/09/2026, chủ dự án: "khách trả lời nhỏ giọt về địa chỉ hoặc các trường khác thì để AI gộp lại hoặc thay thế
// hoặc sửa"): AI thấy giá trị ĐANG GHI của vài ô chữ, khách nói thêm / sửa một phần → trả TOÀN BỘ giá trị mới. Code kiểm
// mọi chữ và số của giá trị mới đều có trong giá trị cũ hoặc trong tin (`kiemCapNhat`) — không thêm được điều khách không nói.
export const KHOA_GOP = ["vi_tri", "ket_cau", "phap_ly", "do_rong_hem", "noi_that"] as const;
/** SRS-5.1zzzzzzz10: câu treo KHÔNG phải câu hỏi một ô (chờ duyệt bản nháp) — AI không được đặt dữ liệu vào tra_loi của nó. */
export const CAU_KHONG_PHAI_O: ReadonlySet<string> = new Set(["duyet_tin"]);
const CapNhat = z.object({
  khoa: z.enum(KHOA_GOP),
  gia_tri_moi: z.string().describe("TOÀN BỘ giá trị mới của ô sau khi gộp phần khách vừa nói vào giá trị đang ghi (hoặc sửa phần khách sửa)."),
  cach: z.enum(["gop", "thay"]).describe("gop = thêm chi tiết vào giá trị đang ghi; thay = khách sửa / thay giá trị đang ghi."),
});
// 01/10/2026 (chủ dự án: "xhr có thể người ta nhắn shr nhưng viết nhầm, có thể hỏi lại xác nhận"): chữ viết tắt / gõ sai mà
// AI không chắc nghĩa → không điền ô, mà đưa khả năng cao nhất vào đây để bot HỎI LẠI chủ nhà. Code chỉ dùng ở chế độ `ai`.
const XacNhan = z.object({
  khoa: z.enum(MOI_KHOA),
  gia_tri: z.string().describe("Nghĩa AI đoán là khả năng cao nhất, viết bằng từ chuẩn ('sổ hồng riêng')."),
  trich_dan: z.string().describe("Cụm khách gõ COPY NGUYÊN VĂN ('xhr')."),
});
// 01/10/2026 (bắn thử lx-hn-62; chủ dự án: "sửa từ cái gốc nguyên nhân"): khách HỎI LẠI bên mình. Trước đây "đây có phải câu
// hỏi không / hỏi về chuyện gì" do ba bộ từ khoá quyết (`laCauHoiTron`, `hoiVeTin`, `dapHoiNguocTienDinh`) — bộ từ khoá thì
// luôn thiếu cách nói mới ("bao lâu thì bán được em" → ghi làm thông tin) và bỏ dấu thì đụng chữ ("khu này" = "hồi nãy" →
// "giá khu này giờ sao" bị đáp giá rao). AI đọc mọi tin rồi, nên AI nói luôn: có hỏi không, hỏi gì, chủ đề gì.
// SRS-5.1zzzzx (khách mô phỏng 11/10: "app này có lấy tiền trước không" → chủ đề dich_vu → bot "câu này em nhờ anh chị phụ trách, em
// không dám nói sai", vài lượt sau lại tự nói chính sách phí): phí là thứ hệ thống CÓ câu trả lời (`cauPhi`), còn dich_vu gom cả thứ bot
// không có dữ liệu (hợp đồng, độc quyền) — câu phí chỉ được nhận ra bằng từ khoá trong dich_vu. Tách chủ đề `phi` để AI đọc theo nghĩa.
export const CHU_DE_HOI = ["tin_cua_minh", "phi", "thue_phi", "quy_trinh", "dich_vu", "thi_truong", "ve_bot", "nguon", "du_an", "nghia_tu", "dia_danh", "khac"] as const;
const HoiLai = z.object({
  co_hoi: z.boolean().describe("Tin có câu chủ nhà HỎI bot / bên mình không — đọc theo NGHĨA, kể cả không dấu hỏi, gõ tắt, không dấu ('bao lâu thì bán được em', 'giá khu này giờ sao', 'khu này dễ bán hông em', 'ký hợp đồng gì không em', 'phi ben minh sao'). Chỉ trả lời câu bot hỏi, kể chuyện, chào, cảm ơn → false. Khách TỰ GIỚI THIỆU mình là ai ('anh là môi giới nha', 'chị là chủ nhà', 'bên anh là sàn') là KHẲNG ĐỊNH về chính khách, không phải câu hỏi → false (ghi vào `vai`)."),
  cau_hoi: z.string().nullable().describe("Câu hỏi đó COPY NGUYÊN VĂN từ TIN NHẮN CHỦ NHÀ — không bao giờ chép câu bot vừa hỏi. co_hoi = false thì null."),
  chu_de: z.enum(CHU_DE_HOI).nullable().describe("tin_cua_minh = hỏi về chính căn mình đã rao (giá / diện tích đã ghi, đăng chưa, có khách chưa); phi = hỏi TIỀN phải trả cho bên em: phí bao nhiêu, hoa hồng, có thu tiền trước không, đăng có mất tiền không, khi nào trả ('app này có lấy tiền trước không', 'đăng tin tốn gì không em', 'hoa hồng mấy phần trăm') — phí quản lý chung cư là thông tin căn, KHÔNG phải phi; thue_phi = hỏi THUẾ, phí sang tên, công chứng, chi phí nhà nước khi mua bán, hay NGOÀI phí bên em ra còn mất khoản gì khác ('ngoài 1% đó còn mất gì không', 'thuế ai chịu em', 'phí sang tên bao nhiêu') — KHÔNG phải phi; quy_trinh = khách NHỜ hay HỎI việc bên em SẼ LÀM với tin — báo khi có khách ('khi nào có khách thì báo mình nha', 'có ai hỏi thì nhắn anh liền nhé'), bao lâu bán được, tin rao ở đâu (bên em đã có câu trả lời); dich_vu = hợp đồng, độc quyền, điều khoản, cách làm việc khác, ai xem tin, có dẫn khách không; thi_truong = giá khu vực, khu này dễ bán không, nên rao giá nào; ve_bot = bot là ai, người hay máy, công ty nào; nguon = hỏi bot SAO BIẾT / LẤY ĐÂU RA một điều bot vừa nói ('sao em biết nhà 4-6 tầng', 'ai nói em vậy', 'em lấy đâu ra số đó') — KHÔNG phải ve_bot; nghia_tu = hỏi NGHĨA một từ / thuật ngữ ('pháp lý là sao', 'sổ hồng riêng nghĩa là gì', 'thổ cư là gì cháu') — KHÔNG phải ve_bot, không phải tin_cua_minh; du_an = hỏi bên mình có BIẾT / biết gì về một DỰ ÁN, khu, toà nhà, chung cư cụ thể ('em biết dự án ny'ah phú định không', 'và dự án vinhome grand park', 'khu X thế nào em') — không phải căn đang rao; dia_danh = hỏi một con đường / hẻm / chỗ THUỘC phường, quận nào ('hẻm Quang Trung ở phường nào nhỉ', 'đường này quận mấy em') — không phải du_an; khac = còn lại. co_hoi = false thì null."),
});
// 01/10/2026 (chủ dự án: "nó có nhận ra cảm xúc của khách để báo về admin ko" → "sửa cả 4 đi"): giọng chủ nhà — AI đọc theo
// NGHĨA cả câu (có ngữ cảnh), code kiểm trích dẫn rồi mới báo admin (`docCamXuc`).
export const MUC_CAM_XUC = ["binh_thuong", "buc", "nghi_ngo", "muon_dung"] as const;
const CamXuc = z.object({
  muc: z.enum(MUC_CAM_XUC).describe("binh_thuong ('ngộp ngân hàng', 'kẹt bank', 'cắt lỗ' là áp lực TIỀN của chủ nhà, không phải bực với bot); buc = bực, cáu, chê bot hỏi nhiều / hỏi hoài; nghi_ngo = nghi lừa đảo, không tin, sợ mất tiền / mất thông tin — kể cả hỏi vặn ('sao chị biết em không lừa', 'bên em có phải lừa đảo không', 'làm sao tin được', 'đưa thông tin rồi ai chịu trách nhiệm'): đó là nghi ngờ, KHÔNG phải binh_thuong; muon_dung = bảo thôi, không rao nữa, đừng nhắn nữa. 'Bận', 'để mai' thôi chưa phải bực."),
  trich_dan: z.string().nullable().describe("Cụm COPY NGUYÊN VĂN từ TIN NHẮN CHỦ NHÀ thể hiện cảm xúc đó. binh_thuong thì null."),
});
// 01/10/2026 (chủ dự án: "câu hỏi riêng cho từng loại bds… code cứng quá nên giờ cần AI hiểu"): bảng câu theo loại (required_facts)
// vẫn là danh mục; AI đọc điều chủ nhà đã nói và chỉ ra câu KHÔNG áp dụng cho căn này, kèm trích dẫn (`docKhongCanHoi`).
// Đợt 2 chuyển luật sang AI (02/10/2026, chủ dự án: "lấy hết các luật bên kia qua cho AI"): ý định của tin và vai người rao
// trước đây do từ khoá quyết (`laNgungRao`, `laRaoLai`, hoãn, `tinHieuMoiGioi`) — "mấy bên môi giới hối chị… sợ lắm" từng báo
// admin đổi nhãn MÔI GIỚI. AI đọc theo nghĩa, code kiểm trích dẫn (`docYDinh`, `docVai`); từ khoá chỉ đỡ khi model chết.
export const Y_DINH = ["binh_thuong", "ban_roi", "ngung_rao", "rao_lai", "hoan", "du_roi", "da_noi_roi"] as const;
const YDinh = z.object({
  loai: z.enum(Y_DINH).describe("binh_thuong; ban_roi = căn ĐÃ BÁN / đã cọc / đã chốt được; ngung_rao = thôi không bán / không cho thuê nữa, rút tin; rao_lai = bán / cho thuê LẠI căn đã gỡ, 'chưa bán đâu, vẫn bán'; hoan = bận, để sau / mai nói tiếp, chưa trả lời được lúc này; du_roi = chủ nhà bảo ĐỦ thông tin rồi / đăng luôn đi / không cần hỏi thêm (KHÔNG phải câu tả nhà có chữ 'hết rồi', 'xây kín hết rồi', 'đang cho thuê'); da_noi_roi = chủ nhà bảo ĐÃ trả lời / đã nói ở tin trước, trỏ về điều đã nhắn ('nói rồi mà', 'đã trả lời rồi này', 'cái giá hồi nãy đó', 'như anh nhắn ở trên') mà tin này KHÔNG tự chứa câu trả lời. Nói về người KHÁC ('hàng xóm bán rồi') hay hỏi ('bán được chưa em') → binh_thuong."),
  trich_dan: z.string().nullable().describe("Cụm COPY NGUYÊN VĂN từ TIN NHẮN CHỦ NHÀ thể hiện ý định đó. binh_thuong thì null."),
});
export const VAI_NGUOI_RAO = ["khong_noi", "chinh_chu", "moi_gioi"] as const;
const Vai = z.object({
  la: z.enum(VAI_NGUOI_RAO).describe("Người nhắn TỰ NÓI mình là ai, bằng chữ GỌI TÊN vai: chinh_chu = 'chính chủ' / 'anh là chủ' / 'nhà của chị' / 'không phải môi giới' (có nhà, muốn bán, 'chú có căn nhà', 'sổ hồng chính chủ' KHÔNG phải tự nói vai → khong_noi); moi_gioi = tự nhận là môi giới, sale, bán giúp chủ, nhận ký gửi ('anh là môi giới nha', 'em bên sàn X', 'mình làm sale', 'hàng ký gửi của khách') — câu tự giới thiệu kết bằng 'nha/nhé/ạ' vẫn là tự nói vai. Nhắc tới môi giới KHÁC ('mấy bên môi giới hối chị'), hỏi về môi giới → khong_noi."),
  trich_dan: z.string().nullable().describe("Cụm COPY NGUYÊN VĂN người nhắn tự nói vai mình. khong_noi thì null."),
});
// 02/10/2026 (test tay chủ dự án, SRS-5.1ze): "Ừ anh đang muốn bán căn nhà…" → bot gọi "anh chị" suốt hội thoại: luật tự xưng
// (`tuXungTuCau`) là danh sách mẫu câu, câu mở bằng "Ừ" lọt. AI đọc theo nghĩa, code kiểm trích dẫn (`docTuXung`).
export const TU_XUNG_AI = ["anh", "chị", "chú", "cô", "bác", "ông", "bà", "dì", "cậu", "mợ", "thím", "dượng"] as const;
const TuXung = z.object({
  la: z.enum(TU_XUNG_AI).nullable().describe("Chữ người nhắn dùng để TỰ GỌI CHÍNH MÌNH trong tin ('Ừ anh đang muốn bán' → anh; 'nhà a 4 tầng' → anh; 'chị gửi ảnh nha' → chị; 'chú có căn nhà' → chú). Chữ đó ở VỊ TRÍ NÀO trong câu cũng tính, kể cả sau 'cho', 'giúp', 'với' ('em có nhận rao bán cho anh không' → anh; 'em gọi lại cho chị nha' → chị; 'em tìm giúp cô' → cô). Gọi người KHÁC ('anh hàng xóm', 'chị em nó', 'nhà của bà ngoại') không tính. Tin này không tự xưng nhưng một tin TRƯỚC của chủ nhà (khối 'Các tin CHỦ NHÀ đã nhắn TRƯỚC') có → vẫn đưa, trích từ tin đó. Không có đâu → null."),
  trich_dan: z.string().nullable().describe("Cụm COPY NGUYÊN VĂN có chữ tự xưng đó, từ tin này hoặc từ tin trước của chủ nhà. la = null thì null."),
});
// Đợt 3 chuyển luật sang AI (02/10/2026): câu hỏi KẾ trước đây do bảng ưu tiên + từ khoá quyết (`chonCauKe`, `re-nhanh`) — AI
// chọn trong danh sách "Câu bot còn định hỏi" như môi giới; code chỉ nhận khoá có trong danh sách hợp lệ của lượt (`docCauKe`).
const CauKe = z.object({
  khoa: z.string().nullable().describe("Khoá câu NÊN HỎI TIẾP, lấy ĐÚNG khoá trong danh sách 'Câu bot còn định hỏi'. Không có danh sách / không chắc → null."),
  ly_do: z.string().nullable().describe("Vì sao hỏi câu này tiếp (ngắn)."),
});
const KhongCanHoi = z.object({
  khoa: z.string().describe("Khoá câu trong danh sách 'Câu bot còn định hỏi' gửi kèm."),
  ly_do: z.string().describe("Vì sao câu đó không cần hỏi: không áp dụng, hoặc chủ nhà đã trả lời (ngắn)."),
  // 02/10/2026 (bắn lại thu-gapd, SRS-5.1ze): AI đọc đúng "được giá thì bán" = không gấp nhưng chỉ đưa vào đây, `truong` rỗng → không ghi.
  gia_tri: z.string().nullish().describe("Chủ nhà ĐÃ trả lời câu đó → giá trị đọc được, CÙNG cách ghi như truong (gấp / thương lượng: co hoặc khong). Câu không áp dụng thì null."),
  trich_dan: z.string().describe("Cụm COPY NGUYÊN VĂN từ lời CHỦ NHÀ (tin này hoặc ngữ cảnh) chứng minh."),
});
const DeXuatRao = z.object({
  // 02/10/2026 (đối chiếu AI ↔ code, SRS-5.1zb): "mở tin mới" từng do từ khoá quyết ("nữa", quận khác, loại khác) — "bán nhà này
  // 5 tỷ nữa là chốt" mở tin trùng, "bán vì chuyển qua quận 7" mở tin Quận 7.
  can_khac: z.boolean().describe("Chủ nhà ĐANG CÓ căn với em (khối 'Căn chủ nhà đang có' hoặc câu bot đang hỏi về một căn) mà tin này RAO / tả một căn KHÁC (khác địa chỉ, khác loại, 'còn căn nữa') → true. Trả lời, bổ sung, sửa, nói thêm về chính căn đang có ('cần bán gấp', 'giá còn bớt', 'nhà có sân thượng'), nhắc nơi khác chỉ để so sánh / chỉ đường → false. Chưa có căn nào → false."),
  so_can: z.number().int().describe("Số căn / lô KHÁC NHAU chủ nhà rao trong tin này. Không rao căn nào (chỉ bổ sung, trả lời) thì 0."),
  truong: z.array(TruongBoc),
  // 17/09/2026 (chủ dự án): "AI có thể thêm trường kiến thức… các trường khách nói bổ sung sẽ ghi vào mô tả".
  // SRS-5.1zzzzy (khách mô phỏng 11/10: "con chị bây giờ ở Úc", "sẽ tăng giá lắm" lên dòng "Thêm" của tin rao): luật cấm chuyện riêng
  // có từ trước mà model vẫn đưa vào — không có chỗ nào khác để đặt. Không thêm trường được (khuôn sát giới hạn grammar, DC-13), nên chuyện
  // riêng đi CÙNG mảng với tiền tố "riêng: "; code tách ra và bỏ (`tachKeRieng` + `boKeRieng`), không ý nào có tiền tố lên tin.
  kien_thuc: z.array(z.string()).describe("Ý KHÁC chủ nhà nói về căn nhà mà không thuộc khoá nào ở trên (gần chợ, khu an ninh, mới sơn sửa, có gác…): mỗi ý một cụm COPY NGUYÊN VĂN từ tin, giữ đủ ý của cụm đó (tiện ích kèm khoảng cách / thời gian thì chép cả: 'Chợ Rạch Kiến hoặc Chợ Phước Vân ~ 3 - 5 phút', 'Khu công nghiệp Cầu Tràm ~ 10 phút'). Bài rao dài liệt kê nhiều tiện ích thì đưa ĐỦ TỪNG tiện ích, mỗi cái một ý, không gộp, không bỏ, không tóm tắt; danh sách dài trong một câu ('kết nối DT835, DT826, Quốc lộ 1A, cao tốc Bến Lức - Long Thành') thì tách từng tên thành một ý. Chuyện riêng của chủ nhà (gia đình, con cái, cần tiền, về quê) và nhận định giá / thị trường của chủ nhà (\"sẽ tăng giá\") ghi kèm tiền tố \"riêng: \" (vd \"riêng: con chị ở Úc\") — ý đó KHÔNG lên tin. Không có thì []."),
  tra_loi: TraLoiCau,
  cap_nhat: z.array(CapNhat).describe("Chỉ khi tin nói thêm / sửa MỘT PHẦN của thông tin ĐANG GHI (danh sách gửi kèm). Không có thì []."),
  xac_nhan: z.array(XacNhan).describe("Chữ viết tắt / gõ sai KHÔNG CHẮC nghĩa (\"xhr\" có thể là shr gõ nhầm): KHÔNG đưa vào truong, đưa khả năng cao nhất vào đây để hỏi lại. Tối đa 1. Không có thì []."),
  hoi_lai: HoiLai,
  cam_xuc: CamXuc,
  khong_can_hoi: z.array(KhongCanHoi).describe("Câu trong danh sách 'Câu bot còn định hỏi' KHÔNG cần hỏi nữa: không áp dụng cho căn này theo lời chủ nhà, HOẶC chủ nhà ĐÃ trả lời / đã nói ý đó (tin này hay các tin trước, kể cả nói vòng: '16 tỉ, rao khi nào được giá thì bán' là đã trả lời câu gấp; 'ở 10 năm nay' chưa trả lời câu nào). Đã trả lời mà đọc được giá trị thì VẪN đưa giá trị vào truong. Không có danh sách / không chắc thì []."),
  y_dinh: YDinh,
  vai: Vai,
  cau_ke: CauKe,
  tu_xung: TuXung,
});
// Đọc kết quả: `tra_loi` có thể thiếu (bản model cũ / mock e2e) — thiếu thì coi như AI không nói, không hỏng cả lượt.
const DeXuatRaoDoc = DeXuatRao.extend({ can_khac: z.boolean().nullish(), tra_loi: TraLoiCau.nullish(), cap_nhat: z.array(CapNhat).nullish(), xac_nhan: z.array(XacNhan).nullish(), hoi_lai: HoiLai.nullish(), cam_xuc: CamXuc.nullish(), khong_can_hoi: z.array(KhongCanHoi).nullish(), y_dinh: YDinh.nullish(), vai: Vai.nullish(), cau_ke: CauKe.nullish(), tu_xung: TuXung.nullish() });
export type CauKeLLM = z.infer<typeof CauKe>;
export type YDinhLLM = z.infer<typeof YDinh>;
export type VaiLLM = z.infer<typeof Vai>;
export type TuXungLLM = z.infer<typeof TuXung>;
export type CamXucLLM = z.infer<typeof CamXuc>;
export type KhongCanHoiLLM = z.infer<typeof KhongCanHoi>;
export type HoiLaiLLM = z.infer<typeof HoiLai>;
export type XacNhanLLM = z.infer<typeof XacNhan>;
export type CapNhatLLM = z.infer<typeof CapNhat>;
export type TraLoiCauLLM = z.infer<typeof TraLoiCau>;
export type DeXuatRaoLLM = z.infer<typeof DeXuatRaoDoc>;
const FORMAT_RAO = dinhDangLong(DeXuatRao, DeXuatRaoDoc);

const LUAT = `BÓC TÁCH TIN NHẮN NGƯỜI BÁN BẤT ĐỘNG SẢN — CHỈ ĐIỀU KHÁCH NÓI.
Bạn đọc MỘT tin nhắn của chủ nhà / môi giới (rao căn mới, hoặc trả lời câu bot vừa hỏi, hoặc sửa lời) và liệt kê từng thông tin CÓ TRONG TIN.
Tin có thể gồm vài dòng khách nhắn liên tiếp trước khi rao (địa chỉ nói trước, giá nói sau) — đọc cả đoạn như lời về cùng một căn.

LUẬT CỨNG (code kiểm từng trường, sai là bị bỏ):
1. Mỗi trường phải có "trich_dan" là cụm chữ COPY NGUYÊN VĂN trong tin. Không có cụm nào nói thẳng → KHÔNG đưa trường đó.
   trich_dan GỌN đúng phần nói giá trị: không kèm chữ xưng hô và lời kể đi sau ("sổ hồng bác có rồi" → "sổ hồng"; "shr bạn, mình có sổ riêng" → "shr";
   "hẻm ngang khoảng 2m" là bề rộng hẻm 2m, giữ nguyên cụm). Ô ghi nguyên văn lấy đúng cụm này, thừa chữ là thừa trên tin đăng.
2. Không suy luận, không đoán, không lấy kiến thức ngoài: không tự điền quận từ tên đường/dự án, không tự đổi "3 tấm" thành số tầng khác, không tự tính diện tích nếu khách không nói diện tích hoặc ngang×dài.
3. Giá trị phải đọc ra được từ chính cụm trích: tiền "32 tỷ" thì cụm phải có "32 tỷ".
4. Tiền cọc, phí sang nhượng, hoa hồng, tiền thuê ĐANG THU của căn bán KHÔNG phải "gia". Tiền thuê đang thu → "thu_nhap_thue". Cọc → "tien_coc".
   Tiền LÀM THÊM của chủ nhà (hoàn thiện, nội thất, sửa chữa, đầu tư thêm: "hoàn thiện theo ý gia chủ tầm 1,2 tỷ", "nội thất làm thêm 800
   triệu") cũng KHÔNG phải "gia" — bài rao có giá rao ("chỉ 6.950 tỷ") thì gia là số đó; câu tiền làm thêm vào kien_thuc nguyên văn.
5. Sửa lời ("à nhầm, 6 tỷ 5 nha", "là đất trống chứ không phải nhà") → chỉ đưa giá trị MỚI, trích đúng cụm giá trị mới. Lúc đang chờ duyệt
   bản nháp, câu BẢO SỬA kèm giá trị ("Điều chỉnh cho mình giá 6,950 tỷ", "sửa giá từ 1,2 tỷ thành 6,950 tỷ", "diện tích để 80m2 nha") là LỜI
   SỬA DỮ LIỆU, không phải lời nói với bot: đưa ô đó với giá trị MỚI vào truong (gia "6,950 tỷ", trích "thành 6,950 tỷ"), KHÔNG để trống; ô
   đó có trong "Thông tin đang ghi" thì đưa thêm vào cap_nhat cach "thay". Câu ĐƯA ĐỊA CHỈ ĐÚNG lúc duyệt ("căn của mình tại địa chỉ Ấp 18
   KDC 584, Tân Nhựt, bạn sửa lại giúp mình") cũng vậy: duong + ten_duong / phuong / quan vào truong — KHÔNG để ở tra_loi.
6. Tin rao nhiều căn → điền "can" cho từng trường.

KHOÁ:
- loai_giao_dich: "ban" | "cho_thue". "Sang nhượng mặt bằng / quán" là cho_thue; "sang nhượng căn hộ / nhà" là ban. Câu chào mở đầu "mình cần cho thuê nhà" / "em muốn cho thuê căn hộ" / "có nhà cho thuê" CŨNG là cho_thue (trích "cần cho thuê nhà") dù chưa có dữ liệu khác; "cần bán" là ban. Tin không nói bán hay thuê thì KHÔNG đưa.
- loai_bds: chung_cu | nha_pho | nha_cap4 | dat | biet_thu | phong_tro | mat_bang | toa_nha | dat_nong_nghiep | dat_kinh_doanh | kho_xuong. "Đất nền KDC" là dat.
  Tin RAO hay câu TẢ CĂN của người bán (kể cả KHÔNG có chữ bán / cho thuê: "nhà anh ở hẻm 137 Nguyễn Trãi", "chỗ anh 1 trệt 2 lầu")
  LUÔN đưa loai_bds khi có chữ chỉ loại, kể cả không dấu: "bán nhà", "nhà hẻm", "nhà mặt tiền", "nhà 1 trệt 2 lầu", "nhà anh ở",
  "ban nha hem" → nha_pho (trừ khi nói cấp 4 / biệt thự / chung cư / phòng trọ); trich_dan là cụm có chữ "nhà". Không có chữ chỉ loại thì không đưa.
  Nhà cấp 4 chỉ có MỘT trệt (có thể có gác lửng), KHÔNG có lầu: "nhà 4 lầu", "nhà 3 tầng", "1 trệt 2 lầu" → nha_pho (trừ khi nói biệt thự).
- gia (giá bán; tin cho thuê thì giá thuê), gia_m2, tien_coc, thu_nhap_thue (CHỈ tiền thuê căn BÁN đang thu). Giá trị tiền LUÔN kèm đơn vị như khách viết: "5 tỷ 2", "3 tỷ 150", "900 triệu", "95 triệu/m2" — không viết số trần "5.2".
- dien_tich (m²), ngang, dai, no_hau (m), do_rong_hem, do_rong_duong, cach_mat_tien (m): trong "truong" chỉ con số (hẻm xe hơi không có số mét thì không đưa vào truong — nhưng VẪN là câu trả lời câu hẻm ở "tra_loi").
  Số đo nào vào ô nào (code kiểm: cụm trích phải nói ĐÚNG chuyện của ô): "mặt tiền 4m", "MT 5m", "ngang 4", "4x16" = CHIỀU NGANG căn
  (ngang) — KHÔNG phải loai_duong_vao, KHÔNG phải do_rong_duong; "mặt tiền đường 8m", "đường trước nhà 8m", "lộ giới 12m" = do_rong_duong;
  "hẻm 4m" = do_rong_hem; "mặt tiền hẻm 6m" = nhà nằm mặt HẺM (do_rong_hem 6, không phải mat_tien); "cách mặt tiền 20m" = cach_mat_tien
  (cach_mat_tien CHỈ khi có chữ "cách / ra / tới" đường lớn — "Mặt tiền 6m" trong bài rao là ngang 6). "Ngõ", "kiệt" = HẺM (cách gọi
  miền Bắc / Trung): "ngõ rộng 6m" = do_rong_hem 6, "ngõ ô tô vào" = hem_xe_hoi. "Ô tô vào thoải mái / tận cửa" nói về HẺM (loai_duong_vao
  hem_xe_hoi), KHÔNG phải o_to_vao_nha (ô tô vào đậu TRONG nhà).
  Cặp "ngang A dài B" là kích thước CĂN (ngang A, dai B) kể cả khi đứng ngay sau chữ "hẻm" ("ở hẻm Phan Xích Long, hẻm ngang 5 dài 18" →
  ngang 5, dai 18) — KHÔNG phải do_rong_hem; bề rộng hẻm phải có "rộng" hoặc số mét gắn với hẻm ("hẻm 4m", "hẻm rộng 3m").
- so_phong_ngu, so_wc: số HIỆN CÓ, MỘT con số. Khách kể theo tầng mà cộng được ("3 phòng ngủ ở lầu với 1 phòng ở trệt") → TỔNG (4), trích cả cụm. "chia được 4-5 phòng để cho thuê", "làm thêm được 2 phòng" là tiềm năng → kien_thuc, không vào so_phong_ngu; khách nói khoảng / không chắc ("chắc 3-4 phòng") → không đưa. so_tang = TỔNG số tầng tính CẢ TRỆT, không tính lửng/sân thượng ("1 trệt 2 lầu" = 3, "trệt 3 lầu" = 4, "3 tấm" = 3, "3 tầng" = 3 — TẦNG đã gồm trệt, chỉ LẦU mới cộng 1); tang = căn hộ nằm tầng mấy. Tin có cụm kết cấu (trệt / lầu / lửng) thì ket_cau là ô chính, so_tang chỉ là số tính ra từ cụm đó — đưa cả hai được, code giữ ket_cau.
- quan: ghi đủ "Quận 5", "Quận Phú Nhuận", "Huyện Bình Chánh", "TP Thủ Đức". phuong, duong, ma_can. quan / phuong / duong là NƠI CĂN NHÀ
  NẰM — nơi GẦN đó, nơi đi tới, nơi chủ nhà ở / chuyển tới thì KHÔNG đưa ("ra Quận 1 có 5 phút", "vào quận 5 khoảng 20 phút", "qua Phú Mỹ
  Hưng Q7 cũng 20 phút", "gần chợ Bến Thành", "bán vì chuyển qua quận 7").
  Người rao NHIỀU căn đã nói quận CHUNG cho các căn ở tin trước ("có mấy căn quận 5 cần đăng", "cả 2 căn đều quận 10") mà tin này rao căn
  tiếp theo không nói quận → đưa quan, trich_dan là đúng cụm quận ở tin trước đó (chỉ quận; loại, giá, địa chỉ của căn trước KHÔNG lấy).
- phuong: ĐỌC THEO NGHĨA, không cần chữ "phường / xã" đứng trước — "nhà ở Vĩnh Lộc B", "bên Thảo Điền", "an hoi tay", gõ sai một hai chữ đều là nói phường. Trả tên phường MỚI ĐẦY ĐỦ đúng như DANH SÁCH PHƯỜNG gửi kèm tin nhắn (chỉ gồm các phường câu khách có thể đang nhắc; không có danh sách thì chỉ đưa phuong khi khách nói rõ "phường / xã X") ("Phường An Hội Tây", "Xã Tân Vĩnh Lộc"): khách nói tên CŨ thì đổi sang phường mới theo bảng tên cũ ("Vĩnh Lộc B" → "Xã Tân Vĩnh Lộc", "Thảo Điền" → "Phường An Khánh"); phường cũ bị chia (dấu *) sang nhiều phường mới mà câu không đủ để biết phần nào thì KHÔNG đưa phuong. KHÔNG cắt bớt chữ ("An Hội Tây" ≠ "An Hội"). trich_dan = cụm khách nói nguyên văn ("Vĩnh Lộc B"). Tên trùng tên quận cũ ("gò vấp", "phú nhuận") mà khách không nói "phường" thì là QUẬN. Phường đánh số ("phường 12", "p4") giữ số: "Phường 12".
- duong / ten_duong CHỈ khi tin có tên đường, hẻm hoặc số nhà. Tên xã / phường / huyện / quận và kích thước ("10x50") KHÔNG phải địa
  chỉ — "đất 10x50 củ chi xã tân an hội" chỉ có quan + phuong + ngang × dài, KHÔNG đưa duong / ten_duong (code bỏ, bot sẽ hỏi đường).
  Tin CHỈ nói chỗ căn nằm ("Tại đường Trương Đình Hội", "ở hẻm 45 Nguyễn Trãi", "nhà nằm trên đường Lê Lợi") LÀ duong + ten_duong (trích
  "đường Trương Đình Hội"), KHÔNG phải kien_thuc.
- duong (ĐỊA CHỈ ĐẦY ĐỦ, có dấu, như khách nói; ô này hiện dưới tên "vi_tri" trong "Thông tin đang ghi" và cap_nhat — hai tên, MỘT ô): giữ nguyên số nhà, SỐ HẺM và ĐÚNG THỨ TỰ CHỮ khách gõ — KHÔNG đảo, KHÔNG sắp xếp lại
  ("hẻm 45 Nguyễn Trãi" giữ là "hẻm 45 Nguyễn Trãi", không thành "45 hẻm Nguyễn Trãi"; "hẻm 18/5 đường Cách Mạng Tháng 8", "12/3 Lê Văn Sỹ",
  "88 hẻm Tân Kỳ Tân Quý" là khi khách gõ đúng thứ tự đó). trich_dan của duong là CỤM ĐỊA CHỈ NGUYÊN VĂN trong tin — hệ thống ghi chính cụm
  đó vào tin, nên trích đủ số nhà + hẻm + tên đường, không trích thừa phường / quận. Quy ước TP.HCM: "137/28 đường số 59" là HẺM 137 của đường số 59, NHÀ SỐ 28 trong hẻm (số
  sau dấu "/" cuối là số nhà; "137/28/5" = nhà 5 trong hẻm 137/28) — ghi "137/28 đường số 59", không đảo số, không bỏ số. KHÔNG ghi BỀ
  RỘNG hẻm vào duong ("hẻm 6m", "4 mét" → do_rong_hem). Tên đường bằng số / mã thì ghi kèm chữ "đường": "đường 3/2", "đường 30/4",
  "đường D2", "đường số 7". Số đứng SAU tên đường là một phần TÊN ĐƯỜNG (đường đánh số vùng ven: "Thạnh Lộc 41", "Hiệp Thành 13",
  "Tân Chánh Hiệp 10") — giữ trọn trong duong, ten_duong và trich_dan; số đứng TRƯỚC tên đường mới là số nhà.
- ten_duong: CHỈ TÊN ĐƯỜNG, có dấu — không số nhà, không số hẻm, không chữ "hẻm / đường": "Nguyễn Trãi", "Cách Mạng Tháng 8", "3/2",
  "30/4", "D2", "số 7", "Tân Kỳ Tân Quý". Có duong thì LUÔN đưa kèm ten_duong (cùng trích dẫn với duong).
- SỐ HẺM khác BỀ RỘNG HẺM: số đứng sau "hẻm" mà KHÔNG có đơn vị là SỐ HẺM, thuộc duong ("hẻm 45", "hẻm 18/5", "hẻm 1135", "hẻm 284").
  Bề rộng LUÔN có "m" / "mét" / "rộng": "hẻm 4m", "hẻm 4 mét", "hẻm rộng 4", "hẻm 3m5", "hẻm 6m" → do_rong_hem (chỉ con số). "hẻm 4"
  trần (số nhỏ, không đơn vị, không "rộng") là mập mờ → không đưa do_rong_hem.
- du_an: tên dự án / khu dân cư / chung cư. Tên phường, tên khu vực (Thảo Điền, An Phú) KHÔNG phải dự án.
- huong: chỉ phương (Đông, Tây Nam…); "view sông" là view.
- phap_ly: giấy tờ (sổ hồng riêng, sổ chung, vi bằng, hoàn công; "chưa có sổ", "đang chờ sổ", "hợp đồng mua bán", "giấy tờ thường", "giấy tay", "không có shr" cũng là câu trả lời pháp lý — ghi đúng chữ khách; nói cả hai vế "không có shr, giấy tờ thường" thì ghi vế khẳng định "giấy tờ thường"). Giấy tờ KÈM về tình trạng pháp lý của nhà cũng là ô này, KHÔNG phải kien_thuc: "có kê khai thuế hằng năm", "đóng thuế đất đầy đủ", "có công chứng vi bằng", "có giấy phép xây dựng", "có hoàn công", "đã ra sổ", "sổ đang cầm ngân hàng" (ghi thêm the_chap) — khách nói nhiều vế thì gộp vào MỘT gia_tri cách nhau bằng ", " ("công chứng vi bằng, có kê khai thuế hằng năm"). "Thổ cư" không phải pháp lý.
- noi_that, ly_do_ban (lý do CẦN bán, không phải "gấp"), ket_cau (trệt/lầu/lửng/hầm), thoi_han_thue (CHỈ tin cho thuê; tin BÁN đang có người thuê thì hạn hợp đồng vào ô han_hop_dong_thue, KHÔNG vào kien_thuc), phi_quan_ly, view, hien_trang (tình trạng CĂN NHÀ: mới xây, cũ, cần sửa, bàn giao thô — còn "đang ở / đang cho thuê / để trống" là hien_trang_su_dung): chữ — giá trị là cụm ngắn NẰM TRONG trích dẫn. "cách đường X 200m" là khoảng cách tới mặt tiền (cach_mat_tien), KHÔNG phải vi_tri — vi_tri chỉ là chỗ căn nằm (số nhà, hẻm, đường nhà ở trên). "nhà trống" / "để trống" là hien_trang_su_dung (không người ở), KHÔNG phải noi_that — noi_that chỉ ghi khi khách nói về đồ đạc (full nội thất, bàn giao thô, không nội thất).
- gap, thuong_luong: gia_tri CHỈ là "co" hoặc "khong" (không chép cụm khách nói vào gia_tri). Hoa hồng môi giới KHÔNG phải thương lượng.
  gap đọc theo NGHĨA cả câu, có phủ định, kể cả khi bot đang hỏi câu khác:
  khong = "được giá thì bán / thì thôi", "rao khi nào được giá", "giá tốt thì bán, không thì để đó", "không vội", "từ từ", "chưa cần tiền",
  "bán chơi", "ko gấp", "hong có gấp gì", "chưa cần bán gấp";
  co = "bán gấp", "cần tiền gấp", "kẹt tiền", "kẹt bank", "ngộp ngân hàng / ngộp bank", "cắt lỗ cũng bán", "cần ra hàng sớm", "ra nhanh trong tháng".
  Một tin có cả giá lẫn ý gấp ("16 tỉ em, rao khi nào được giá thì thôi") → đưa CẢ HAI trường, không chỉ giá.
- loai_duong_vao: mat_tien | hem_xe_tai | hem_xe_hoi | hem_xe_may | hem | khong_hem — đường trước nhà, đọc theo NGHĨA cả câu, kể
  cả phủ định. CĂN HỘ chung cư không có đường trước nhà: "căn hộ ngay mặt tiền Quốc lộ 1", "dự án mặt tiền Nguyễn Văn Linh" là vị trí
  của DỰ ÁN → tien_ich_gan, KHÔNG đưa loai_duong_vao / do_rong_duong. Còn lại: "hxh", "ô tô vào tận nhà" → hem_xe_hoi; "hxm", "xe hơi không vào được" → hem_xe_may; "mặt tiền đường", "mặt đường", "mặt phố", "nhà mặt tiền" (không kèm số đo ngay sau),
  "mặt tiền / MT + TÊN ĐƯỜNG" ("căn 2 mặt tiền Hồng Bàng", "nhà MT Nguyễn Trãi") → mat_tien (tin nhiều căn: đưa riêng cho đúng căn). "MT",
  "MTKD", "MTNB", "mặt tiền kinh doanh", "mặt tiền nội bộ" là viết tắt CHUẨN của nghề = nhà nằm mặt tiền → LUÔN đưa loai_duong_vao mat_tien (trích
  đúng chữ "MT" / "MTKD"), kể cả khi tin còn số đo ở chỗ khác ("Bán nhà MT Nguyễn Trãi Q5, 5x20" → mat_tien + ngang 5 + dai 20); chỉ khi số
  đo đứng NGAY SAU chữ MT ("MT 5m", "mặt tiền 4m") thì đó là chiều ngang, không phải loại đường vào; chỉ nói "trong hẻm" → hem; "không có hẻm", "nằm trong khu công nghiệp / nội khu" → khong_hem. "Gần / cách mặt
  tiền" KHÔNG phải mat_tien. "Đường trước nhà / đất (rộng N m)", "lộ giới" là ĐƯỜNG (do_rong_duong): xe gì vào được trên con đường đó ("xe tải vô
  được") KHÔNG làm nó thành hẻm — khách không nói hẻm thì không đưa hem_*. Chủ CHỈ nói bề rộng hẻm (không nói xe nào vào) → theo bề rộng: dưới 3m → hem_xe_may; 3m đến dưới
  3,5m → hem; từ 3,5m → hem_xe_hoi; từ 6m → hem_xe_tai (trích dẫn là cụm bề rộng, vd "hẻm 4m"). Số hẻm ("hẻm 45") KHÔNG phải bề rộng.
- o_to_vao_nha (ô tô vào / đậu TRONG nhà), hoan_cong (đã hoàn công), thang_may, can_goc (căn góc, lô góc, hai mặt tiền):
  "co" | "khong" — đọc phủ định theo nghĩa ("chưa hoàn công", "không có thang máy" → khong). nam_xay: năm 4 chữ số.
- Ô chữ (cụm ngắn, có dấu, bỏ từ đệm "em / nha / ạ", không thêm ý khách không nói): quy_hoach (quy hoạch, lộ giới), the_chap
  (đang thế chấp), tranh_chap, tho_cu (thổ cư bao nhiêu / full / toàn / hết thổ cư — "ko biết, toàn thổ cư" vẫn là tho_cu = "toàn thổ cư": chỉ không biết số m²), len_tho_cu, xay_dung (được xây mấy tầng, giấy
  phép), so_phong (TỔNG số phòng cho thuê của CHDV / toà nhà / dãy trọ), dien_tich_san (TỔNG sàn xây dựng / sử dụng của NHÀ nhiều tầng — "Dtsd", "DTSD", "dt sử dụng", "tổng sàn" đều là ô này, KHÔNG phải dien_tich; diện tích CĂN HỘ ghi dien_tich), chieu_cao
  (cao thông thủy), hem_thong (hẻm thông / cụt), duong_vao (đường nhựa, bê tông…), ngap_nuoc, tien_ich_gan (tiện ích gần,
  ĐÚNG chữ khách — bài rao "Gần trường A, chợ, siêu thị B, công viên C" → tien_ich_gan là cả danh sách đó), tiem_nang (CHỈ khi khách nói
  thẳng — "dễ kinh doanh hoặc cho thuê", "phù hợp gia đình hoặc đầu tư" là tiem_nang, KHÔNG phải nhà đang cho thuê), muc_dich, hinh_dang (vuông vức, nở hậu, tóp hậu), san_vuon, pccc,
  thoi_han_su_dung (thời hạn sử dụng ĐẤT ghi trên sổ — "lâu dài" / "50 năm" — CHỈ đất, kho xưởng; "khách thuê lâu dài", "ưu tiên thuê lâu dài" của tin cho thuê KHÔNG phải ô này, để vào kien_thuc), han_hop_dong_thue (hợp đồng thuê ĐANG CHẠY của căn bán), ty_le_lap_day, phi_gui_xe,
  mat_do_xd, tang_cao_toi_da, tai_trong_san, toa_thap (toà / block), khu_compound, ha_tang, fit_out, duong_container (xe
  container vào được không), tram_bien_ap, xu_ly_nuoc_thai, nguon_nuoc, ranh_gioi, hinh_thuc_thue_dat (trả tiền một lần /
  hằng năm), hien_trang_su_dung (chủ ĐANG Ở / đang cho thuê / để trống — không phải hien_trang), truot_gia.
- Pháp lý chi tiết (ô chữ, viết lại CÓ DẤU đúng ý khách, không thêm ý): nguoi_dung_ten (AI đứng tên sổ — CHỈ khi khách nói AI đứng
  tên: "anh đứng tên", "ba anh đứng tên", "vợ chồng đứng tên" — chữ "anh/chị" ở đây là chính chủ nhà, KHÔNG phải tên người; "sổ đỏ chính
  chủ" / "sổ hồng chính chủ" / "giấy tờ chính chủ" là PHÁP LÝ (phap_ly "sổ đỏ" / "sổ hồng"), KHÔNG phải nguoi_dung_ten — "chính chủ" cạnh
  chữ sổ nói về giấy tờ, không nói ai đứng tên), dong_so_huu_voi (đứng tên chung với ai),
  dong_y_ban (các bên đứng tên đã đồng ý bán chưa), so_huu (lâu dài / 50 năm), giay_to_hien_co (giấy tờ đang có khi chưa có sổ: hợp đồng
  mua bán, vi bằng), du_kien_ra_so (khi nào ra sổ), ban_giao (đã nhận bàn giao chưa), dien_tich_khop_so (diện tích thực tế khớp sổ không).
- Khác: tang_phu (lửng, sân thượng, tầng hầm), gia_dien_nuoc (giá điện nước cho thuê), gio_giac (giờ giấc ra vào), nganh_hang_phu_hop
  (mặt bằng hợp buôn bán ngành gì).
- kien_thuc: ý khác về CĂN NHÀ không có khoá nào ở trên (an ninh, đồ để lại, lịch sử, tiện ích xung quanh kèm khoảng cách…) — cụm CHÉP NGUYÊN VĂN, giữ đủ ý; bài rao dài có nhiều tiện ích thì liệt kê ĐỦ từng tiện ích (mỗi cái một ý), không gộp / không bỏ / không tóm tắt; KHÔNG đặt nhãn diễn giải ("tiềm năng kinh doanh", "phù hợp đầu tư", "dòng tiền tốt", "khai thác thương mại") khi khách không nói đúng chữ đó; KHÔNG đưa lời chào, câu hỏi, và không lặp ý đã có khoá. Chuyện riêng của chủ nhà (gia đình, con cái, cần tiền, về quê) và nhận định giá / thị trường của chủ nhà ("sẽ tăng giá") ghi với tiền tố "riêng: " — kien_thuc không tiền tố lên tin rao công khai.
Tin CHỈ có chào / cảm ơn / hỏi lại → truong = [], kien_thuc = []. Tin có lời chào, lời gật hay CÂU HỎI ĐI KÈM ý bán / tả căn ("chào em, chị
muốn bán lô đất", "ừ anh bán nhà", "dạ cô có căn hộ cần bán", "chị muốn bán căn hộ, mà bên em lấy phí sao") → bỏ qua PHẦN chào / gật / hỏi,
VẪN bóc phần còn lại (loai_giao_dich, loai_bds…) — câu hỏi vào hoi_lai, ý bán vẫn vào truong.

NGỮ CẢNH — tin nhắn có thể kèm vài lượt trao đổi NGAY TRƯỚC (bot nói gì, chủ nhà nói gì) và CÂU BOT VỪA HỎI đúng nguyên văn.
Dùng ngữ cảnh để HIỂU tin như người đang nói chuyện: "ừ", "đúng rồi", "cái đó", "như trên", "vậy đi" hiểu theo câu bot vừa nói.
MỌI trich_dan của truong / tra_loi / xac_nhan / cap_nhat / cam_xuc vẫn COPY từ TIN NHẮN CHỦ NHÀ — ngữ cảnh không phải nguồn giá trị.
- Câu bot vừa hỏi là câu CHỌN MỘT TRONG HAI ("cần ra hàng gấp hay được giá thì thôi", "sổ riêng hay sổ chung", "để ở hay cho thuê")
  mà khách chỉ "ừ / ok / dạ / đúng / được / có" → không biết chọn vế nào → tra_loi.co_tra_loi = false. Câu CÓ / KHÔNG ("có gấp
  không") thì "ừ" là có.

CẢM XÚC ("cam_xuc") — đọc giọng chủ nhà trong tin này, có ngữ cảnh: bực vì bị hỏi nhiều, nghi lừa đảo, bảo thôi không rao nữa.
Đọc theo NGHĨA cả câu; "bận", "để mai" chưa phải bực. Bình thường → binh_thuong, trich_dan null.

KHÔNG CẦN HỎI ("khong_can_hoi") — có danh sách "Câu bot còn định hỏi" thì xét theo điều chủ nhà ĐÃ NÓI: câu nào KHÔNG áp dụng cho
căn này (kho trong khu công nghiệp → không hỏi độ rộng hẻm; đất trống → không hỏi kết cấu; căn hộ chung cư → không hỏi ngang dài;
nhà nguyên căn đang ở → không hỏi phí quản lý). Mỗi câu kèm ly_do + trich_dan nguyên văn lời chủ nhà. Không chắc thì KHÔNG đưa.
Không bao giờ đưa giá, diện tích, vị trí, phường, pháp lý, loại BĐS.

Ý ĐỊNH ("y_dinh") — đọc theo NGHĨA cả câu, có ngữ cảnh: căn của chủ nhà đã bán / đã cọc (ban_roi), thôi không bán nữa (ngung_rao),
bán lại căn đã gỡ hoặc rút lời "bán rồi" (rao_lai), đang bận / để sau (hoan). Nhắc chuyện người khác, hỏi, kể → binh_thuong.
Chủ nhà BẢO ĐĂNG / lên tin / chốt — "ok đăng đi", "đăng luôn đi em", "lên tin giúp anh", "cứ đăng như vậy trước", "đủ rồi em, đăng đi" —
dù bot đang HỎI thông tin hay đang đưa bản nháp → du_roi (trich_dan là chính cụm đó), KHÔNG phải ban_roi, KHÔNG phải binh_thuong.
Chủ nhà bảo ĐÃ TRẢ LỜI RỒI, trỏ về tin trước ("nói rồi mà", "chị nhắn ở trên rồi", "cái giá hồi nãy đó", "như lúc nãy") mà tin này không có câu trả lời → da_noi_roi
(trich_dan là cụm đó); tin vừa phàn nàn vừa nói lại giá trị ("Phường Hạnh Thông, chị nói rồi mà") thì tin ĐÃ trả lời → binh_thuong, giá trị vào tra_loi.
Chủ nhà bảo THÔI HỎI mà không nói "đăng" — "đủ rồi em", "nhiêu đó thôi cháu", "vậy được rồi, khỏi hỏi nữa" — đáp NGAY sau câu bot hỏi
mà không trả lời câu đó → cũng là du_roi.
Chủ nhà bảo SỬA / chỉnh lại ("sửa lại giúp mình", "bạn chỉnh lại nhé", "đổi lại địa chỉ") → binh_thuong, KHÔNG phải du_roi.
Chữ "ok / được / ổn / đăng" đứng sau "chưa / không / ko / hông" là PHỦ ĐỊNH — "chị thấy chưa ok", "chưa ổn em", "không ok lắm",
"chưa đăng được đâu" → binh_thuong, KHÔNG phải du_roi; đọc nghĩa CẢ câu, không bắt riêng chữ "ok".
Câu TẢ căn nhà có chữ "hết rồi" / "rồi" ("xây kín hết rồi em", "sổ có rồi") → binh_thuong.

CÂU HỎI KẾ ("cau_ke") — có danh sách "Câu bot còn định hỏi" thì chọn MỘT câu nên hỏi tiếp, như môi giới giỏi: (1) thông tin cần
để lên tin mà còn thiếu (giá, diện tích, vị trí / phường, pháp lý) đi trước; (2) trong số còn lại, câu NỐI MẠCH điều chủ nhà vừa
nói (vừa nói sổ riêng → hoàn công; vừa nói đang cho thuê → hợp đồng thuê tới khi nào); (3) câu dễ trả lời. Không chọn câu chủ
nhà đã trả lời trong tin / ngữ cảnh, không chọn câu vừa đưa vào khong_can_hoi. Câu đánh dấu "(nhánh)" chỉ chọn khi đúng hoàn
cảnh căn này. Khoá phải đúng y chữ trong danh sách; không chắc → null.

VAI ("vai") — chỉ khi người nhắn TỰ NÓI mình là chủ nhà hay môi giới, bằng chữ GỌI TÊN vai ("chính chủ", "anh là chủ", "nhà của
chị", "không phải môi giới"; "em là sale", "bên sàn", "bán giúp chủ"), trich_dan chép đúng cụm đó. Có nhà / muốn bán / "chú có căn
nhà" / "bán lô đất" KHÔNG nói vai (môi giới cũng nói vậy); "sổ hồng chính chủ" nói về GIẤY TỜ. Nhắc tới môi giới khác, kể chuyện môi
giới, hỏi phí môi giới → khong_noi. Bài rao mở bằng "Nhà chính chủ cần bán", "Chính chủ bán", "chính chủ gửi bán" là người nhắn TỰ NÓI
vai chinh_chu (trich_dan chép đúng cụm, vd "Nhà chính chủ cần bán") — đọc vai cả trong bài rao dài, không chỉ câu tự giới thiệu.

KHÁCH HỎI LẠI ("hoi_lai") — đọc theo NGHĨA, như môi giới nghe khách: tin có ý HỎI bên mình (có hay không có dấu "?", gõ tắt,
không dấu) → co_hoi = true, cau_hoi = câu hỏi chép nguyên văn, chu_de theo nội dung câu hỏi. "giá khu này giờ sao" là hỏi
THỊ TRƯỜNG, không phải hỏi giá căn mình; "hồi nãy anh nói giá bao nhiêu" mới là hỏi tin của mình. Hỏi về một DỰ ÁN / khu
("em biết dự án ny'ah phú định không", câu nối "và dự án vinhome grand park") là chu_de du_an — tên dự án / phường trong câu
hỏi đó KHÔNG vào du_an_ten, phuong, quan (đó không phải nơi căn đang rao; khách có thể sắp rao căn khác ở đó). Câu hỏi KHÔNG BAO GIỜ
vào truong hay kien_thuc: "ký hợp đồng gì không em" là hỏi dịch vụ, không phải phap_ly; "khu này dễ bán hông em" là hỏi thị
trường, không phải kien_thuc.
- Mọi trường CHỮ (pháp lý, nội thất, hiện trạng, kết cấu, hướng, lý do bán, view, thời hạn thuê…) viết lại SẠCH: có dấu, đúng chính tả, viết hoa tên riêng, bỏ từ đệm ("nha", "nhé", "á", "ạ"), giữ đúng ý và đúng chữ cái của cụm trích — KHÔNG thêm ý, không đổi từ.
- Khách gõ KHÔNG DẤU thì TÊN RIÊNG (đường, phường, dự án, quận) viết lại CÓ DẤU đúng chính tả tên thật ("pham the hien" → "Phạm Thế Hiển", "thu duc" → "Thủ Đức"); cụm trích dẫn vẫn COPY nguyên văn không dấu. Không chắc tên thật thì giữ nguyên chữ khách gõ. KHÔNG đổi chữ cái, chỉ thêm dấu.
- "Hẻm xe hơi / xe tải / ba gác" không phải hien_trang. "bớt / giảm N", "bao phí" là mức giảm, không phải gia. Số có "m2" / "m²" là dien_tich (hay dien_tich_san), KHÔNG BAO GIỜ là ngang / dai / mat_tien / do_rong_hem — "Diện tích đất 80m²" → dien_tich 80; "2 mặt tiền" là nhà góc hai mặt đường (kien_thuc), không phải số đo. Lời hứa ("để em xem lại rồi báo"), lời chào, câu hỏi → không vào kien_thuc.

TRẢ LỜI CÂU ĐANG HỎI ("tra_loi") — đọc NGUYÊN tin theo NGHĨA, như người môi giới đọc tin khách, KHÔNG bắt theo từ khoá:
- Tin trả lời được câu bot vừa hỏi → co_tra_loi = true; gia_tri = câu trả lời gọn, đủ ý, viết lại sạch có dấu (hỏi hẻm, khách "hxh" → "hẻm xe hơi"; "ô tô vô tận nhà" → "hẻm xe hơi vào tận nhà"; "hẻm 3m, xe hơi không vào" → "hẻm 3m, xe hơi không vào được"; hỏi pháp lý, "shr" → "sổ hồng riêng"; "chưa có sổ đang chờ" → "chưa có sổ, đang chờ ra sổ"; câu có/không thì viết đủ ý theo câu hỏi: hỏi gấp không, khách "ừ có" → "có, cần bán gấp", "thôi từ từ" → "không gấp"); trich_dan = cụm nguyên văn.
- Tin trả lời câu KHÁC, hỏi ngược, hẹn trả lời sau, nói chung chung không có câu trả lời → co_tra_loi = false, gia_tri = null, trich_dan = null. Không có câu đang hỏi → cũng false.
- Khách nói KHÔNG BIẾT / không nhớ / không rõ / chịu điều đang hỏi ("uh ko biết cái đó", "cái đó chú không nhớ") → co_tra_loi = false — "không biết" không phải giá trị của ô nào.
- Khách PHỦ NHẬN TIỀN ĐỀ câu đang hỏi (hỏi hợp đồng thuê / doanh thu / tiền thuê mà khách "nhà mình đang ở không cho thuê", "không cho thuê nên không có doanh thu") → co_tra_loi = false (đó không phải giá trị của ô đang hỏi); ghi hien_trang_su_dung = cụm đó, và đưa câu đang hỏi cùng các câu cùng tiền đề vào khong_can_hoi.
- Câu bot hỏi "kết cấu N tầng đó có tính cả gác lửng không": "không bạn, 2 tầng đủ rồi", "ko có gác" → co_tra_loi = true, gia_tri "không có gác lửng"; "có, tính cả lửng" → "có, tính cả lửng"; "có lửng thêm nữa" → "có lửng, chưa tính trong N tầng".
- Khách thường TRẢ LỜI CÂU BOT HỎI TRƯỚC bằng vài chữ (có / không / không có / chưa / đúng rồi / ừ…), rồi NÓI THÊM ý khác ngay sau, nhiều khi không có dấu phẩy. Tách hai phần: phần đầu là câu trả lời (co_tra_loi = true, trich_dan = đúng mấy chữ đó, gia_tri viết đủ ý theo câu hỏi), phần sau là ý khác (vào ô của nó, hoặc kien_thuc). Hỏi "vướng cột điện, hố ga hay đường đâm gì không", khách "không có mặt tiền đẹp em" = "không có" (gia_tri "không vướng gì") + "mặt tiền đẹp" (ý thêm) — KHÔNG đọc thành "không có mặt tiền đẹp". Câu bot hỏi KÈM PHỎNG ĐOÁN ("Nhà anh ở đâu vậy, ở Hồ Chí Minh đúng không?"): lời gật phần đoán ("đúng rồi e", "ừ hcm") KHÔNG phải giá trị; hỏi địa chỉ mà khách chỉ nói quận / phường ("đúng rồi e. nhà a ở quận 5") → co_tra_loi = false (chưa có đường / hẻm / số nhà), quận vào ô quận.
- MỘT CỤM CHỈ TRẢ LỜI MỘT Ý: cụm đã là thông tin của ô khác (đứng tên, thế chấp, pháp lý, giá, diện tích…) thì KHÔNG phải câu trả lời câu đang hỏi. Chữ "không / có / rồi / chưa" nằm TRONG cụm của ý khác ("không thế chấp", "có sổ", "xây rồi") không trả lời câu có/không đang hỏi — đưa cụm đó vào truong của ô đúng, tra_loi.co_tra_loi = false.
- gia_tri không thêm điều khách không nói; MỌI con số trong gia_tri phải nằm trong CỤM TRÍCH (không đổi "trệt 2 lầu" thành "3 tầng", không đổi đơn vị tiền, không lấy số của ý khác — hỏi hẻm, khách "hxh, 5x12" → "hẻm xe hơi", KHÔNG "hẻm xe hơi 5m").

GỘP / SỬA THÔNG TIN ĐANG GHI ("cap_nhat") — khách hay trả lời nhỏ giọt, mỗi lượt một mẩu:
- Có danh sách "Thông tin đang ghi" gửi kèm, và tin nói thêm chi tiết cho một ô trong đó → cap_nhat: khoa, gia_tri_moi = TOÀN BỘ giá trị sau khi gộp (giữ phần cũ đúng, thêm phần mới), cach "gop". Ví dụ đang ghi vi_tri "Ngô Y Linh", khách "số 45 nha" → "45 Ngô Y Linh"; đang ghi ket_cau "trệt + 3 lầu", khách "có sân thượng nữa" → "trệt + 3 lầu + sân thượng".
- Tin SỬA một phần ("à nhầm, hẻm 45 chứ không phải 54", "không có sân thượng đâu") → gia_tri_moi là giá trị đã sửa, cach "thay". Sửa GIÁ /
  diện tích / phường đang ghi ("sửa giá từ 1,2 tỷ thành 6,950 tỷ", "điều chỉnh giá 6,950 tỷ") → cap_nhat khoa gia / dien_tich / phuong, gia_tri_moi
  là giá trị mới ("6,950 tỷ"), cach "thay" — và đồng thời đưa vào truong.
- vi_tri (chính là ô duong ở trên) chỉ gồm số nhà / hẻm / tên đường / dự án — KHÔNG ghép phường, quận vào (có ô riêng).
- Mọi chữ, mọi con số trong gia_tri_moi phải có trong giá trị đang ghi hoặc trong tin (được thêm dấu cho tên riêng). Tin không đụng tới ô nào đang ghi → cap_nhat = []. Không đưa ô mà giá trị mới y hệt giá trị cũ.

VÍ DỤ MẪU (đáp án đúng — chỉ học CÁCH bóc, giá trị phải lấy từ tin của khách, không lấy từ ví dụ):

` + viDuThanhChu();

// Chế độ `ai` (01/10/2026, chủ dự án: "bóc thông số không biết từ đồng nghĩa hoặc viết gần giống"): máy thôi soát từ khoá
// (`datKiemNhe`), nên AI được CHUẨN HOÁ — đọc theo nghĩa, gõ sai, viết tắt, tiếng lóng nghề. Khối này nối sau LUAT, chỉ gửi
// khi công tắc là `ai` (khối riêng để phần LUAT vẫn cache được).
// SRS-5.1zzzd (07/10/2026, chủ dự án: "để AI bóc tách kiểu dify nhiều hơn… đến khi ra tin thì AI đọc và lọc rác"): lượt CHỐT TIN
// trước bản nháp — cùng khuôn JSON, cùng lớp kiểm trích dẫn, nhưng đầu vào là TOÀN BỘ tin chủ nhà về căn này.
export const LUAT_CHOT = `CHẾ ĐỘ CHỐT TIN (đè lên cách đọc "một tin nhắn" ở trên):
"Tin nhắn chủ nhà" dưới đây là TOÀN BỘ các tin chủ nhà đã nhắn về căn này, mỗi dòng một tin, cũ → mới. Hệ thống sắp soạn bản tin
rao từ kết quả của em — đọc hết rồi đưa TRẠNG THÁI CUỐI của căn:
- Mỗi ô một giá trị: chủ nhà nói lại / sửa ("à sửa lại", "không phải 5 tỷ mà 5 tỷ 2") thì lấy giá trị SAU CÙNG; trich_dan là cụm của
  lần nói sau cùng đó.
- Đưa MỌI ô chủ nhà đã nói (loai_bds, loai_giao_dich, duong + ten_duong, phuong, quan, dien_tich / ngang / dai, ket_cau, gia, phap_ly,
  huong, do_rong_hem / do_rong_duong…), kể cả ô nói ở tin cũ.
- Các dòng là CÂU TRẢ LỜI cho câu bot đã hỏi: lời gật / chào / cảm ơn, "đúng rồi e", "ok đăng đi", lời nói với bot, câu hỏi ngược,
  hẹn trả lời sau KHÔNG phải thông tin căn — không đưa vào đâu cả.
- kien_thuc = ý THÊM về căn nhà chưa có khoá nào (gần chợ, mặt tiền đẹp, mới sơn…): chỉ cụm ngắn nguyên văn, ĐÚNG NGHĨA khách nói
  (khách đáp "không có, mặt tiền đẹp" cho câu hỏi cột điện → "mặt tiền đẹp", không phải "không có mặt tiền đẹp"); không lặp ô đã có.
  Chuyện riêng / nhận định giá của chủ nhà → tiền tố "riêng: " (không lên tin). Chủ nhà đã bảo bỏ / xoá một ý khỏi tin ("xoá dòng con chị ở Úc
  đi") thì ý đó không vào kien_thuc nữa.
- tra_loi, cap_nhat, hoi_lai, cam_xuc, y_dinh, cau_ke: để null / rỗng — lượt này chỉ chốt dữ liệu.`;

const LUAT_CHUAN_HOA = `CHẾ ĐỘ CHUẨN HOÁ (đè lên dòng "giữ đúng chữ cái của cụm trích" ở trên):
- Đọc theo NGHĨA như môi giới lâu năm: viết tắt, gõ sai một hai chữ, không dấu, tiếng lóng nghề đều phải hiểu ("xhr"/"shr"/"sổ hồg riêg" = sổ hồng riêng; "sổ chug"/"sổ chung" = sổ hồng chung; "hxh"/"hẻm ô tô"/"xe hơi vô tới nhà" = hẻm xe hơi; "hxm" = hẻm xe máy; "MT"/"MTKD"/"mặt phố" = mặt tiền (mat_tien); "nhà ống"/"nhà phố liền kề" = nha_pho; "lô đất"/"nền" = dat; "c4"/"nhà cấp bốn" = nha_cap4; "full nt"/"đủ đồ" = full nội thất; "bớt lộc"/"có bớt"/"còn TL" = thuong_luong co; "ko gấp"/"từ từ bán" = gap khong).
- Giá trị trường CHỮ viết bằng TỪ CHUẨN của nghề (pháp lý: "sổ hồng riêng", "sổ hồng chung", "vi bằng", "hợp đồng mua bán", "giấy tay", "chưa có sổ", "đang chờ ra sổ", thêm "đã hoàn công"/"chưa hoàn công" nếu khách nói; nội thất: "full nội thất", "nội thất cơ bản", "nhà trống"; hướng: Đông | Tây | Nam | Bắc | Đông Nam | Đông Bắc | Tây Nam | Tây Bắc). trich_dan vẫn COPY NGUYÊN VĂN chữ khách gõ.
- Khách nói KHÔNG có / không biết (hỏi phường, khách "ko có phường", "không rõ") → KHÔNG đưa trường đó; tra_loi.co_tra_loi = false. TRỪ các ô có/không (gap, thuong_luong, o_to_vao_nha, hoan_cong, thang_may, can_goc, loai_duong_vao): "không gấp", "chưa hoàn công", "không có thang máy", "không có hẻm" là CÂU TRẢ LỜI → vẫn đưa ("khong" / "khong_hem"), và co_tra_loi = true nếu đó là câu đang hỏi.
- Tin KHÔNG trả lời câu đang hỏi nhưng có thông tin KHÁC (đang hỏi kết cấu, khách nhắn "50m2" hay "5 tỷ") → VẪN đưa thông tin đó vào truong (dien_tich, gia…), chỉ tra_loi.co_tra_loi = false. KHÔNG trả rỗng vì lạc câu hỏi.
- so_tang LUÔN tính cả trệt: "3 lầu" = 4, "trệt 2 lầu" = 3, "3 tấm" = 3, "3 tầng" = 3 (tầng đã gồm trệt).
- Mỗi khoá đúng loại của nó: "hxh"/"hẻm xe hơi" KHÔNG BAO GIỜ là phap_ly. Viết tắt CHUẨN của nghề ("shr", "sh", "hxh", "hxm", "MT", "MTKD", "pn", "wc", "c4", "full nt") là CHẮC nghĩa → đưa vào truong, KHÔNG vào xac_nhan — kể cả khi tin đó không trả lời câu đang hỏi. Chữ viết tắt / gõ sai KHÔNG CHẮC nghĩa ("xhr" — nhiều khả năng "shr" gõ nhầm) → KHÔNG đưa vào truong, đưa khả năng cao nhất vào xac_nhan (khoa phap_ly, gia_tri "sổ hồng riêng", trich_dan "xhr") để bot hỏi lại.
- Vẫn cấm bịa: không thêm con số, không thêm ý khách không nói, không suy quận từ tên đường.`;

type ClientModel = {
  messages: {
    parse: (p: Record<string, unknown>) => Promise<{ parsed_output?: unknown; usage?: unknown }>;
  };
};

/**
 * Hỏi model bóc tin người bán. `cauDangHoi` = khoá câu bot vừa hỏi (để "5 tỷ 8" biết là
 * trả lời giá) — KHÔNG đưa dữ liệu tin rao cũ vào, kẻo model chép từ ngữ cảnh thay vì
 * từ tin khách. Model hỏng thì NÉM — nơi gọi ghi sổ (FR-152 d), không nuốt ở đây.
 */
export async function bocRaoBangModel(
  ai: ClientModel,
  model: string,
  text: string,
  cauDangHoi: string | null = null,
  cauHoiChu: string | null = null,
  /** FR-226: giá trị ĐANG GHI của các ô chữ gộp được (`KHOA_GOP`) — chỉ ô có giá trị. */
  dangGhi: Partial<Record<typeof KHOA_GOP[number], string>> | null = null,
  /** Chế độ `ai`: thêm khối CHUẨN HOÁ (đồng nghĩa, gõ sai) sau LUAT. */
  chuanHoa = false,
  /**
   * 01/10/2026 (chủ dự án: "ra luật nó phải đọc thêm 1 2 câu hoặc cả ngữ cảnh phía trước"): vài lượt NGAY TRƯỚC ("BOT: …",
   * "CHỦ NHÀ: …") và câu bot còn định hỏi ("khoa: nội dung") — chỉ để AI HIỂU; trích dẫn vẫn phải nằm trong tin.
   */
  /** SRS-5.1zzzg: `canDangCo` — các căn người này đang có ("mã: loại, nơi, giá"), để AI biết tin nói về căn nào. */
  /** SRS-5.1zzzzzzh: `goiY` — cụm từ điển tiền định thấy trong tin khi lượt trước AI trả RỖNG (lượt gọi lại); AI vẫn quyết, code vẫn kiểm trích dẫn. */
  /** SRS-5.1zzzzzzz10: `nhacLai` — lượt gọi lại khi lượt trước đặt dữ liệu sai chỗ (lời sửa lúc duyệt nằm trong tra_loi). */
  nguCanh: { hoiThoai?: string[]; cauConHoi?: string[]; tinChuNha?: string[]; canDangCo?: string[]; goiY?: string[]; nhacLai?: string } | null = null,
  /** SRS-5.1zzzd: lượt CHỐT TIN — `text` là toàn bộ tin chủ nhà về căn (mỗi dòng một tin), thêm khối LUAT_CHOT. */
  cheDoChot = false,
): Promise<{ ket: DeXuatRaoLLM | null; truong: DeXuat[]; kienThuc: string[]; traLoi: TraLoiCauLLM | null; capNhat: CapNhatLLM[]; xacNhan: XacNhanLLM[]; hoiLai: HoiLaiLLM | null; camXuc: CamXucLLM | null; khongCanHoi: KhongCanHoiLLM[]; yDinh: YDinhLLM | null; vai: VaiLLM | null; tuXung: TuXungLLM | null; cauKe: CauKeLLM | null; canKhac: boolean | null; usage: unknown }> {
  // Danh sách phường LỌC theo câu khách, gửi trong phần tin nhắn (phần system giữ cố định để cache được).
  // 02/10/2026 (test Zalo: khách dán nguyên tin rao 700+ chữ có gạch đầu dòng): tin dài không được cắt — 1.200 chữ cũ cắt mất
  // phần pháp lý / kết cấu ở cuối tin rao dài. Trần 4.000 chỉ để chặn tin rác cực dài.
  // 14/10/2026: nơi gọi nối tin cũ của chủ nhà TRƯỚC tin mới — cắt đầu 4.000 làm rơi chính tin đang đọc; giữ 12.000 chữ MỚI NHẤT.
  const tin = text.slice(cheDoChot ? -6000 : -12000);
  const dsPhuong = danhSachPhuongChoAi(tin);
  // "Bộ nhớ" (chủ dự án: "để AI có cache để đọc lại nguyên tin nhắn của khách để ko mất"): nguyên văn các tin chủ nhà nhắn
  // trước tin này, nơi gọi đã giới hạn ~6.000 chữ.
  const tinChuNha = (nguCanh?.tinChuNha ?? []).filter((x) => typeof x === "string" && x.trim()).slice(-30);
  const hoiThoai = (nguCanh?.hoiThoai ?? []).filter((x) => typeof x === "string" && x.trim()).slice(-4);
  const cauConHoi = (nguCanh?.cauConHoi ?? []).filter((x) => typeof x === "string" && x.trim()).slice(0, 20);
  const canDangCo = (nguCanh?.canDangCo ?? []).filter((x) => typeof x === "string" && x.trim()).slice(0, 5);
  const goiY = (nguCanh?.goiY ?? []).filter((x) => typeof x === "string" && x.trim()).slice(0, 4);
  // SRS-5.1zzzzzzh: lượt gọi lại — lượt trước model nói tin không mang gì, trong khi từ điển nghề thấy cụm dữ liệu NGUYÊN VĂN trong tin.
  // Chỉ là gợi ý để đọc lại theo nghĩa, không bắt buộc, trích dẫn vẫn phải nằm trong tin (lớp kiểm bằng chứng không đổi).
  const khoiGoiY = goiY.length
    ? `\n\nLượt đọc trước em trả rỗng. Từ điển nghề của hệ thống thấy trong tin các cụm có thể là dữ liệu căn: ${goiY.join("; ")}. Đọc lại theo NGHĨA: cụm nào đúng là thông tin căn thì đưa vào truong (trich_dan nguyên văn trong tin), cụm nào không phải thì bỏ — không bắt buộc, không bịa.`
    : "";
  const dg = Object.entries(dangGhi ?? {}).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => `${k}: "${String(v).slice(0, 160)}"`);
  // SRS-5.1zzzzzzz10 (Zalo thật 14/10 10:04: chờ duyệt bản nháp, "căn của mình tại địa chỉ Ấp 18 … Tân Nhựt … bạn sửa lại giúp mình" → AI
  // nhét địa chỉ vào tra_loi của "câu" duyet_tin, truong rỗng → không ô nào được ghi, bot hỏi lại "chỗ cần sửa"). Chờ duyệt KHÔNG phải câu
  // hỏi một ô: nói thẳng cho AI biết, để lời sửa đi vào truong như mọi thông tin căn.
  const dongCauHoi = !cauDangHoi
    ? ""
    : CAU_KHONG_PHAI_O.has(cauDangHoi)
    ? `Bot vừa gửi BẢN NHÁP tin rao và đang chờ chủ nhà duyệt — đây KHÔNG phải câu hỏi một ô: tra_loi.co_tra_loi = false. Chủ nhà sửa / nói lại thông tin căn (địa chỉ, phường, quận, giá, diện tích…) thì đưa ô đó với giá trị MỚI vào truong (ô có trong "Thông tin đang ghi" thì thêm cap_nhat cach "thay").\n`
    : `Câu bot vừa hỏi chủ nhà: ${cauDangHoi}${cauHoiChu ? ` — "${cauHoiChu.slice(0, 300)}"` : ""}\n`;
  const nhacLai = nguCanh?.nhacLai?.trim() ? `\n\n${nguCanh.nhacLai.trim()}` : "";
  const r = await ai.messages.parse({
    model,
    // 02/10/2026: đợt 1–2 thêm ~40 khoá + ý định + vai — đầu ra dài hơn; 1300 có thể cắt cụt JSON câu rao dài.
    max_tokens: 2000,
    output_config: { effort: "low", format: FORMAT_RAO },
    system: [
      { type: "text", text: LUAT, cache_control: { type: "ephemeral" } },
      ...(chuanHoa ? [{ type: "text", text: LUAT_CHUAN_HOA, cache_control: { type: "ephemeral" } }] : []),
      ...(cheDoChot ? [{ type: "text", text: LUAT_CHOT }] : []),
    ],
    messages: [{
      role: "user",
      content: `${canDangCo.length ? `Căn chủ nhà đang có với em (để biết tin nói về căn nào — không trích từ đây):\n${canDangCo.map((c) => `- ${c}`).join("\n")}\n` : ""}${tinChuNha.length ? `Các tin CHỦ NHÀ đã nhắn TRƯỚC tin này, NGUYÊN VĂN, cũ → mới (để nhớ chủ nhà đã nói gì — không trích từ đây):\n${tinChuNha.map((t) => `- ${t.replace(/\n+/g, " / ")}`).join("\n")}\n` : ""}${hoiThoai.length ? `Vài lượt NGAY TRƯỚC (chỉ để hiểu tin — không trích từ đây):\n${hoiThoai.join("\n")}\n` : ""}${cauConHoi.length ? `Câu bot còn định hỏi (khoá: nội dung):\n${cauConHoi.join("\n")}\n` : ""}${dg.length ? `Thông tin đang ghi của căn này (chỉ để GỘP / SỬA khi tin nhắc tới — không chép vào truong):\n${dg.join("\n")}\n` : ""}${dongCauHoi}Tin nhắn chủ nhà: "${tin}"${dsPhuong ? `\n\n${dsPhuong}` : ""}${khoiGoiY}${nhacLai}`,
    }],
  });
  const ket = docLong(DeXuatRaoDoc, r.parsed_output);
  // SRS-5.1zzzzze (khách mô phỏng lần bảy, môi giới đã có 2 căn: "căn nữa hẻm An Dương Vương 4x10 cấp 4 5 tỷ" → AI đánh `can: 3` cho mọi
  // ô theo NGỮ CẢNH hội thoại; mọi chỗ đọc (`docAiChinh`, so cột, kiểm lệch) hiểu `can` là số căn TRONG TIN và bỏ căn > 1 → tin mới mở
  // RỖNG). Tin chỉ có MỘT số căn là tin về một căn: số đó không mang nghĩa chia căn. Chuẩn hoá ở đây, một chỗ, trước mọi nơi đọc.
  const soCanTrongTin = ket.success ? new Set(ket.data.truong.map((t) => t.can).filter((c) => c != null)).size : 0;
  // Câu AI nói "đã trả lời" kèm giá trị mà truong chưa có khoá đó → thành một đề xuất thường (code kiểm trích dẫn + giá trị như mọi ô).
  const truongDu = ket.success ? [...ket.data.truong.map((t) => (soCanTrongTin <= 1 ? { ...t, can: null } : { ...t })),
    ...(ket.data.khong_can_hoi ?? [])
      .filter((k) => typeof k.gia_tri === "string" && k.gia_tri.trim() && (MOI_KHOA as readonly string[]).includes(k.khoa) && !ket.data.truong.some((t) => t.khoa === k.khoa))
      .map((k) => ({ khoa: k.khoa, gia_tri: String(k.gia_tri).trim(), trich_dan: k.trich_dan, can: null }))] : [];
  return {
    ket: ket.success ? ket.data : null,
    truong: truongDu,
    kienThuc: ket.success ? (({ canNha, rieng }) => boKeRieng(canNha, rieng))(tachKeRieng(ket.data.kien_thuc.filter((k) => typeof k === "string"))) : [],
    traLoi: ket.success ? ket.data.tra_loi ?? null : null,
    capNhat: ket.success ? ket.data.cap_nhat ?? [] : [],
    xacNhan: ket.success ? ket.data.xac_nhan ?? [] : [],
    hoiLai: ket.success ? ket.data.hoi_lai ?? null : null,
    camXuc: ket.success ? ket.data.cam_xuc ?? null : null,
    khongCanHoi: ket.success ? ket.data.khong_can_hoi ?? [] : [],
    yDinh: ket.success ? ket.data.y_dinh ?? null : null,
    vai: ket.success ? ket.data.vai ?? null : null,
    tuXung: ket.success ? ket.data.tu_xung ?? null : null,
    cauKe: ket.success ? ket.data.cau_ke ?? null : null,
    canKhac: ket.success ? ket.data.can_khac ?? null : null,
    usage: r.usage,
  };
}
