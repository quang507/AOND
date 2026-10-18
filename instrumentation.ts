// FR-152 (b) — móc bắt lỗi phía SERVER của web.
//
// Trước file này, web nhadat.cc không có một cái móc nào: không
// `instrumentation.ts`, không `app/error.tsx`, không `global-error.tsx`. Một
// trang tin ném exception lúc render thì khách thấy trang lỗi trắng, còn dấu
// vết duy nhất là log runtime của Vercel — bậc Hobby giữ rất ngắn và không ai
// mở. Nghĩa là web có thể hỏng một khu vực suốt nhiều ngày mà không ai biết.
//
// `onRequestError` là hook Next 15 gọi cho MỌI lỗi chưa bắt ở phía server
// (Server Component, route handler, middleware). Ghi thẳng vào `bot_errors`,
// chung một sổ với bot — mở /admin là thấy cả hai phía.
//
// Cố tình CHỈ bắt phía server. Lỗi phía trình duyệt vừa nhiễu (extension,
// mạng khách, script bên thứ ba) vừa là cửa cho người lạ đổ rác vào sổ.

import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  try {
    // Nạp trong hàm, không nạp ở đầu file: instrumentation chạy trong cả runtime
    // edge lẫn node, import tĩnh một client Supabase ở tầng module là kéo nó vào
    // mọi bundle kể cả khi không có lỗi nào.
    const { supabase } = await import("@/lib/supabase");
    const e = err as Error;
    await supabase.rpc("log_loi", {
      p_source: `web ${context.routerKind === "App Router" ? "app" : "pages"}`,
      p_detail: `${request.path} — ${e?.message ?? String(err)}`,
      p_code: null,
    });
  } catch {
    // Ghi sổ hỏng thì thôi. Đây đang là đường xử lý lỗi; ném thêm ở đây chỉ đổi
    // một lỗi thành hai, mà lỗi thứ hai thì không còn ai bắt.
  }
};

export async function register() {
  // Next gọi hàm này một lần lúc server khởi động. Chưa cần làm gì, nhưng phải
  // export: thiếu `register` thì Next bỏ qua luôn cả file, kể cả onRequestError.
}
