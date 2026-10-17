// ask-seller — FR-40…47 + FR-129 (hỏi nhỏ giọt): sinh câu hỏi bổ sung cho S.
// mode "batch" (mặc định cũ): gộp tối đa 3 câu một tin.
// mode "drip": hỏi ĐÚNG MỘT câu ưu tiên nhất — dùng cho trigger sau khi đăng
// tin và cron nhắc nhịp; nếu seller có zalo_user_id + có ZALO_OA_ACCESS_TOKEN
// thì gửi thẳng qua OA, không thì câu hỏi nằm ở info_requests cho CTV gửi tay.
// POST { listing_id, mode?: "batch"|"drip", dry_run?: bool }
import { thieuCoReNhanh } from "../_shared/re_nhanh.ts";
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
import { cauHoiMau, dienTen, dsHoiBu, KHO_TEN_TRO_LY, SELLER_SCRIPT_RULES, tenTroLy, TONE_RULES } from "../_shared/prompts.ts";
import { loaiDoc } from "../_shared/tin-nhap.ts";
import { boGachCheo, doiTuXung, giuCauDungTen } from "../_shared/extraction/van-tra-loi.ts";
import { cachGoiKhach, hocXungHoTuLichSu, suyTuXungHo } from "../_shared/extraction/khop-cau-tra-loi.ts";
import { khongBietCua } from "../_shared/extraction/kiem-bang-chung.ts";
import { laVoTinRong, moDauHoiBu } from "../_shared/extraction/hoi-bu.ts";

const OutSchema = z.object({
  message: z.string().describe("Tin nhắn Zalo gửi người bán, tiếng Việt"),
  questions: z.array(
    z.object({
      fact_key: z.string(),
      question: z.string().describe("Câu hỏi ngắn gọn cho fact này"),
    }),
  ),
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  // ── CỔNG (soát bảo mật 29/08/2026) ───────────────────────────────────────
  // verify_jwt=true KHÔNG phải là xác thực: nó chỉ đòi publishable key, mà khoá
  // đó nằm sẵn trong bundle JS của web. Có listing_id là người lạ bắt bot NHẮN
  // THẬT cho chủ nhà — đường quấy rối, và đốt tiền model. Cổng dùng chung
  // `_shared/gate.ts`.
  const db = serviceClient();
  const chan = await congBiMat(req, db, "ask-seller");
  if (chan) return chan;

  const { listing_id, mode = "batch", dry_run = false } = await req.json().catch(() => ({}));
  if (!listing_id) return jsonResponse({ error: "listing_id bắt buộc" }, 400);
  const drip = mode === "drip";

  const { data: listing, error: lErr } = await db
    .from("listings")
    .select(
      // 15/09/2026: PHẢI chỉ tên khoá ngoại. `listings ↔ sellers` có HAI quan hệ
      // (listings.seller_id và sellers.active_listing_id) nên `sellers(...)` trần
      // làm PostgREST trả 300 PGRST201 — và nhánh dưới từng gộp mọi lỗi select
      // thành "listing không tồn tại" (404): hỏi bù CHẾT IM từ 09/09 tới 15/09,
      // 313 lượt, sổ lỗi ghi sai nguyên nhân nên không ai truy.
      "id, code, property_type, district, ward, location_raw, price_raw, area_m2, description, seller_id, project_id, boc_tach, sellers!listings_seller_id_fkey(name, seller_type, zalo_user_id, ten_tro_ly, xung_ho, nhom_tuoi)",
    )
    .eq("id", listing_id)
    .maybeSingle();
  if (lErr) {
    await ghiLoi(db, "ask-seller doc listing", lErr.message);
    return jsonResponse({ error: `không đọc được listing: ${lErr.message}` }, 500);
  }
  if (!listing) return jsonResponse({ error: "listing không tồn tại" }, 404);
  if (!listing.property_type) {
    return jsonResponse({
      error: "listing chưa có property_type - chưa xác định được checklist required_facts",
    }, 422);
  }

  // SRS-5.1zzzzzzz18 (Zalo thật 14/10 11:22): vỏ tin rỗng (mở từ câu "cần bán căn hộ" trước bài rao) mà người rao còn tin khác
  // đang mở → nhịp hỏi bù KHÔNG hỏi vỏ đó: chủ nhà đã rao căn thật ở tin kia, hỏi "chung cư mình nằm đường nào" về cái vỏ là hỏi
  // lại điều đã nói. Không sửa / xoá vỏ ở đây — dữ liệu tin chỉ đổi qua chat.
  if (drip && listing.seller_id && laVoTinRong(listing)) {
    const { data: tinKhac, error: tkErr } = await db.from("listings").select("id")
      .eq("seller_id", listing.seller_id).neq("id", listing_id).in("status", ["cho_thong_tin", "dang_ban", "dang_quan_tam"]).limit(1);
    if (tkErr) await ghiLoi(db, "ask-seller tin khac cua nguoi rao", tkErr.message);
    else if ((tinKhac ?? []).length) {
      return jsonResponse({ message: null, asked: [], note: "drip: vỏ tin rỗng, người rao có tin khác đang mở - không hỏi bù vỏ này" });
    }
  }

  const { data: missingTho, error: mErr } = await db
    .from("listing_missing_facts")
    .select("fact_key, priority, nhom")
    .eq("listing_id", listing_id)
    .order("priority");
  if (mErr) return jsonResponse({ error: mErr.message }, 500);
  // FR-223: câu nhánh theo câu trả lời — vòng hỏi bù hỏi cùng bộ câu với chat-reply.
  // 01/10/2026: câu AI đã thấy KHÔNG áp dụng cho căn này (có trích dẫn lời chủ nhà — chat-reply `khongHoiAi`) thì hỏi bù cũng bỏ.
  // SRS-5.1zzzzz: ô chủ nhà đã nói KHÔNG BIẾT (chat-reply ghi `boc_tach.khong_biet`) thì hỏi bù cũng không hỏi lại.
  const khongHoi = new Set<string>([...(((listing.boc_tach as { khong_hoi?: unknown } | null)?.khong_hoi as string[] | undefined) ?? []), ...khongBietCua(listing.boc_tach)]);
  const missing = (await thieuCoReNhanh(db, listing_id, missingTho)).filter((m) => !khongHoi.has(m.fact_key));

  // Không hỏi lại điều đang chờ trả lời (chống spam — INS-09). Một truy vấn
  // lấy cả hai thứ cần: câu đang chờ (status) và "đã từng hỏi căn này chưa"
  // (số dòng) — trước đây là hai lượt đi về (FR-171 e).
  const { data: daHoi } = await db
    .from("info_requests")
    .select("question, status")
    .eq("listing_id", listing_id);
  // FR-186 o (chat Gemini 21/06 lượt 1 "không hỏi lần thứ hai", chủ dự án 10/09):
  // câu chủ nhà đã NÉ (info_request expired) thì vòng hỏi bù KHÔNG hỏi lại.
  const daNeKeys = new Set(
    (daHoi ?? []).filter((r) => r.status === "expired").map((r) => r.question),
  );
  const pendingKeys = new Set(
    (daHoi ?? []).filter((r) => r.status === "pending").map((r) => r.question),
  );
  const isFirst = (daHoi ?? []).length === 0;

  // FR-144: chế độ drip là MỘT-CÂU-MỘT-LÚC — listing đang có bất kỳ câu pending
  // nào (vd chat-reply vừa hỏi ngay lúc nhận tin rao) thì nhịp này bỏ qua, kẻo
  // hai câu hỏi song song làm câu trả lời của chủ nhà bị ghi nhầm fact.
  if (drip && pendingKeys.size > 0) {
    return jsonResponse({
      message: null, asked: [], skipped_pending: [...pendingKeys],
      note: "drip: đang có câu chờ trả lời - không hỏi chồng",
    });
  }
  // 21/09/2026 (bắn thật `kiem-bl-2109`): tin rao qua chat tạo listing lúc :04.001 → trigger
  // `listing_insert_drip` gọi hàm này NGAY, trong khi chat-reply còn đang xử lý (7,7 s) và chỉ
  // mở câu chờ của nó ở :04–:06. Cổng `pendingKeys` ở trên đọc TRƯỚC mốc đó nên rỗng → hàm này
  // hỏi chồng 3 câu ("Dạ cảm ơn anh/chị… mấy lầu? sổ? ảnh?") 2 giây sau câu hỏi đường của
  // chat-reply — đúng cái FR-144 (e) cấm. Chủ nhà vừa nhắn trong 10 phút = hội thoại đang sống,
  // chat-reply là người hỏi; nhịp drip (trigger lẫn cron) đứng ngoài.
  if (drip && listing.seller_id) {
    const { data: mCuoi, error: mErr } = await db.from("messages")
      .select("created_at, conversations!messages_conversation_id_fkey!inner(seller_id)")
      .eq("conversations.seller_id", listing.seller_id).eq("sender", "seller")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (mErr) await ghiLoi(db, "ask-seller tin chu nha gan nhat", mErr.message);
    const luc = (mCuoi as { created_at?: string | null } | null)?.created_at ?? null;
    if (luc && Date.now() - new Date(luc).getTime() < 10 * 60_000) {
      return jsonResponse({
        message: null, asked: [], skipped_pending: [...pendingKeys],
        note: "drip: chủ nhà vừa nhắn trong 10 phút - chat-reply đang hỏi, không hỏi chồng",
      });
    }
  }

  // Chủ dự án 09/09/2026 tối: hỏi bù là MỘT LẦN gom 2–3 thông tin còn thiếu,
  // ưu tiên thứ quan trọng (giá, diện tích, pháp lý, vị trí) hoặc ẢNH + SỔ —
  // không phải mỗi nhịp một câu lắt nhắt. Thứ tự: ảnh/sổ/giá/diện tích/vị trí
  // lên đầu, rồi cơ bản → chuyên môn → sau đăng theo priority.
  const QUAN_TRONG = ["hinh_anh", "phap_ly", "gia", "dien_tich", "dien_tich_dat", "dien_tich_tim_tuong", "vi_tri", "phuong"];
  // 27/09/2026 (chủ dự án: "hỏi hơi nhiều"): tin bán dời 5 câu pháp lý FR-229 ra sau khi lên tin — hỏi bù chúng TRƯỚC các câu
  // sau đăng khác; ba câu quy hoạch / tranh chấp / khớp sổ đứng liền nhau để đi chung một tin (câu pháp lý thứ hai).
  const PHAP_LY_BU = ["quy_hoach", "tranh_chap", "dien_tich_khop_so", "nguoi_dung_ten", "the_chap"];
  const bac = (f: { fact_key: string; nhom?: string | null }) =>
    (QUAN_TRONG.includes(f.fact_key) ? 0 : PHAP_LY_BU.includes(f.fact_key) ? 5 + PHAP_LY_BU.indexOf(f.fact_key) / 100 : 10) +
    (f.nhom === "co_ban" ? 0 : f.nhom === "chuyen_mon" ? 1 : f.nhom === "sau_dang" ? 2 : 3);
  const candidates = (missing ?? [])
    .filter((f) => !pendingKeys.has(f.fact_key) && !daNeKeys.has(f.fact_key))
    .sort((a, b) => bac(a) - bac(b) || (a.priority ?? 0) - (b.priority ?? 0));
  // 01/10/2026 (chủ dự án, ảnh Zalo: "Để em kiểm tra giá khu vực… em cần mình tuyên bố thêm ba điểm: Quy hoạch… tranh chấp…
  // diện tích xây khớp sổ…" — "pháp lý ko cần hỏi gộp lại nhiều quá đâu từng ý thôi"): nhịp drip hỏi ĐÚNG MỘT ý mỗi tin,
  // bằng câu mẫu (không để model viết lời mở kiểu "tuyên bố ba điểm"). Chế độ batch (CTV gọi tay) giữ 3 câu.
  const toAsk = candidates.slice(0, drip ? 1 : 3);

  if (toAsk.length === 0) {
    return jsonResponse({
      message: null,
      asked: [],
      skipped_pending: [...pendingKeys],
      note: "Không còn fact nào cần hỏi (đủ thông tin hoặc đều đang chờ trả lời)",
    });
  }

  // Drip: câu đầu tiên của listing thì chào; các câu sau nối tiếp hội thoại
  // (`isFirst` tính ở trên, cùng truy vấn với pendingKeys).
  // FR-237: nhãn theo loại BĐS (đất xin ảnh "lô đất, đường vào", không "mặt tiền nhà, hẻm").
  const factList = dsHoiBu(toAsk.map((f) => f.fact_key), listing.property_type);
  const seller = listing.sellers as
    | { name?: string; seller_type?: string; zalo_user_id?: string | null; ten_tro_ly?: string | null; xung_ho?: string | null; nhom_tuoi?: string | null }
    | null;
  // 05/10/2026 (SRS-5.1zx, hỏi bù 04/10 "…không mình?" dù khách đã xưng "anh" hai hôm trước): hồ sơ chưa có cách gọi thì
  // học từ tin cũ của chủ nhà trước khi soạn, và ghi lại hồ sơ — không gửi câu hỏi bù bằng "mình" khi khách đã nói mình là ai.
  if (seller && !seller.xung_ho && listing.seller_id) {
    const { data: tinCu, error: tcErr } = await db.from("messages")
      .select("body, created_at, conversations!messages_conversation_id_fkey!inner(seller_id)")
      .eq("conversations.seller_id", listing.seller_id).eq("sender", "seller")
      .order("created_at", { ascending: false }).limit(30);
    if (tcErr) await ghiLoi(db, "ask-seller lich su xung ho", tcErr.message);
    const xhLs = hocXungHoTuLichSu(((tinCu ?? []) as Array<{ body?: string | null }>).map((m) => m.body ?? "").reverse());
    if (xhLs) {
      const { error: xhErr } = await db.from("sellers").update({ xung_ho: xhLs, ...suyTuXungHo(xhLs) }).eq("id", listing.seller_id);
      if (xhErr) await ghiLoi(db, "ask-seller sellers.xung_ho(lich su)", xhErr.message);
      else seller.xung_ho = xhLs;
    }
  }
  // FR-181: cùng một tên trợ lý với chat-reply — cột `ten_tro_ly` nếu đã có,
  // không thì băm từ Zalo ID (cùng hàm, cùng kết quả).
  // SRS-5.1zzzzzzz9: tên tính lại từ Zalo ID (kho tên có thể đổi); cột lưu chỉ là bản sao cho CRM.
  const tenBot = seller?.zalo_user_id ? tenTroLy(seller.zalo_user_id) : seller?.ten_tro_ly ?? KHO_TEN_TRO_LY[0];

  const instruction = drip
    ? (isFirst
        ? `Soạn MỘT tin nhắn Zalo NGẮN (35–60 từ) gửi người bán ngay sau khi họ vừa đăng tin: cảm ơn, KHEN một điểm mạnh thật của tin rao (vị trí/hẻm/giá…), rồi hỏi GỌN trong một tin ${toAsk.length} thông tin dưới đây — mỗi thông tin một dòng ngắn, không thành bảng hỏi. Không hỏi gì khác.`
        : `Soạn MỘT tin nhắn Zalo NGẮN (35–60 từ) hỏi bù ${toAsk.length} thông tin dưới đây trong CÙNG MỘT tin (mỗi thông tin một dòng ngắn, xuống dòng), giọng nối tiếp cuộc trò chuyện đang có, kèm lý do vì-khách khi tự nhiên ("khách mua đang hỏi…"). Không chào lại từ đầu, không hỏi gì khác.`)
    : `Soạn MỘT tin nhắn Zalo gửi người bán để xin bổ sung thông tin cho tin rao: gộp hết vào một tin duy nhất, mỗi thông tin một câu hỏi rõ ràng, mở đầu chào đúng tone + khen một điểm mạnh của tin, nói rõ "có khách đang hỏi" để tạo động lực trả lời, kết thúc bằng lời cảm ơn + câu hỏi. Không hỏi gì ngoài danh sách.`;

  const cachGoi = cachGoiKhach(seller?.xung_ho, seller?.nhom_tuoi);
  const cauDrip = drip
    ? `${moDauHoiBu(loaiDoc(listing.property_type), listing.location_raw || listing.ward || listing.district)}${cauHoiMau(toAsk[0].fact_key, cachGoi, undefined, listing.property_type)}`
    : null;
  const anthropic = cauDrip ? null : await anthropicClient(db);
  // FR-171 e: một tin ~30 từ + tối đa 3 câu hỏi ngắn — `low`/512 là đủ, như
  // nudge đang dùng cho việc tương đương. `medium`/1024 trước đây là trả thêm
  // tiền suy nghĩ cho một câu chào. 512 (không phải 256) vì đầu ra là JSON có
  // mảng questions; cắt giữa chuỗi là parse hỏng im (bài học ctv-report 26/08).
  const resp = cauDrip ? null : await anthropic!.messages.parse({
    model: MODEL,
    max_tokens: 512,
    output_config: {
      effort: "low",
      format: zodOutputFormat(OutSchema),
    },
    system: [{
      type: "text",
      text: dienTen(TONE_RULES, tenBot) + "\n\n" + SELLER_SCRIPT_RULES,
      cache_control: { type: "ephemeral" },
    }],
    messages: [{
      role: "user",
      content:
        `${instruction}\n` +
        // 21/09/2026: "chưa rõ tên (gọi anh/chị)" từng dạy model viết "anh/chị" gạch chéo — nay đưa
        // cách gọi đã dặn (`sellers.xung_ho`, FR-176); chưa biết thì gọi "mình", không gạch chéo.
        `Người bán: ${seller?.name ?? "chưa rõ tên"} - cách gọi: ${
          seller?.xung_ho ? `"${seller.xung_ho}"` : `chưa biết nam/nữ → gọi "${cachGoi}", KHÔNG viết "anh/chị" gạch chéo, KHÔNG gọi "mình"`
        } - loại: ${
          seller?.seller_type === "nmg" ? "nhà môi giới (hỏi gọn, chuyên nghiệp)" : "chính chủ (giọng gần gũi)"
        }\n` +
        // FR-237 (bắn thật lx-46): không nói loại thì model gọi lô đất là "căn này".
        `Loại BĐS: ${loaiDoc(listing.property_type)} (gọi đúng loại này, đất thì "lô đất" — không gọi "căn")\n` +
        `Tin rao: #${listing.code ?? listing.id} - ${listing.location_raw ?? ""} ${listing.ward ?? ""} ${listing.district ?? ""}, giá ${listing.price_raw ?? "?"}\n` +
        `Thông tin cần hỏi:\n${factList}`,
    }],
  });

  if (resp) await doTien(db, resp.usage); // FR-171 e: đồng hồ tiền đếm cả câu hỏi chủ nhà
  if (resp && (resp.stop_reason === "refusal" || !resp.parsed_output)) {
    return jsonResponse({ error: "Không sinh được tin nhắn", stop_reason: resp.stop_reason }, 502);
  }
  const out = cauDrip
    ? { message: cauDrip, questions: [{ fact_key: toAsk[0].fact_key, question: cauDrip }] }
    : resp!.parsed_output!;
  // Lưới trên đường ra như chat-reply: bỏ "anh/chị" gạch chéo, tự xưng "cháu" với chú/cô/bác.
  // FR-238: câu đứng tên đi nguyên câu mẫu (hỏi QUAN HỆ, không để model viết "Ai đứng tên sổ?" — khách dễ đáp họ tên).
  if (toAsk.some((f) => f.fact_key === "nguoi_dung_ten")) {
    out.message = giuCauDungTen(out.message, cauHoiMau("nguoi_dung_ten", cachGoi, undefined, listing.property_type));
  }
  out.message = doiTuXung([boGachCheo(out.message)], seller?.xung_ho, seller?.nhom_tuoi)[0];
  let sent_via: string = "none";
  // Khai ngoài khối `dry_run` vì câu trả lời cuối hàm đọc nó: `asked` phải là
  // những câu THẬT SỰ được mở, không phải những câu định mở.
  let daMo: string[] = toAsk.map((f) => f.fact_key);

  if (!dry_run) {
    const rows = toAsk.map((f) => ({
      listing_id,
      question: f.fact_key,
      status: "pending",
    }));
    // ĐUA: `pendingKeys` đọc ở đầu hàm, `insert` ở đây. Giữa hai mốc đó,
    // `chat-reply` (người bán vừa nhắn) hoặc một nhịp drip khác có thể đã mở
    // đúng câu hỏi này. Chính comment ở đầu hàm nói hậu quả: hai câu hỏi song
    // song làm câu trả lời của chủ nhà bị ghi nhầm fact.
    // `info_requests_mot_cau_cho_idx` nay chặn cú thứ hai. Ghi cả lô mà một
    // câu đụng thì CẢ LÔ trượt, nên thử lại từng dòng để những câu chưa ai hỏi
    // vẫn được mở — bỏ nguyên lô là mất câu hỏi, tức vòng hỏi đứng im.
    const { error: iErr } = await db.from("info_requests").insert(rows);
    if (iErr?.code === "23505") {
      daMo = [];
      for (const r of rows) {
        const { error: e1 } = await db.from("info_requests").insert(r);
        if (!e1) daMo.push(r.question);
        else if (e1.code !== "23505") await ghiLoi(db, "ask-seller info_request", e1.message);
      }
      if (daMo.length === 0) {
        // Mọi câu đều đã có người hỏi → KHÔNG gửi tin, kẻo chủ nhà nhận câu
        // hỏi trùng đúng cái mà cổng `drip` ở trên cố tránh.
        return jsonResponse({
          message: null, asked: [], skipped_pending: rows.map((r) => r.question),
          note: "đua: câu hỏi vừa được mở bởi lượt khác - không hỏi chồng",
        });
      }
    } else if (iErr) {
      return jsonResponse({ error: iErr.message, message: out.message }, 500);
    }

    // Gửi thẳng qua Zalo OA nếu có kênh (FR-129). Dùng `secretOf` + `sendZalo`
    // dùng chung thay vì fetch tay + `get_secret` trần (FR-171 g): token đặt ở
    // env thì `get_secret` (chỉ hỏi Vault) đọc ra null và câu hỏi không bao giờ
    // đi — hai hàm anh em đã tránh được bẫy đó từ lâu.
    if (seller?.zalo_user_id) {
      const token = await secretOf(db, "ZALO_OA_ACCESS_TOKEN");
      // FR-177 f (09/09/2026): kênh đang chạy là BRIDGE (Zalo cá nhân), không
      // có OA. Trước bản này câu hỏi drip chỉ mở info_requests rồi... im —
      // "sent_via: none", chủ nhà không bao giờ nhận được câu hỏi bù. Nay xếp
      // vào hàng đợi `reminders` kind escalation với seller_id + ghi chú "💬 …":
      // escalation-feed kéo, bridge gửi nguyên văn (tin_nhac.ts), rồi ack.
      // 24/09/2026: người bán GIẢ của bộ bắn thử (`k1-ban-…`, `do-…`) không có Zalo thật — bridge không gửi được,
      // nhắc nằm "Việc chờ admin" mãi. UID Zalo thật là dãy số; không phải số thì không xếp hàng (câu hỏi vẫn mở).
      if (!token && !/^\d{6,}$/.test(seller.zalo_user_id)) {
        sent_via = "none_uid_thu";
      } else if (!token) {
        const { error: rErr } = await db.from("reminders").insert({
          kind: "escalation", seller_id: listing.seller_id, listing_id,
          due_at: new Date().toISOString(), note: `💬 ${out.message}`,
        });
        if (rErr) await ghiLoi(db, "ask-seller reminders(bridge)", rErr.message);
        else {
          sent_via = "bridge_queue";
          const { data: sc, error: scErr } = await db
            .rpc("ensure_seller_conversation", {
              p_seller_id: listing.seller_id, p_channel: "zalo_personal",
            }).single();
          const scId = (sc as { c_id?: string } | null)?.c_id ?? null;
          if (scErr || !scId) {
            await ghiLoi(db, "ask-seller ensure_seller_conversation(bridge)",
              scErr?.message ?? "không trả về c_id");
          } else {
            const { error: logErr } = await db.from("messages")
              .insert({ conversation_id: scId, sender: "bot", body: out.message });
            if (logErr) await ghiLoi(db, "ask-seller messages bot(bridge)", logErr.message);
          }
        }
      }
      if (token) {
        const guiDuoc = await sendZalo(token, seller.zalo_user_id, out.message);
        sent_via = guiDuoc ? "zalo_oa" : "zalo_oa_error";
        // Câu hỏi ĐÃ GỬI ĐI thì phải vào sổ hội thoại người bán, không thì
        // hội thoại chỉ còn câu trả lời trơ trọi và CTV tiếp quản không có gì
        // để bám (FR-141/FR-152). Chỉ ghi khi Zalo nhận thật.
        if (guiDuoc && listing.seller_id) {
          const { data: sc, error: scErr } = await db
            .rpc("ensure_seller_conversation", {
              p_seller_id: listing.seller_id, p_channel: "zalo_oa",
            }).single();
          const scId = (sc as { c_id?: string } | null)?.c_id ?? null;
          if (scErr || !scId) {
            await ghiLoi(db, "ask-seller ensure_seller_conversation",
              scErr?.message ?? "không trả về c_id");
          } else {
            const { error: logErr } = await db.from("messages")
              .insert({ conversation_id: scId, sender: "bot", body: out.message });
            if (logErr) await ghiLoi(db, "ask-seller messages bot", logErr.message);
            // (`last_message_at` do trigger trên `messages` đẩy — 20260902d.)
          }
        }
      }
    }
  }

  return jsonResponse({
    message: out.message,
    asked: daMo,
    mode,
    is_first: isFirst,
    sent_via,
    dry_run,
  });
});
