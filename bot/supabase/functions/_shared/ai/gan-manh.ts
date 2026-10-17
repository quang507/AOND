// gan-manh.ts — FR-214 (b)(d), 23/09/2026: một người rao NHIỀU căn trong cùng một hội thoại.
//
// Chủ dự án (sau khi bot gộp nhà Kênh Tân Hóa với đất Cần Giuộc thành một tin): "nếu bot confusion chỗ nào
// thì có thể đọc lại cả hội thoại để xem lại người ta đang quan tâm mua những căn nào và đang rao bán những
// căn nào". Luật tiền định chỉ biết "căn đang chăm"; câu "15 tỉ nhé cháu còn nhà ở quận 11 cũ muốn 7 tỉ"
// nói về HAI căn. Lượt này đưa model: cả hội thoại gần đây + danh sách tin người đó đang rao + câu bot đang
// treo + tin mới; model trả các MẢNH chữ (chép nguyên văn) kèm mã tin mỗi mảnh nói về.
//
// Tầng AI (bot/tests/ranh-gioi.mjs): KHÔNG ghi bảng nghiệp vụ, không gọi RPC. Kết quả là dữ liệu THÔ —
// nơi gọi đưa qua `donManh` (extraction/gan-manh-loc.ts) để bỏ mảnh bịa chữ và mã không có thật.
import { z } from "npm:zod@4";
import { dinhDangLong, docLong } from "./doc-long.ts";

const ManhBoc = z.object({
  manh: z.array(z.object({
    trich: z.string().describe("Cụm chữ chép NGUYÊN VĂN, liền mạch, từ TIN MỚI (không viết lại, không gộp hai chỗ xa nhau)."),
    ma_tin: z.string().describe("Mã tin trong DANH SÁCH TIN mà cụm chữ nói về; 'MOI' nếu nói về một bất động sản CHƯA có trong danh sách; 'KHONG' nếu không nói về căn nào (chào, cảm ơn, hỏi chung)."),
  })).max(6).describe("Các mảnh của tin mới, theo thứ tự xuất hiện. Tin chỉ nói về một căn thì một mảnh."),
});
const FORMAT_MANH = dinhDangLong(ManhBoc);

const LUAT = `GÁN MẢNH TIN NHẮN VÀO ĐÚNG CĂN — trợ lý môi giới nhà đất AI Ơi Nhà Đất.
Một người có thể đang rao NHIỀU căn cùng lúc. Nhiệm vụ: đọc lại HỘI THOẠI và DANH SÁCH TIN của người đó,
rồi chia TIN MỚI thành các mảnh, mỗi mảnh gắn với đúng một mã tin.
- Mảnh trả lời câu bot đang hỏi (CÂU ĐANG TREO) thuộc về căn của câu đó, trừ khi chữ nói rõ căn khác.
- "còn nhà ở quận 11 …", "căn đất thì …", "căn kia …" → căn khớp nơi chốn / loại / cách người đó gọi trong hội thoại.
- Nói về một bất động sản chưa có trong danh sách (nơi khác, loại khác, "còn 1 căn nữa ở …") → MOI.
- Nhắc lại nơi chốn / tên đường của căn đang được hỏi để trả lời câu đó ("nhà phố anh, hẻm Nguyễn Trãi quận 5" khi đang hỏi loại căn
  hẻm Nguyễn Trãi) là căn đó, KHÔNG phải MOI — kể cả khi danh sách chưa ghi quận.
- Không đoán: mảnh không rõ thuộc căn nào thì gắn vào căn của CÂU ĐANG TREO.
- trich phải chép NGUYÊN VĂN từ tin mới; mọi chữ của tin mới nên nằm trong đúng một mảnh.`;

type ClientModel = {
  messages: {
    parse: (p: Record<string, unknown>) => Promise<{ parsed_output?: unknown; usage?: unknown }>;
  };
};

/**
 * Hỏi model chia tin mới theo căn. `hoiThoai` là lịch sử đã dựng sẵn ("CHỦ NHÀ: …" / "EM: …"), `dsTin` mỗi
 * dòng một tin ("BDS-… · nhà phố · Kênh Tân Hóa, Quận 11 · 7 tỷ"), `cauTreo` mô tả câu bot đang hỏi. Trả
 * `null` khi model hỏng — nơi gọi đi đường cũ. Không ném.
 */
export async function ganManhBangModel(
  ai: ClientModel,
  model: string,
  vao: { hoiThoai: string; dsTin: string; cauTreo: string | null; text: string },
): Promise<{ ket: unknown; usage: unknown } | null> {
  try {
    const r = await ai.messages.parse({
      model,
      max_tokens: 2000, // 14/10/2026: tin mới không còn cắt ở 800 chữ, mảnh trích dài hơn
      output_config: { effort: "low", format: FORMAT_MANH },
      system: [{ type: "text", text: LUAT, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `HỘI THOẠI GẦN ĐÂY:\n${vao.hoiThoai.slice(-6000)}\n\nDANH SÁCH TIN ĐANG RAO:\n${vao.dsTin}\n\n` +
          `CÂU ĐANG TREO: ${vao.cauTreo ?? "(không có)"}\n\nTIN MỚI: "${(vao.text ?? "").slice(0, 6000)}"`,
      }],
    });
    const k = docLong(ManhBoc, r.parsed_output);
    return { ket: k.success ? k.data : null, usage: r.usage };
  } catch {
    return null;
  }
}
