// phan-loai-anh.ts — FR-185 (09/09/2026): ảnh chủ nhà gửi qua chat là ảnh GÌ?
// Mặt tiền / trong nhà / hẻm / giấy tờ (sổ hồng, sổ đỏ, HĐMB) / bản vẽ / khác,
// và nếu là giấy tờ thì đọc ra vài con số để đối chiếu với lời chủ nhà (diện
// tích, địa chỉ thửa, số thửa, số tờ). Chat Gemini 21/06: "nhận biết hình đó là
// hình gì… đọc các photo giấy đỏ xem có đúng hay không".
//
// Tầng AI (bot/tests/ranh-gioi.mjs LUAT_AI): chỉ gọi model, KHÔNG đụng bảng.
// Cất ảnh vào kho và ghi listing_media là việc của `_shared/kho_anh.ts` +
// chat-reply. Không đọc tên chủ sở hữu ra khỏi sổ (CLAUDE.md §5 — PII).
import { z } from "npm:zod@4";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";

// 24/09/2026 (chủ dự án): thêm phòng ngủ, bếp, WC, sân thượng, view; ảnh KHÔNG LIÊN QUAN tới nhà (người, đồ ăn, meme…)
// thì bot hỏi "có gửi nhầm ảnh không", không cất vào tin. Ảnh chỉnh sửa / tạo bằng AI vẫn nhận như ảnh thường.
// 05/10/2026 (SRS-5.1zzj, demo AOND): `tai_lieu_du_an` — bảng giá, sơ đồ phân lô, brochure, mặt bằng → đọc vào kho dự án, không cất như ảnh căn.
export const LOAI_ANH = ["mat_tien", "trong_nha", "phong_ngu", "bep", "wc", "san_thuong", "view", "hem", "giay_to", "ban_ve", "tai_lieu_du_an", "khong_lien_quan", "khac"] as const;
export type LoaiAnh = (typeof LOAI_ANH)[number];

export const AnhSchema = z.object({
  loai: z.enum(LOAI_ANH).describe(
    "mat_tien = mặt ngoài / mặt tiền nhà, cửa chính nhìn từ đường; trong_nha = phòng khách, cầu thang, hành lang, không gian chung trong nhà; phong_ngu = phòng ngủ; bep = bếp, phòng ăn; wc = nhà vệ sinh, phòng tắm; san_thuong = sân thượng, ban công, sân vườn, hồ bơi; view = cảnh nhìn ra từ nhà (thành phố, sông, công viên); hem = hẻm/đường trước nhà; khong_lien_quan = ảnh KHÔNG phải nhà đất (người, đồ ăn, xe cộ, meme, ảnh chụp màn hình không liên quan) — ảnh nhà có người đứng trong khung vẫn là ảnh nhà; giay_to = sổ hồng, sổ đỏ, giấy chứng nhận, hợp đồng mua bán, CCCD, giấy tờ có chữ in; ban_ve = bản vẽ, sơ đồ, mặt bằng, quy hoạch; khac = không rõ hoặc không thuộc loại nào; tai_lieu_du_an = BẢNG GIÁ từng căn, SƠ ĐỒ PHÂN LÔ, brochure, mặt bằng tầng, bảng thông số dự án (chữ và số dạng bảng / sơ đồ in sẵn — KHÔNG phải ảnh chụp căn nhà, KHÔNG phải sổ đỏ)",
  ),
  khen: z.string().nullable().describe("MỘT điểm mạnh THẬT nhìn thấy trong ảnh để khen chủ nhà (dưới 12 từ, ví dụ 'mặt tiền sáng, hẻm rộng xe hơi vào thoải mái'); null nếu không có gì đáng khen hoặc là giấy tờ. Không bịa."),
  mo_ta: z.string().describe("Một câu dưới 15 từ tả điều THẤY được; đoán thì mở bằng 'hình như'. Không suy diễn vật liệu/pháp lý."),
  giay_to: z.object({
    // SRS-5.1zzzzzs (chủ dự án 13/10/2026: "làm sao cho nó biết sổ đỏ sổ hồng khác nhau"): đọc theo TIÊU ĐỀ in trên bìa, không đoán theo màu ảnh.
    loai_giay: z.string().nullable().describe(
      "'sổ đỏ' = bìa in \"Giấy chứng nhận quyền sử dụng đất\" (mẫu cũ, bìa đỏ, chỉ đất); " +
      "'sổ hồng' = bìa in \"Giấy chứng nhận quyền sở hữu nhà ở và quyền sử dụng đất ở\" (bìa hồng cũ) HOẶC mẫu từ 2009 \"Giấy chứng nhận quyền sử dụng đất, quyền sở hữu nhà ở và tài sản khác gắn liền với đất\" (bìa hồng); " +
      "'hợp đồng mua bán' / 'vi bằng' / 'giấy tay' / 'giấy phép xây dựng' / 'giấy tờ khác'. Đọc theo chữ TIÊU ĐỀ, không đoán theo màu.",
    ),
    dong_so_huu: z.boolean().nullable().optional().describe("true khi bìa ghi 'cùng sử dụng đất' / 'đồng sở hữu' / 'cùng sở hữu' (sổ chung); false khi một chủ; null khi không đọc được. KHÔNG ghi tên."),
    dien_tich_m2: z.number().nullable().describe("Diện tích ĐỌC ĐƯỢC trên giấy (m2), null nếu không thấy rõ"),
    dia_chi: z.string().nullable().describe("Địa chỉ thửa đất đọc được (đường, phường, quận), null nếu không rõ"),
    so_thua: z.string().nullable(),
    so_to: z.string().nullable(),
    ro_net: z.boolean().describe("true khi chữ trên giấy đọc được rõ"),
  }).nullable().describe("CHỈ điền khi loai = giay_to. TUYỆT ĐỐI không ghi tên người, số CCCD, ngày sinh."),
  // SRS-5.1zzzzzn (chủ dự án 13/10/2026: câu báo nhận ảnh sổ "phần này để AI quyết"): lời em nhắn chủ nhà khi nhận ảnh giấy tờ — model
  // viết, code kiểm (`loiNhanGiayToHopLe`: số trong lời phải là số đọc trên giấy / số đang ghi, không hỏi); không qua thì câu soạn sẵn.
  loi_nhan: z.string().nullable().optional().describe("CHỈ khi loai = giay_to: 1–2 câu ngắn em nhắn chủ nhà, xưng em, gọi chủ nhà đúng cách gọi trong ngữ cảnh: đã nhận ảnh giấy tờ, em cất riêng không đưa lên web; đọc được diện tích thì nói sổ ghi bao nhiêu và so với diện tích đang ghi trong ngữ cảnh (khớp, hay chưa ghi thì em lấy số trên sổ). Không hỏi, không khen, không tên người, không số nào ngoài diện tích. Không phải giấy tờ → null."),
});
export type PhanLoaiAnh = z.infer<typeof AnhSchema>;

// Chuỗi này nằm trong system prompt để bộ e2e (mock model) nhận ra lượt phân
// loại ảnh và trả kịch bản ảnh thay vì kịch bản người mua. Đổi chữ thì đổi cả
// `bot/tests/e2e/run.mjs`.
export const DAU_HIEU_PHAN_LOAI_ANH = "PHÂN LOẠI ẢNH CHỦ NHÀ GỬI";
export const ANH_FORMAT = zodOutputFormat(AnhSchema);

type ModelLike = {
  messages: {
    parse: (p: unknown) => Promise<{ stop_reason?: string | null; parsed_output?: unknown; usage?: unknown }>;
  };
};

/**
 * Hỏi model một tấm ảnh là gì. Trả null khi model từ chối / trả rỗng — tầng gọi
 * quyết định cất ở đâu (không rõ thì cất RIÊNG TƯ, không phục vụ ai).
 */
export async function phanLoaiAnh(
  anthropic: ModelLike, model: string, imageUrl: string, boiCanh: string,
): Promise<{ kq: PhanLoaiAnh | null; usage: unknown }> {
  const resp = await anthropic.messages.parse({
    model,
    max_tokens: 400,
    output_config: { effort: "low", format: ANH_FORMAT },
    system: [{
      type: "text",
      text: `${DAU_HIEU_PHAN_LOAI_ANH}. Bạn là người soát ảnh của một văn phòng môi giới nhà đất Sài Gòn. ` +
        `Phân loại tấm ảnh chủ nhà vừa gửi và tả ngắn điều thấy được. Đoán thì nói "hình như". ` +
        `Ảnh giấy tờ: đọc diện tích, địa chỉ thửa, số thửa, số tờ nếu rõ; KHÔNG ghi tên người, CCCD, ngày sinh; viết loi_nhan nhắn chủ nhà. ` +
        `Không suy diễn vật liệu, pháp lý hay tình trạng từ ảnh.`,
      cache_control: { type: "ephemeral" },
    }],
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "url", url: imageUrl } },
        { type: "text", text: `Ngữ cảnh tin rao: ${boiCanh || "(chưa có)"}. Tấm ảnh này là gì?` },
      ],
    }],
  });
  if (resp.stop_reason === "refusal" || !resp.parsed_output) return { kq: null, usage: resp.usage };
  const kq = resp.parsed_output as PhanLoaiAnh;
  if (!LOAI_ANH.includes(kq.loai)) return { kq: null, usage: resp.usage };
  return { kq, usage: resp.usage };
}

/** Diện tích trên sổ lệch với diện tích chủ nhà nói? Trả % lệch, null khi thiếu số. */
export function lechDienTich(soM2: number | null | undefined, noiM2: number | null | undefined): number | null {
  if (!soM2 || !noiM2 || soM2 <= 0 || noiM2 <= 0) return null;
  return Math.round(Math.abs(soM2 - noiM2) / noiM2 * 100);
}
