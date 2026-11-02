// Cổng bí mật dùng chung cho mọi edge function (soát bảo mật 29/08/2026,
// gộp về một chỗ 02/09/2026 — FR-171 k; vá fail-open 05/09/2026 — SEC-02).
//
// ══════════════════ VÌ SAO ĐỔI SANG FAIL-CLOSED (SEC-02) ══════════════════
// Bản trước: đọc hụt BRIDGE_SECRET → GHI SỔ RỒI CHO QUA. Ý đồ ban đầu hợp lý
// (gắn cổng trước khi có bí mật thì cron không gãy), nhưng nó gộp hai chuyện
// khác hẳn nhau vào cùng một nhánh:
//
//   · "chưa đặt secret"  — trạng thái dựng hệ thống, biết trước, kiểm soát được
//   · "đọc hụt secret"   — Vault lỗi, DB quá tải, timeout, hết kết nối
//
// Chuyện thứ hai mới nguy: kẻ tấn công không cần gây ra sự cố, chỉ cần thăm dò
// mỗi phút và đợi. Đúng khoảnh khắc DB nghẹn, request lọt — rồi `nudge` nhắn
// thật cho toàn bộ khách, `escalation-feed` dump SĐT, `chat-reply` mạo danh.
// Ghi sổ có xảy ra, nhưng là ghi SAU KHI đã cho qua; nó không chặn gì.
//
// Nay:
//   · đọc hụt          → 503, KHÔNG cho qua. Không có ngoại lệ.
//   · chưa đặt secret  → 503, TRỪ KHI có env `GATE_MO_KHI_CHUA_CO_BI_MAT=1`
//                        (cờ bật tay, tường minh, kêu to mỗi lượt).
//   · có secret        → so hằng thời gian như cũ.
//
// Thêm một lớp nhớ tạm 60 s cho giá trị đọc được: một lần Vault chớp mắt không
// còn biến thành một lượt 503 cho cron. Nhớ tạm CHỈ giữ giá trị ĐÚNG, không
// bao giờ nhớ trạng thái "hụt" — nhớ cái hụt là quay lại đúng bài cũ.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { bangNhau, docBiMat, ghiLoi, jsonResponse } from "./claude.ts";

const NHO_MS = 60_000;
let nho: { at: number; giaTri: string } | null = null;

export async function congBiMat(
  req: Request,
  client: SupabaseClient,
  ten: string,
  ma = 403,
  loi = "forbidden",
): Promise<Response | null> {
  // 02/11/2026: bỏ vé qua bằng Bearer service_role — chỉ đường "zalo-webhook → chat-reply" (gỡ 18/10) dùng; bridge và cron đều gửi
  // `x-bridge-secret`. Một khoá service_role lộ không còn tự mở được cổng (bot/tests/cong-bi-mat.test.ts).
  let bimat: string | null = null;
  if (nho && Date.now() - nho.at < NHO_MS) {
    bimat = nho.giaTri;
  } else {
    const { giaTri, loi: loiDoc } = await docBiMat(client, "BRIDGE_SECRET");
    if (loiDoc) {
      // ĐỌC HỤT — chặn. Đây là nhánh mà bản cũ cho qua.
      await ghiLoi(client, `${ten} CONG DONG`,
        `Không đọc được BRIDGE_SECRET (${loiDoc}) — chặn để an toàn (SEC-02).`);
      return jsonResponse({ error: "gate_unavailable" }, 503);
    }
    if (giaTri) nho = { at: Date.now(), giaTri };
    bimat = giaTri;
  }

  if (!bimat) {
    // CHƯA ĐẶT secret. Mặc định vẫn chặn; chỉ mở khi có người bật cờ tay.
    if (Deno.env.get("GATE_MO_KHI_CHUA_CO_BI_MAT") === "1") {
      await ghiLoi(client, `${ten} CONG MO`,
        "BRIDGE_SECRET chưa đặt và GATE_MO_KHI_CHUA_CO_BI_MAT=1 — cổng đang MỞ có chủ ý. " +
        "Đặt secret rồi gỡ cờ này.");
      return null;
    }
    await ghiLoi(client, `${ten} CONG DONG`,
      "BRIDGE_SECRET chưa đặt — chặn. Đặt secret vào Vault, hoặc bật tạm " +
      "GATE_MO_KHI_CHUA_CO_BI_MAT=1 nếu cố ý chạy không cổng.");
    return jsonResponse({ error: "gate_unconfigured" }, 503);
  }

  const gui = req.headers.get("x-bridge-secret");
  if (gui && await bangNhau(gui, bimat)) return null;
  return jsonResponse({ error: loi }, ma);
}
