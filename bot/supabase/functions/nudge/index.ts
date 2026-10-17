// nudge — FR-133: hai loại "cú hích" chạy theo cron nudge-tick (30 phút):
// 1. promise: người ta hứa "chiều gửi ảnh/thông tin" → tới hẹn nhắc khéo MỘT tin.
// 2. reengage (v25, 04/09/2026 — chủ dự án chốt "giữ chân 5 ngày"): buyer im
//    ĐỦ 5 ngày → hỏi thăm MỘT lần cho mỗi lượt im (FR-60), góc xoay vòng tất
//    định (FR-61: căn cuối / mời xem ảnh / mời đặt lịch + ba góc cũ), kèm kho
//    "căn khác cùng khu" từ `can_cung_khu` (FR-62); im ≥ 6 ngày → BUỘC góc giữ
//    kết nối Zalo bằng mẫu cố định (FR-63), trước mốc Zalo xoá 7 ngày (INS-03).
// 3. (04/09/2026, migration 20260904d) match: tin mới khớp tiêu chí khách (FR-64,
//    trigger DB chèn) và feedback: hỏi cảm nhận 4 giờ sau buổi xem (FR-56, trigger
//    DB chèn khi nhắc `viewing` được đánh sent). Cả hai đi MẪU CỐ ĐỊNH, không gọi
//    model. Nhắc `viewing` kèm link bản đồ khi tin có toạ độ (FR-54).
// 4. (v25, migration 20260904f) thêm mẫu cố định: `sold` (căn khách quan tâm đã
//    chốt + căn thay thế, FR-108), `rating` (xin sao, FR-65 — dự phòng, chưa ai
//    chèn), `followup` có ghi chú "chủ nhà chưa phản hồi" (FR-110) hoặc "lịch
//    xem … đã được xác nhận" (FR-52); `feedback` thêm câu chấm sao (FR-65).
// POST {} (cron) | { dry_run?: bool } — trả về tóm tắt việc đã làm.
import {
  anthropicClient,
  doTien,
  escalationText,
  ghiLoi,
  jsonResponse,
  MODEL,
  secretOf,
  sendZalo,
  serviceClient,
} from "../_shared/claude.ts";
import { laTinNoiBo } from "../_shared/tin_nhac.ts";
import { congBiMat } from "../_shared/gate.ts";
import { SPEC_COLS, thongSoNgan, type SpecRow } from "../_shared/thong_so.ts";
import { dienTen, KHO_TEN_TRO_LY, tenTroLy, TONE_RULES } from "../_shared/prompts.ts";

// FR-61: kịch bản reengage — XOAY VÒNG TẤT ĐỊNH theo số lần đã hỏi thăm khách
// đó (mọi trạng thái) % số góc, không random: hai lượt chạy khác nhau cho cùng
// khách ra cùng góc, và khách quay lại lần sau nhận góc kế tiếp chứ không trúng
// lại góc cũ. Góc cần "căn cuối" (`can: true`) mà khách chưa có căn nào → nhảy
// sang góc kế. Góc giữ kết nối Zalo (FR-63) KHÔNG nằm trong vòng: nó bị BUỘC ở
// mốc ≥ 6 ngày và đi mẫu cố định (xem `KEEPALIVE`).
const ANGLES: { key: string; can: boolean; anh?: boolean; text: string }[] = [
  { key: "can_cuoi", can: true, text: "hỏi khách nghĩ sao về CĂN CUỐI (nêu đúng mã #), còn cân nhắc không hay muốn em tìm hướng khác" },
  { key: "tien_do", can: false, text: "hỏi thăm tiến độ tìm nhà, nhẹ nhàng, không thúc ép" },
  { key: "xem_anh", can: true, anh: true, text: "mời khách xem ẢNH THẬT của CĂN CUỐI (nêu mã #, nói em có sẵn ảnh), hỏi có muốn em gửi không" },
  { key: "tieu_chi", can: false, text: "hỏi xem tiêu chí có gì thay đổi không (giá/khu vực/loại nhà)" },
  { key: "dat_lich", can: true, text: "mời khách ĐẶT LỊCH XEM căn cuối (nêu mã #), gợi một khung giờ chung chung (cuối tuần hoặc chiều), hỏi tiện không" },
  { key: "thi_truong", can: false, text: "kể MỘT quan sát thị trường ngắn gọn thật thà (ví dụ khu người ta hay hỏi gần đây) rồi hỏi còn quan tâm không" },
];
// FR-63: mốc ≥ 6 ngày im. Mẫu cố định — chạy được cả khi key model hỏng, và
// câu "nhắn lại một chữ kẻo Zalo ngắt" phải đúng chữ, không để model diễn.
const KEEPALIVE = (goi: string) =>
  `${goi} ơi, em vẫn đang để mắt tìm căn hợp ý cho mình. Nhờ anh/chị nhắn lại em một chữ thôi, kẻo Zalo tự ngắt kết nối thì em không nhắn được nữa ạ 🙏`;
const MA_TIN = /#(BDS-[A-Z0-9]+-\d+)/i;

/**
 * Mẫu cố định cho các kind không cần model (OPEN-35 nghiêng mẫu câu): nội dung
 * là dữ liệu cột đã ghép sẵn trong `note` bởi trigger/hàm DB, model không có gì
 * để thêm ngoài rủi ro bịa, và mẫu chạy được cả khi key model hỏng. Giọng theo
 * TONE_RULES: xưng em, gọi anh/chị, không gạch dài, tối đa 1 emoji, tối đa 2
 * bong bóng (ở đây luôn 1). Trả `undefined` = kind này đi đường model.
 */
function mauCoDinh(
  r: { kind: string; note: string | null },
  goi: string,
  code: string | null | undefined,
): string | undefined {
  const note = (r.note ?? "").trim();
  if (r.kind === "match") {
    return `${goi} ơi, vừa có căn mới khớp tiêu chí mình đang tìm: ${note}. Anh/chị muốn em gửi hình hay hẹn xem không ạ?`;
  }
  if (r.kind === "feedback") {
    // FR-56 + FR-65 (thời điểm "sau xem nhà"): chat-reply bắt "N sao"/"N/5" → ghi_danh_gia
    return `${goi} xem căn ${code ? `#${code}` : "vừa rồi"} rồi thấy sao ạ? Ưng chỗ nào, chưa ưng chỗ nào để em lọc tiếp cho đúng ý. Tiện thì anh/chị chấm giúp em mấy sao (1-5) nha.`;
  }
  if (r.kind === "rating") {
    return `${goi} chấm giúp em 1 đến 5 sao cho lần tìm nhà vừa rồi nha, để em làm tốt hơn ạ.`;
  }
  if (r.kind === "sold") {
    // FR-108: note = "#mã đã chốt · thay thế: #a (…); #b (…)" (bao_can_da_chot)
    const [chot, thay] = note.split(" · thay thế: ");
    const ma = chot.match(MA_TIN)?.[0] ?? (code ? `#${code}` : "mình quan tâm");
    return thay
      ? `${goi} ơi, căn ${ma} mình quan tâm vừa được chốt với khách khác rồi ạ, em báo thật để mình khỏi chờ. Em có căn tương tự cùng khu: ${thay}. Anh/chị muốn xem thử không ạ?`
      : `${goi} ơi, căn ${ma} mình quan tâm vừa được chốt với khách khác rồi ạ, em báo thật để mình khỏi chờ. Tiêu chí của mình còn như cũ không, để em tìm căn khác liền?`;
  }
  if (r.kind === "followup" && /^chủ nhà chưa phản hồi/.test(note)) {
    // FR-110: note = "chủ nhà chưa phản hồi #mã, gợi ý căn khác: …" (info_request_timeout_tick)
    const [dau, thay] = note.split(", gợi ý căn khác: ");
    const ma = dau.match(MA_TIN)?.[0] ?? (code ? `#${code}` : "đó");
    return thay
      ? `${goi} ơi, câu mình hỏi về căn ${ma} chủ nhà vẫn chưa phản hồi, em không muốn để anh/chị chờ thêm. Em có căn khác cùng khu: ${thay}. Anh/chị xem thử không ạ?`
      : `${goi} ơi, câu mình hỏi về căn ${ma} chủ nhà vẫn chưa phản hồi, em không muốn để anh/chị chờ thêm. Em sẽ báo ngay khi chủ trả lời, anh/chị muốn em tìm thêm căn khác cùng khu không ạ?`;
  }
  if (r.kind === "followup" && /^lịch xem/.test(note)) {
    // FR-52: note = "lịch xem #mã đã được xác nhận: ok 9h" (info_request_bao_lai_khach)
    const ma = note.match(MA_TIN)?.[0] ?? (code ? `#${code}` : "");
    const ans = note.split(" đã được xác nhận: ")[1]?.trim();
    return `${goi} ơi, lịch xem căn ${ma} đã được chủ nhà xác nhận rồi ạ${ans ? ` (${ans})` : ""}. Em gặp anh/chị đúng giờ nha 🏠`;
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  // ── CỔNG (soát bảo mật 29/08/2026) ───────────────────────────────────────
  // Hàm này chạy verify_jwt=false và TRƯỚC 29/08 KHÔNG kiểm gì hết: POST tay
  // không kèm khoá là nhận nguyên danh sách lời nhắc, gọi phát nữa là bot NHẮN
  // THẬT cho khách. Cổng dùng chung `_shared/gate.ts` — cron mang
  // `x-bridge-secret` (xem `nudge_tick`).
  const client = serviceClient();
  const chan = await congBiMat(req, client, "nudge");
  if (chan) return chan;

  // FR-166: dấu tay của lượt chạy này, ghi vào `reminders.locked_by` để nhìn
  // ra ai đang giữ việc khi có hai worker chạy chồng nhau.
  const workerId = `nudge-${crypto.randomUUID().slice(0, 8)}`;
  const { dry_run = false, force = false } = await req.json().catch(() => ({}));
  // Giờ giấc con người (docs/06 §6.8): chỉ chủ động nhắn trong 8h-21h giờ VN;
  // ngoài cửa sổ thì để nhịp cron sau xử — reminder vẫn pending, không mất.
  const vnHour = (new Date(Date.now() + 7 * 3600e3)).getUTCHours();
  if (!force && (vnHour < 8 || vnHour >= 21)) {
    return jsonResponse({ done: 0, skipped: "quiet_hours", vn_hour: vnHour });
  }
  // Lệch phút để không gửi đúng boong :00/:30 như máy — nay nằm ở LỊCH CRON
  // (`7,37 1-13 * * *`, migration 20260902c), không ngủ trong lambda nữa: đoạn
  // ngủ ngẫu nhiên tới 45 s cộng vài lượt model là vượt trần 55 s của
  // `nudge_tick`, pg_net ghi timeout và `bot_health_tick` ghi lỗi giả (FR-171 d).
  // FR-166: MỌI đường báo hỏng đi qua đây. `bao_hong_nhac` đẩy `next_retry_at`
  // và lật sang `dead` khi quá 5 lượt — tức nó GHI ĐÈ lời nhắc THẬT. Trước bản
  // này ba chỗ gọi thẳng nó nằm ngoài mọi guard `!dry_run`, nên một lượt chạy
  // thử với key model hỏng (`!anthropic`) quét đúng 5 dòng pending có thật rồi
  // đẩy hết sang thư chết — lượt "chỉ xem, không đụng" mà xoá được lời hứa với
  // khách. `dry_run` đã cố ý KHÔNG giành việc (không tăng `attempts`) ở hai chỗ
  // claim bên dưới; cổng này giữ nốt nửa còn lại của cùng lời hứa đó.
  const baoHongNhac = async (id: string, detail: string) => {
    if (dry_run) return;
    await client.rpc("bao_hong_nhac", { p_id: id, p_detail: detail });
  };
  // FR-166: khối leo thang KHÔNG cần model. Để `anthropicClient` ném thẳng ra
  // ngoài là một cái key hỏng kéo sập cả lượt chạy, kể cả phần chẳng liên quan
  // tới AI. Cùng lưới đã dựng cho chat-reply ở OPEN-30.
  let anthropic: Awaited<ReturnType<typeof anthropicClient>> | null = null;
  try {
    anthropic = await anthropicClient(client);
  } catch (e) {
    await ghiLoi(client, "nudge anthropicClient", e);
  }
  const oaToken = await secretOf(client, "ZALO_OA_ACCESS_TOKEN");
  // FR-138: tone cấu hình được từ bảng bot_prompts (sửa ở dashboard, khỏi deploy)
  const { data: toneRow } = await client.from("bot_prompts")
    .select("content").eq("key", "tone_rules").maybeSingle();
  // FR-181: tone viết "{ten}" — điền tên trợ lý riêng của người nhận (cùng hàm
  // băm với chat-reply, nên cùng Zalo ID là cùng tên) ngay trước mỗi lượt gọi.
  const TONE_MAU = toneRow?.content ?? TONE_RULES;
  const toneCua = (zalo?: string | null) => dienTen(TONE_MAU, zalo ? tenTroLy(zalo) : KHO_TEN_TRO_LY[0]);
  const out: Record<string, unknown>[] = [];

  // ---- 0. Escalation (FR-140): khách hỏi căn không có chính chủ → báo CTV/admin.
  // Tin nội bộ, không cần model. Gửi OA được thì đánh sent; không có kênh thì
  // GIỮ pending — bridge acc clone sẽ kéo qua escalation-feed và tự ack.
  // FR-147: "cần người thật" quá 30 phút mà chưa ai gõ tay (human_touch_at cũ
  // hơn needs_human_at) → leo tiếp lên admin, đánh dấu human_escalated_at để
  // khỏi báo lặp. Người thật vào chat là chat-reply tự hạ cờ + huỷ nhắc.
  const { data: stuck } = await client.from("conversations")
    .select("id, buyer_id, needs_human_at, human_touch_at, human_escalated_at, buyers(name)")
    .eq("needs_human", true)
    .lte("needs_human_at", new Date(Date.now() - 30 * 60e3).toISOString())
    .is("human_escalated_at", null)
    .limit(10);
  for (const c of stuck ?? []) {
    if (c.human_touch_at && Date.parse(c.human_touch_at as string) >= Date.parse(c.needs_human_at as string)) continue;
    const who = (c.buyers as { name?: string | null } | null)?.name;
    if (!dry_run) {
      // 13/09/2026 (review code): bản trước ĐỌC `human_escalated_at IS NULL` rồi
      // chèn nhắc rồi mới lật cờ — hai lượt chạy chồng nhau cùng thấy null và cùng
      // chèn, admin nhận hai tin ⚠️. Đúng hình lỗi khối nhắc bên dưới đã vá bằng
      // `nhan_viec_nhac`. Nay GIÀNH TRƯỚC: lật cờ có điều kiện IS NULL (một câu
      // UPDATE, Postgres tự khoá dòng) — lượt nào lật được mới chèn.
      const { data: giu, error: giuErr } = await client.from("conversations")
        .update({ human_escalated_at: new Date().toISOString() })
        .eq("id", c.id).is("human_escalated_at", null).select("id");
      if (giuErr) {
        await ghiLoi(client, "nudge giành leo thang", giuErr.message);
        continue;
      }
      if (!giu?.length) continue; // lượt khác đã giành
      const { error: insErr } = await client.from("reminders").insert({
        kind: "escalation", buyer_id: c.buyer_id, ctv_id: null,
        due_at: new Date().toISOString(),
        note: `⚠️ khách${who ? ` ${who}` : ""} cần người thật đã 30 phút mà CTV chưa vào. Anh/chị xử giúp`,
      });
      if (insErr) {
        // Chèn hỏng thì trả cờ về, kẻo cờ đã lật mà không ai được báo — lượt sau thử lại.
        await ghiLoi(client, "nudge chèn nhắc leo thang", insErr.message);
        await client.from("conversations").update({ human_escalated_at: null }).eq("id", c.id);
        continue;
      }
    }
    out.push({ kind: "escalate_admin", conversation: c.id });
  }

  // FR-166 bất biến 13 — GIÀNH VIỆC TRƯỚC, GỬI SAU.
  // Trước bản này khối này SELECT thẳng status='pending' rồi gửi rồi mới đánh
  // 'sent'. Hai lượt chạy chồng nhau (cron gối nhau, hoặc gọi tay lúc cron
  // đang chạy) cùng thấy một dòng pending và CÙNG GỬI — khách nhận hai tin y
  // hệt. `nhan_viec_nhac` lật cờ thuê atomic bằng `for update skip locked`,
  // nên chỉ một lượt cầm được việc.
  // `dry_run` KHÔNG được giành việc: giành là tăng `attempts`, mà năm lượt chạy
  // thử là đủ đẩy lời nhắc THẬT vào thư chết dù chưa gửi đi đâu cả. Chạy thử
  // thì chỉ nhìn, đọc thẳng bảng.
  const escClaimRes = dry_run
    ? await client.from("reminders").select("id")
      .eq("status", "pending").in("kind", ["escalation", "report"])
      .lte("due_at", new Date().toISOString()).limit(10)
    : await client.rpc("nhan_viec_nhac", {
      p_kinds: ["escalation", "report"], p_limit: 10, p_worker: workerId,
    });
  const { data: escClaim, error: escErr } = escClaimRes;
  if (escErr) await ghiLoi(client, "nudge nhan_viec_nhac(esc)", escErr.message);
  const escIds = (escClaim ?? []).map((r: { id: string }) => r.id);
  // Giành xong mới lấy kèm quan hệ — RPC trả cột trần, không kèm join được.
  const { data: escDue } = escIds.length
    ? await client.from("reminders")
      .select("id, kind, note, ctv_id, seller_id, ctvs(name, zalo_user_id), sellers(name, zalo_user_id)")
      .in("id", escIds)
    : { data: [] as never[] };
  for (const r of escDue ?? []) {
    const ctv = r.ctvs as { name?: string | null; zalo_user_id?: string | null } | null;
    const seller = r.sellers as { name?: string | null; zalo_user_id?: string | null } | null;
    // Tin nội bộ (❓ 😟 🩺…) KHÔNG BAO GIỜ đi tới chủ nhà dù dòng việc gắn `seller_id` (`laTinNoiBo`, 01/10/2026).
    let target = (laTinNoiBo(r.note) ? null : seller?.zalo_user_id) ?? ctv?.zalo_user_id ?? null;
    if (!target) {
      const { data: adm } = await client.from("admins")
        .select("zalo_user_id").not("zalo_user_id", "is", null).limit(1).maybeSingle();
      target = adm?.zalo_user_id ?? (await secretOf(client, "ZALO_ADMIN_ZALO_ID"));
    }
    const text = escalationText(r);
    let sent = "none";
    if (!dry_run) {
      if (target && oaToken && !target.startsWith("TEST")) {
        sent = (await sendZalo(oaToken, target, text)) ? "zalo_oa" : "zalo_error";
        if (sent === "zalo_oa") {
          await client.from("reminders")
            .update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", r.id);
        } else {
          // FR-166 bất biến 6/7: nhả hợp đồng thuê + hẹn giờ lùi dần; quá 5 lần
          // thì cho vào thư chết thay vì đập lại OA mỗi 30 phút đến hết đời.
          await baoHongNhac(r.id, "gửi OA hụt");
        }
      } else {
        // Thiếu đích hoặc thiếu token OA: việc này KHÔNG phải của đường OA, nó
        // nằm chờ bridge kéo qua `escalation-feed`. Trả lại nguyên vẹn — giữ
        // hợp đồng thuê là khoá vô ích, còn để `attempts` tăng mỗi nửa tiếng là
        // biến bộ đếm thành lời nói dối (FR-166: chưa thử thì không tính là đã
        // thử). Lỗi này lộ ra khi soi DB sau lượt cron thật đầu tiên.
        // `p_worker` BẮT BUỘC truyền: nhả mà không kiểm ai đang giữ thì một
        // worker treo quá hạn có thể xoá khoá của worker đang chạy, mở đường
        // cho worker thứ ba giành cùng dòng (H2, migration 20260829f).
        await client.rpc("nha_viec_nhac", { p_id: r.id, p_worker: workerId });
      }
    }
    out.push({ kind: r.kind, id: r.id, text, sent });
  }

  // Con mắt bù cho chỗ `nha_viec_nhac` cố ý không có trần thử lại: dòng
  // escalation/report nào nằm chờ quá 24h nghĩa là bridge không tới lấy, và vì
  // mỗi nhịp lại nhả ra nên `attempts` luôn về 0 — không có gì tự lộ. Hàm DB tự
  // ghi `bot_errors` khi đếm > 0 (van của `log_loi` chặn spam).
  if (!dry_run) {
    const { error: treoErr } = await client.rpc("bo_dem_nhac_treo", { p_gio: 24 });
    if (treoErr) await ghiLoi(client, "nudge bo_dem_nhac_treo", treoErr.message);
  }

  // ---- 1. Reminder tới hạn: lời hứa / nhắc lịch xem / follow-up căn (FR-32) /
  //         tin mới khớp (FR-64) / cảm nhận sau xem (FR-56) / căn đã chốt
  //         (FR-108) / xin sao (FR-65) ----
  // FR-202 d: nhắc CHỦ NHÀ trước buổi xem — người mở cửa là họ, mà trước đây
  // chỉ khách được nhắc. Một dòng `reminders` riêng, đích `seller_id`, tin mẫu
  // cố định (không gọi model) cất sẵn trong `noi_dung_gui`; bridge Zalo clone
  // kéo qua escalation-feed như mọi lời nhắc lúc chưa có OA.
  // `viewing_id` để TRỐNG có chủ ý: chỉ mục `reminders_mot_nhac_moi_buoi_xem_idx`
  // cho mỗi buổi xem đúng MỘT nhắc pending (của khách), và trigger hỏi cảm nhận
  // (FR-56) chỉ chạy khi có `buyer_id` — dòng của chủ nhà không được đẻ ra câu
  // "xem rồi thấy sao ạ" gửi nhầm cho chủ.
  type ChuNha = { name?: string | null; zalo_user_id?: string | null; phone?: string | null } | null;
  type VwChu = {
    time_text?: string | null;
    status?: string | null;
    listings?: { id?: string; code?: string | null; seller_id?: string | null; sellers?: ChuNha } | null;
  } | null;
  const nhacChuNha = async (r: { note: string | null; viewings: unknown }) => {
    const vw = r.viewings as VwChu;
    const l = vw?.listings;
    const chu = l?.sellers;
    if (!vw || !l?.id || !l.seller_id || !chu) return;
    if (vw.status === "cancelled" || vw.status === "done") return;
    // Không Zalo ID lẫn SĐT thì bridge không có đường nào tới — đừng đẻ dòng treo.
    if (!chu.zalo_user_id && !chu.phone) return;
    if (chu.zalo_user_id?.startsWith("TEST")) return;
    const note = `chủ nhà: ${r.note ?? `lịch xem #${l.code ?? ""}`}`;
    // Lượt thử lại của nhắc khách (báo hỏng, lùi dần) chạy lại đúng chỗ này.
    const { count } = await client.from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("kind", "viewing").eq("seller_id", l.seller_id).eq("note", note)
      .neq("status", "cancelled");
    if ((count ?? 0) > 0) return;
    const goi = chu.name ? `Anh/chị ${chu.name}` : "Anh/chị";
    const gio = vw.time_text ?? "";
    const text = `${goi} ơi, em là ${tenTroLy(chu.zalo_user_id ?? l.seller_id)} nè. ` +
      `Em nhắc anh/chị: có khách hẹn xem căn ${l.code ? `#${l.code}` : "của mình"}${gio ? ` lúc ${gio}` : ""}. ` +
      `Anh/chị sắp xếp mở cửa giúp em nha, đổi giờ thì nhắn em liền ạ 🏠`;
    const { error } = await client.from("reminders").insert({
      kind: "viewing", seller_id: l.seller_id, listing_id: l.id,
      due_at: new Date().toISOString(), note, noi_dung_gui: text,
    });
    if (error) await ghiLoi(client, "nudge nhac chu nha", error.message);
  };

  const DUE_KINDS = ["promise", "viewing", "followup", "match", "feedback", "sold", "rating"];
  const dueClaimRes = dry_run
    ? await client.from("reminders").select("id")
      .eq("status", "pending").in("kind", DUE_KINDS).is("noi_dung_gui", null)
      .lte("due_at", new Date().toISOString()).limit(5)
    : await client.rpc("nhan_viec_nhac", {
      p_kinds: DUE_KINDS, p_limit: 5, p_worker: workerId,
    });
  const { data: dueClaim, error: dueErr } = dueClaimRes;
  if (dueErr) await ghiLoi(client, "nudge nhan_viec_nhac(due)", dueErr.message);
  const dueIds = (dueClaim ?? []).map((r: { id: string }) => r.id);
  // FR-54/56: nhắc `viewing` (chat-reply tạo) chỉ có `viewing_id`, tin nằm ở
  // `viewings.listing_id` — kéo toạ độ + mã qua hai đường: `listings` thẳng
  // (match/feedback/followup) và `viewings → listings` (viewing).
  // 15/09/2026: nhúng lồng `listings(... sellers(...))` PHẢI chỉ tên khoá ngoại —
  // `listings ↔ sellers` có hai quan hệ nên PostgREST trả PGRST201, và bản trước
  // không đọc `error`: cả lượt nhắc rơi im. Xem ask-seller cùng ngày.
  const { data: due, error: docDueErr } = dueIds.length
    ? await client.from("reminders")
      .select("id, kind, note, buyer_id, seller_id, listing_id, viewing_id, buyers(name, zalo_user_id), sellers(name, zalo_user_id), listings(code, lat, lng), viewings(time_text, status, listings(id, code, lat, lng, seller_id, sellers!listings_seller_id_fkey(name, zalo_user_id, phone)))")
      .in("id", dueIds)
    : { data: [] as never[], error: null };
  if (docDueErr) await ghiLoi(client, "nudge doc nhac den han", docDueErr.message);

  type TinToaDo = { code?: string | null; lat?: number | null; lng?: number | null } | null;
  for (const r of due ?? []) {
    const who = (r.buyers ?? r.sellers) as { name?: string | null; zalo_user_id?: string | null } | null;
    const tin: TinToaDo = (r.listings as TinToaDo) ??
      ((r.viewings as { listings?: TinToaDo } | null)?.listings ?? null);
    // Chưa biết tên thì gọi "anh/chị" — cấm model bịa tên (nó hay mượn tên trong ví dụ tone)
    const whoLabel = who?.name
      ? `Anh/chị ${who.name}`
      : "Khách (CHƯA biết tên - xưng hô 'anh/chị' chung, TUYỆT ĐỐI không bịa tên)";
    // FR-32: nạp chi tiết căn để "gửi thêm thông tin" có nội dung thật, không bịa
    let canInfo = "";
    if (r.kind === "followup" && r.listing_id) {
      const { data: l } = await client.from("listings")
        .select(`code, ward, location_raw, price_raw, area_m2, bedrooms, ${SPEC_COLS}, listing_facts(question, answer)`) // FR-172
        .eq("id", r.listing_id).maybeSingle();
      if (l) {
        const facts = ((l.listing_facts ?? []) as Array<{ question: string; answer: string }>)
          .map((f) => `${f.question}: ${f.answer}`).join("; ");
        // FR-172: thông số có cấu trúc đi kèm — "chi tiết đáng giá" để kể thêm
        // (hẻm xe hơi, sổ hồng riêng, 3 lầu) giờ có sẵn trong cột, không cần fact.
        canInfo = `#${l.code} · ${l.location_raw ?? ""} ${l.ward ?? ""} · ${l.price_raw ?? ""} · ${l.area_m2 ?? "?"}m2${l.bedrooms ? ` · ${l.bedrooms}PN` : ""}${thongSoNgan(l as SpecRow)}${facts ? ` · đã xác minh từ chủ nhà: ${facts}` : ""}`;
      }
    }
    // FR-64/56/108/65/110/52: các kind có MẪU CỐ ĐỊNH đi trước, không gọi model.
    let text: string | undefined = mauCoDinh(
      r as { kind: string; note: string | null },
      who?.name ? `Anh/chị ${who.name}` : "Anh/chị",
      tin?.code,
    );
    if (text === undefined) {
      // FR-166: model 500 / hết giờ là chuyện thường. Không bọc thì exception
      // thoát khỏi CẢ vòng lặp — những lời nhắc còn lại mất lượt, mà chúng đã bị
      // giành (locked_at) nên treo 5 phút mới ai đụng lại được.
      if (!anthropic) {
        await baoHongNhac(r.id, "khong co client model");
        continue;
      }
      let resp;
      try {
        resp = await anthropic.messages.create({
        model: MODEL, max_tokens: 256,
        output_config: { effort: "low" },
        system: [{ type: "text", text: toneCua(who?.zalo_user_id), cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          content: r.kind === "viewing"
            ? `${whoLabel} có ${r.note} (sắp tới giờ). Soạn MỘT tin Zalo RẤT NGẮN nhắc lịch theo mẫu §6.8: "Em là ${who?.zalo_user_id ? tenTroLy(who.zalo_user_id) : KHO_TEN_TRO_LY[0]}, có hẹn xem nhà với anh/chị lúc … Hẹn gặp anh/chị nha." Thân thiện, không markdown.`
            // FR-140 c (02/09): chủ nhà vừa trả lời câu khách hỏi → báo lại ĐÚNG câu
            // trả lời, không phải "kể thêm một chi tiết". Trigger DB đặt ghi chú bắt
            // đầu bằng "chủ nhà vừa trả lời" (20260902h).
            : r.kind === "followup" && /^chủ nhà vừa trả lời/.test(r.note ?? "")
            ? `${whoLabel} trước đó hỏi một điều về căn ${canInfo ? `(${canInfo})` : ""} mà em phải đi hỏi chủ nhà. Giờ ${r.note}. ` +
              `Soạn MỘT tin Zalo NGẮN (1-2 câu) báo lại cho khách ĐÚNG câu trả lời của chủ nhà (nói chắc vì chủ đã xác nhận; KHÔNG thêm chi tiết nào chủ không nói), rồi kết bằng một câu hỏi nhẹ (còn muốn hỏi gì nữa / muốn qua xem không).`
            : r.kind === "followup"
            ? `${whoLabel} hỏi về căn này rồi im ~2-3 tiếng: ${canInfo || r.note}. ` +
              `Soạn MỘT tin Zalo NGẮN (1-2 câu) CHỦ ĐỘNG kể thêm MỘT chi tiết đáng giá về đúng căn đó (chỉ từ dữ liệu trên, không bịa; chưa xác minh thì không khẳng định). Không thúc ép, kết bằng câu hỏi nhẹ hoặc một câu khẳng định rồi chờ.`
            : `${whoLabel} có hứa: "${r.note}". Giờ đã tới hẹn. ` +
              `Soạn MỘT tin Zalo RẤT NGẮN (~20 từ) nhắc khéo - thân thiện, KHÔNG trách móc, cho đường lùi ("khi nào tiện anh/chị gửi em nha").`,
        }],
      });
      } catch (e) {
        await ghiLoi(client, "nudge model(nhac)", e);
        await baoHongNhac(r.id, `model: ${String(e).slice(0, 120)}`);
        continue;
      }
      await doTien(client, resp.usage); // FR-171 e: đồng hồ tiền đếm cả lượt nhắc
      text = resp.content.find((b) => b.type === "text")?.text?.trim();
      if (!text) {
        await baoHongNhac(r.id, "model tra rong");
        continue;
      }
      // FR-54: nhắc lịch xem kèm ghim bản đồ — CHỈ khi tin có toạ độ (điền bởi
      // `geocode-listings`, FR-122); không có thì không bịa link.
      if (r.kind === "viewing" && tin?.lat != null && tin?.lng != null) {
        text += `\nBản đồ: https://maps.google.com/?q=${tin.lat},${tin.lng}`;
      }
    }

    if (!dry_run && r.kind === "viewing" && r.buyer_id) await nhacChuNha(r);

    let sent = "none";
    if (!dry_run) {
      if (who?.zalo_user_id && oaToken && !who.zalo_user_id.startsWith("TEST")) {
        sent = (await sendZalo(oaToken, who.zalo_user_id, text)) ? "zalo_oa" : "zalo_error";
      }
      // CHƯA CÓ OA → GỬI QUA ZALO CLONE (chủ dự án 11/09: "có zalo clone rồi mà,
      // dùng zalo clone gửi cho id zalo"). Cất tin đã soạn vào `noi_dung_gui`,
      // nhả hợp đồng thuê, GIỮ `pending`; `escalation-feed` đưa nó cho bridge,
      // bridge gửi bằng acc clone tới đúng Zalo ID rồi ack → lúc đó mới `sent`.
      //
      // Hai bản trước đều sai theo hai kiểu khác nhau:
      //   · đánh `sent` ngay dù không gửi đi đâu (review 10/09, mục C1);
      //   · bản vá C1 "để pending cho bridge kéo" — nhưng bridge chỉ kéo cửa
      //     escalation-feed, mà cửa đó KHÔNG có loại này, nên không ai kéo; còn
      //     `nhan_viec_nhac` nhận lại sau 5 phút và model soạn lại mãi mãi.
      // `nhan_viec_nhac` nay bỏ qua dòng đã có `noi_dung_gui` (20260911b).
      if (sent === "none" && who?.zalo_user_id && !who.zalo_user_id.startsWith("TEST")) {
        const { error: cbErr } = await client.from("reminders")
          .update({ noi_dung_gui: text, locked_at: null, locked_by: null })
          .eq("id", r.id);
        if (cbErr) await ghiLoi(client, "nudge cat tin cho bridge", cbErr.message);
        out.push({ kind: r.kind, id: r.id, text, sent: "cho_bridge" });
        continue;
      }
      // Không OA mà cũng không biết Zalo ID người nhận → không có đường nào
      // tới nơi. Báo hỏng (lùi dần, quá 5 lượt thành `dead`) thay vì đánh `sent`.
      if (sent === "none" && !who?.zalo_user_id) {
        await baoHongNhac(r.id, "chưa có OA và người nhận chưa có zalo_user_id");
        out.push({ kind: r.kind, id: r.id, text, sent, retry: true });
        continue;
      }
      if (sent === "zalo_error") {
        // Gửi lỗi → GIỮ pending cho nhịp cron sau thử lại, đừng nuốt mất lời nhắc.
        // FR-166: nhả hợp đồng thuê + hẹn giờ theo luật lùi dần. Không nhả thì
        // dòng này bị khoá 5 phút vô ích; không hẹn giờ thì cứ 30 phút lại đập
        // vào OA đúng cái đang hỏng, và không bao giờ dừng.
        await baoHongNhac(r.id, "gửi OA hụt");
        out.push({ kind: r.kind, id: r.id, text, sent, retry: true });
        continue;
      }
      // Tin bot CHỦ ĐỘNG gửi cũng là một dòng trong sổ — cả phía mua lẫn phía
      // bán. Trước bản này chỉ ghi khi có buyer_id, nên hội thoại người bán
      // hiện ra toàn câu trả lời mà không có câu hỏi nào: CTV tiếp quản không
      // biết chủ nhà đang trả lời cái gì (FR-141/FR-152).
      let convLog: string | null = null;
      if (r.buyer_id) {
        const { data: conv } = await client.from("conversations").select("id")
          .eq("buyer_id", r.buyer_id).order("started_at", { ascending: false }).limit(1).maybeSingle();
        convLog = conv?.id ?? null;
      } else if (r.seller_id) {
        const { data: sc, error: scErr } = await client
          .rpc("ensure_seller_conversation", { p_seller_id: r.seller_id, p_channel: "zalo_oa" })
          .single();
        convLog = (sc as { c_id?: string } | null)?.c_id ?? null;
        if (scErr || !convLog) {
          await ghiLoi(client, "nudge ensure_seller_conversation", scErr?.message ?? "không trả về c_id");
        }
      }
      if (convLog) {
        const { error: logErr } = await client.from("messages")
          .insert({ conversation_id: convLog, sender: "bot", body: text });
        if (logErr) await ghiLoi(client, "nudge messages bot", logErr.message);
        // (`last_message_at` do trigger trên `messages` đẩy — 20260902d.)
      }
      // FR-56: đánh `sent` cho nhắc `viewing` là trigger DB
      // `trg_reminders_hen_hoi_cam_nhan` (20260904d) tự chèn `feedback` hẹn
      // giờ xem + 4h — cùng transaction, không cần thêm lượt ghi/catch ở đây;
      // `dry_run` không đánh sent nên cũng không sinh gì.
      await client.from("reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", r.id);
    }
    out.push({ kind: r.kind, id: r.id, text, sent });
  }

  // ---- 2. Buyer im lặng ĐỦ 5 ngày (FR-60, chủ dự án chốt 04/09/2026) ----
  // FR-166: DỌN DÒNG GIỮ CHỖ MỒ CÔI trước đã.
  // Đường bình thường đóng dòng giữ chỗ trong vài giây: gửi xong → `sent`,
  // gửi hụt → `cancelled`, model ném hoặc trả rỗng → xoá. Còn `pending` quá 15
  // phút chỉ có một nghĩa: instance bị thu hồi giữa lúc gọi model, không ai
  // đóng dòng đó nữa. Mà `reminders_mot_reengage_cho_idx` chỉ cho MỘT dòng
  // reengage pending mỗi khách, nên dòng mồ côi KHOÁ CỨNG đúng khách ấy —
  // không bao giờ được hỏi thăm lần nữa, không một dòng lỗi nào, và chẳng ai
  // biết cho tới lúc soi tay. `nudge` là nơi DUY NHẤT ghi `kind='reengage'`
  // (đã soát 29/08) nên quét ở đây là đủ, khỏi thêm cron riêng.
  if (!dry_run) {
    const { data: donRows, error: donErr } = await client.from("reminders")
      .update({ status: "cancelled", last_error: "mo coi - instance chet giua chung" })
      .eq("kind", "reengage").eq("status", "pending")
      .lt("created_at", new Date(Date.now() - 15 * 60e3).toISOString())
      .select("id");
    if (donErr) await ghiLoi(client, "nudge don reengage mo coi", donErr.message);
    else if (donRows?.length) {
      out.push({ kind: "don_reengage_mo_coi", so: donRows.length });
    }
  }

  const now = Date.now();
  // Cửa sổ: im từ 5 ngày tới 7 ngày. Quá 7 ngày Zalo đã tự ngắt (INS-03), nhắn
  // cũng không tới; dưới 5 ngày là chưa tới mốc chủ dự án chốt.
  const { data: quiet } = await client
    .from("buyers")
    .select("id, name, zalo_user_id, preferences, last_contact_at")
    .gte("last_contact_at", new Date(now - 7 * 864e5).toISOString())
    .lte("last_contact_at", new Date(now - 5 * 864e5).toISOString())
    .limit(20);

  let reengaged = 0;
  for (const b of quiet ?? []) {
    if (reengaged >= 5) break;
    const imNgay = (now - Date.parse(b.last_contact_at as string)) / 864e5;
    // FR-60: MỘT lần cho mỗi LƯỢT IM — đếm các lời hỏi thăm tạo SAU lần khách
    // nhắn cuối (mọi trạng thái, kể cả gửi hụt — giữ nhịp không làm phiền).
    // FR-63: im ≥ 6 ngày mà lượt này chưa có câu giữ kết nối → BUỘC, không random,
    // kể cả khi đã hỏi thăm ở mốc 5 ngày (đó là hai việc khác nhau: một là hỏi
    // thăm, một là cứu kết nối trước mốc 7 ngày).
    const { data: luotNay, error: luotErr } = await client.from("reminders").select("note")
      .eq("buyer_id", b.id).eq("kind", "reengage")
      .gte("created_at", b.last_contact_at as string);
    if (luotErr) { await ghiLoi(client, "nudge luot im", luotErr.message); continue; }
    const daGiuKetNoi = (luotNay ?? []).some((x) => /^giu_ket_noi/.test(x.note ?? ""));
    const daHoiTham = (luotNay ?? []).length > 0;
    const keepalive = imNgay >= 6 && !daGiuKetNoi;
    if (!keepalive && daHoiTham) continue;

    const { data: conv } = await client.from("conversations").select("id")
      .eq("buyer_id", b.id).order("started_at", { ascending: false }).limit(1).maybeSingle();
    let lastBot: string[] = [];
    let botMsgs: string[] = [];
    if (conv) {
      const { data: msgs } = await client.from("messages").select("body")
        .eq("conversation_id", conv.id).eq("sender", "bot")
        .order("created_at", { ascending: false }).limit(10);
      botMsgs = (msgs ?? []).map((m) => m.body as string);
      lastBot = botMsgs.slice(0, 2);
    }
    const goi = b.name ? `Anh/chị ${b.name}` : "Anh/chị";

    // FR-61: CĂN CUỐI khách được gửi/hỏi — tin bot gần nhất có mã, không có thì
    // `interests` mới nhất. Chỉ tính khi căn còn trên kệ (đã chốt thì có `sold`
    // lo, FR-108). Ảnh thật đếm qua `listing_photos_v` (FR-165).
    type CanCuoi = { id: string; code: string; tomTat: string; anh: number };
    let canCuoi: CanCuoi | null = null;
    if (!keepalive) {
      let maCuoi = botMsgs.map((m) => m.match(MA_TIN)?.[1]?.toUpperCase()).find(Boolean) ?? null;
      if (!maCuoi) {
        const { data: it } = await client.from("interests").select("listings(code)")
          .eq("buyer_id", b.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        maCuoi = (it?.listings as { code?: string } | null)?.code ?? null;
      }
      if (maCuoi) {
        const { data: l } = await client.from("listings")
          .select("id, code, ward, district, price_raw, area_m2, status")
          .eq("code", maCuoi).in("status", ["dang_ban", "dang_quan_tam"]).maybeSingle();
        if (l) {
          const { count: soAnh } = await client.from("listing_photos_v")
            .select("path", { count: "exact", head: true }).eq("code", l.code);
          canCuoi = {
            id: l.id, code: l.code, anh: soAnh ?? 0,
            tomTat: `#${l.code} · ${l.ward ?? ""}${l.district ? `, ${l.district}` : ""}${l.price_raw ? ` · ${l.price_raw}` : ""}${l.area_m2 ? ` · ${l.area_m2}m2` : ""}`,
          };
        }
      }
    }
    // FR-62: kho "căn khác cùng khu" (cùng phường/quận, giá 0,7–1,15×, trừ căn đã gửi)
    let kho: string[] = [];
    if (!keepalive) {
      const { data: k, error: kErr } = await client.rpc("can_cung_khu", {
        p_buyer_id: b.id, p_listing_id: canCuoi?.id ?? null, p_limit: 3,
      });
      if (kErr) await ghiLoi(client, "nudge can_cung_khu", kErr.message);
      kho = ((k ?? []) as { tom_tat: string }[]).map((x) => x.tom_tat);
    }
    // FR-61: góc xoay vòng tất định — chỉ số = số lần đã hỏi thăm khách này.
    let angle = ANGLES[0];
    if (!keepalive) {
      const { count: daHoi } = await client.from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("buyer_id", b.id).eq("kind", "reengage");
      const bat = (daHoi ?? 0) % ANGLES.length;
      for (let i = 0; i < ANGLES.length; i++) {
        const a = ANGLES[(bat + i) % ANGLES.length];
        if (a.can && !canCuoi) continue;
        if (a.anh && !(canCuoi && canCuoi.anh > 0)) continue;
        angle = a;
        break;
      }
    }
    const noteAngle = keepalive
      ? "giu_ket_noi: nhắc giữ kết nối Zalo trước mốc 7 ngày (FR-63, im ≥ 6 ngày)"
      : `${angle.key}: ${angle.text}`;

    // FR-166 bất biến 13 — GIỮ CHỖ TRƯỚC, GỬI SAU.
    // Trước bản này: ĐẾM xem đã hỏi thăm chưa → gửi → mới ghi vết. Hai lượt
    // chạy chồng nhau cùng đếm ra 0 và CÙNG GỬI. Nay chèn dòng `pending`
    // TRƯỚC, index duy nhất khiến bên thua nhận 23505 rồi nhường.
    // Góc giữ kết nối là mẫu cố định nên không cần model — key hỏng vẫn cứu
    // được kết nối, đó là việc quan trọng nhất của khối này.
    if (!keepalive && !anthropic) continue;
    let giuCho: string | null = null;
    if (!dry_run) {
      const { data: cho, error: choErr } = await client.from("reminders").insert({
        kind: "reengage", buyer_id: b.id, due_at: new Date().toISOString(),
        note: noteAngle, status: "pending",
      }).select("id").single();
      if (choErr) {
        // 23505 = thua cuộc đua với lượt chạy song song. ĐÚNG như thiết kế:
        // index duy nhất là trọng tài, bên thua nhường, không ồn ào.
        // Mọi mã khác (hết quyền, sai ràng buộc, mất kết nối) là hỏng THẬT và
        // phải vào sổ — `continue` trần nuốt sạch cả hai loại như nhau, đúng
        // kiểu hỏng im lặng FR-152 d cấm.
        if (choErr.code !== "23505") {
          await ghiLoi(client, "nudge giu cho reengage", choErr.message);
        }
        continue;
      }
      giuCho = cho?.id ?? null;
    }

    let text: string | undefined;
    if (keepalive) {
      text = KEEPALIVE(goi);
    } else {
      let resp;
      try {
        resp = await anthropic!.messages.create({
          model: MODEL, max_tokens: 256,
          output_config: { effort: "low" },
          system: [{ type: "text", text: toneCua(b.zalo_user_id as string | null), cache_control: { type: "ephemeral" } }],
          messages: [{
            role: "user",
            content:
              `Khách${b.name ? ` tên ${b.name}` : ""} là NGƯỜI MUA đang TÌM nhà (họ KHÔNG bán - đừng nhầm vai). Hồ sơ nhu cầu tìm mua: ${JSON.stringify(b.preferences ?? {})}. Im lặng ${Math.floor(imNgay)} ngày.\n` +
              (canCuoi ? `CĂN CUỐI khách được gửi/hỏi: ${canCuoi.tomTat}${canCuoi.anh > 0 ? ` · em có ${canCuoi.anh} ảnh thật` : " · chưa có ảnh"}.\n` : "Chưa có căn nào cụ thể.\n") +
              (kho.length ? `KHO CÙNG KHU (chỉ được nhắc căn trong danh sách này, nguyên mã #): ${kho.join("; ")}.\n` : "") +
              `Hai tin gần nhất em đã gửi (TRÁNH lặp giọng/mẫu): ${JSON.stringify(lastBot)}.\n` +
              `Soạn MỘT tin Zalo NGẮN theo góc: ${angle.text}.` +
              (kho.length && !angle.can ? " Nếu hợp thì chào thêm đúng MỘT căn trong KHO CÙNG KHU." : "") +
              ` Tối đa 2 câu, tối đa 1 emoji, KHÔNG gạch dài, không markdown, không bịa số liệu ngoài dữ liệu trên. Nhắc đúng nhu cầu cũ nếu có. Kết thúc bằng một câu hỏi nhẹ.`,
          }],
        });
      } catch (e) {
        await ghiLoi(client, "nudge model(reengage)", e);
        if (giuCho) await client.from("reminders").delete().eq("id", giuCho);
        continue;
      }
      await doTien(client, resp.usage);
      text = resp.content.find((bk) => bk.type === "text")?.text?.trim();
    }
    if (!text) {
      if (giuCho) await client.from("reminders").delete().eq("id", giuCho);
      continue;
    }
    const angleKey = keepalive ? "giu_ket_noi" : angle.key;

    let sent = "none";
    if (!dry_run) {
      if (b.zalo_user_id && oaToken && !b.zalo_user_id.startsWith("TEST")) {
        sent = (await sendZalo(oaToken, b.zalo_user_id, text)) ? "zalo_oa" : "zalo_error";
      }
      if (sent === "zalo_error") {
        // ĐÓNG chỗ giữ lại, đừng để nó nằm `pending` mãi. Index duy nhất
        // `reminders_mot_reengage_cho_idx` chỉ cho MỘT dòng reengage pending
        // mỗi khách, nên một dòng pending không ai xử lý là khoá cứng: khách
        // đó không bao giờ được hỏi thăm nữa. `cancelled` nhả khoá mà vẫn để
        // lại vết (khác `delete`), và cổng chống-spam 5 ngày đếm theo
        // `created_at` bất kể trạng thái nên vẫn giữ đúng nhịp không làm phiền.
        // Cố ý KHÔNG hẹn lùi dần ở đây: dòng reengage không nằm trong bộ
        // `nhan_viec_nhac` nào cả, hẹn giờ cho nó là hẹn cho người không tới.
        if (giuCho) {
          await client.from("reminders")
            .update({ status: "cancelled", last_error: "gửi OA hụt" }).eq("id", giuCho);
        }
        reengaged++;
        out.push({ kind: "reengage", buyer: b.id, angle: angleKey, text, sent, retry: true });
        continue;
      }
      if (conv) await client.from("messages").insert({ conversation_id: conv.id, sender: "bot", body: text });
      if (giuCho) {
        await client.from("reminders")
          .update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", giuCho);
      }
    }
    reengaged++;
    out.push({ kind: "reengage", buyer: b.id, angle: angleKey, im_ngay: Math.floor(imNgay), can_cuoi: canCuoi?.code ?? null, kho: kho.length, text, sent });
  }

  return jsonResponse({ done: out.length, dry_run, results: out });
});
