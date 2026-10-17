// inbound-sweep — đường CỨU cho tin nhắn đến (FR-166).
//
// VÌ SAO CÓ. `zalo-webhook` chạy việc thật trong `EdgeRuntime.waitUntil`, tức
// cùng instance vừa trả 200 cho Zalo. Instance đó chết giữa chừng (deploy,
// evict, OOM, hết giờ tường) thì không còn ai cầm việc: sổ `inbound_events`
// có payload, nhưng trước bản này KHÔNG AI ĐỌC nó. Tin của khách mất im lặng.
//
// Hàm này là người đọc còn thiếu. Cron 1 phút/lần hỏi
// `viec_inbound_bo_roi()` xem việc nào chưa xong rồi gọi ngược
// `zalo-webhook` ở cửa phát lại — CỐ Ý không tự gửi lấy, vì khâu gửi là chỗ
// giữ luật chống-gửi-đúp (`sent_bubbles`), và hai đường gửi song song là hai
// chỗ để hành vi trôi khỏi nhau.
//
// Đường NHANH vẫn nguyên vẹn: bình thường webhook làm xong trong vài giây và
// hàm này không thấy việc gì. Nó chỉ bận khi có thứ hỏng.
import { ghiLoi, jsonResponse, serviceClient } from "../_shared/claude.ts";
import { congBiMat } from "../_shared/gate.ts";

type Viec = { event_id: string; ly_do: string; attempts: number };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const client = serviceClient();

  // Cổng dùng chung `_shared/gate.ts` (FR-171 k).
  const chan = await congBiMat(req, client, "inbound-sweep");
  if (chan) return chan;

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const { data: viecs, error: timErr } = await client
    .rpc("viec_inbound_bo_roi", { p_limit: 20 });
  if (timErr) {
    await ghiLoi(client, "inbound-sweep tim viec", timErr.message);
    return jsonResponse({ error: timErr.message }, 500);
  }

  const ds = (viecs ?? []) as Viec[];
  let cuu = 0;
  let hong = 0;

  for (const v of ds) {
    try {
      // Gọi tuần tự, không Promise.all: mỗi việc kéo theo một lượt gọi model
      // và vài lượt gửi Zalo. Bắn 20 cái cùng lúc là tự tạo cơn bão đúng lúc
      // hệ thống đang yếu — mà đây là đường CỨU, chạy khi mọi thứ đã hỏng.
      const r = await fetch(`${url}/functions/v1/zalo-webhook`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ replay_event_id: v.event_id }),
      });
      if (r.ok) {
        cuu++;
      } else {
        hong++;
        const chiTiet = `${r.status} ${(await r.text()).slice(0, 200)}`;
        await client.rpc("bao_hong_inbound", { p_msg_id: v.event_id, p_detail: chiTiet });
        await ghiLoi(client, "inbound-sweep phat lai", chiTiet, r.status);
      }
    } catch (e) {
      // FR-152: mọi catch phải vào sổ. Việc vẫn nằm trong hàng đợi nên lượt
      // cron sau nhặt lại — có điều lần sau phải chờ theo luật lùi dần.
      hong++;
      const chiTiet = e instanceof Error ? e.message : String(e);
      await client.rpc("bao_hong_inbound", { p_msg_id: v.event_id, p_detail: chiTiet });
      await ghiLoi(client, "inbound-sweep fetch", e);
    }
  }

  return jsonResponse({ tim_thay: ds.length, cuu, hong });
});
