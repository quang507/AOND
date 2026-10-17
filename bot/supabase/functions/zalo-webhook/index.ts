// zalo-webhook — SRS-4.4: nhận event Zalo OA, trả 200 ngay (<1s), xử lý async.
// Bộ não hội thoại nằm ở chat-reply (NFR-12) — webhook chỉ verify, chuyển tiếp
// và gửi trả lời (1-2 bong bóng theo FR-130) qua OA API.
// Secrets: ZALO_OA_ACCESS_TOKEN (bắt buộc để trả lời), ZALO_APP_SECRET + ZALO_APP_ID
// (tuỳ chọn — có thì verify chữ ký X-ZEvent-Signature), đặt qua env hoặc Vault.
import {
  bangNhau,
  docBiMat,
  ghiLoi,
  jsonResponse,
  secretOf,
  sendZalo,
  sendZaloImage,
  serviceClient,
} from "../_shared/claude.ts";

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function handleEvent(raw: string): Promise<void> {
  const client = serviceClient();
  const ev = JSON.parse(raw);
  const isText = ev.event_name === "user_send_text";
  const isImage = ev.event_name === "user_send_image"; // FR-134: bot đọc ảnh
  // SRS-5.1zzj/zzl (05/10/2026, demo AOND): FILE (PDF / CSV / XLSX) và LINK người bán gửi — trước đây rơi ngay cửa.
  const isFile = ev.event_name === "user_send_file";
  const isLink = ev.event_name === "user_send_link";
  if (!isText && !isImage && !isFile && !isLink) return;

  const zaloUserId = String(ev.sender?.id ?? "");
  const text = String(ev.message?.text ?? "").trim();
  const dinhKem = ev.message?.attachments?.[0]?.payload ?? {};
  const imageUrl = isImage ? String(dinhKem.url ?? "") : "";
  const fileUrl = isFile ? String(dinhKem.url ?? "") : "";
  const fileName = isFile ? String(dinhKem.name ?? "").slice(0, 200) : "";
  const linkUrl = isLink ? String(dinhKem.url ?? "") : "";
  const zaloMsgId = ev.message?.msg_id ? String(ev.message.msg_id) : null;
  if (!zaloUserId || (!text && !imageUrl && !fileUrl && !linkUrl)) return;

  // Bộ não dùng chung (NFR-12): nhớ khách, hồ sơ nhu cầu FR-130, dedupe msg_id
  const brain = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/chat-reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_user_id: zaloUserId,
      text,
      image_url: imageUrl || undefined,
      file_url: fileUrl || undefined,
      file_name: fileName || undefined,
      link_url: linkUrl || undefined,
      msg_id: zaloMsgId,
      channel: "zalo_oa",
    }),
  });
  const out = await brain.json().catch(() => ({}));
  // Bộ não từ chối (403 cổng FR-151, 429 trần model, lỗi model…) → khách KHÔNG
  // nhận được câu trả lời nào, mà webhook đã trả 200 cho Zalo từ lâu. Ghi sổ.
  if (out?.error) return await ghiLoi(client, "zalo-webhook brain", out.error, brain.status);
  // FR-162: exactly-once chiều GỬI. Replay + already_sent = câu trả lời này
  // ĐÃ tới tay khách ở lần giao trước — provider giao trùng thì im, đừng bắn
  // đúp bong bóng. already_sent còn trống (lần trước gửi hụt / chưa kịp gửi)
  // thì đi tiếp: đây chính là đường retry outbound.
  if (out?.replayed && out?.already_sent) return;
  const bubbles: string[] = Array.isArray(out?.replies) && out.replies.length
    ? out.replies
    : out?.reply
    ? [out.reply]
    : [];
  if (!bubbles.length) return;

  const accessToken = await secretOf(client, "ZALO_OA_ACCESS_TOKEN");
  if (!accessToken) return; // chưa cấu hình OA — chỉ ghi log (đã lưu messages)

  // ─── CHỐT CHIỀU GỬI (20260905i) ────────────────────────────────────────────
  // `claim_inbound` chốt chiều ĐẾN, nhưng nhánh `status='completed'` của nó trả
  // về ngay không đánh dấu gì — mà đó đúng là trạng thái `viec_inbound_bo_roi()`
  // đi tìm ("chua_gui"). Nên trước bản này hai lượt phát lại song song cùng đọc
  // `sent_bubbles`, cùng thấy 0, cùng gửi bong bóng đầu: khách nhận đúp.
  // Đã dựng lại được trong e2e (GUI-3) trước khi vá.
  let giuLuot = false;
  if (zaloMsgId) {
    const { data: gianhDuoc, error: eGiu } = await client
      .rpc("giu_luot_gui", { p_msg_id: zaloMsgId, p_han_secs: 120 });
    if (eGiu) {
      // CỐ Ý ĐI TIẾP khi không hỏi được chốt — ngược với mọi cổng bảo mật
      // trong repo này, và có lý do: ở đây "chặn cho chắc" nghĩa là khách ngồi
      // chờ một câu trả lời KHÔNG BAO GIỜ tới. Hỏng đó nặng hơn hẳn một bong
      // bóng lặp, mà `sent_bubbles` vẫn còn đó làm lưới thứ hai.
      await ghiLoi(client, "zalo-webhook giu luot gui", eGiu.message);
    } else if (gianhDuoc === false) {
      return; // lượt khác đang gửi đúng tin này
    } else {
      giuLuot = true;
    }
  }
  try {
  // FR-166 bất biến 10/12 — ĐIỂM NỐI LẠI.
  // Trước bản này, sập giữa chừng là lần sau phát lại TỪ ĐẦU: bong bóng 1 đã
  // tới tay khách rồi vẫn bị gửi lần nữa. `sent_bubbles` đếm số tấm ĐÃ tới
  // Zalo, ghi ngay sau từng tấm, nên lần thử sau đi tiếp đúng chỗ đang dở.
  // Zalo OA `message/cs` không có khoá idempotency phía nhà cung cấp, nên đếm
  // ở phía mình là cách an toàn mạnh nhất mà tích hợp hiện tại cho phép.
  let daGui = 0;
  if (zaloMsgId) {
    const { data: so } = await client.from("inbound_ledger")
      .select("sent_bubbles").eq("zalo_msg_id", zaloMsgId).maybeSingle();
    daGui = Math.min(so?.sent_bubbles ?? 0, bubbles.length);
  }

  // Quyết định 25/08: KHÔNG delay nhân tạo — bong bóng đầu đi ngay lập tức,
  // giữa các bong bóng chỉ chừa 300ms cho Zalo giao đúng thứ tự.
  // SRS-5.1zzm (05/10/2026): chat-reply trả `nhip_go[]` (ms nghỉ trước từng bong bóng) khi `app_config.nhip_go = bat`;
  // không có thì vẫn 300 ms. Webhook không tự tính — một nhịp cho cả OA lẫn bridge.
  const nhipGo: number[] = Array.isArray(out?.nhip_go) ? out.nhip_go.map((x: unknown) => Math.min(3000, Math.max(0, Number(x) || 0))) : [];
  let guiHut = 0; // FR-162: đếm bong bóng gửi hụt để ghi vào sổ inbound_ledger
  for (let i = daGui; i < bubbles.length; i++) {
    const bubble = bubbles[i];
    if (i > 0) await new Promise((r) => setTimeout(r, nhipGo[i] ?? 300));
    let ok = await sendZalo(accessToken, zaloUserId, bubble);
    if (!ok) {
      // FR-162: OA nghẹn thoáng qua là chuyện có thật — thử lại ĐÚNG MỘT lần
      // sau 2s trước khi bỏ cuộc. Câu trả lời đã nằm trong inbound_ledger nên
      // kể cả bỏ cuộc, gọi lại chat-reply cùng msg_id là phát lại được.
      await new Promise((r) => setTimeout(r, 2000));
      ok = await sendZalo(accessToken, zaloUserId, bubble);
    }
    // Gửi hụt = khách ngồi chờ một câu không bao giờ tới. Đây là hỏng nặng
    // nhất phía B mà lại im nhất, vì mọi mã HTTP trên đường đều 200.
    if (!ok) {
      guiHut = bubbles.length - i; // số tấm CÒN LẠI chưa tới
      await ghiLoi(client, "zalo-webhook send", `bong bóng: ${bubble.slice(0, 80)}`);
      // DỪNG HẲN, không gửi nốt tấm sau: gửi tiếp thì khách nhận lộn thứ tự,
      // và điểm nối lại thành mơ hồ (tấm 2 tới mà tấm 1 chưa).
      break;
    }
    // Ghi NGAY sau từng tấm — sập ở dòng kế tiếp thì lần sau vẫn biết đã tới đâu.
    daGui = i + 1;
    if (zaloMsgId) {
      await client.from("inbound_ledger")
        .update({ sent_bubbles: daGui, updated_at: new Date().toISOString() })
        .eq("zalo_msg_id", zaloMsgId);
    }
  }

  // FR-162: chốt kết quả GỬI vào sổ — sent_at nghĩa là mọi bong bóng đã tới
  // Zalo; send_error là bằng chứng "AI đã chạy mà khách chưa nhận được", chỗ
  // duy nhất phân biệt nổi ca này với ca thành công (mọi HTTP đều 200).
  // Dòng sổ không tồn tại (msg_id null / sổ hỏng) thì update là no-op, kệ.
  if (zaloMsgId && bubbles.length) {
    const { error: soErr } = await client.from("inbound_ledger").update(
      guiHut
        ? { send_error: `${guiHut}/${bubbles.length} bong bóng gửi hụt`,
            updated_at: new Date().toISOString() }
        : { sent_at: new Date().toISOString(), send_error: null,
            updated_at: new Date().toISOString() },
    ).eq("zalo_msg_id", zaloMsgId);
    if (soErr) await ghiLoi(client, "zalo-webhook ledger send", soErr.message);
  }

  // FR-143: bộ não trả về hình thật (kho ảnh theo mã + URL chính chủ gửi)
  const photos: string[] = Array.isArray(out?.photos) ? out.photos : [];
  for (const url of photos) {
    const ok = await sendZaloImage(accessToken, zaloUserId, url);
    if (!ok) await ghiLoi(client, "zalo-webhook send ảnh", url);
  }
  } finally {
    // NHẢ NGAY, kể cả khi ném giữa chừng. Ôm lease tới lúc hết hạn (120 giây)
    // là làm chậm đường cứu: `inbound-sweep` hiện thử lại ngay lượt cron sau,
    // và giữ nguyên nhịp đó là một phần của "không đổi hành vi".
    if (giuLuot && zaloMsgId) {
      const { error: eNha } = await client.rpc("nha_luot_gui", { p_msg_id: zaloMsgId });
      if (eNha) await ghiLoi(client, "zalo-webhook nha luot gui", eNha.message);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "GET") return new Response("AI Ơi Nhà Đất zalo-webhook OK");
  if (req.method !== "POST") return new Response("method", { status: 405 });

  const raw = await req.text();

  // SEC-06 — chặn body khổng lồ trước khi đụng tới nó. Zalo không gửi sự kiện
  // nào quá vài KB; 64 KB đã rộng gấp bội.
  if (raw.length > 64 * 1024) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }

  // FR-166 — CỬA PHÁT LẠI cho đường cứu.
  // `inbound-sweep` gọi vào đây với `{replay_event_id}` để chạy lại đúng việc
  // đã bỏ dở. Cố ý KHÔNG viết một đường gửi riêng cho worker: hai đường gửi
  // song song là hai chỗ để hành vi trôi khỏi nhau, mà khâu gửi lại chính là
  // khâu chứa luật chống-gửi-đúp. Một đường, dùng chung.
  // Chỉ service_role gọi được — payload lấy từ sổ, không tin gì từ người gọi
  // ngoài chính cái id.
  // `catch` CHỈ bọc đúng `JSON.parse`. Bản trước bọc cả khối phát lại, nên một
  // exception từ `handleEvent` (model ném, mạng đứt, Zalo 500) bị nuốt SẠCH:
  // không ghi sổ, rồi rơi tuột xuống đường webhook thường và trả về 200.
  // `inbound-sweep` đọc 200 là "đã cứu xong" nên KHÔNG gọi `bao_hong_inbound`,
  // `attempts` không tăng, `next_retry_at` không đặt — nó phát lại đúng việc ấy
  // mỗi phút, suốt 24 giờ, và không ai thấy gì.
  // SEC-12: parse ĐÚNG MỘT LẦN ở đây rồi dùng lại. Bản trước parse lần hai
  // trong khối verify chữ ký mà không bọc `try` — vô hại lúc khối đó chưa chạy
  // (thiếu secret), nhưng sẽ thành 500 hàng loạt ngay khi vá SEC-01. Body
  // không phải JSON thì từ chối luôn: Zalo không bao giờ gửi thứ đó.
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(raw);
  } catch { /* xử ở ngay dưới */ }
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "body phải là JSON" }, 400);
  }

  if (body?.replay_event_id) {
    const auth = req.headers.get("authorization") ?? "";
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    // SEC-11: so hằng thời gian.
    const isService = !!svc && auth.startsWith("Bearer ") &&
      await bangNhau(auth.slice(7), svc);
    if (!isService) return jsonResponse({ error: "forbidden" }, 403);

    const db = serviceClient();
    const { data: ev } = await db.from("inbound_events")
      .select("payload").eq("event_id", String(body.replay_event_id)).maybeSingle();
    if (!ev?.payload) return jsonResponse({ error: "khong thay su kien" }, 404);

    try {
      await handleEvent(JSON.stringify(ev.payload));
    } catch (e) {
      // Cứu hụt thì phải NÓI THẬT. Trả 200 ở đây là nói dối đường cứu.
      await ghiLoi(db, "zalo-webhook replay", e);
      return jsonResponse({ error: "replay hong" }, 500);
    }
    return jsonResponse({ ok: true, replayed_event: body.replay_event_id });
  }

  // ══════════ VERIFY CHỮ KÝ — FAIL-CLOSED (SEC-01, vá 05/09/2026) ══════════
  // Hàm này buộc chạy verify_jwt=false (Zalo không gửi được JWT của Supabase),
  // nên chữ ký `X-ZEvent-Signature` là hàng rào DUY NHẤT.
  //
  // Bản trước: thiếu secret → ghi sổ rồi XỬ LÝ TIẾP. Đo Vault 05/09: cả
  // ZALO_APP_SECRET lẫn ZALO_APP_ID đều KHÔNG tồn tại, nên nhánh verify chưa
  // từng chạy lần nào kể từ ngày viết. Tức suốt thời gian đó ai cũng POST được
  // một sự kiện bịa với `sender.id` bất kỳ: đội lốt Zalo ID của chủ nhà để bơm
  // fact vào tin của họ (SEC-04), hoặc bơm tin rác để đốt hết hạn mức model
  // của cả ngày (SEC-05).
  //
  // Nay chặn cứng. Đường sống thật hôm nay là bridge → chat-reply (OA còn chờ
  // duyệt, `ZALO_OA_ACCESS_TOKEN` cũng chưa có), nên đóng cửa này KHÔNG làm
  // gãy gì đang chạy. Muốn chạy tạm không chữ ký thì phải bật cờ tay
  // `ALLOW_UNVERIFIED_WEBHOOK=1` — tường minh, và kêu mỗi lượt.
  const client = serviceClient();
  const [sec, aid] = await Promise.all([
    docBiMat(client, "ZALO_APP_SECRET"),
    docBiMat(client, "ZALO_APP_ID"),
  ]);
  if (sec.loi || aid.loi) {
    // Đọc hụt Vault ≠ chưa đặt. Đọc hụt thì luôn chặn (cùng luật với SEC-02).
    await ghiLoi(client, "zalo-webhook VAULT HUT",
      `Không đọc được secret chữ ký (${sec.loi ?? aid.loi}) — chặn để an toàn.`);
    return jsonResponse({ error: "signature_unavailable" }, 503);
  }
  const appSecret = sec.giaTri;
  const appId = aid.giaTri;

  if (!appSecret || !appId) {
    if (Deno.env.get("ALLOW_UNVERIFIED_WEBHOOK") !== "1") {
      await ghiLoi(client, "zalo-webhook CHUA CO CHU KY",
        "Thiếu ZALO_APP_SECRET/ZALO_APP_ID — TỪ CHỐI sự kiện. Đặt hai secret vào " +
        "Vault, hoặc bật tạm ALLOW_UNVERIFIED_WEBHOOK=1 nếu cố ý chạy không chữ ký.");
      return jsonResponse({ error: "signature_unconfigured" }, 503);
    }
    await ghiLoi(client, "zalo-webhook KHONG VERIFY",
      "ALLOW_UNVERIFIED_WEBHOOK=1 — đang nhận sự kiện KHÔNG kiểm chữ ký. Ai cũng " +
      "giả được tin nhắn đến. Đây là cờ tạm, gỡ ngay khi có secret.");
  } else {
    const sig = req.headers.get("X-ZEvent-Signature") ?? "";
    const tsRaw = String(body.timestamp ?? "");

    // Chống replay: chữ ký đúng vẫn phát lại được mãi nếu không ràng thời gian.
    // Zalo gửi timestamp mili-giây dạng chuỗi; nhận cả giây phòng khi đổi.
    const n = Number(tsRaw);
    const ms = Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : NaN;
    if (!Number.isFinite(ms) || Math.abs(Date.now() - ms) > 5 * 60 * 1000) {
      await ghiLoi(client, "zalo-webhook TIMESTAMP", `timestamp lệch/thiếu: "${tsRaw}"`);
      return jsonResponse({ error: "stale_timestamp" }, 401);
    }

    const mac = await sha256hex(`${appId}${raw}${tsRaw}${appSecret}`);
    // SEC-11: so hằng thời gian, không `!==` — chữ ký là bí mật dài hạn.
    if (!await bangNhau(sig, `mac=${mac}`)) {
      await ghiLoi(client, "zalo-webhook SAI CHU KY", `sig="${sig.slice(0, 24)}…"`);
      return jsonResponse({ error: "invalid_signature" }, 401);
    }
  }

  // FR-162: ghi SỰ KIỆN vào sổ `inbound_events` TRƯỚC khi ack — verify xong →
  // insert idempotent (PK event_id, giao trùng chỉ tăng delivery_count) →
  // commit → 200 → xử lý nền. Instance chết ngay sau ack thì vẫn còn nguyên
  // payload trong sổ để xử lý lại, không mất tin không dấu vết.
  // Ghi hụt thì vào bot_errors rồi VẪN ack + xử lý — sổ sự kiện là lưới an
  // toàn, không phải cổng chặn.
  try {
    const ev = JSON.parse(raw);
    const evMsgId = ev?.message?.msg_id ? String(ev.message.msg_id) : null;
    const evText = ["user_send_text", "user_send_image", "user_send_file", "user_send_link"].includes(ev?.event_name);
    if (evText && evMsgId) {
      const { error: seErr } = await client.rpc("ghi_su_kien_inbound", {
        p_event_id: evMsgId,
        p_zalo_user_id: String(ev?.sender?.id ?? ""),
        p_payload: ev,
      });
      if (seErr) await ghiLoi(client, "zalo-webhook ghi_su_kien", seErr.message);
    }
  } catch (e) {
    await ghiLoi(client, "zalo-webhook ghi_su_kien", e);
  }

  // Trả 200 ngay, xử lý nền (SRS-4.4: <1s).
  // Chạy nền: không ai await cái này, nên exception ở đây rơi vào hư không.
  // (@ts-ignore phải nằm SÁT dòng lệnh, chèn comment vào giữa là nó hết tác dụng.)
  // @ts-ignore EdgeRuntime có trong môi trường Supabase
  EdgeRuntime.waitUntil(
    handleEvent(raw).catch((e) => ghiLoi(client, "zalo-webhook handleEvent", e)),
  );
  return jsonResponse({ ok: true });
});
