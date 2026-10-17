// sinh-srd-docx.mjs — sinh `docs/SRD-AI-Oi-Nha-Dat.docx`: bản SRD GỘP, bố cục theo SRD Aioinhadat
// (`AOND req + chat examples.docx`, 23/06/2026): 7 mục La Mã + thư viện kịch bản + hội thoại giả lập.
//
// Chủ dự án 06/10/2026: "Làm lại cái docs đi và đổi thành đuôi docx format như bên aond luôn" — chọn
// MỘT file .docx gộp, viết lại ngắn gọn từ `docs/`; `docs/*.md` VẪN là nguồn sự thật (cổng CI truy vết
// đọc md). File .docx là BẢN XUẤT: sửa ở md rồi chạy `bun run srd` sinh lại, không sửa tay file .docx.
//
// Nội dung chép từ: docs/00 (định hướng), 02 (BR/FR/NFR), 06 §6.8 (tone), 07 (kiến trúc, SRS-5.1zz*),
// 09 (còn treo) và `bot/supabase/functions/_shared/prompts.ts` (câu mẫu, few-shot). Không có số liệu mới.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, PageBreak, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType, Footer,
} from "docx";

const NGAY = "06/10/2026";
const FONT = "Arial";
const DEST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs", "SRD-AI-Oi-Nha-Dat.docx");

// ---------- helper ----------
const run = (text, opt = {}) => new TextRun({ text, font: FONT, size: 22, ...opt });
const p = (text, opt = {}) => new Paragraph({ children: Array.isArray(text) ? text : [run(text)], spacing: { after: 120 }, ...opt });
const note = (text) => new Paragraph({ children: [run(text, { italics: true, size: 18, color: "555555" })], spacing: { after: 120 } });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(text, { bold: true, size: 28 })], spacing: { before: 360, after: 160 } });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(text, { bold: true, size: 24 })], spacing: { before: 240, after: 120 } });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(text, { bold: true, size: 22 })], spacing: { before: 200, after: 100 } });
/** Gạch đầu dòng: `label` in đậm, `text` thường. */
const b = (label, text, level = 0) => new Paragraph({
  numbering: { reference: "gach", level },
  spacing: { after: 80 },
  children: text === undefined ? [run(label)] : [run(label + ": ", { bold: true }), run(text)],
});
const bb = (label, text) => b(label, text, 1);

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
function cell(text, width, { bold = false, shade = null, italics = false } = {}) {
  const lines = String(text).split("\n");
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: BORDERS,
    shading: shade ? { type: ShadingType.CLEAR, fill: shade, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: lines.map((l) => new Paragraph({ children: [run(l, { bold, italics, size: 20 })], spacing: { after: 40 } })),
  });
}
/** Bảng: `widths` DXA, tổng = 9360 (A4 lề 2,54 cm). */
function tbl(headers, rows, widths) {
  return new Table({
    width: { size: widths.reduce((a, c) => a + c, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], { bold: true, shade: "E8EEF4" })) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, widths[i])) })),
    ],
  });
}
/** Hội thoại hai cột như Phần II của SRD AOND (trái người rao, phải trợ lý). */
function chat(rows) {
  const W = [4680, 4680];
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: W,
    rows: [
      new TableRow({ tableHeader: true, children: [cell("Người rao", W[0], { bold: true, shade: "E8EEF4" }), cell("Trợ lý Thảo", W[1], { bold: true, shade: "E8EEF4" })] }),
      ...rows.map(([ai, text]) => {
        if (ai === "⏳") {
          return new TableRow({ children: [new TableCell({ columnSpan: 2, borders: BORDERS, width: { size: 9360, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: "FFF4D6", color: "auto" }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [run("⏳ " + text, { italics: true, size: 20 })] })] })] });
        }
        return new TableRow({ children: ai === "S" ? [cell(text, W[0]), cell("", W[1])] : [cell("", W[0]), cell(text, W[1], { italics: false })] });
      }),
    ],
  });
}
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// ---------- nội dung ----------
const trangBia = [
  new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [run("TÀI LIỆU YÊU CẦU HỆ THỐNG (SRD) - DỰ ÁN AI ƠI NHÀ ĐẤT (AIOINHADAT / NHADAT.CC)", { bold: true, size: 32 })], spacing: { after: 120 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`Cập nhật mới nhất: ${NGAY}`, { italics: true, size: 22 })], spacing: { after: 240 } }),
  tbl(["Mục", "Nội dung"], [
    ["Tên dự án", "AI Ơi Nhà Đất (tên gọi tắt trong tài liệu / repo: Aioinhadat; tên miền web hiện tại: aioinhadat.vercel.app, repo nhadat.cc)"],
    ["Loại tài liệu", "System Requirements Document (SRD) — bản gộp, mô tả hệ thống ĐANG CHẠY. Nguồn sự thật chi tiết vẫn là bộ docs/00…13 (Markdown) trong repo; file này sinh từ đó bằng scripts/sinh-srd-docx.mjs"],
    ["Định vị", "Môi giới thường trực đứng sau mọi môi giới khác: listing chỉ là mồi, giao dịch xảy ra trong cuộc trò chuyện, và cuộc trò chuyện không bao giờ kết thúc"],
    ["Phạm vi địa bàn", "Sài Gòn (TP.HCM theo phường mới sau 01/07/2025) + Long An; trọng tâm là bán; cụm khởi điểm Quận 5 cũ"],
    ["Quy mô mục tiêu", "Theo SRD gốc: 200–300 người dùng/ngày, 6.000–9.000 tin nhắn/ngày (NFR-05: chưa đo trên lưu lượng thật; hạ tầng đang ở bậc Free)"],
    ["Kênh", "Zalo (bridge tài khoản cá nhân trên VPS; Zalo OA webhook đã viết, chờ OA duyệt) · Website SEO · /admin"],
    ["Trạng thái", "Đã dựng và chạy thật: web, kho tin, bot hai mặt (bán + mua), hỏi-đáp qua chủ nhà / CTV, điểm & hạng, keep-alive, nhận file / bảng giá / CSV, sổ lỗi + còi. Chưa có vòng người thật đủ để đo (docs/00 §0.9)"],
  ], [2340, 7020]),
  new Paragraph({ spacing: { after: 240 } }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run("Mục lục", { bold: true, size: 28 })] }),
  new TableOfContents("Mục lục", { hyperlink: true, headingStyleRange: "1-3" }),
  note("Mục lục cập nhật khi mở bằng Word (Word hỏi \"cập nhật trường\" — chọn Có). LibreOffice: Tools → Update → Indexes and Tables."),
  pageBreak(),
];

const mucI = [
  h1("I. TRIẾT LÝ THIẾT KẾ & MỤC TIÊU HỆ THỐNG"),
  b("Trải nghiệm rao bán tự nhiên", "Người rao không điền form, không dropdown. Gõ một câu rao như nhắn Zalo (hoặc gửi ảnh, bảng giá, file CSV) là có tin; AI bóc tách trường, hỏi bù đúng MỘT thông tin mỗi lượt, khen trước hỏi sau, nhặt dần nhiều ngày (FR-144, FR-177, FR-208)."),
  b("Tích luỹ dữ liệu ngầm", "Mọi điều chủ nhà nói đều được ghi vào đúng ô, kể cả khi trả lời lệch câu hỏi; câu không ghi được vào ô thì ghi chú, không hỏi lại (FR-233). Câu khách mua hỏi mà kho chưa có được chuyển thành câu hỏi cho chủ nhà / CTV và quay về kho như một fact có nguồn (FR-173)."),
  b("Bot là trung gian toàn phần", "Người mua không để lại số điện thoại, không trả phí; chủ nhà và khách không nhắn trực tiếp cho nhau; liên hệ chỉ mở ở bước chốt lịch xem nhà (FR-104, NFR-07, BR-06)."),
  b("Trung thực", "Không khẳng định pháp lý, quy hoạch, còn / hết khi chưa xác minh — chuyển thành câu hỏi. Chưa chắc thì \"hình như là…\" rồi hỏi lại. Không bịa số, giá, phí, tiện ích (DH-02 bất biến 3)."),
  b("Web là phễu", "Mọi trang web đẩy người dùng về Zalo; không kéo hội thoại ra khỏi Zalo (DH-02 bất biến 1)."),
  b("Mục tiêu kinh doanh (BR)", "Phủ 90 % nguồn hàng trên từng cụm đang mở · mạng 20 NMG mỗi người một khu · 10 cuộc chat mới/ngày · 1 giao dịch / 2 ngày (TB 10 tỷ) · thu phí bên bán · giữ kết nối Zalo sống suốt chu kỳ mua 3–4 năm · SEO 100 từ khoá."),
  b("Sao Bắc Đẩu", "Số lịch xem nhà chốt mỗi tuần. Chỉ số đầu vào: tin đủ thông tin lên sàn / tuần · hội thoại mua đủ khu vực + tầm giá · câu khách hỏi được trả lời đúng hạn (OMTM quý này) · kết nối Zalo sống sau 30 ngày · NMG hoạt động (docs/00 §0.5)."),
  b("KHÔNG làm", "App · form nhiều trường · phí đăng tin · hỏi SĐT người mua · marketplace tự phục vụ · đa ngôn ngữ · Messenger / Telegram · khẳng định pháp lý."),
  b("Nguyên tắc sửa lỗi (từ 01/10/2026)", "Mỗi lần sửa phải trả lời ba câu: lớp lỗi là gì, chỗ khác cùng lớp, bài kiểm nào đỏ khi tắt bản sửa. Lỗi \"máy đoán ý bằng từ khoá\" không vá bằng thêm từ vào regex — đưa quyết định sang AI (đọc theo nghĩa, code kiểm trích dẫn), từ khoá lùi xuống lưới đỡ."),
];

const mucII = [
  h1("II. ĐẠI GIA ĐÌNH TRỢ LÝ ẢO (AI NAMING & TONE OF VOICE)"),
  b("Kho tên trợ lý", "20 tên người thật (14/10/2026, SRS-5.1zzzzzzz9): Thảo, Hương, Linh, Trang, Ngọc, Vy, Nhung, Yến, Hằng, Thư, Tuấn, Hùng, Khoa, Duy, Quân, Huy, Đạt, Khang, Thắng, Toàn; giọng người 28–40 tuổi, xưng em. Mỗi khách MỘT tên, gán tất định theo Zalo ID, giữ suốt, cùng tên ở cả nhánh mua và bán (FR-181). Tự giới thiệu: \"Dạ em là T•ai bên AI Ơi Nhà Đất ạ\"."),
  b("Xưng hô", "Em xưng \"em\"; gọi khách \"anh / chị\" theo cách khách tự xưng hoặc dặn; chưa biết thì \"anh chị\" (lớn tuổi: \"cô chú\") hoặc bỏ đại từ. Không viết \"anh/chị\" gạch chéo; không gọi khách là \"mình\", không tự xưng \"mình\" (05/10/2026)."),
  b("Một tin ~30 từ", "Ghi nhận hay khen đúng điều khách vừa nói bằng vài chữ, rồi hỏi đúng MỘT thông tin. Khách đưa nhiều thứ một lúc thì nhận hết trong một câu, vẫn chỉ hỏi một ý. Dài hơn chỉ khi khách hỏi điều cần giải thích. Phía mua được gộp 2–3 ý vào một câu hỏi liền mạch."),
  b("Khen phải thật và gắn khách mua", "Chỉ khen khi lời khách có điểm mạnh thật (hẻm xe hơi, nở hậu, sổ riêng, gần chợ…) và nói nó giúp gì cho việc bán. Không khen suông, không khen hai tin liền, không khen điều khách không nói. Không nhận xét giá khách đưa khi họ không hỏi."),
  b("Hệ thống đưa Ý, model đặt câu (05/10/2026)", "Câu lệnh mỗi lượt là khuôn ĐÃ BIẾT / CHỦ NHÀ VỪA NHẮN / CẦN HỎI: <ý>. Code chọn ý hỏi kế (bảng required_facts + câu đang treo); câu mẫu chỉ kèm khi là câu code tra ra mang lựa chọn cụ thể (tên đường, phường, nghĩa viết tắt) hoặc chủ dự án đã sửa câu đó ở dashboard."),
  b("Trung thực với ảnh và với bản thân", "Không suy diễn vật liệu từ ảnh; \"hình như là…\" rồi xác nhận. Hỏi thẳng người hay máy thì nói thật là trợ lý AI, việc cần người thật có anh/chị phụ trách theo sát — không bao giờ nhận là người thật."),
  b("Không dấu hiệu máy", "Không gạch dài, không markdown, không emoji hình (🏠💰), không \"Quý khách / Vui lòng / Hệ thống ghi nhận / Tuyệt vời!\". Mặt cười gõ tay kiểu Zalo (:) :D =)) ^^) dùng thưa, khoảng một phần ba số tin, không trong tin có số liệu. Chào một lần đầu hội thoại; mở bằng \"Dạ\" chỉ khi đáp lại điều khách vừa đưa."),
  b("Không đọc mã tin", "Gọi căn bằng địa chỉ hay đặc điểm (\"căn hẻm Trần Bình Trọng của anh\"); mã tin chỉ ở web, CTV, admin (FR-178)."),
  b("Không hỏi số điện thoại", "ngoài bước chốt lịch xem nhà, và khi đó kèm lý do (\"để cộng tác viên gọi xác nhận trước ~30 phút\") và đường từ chối (\"không tiện để số thì hẹn qua Zalo cũng được ạ\")."),
  b("Lùi lại đúng lúc", "Khách bận, bực, hứa gửi sau: nói ngắn, không hỏi thêm trong tin đó; câu hỏi treo lại cho vòng hỏi bù. AI đọc cảm xúc (bực, nghi ngờ, muốn dừng) → báo admin, ngừng hỏi."),
  b("Hai bản prompt, DB đè code", "Bản trong git là prompts.ts (TONE_RULES, SELLER_SCRIPT_RULES, SELLER_FEWSHOT, FEE_RULES, HUMAN_CHAT_RULES, SLANG_NOTES, CAU_HOI_MAU, CAU_TIEN_DINH); bản sửa tay là bảng bot_prompts — sửa ở Table Editor là bot đổi giọng trong 60 giây, không cần deploy. `bun run prompt` so md5 hai bên."),
  b("Bong bóng 🤖 (báo lại đã lưu)", "Công tắc app_config.bao_lai_da_luu: tat · thay_doi · day_du · admin (chỉ ghi messages cho /admin, không gửi khách)."),
];

const mucIII = [
  h1("III. DANH MỤC BĐS & CẤU TRÚC DỮ LIỆU ĐỘNG (DYNAMIC SCHEMA)"),
  p("AI nhận diện loại hình BĐS từ câu rao; mỗi loại có bộ câu hỏi riêng trong bảng required_facts (khoá property_type × fact_key × deal, có priority — đổi thứ tự hỏi là đổi số trong DB, không sửa code). Tin có cấu trúc chuẩn sàn (FR-172): bảng listings 67 cột (thông số, nguồn, trạng thái), mỗi ô thông số ghi kèm bậc nguồn (chủ xác nhận 3 > admin 2 > suy đoán 1)."),
  b("Nhóm 1 — Nhà ở & kinh doanh dân dụng", "nhà phố, nhà cấp 4, biệt thự, chung cư, toà nhà / CHDV. Cốt lõi: địa chỉ → hẻm rộng mấy mét, ô tô vào được không → kết cấu (tầng, lửng, sân thượng) → diện tích sổ (ngang × dài, nở hậu) → pháp lý một ý (sổ riêng / chung) → phường → giá → gấp hay được giá → ảnh. Chung cư: dự án, toà, tầng, view, phí quản lý, bàn giao. Hỏi bù sau khi lên tin: đứng tên, thế chấp, quy hoạch / lộ giới / tranh chấp / hoàn công, hẻm thông hay cụt, ngập nước, hiện trạng sử dụng."),
  b("Nhóm 2 — Đất", "đất thổ cư, đất dự án, đất nông nghiệp. Cốt lõi: đường vào, kích thước, thổ cư bao nhiêu m², hướng, cột điện / hố ga / đường đâm, xây tự do hay theo mẫu, sổ riêng hay đất dự án chờ sổ, lên thổ cư được không, nguồn nước, ranh đất."),
  b("Nhóm 3 — Sản xuất & thương mại", "đất SKC / TMD, kho xưởng. Cốt lõi: thời hạn sử dụng đất, hình thức trả tiền thuê đất, chiều cao thông thuỷ, tải trọng sàn, trạm biến áp, xử lý nước thải, container 40 feet vào được không, PCCC."),
  b("Thông số cho thuê (áp chung)", "nội thất để lại, cọc mấy tháng, thời hạn tối thiểu, trượt giá mỗi năm, fit-out, điện nước, giờ giấc, ngành hàng hợp."),
  b("Bóc tách — AI quyết, code kiểm", "Công tắc app_config.boc_tach_ai (tat · bong · ghi · chinh). Ở chế độ chinh (từ 21/09/2026): lượt AI đọc trước, mọi giá trị phải có trích dẫn trong lời khách (kiem-bang-chung.ts), đọc ngữ cảnh (câu bot vừa hỏi + lượt gần nhất + bộ nhớ nguyên văn tin chủ nhà); luật tìm chuỗi chỉ đỡ khi model hỏng. Luật tiền một nguồn (luat-tien.ts ↔ parse_vnd SQL cùng một bảng ca)."),
  b("Từ điển địa danh", "Bảng duong (10.083 tên đường, 168/168 phường TP.HCM, nguồn OSM): gõ không dấu → có dấu, sai 1–2 ký tự → hỏi xác nhận, không có → giữ chữ khách. Bảng wards / phuong_cu / quan_cu nối tên cũ ↔ phường mới. Kho dự án projects (1.639 dự án HCM / Bình Dương / Long An) + tìm theo nghĩa (pgvector, 768 chiều)."),
  b("Kho CĂN DỰ ÁN (05/10/2026)", "Người bán gửi bảng giá / phân lô / brochure / mặt bằng (ảnh hoặc PDF) → model có mắt đọc ra từng căn theo mã lô (≤ 200 căn / tài liệu) vào bảng du_an_can (chung cho dự án; giá là giá NIÊM YẾT, không bao giờ thành giá rao). Tin rao \"căn A12\" tự điền diện tích / tầng từ kho; khối CĂN TRONG DỰ ÁN nối vào ngữ cảnh cho model. File vào bucket riêng tư listing-private/du-an/."),
  b("Nhập rổ hàng từ CSV / XLSX (05/10/2026)", "Môi giới gửi bảng qua Zalo → mỗi dòng một tin (tối đa 50 dòng / lần), ánh xạ cột tất định không dùng model; cột SĐT / Zalo / CCCD / email bỏ dù viết thế nào; tin vào trạng thái chờ thông tin + chờ chủ duyệt, vòng hỏi bù lo phần thiếu."),
  b("Tệp và link", "Mọi URL ngoài đi qua taiTep: rào SSRF (chặn localhost / IP riêng, kiểm lại từng bước chuyển hướng, ≤ 4 bước), trần 20 MB, nhận loại file bằng byte đầu. Link Google Drive: file công khai tải được; thư mục cần GOOGLE_API_KEY trong Vault (chưa có → bot nói gửi từng file)."),
  b("Bản nháp tin (FR-177)", "Đủ dữ liệu → bot gửi bản nháp như một tin rao thật, mọi dòng từ cột hoặc fact chủ nhà đã nói, kèm \"Độ đầy đủ X/100\" theo 7 tiêu chí; cổng đăng hiện 70/100 (ngưỡng chốt cuối: OPEN-50). Chủ nhà gật là lên kệ; sửa thì sửa đúng ô."),
  b("Nhiều căn", "Một người nhiều tin, một hội thoại (FR-214). Rao \"căn A…, căn B…\" tách tin theo từng căn; \"chỉ giữ căn A, ẩn hết còn lại\" / \"gỡ hết đi\" do AI đọc ý, liệt kê căn sẽ ẩn và HỎI XÁC NHẬN trước khi ẩn (05/10/2026). Báo \"bán rồi\" → đóng đúng căn (FR-184)."),
];

const mucIV = [
  h1("IV. HỆ THỐNG CHẤM ĐIỂM & TRÒ CHƠI HOÁ (GAMIFICATION SYSTEM)"),
  h2("1. Điểm từng tin và điểm người rao"),
  b("Điểm tin (diem_tin)", "0–100 theo 7 tiêu chí của kịch bản Gemini (FR-177 d) — hàm SQL diem_tin cộng điểm vị trí (địa chỉ, phường, hẻm / đường vào) · diện tích và mặt tiền · kết cấu theo loại BĐS · pháp lý · giá · tiềm năng sử dụng · ảnh (từ 3 tấm trọn điểm), trả kèm danh sách còn thiếu để bot nói \"thêm X là tin mạnh hơn\", hiện trong bản nháp và /admin. Tin phải đạt ngưỡng đăng mới lên kệ."),
  b("Điểm người rao (diem_nguoi_ban)", "= (50 % trung bình điểm các tin đang rao + 50 % điểm phản hồi kịp thời) × hệ số thưởng quy mô. Điểm phản hồi đo theo messages 90 ngày: bot nhắn → chủ trả lời sau ≤ 1 giờ 100 · ≤ 12 giờ 80 · ≤ 24 giờ 60 · ≤ 3 ngày 30 · không trả lời 0. Chỉ đo lượt bot CHỦ ĐỘNG nhắn khi chủ nhà đã im > 30 phút (hỏi bù, \"còn bán không\", giữ kết nối); dưới 5 lượt như vậy thì chưa tính, điểm người rao = 100 % hoàn chỉnh (FR-183, SRS-5.1zzd, SRS-5.1zzx)."),
  b("Chỉ ghi, không nhắn", "Điểm, hạng, chuẩn NMG ghi vào DB (view seller_ranks, so.nguoi_ban) cho admin xem; KHÔNG có tin \"điểm giảm còn X\" gửi người rao (quyết định chủ dự án 05/10/2026 — khác SRD gốc kịch bản 3.3)."),
  h2("2. Thuật toán thưởng quy mô cho môi giới (NMG)"),
  b("N ≤ 10 căn", "+6 % điểm mỗi căn."),
  b("10 < N ≤ 30", "+4 % mỗi căn."),
  b("N > 30", "+1,5 % mỗi căn."),
  h2("3. Hạng và đặc quyền"),
  b("Hạng theo điểm (OPEN-26 chốt 05/10/2026)", "Đồng < 50 · Bạc 50–79 · Vàng ≥ 80. Hạng không hiện trên web công khai."),
  b("Hạng Đồng", "tối đa 5 căn đang rao; hết trần bot nói thật và chỉ cách lên Bạc, không mở tin mới."),
  b("Hạng Bạc", "mở rổ hàng không giới hạn, kích hoạt thưởng quy mô."),
  b("Hạng Vàng", "Mọi người bán Vàng (chính chủ lẫn môi giới): tin được xếp lên đầu kho khi khách mua nhắn bot đã nói đủ khu vực + ngân sách (chỉ trong chat, không phải thứ tự trên web). CCRB Vàng: tin vừa lên kệ được đẩy tới ≤ 20 NMG lõi có Zalo (ưu tiên Vàng → đang hoạt động → điểm), mỗi NMG ≤ 1 tin / ngày."),
  b("Hạng CTV", "theo tỷ lệ trả lời câu khách hỏi đúng hạn (Vàng ≥ 90 % / Bạc ≥ 70 % / Đồng); trễ hạn thì rớt hạng và admin đỡ khách (FR-173; ngưỡng định cỡ lại khi có ~30 câu thật — OPEN-42)."),
];

const mucV = [
  h1("V. CHÍNH SÁCH DOANH THU & PHÂN LOẠI USER"),
  b("Người mua / người thuê (B)", "miễn phí hoàn toàn, không để lại số điện thoại, tương tác qua Zalo với trợ lý trực 24/7."),
  b("CCRB (chính chủ)", "rao miễn phí; phí 1 % giá chốt khi giao dịch thành công, hoặc 3/4 tháng tiền thuê. Hệ thống điều phối CTV dẫn khách (CTV hưởng 0,5 %)."),
  b("NMG (môi giới)", "rao miễn phí; phí 0,5 % giá chốt hoặc 3/4 tháng tiền thuê. Chuẩn tối thiểu: ≥ 10 BĐS đang rao và tỷ lệ chốt ≥ 5 % / 6 tháng — tính bằng hàm chuan_nmg, ghi cột dat_chuan_nmg cho admin, không tự nhắn NMG (05/10/2026)."),
  b("Chủ đầu tư dự án", "phí thoả thuận riêng — bot tuyệt đối không tự báo số, \"để em kết nối bộ phận hợp tác dự án\" (OPEN-21, OPEN-28 còn treo)."),
  b("Cách nói phí", "chỉ khi được hỏi, hoặc đúng lúc hệ thống báo DẪN PHÍ sau khi chủ nhà duyệt tin (\"Em cho chào căn nhà của anh ngay ạ, mà anh biết phí bên em chưa ạ?\"). Khách thấy đắt: không tốn đồng nào cho tới khi bán được, bên em đi tìm khách và lo thương lượng; không ép."),
  b("Nhận vai", "Người lạ tự nhận có BĐS → mở hồ sơ bán ngay trong Zalo, một câu báo nhãn (\"Em ghi nhận anh là chính chủ nha, nếu là môi giới thì nhắn em một tiếng\"); phí không nói lúc gán nhãn. Vai người rao do AI đọc, luật chỉ đỡ."),
];

const mucVI = [
  h1("VI. LOGIC GIA HẠN CỬA SỔ ZALO & LÀM GIÀU DỮ LIỆU (KEEP-ALIVE)"),
  b("Cơ chế người bán (SRS-5.1zzc, theo SRD §VI)", "Cron seller_keep_alive_tick quét NGƯỜI im > 5 ngày để vượt luật 7 ngày của Zalo; mỗi người một lượt / 5 ngày, ngẫu nhiên 1–2 căn đang rao. Còn thông tin chưa hỏi thì hỏi bù đúng một ý (ask-seller), hết thì hỏi \"căn … còn bán không\". Trả lời do AI đọc: còn → giữ tin, đóng dấu last_confirmed_at; bán rồi / ngưng → đóng đúng căn."),
  b("Xoay tua câu hỏi", "Không hỏi dồn: mỗi lần một trường còn thiếu hoặc xin ảnh; văn phong [ghi nhận] + [hỏi một ý]. Với NMG mỗi ngày chỉ hỏi 1–2 căn trong rổ. Trả lời một căn = cửa sổ 7 ngày mở lại cho cả tài khoản."),
  b("Người mua", "Mốc 5 ngày im lặng → tin giữ chân theo đúng nhu cầu cũ; từ ngày 6 buộc giữ kết nối (\"nhờ anh nhắn cho em 1 tin, nếu không Zalo sẽ xoá kết nối\"). Tin đang bán im 30 ngày thì hỏi lại chủ nhà (FR-103). Gặp lại thì nhắc đúng nhu cầu cũ, không hỏi lại từ đầu."),
  b("Giờ và trần", "Tin chủ động chỉ 8h–21h giờ VN (lệch phút theo cron); trần 100 tin / 24 giờ / khách, chạm trần thì một câu nhẹ rồi im tới hết ngày; tối đa 2 bong bóng mỗi lượt."),
  b("Nhịp gửi như người gõ (05/10/2026)", "Công tắc app_config.nhip_go = bat → chat-reply trả nhip_go[] (độ dài tin trước / 25 ký tự·giây, kẹp 600–2.500 ms), webhook OA và bridge cùng nghỉ theo đó; mặc định vẫn 300 ms."),
  b("Vòng hỏi-đáp (FR-173)", "Khách hỏi điều kho chưa có → câu hỏi giao CHỦ NHÀ (nếu có Zalo), hạn 12 giờ → quá hạn giao CTV ít việc nhất, hạn 120 phút → quá hạn nhắc admin, CTV tụt hạng → quá 48 giờ báo thật cho khách kèm căn khác. Trả lời bằng mẫu \"#mã: câu trả lời\" → vào kho thành fact, bot báo lại khách."),
  b("Nhắc lời hứa", "Chủ hứa \"tối gửi ảnh / mai báo\" → bot cảm ơn, chờ, hệ thống tự nhắc đúng hẹn (reminders kind promise). Lịch xem nhà: nhắc trước buổi xem kèm bản đồ; 4 giờ sau xin chấm sao ngay trong chat."),
];

const mucVII = [
  h1("VII. KIẾN TRÚC HỆ THỐNG & LUỒNG DỮ LIỆU"),
  b("Hạ tầng", "Supabase (Postgres + RLS trên mọi bảng + pgvector · Edge Functions Deno: chat-reply (bộ não), zalo-webhook, ask-seller, nudge, inbound-sweep, media-cleanup, geocode-listings, escalation-feed, ctv-report · Storage 4 bucket: listing-public, listing-private, masterdb-raw, listing-photos đã khoá · Vault giữ khoá API · pg_cron + pg_net cho lịch). Web Next.js 15 + Tailwind 4 trên Vercel, đọc DB bằng khoá công khai qua RLS, mô tả tin luôn qua bộ lọc SĐT. Bridge zca-js (tài khoản Zalo clone) trên VPS; Zalo OA webhook chờ duyệt. Tất cả ở bậc Free; không sao lưu (OPEN-25, chủ dự án chấp nhận 11/09/2026)."),
  b("AI", "Claude (Anthropic) cho bóc tách chính có trích dẫn, lượt có ảnh / PDF và trợ lý có công cụ nhánh mua; chuỗi dự phòng Groq → Gemini đổi bằng secret, không cần deploy; Gemini embedding 768 chiều cho tìm theo nghĩa. Ranh giới bóc tách ⟂ AI có máy canh: mã tiền định không gọi SDK, tầng AI không ghi bảng nghiệp vụ."),
  b("Dữ liệu", "46 bảng (soát 06/10/2026), năm nhóm [RỔ HÀNG] [NGƯỜI & HỘI THOẠI] [BOT & HÀNG ĐỢI] [CTV] [HỆ THỐNG] cùng các view đọc cho người và admin; chú thích bảng nằm TRONG DB (comment on). Ba hàng đợi bằng bảng (inbound_ledger, reminders, media_cleanup_queue) với hợp đồng thuê và thư chết — tin không mất khi một bên offline (NFR-04). Schema `so` cho người đọc như Excel (so.ro_hang, so.nguoi_ban, so.hoi_thoai). Dữ liệu thử và thật tách bằng la_id_thu()."),
  b("Luồng người bán", "Tin Zalo → webhook / bridge → chat-reply nhận vai → lượt AI bóc tách (ngữ cảnh + bộ nhớ) → kiểm bằng chứng → ghi ô theo bậc nguồn → code chọn Ý cần hỏi kế → model đặt câu → van an toàn (che liên hệ, chặn bịa, một câu hỏi, xưng hô) → gửi. Đủ dữ liệu → bản nháp → gật → lên kệ → dẫn phí → keep-alive / hỏi bù."),
  b("Luồng người mua", "Web (SEO, trang tin, widget Zalo mang ngữ cảnh) → Zalo → khai thác khu vực + tầm giá → gợi ≤ 3 căn từ KHO (ưu tiên gấp → nghĩa → mới; người bán Vàng lên đầu) → khách hỏi căn → bot khai mọi thứ đã lưu, chưa có thì hỏi chủ nhà / CTV → đặt lịch xem (CTV dẫn) → chấm sao → vòng đời tin (sold báo người đang chờ). Trợ lý có công cụ (app_config.tro_ly): tìm tiện ích quanh khu vực, xem căn; công cụ ghi phải có trích dẫn."),
  b("Live Chat Monitor (/admin/tin-nhan)", "Mỗi hội thoại một nhãn: AI_HANDLING · WAITING_HINT (khách hỏi mà câu đang treo chờ chủ nhà / CTV, hoặc khách nhắn > 10 phút chưa có tin bot) · NEED_HUMAN (cờ cần người thật, hoặc đang giữ người); nút Giữ khách / Trả bot (cướp quyền). /admin còn: sổ lỗi, nhịp tim, đồng hồ tiền model theo từng model, hồ sơ người bán, duyệt tin, điểm & hạng."),
  b("Quan trắc", "Sổ lỗi bot_errors (SĐT luôn che), bot_health_tick mỗi giờ quét kết quả thật của net._http_response (không tin trạng thái cron), còi ntfy đọc lại bằng chứng gửi tới; trần lượt / ngày và chuông hết tiền. Sổ van_kich ghi mỗi lần một van hậu kiểm đổi lời model (van nào, trước, sau) — đo trước khi quyết bỏ van; công tắc luat_loi_bot: gọn (mặc định) tắt toàn bộ van sửa văn, chỉ còn lưới an toàn và ghi đúng ô (06/10/2026)."),
  b("Chống tái phát (10 cổng CI mỗi PR)", "kiểu TS web + deno check bot · build · e2e hội thoại offline (959 ca, mock DB + mock model) + bộ kiểm chuyên đề (luật phá dữ liệu phải có bảng câu không được kích, ranh giới AI, nhúng khoá ngoại, giảm egress, kho tệp) · truy vết ID docs · TS-SEC hồi quy RLS trên DB thật · migration repo ↔ DB · md5 từng hàm schema.sql ↔ DB · soát trạng thái DB (8 phép) · luật tiền TS ↔ SQL · bộ đo bóc tách 110 ca so với nền."),
  b("Tài liệu", "Nguồn sự thật là docs/00…13 (Markdown, có ID truy vết DH- BR- FR- UF- WF- SRS- OPEN- TS-); mỗi lần sửa bot / web ghi một mục SRS kèm ca gốc, nguyên nhân, chỗ sửa, cách kiểm. File .docx này là bản xuất gộp."),
];

const mucVIII = [
  h1("VIII. ĐỐI CHIẾU VỚI SRD AIOINHADAT 23/06/2026"),
  p("✅ đúng · 🔶 khác bản gốc · ⏳ chưa · ❌ không nhận."),
  tbl(["Mục SRD gốc", "Nội dung", "", "Ở hệ thống hiện tại"], [
    ["§I", "Rao tự nhiên, không form; tích luỹ ngầm nhiều phiên", "✅", "FR-144 / 158 / 177 / 208; thêm bảng giá, CSV, link (05/10)"],
    ["§I", "Thoại", "⏳", "STT chưa làm (FR-134)"],
    ["§I", "200–300 người/ngày, phủ 90 % Q5", "🔶", "Chưa đo tải thật; bậc Free (NFR-05, NFR-16)"],
    ["§II", "Kho tên trợ lý (tên người thật), mỗi khách một tên", "✅", "FR-181, 20 tên"],
    ["§II", "Quy tắc 30 từ, khen trước hỏi 1/lần, \"hình như là\"", "✅", "TONE_RULES / SELLER_SCRIPT_RULES viết lại theo demo AOND 05/10; không chép emoji 😊🔥 và khen mỗi câu"],
    ["§II", "Nút bấm nhanh trong tin", "⏳", "Bridge gửi chữ, chưa gửi nút (OPEN-33, chờ OA)"],
    ["§III", "Ba nhóm BĐS + thông số cho thuê", "✅", "required_facts theo loại (FR-186), thêm toà nhà / đất nông nghiệp / SKC / kho xưởng"],
    ["§IV", "Điểm người rao 50 % hoàn chỉnh + 50 % kịp thời", "✅", "SRS-5.1zzd (05/10) — chỉ ghi DB, không nhắn"],
    ["§IV", "Thưởng quy mô; hạng Đồng / Bạc / Vàng + đặc quyền", "✅", "FR-183, SRS-5.1zzf (OPEN-26 chốt 05/10)"],
    ["§IV", "Tin \"điểm giảm còn X\" cho người rao", "❌", "Chủ dự án 05/10: không thông báo"],
    ["§V", "Phí; chuẩn NMG ≥ 10 BĐS, chốt 5 %", "✅", "BR-05, SRS-5.1zze (ghi view, không báo NMG)"],
    ["§VI", "Quét im > 5 ngày; hỏi 1–2 căn/ngày", "✅", "SRS-5.1zzc (05/10)"],
    ["§VII", "Gemini → máy local", "❌", "Claude / Supabase; OPEN-41"],
    ["§VII", "SharePoint 5 lớp", "❌", "Supabase Storage (FR-165)"],
    ["§VII", "Live Chat Monitor: nhãn + nút cướp quyền", "✅", "SRS-5.1zzg, FR-189"],
    ["§VII", "Bot-to-bot m•ai ↔ t•ai hỏi chủ", "🔶", "Một bot, hai mặt; câu hỏi đi chủ nhà 12 giờ → CTV → admin (FR-173)"],
    ["Demo 05/10", "Đọc bảng giá / phân lô; nhập CSV; \"chỉ giữ căn A\"; link Drive / PDF; nghỉ gõ", "✅", "SRS-5.1zzj…zzm (PR #431)"],
    ["Demo 05/10", "Bóc tách của demo (bịa đường, ghi sai ô, ghi đè địa chỉ)", "❌", "Giữ bóc tách có trích dẫn + từ điển + ghi thêm không ghi đè (docs/06 §6.8)"],
  ], [900, 3660, 560, 4240]),
];

const mucIX = [
  h1("IX. QUYẾT ĐỊNH CÒN TREO (chờ chủ dự án)"),
  p("Toàn bộ danh sách ở docs/09-open-issues.md. Những mục ảnh hưởng tới SRD này:"),
  b("OPEN-21 / OPEN-28", "Vai người rao 5 loại (chủ đầu tư, sàn…) và phí riêng; phí có đi theo phân loại tự động không."),
  b("OPEN-27 nửa sau", "Tên hiển thị cũ / mới cho khu vực; mở phường / huyện nào trước; cho thuê có giữ."),
  b("OPEN-33 / OPEN-51", "Webhook Zalo OA chưa kiểm chữ ký; token OA sống 25 giờ chưa ai làm mới (chờ OA duyệt)."),
  b("OPEN-41", "Nhà cung cấp model: giữ Claude / Supabase hay theo SRD gốc Gemini → local. Lớp gọi model đã gom một chỗ."),
  b("OPEN-42", "Ngưỡng CTV (120 phút; Vàng ≥ 90 % / Bạc ≥ 70 %) định cỡ lại khi có ~30 câu thật."),
  b("OPEN-50", "Ngưỡng điểm tin để được rao (hiện cổng 70/100)."),
  b("Việc kế tiếp theo đánh giá 21/09 (docs/00 §0.9)", "đưa 20 tin có chủ thật vào vòng CTV và đo tỷ lệ trả lời trong 48 giờ; kéo 10 người mua thật qua widget Zalo và đếm cờ cần người thật; vượt ngưỡng dừng thì sửa mô hình, không sửa prompt."),
];

// ---------- kịch bản ----------
const kichBan = [
  pageBreak(),
  h1("TỔNG HỢP KỊCH BẢN HỘI THOẠI MẪU (TRANSCRIPTS) - AI ƠI NHÀ ĐẤT"),
  note(`Cập nhật ${NGAY}. Các câu dưới đây chép từ câu mẫu (CAU_HOI_MAU, CAU_TIEN_DINH), luật phí (FEE_RULES) và ví dụ giọng (SELLER_FEWSHOT) trong bot/supabase/functions/_shared/prompts.ts. Hệ thống chỉ đưa Ý cần hỏi, model tự đặt câu, nên lời thật trên Zalo sẽ khác từ ngữ nhưng cùng nhịp: ghi nhận vài chữ, hỏi đúng một ý. {ac} = cách gọi khách (anh / chị / cô chú). Phần II là MÔ PHỎNG ghép từ câu mẫu, không phải log Zalo thật.`),
  h2("PHẦN I: THƯ VIỆN KỊCH BẢN MẪU THEO TÌNH HUỐNG"),

  h3("1. Nhóm kịch bản gửi bán lần đầu (tiếp nhận BĐS mới)"),
  p("Mục đích: đón tiếp niềm nở, lấy thông tin nền tảng tự nhiên, không gửi form; lý do \"kiểm tra giá khu vực\" chỉ nói ở lần hỏi địa chỉ đầu."),
  b("1.1. Khách mở lời chưa có dữ liệu", "\"Anh muốn nhờ đăng bán căn nhà\" → \"Dạ em cảm ơn anh tin tưởng :) Anh cho em xin địa chỉ nhà để em kiểm tra giá khu vực nha?\""),
  b("1.2. Khách nói hẻm rộng", "\"Hẻm 4m, ô tô vào tới nơi\" → \"Ô tô tới tận nhà thì khách chuộng lắm. Diện tích trên sổ, ngang dài bao nhiêu anh?\""),
  b("1.3. Căn hộ thuộc dự án có trong kho", "\"Chị có căn hộ Sunrise City muốn bán\" → \"Sunrise City có hồ bơi lớn, khách gia đình chuộng lắm chị. Căn mình ở tầng mấy ạ?\" (chỉ khen đặc điểm có trong khối DỰ ÁN)."),
  b("1.4. Khách đưa nhiều thông tin một lần", "\"bán nhà hẻm 5m Phạm Văn Chí P7 Q6, 4.2x12 nở hậu 4.5, trệt lửng 2 lầu 3PN 3WC, SHR, 6.9 tỷ TL\" → \"Nở hậu lại sổ riêng, căn này dễ bán lắm anh. Anh chụp giúp em vài tấm mặt tiền và sổ nha?\" (nhận hết, vẫn hỏi một ý, không đọc lại số liệu)."),
  b("1.5. Câu mẫu theo ô (code tra ra, model nói lại)", "địa chỉ: \"Nhà mình ở đường nào, số mấy hay hẻm nào {ac}?\" · phường: \"Nhà mình phường mấy {ac} nhỉ?\" · huyện: \"Chỗ mình thuộc xã nào vậy {ac}?\" · hẻm: \"Hẻm trước nhà rộng mấy mét, ô tô vào được không {ac}?\" · số nhà có xuyệt: \"Nhà mình nằm trong hẻm đúng không {ac}, hẻm rộng mấy mét, ô tô vào tới cửa không?\" · kết cấu: \"Nhà mình xây mấy tầng rồi {ac}?\" · diện tích: \"Diện tích trên sổ bao nhiêu, ngang dài thế nào {ac}?\" · pháp lý (một ý): \"Sổ hồng nhà mình là sổ riêng hay sổ chung {ac}?\" · giá: \"{Ac} muốn thu về tầm bao nhiêu ạ?\" · gấp: \"Mình cần ra hàng gấp hay được giá thì thôi {ac}?\" · ảnh: \"{Ac} chụp giúp em ảnh sổ, mặt tiền và hẻm qua Zalo nha?\""),
  b("1.6. Xác nhận thay vì sửa", "tên đường gõ sai 1–2 ký tự: \"Dạ em hiểu là đường {ten} đúng không {ac}?\" · tra được phường từ tên đường: \"Em tra thấy đường {duong} thuộc {phuong} ({quan} cũ), đúng không {ac}?\" · diện tích mơ hồ: \"70m2 là diện tích sổ hay sàn ạ?\""),
  b("1.7. Ảnh sổ / ảnh nhà", "nhận thì cảm ơn và nói ảnh đó giúp gì cho khách; đoán từ ảnh thì \"hình như là…\" rồi hỏi lại. Chủ hứa \"tối gửi\" → \"Dạ anh coi rồi nhắn em nha, em chờ.\""),

  h3("2. Nhóm kịch bản bản nháp, duyệt tin và dẫn phí"),
  p("Mục đích: chốt tin bằng một bản nháp đọc như tin rao thật, mọi dòng từ dữ liệu chủ nhà đã nói; phí chỉ nói sau khi tin lên kệ hoặc khi được hỏi."),
  b("2.1. Bản nháp", "\"📋 Em sẽ rao như vầy nhé {ac}:\" + thân tin máy dựng từ cột (tiêu đề loại + bán / cho thuê, 📍 địa chỉ, 📐 diện tích, 🏗 kết cấu, pháp lý, giá…) + \"Độ đầy đủ {diem}/100, thêm {thieu} là tin mạnh hơn nữa ạ.\" + \"{Ac} thấy hấp dẫn chưa ạ? Ổn thì em đăng liền và rao tích cực cho {ac}.\" + \"👉 Có khách quan tâm là {ten} báo lại {ac} liền ạ.\""),
  b("2.2. Sửa bản nháp", "\"Em sửa lại rồi, {ac} xem vậy được chưa ạ?\" (sửa đúng ô; \"bớt 50 triệu\" là mức giảm, hỏi lại giá rao)."),
  b("2.3. Dẫn phí sau khi lên kệ (lần đầu)", "\"Em cho chào căn {loai} của {ac} ngay ạ, mà {ac} biết phí bên em chưa ạ?\" → khách hỏi → \"Chính chủ thì 1% giá chốt, chỉ thu khi bán xong thôi anh.\" (môi giới 0,5 %; cho thuê 3/4 tháng). Thấy đắt: không tốn đồng nào cho tới khi bán được, bên em đi tìm khách và lo thương lượng thay anh chị."),
  b("2.4. Khách hỏi phí giữa chừng", "\"Phí bên em sao?\" [đang hỏi pháp lý] → \"Chính chủ thì 1% giá chốt, chỉ thu khi bán xong thôi anh. Sổ nhà mình riêng hay chung ạ?\""),
  b("2.5. Chưa có khách", "\"có khách nào hỏi căn của anh chưa em\" → \"Dạ chưa có khách hỏi anh ơi, tin mới lên em đang rao. Có khách quan tâm là em báo anh liền.\" (không hứa suông, không nói \"đã lên tin\" khi chưa lên)."),

  h3("3. Nhóm kịch bản làm giàu dữ liệu & gia hạn Zalo (keep-alive)"),
  p("Mục đích: hỏi xin đúng một thông tin còn thiếu để hoàn thiện kho và mở lại cửa sổ 7 ngày của Zalo; không có tin điểm số."),
  b("3.1. Hỏi bù sau khi lên tin", "\"Sổ nhà mình do chính {ac} đứng tên hay người nhà đứng tên, có đồng sở hữu như vợ chồng hay anh em thừa kế không?\" · \"Sổ nhà mình đang cầm tay hay đang thế chấp ngân hàng {ac}?\" · \"Nhà có dính quy hoạch, lộ giới, tranh chấp hay xây lố so với sổ gì không {ac}, đã hoàn công chưa?\" · \"Hẻm nhà mình thông hay cụt, xe hơi quay đầu được không {ac}?\" · \"Khu mình mùa mưa lớn có bị ngập hay đọng nước không {ac}?\""),
  b("3.2. Xin ảnh theo loại", "nhà: \"{Ac} chụp giúp em ảnh sổ, mặt tiền và hẻm qua Zalo nha?\" · đất: \"{Ac} chụp giúp em ảnh sổ, lô đất và đường vào qua Zalo nha?\" · chung cư: \"{Ac} chụp giúp em ảnh sổ và vài góc căn hộ (phòng khách, view) qua Zalo nha?\""),
  b("3.3. Xác thực trạng thái (khi hết thông tin để hỏi)", "\"Căn hẻm 123 Trần Bình Trọng mình còn bán không ạ?\" → \"vẫn đang bán nha\" / \"y như cũ em nhé\" → \"Dạ em giữ tin căn Trần Bình Trọng cho anh.\" · \"có người lấy rồi\" / \"bán rồi em\" → đóng đúng căn và xác nhận · \"thôi em\" → tạm ngưng rao."),
  b("3.4. Người mua im lặng", "ngày 5: nhắc theo đúng nhu cầu cũ (\"Anh vẫn tìm nhà ở Quận 5, dưới 10 tỉ, hẻm xe hơi hả anh? Có gì mới không anh?\"); ngày 6: \"Nhờ anh nhắn cho em 1 tin, nếu không Zalo sẽ xoá kết nối. Em tiếp tục tìm nhà dưới 7 tỉ ở Quận 5 cho anh nhé?\""),

  h3("4. Nhóm kịch bản cho nhà môi giới (NMG) nhiều căn"),
  p("Mục đích: nhận rổ hàng nhanh, mỗi lần một căn, gọi căn bằng địa chỉ; thao tác phá dữ liệu luôn hỏi xác nhận."),
  b("4.1. Rao nhiều căn một tin", "\"căn 1 hẻm 5m Phạm Văn Chí…, căn 2 mặt tiền Hồng Bàng…\" → tách thành hai tin, fact theo từng căn; \"còn căn B\" kế thừa loại / quận / dự án."),
  b("4.2. Gửi bảng CSV / Excel", "→ \"📥 Em nhập N căn…\" liệt kê từng căn, cột chưa nhận, dòng còn thiếu gì; vòng hỏi bù lo phần thiếu. Cột SĐT không bao giờ vào tin."),
  b("4.3. Gửi bảng giá / phân lô / brochure", "→ đọc ra mẫu nhà và từng căn theo mã lô vào kho dự án; chưa rõ dự án → \"đây là dự án nào ạ?\"; lượt sau nhắc tên có trong kho thì gắn. Rao \"căn A12\" sau đó tự điền diện tích, mẫu nhà từ kho (giá rao vẫn là giá chủ nhà nói)."),
  b("4.4. Ngưng nhiều căn một câu", "\"chỉ giữ căn Trần Hưng Đạo, ẩn hết còn lại\" / \"mấy căn kia dẹp giúp anh\" → liệt kê căn sẽ ẩn + \"{Ac} chắc ngưng rao mấy căn em vừa liệt kê chưa ạ? Nhắn \\\"ừ\\\" là em ẩn, \\\"thôi\\\" là em giữ nguyên.\" Gật mới ẩn; nói chuyện khác thì không ẩn gì."),
  b("4.5. Hết trần hạng Đồng (5 căn)", "nói thật đã đủ 5 căn và cách lên Bạc, không mở tin mới; không chặn việc điền tin đang rỗng."),
  b("4.6. Tin chính chủ Vàng đẩy tới NMG lõi", "\"💬 Căn chính chủ mới lên kệ…\" gửi ≤ 20 NMG có Zalo, mỗi NMG ≤ 1 tin / ngày."),

  h3("5. Nhóm kịch bản người mua"),
  p("Mục đích: trả lời thật, nhanh, không gọi điện, không lộ số; đủ khu vực + tầm giá là gợi căn và để khách dẫn chuyện."),
  b("5.1. Chào lần đầu", "\"Dạ em chào anh chị, em là {ten} bên AI Ơi Nhà Đất ạ. Anh chị đang muốn mua, thuê hay đang có nhà cần bán / cho thuê ạ?\""),
  b("5.2. Khai thác nhu cầu", "\"Anh tìm khu nào, tầm giá bao nhiêu ạ?\" (gộp 2–3 ý); đủ hai thứ đó thì NGỪNG dò hồ sơ, gợi ≤ 3 căn mỗi căn một dòng \"vị trí · giá · diện tích\"."),
  b("5.3. Khách hỏi điều kho chưa có", "\"Dạ em hỏi lại chủ nhà rồi báo anh nha. Trong khi chờ, anh có câu hỏi gì khác về căn này không ạ?\" → câu hỏi đi chủ nhà 12 giờ → CTV 120 phút; có trả lời: \"Em đã hỏi chủ nhà. Có chuyển anh ngay.\""),
  b("5.4. Kho trống", "nói thật em ghi nhu cầu và báo ngay khi có căn khớp; không \"có nhiều\", không hẹn giờ xem khi chưa có căn."),
  b("5.5. Xin số chủ nhà", "giải thích bên em có cộng tác viên dẫn xem, chủ nhà và khách không trao đổi trực tiếp; không đưa số."),
  b("5.6. Đặt lịch xem", "chốt hôm nào mấy giờ → \"Em ghi nhận lịch xem căn Trần Bình Trọng, P4 lúc 9h sáng Thứ 3 12/10. Em thu xếp rồi báo lại chị nha.\" Chỉ lúc này mới xin SĐT kèm lý do và đường từ chối; không cho số vẫn đặt lịch."),
  b("5.7. Sau buổi xem", "\"Căn nhà này có gì chưa phù hợp ạ? Chị chia sẻ với em đi. Để em tìm căn khác cho phù hợp với chị nha.\"; chấm sao ngay trong chat, ≤ 3 sao hỏi đúng một câu chưa ưng chỗ nào."),
  b("5.8. Cần người thật", "khách đòi gặp người thật, bức xúc, đàm phán hồi kết: vẫn trả lời tử tế + \"để em nhờ anh chị phụ trách khu này nhắn lại liền ạ\"; CTV trước, quá 30 phút lên admin."),

  h3("6. Kịch bản chuyển giao nội bộ (vòng nối CTV)"),
  b("6.1. Câu hỏi về CTV / chủ nhà", "tin escalation kèm mẫu: \"#BDS-xxxx: <câu khách hỏi>\" — trả lời bằng \"#BDS-xxxx: <câu trả lời>\" là vào kho, bot báo lại khách."),
  b("6.2. Quá hạn", "chủ nhà im 12 giờ → CTV; CTV im 120 phút → admin nhắc + CTV tụt hạng; 48 giờ → bot báo thật cho khách kèm căn khác."),
  b("6.3. Báo cáo 17h", "ctv-report tổng hợp theo từng CTV (đơn đang chăm, tương tác hôm nay, lịch xem sắp tới, đơn chờ người thật) gửi MỘT tin về Zalo cá nhân admin, nguyên văn không bọc lời chào (FR-137, FR-149)."),

  pageBreak(),
  h2("PHẦN II: GIẢ LẬP LUỒNG HỘI THOẠI THỰC TẾ (NGƯỜI BÁN, 30 CÂU)"),
  note("Mô phỏng vòng đời một tin rao nhà phố theo thứ tự hỏi của required_facts và câu mẫu trong code (trái: người rao · phải: trợ lý). Lời trợ lý trên Zalo thật do model đặt câu nên khác từ ngữ; các mốc hệ thống (bản nháp, dẫn phí, keep-alive, hỏi bù) là cố định. Chưa phải log thật."),
  chat([
    ["S", "Anh muốn nhờ đăng bán căn nhà phố ở Quận 5."],
    ["B", "Dạ em cảm ơn anh tin tưởng :) Anh cho em xin địa chỉ nhà để em kiểm tra giá khu vực nha?"],
    ["S", "Nhà hẻm 123 Trần Bình Trọng, phường 2."],
    ["B", "Dạ. Hẻm trước nhà rộng mấy mét, ô tô vào được không anh?"],
    ["S", "Hẻm 4m, ô tô vào tới nơi."],
    ["B", "Ô tô tới tận nhà thì khách chuộng lắm. Diện tích trên sổ, ngang dài bao nhiêu anh?"],
    ["S", "4x15, 60m2."],
    ["B", "Nhà mình xây mấy tầng rồi anh?"],
    ["S", "1 trệt 2 lầu, 3 phòng ngủ."],
    ["B", "Dạ. Nhà mình mấy toilet ạ?"],
    ["S", "3 toilet."],
    ["B", "Sổ hồng nhà mình là sổ riêng hay sổ chung anh?"],
    ["S", "Sổ riêng, anh đứng tên."],
    ["B", "Sổ riêng là khách yên tâm lắm. Anh muốn thu về tầm bao nhiêu ạ?"],
    ["S", "10 tỷ, có thương lượng."],
    ["B", "Dạ em ghi nhận. Mình cần ra hàng gấp hay được giá thì thôi anh?"],
    ["S", "Được giá thì bán, không gấp."],
    ["B", "Anh chụp giúp em ảnh sổ, mặt tiền và hẻm qua Zalo nha?"],
    ["S", "[Đã gửi 3 ảnh: sổ hồng, mặt tiền, hẻm]"],
    ["B", "📋 Em sẽ rao như vầy nhé anh:\nNHÀ PHỐ BÁN · 📍 Hẻm 123 Trần Bình Trọng, P.2, Q.5 · 📐 60m2 (4x15) · 🏗 1 trệt 2 lầu, 3PN, 3WC · hẻm 4m xe hơi tới nhà · sổ hồng riêng · 💰 10 tỷ, thương lượng\nĐộ đầy đủ [điểm]/100, thêm hướng nhà là tin mạnh hơn nữa ạ.\nAnh thấy hấp dẫn chưa ạ? Ổn thì em đăng liền và rao tích cực cho anh.\n👉 Có khách quan tâm là T•ai báo lại anh liền ạ."],
    ["S", "Ok đăng đi em."],
    ["B", "Em cho chào căn nhà phố của anh ngay ạ, mà anh biết phí bên em chưa ạ?"],
    ["S", "Chưa, phí sao em?"],
    ["B", "Chính chủ thì 1% giá chốt, chỉ thu khi bán xong thôi anh. Không tốn đồng nào cho tới khi bán được, bên em đi tìm khách và lo thương lượng thay anh."],
    ["S", "Nhất trí. Có khách báo anh."],
    ["B", "Dạ anh. Có khách quan tâm là em báo anh liền ạ."],
    ["⏳", "Khách mua hỏi điều kho chưa có — câu hỏi đi về chủ nhà (FR-173, hạn 12 giờ)"],
    ["B", "Anh ơi, khách mua hỏi căn Trần Bình Trọng mình có dính quy hoạch hay lộ giới gì không anh?"],
    ["S", "Không dính gì, hoàn công đầy đủ."],
    ["B", "Dạ em báo khách liền. Khách ưng là em sắp lịch xem rồi báo anh nha."],
    ["⏳", "5 ngày không tương tác — keep-alive mở lại cửa sổ Zalo (SRS-5.1zzc)"],
    ["B", "Anh ơi, căn hẻm 123 Trần Bình Trọng mình còn bán không ạ?"],
    ["S", "Vẫn đang bán nha, chưa chốt ai."],
    ["B", "Dạ em giữ tin căn Trần Bình Trọng cho anh. Có khách là em báo liền."],
  ]),
  new Paragraph({ spacing: { after: 240 } }),
  note("Khác SRD gốc ở cùng hội thoại: không có câu \"điểm Uy tín nhảy lên 70\" / \"hạng Vàng\" (điểm chỉ ghi DB); không có nút bấm trong tin (chờ OA); trợ lý bên mua không tự xưng tên khác — cùng một tên với khách đó ở cả hai nhánh (FR-181); phí dẫn sau khi tin lên kệ, không đợi khách hỏi."),
];

// ---------- dựng file ----------
const doc = new Document({
  creator: "nhadat.cc — scripts/sinh-srd-docx.mjs",
  title: "SRD — AI Ơi Nhà Đất",
  description: `Bản SRD gộp sinh từ docs/ ngày ${NGAY}`,
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal", run: { font: FONT, size: 32, bold: true } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 28, bold: true, color: "1F3864" }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 24, bold: true, color: "1F3864" }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 22, bold: true, color: "2F5496" }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [{
      reference: "gach",
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 300 } } } },
      ],
    }],
  },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [run("AI Ơi Nhà Đất — SRD gộp · sinh từ docs/ bằng scripts/sinh-srd-docx.mjs · trang ", { size: 16, color: "777777" }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "777777" })],
        })],
      }),
    },
    children: [...trangBia, ...mucI, ...mucII, ...mucIII, ...mucIV, ...mucV, ...mucVI, ...mucVII, ...mucVIII, ...mucIX, ...kichBan],
  }],
});

const buf = await Packer.toBuffer(doc);
mkdirSync(dirname(DEST), { recursive: true });
writeFileSync(DEST, buf);
console.log(`Đã ghi ${DEST} (${(buf.length / 1024).toFixed(0)} KB)`);
