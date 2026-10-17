// BÓC TÁCH THÔNG TIN DỰ ÁN BẰNG MODEL — lưới VÉT, đứng SAU tầng tiền định.
//
// Chủ dự án 10/09/2026: "ủa cái nào cũng phải viết hàm như này chứ ko dùng ai
// tự bóc tách ra specs rồi viết vào được hả" → "lắp đi".
//
// VÌ SAO CHỖ NÀY ĐƯỢC DÙNG MODEL, TRONG KHI GIÁ / DIỆN TÍCH / PHƯỜNG THÌ KHÔNG:
//   · Thứ model bóc ở đây KHÔNG đi thẳng vào kho. Nó vào `project_facts` ở
//     trạng thái CHỜ DUYỆT (FR-195) — admin gật thì mới thành sự thật. Model
//     bịa thì chết ở hàng chờ, không chết trong rổ hàng.
//   · Giá / diện tích / phường ghi THẲNG vào `listings`, không ai duyệt. Ở đó
//     một lượt bịa là một tin sai vĩnh viễn, nên phải là hàm tiền định, kiểm
//     được bằng 256 ca e2e chạy miễn phí.
//
// KHI NÀO GỌI: chỉ khi tầng tiền định ĐÃ THỬ và không ra gì — câu có mùi dự án
// (nhắc "dự án", "toà", "phí quản lý", "tiện ích"…) mà `khopCauTraLoi` không
// nhặt được khoá nào, hoặc nhặt được nhưng chưa biết dự án nào. Câu thường
// (giá, diện tích, "ok em") KHÔNG bao giờ đi qua đây: mỗi lượt là một lượt tiền.
//
// LUẬT CHO MODEL, viết trong prompt và ép lại bằng schema:
//   · chỉ lấy chữ CÓ TRONG CÂU, cấm suy đoán, cấm lấy kiến thức ngoài;
//   · không chắc thì trả rỗng — hàng chờ duyệt đầy rác thì admin thôi nhìn nó.
//
// Tầng này KHÔNG ghi DB (luật `bot/tests/ranh-gioi.mjs`): nó trả dữ liệu, nơi
// gọi quyết định ghi.

import { z } from "npm:zod@4";
import { dinhDangLong, docLong } from "./doc-long.ts";
import { coMuiDuAn, donKetQua } from "../extraction/vet-du-an-loc.ts";
export { coMuiDuAn, donKetQua };

/** Khoá fact thuộc về CẢ DỰ ÁN — trùng danh sách `KHOA_DU_AN` của chat-reply. */
export const KHOA_DU_AN_LLM = [
  "phi_quan_ly", "phi_gui_xe", "tien_ich_gan", "ha_tang", "khu_compound",
  "thang_may", "pccc", "nam_xay", "xay_dung", "mat_do_xd", "tang_cao_toi_da",
  "so_huu", "thoi_han_su_dung", "gia_dien_nuoc",
] as const;

const DuAnBoc = z.object({
  ten_du_an: z.string().nullable()
    .describe("Tên dự án/khu đô thị chủ nhà nhắc, viết y như trong câu, KHÔNG kèm quận/phường. Không có thì null."),
  facts: z.array(z.object({
    khoa: z.enum(KHOA_DU_AN_LLM),
    gia_tri: z.string().describe("Trích NGUYÊN VĂN phần câu nói về khoá này, tối đa 120 ký tự."),
  })).describe("Chỉ những khoá câu NÓI RÕ. Không suy ra, không đoán, không có thì để mảng rỗng."),
});
type DuAnBocLLM = z.infer<typeof DuAnBoc>;

const FORMAT_DU_AN = dinhDangLong(DuAnBoc);

const LUAT = `Bạn bóc thông tin về DỰ ÁN từ tin nhắn của chủ nhà đang rao bán.
CHỈ lấy chữ có trong câu. Cấm suy đoán, cấm dùng kiến thức bên ngoài, cấm làm tròn hay diễn giải lại số.
Không chắc thì để null / mảng rỗng — thà bỏ sót còn hơn ghi sai vào kho dự án.
Tên dự án: viết đúng như chủ nhà gõ, BỎ phần quận/phường/thành phố dính đuôi. Câu chỉ tả chung chung ("khu này yên tĩnh") thì KHÔNG phải tên dự án.
Ý nghĩa các khoá: phi_quan_ly=phí quản lý; phi_gui_xe=phí giữ xe; tien_ich_gan=tiện ích nội khu/gần đó; ha_tang=hạ tầng, đường sá, kết nối; khu_compound=khu biệt lập/an ninh; thang_may=thang máy; pccc=phòng cháy; nam_xay=năm xây/bàn giao; xay_dung=quy mô xây dựng; mat_do_xd=mật độ xây dựng; tang_cao_toi_da=số tầng tối đa; so_huu=hình thức sở hữu; thoi_han_su_dung=thời hạn sử dụng; gia_dien_nuoc=giá điện nước.`;

type ClientModel = {
  messages: {
    parse: (p: Record<string, unknown>) => Promise<{ parsed_output?: unknown; usage?: unknown }>;
  };
};

/**
 * Bóc tên dự án + fact dự án từ MỘT tin nhắn. Trả `null` khi không gọi model
 * (câu không có mùi dự án) — nơi gọi phân biệt được "không gọi" với "gọi mà
 * không ra gì" (`{ten_du_an: null, facts: []}`).
 *
 * Không ném: model hỏng thì trả null, đường tiền định đã chạy xong từ trước
 * nên mất lượt này chỉ mất phần VÉT, không mất câu trả lời cho khách.
 */
export async function bocDuAnBangModel(
  ai: ClientModel,
  model: string,
  text: string,
  batBuoc = false,
): Promise<{ ket: DuAnBocLLM | null; usage: unknown } | null> {
  if (!batBuoc && !coMuiDuAn(text)) return null;
  try {
    const r = await ai.messages.parse({
      model,
      max_tokens: 400,
      output_config: { effort: "low", format: FORMAT_DU_AN },
      system: [{ type: "text", text: LUAT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Tin nhắn chủ nhà: "${text}"` }],
    });
    const ket = docLong(DuAnBoc, r.parsed_output);
    return { ket: ket.success ? ket.data : null, usage: r.usage };
  } catch {
    return null;
  }
}

