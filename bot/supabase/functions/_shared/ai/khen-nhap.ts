// khen-nhap.ts — AI VIẾT MỘT CÂU KHEN dưới bản nháp tin rao (13/10/2026, SRS-5.1zzzzzl).
//
// Chủ dự án (test Zalo 13/10): "Tin nháp phải có khen nữa" — chọn "AI viết, có soát". Bản nháp do code dựng từ cột + fact (không
// model), nên câu khen là lượt model riêng, đọc ĐÚNG bản tin vừa dựng. Code kiểm (`khenHopLe`): mọi cụm lời khen dựa vào phải chép
// nguyên văn từ bản tin, không con số nào ngoài bản tin, không câu hỏi (extraction/khen-hop-le.ts — chạy được offline); rồi lượt soát nhận xét chung (`soatNhanXet`, kiem-khen.ts) đọc
// lại — soát bỏ bất kỳ vế nào thì bỏ cả câu khen. Model hỏng / không qua kiểm → bản nháp không có câu khen (không câu mẫu thay thế).
// Tầng này KHÔNG ghi DB (luật `bot/tests/ranh-gioi.mjs`). Model hỏng thì NÉM — nơi gọi ghi sổ (FR-152 d).
import { z } from "npm:zod@4";
import { dinhDangLong, docLong } from "./doc-long.ts";

const KhenNhap = z.object({
  khen: z.string().nullable().describe("MỘT câu khen, ≤ 30 chữ, không câu hỏi. Không viết được câu đúng luật → null."),
  // SRS-5.1zzzzzr (chủ dự án 13/10/2026: "Tiêu đề nên hoa văn tí"): AI viết tiêu đề, code kiểm số + chữ cấm (`tieuDeHopLe`), không qua thì giữ tiêu đề máy.
  // SRS-5.1zzzzzu (chủ dự án 13/10: "tiêu đề phải thu hút người mua và cachy hơn"): không bắt khuôn "Chỉ <giá>"; tin thuê cũng có tiêu đề.
  tieu_de: z.string().nullable().optional().describe("MỘT tiêu đề rao THU HÚT người mua / người thuê, 15–25 từ (chuẩn AD_FORMAT, SRS-5.1zzzzzzz25), như môi giới giỏi viết: nêu giá đúng như bản tin, 1–2 điểm mạnh nổi nhất CÓ TRONG bản tin, khu vực; lời mời gọi vừa phải (\"sở hữu ngay\", \"về ở liền\", \"dọn vào ngay\", \"nhà xinh\"). Tin bán ví dụ \"Nhà hẻm xe hơi Đông Thạnh 132m², sân rộng, chỉ 3,9 tỷ\"; tin thuê ví dụ \"Cho thuê nguyên căn hẻm 5m Dương Bá Trạc, 2PN, dọn vào ngay, 6 triệu/tháng\". Không con số ngoài bản tin, không nói thị trường / sinh lời / dễ bán / đầu tư, không hứa, không tiếng Anh, không chấm than. Không viết được → null."),
  dua_tren: z.array(z.string()).describe("Các cụm COPY NGUYÊN VĂN từ BẢN TIN mà câu khen nhắc tới (mỗi điểm mạnh một cụm)."),
  // SRS-5.1zzzzzn: xếp ý thêm vào dòng "Quy mô" theo NGHĨA (không dò từ khoá) — cùng lượt model này, không thêm lượt gọi.
  // SRS-5.1zzzzzo ("tiện ích phải gom vào đúng tiện ích"): ý thêm nói về xung quanh căn → dòng 🏫 Tiện ích. Cùng lượt model.
  tien_ich: z.array(z.string()).optional().describe("Trong danh sách Ý THÊM: các ý nói về TIỆN ÍCH / XUNG QUANH căn (gần chợ, trường, bệnh viện, công viên, siêu thị, khu dân cư, cách đường lớn bao xa, an ninh khu). Chép NGUYÊN VĂN từng ý như trong danh sách. Ý về bên trong căn, tình trạng, pháp lý → không đưa. Không có → []."),
  quy_mo: z.array(z.string()).optional().describe("Trong danh sách Ý THÊM: các ý nói về QUY MÔ / KHÔNG GIAN của căn (phòng, bếp, phòng khách, sân, sân thượng, ban công, gara, kho, độ rộng không gian bên trong). Chép NGUYÊN VĂN từng ý như trong danh sách. Ý về vị trí, tiện ích quanh nhà, tình trạng, pháp lý → không đưa. Không có → []."),
  // SRS-5.1zzzzzz (chủ dự án 13/10/2026: "Chọn lọc các tiện ích trong tin dự án để đưa ra ý ngon nghẻ"): bài rao dự án / khu dân cư liệt kê
  // 7–9 tiện ích → tin rao chỉ khoe 3–4 ý đáng nhất, viết gọn. Cùng lượt model này; code kiểm từng ý (`tienIchNoiBatHopLe`).
  tien_ich_noi_bat: z.array(z.object({
    goc: z.string().describe("Ý tiện ích chép NGUYÊN VĂN từ danh sách Ý THÊM (đúng một dòng trong danh sách)."),
    gon: z.string().describe("Cách viết GỌN của ý đó để in lên tin, ≤ 10 chữ: giữ đúng TÊN RIÊNG và CON SỐ / khoảng cách / thời gian như ý gốc, bỏ chữ thừa (\"Chợ Rạch Kiến hoặc Chợ Phước Vân ~ 3 - 5 phút\" → \"chợ Rạch Kiến, Phước Vân 3–5 phút\"; \"Khu công nghiệp Cầu Tràm ~ 10 phút\" → \"KCN Cầu Tràm 10 phút\"). KHÔNG thêm nhận định (sầm uất, tiện lợi, đắc địa), không thêm tên / số mới."),
  })).optional().describe("Khi Ý THÊM có từ 4 ý tiện ích trở lên: chọn TỐI ĐA 4 ý ĐÁNG KHOE NHẤT với người mua (gần nhất / lớn nhất / ai cũng cần: chợ, trường, bệnh viện, siêu thị lớn, trục đường chính / cao tốc, khu công nghiệp lớn), xếp ý mạnh trước; bỏ ý mờ (UBND, trạm y tế, ý trùng). Ít hơn 4 ý tiện ích → []."),
});
const FORMAT = dinhDangLong(KhenNhap);

export const LUAT_KHEN = `VIẾT CÂU KHEN BẢN NHÁP — em là trợ lý môi giới vừa soạn xong bản tin rao cho chủ nhà. Viết MỘT câu khen ngắn, ấm áp
gửi chủ nhà, đặt ngay dưới bản tin.
- Khen CÁCH CHỦ NHÀ GIỚI THIỆU căn (rõ ràng, chi tiết, đầy đủ) và NHẮC LẠI 2–3 điểm mạnh chủ nhà đã nêu, dùng ĐÚNG CHỮ trong bản tin
  ("ô tô tận cửa", "mặt tiền 6m", "gần trường mầm non, chợ"). Ví dụ: "Căn mình ô tô tận cửa, mặt tiền 6m lại gần trường, chợ, anh
  giới thiệu chi tiết quá ạ."
- KHÔNG gắn thêm lợi ích hay tính chất bản tin không có ("đi lại tiện", "kết cấu chắc", "rộng rãi", "yên tĩnh").
- KHÔNG đoán người mua, khả năng bán, giá, thị trường ("dễ bán", "khách chuộng", "giá tốt", "đáng tiền", "đắt khách").
- KHÔNG chấm căn tốt / xấu / vừa, KHÔNG con số nào ngoài bản tin, KHÔNG hỏi, KHÔNG hứa, KHÔNG tiếng Anh, không gạch ngang dài.
- Gọi chủ nhà đúng cách gọi được đưa; em xưng "em".
- dua_tren: mỗi điểm mạnh câu khen nhắc tới là một cụm chép NGUYÊN VĂN từ bản tin.
- quy_mo: xếp riêng (không liên quan câu khen) — trong danh sách Ý THÊM, ý nào nói về quy mô / không gian bên trong căn (bếp, phòng khách, sân rộng,
  sân thượng…) thì chép nguyên văn vào quy_mo; ý về vị trí, tiện ích quanh nhà, tình trạng nhà thì không.
- tien_ich: xếp riêng — ý nào nói về xung quanh căn (gần chợ / trường / công viên, khu dân cư, cách đường lớn…) thì chép nguyên văn vào tien_ich.
  Một ý chỉ vào MỘT trong hai danh sách.
- tien_ich_noi_bat: khi Ý THÊM có ≥ 4 ý tiện ích (bài rao dự án / khu dân cư hay liệt kê 7–9 ý), chọn TỐI ĐA 4 ý đáng khoe nhất với người mua
  (chợ / trường / bệnh viện / siêu thị lớn / trục đường chính, cao tốc / khu công nghiệp lớn; gần nhất đứng trước), mỗi ý: goc = chép nguyên văn
  một dòng Ý THÊM, gon = viết gọn ≤ 10 chữ giữ đúng tên riêng + con số của ý gốc, không thêm nhận định. Bỏ ý mờ (UBND, trạm y tế, ý trùng).
  Dưới 4 ý tiện ích → [].
- tieu_de: viết lại dòng tiêu đề (dòng 2 của bản tin) cho THU HÚT, đọc là muốn hỏi ngay, dài 15–25 từ (đủ vị trí + quy mô + giá, không cụt ý) — cùng giá, cùng điểm mạnh, cùng khu vực có
  trong bản tin, tự chọn thứ tự (giá có thể đứng đầu hay cuối), lời mời gọi vừa phải ("sở hữu ngay", "về ở liền", "dọn vào ngay", "nhà
  xinh"); tin thuê mở bằng "Cho thuê" / "Thuê ngay". KHÔNG thêm điểm mạnh / con số / nhận định mới.
  Căn hộ mà bản tin có tên chung cư / dự án (dòng 📍) thì tiêu đề PHẢI có tên đó — người mua căn hộ tìm theo tên chung cư.
Bản tin không có điểm mạnh nào để nhắc → khen = null.`;

type ClientModel = {
  messages: { parse: (p: Record<string, unknown>) => Promise<{ parsed_output?: unknown; usage?: unknown }> };
};

/** Hỏi model câu khen. Kết quả THÔ — đưa qua `khenHopLe`. Model hỏng thì NÉM. */
export async function vietKhenNhapBangModel(
  ai: ClientModel, model: string, banTin: string, cachGoi: string, yThem: string[] = [],
): Promise<{ khen: string | null; duaTren: string[]; quyMo: string[]; tienIch: string[]; tienIchNoiBat: Array<{ goc: string; gon: string }>; tieuDe: string | null; usage: unknown }> {
  // SRS-5.1zzzzzzo (14/10/2026): trần 300 đặt lúc khuôn chỉ có `khen` + `dua_tren`; khuôn đã thêm tieu_de, tien_ich, quy_mo,
  // tien_ich_noi_bat (4 × goc + gon) mà trần giữ nguyên → bài rao dài làm JSON bị cắt giữa chuỗi ("Unterminated string … position 503",
  // sổ lỗi 13/10 09:03 và 14/10 04:47 — tin Cao Lỗ của người test), và cả lượt ném: mất luôn tiêu đề AI + gom tiện ích, không chỉ câu khen.
  // Ước lượng khuôn đầy ~1.400 ký tự tiếng Việt ≈ 700 token; đặt 1.000. `bot/tests/khen-nhap.mjs` soi trần này không tụt.
  const r = await ai.messages.parse({
    model,
    max_tokens: 1000,
    output_config: { effort: "low", format: FORMAT },
    system: [{ type: "text", text: LUAT_KHEN, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Cách gọi chủ nhà: "${cachGoi}"\nBẢN TIN:\n${banTin.slice(0, 2500)}\nÝ THÊM:\n${yThem.length ? yThem.map((y) => `- ${y}`).join("\n") : "(không có)"}` }],
  });
  const k = docLong(KhenNhap, r.parsed_output);
  return {
    khen: k.success ? k.data.khen : null, duaTren: k.success ? k.data.dua_tren : [], quyMo: k.success ? k.data.quy_mo ?? [] : [], tienIch: k.success ? k.data.tien_ich ?? [] : [],
    tienIchNoiBat: k.success ? k.data.tien_ich_noi_bat ?? [] : [], tieuDe: k.success ? k.data.tieu_de ?? null : null, usage: r.usage,
  };
}
