// PHÂN VAI NGƯỜI LẠ BẰNG MODEL (FR-205, 11/09/2026) — chỉ khi luật KHÔNG kết luận.
//
// Chủ dự án 11/09: "có thể dùng AI vào các chỗ quá cứng trong code không" → "gật".
//
// VÌ SAO ĐƯỢC DÙNG MODEL Ở ĐÂY: model chỉ CHỌN ĐƯỜNG (bán / mua / chưa rõ), không
// bóc giá, diện tích hay quận — những thứ ghi thẳng vào tin vẫn do luật tiền
// định bóc. Và nó chỉ ĐỀ XUẤT: `donVai` (_shared/extraction/phan-vai-loc.ts)
// đòi cụm chữ làm bằng phải có nguyên trong câu, bịa cớ thì coi như chưa rõ.
//
// KHI NÀO GỌI: `nenHoiModelVai` — người lạ, chưa hồ sơ bán/mua, luật không ra
// bán cũng không ra mua, câu có mùi nhà đất. Câu chào, "ok em", câu luật đã rõ
// thì KHÔNG gọi: mỗi lượt là một lượt tiền.
//
// CHIỀU SAI SỐ (FR-159): nhầm NGƯỜI MUA thành người bán là lỗi đắt ("nhà mình ở
// đâu ạ?" với người đang đi tìm nhà), chiều ngược lại chỉ tốn một câu hỏi thừa.
// Prompt dặn đúng chiều đó.
//
// Tầng này KHÔNG ghi DB (luật `bot/tests/ranh-gioi.mjs`): nó trả dữ liệu, nơi
// gọi quyết định.

import { z } from "npm:zod@4";
import { dinhDangLong, docLong } from "./doc-long.ts";

const VaiBoc = z.object({
  vai: z.enum(["ban", "mua", "chua_ro"])
    .describe("ban = người nhắn CÓ hàng muốn bán/cho thuê/sang nhượng; mua = người nhắn đang TÌM mua/thuê; chua_ro = không đủ để biết."),
  bang_chung: z.string()
    .describe("Trích NGUYÊN VĂN cụm chữ trong tin cho thấy vai đó (tối đa 80 ký tự). chua_ro thì để chuỗi rỗng."),
});
const FORMAT_VAI = dinhDangLong(VaiBoc);

const LUAT = `PHÂN VAI TIN NHẮN ĐẦU TIÊN gửi tới trợ lý môi giới nhà đất AI Ơi Nhà Đất (Sài Gòn, Long An).
Người nhắn là MỘT trong ba:
- ban: người đang CÓ bất động sản muốn bán, cho thuê, sang nhượng, ký gửi — kể cả khi không nói chữ "bán": liệt kê căn CỦA MÌNH (vị trí, diện tích, giá, pháp lý), "để lại", "cần tiền nên ra", "chủ đi nước ngoài cần bán gấp", môi giới giới thiệu hàng đang có.
- mua: người đang TÌM mua hoặc thuê — hỏi có căn nào, nêu ngân sách ("tầm", "khoảng", "dưới"), nêu nhu cầu (gần trường, gần bệnh viện, mấy phòng ngủ), hỏi giá khu vực để mua.
- chua_ro: chào hỏi, câu chung chung, hỏi thăm, hoặc không đủ chữ để phân biệt.
Đọc theo NGHĨA cả tin, không bắt từ khoá: "tìm nhà chính chủ", "mua nhà bán gấp giá tốt" là người MUA dù có chữ "chính chủ" / "bán"; "tôi có căn ở Q10, giờ muốn tìm căn Q5" là người MUA kể hoàn cảnh; "ban công", "chào bạn" không phải chữ "bán"; "cho thuê" là người có hàng, "đi thuê / cần thuê" là người tìm.
Chỉ dựa vào chữ có trong tin, không đoán thêm. Nhầm người MUA thành người BÁN là lỗi đắt nhất — chỉ trả ban khi câu cho thấy người nhắn đang có hàng. Không chắc thì chua_ro: hỏi lại khách một câu rẻ hơn nhiều so với đoán sai.
bang_chung phải là cụm chữ chép NGUYÊN từ tin, không viết lại.
Có dòng "Câu trợ lý vừa hỏi" thì tin là câu TRẢ LỜI cho câu đó, đọc theo nghĩa của cả hai: trợ lý hỏi có cần rao bán bất động sản không mà khách GẬT (đúng rồi, đúng rồi e, vâng ạ, dạ phải, chuẩn luôn, ừa, có) → ban, bang_chung là lời gật; khách chối hoặc nói đang tìm mua / thuê → mua; khen, hỏi lại, nói chuyện khác → chua_ro.`;

// SRS-5.1zzzzze (khách mô phỏng lần bảy: chủ nhà đã rao hỏi "phí 1% đó lấy từ chị hay từ bên mua nhà vậy?" → luật thấy "mua nhà",
// mở hồ sơ NGƯỜI MUA cho chủ nhà). Người đã rao bán mà luật thấy chữ mua / thuê / tìm thì hỏi model: họ có đang TÌM MUA thêm không.
const NGUOI_BAN_CU = `Người nhắn ĐANG rao bán căn của họ với trợ lý. Chỉ trả mua khi tin cho thấy CHÍNH HỌ muốn tìm mua / thuê thêm một căn
khác ("giờ chị muốn mua thêm căn ở Q7", "có căn nào 2 phòng ngủ cho thuê không em"). Hỏi về phí, về bên mua / khách mua của căn họ
đang bán, về tin của họ, kể chuyện từng mua căn này → ban, bang_chung là cụm cho thấy họ đang nói về căn của mình.\n`;

type ClientModel = {
  messages: {
    parse: (p: Record<string, unknown>) => Promise<{ parsed_output?: unknown; usage?: unknown }>;
  };
};

/**
 * 07/10/2026 (SRS-5.1zzze, test os6o: "đúng rồi e" sau câu chào bị hỏi lại câu chào): `cauBotVuaHoi` = câu hỏi vai bot vừa
 * gửi — có nó model đọc tin như câu trả lời ("đúng rồi e" là gật), không có thì đọc tin đứng một mình như cũ.
 *
 * Hỏi model vai của MỘT tin nhắn. Trả `null` khi model hỏng — nơi gọi đi đường
 * cũ (hỏi vai). `ket` là dữ liệu THÔ của model, chưa dọn: đưa qua `donVai`.
 * Không ném.
 */
export async function phanVaiBangModel(
  ai: ClientModel,
  model: string,
  text: string,
  cauBotVuaHoi: string | null = null,
  /** SRS-5.1zzzzze: người nhắn ĐÃ rao bán với bên em — hỏi xem tin này có phải họ muốn TÌM MUA / THUÊ thêm không. */
  daLaNguoiBan = false,
): Promise<{ ket: unknown; usage: unknown } | null> {
  try {
    const r = await ai.messages.parse({
      model,
      max_tokens: 150,
      output_config: { effort: "low", format: FORMAT_VAI },
      system: [{ type: "text", text: LUAT, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `${daLaNguoiBan ? NGUOI_BAN_CU : ""}${cauBotVuaHoi ? `Câu trợ lý vừa hỏi: "${cauBotVuaHoi.slice(0, 300)}"\n` : ""}Tin nhắn: "${(text ?? "").slice(0, 6000)}"`,
      }],
    });
    const k = docLong(VaiBoc, r.parsed_output);
    return { ket: k.success ? k.data : null, usage: r.usage };
  } catch {
    return null;
  }
}
