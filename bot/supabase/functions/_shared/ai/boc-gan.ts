// BÓC "KHÁCH MUỐN Ở GẦN ĐÂU" BẰNG MODEL — hiểu NGHĨA, không bắt chữ (11/09/2026).
//
// Người dùng 11/09: "không phải là gần bệnh viện 1 câu mà nó phải hiểu nghĩa …,
// vì nó đã có thông tin vị trí các dự án, các tiện ích ở trong rồi". Regex
// `docGanTienIch` chỉ bắt "gần <5 loại>"; khách thật nói "tiện đi khám bệnh",
// "con sắp vào lớp 1", "chỗ làm ở Landmark 81", "quanh Ehome 3".
//
// VÌ SAO CHỖ NÀY ĐƯỢC DÙNG MODEL (khác giá / diện tích / phường của tin rao):
//   · Kết quả KHÔNG ghi vào kho tin. Nó là BỘ LỌC gợi ý căn cho người mua, nằm
//     trong hồ sơ `buyers.preferences` — hồ sơ vốn đã do model bóc (BuyerTurn).
//     Sai thì khách thấy căn chưa sát ý và nói lại; không tin nào bị ghi sai.
//   · Toạ độ mốc và khoảng cách vẫn là SQL tiền định (`tin_gan_moc`): model chỉ
//     nói "khách muốn gần cái gì", không bao giờ tự nói "căn này cách 800 m".
//
// KHI NÀO GỌI: câu có mùi vị trí (`coMuiViTri`). Model hỏng → nơi gọi rơi về regex.
// Tầng này KHÔNG ghi DB (luật `bot/tests/ranh-gioi.mjs`).

import { z } from "npm:zod@4";
import { dinhDangLong, docLong } from "./doc-long.ts";
import {
  BAN_KINH_GAN_M, BAN_KINH_TOI_DA_M, coMuiViTri, type GanTienIch, kdTen, thoatRe,
} from "../extraction/tien-ich.ts";
export { coMuiViTri };

const GanBoc = z.object({
  muon_gan: z.boolean()
    .describe("true CHỈ khi khách đặt ĐIỀU KIỆN tìm nhà ở gần một nơi. Khách hỏi một căn cụ thể có gần gì không thì false."),
  loai: z.enum(["benh_vien", "truong_hoc", "cho", "sieu_thi", "cong_vien", "du_an", "dia_diem"]).nullable(),
  ten: z.string().nullable()
    .describe("Tên riêng nguyên văn khách gõ, KHÔNG kèm chữ chỉ loại ('Chợ Rẫy', 'Aeon Bình Tân', 'Landmark 81', 'Ehome 3'). Chỉ nói loại chung thì null."),
  cap_truong: z.enum(["mam_non", "tieu_hoc", "thcs", "thpt", "dai_hoc"]).nullable()
    .describe("Chỉ khi loai = truong_hoc và khách nói rõ cấp học (hoặc tuổi/lớp của con)."),
  ban_kinh_m: z.number().nullable().describe("Bán kính khách muốn, đổi ra mét. Chỉ nói 'gần' mà không có số thì null."),
  bo_dieu_kien: z.boolean().describe("true khi khách GỠ điều kiện vị trí đã nói ('thôi khỏi cần gần trường nữa')."),
});
export type GanBocLLM = z.infer<typeof GanBoc>;

const FORMAT_GAN = dinhDangLong(GanBoc);

const LUAT = `Bạn đọc MỘT tin nhắn của khách đang tìm mua/thuê nhà và cho biết: khách có muốn nhà ở GẦN một nơi cụ thể không.
Hiểu theo NGHĨA, không cần đúng chữ "gần". Ví dụ:
- "tiện đi khám bệnh" → benh_vien
- "con sắp vào lớp 1, muốn gần trường" → truong_hoc, cap_truong tieu_hoc
- "đi bộ ra chợ được là được" → cho, ~600 m
- "gần chỗ làm ở Landmark 81" → dia_diem "Landmark 81"
- "nhà nào quanh Ehome 3" → du_an "Ehome 3"
- "gần Aeon Bình Tân" → sieu_thi "Aeon Bình Tân"
- "gần bv Chợ Rẫy tầm 2km" → benh_vien "Chợ Rẫy", 2000
- "khu yên tĩnh gần chợ xe hơi vào được nhà" → cho, ten null ("xe hơi vào được nhà" tả căn nhà, không phải tên chợ)
Loại: benh_vien (bệnh viện, trạm y tế), truong_hoc, cho, sieu_thi (siêu thị, trung tâm thương mại, Coopmart, Aeon, Bách Hóa Xanh…), cong_vien, du_an (khu căn hộ / khu đô thị có tên), dia_diem (nơi có tên khác: toà nhà văn phòng, công ty, sân bay, bến xe, nhà thờ, chùa…).
Bán kính: khách nói số thì đổi ra mét (1km = 1000, 2 cây số = 2000, 5 phút đi bộ ≈ 400, 10 phút chạy xe ≈ 3000). "sát / kế bên / đối diện" ≈ 300. "đi bộ được" ≈ 600. Chỉ nói "gần" thì null.
KHÔNG phải điều kiện vị trí (muon_gan = false):
- khách HỎI một căn cụ thể có gần gì không ("căn đó gần chợ không em") — đó là câu hỏi, không phải điều kiện tìm;
- "gần 5 tỷ", "gần đây", "dạo gần đây", "gần xong";
- chỉ nêu phường/quận ("ở quận 8") — khu vực đã có chỗ khác ghi.
Tên: chỉ lấy tên CÓ TRONG CÂU, không tự thêm, không sửa chính tả. Không chắc thì muon_gan = false.`;

// Cấp trường → bộ lọc tên (OSM ghi "Trường THCS…" lẫn "Trung học cơ sở…").
const CAP_RE: Record<NonNullable<GanBocLLM["cap_truong"]>, string> = {
  mam_non: "mam non|mau giao|nha tre",
  tieu_hoc: "tieu hoc",
  thcs: "thcs|trung hoc co so",
  thpt: "thpt|trung hoc pho thong",
  dai_hoc: "dai hoc|cao dang",
};

/** Kết quả model → điều kiện lọc. Không đủ để lọc (dự án/địa danh mà không tên) → null. */
export function thanhGan(k: GanBocLLM): GanTienIch | null {
  if (!k.muon_gan || !k.loai) return null;
  const ten = lamSachTenMoc(k.loai, k.ten);
  if ((k.loai === "du_an" || k.loai === "dia_diem") && !ten) return null;
  const tenKd = ten ? kdTen(ten) : "";
  const ten_re = tenKd
    ? thoatRe(tenKd)
    : k.loai === "truong_hoc" && k.cap_truong ? CAP_RE[k.cap_truong] : null;
  const m = Math.min(BAN_KINH_TOI_DA_M, Math.max(100, Math.round(k.ban_kinh_m ?? BAN_KINH_GAN_M)));
  return { loai: k.loai, ten, ten_re, m };
}

// Chữ chỉ LOẠI đứng đầu tên ("chợ Bình Tây" → "Bình Tây") và tên mốc là chữ tả CĂN NHÀ chứ không
// phải nơi chốn. 20/09/2026 (bắn thật mau-y-C): "gần chợ xe hơi vào được nhà" → model trả tên
// "chợ xe hơi" → hồ sơ in "chợ chợ xe hơi, trong ~600 m".
const TU_LOAI_DAU = /^(?:cho|sieu thi|benh vien|bv|truong|truong hoc|cong vien|du an|khu)\s+/;
const KHONG_PHAI_TEN = /\b(?:xe hoi|o to|oto|vao (?:duoc|tan|toi|trong)|vao nha|gara|hem|phong ngu|pn|ty|trieu|m2)\b/;
export function lamSachTenMoc(loai: GanBocLLM["loai"], tenTho: string | null | undefined): string | null {
  let ten = (tenTho ?? "").trim();
  if (!ten) return null;
  if (loai !== "du_an" && loai !== "dia_diem") {
    const kd = kdTen(ten);
    const m = TU_LOAI_DAU.exec(kd);
    if (m) ten = ten.slice(m[0].length).trim();
    if (!ten || KHONG_PHAI_TEN.test(kdTen(ten))) return null;
  }
  return ten || null;
}

type ClientModel = {
  messages: {
    parse: (p: Record<string, unknown>) => Promise<{ parsed_output?: unknown; usage?: unknown }>;
  };
};

/**
 * Hỏi model khách muốn ở gần đâu. Trả `null` khi KHÔNG gọi (câu không có mùi
 * vị trí) hoặc model hỏng — nơi gọi rơi về regex. `dieuKienCu` là nhãn điều
 * kiện đã lưu, để model hiểu "thôi khỏi cần" đang gỡ cái gì.
 * Không ném.
 */
export async function bocGanBangModel(
  ai: ClientModel,
  model: string,
  text: string,
  dieuKienCu: string | null = null,
): Promise<{ ket: GanBocLLM | null; usage: unknown } | null> {
  if (!coMuiViTri(text)) return null;
  try {
    const r = await ai.messages.parse({
      model,
      max_tokens: 300,
      output_config: { effort: "low", format: FORMAT_GAN },
      system: [{ type: "text", text: LUAT, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `${dieuKienCu ? `Điều kiện vị trí khách đã nói trước đó: ${dieuKienCu}\n` : ""}Tin nhắn khách: "${
          text.slice(0, 400)
        }"`,
      }],
    });
    const ket = docLong(GanBoc, r.parsed_output);
    return { ket: ket.success ? ket.data : null, usage: r.usage };
  } catch {
    return null;
  }
}
