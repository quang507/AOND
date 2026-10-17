// doc-tai-lieu-du-an.ts — đọc BẢNG GIÁ / PHÂN LÔ / BROCHURE / MẶT BẰNG của một dự án bằng model có mắt
// (05/10/2026, SRS-5.1zzj — theo demo AOND `extract_media` / `import_price_list`).
//
// Kết quả là DỮ KIỆN chép từ tài liệu: mẫu nhà (thông số chung cho mọi căn cùng mẫu) và từng căn theo
// mã lô. Code ghi vào `du_an_can` (kho CĂN DỰ ÁN, chung cho mọi người bán) — không phải tin của người
// gửi. Giá trong bảng giá là giá CHỦ ĐẦU TƯ niêm yết, không phải giá người bán rao: không tự điền vào
// `price_raw` của tin, chỉ để model nhắc "bảng giá ghi …".
import { z } from "npm:zod@4";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";

export const LOAI_TAI_LIEU = ["bang_gia", "phan_lo", "brochure", "mat_bang", "khac"] as const;
export type LoaiTaiLieu = (typeof LOAI_TAI_LIEU)[number];

const CanDoc = z.object({
  ma_can: z.string().describe("Mã căn / mã lô chép NGUYÊN như in (A5, LK-12, B2.07, 1205). Không có mã thì bỏ căn đó."),
  mau_nha: z.string().nullable().describe("Tên mẫu nhà / loại căn của căn này nếu tài liệu ghi (Cosmo Gen 2, 2PN, Shophouse)."),
  dien_tich: z.string().nullable().describe("Diện tích (xây dựng / thông thuỷ) chép nguyên chữ kèm đơn vị, ví dụ '75.5m2'."),
  dien_tich_dat: z.string().nullable().describe("Diện tích ĐẤT nếu có cột riêng (phân lô), chép nguyên."),
  gia: z.string().nullable().describe("Giá niêm yết chép NGUYÊN chữ ('3,2 tỷ', '45 tr/m2', '2.150.000.000'). Không quy đổi."),
  huong: z.string().nullable(),
  tang: z.string().nullable().describe("Tầng (căn hộ) nếu có."),
  ghi_chu: z.string().nullable().describe("Ghi chú in cạnh căn (góc, view hồ, đã bán…), dưới 12 từ."),
});
const MauNhaDoc = z.object({
  ten: z.string(),
  thong_so: z.string().nullable().describe("Thông số chung của mẫu, một dòng: số tầng, số phòng ngủ, mặt tiền, diện tích đất/sàn…"),
});
export const TaiLieuSchema = z.object({
  loai: z.enum(LOAI_TAI_LIEU).describe("bang_gia = bảng giá từng căn; phan_lo = bản đồ / sơ đồ phân lô; brochure = tài liệu giới thiệu; mat_bang = mặt bằng tầng / căn; khac = không phải tài liệu dự án."),
  ten_du_an: z.string().nullable().describe("Tên dự án in trên tài liệu, null nếu không thấy."),
  chu_dau_tu: z.string().nullable(),
  mau_nha: z.array(MauNhaDoc).describe("Các mẫu nhà / loại căn tài liệu mô tả. Rỗng nếu không có."),
  can: z.array(CanDoc).describe("Từng căn ĐỌC ĐƯỢC. Tối đa 200. Chữ mờ không chắc thì bỏ, không đoán."),
  tien_ich: z.array(z.string()).describe("Tiện ích dự án in trên tài liệu (hồ bơi, công viên…), tối đa 12."),
  ghi_chu: z.string().nullable().describe("Một câu dưới 25 từ về tài liệu (vd 'bảng giá đợt 2, tháng 6/2026')."),
  ro_net: z.boolean().describe("true khi chữ số trên tài liệu đọc được rõ."),
});
export type TaiLieuDoc = z.infer<typeof TaiLieuSchema>;

// Chuỗi này nằm trong system prompt để bộ e2e (mock model) nhận ra lượt đọc tài liệu. Đổi chữ thì đổi `bot/tests/e2e/run.mjs`.
export const DAU_HIEU_DOC_TAI_LIEU = "ĐỌC TÀI LIỆU DỰ ÁN";
const FORMAT = zodOutputFormat(TaiLieuSchema);

const LUAT = `${DAU_HIEU_DOC_TAI_LIEU} — bạn đọc một tài liệu bất động sản do người bán gửi (bảng giá, bản phân lô, brochure, mặt bằng).
Chép ĐÚNG những gì in trên tài liệu, không suy diễn, không bổ sung kiến thức ngoài. Ô nào tài liệu không ghi thì null.
Mã căn / mã lô chép nguyên ký tự. Giá chép nguyên chữ kèm đơn vị, không quy đổi. Mỗi căn một dòng; bảng nhiều trang thì đọc hết.
TUYỆT ĐỐI không ghi tên người, số điện thoại, số CCCD dù tài liệu có in.
Nếu đây không phải tài liệu dự án (ảnh nhà, sổ đỏ, giấy tờ cá nhân, ảnh người…) thì loai = khac và can rỗng.`;

type ClientModel = {
  messages: { parse: (p: Record<string, unknown>) => Promise<{ parsed_output?: unknown; usage?: unknown }> };
};

export type NguonTaiLieu =
  | { kind: "anh_url"; url: string }
  | { kind: "anh_b64"; data: string; mime: string }
  | { kind: "pdf_b64"; data: string };

/** Hỏi model. `kq` null = model trả không đọc được. Model hỏng thì NÉM (nơi gọi ghi sổ). */
export async function docTaiLieuDuAn(
  ai: ClientModel,
  model: string,
  nguon: NguonTaiLieu,
  goiY: string | null,
): Promise<{ kq: TaiLieuDoc | null; usage: unknown }> {
  const khoi = nguon.kind === "anh_url"
    ? { type: "image", source: { type: "url", url: nguon.url } }
    : nguon.kind === "anh_b64"
    ? { type: "image", source: { type: "base64", media_type: nguon.mime, data: nguon.data } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: nguon.data } };
  const r = await ai.messages.parse({
    model,
    max_tokens: 6000,
    output_config: { effort: "medium", format: FORMAT },
    system: [{ type: "text", text: LUAT, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [
        khoi,
        { type: "text", text: `Đọc tài liệu này.${goiY ? ` Gợi ý từ hội thoại (chỉ để hiểu, không chép vào nếu tài liệu không in): ${goiY.slice(0, 300)}` : ""}` },
      ],
    }],
  });
  const o = r.parsed_output;
  if (!o || typeof o !== "object") return { kq: null, usage: r.usage };
  const p = TaiLieuSchema.safeParse(o);
  if (!p.success) return { kq: null, usage: r.usage };
  const kq = p.data;
  // Lưới: mã căn trống / trùng → bỏ; cắt 200; chữ có dáng SĐT thì gọt khỏi mọi ô chữ (§5).
  const daThay = new Set<string>();
  const sdt = /(?:\+?84|0)\d{8,10}/g;
  const got = (s: string | null) => (s ? s.replace(sdt, "…").trim() || null : null);
  kq.can = kq.can.filter((c) => {
    const ma = c.ma_can.trim();
    if (!ma || daThay.has(ma.toLowerCase())) return false;
    daThay.add(ma.toLowerCase());
    return true;
  }).slice(0, 200).map((c) => ({ ...c, ma_can: c.ma_can.trim(), ghi_chu: got(c.ghi_chu), mau_nha: got(c.mau_nha) }));
  kq.mau_nha = kq.mau_nha.slice(0, 20).map((m) => ({ ten: m.ten.trim(), thong_so: got(m.thong_so) }));
  kq.ten_du_an = got(kq.ten_du_an);
  kq.chu_dau_tu = got(kq.chu_dau_tu);
  kq.ghi_chu = got(kq.ghi_chu);
  return { kq, usage: r.usage };
}
