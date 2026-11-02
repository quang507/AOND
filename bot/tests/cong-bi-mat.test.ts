// cong-bi-mat.test.ts — cổng bí mật chung của edge function (`_shared/gate.ts`) chạy THẬT bằng Deno (02/11/2026).
// Bearer service_role KHÔNG còn là vé qua cổng: đường "zalo-webhook → chat-reply" đã gỡ cùng bot TypeScript; bridge và cron đều
// gửi `x-bridge-secret`. Gắn lại nhánh bỏ qua bằng service_role trong gate.ts → ca 1 đỏ.
//   cd bot/supabase/functions && bunx deno test --allow-env --node-modules-dir=auto ../../tests/cong-bi-mat.test.ts
import { congBiMat } from "../supabase/functions/_shared/gate.ts";

const BI_MAT = "bi-mat-thu-cong";
const SVC = "khoa-service-role-thu";
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SVC);
Deno.env.delete("BRIDGE_SECRET");   // đọc qua Vault giả bên dưới

// Client giả: `get_secret` trả bí mật, `log_loi` nuốt im.
const client = {
  rpc: (ten: string) => Promise.resolve(ten === "get_secret" ? { data: BI_MAT, error: null } : { data: null, error: null }),
  // deno-lint-ignore no-explicit-any
} as any;

const goi = (headers: Record<string, string>) =>
  congBiMat(new Request("https://x/functions/v1/thu", { method: "POST", headers }), client, "thu");

Deno.test("Bearer service_role mà không có x-bridge-secret → chặn", async () => {
  const r = await goi({ authorization: `Bearer ${SVC}` });
  if (!r || r.status !== 403) throw new Error(`mong 403, được ${r ? r.status : "qua cổng"}`);
});

Deno.test("x-bridge-secret đúng → qua", async () => {
  const r = await goi({ authorization: "Bearer khoa-cong-khai", "x-bridge-secret": BI_MAT });
  if (r !== null) throw new Error(`mong qua cổng, được ${r.status}`);
});

Deno.test("x-bridge-secret sai → chặn", async () => {
  const r = await goi({ "x-bridge-secret": "sai" });
  if (!r || r.status !== 403) throw new Error(`mong 403, được ${r ? r.status : "qua cổng"}`);
});
