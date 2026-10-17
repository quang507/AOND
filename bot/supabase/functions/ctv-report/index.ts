// ctv-report — FR-136/137: CRM CTV tối thiểu + báo cáo 17h mỗi ngày.
// Mỗi conversation (đơn chăm sóc) đã được gán CTV xoay vòng từ lúc tạo (trigger
// assign_ctv_round_robin). Hàm này chạy theo cron ctv-report-tick (17h VN):
// 1. Tổng hợp per-CTV: đơn đang chăm, đơn có tương tác hôm nay, đơn cần người
//    thật (needs_human), lịch xem nhà sắp tới.
// 2. Chấm điểm chất lượng chăm khách bằng RATE_CTV_RUBRIC (tối đa 3 hội thoại
//    hoạt động gần nhất mỗi CTV) — le_phep / dung_luat_hoi / hieu_bds / cham_khach.
// 3. Gửi MỘT tin tổng hợp về Zalo cá nhân admin (FR-149: qua hàng đợi bridge;
//    còn OA thì gửi thẳng) và lưu ctv_daily_reports để tra cứu + chống gửi đôi.
// POST {} (cron) | { dry_run?: bool, force?: bool } — force = chạy lại dù hôm nay đã gửi.
import { z } from "npm:zod@4";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import {
  anthropicClient,
  doTien,
  ghiLoi,
  jsonResponse,
  MODEL,
  secretOf,
  sendZalo,
  serviceClient,
} from "../_shared/claude.ts";
import { congBiMat } from "../_shared/gate.ts";
import { boBaoLai } from "../_shared/bao_lai.ts"; // 11/09: bỏ bong bóng 💾 khỏi hội thoại đem chấm
import { RATE_CTV_RUBRIC } from "../_shared/prompts.ts";

const Score = z.object({
  le_phep: z.number().min(1).max(5),
  dung_luat_hoi: z.number().min(1).max(5),
  hieu_bds: z.number().min(1).max(5),
  cham_khach: z.number().min(1).max(5),
  stars: z.number().min(1).max(5).describe("Điểm tổng theo luật trong rubric"),
  comment: z.string().describe("1-2 câu tiếng Việt: lỗi cụ thể nhất hoặc điểm tốt nhất"),
});

// Nhãn vai khi dựng bản ghi hội thoại cho model chấm. Gộp mọi thứ không phải
// `buyer` vào "CTV/BOT" là chấm lời của người khác lên đầu CTV — từ khi nhánh
// người bán được ghi sổ (FR-141/FR-152) thì `seller` và `human` cũng nằm trong
// bảng `messages`, và điểm sai đó được ghi thẳng vào ctv_daily_reports.
const VAI_NHAN: Record<string, string> = {
  buyer: "KHÁCH",
  seller: "CHỦ NHÀ",
  system: "HỆ THỐNG",
  bot: "CTV/BOT",
  ctv: "CTV/BOT",
  human: "CTV/BOT",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  // ── CỔNG (soát bảo mật 29/08/2026) ───────────────────────────────────────
  // Như ask-seller: verify_jwt=true chỉ đòi khoá công khai. Người lạ gọi được
  // nghĩa là ép sinh + GỬI báo cáo CTV (số liệu kinh doanh nội bộ) và đốt tiền
  // model. Cron mang `x-bridge-secret` (xem `ctv_report_tick`). Cổng dùng chung
  // `_shared/gate.ts`.
  const client = serviceClient();
  const chan = await congBiMat(req, client, "ctv-report");
  if (chan) return chan;

  const { dry_run = false, force = false } = await req.json().catch(() => ({}));
  const now = Date.now();
  const vnDate = new Date(now + 7 * 3600e3).toISOString().slice(0, 10); // ngày giờ VN

  // Chống gửi đôi: hôm nay đã có báo cáo rồi thì thôi (trừ khi force)
  if (!force) {
    const { count } = await client.from("ctv_daily_reports")
      .select("id", { count: "exact", head: true }).eq("report_date", vnDate);
    if ((count ?? 0) > 0) {
      return jsonResponse({ skipped: "already_reported", report_date: vnDate });
    }
  }

  const anthropic = await anthropicClient(client);
  const { data: ctvs } = await client.from("ctvs")
    .select("id, name").eq("active", true).order("created_at");

  const vnStartOfDay = new Date(now + 7 * 3600e3);
  const todayUtc = Date.UTC(
    vnStartOfDay.getUTCFullYear(), vnStartOfDay.getUTCMonth(), vnStartOfDay.getUTCDate(),
  ) - 7 * 3600e3; // 0h VN hôm nay tính theo UTC
  const sections: string[] = [];
  const saved: Record<string, unknown>[] = [];

  // FR-173 e: hạng CTV theo tỷ lệ trả lời câu khách hỏi ĐÚNG HẠN 30 ngày (view
  // `ctv_ranks`, migration 20260903a). Một lượt đọc cho mọi CTV.
  const HANG: Record<string, string> = { vang: "Vàng", bac: "Bạc", dong: "Đồng", chua_du: "chưa đủ dữ liệu" };
  const { data: hangRows, error: hangErr } = await client.from("ctv_ranks")
    .select("id, rank, tong, dung_han, tre");
  if (hangErr) await ghiLoi(client, "ctv-report ctv_ranks", hangErr.message);
  const hangCua = new Map((hangRows ?? []).map((h) => [h.id as string, h]));

  for (const ctv of ctvs ?? []) {
    const h = hangCua.get(ctv.id);
    const dongHang = h
      ? `- Hạng trả lời khách: ${HANG[h.rank as string] ?? h.rank} (${h.dung_han}/${h.tong} đúng hạn, ${h.tre} trễ, 30 ngày)\n`
      : "";
    const { data: convs } = await client.from("conversations")
      .select("id, buyer_id, needs_human, last_message_at, buyers(name, preferences)")
      .eq("ctv_id", ctv.id)
      // Hội thoại NGƯỜI BÁN cũng được trigger xoay vòng gán ctv_id, và từ khi
      // FR-141/FR-152 ghi sổ nhánh seller thì cũng có last_message_at. Báo cáo
      // này đếm ĐƠN KHÁCH MUA — để lọt vào là hiện ra hàng "khách mới (chưa rõ
      // nhu cầu)" ma và chấm điểm CTV trên chính lời chủ nhà.
      .not("buyer_id", "is", null)
      .gte("last_message_at", new Date(now - 30 * 864e5).toISOString())
      .order("last_message_at", { ascending: false }).limit(50);
    const all = convs ?? [];
    const today = all.filter((c) => Date.parse(c.last_message_at) >= todayUtc);
    const needHuman = all.filter((c) => c.needs_human);
    const buyerIds = all.map((c) => c.buyer_id).filter(Boolean);
    const { data: vws } = buyerIds.length
      ? await client.from("viewings")
        .select("listing_code, time_text, slot, buyers(name)")
        .in("buyer_id", buyerIds).eq("status", "pending")
        .gte("slot", new Date().toISOString()).order("slot").limit(10)
      : { data: [] as never[] };

    // Chấm điểm tối đa 3 hội thoại có tương tác trong 24h qua
    const toScore = all
      .filter((c) => Date.parse(c.last_message_at) >= now - 864e5).slice(0, 3);
    const scores: Array<z.infer<typeof Score> & { conversation_id: string }> = [];
    for (const c of toScore) {
      const { data: msgs } = await client.from("messages")
        .select("sender, body").eq("conversation_id", c.id)
        .order("created_at", { ascending: false }).limit(20);
      // Bong bóng 💾 (bảng số liệu báo lại cho người bán, 11/09/2026) không phải
      // lời thoại — để lọt vào đây thì rubric "tối đa 1 emoji / không markdown"
      // chấm nó là bot sai giọng, kéo điểm CTV xuống oan. Bỏ trước khi chấm.
      const convo = (msgs ?? []).reverse()
        .map((m) => ({ ...m, body: boBaoLai(m.body) }))
        .filter((m) => m.body)
        .map((m) => `${VAI_NHAN[m.sender] ?? String(m.sender).toUpperCase()}: ${m.body}`)
        .join("\n");
      if (!convo) continue;
      try {
        // 512 là QUÁ CHẶT cho schema Score: 4 điểm thành phần + comment tiếng
        // Việt 1-2 câu có trích nguyên văn tin vi phạm. Model bị cắt giữa chuỗi
        // → JSON hụt đuôi → parse ném → catch nuốt → điểm CTV mất im lặng.
        // Đã xảy ra thật 26/08 ("Unterminated string at position 349").
        // 2048 cho khớp rate-ctv, vốn dùng đúng schema và đúng rubric này.
        const resp = await anthropic.messages.parse({
          model: MODEL, max_tokens: 2048,
          output_config: { effort: "low", format: zodOutputFormat(Score) },
          system: [{ type: "text", text: RATE_CTV_RUBRIC, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: `Hội thoại cần chấm:\n${convo}` }],
        });
        await doTien(client, resp.usage); // FR-171 e
        if (resp.stop_reason !== "refusal" && resp.parsed_output) {
          scores.push({ ...(resp.parsed_output as z.infer<typeof Score>), conversation_id: c.id });
        }
      } catch (e) {
        // Nêu rõ hội thoại nào hỏng: mất một điểm thì avg lệch mà không ai biết.
        // Đây đúng là con bug 26/08 (JSON hụt đuôi) — hồi đó chỉ có
        // console.error nên nó nằm im tới lúc tình cờ đọc log. Giờ vào sổ.
        await ghiLoi(client, "ctv-report score", `hội thoại ${c.id}: ${(e as Error)?.message}`);
      }
    }
    const avg = scores.length
      ? (scores.reduce((s, x) => s + x.stars, 0) / scores.length).toFixed(1)
      : null;

    const khachToday = today.slice(0, 5).map((c) => {
      const b = c.buyers as { name?: string | null; preferences?: Record<string, unknown> } | null;
      const p = b?.preferences ?? {};
      return `${b?.name ?? "khách mới"} (${[p.area, p.budget].filter(Boolean).join(", ") || "chưa rõ nhu cầu"})`;
    }).join("; ");
    const lich = ((vws ?? []) as Array<{ listing_code?: string | null; time_text?: string | null; buyers?: { name?: string | null } | null }>)
      .map((v) => `${v.buyers?.name ?? "khách"} xem ${v.listing_code ? "#" + v.listing_code : "nhà"} (${v.time_text ?? ""})`)
      .join("; ");

    const body =
      `【${ctv.name}】\n` +
      `- Đang chăm: ${all.length} đơn (hôm nay có tương tác: ${today.length})\n` +
      (khachToday ? `- Hôm nay: ${khachToday}\n` : "") +
      (lich ? `- Lịch xem sắp tới: ${lich}\n` : "") +
      (needHuman.length ? `- ⚠ CẦN NGƯỜI THẬT: ${needHuman.length} đơn đang chờ tiếp quản\n` : "") +
      dongHang +
      (avg
        ? `- Điểm chăm khách: ${avg}/5 (${scores.length} hội thoại). ${scores[0]?.comment ?? ""}`
        : `- Điểm chăm khách: chưa có hội thoại mới để chấm`);
    sections.push(body);
    saved.push({ ctv_id: ctv.id, body, scores });
  }

  const reportText = `Báo cáo CTV ${vnDate} (17h)\n\n${sections.join("\n\n")}`;

  let sentTo = "none";
  if (!dry_run) {
    // FR-149 (quyết định 25/08): báo cáo về Zalo CÁ NHÂN admin, không qua OA.
    // Đẩy vào reminders kind='report' → bridge acc clone kéo qua escalation-feed
    // và nhắn tới số admin trong bảng `admins`. Còn OA thì gửi thẳng luôn.
    const oaToken = await secretOf(client, "ZALO_OA_ACCESS_TOKEN");
    const adminId = await secretOf(client, "ZALO_ADMIN_ZALO_ID");
    const viaOa = !!oaToken && !!adminId && await sendZalo(oaToken, adminId, reportText);
    if (viaOa) {
      sentTo = `zalo_oa:${adminId}`;
    } else {
      await client.from("reminders").insert({
        kind: "report", due_at: new Date().toISOString(), note: reportText,
      });
      sentTo = "queued_bridge";
    }
    for (const s of saved) {
      await client.from("ctv_daily_reports").upsert({
        report_date: vnDate, ctv_id: s.ctv_id as string,
        body: s.body as string, scores: s.scores, sent_to: sentTo,
      }, { onConflict: "report_date,ctv_id" });
    }
  }

  return jsonResponse({ report_date: vnDate, dry_run, sent_to: sentTo, report: reportText });
});
