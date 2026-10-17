// TRỢ LÝ CÓ CÔNG CỤ — nhánh người mua (02/10/2026, chủ dự án: "mày để nó tương tác như 1 chatbot gắn crm bình thường…
// nghe hiểu các yêu cầu của khách, và ghi lại vào crm" → "làm trợ lý có công cụ đi"). docs/07 SRS-5.1y.
//
// Model viết thẳng lời nhắn cho khách (không JSON) và GỌI CÔNG CỤ khi cần làm gì đó:
//   · công cụ ĐỌC chạy thật ngay trong lượt (tra tiện ích quanh một khu, xem chi tiết một căn) — kết quả trả lại model
//     để nó trả lời theo dữ liệu thật, và đưa ra ngoài (`duLieu`) để các lưới chặn bịa của chat-reply coi là ngữ cảnh;
//   · công cụ GHI không đụng DB ở đây: chúng gom thành đúng khuôn `LuotMua` mà đường cũ vẫn xử lý (hồ sơ, hẹn xem, hỏi chủ,
//     gửi hình, chốt, hẹn báo lại, báo người phụ trách) — nên mọi lưới chặn đã có sau lượt model vẫn chạy y nguyên.
// Code kiểm trích dẫn: công cụ ghi điều KHÁCH nói (hồ sơ, giờ hẹn, chốt, lời hứa) phải kèm cụm COPY từ lời khách —
// không có trong lời khách thì không ghi, trả lỗi cho model biết.
//
// Tầng này KHÔNG import SDK lẫn DB (luật `bot/tests/ranh-gioi.mjs`): hàm gọi model và hàm đọc dữ liệu đều do nơi gọi
// truyền vào, nên `bot/tests/tro-ly.mjs` chạy được bằng bun với model giả.
import { giaTriCoTrongLoi, tachGop, trichCoTrongTin } from "../extraction/kiem-bang-chung.ts";

export type KhoiNoiDung = { type: string; [k: string]: unknown };
export type DungLuong = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};
export type PhanHoiModel = { content: KhoiNoiDung[]; stop_reason?: string | null; usage?: DungLuong | null };
export type GoiModel = (p: Record<string, unknown>) => Promise<PhanHoiModel>;
export type TenDoc = "tim_tien_ich_quanh" | "xem_can";
export type DocCongCu = (ten: TenDoc, input: Record<string, unknown>) => Promise<string>;

/** Cùng khuôn `LuotMua` của chat-reply — đường xử lý sau lượt model đọc đúng các khoá này. */
export type LuotMuaTroLy = {
  profile: Record<string, unknown>;
  replies: string[];
  promise?: { when: string; what: string } | null;
  viewing?: { listing_code: string | null; when: string; phone: string | null } | null;
  ask_owner?: { listing_code: string | null; question: string } | null;
  agreed_deal?: { listing_code: string | null } | null;
  send_photos?: string | null;
  need_human?: boolean;
  voice_request?: boolean;
};

/** Khoá hồ sơ mua — trùng `BuyerTurn.profile` của chat-reply. */
export const KHOA_HO_SO = [
  "deal", "area", "budget", "purpose", "property_type", "bedrooms", "alley", "timeline", "notes",
  "khu_song", "nguoi_o_cung", "noi_lam", "dien_tich_mong_muon", "thang_may", "nguoi_quyet_dinh", "can_vay", "name",
  // SRS-5.1zzzzb (bắn production 09/10/2026): "có căn nào 2 lầu không em" — hồ sơ không có ô số tầng, trợ lý gọi ghi hai lần,
  // lần đầu bị từ chối (khoá lạ), yêu cầu "2 lầu" rơi mất trong khi lời bot nói "em đang lọc căn 2 lầu".
  "so_tang",
] as const;
const LOAI_TIEN_ICH = ["benh_vien", "truong_hoc", "cho", "sieu_thi", "cong_vien", "tat_ca"] as const;

const chuoi = { type: "string" } as const;
const trichDan = { type: "string", description: "Cụm COPY NGUYÊN VĂN từ lời khách làm chứng — không sửa, không ghép hai chỗ." } as const;

export const CONG_CU_MUA = [
  {
    name: "tim_tien_ich_quanh",
    description:
      "ĐỌC: liệt kê bệnh viện / trường học / chợ / siêu thị / công viên quanh một khu vực khách nói (đường, phường, địa danh, " +
      "dự án, mã căn). Gọi khi khách hỏi 'quanh đó có trường/chợ gì', 'gần bệnh viện nào'. Khoảng cách là đường chim bay, ước tính.",
    input_schema: {
      type: "object",
      properties: {
        khu_vuc: { type: "string", description: "Khu vực nguyên văn khách nói, kèm quận nếu khách có nói." },
        loai: { type: "string", enum: [...LOAI_TIEN_ICH] },
        ban_kinh_m: { type: "integer", description: "Bán kính mét (300–3000), mặc định 1000." },
        cap_truong: {
          type: "string", enum: ["mam_non", "tieu_hoc", "thcs", "thpt", "dai_hoc"],
          description: "Chỉ khi loai = truong_hoc và khách hỏi ĐÚNG một cấp (mầm non / tiểu học / THCS / THPT / đại học).",
        },
      },
      required: ["khu_vuc", "loai"],
    },
  },
  {
    name: "xem_can",
    description: "ĐỌC: chi tiết một căn trong kho theo mã (thông số, điều đã xác minh từ chủ, số hình, tiện ích quanh căn).",
    input_schema: { type: "object", properties: { ma_can: { type: "string", description: "Mã căn, không có # đầu." } }, required: ["ma_can"] },
  },
  {
    name: "ghi_ho_so_mua",
    description:
      "GHI vào hồ sơ khách điều khách NÓI RÕ về nhu cầu (khu vực, giá, loại nhà, phòng ngủ, số tầng / lầu, hẻm, mục đích, mốc dọn vào, " +
      "người ở cùng, nơi làm…). Không suy diễn. deal: 'ban' = khách muốn MUA, 'thue' = muốn THUÊ. can_vay: 'có' / 'không'.",
    input_schema: {
      type: "object",
      properties: {
        truong: {
          type: "array",
          items: {
            type: "object",
            properties: { khoa: { type: "string", enum: [...KHOA_HO_SO] }, gia_tri: chuoi, trich_dan: trichDan },
            required: ["khoa", "gia_tri", "trich_dan"],
          },
        },
      },
      required: ["truong"],
    },
  },
  {
    name: "hen_xem_nha",
    description: "GHI lịch xem nhà khi khách chốt/đề nghị một khung giờ cụ thể.",
    input_schema: {
      type: "object",
      properties: {
        ma_can: { type: ["string", "null"] }, khi: { type: "string", description: "Khung giờ nguyên văn ('mai 9h sáng')." },
        sdt: { type: ["string", "null"], description: "SĐT khách TỰ cho; không có thì null. Không bao giờ xin." }, trich_dan: trichDan,
      },
      required: ["ma_can", "khi", "trich_dan"],
    },
  },
  {
    name: "hoi_chu_nha",
    description: "GHI việc hỏi chủ nhà một điều về MỘT căn (khi em hứa 'để em hỏi lại chủ nhà').",
    input_schema: {
      type: "object",
      properties: { ma_can: { type: ["string", "null"] }, cau_hoi: { type: "string", description: "Điều cần hỏi, ngắn gọn." } },
      required: ["ma_can", "cau_hoi"],
    },
  },
  {
    name: "gui_hinh",
    description: "GHI: gửi hình một căn kèm tin này — chỉ khi khách xin hình và căn có hình sẵn.",
    input_schema: { type: "object", properties: { ma_can: { type: "string" } }, required: ["ma_can"] },
  },
  {
    name: "chot_can",
    description: "GHI: khách vừa ĐỒNG Ý chốt căn em đề nghị ngay tin trước (theo AGREE_RULES).",
    input_schema: { type: "object", properties: { ma_can: { type: ["string", "null"] }, trich_dan: trichDan }, required: ["ma_can", "trich_dan"] },
  },
  {
    name: "hen_bao_lai",
    description: "GHI: khách chủ động hứa sẽ gửi/báo gì đó vào một mốc thời gian (để nhắc).",
    input_schema: {
      type: "object",
      properties: { khi: { type: "string" }, viec: { type: "string" }, trich_dan: trichDan },
      required: ["khi", "viec", "trich_dan"],
    },
  },
  {
    name: "bao_nguoi_phu_trach",
    description:
      "GHI: nhờ người thật bên em vào — khách đòi gặp người thật / quản lý, bức xúc thật sự, đàm phán giá tới hồi kết, đã " +
      "'để em hỏi lại' 2 lần cùng một chuyện, hoặc khách muốn GỌI ĐIỆN (goi_dien = true).",
    input_schema: {
      type: "object",
      properties: { ly_do: { type: "string" }, goi_dien: { type: "boolean" } },
      required: ["ly_do", "goi_dien"],
    },
  },
] as const;

const TEN_DOC = new Set<string>(["tim_tien_ich_quanh", "xem_can"]);

/** Lời dặn đầu ra cho chế độ trợ lý — thay khối `DAU_RA_JSON` trong system của nhánh mua. */
export const DAU_RA_CONG_CU =
  "ĐẦU RA (chế độ trợ lý có công cụ): viết THẲNG lời nhắn gửi khách bằng chữ thường, 1-2 bong bóng cách nhau một dòng " +
  "trống — KHÔNG JSON, không markdown. Việc cần làm thì GỌI CÔNG CỤ; các trường JSON nhắc trong hướng dẫn ở trên ứng với " +
  "công cụ: profile → ghi_ho_so_mua; viewing → hen_xem_nha; ask_owner → hoi_chu_nha; send_photos → gui_hinh; agreed_deal → " +
  "chot_can; promise → hen_bao_lai; need_human / voice_request → bao_nguoi_phu_trach (goi_dien). " +
  "Khách nhờ TRA CỨU (quanh khu X có trường / chợ / bệnh viện gì; căn mã nào chi tiết ra sao) thì gọi công cụ ĐỌC trước, " +
  "trả lời đúng theo kết quả; kết quả nói không có dữ liệu thì nói thật, KHÔNG tự kể tên nơi chốn hay khoảng cách. " +
  "Công cụ GHI: viết lời nhắn cho khách VÀ gọi công cụ trong CÙNG một lượt. Công cụ có trich_dan thì trích phải COPY " +
  "nguyên văn lời khách — khách chưa nói thì đừng gọi. " +
  // SRS-5.1zzzzzh (bắn production 12/10, thu-kb-mua): sau lượt gọi ghi_ho_so_mua, lời cuối chỉ còn "Dạ anh chị. Em ghi nhận rồi ạ." — không phản
  // hồi điều khách vừa nói, không hỏi gì, cuộc chat chết; lượt khách muốn dừng thì model lại viết ghi chú nội bộ ra lời.
  "Lời nhắn là lời NÓI VỚI KHÁCH: phản hồi đúng điều khách vừa nói, hồ sơ còn thiếu thì kết bằng MỘT câu hỏi nhu cầu còn thiếu (khách " +
  "muốn dừng / suy nghĩ thêm thì chào ngắn, không hỏi). KHÔNG viết ghi chú, tóm tắt hồ sơ hay lý do của em vào lời nhắn.";

// SRS-5.1zzzzzh: lệnh cuối tin user của nhánh mua — đường JSON đòi "cập nhật hồ sơ" (ra trường JSON); chế độ trợ lý chỉ đòi lời nói với khách.
export const LENH_CUOI_JSON = `\nSoạn lượt trả lời tiếp theo của EM và cập nhật hồ sơ:`;
export const LENH_CUOI_TRO_LY = `\nSoạn lời nhắn gửi khách (chỉ lời nói với khách — không viết ghi chú, hồ sơ hay lý do); việc cần ghi thì gọi công cụ.`;
/** Thay lệnh cuối của tin user (đường JSON) bằng lệnh cho chế độ trợ lý — giữ nguyên mọi phần khác. */
export function doiLenhCuoiTroLy<T extends { content: Array<Record<string, unknown>> }>(messages: T[]): T[] {
  return messages.map((m) => ({
    ...m,
    content: m.content.map((c) => (typeof c.text === "string" && c.text.endsWith(LENH_CUOI_JSON)
      ? { ...c, text: c.text.slice(0, -LENH_CUOI_JSON.length) + LENH_CUOI_TRO_LY }
      : c)),
  }));
}
const LY_DO_TRICH = "trich_dan không có trong lời khách — KHÔNG ghi. Chỉ ghi điều khách đã nói, trích đúng nguyên văn.";
const LY_DO_GIA_TRI = "gia_tri có chữ khách KHÔNG nói — chỉ dùng chữ của khách (viết lại có dấu được), không thêm ý.";
// Kiểm giá trị chữ nằm ở tầng tiền định (`kiem-bang-chung.ts`) — đường JSON cũ dùng chung. Xuất lại cho bài kiểm cũ.
export { giaTriCoTrongLoi };

const chu = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const maHoacNull = (v: unknown): string | null => {
  const s = chu(v).replace(/^#/, "").toUpperCase();
  return /^[A-Z0-9-]{3,40}$/.test(s) ? s : null;
};
const soTrongChu = (s: string) => s.replace(/\D/g, "");

/** Áp một công cụ GHI vào khuôn lượt. Trả chữ cho tool_result và cờ lỗi. */
export function apCongCuGhi(
  out: LuotMuaTroLy,
  ten: string,
  input: Record<string, unknown>,
  loiKhach: string,
): { ket: string; loi: boolean } {
  const coTrich = (td: unknown) => trichCoTrongTin(chu(td), loiKhach);
  switch (ten) {
    case "ghi_ho_so_mua": {
      const ds = Array.isArray(input.truong) ? input.truong as Array<Record<string, unknown>> : [];
      const ghi: string[] = [], bo: string[] = [];
      for (const t of ds) {
        const khoa = chu(t.khoa);
        const gt = chu(t.gia_tri);
        if (!(KHOA_HO_SO as readonly string[]).includes(khoa) || !gt) { bo.push(`${khoa || "?"}: khoá/giá trị không hợp lệ`); continue; }
        if (!coTrich(t.trich_dan)) { bo.push(`${khoa}: ${LY_DO_TRICH}`); continue; }
        if (khoa !== "deal" && khoa !== "bedrooms" && khoa !== "can_vay" && !giaTriCoTrongLoi(gt, loiKhach)) {
          bo.push(`${khoa}: ${LY_DO_GIA_TRI}`);
          continue;
        }
        let v: unknown = gt;
        if (khoa === "deal") {
          if (gt !== "ban" && gt !== "thue") { bo.push("deal: chỉ nhận 'ban' hoặc 'thue'"); continue; }
        } else if (khoa === "bedrooms") {
          const n = Number(/\d{1,2}/.exec(gt)?.[0]);
          if (!(n >= 1 && n <= 20)) { bo.push("bedrooms: cần một số phòng ngủ"); continue; }
          // Bắn thật 02/10 (thu-trl-06): khách "nhà có 2 con nhỏ" → trợ lý ghi 2 phòng ngủ (trích "2 con nhỏ" có thật). Số phòng
          // ngủ chỉ nhận khi trích dẫn nói PHÒNG kèm đúng số đó.
          if (!new RegExp(`\\b${n}\\s*(?:phong|pn|p\\.?n)\\b`).test(tachGop(chu(t.trich_dan)).join(" "))) {
            bo.push(`bedrooms: ${LY_DO_TRICH} (trích dẫn phải có số phòng ngủ khách nói)`);
            continue;
          }
          v = n;
        } else if (khoa === "can_vay") {
          const g = gt.toLowerCase();
          if (/^(co|có|true)$/.test(g)) v = true;
          else if (/^(khong|không|false)$/.test(g)) v = false;
          else { bo.push("can_vay: chỉ nhận 'có' hoặc 'không'"); continue; }
        }
        out.profile[khoa] = v;
        ghi.push(khoa);
      }
      if (!ghi.length) return { ket: `Không ghi trường nào. ${bo.join("; ")}`, loi: true };
      // Có trường bị bỏ thì vẫn là LỖI dù trường khác đã ghi: lời nhắn model viết sẵn có thể đang nói "em ghi" đúng trường
      // bị bỏ (bắt ở e2e TL-E2E-02) — model phải thấy lỗi để viết lại.
      return { ket: `Đã ghi: ${ghi.join(", ")}.${bo.length ? ` Bỏ: ${bo.join("; ")}` : ""}`, loi: bo.length > 0 };
    }
    case "hen_xem_nha": {
      const khi = chu(input.khi);
      if (!khi) return { ket: "Thiếu khung giờ — hỏi khách giờ cụ thể.", loi: true };
      if (!coTrich(input.trich_dan)) return { ket: LY_DO_TRICH, loi: true };
      // SĐT chỉ nhận khi đúng dãy số đó nằm trong lời khách — model không được tự điền.
      const sdt = soTrongChu(chu(input.sdt));
      const sdtThat = sdt.length >= 9 && soTrongChu(loiKhach).includes(sdt) ? chu(input.sdt) : null;
      out.viewing = { listing_code: maHoacNull(input.ma_can), when: khi, phone: sdtThat };
      return { ket: "Đã ghi lịch xem, người phụ trách sẽ xác nhận với khách.", loi: false };
    }
    case "hoi_chu_nha": {
      const cau = chu(input.cau_hoi);
      if (!cau) return { ket: "Thiếu điều cần hỏi chủ nhà.", loi: true };
      out.ask_owner = { listing_code: maHoacNull(input.ma_can), question: cau.slice(0, 200) };
      return { ket: "Đã mở việc hỏi chủ nhà; có câu trả lời bên em báo lại khách.", loi: false };
    }
    case "gui_hinh": {
      const ma = maHoacNull(input.ma_can);
      if (!ma) return { ket: "Mã căn không hợp lệ.", loi: true };
      out.send_photos = ma;
      return { ket: "Hệ thống sẽ gửi hình nếu căn có hình sẵn.", loi: false };
    }
    case "chot_can": {
      if (!coTrich(input.trich_dan)) return { ket: LY_DO_TRICH, loi: true };
      out.agreed_deal = { listing_code: maHoacNull(input.ma_can) };
      return { ket: "Đã báo người phụ trách liên hệ gấp để chốt.", loi: false };
    }
    case "hen_bao_lai": {
      const khi = chu(input.khi), viec = chu(input.viec);
      if (!khi || !viec) return { ket: "Thiếu mốc hoặc việc.", loi: true };
      if (!coTrich(input.trich_dan)) return { ket: LY_DO_TRICH, loi: true };
      out.promise = { when: khi, what: viec.slice(0, 200) };
      return { ket: "Đã đặt nhắc đúng mốc khách hẹn.", loi: false };
    }
    case "bao_nguoi_phu_trach": {
      out.need_human = true;
      if (input.goi_dien === true) out.voice_request = true;
      return { ket: "Đã báo người phụ trách.", loi: false };
    }
  }
  return { ket: `Không có công cụ tên ${ten}.`, loi: true };
}

const SO_KHOANG_CACH = /(\d+(?:[.,]\d+)?)\s*(km|m|mét|met)(?![\p{L}\d²])/giu;
const CHU_NOI_CHON = /\b(benh vien|truong|cho|sieu thi|cong vien|cach|gan|quanh|di bo|xe may)\b/;
const metCua = (so: string, dv: string) => Number(so.replace(",", ".")) * (/^k/i.test(dv) ? 1000 : 1);
/**
 * Câu nói KHOẢNG CÁCH tới nơi chốn mà con số không có trong nguồn (kết quả công cụ, ngữ cảnh kho, lời khách). Bắn thật
 * 02/10 (thu-trl-05): "còn bệnh viện gần đó thì sao" → model KHÔNG gọi công cụ, tự kể "Bệnh viện Chợ Rẫy khoảng 500m".
 * Lệch ≤ 8% (tối thiểu 50 m) vẫn tính là cùng số (model làm tròn "~250 m" thành "300 mét"). Cụm BÁN KÍNH tìm ("trong ~1 km",
 * "bán kính 1 km" — hồ sơ khách, đầu kết quả công cụ) không phải khoảng cách tới một nơi nên không làm nguồn: e2e TL-E2E-09
 * bắt "trường Nguyễn Du khoảng 900m" lọt vì hồ sơ có "trong ~1 km".
 */
const CUM_BAN_KINH = /(?:trong|bán kính|ban kinh)\s*(?:vòng|vong|khoảng|khoang|phạm vi|pham vi)?\s*~?\s*(\d+(?:[.,]\d+)?)\s*(km|m)(?![\p{L}\d²])/giu;
export function cauKhoangCachKhongNguon(van: string, nguon: string): string[] {
  // Cụm BÁN KÍNH trong nguồn ("bán kính ~1 km") không phải khoảng cách tới một nơi — không cho làm nguồn cho "900m".
  const banKinh = [...nguon.matchAll(CUM_BAN_KINH)].map((m) => metCua(m[1], m[2]));
  const nguonSach = nguon.replace(CUM_BAN_KINH, "");
  const coSan = [...nguonSach.matchAll(SO_KHOANG_CACH)].map((m) => metCua(m[1], m[2]));
  const cau = van.split(/(?<=[.!?…])\s+|\n+/).filter(Boolean);
  return cau.filter((c) => {
    if (!CHU_NOI_CHON.test(boDauNhe(c))) return false;
    // 02/10/2026 (bắn lại D1): lời "…mấy trường khác trong khoảng 1 km" nhắc lại ĐÚNG bán kính đã tra — không phải khoảng
    // cách bịa. Cụm bán kính trong lời khớp bán kính của nguồn thì bỏ ra trước khi soi.
    const cSach = c.replace(CUM_BAN_KINH, (cum, so, dv) =>
      banKinh.some((r) => Math.abs(r - metCua(so, dv)) <= Math.max(50, r * 0.08)) ? "" : cum);
    return [...cSach.matchAll(SO_KHOANG_CACH)].some((m) => {
      const v = metCua(m[1], m[2]);
      return v > 0 && !coSan.some((x) => Math.abs(x - v) <= Math.max(50, x * 0.08));
    });
  });
}
const boDauNhe = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const NHAC_KHOANG_CACH = (cau: string[]) =>
  `[HỆ THỐNG, khách không thấy dòng này] Lời vừa soạn nêu khoảng cách chưa có nguồn: ${cau.map((c) => `"${c}"`).join("; ")}. ` +
  "Gọi tim_tien_ich_quanh để tra rồi trả lời theo kết quả; không tra được thì bỏ phần khoảng cách, đừng kể theo trí nhớ.";

/**
 * SRS-5.1zzzzu (bắn production 10/10, thu-cmp45-4): lượt chỉ có công cụ GHI, model viết "…em báo anh ngay nhé.\n\n---\n**CẬP NHẬT HỒ SƠ:**"
 * rồi gọi `ghi_ho_so_mua` — dòng dẫn cho lệnh công cụ đi thẳng tới khách. Zalo không hiển thị markdown: bỏ dòng kẻ (---, ***), dấu
 * đậm / tiêu đề; đoạn còn lại chỉ là lời dẫn kết thúc bằng ":" (không có gì theo sau nó) là lời kể việc, không phải lời nói với khách.
 */
function boLoiDanMarkdown(doan: string): string {
  const s = doan.split("\n")
    .filter((d) => !/^\s*(?:[-*_]\s*){3,}$/.test(d))
    .map((d) => d.replace(/^\s*#{1,6}\s+/, "").replace(/\*\*([^*]*)\*\*/g, "$1").replace(/__([^_]*)__/g, "$1"))
    .join("\n").trim();
  if (/:\s*$/.test(s) && !/\n/.test(s) && s.length <= 80) return "";
  // SRS-5.1zzzzzh (bắn production 12/10): "Cập nhật hồ sơ:\nKhách đang chần chừ… Lý do không hỏi tiếp: …" — đoạn mở bằng NHÃN NỘI BỘ
  // (hồ sơ / ghi chú / lý do / cập nhật / note) là ghi chép của model về khách, không phải lời nói với khách: bỏ cả đoạn. Từng dòng
  // nhãn nội bộ lẫn trong đoạn khác cũng bỏ. Gốc đã sửa ở lệnh cuối (`doiLenhCuoiTroLy`); đây là lưới khi model vẫn viết.
  const dong = s.split("\n");
  if (NHAN_NOI_BO.test(boDauNhe(dong[0]))) return "";
  return dong.filter((d) => !NHAN_NOI_BO.test(boDauNhe(d))).join("\n").trim();
}
const NHAN_NOI_BO = /^\s*(?:[-•]\s*)?(?:cap nhat ho so|ho so(?: khach| mua)?|ghi chu(?: noi bo)?|ly do(?: [^:]{0,40})?|note|profile|noi bo)\s*:/;
/** Chữ model → bong bóng: tách theo dòng trống, tối đa 2 (bong bóng thừa gộp vào bong bóng cuối). */
export function thanhBongBong(s: string): string[] {
  const ds = s.split(/\n\s*\n/).map((x) => boLoiDanMarkdown(x.trim())).filter(Boolean);
  if (ds.length <= 2) return ds;
  return [ds[0], ds.slice(1).join("\n")];
}

export type KetQuaTroLy = {
  out: LuotMuaTroLy;
  /** Kết quả các công cụ ĐỌC — lưới chặn bịa coi đây là dữ liệu thật. */
  duLieu: string[];
  /** Tên công cụ đã gọi theo thứ tự (để ghi vào payload, quan sát được). */
  congCu: string[];
  vong: number;
  usage: DungLuong[];
  /** Số lần code nhắc model vì nêu khoảng cách không nguồn / số câu bị bỏ sau khi nhắc. */
  nhac: number;
  boCau: string[];
};

/**
 * Vòng trợ lý: gọi model với công cụ, chạy công cụ, gửi kết quả về, tới khi model trả lời xong. Trả null khi không có
 * câu trả lời dùng được (model từ chối, hết vòng mà không có chữ, chữ cụt vì hết trần) — nơi gọi rơi về đường cũ.
 *
 * Model đã viết lời nhắn và chỉ gọi công cụ GHI → xong ngay, không tốn thêm một vòng chỉ để model nói "dạ".
 */
export async function chayTroLyMua(o: {
  goi: GoiModel;
  thamSo: { messages: Array<{ role: string; content: unknown }>; [k: string]: unknown };
  loiKhach: string;
  doc: DocCongCu;
  toiDaVong?: number;
  /** Ngữ cảnh model đã thấy (kho, căn khách nhắc, hội thoại) — nguồn hợp lệ cho con số khoảng cách. */
  nguCanh?: string;
  /** Gọi khi trả null — để payload bắn thử nói VÌ SAO (02/10 bắn D1: chỉ thấy "khong_ra_cau_tra_loi", không biết gì thêm). */
  baoHong?: (lyDo: string, congCu: string[], vong: number) => void;
}): Promise<KetQuaTroLy | null> {
  const out: LuotMuaTroLy = {
    profile: Object.fromEntries(KHOA_HO_SO.map((k) => [k, null])),
    replies: [],
  };
  const duLieu: string[] = [], congCu: string[] = [], usage: DungLuong[] = [];
  const messages = [...o.thamSo.messages];
  const toiDa = o.toiDaVong ?? 4;
  let vanCuoi = "";
  let nhac = 0;
  const boCau: string[] = [];
  /**
   * Lời cuối có khoảng cách không nguồn: lần đầu NHẮC model (trả `true` = đi tiếp vòng, đã đẩy tin), lần sau BỎ câu đó.
   * `ketQua` = tool_result của lượt này (lượt chỉ có công cụ ghi) — phải đi cùng tin nhắc, không được tách.
   */
  const xetKhoangCach = (r: PhanHoiModel, van: string, ketQua: unknown[], choNhac: boolean): boolean => {
    const nguon = [o.nguCanh ?? "", o.loiKhach, ...duLieu].join("\n");
    const sai = cauKhoangCachKhongNguon(van, nguon);
    if (!sai.length) return false;
    if (nhac === 0 && choNhac) {
      nhac++;
      messages.push({ role: "assistant", content: r.content });
      messages.push({ role: "user", content: [...ketQua, { type: "text", text: NHAC_KHOANG_CACH(sai) }] });
      return true;
    }
    for (const c of sai) { boCau.push(c); vanCuoi = vanCuoi.replace(c, "").replace(/\s{2,}/g, " ").trim(); }
    return false;
  };
  const hong = (lyDo: string, vong: number) => { o.baoHong?.(lyDo, congCu, vong); return null; };
  for (let vong = 1; vong <= toiDa; vong++) {
    // 02/10/2026 (bắn D1 "còn bệnh viện gần đó thì sao"): model gọi công cụ hết 4 vòng mà chưa viết lời → null → đường JSON
    // cũ (không có công cụ, không có lưới khoảng cách) kể "Bệnh viện … khoảng 800m". Vòng CUỐI cấm gọi thêm công cụ: model
    // phải trả lời bằng kết quả đã tra (hoặc nói thật chưa tra được) — hết vòng không còn là đường rơi về chỗ bịa.
    const cuoi = vong === toiDa && vong > 1;
    const r = await o.goi({ ...o.thamSo, messages, tools: CONG_CU_MUA, ...(cuoi ? { tool_choice: { type: "none" } } : {}) });
    if (r.usage) usage.push(r.usage);
    if (r.stop_reason === "refusal") return hong("tu_choi", vong);
    const van = (r.content ?? []).filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("").trim();
    if (van) vanCuoi = van;
    const dung = (r.content ?? []).filter((b) => b.type === "tool_use") as Array<
      { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    >;
    if (!dung.length) {
      if (r.stop_reason === "max_tokens" || !vanCuoi) return hong(r.stop_reason === "max_tokens" ? "het_tran_token" : "khong_co_chu", vong);
      if (xetKhoangCach(r, vanCuoi, [], vong < toiDa)) continue;
      out.replies = thanhBongBong(vanCuoi);
      return out.replies.length ? { out, duLieu, congCu, vong, usage, nhac, boCau } : hong("loi_rong", vong);
    }
    // Đầu vào công cụ bị cắt giữa chừng vì hết trần → không chạy công cụ trên dữ liệu cụt.
    if (r.stop_reason === "max_tokens") return hong("het_tran_token_giua_cong_cu", vong);
    const ketQua: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];
    let coDoc = false;
    for (const d of dung) {
      congCu.push(d.name);
      const input = d.input && typeof d.input === "object" ? d.input : {};
      if (TEN_DOC.has(d.name)) {
        coDoc = true;
        try {
          const kq = await o.doc(d.name as TenDoc, input);
          duLieu.push(kq);
          ketQua.push({ type: "tool_result", tool_use_id: d.id, content: kq });
        } catch (e) {
          ketQua.push({
            type: "tool_result", tool_use_id: d.id, is_error: true,
            content: `Tra cứu hỏng (${String((e as Error)?.message ?? e).slice(0, 120)}) — nói thật là em chưa tra được, đừng đoán.`,
          });
        }
      } else {
        const { ket, loi } = apCongCuGhi(out, d.name, input, o.loiKhach);
        ketQua.push({ type: "tool_result", tool_use_id: d.id, content: ket, ...(loi ? { is_error: true } : {}) });
      }
    }
    // Chỉ công cụ GHI, mọi lệnh ghi đều qua, và đã có lời nhắn → xong. Có lệnh bị từ chối thì gửi lỗi về để model sửa lời
    // (đừng để lời "em ghi rồi" đi tới khách trong khi code không ghi).
    // 02/10/2026 (bắn lại D1 "còn bệnh viện gần đó"): tra xong ở vòng 1, vòng 2 model viết "Ghi lại hồ sơ với thông tin khách
    // đã nói rõ:" kèm lệnh ghi → dừng sớm với lời kể việc, khách không nhận câu trả lời nào. Lượt đã tra (có công cụ ĐỌC)
    // thì không dừng ở vòng chỉ-có-ghi: gửi kết quả ghi về để model viết lời trả lời từ dữ liệu đã tra.
    const daTra = congCu.some((t) => TEN_DOC.has(t));
    if (!coDoc && !daTra && van && ketQua.every((k) => !k.is_error)) {
      if (xetKhoangCach(r, van, ketQua, vong < toiDa)) continue;
      out.replies = thanhBongBong(vanCuoi);
      return out.replies.length ? { out, duLieu, congCu, vong, usage, nhac, boCau } : null;
    }
    messages.push({ role: "assistant", content: r.content });
    messages.push({ role: "user", content: ketQua });
  }
  return hong("het_vong", toiDa);
}
