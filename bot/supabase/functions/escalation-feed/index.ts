// escalation-feed — FR-140: cửa cho bridge acc clone (chạy local) kéo các
// việc "báo CTV/admin" khi OA chưa duyệt (nudge gửi OA không được thì reminder
// escalation vẫn pending ở đây). Bridge pull → tự resolve SĐT ra uid Zalo →
// gửi → ack lại. FR-149: kéo cả kind `report` (báo cáo CTV 17h) về Zalo admin.
// POST { action: "pull" } → { items: [{id, note, text, name, zalo_user_id, phone}] }
// POST { action: "ack", id } → { ok: true }
// FR-202 (11/09): pull trả thêm lời nhắc nudge ĐÃ SOẠN SẴN (`noi_dung_gui`) cho
// người mua hoặc chủ nhà — chưa có OA thì đường ra duy nhất là acc clone.
// FR-203 (11/09): POST { action: "qr", trang_thai, qr_png? } — bridge báo trạng
// thái đăng nhập + ảnh QR để /admin hiện ra quét; pull trả `quet_lai` khi admin
// bấm "Đăng nhập lại".
// Bảo vệ thêm (tuỳ chọn): đặt secret BRIDGE_SECRET trong Vault thì mọi request
// phải kèm header x-bridge-secret khớp; chưa đặt thì chỉ cần anon key như cũ.
import { escalationText, ghiLoi, jsonResponse, serviceClient } from "../_shared/claude.ts";
import { laTinNoiBo } from "../_shared/tin_nhac.ts";
import { congBiMat } from "../_shared/gate.ts";

const KINDS = ["escalation", "report"];

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const client = serviceClient();

  // Cổng dùng chung `_shared/gate.ts` (FR-171 k). Giữ mã 401 + chữ lỗi cũ vì
  // bridge đã quen; hàng đợi này có SĐT thật của khách nên đọc hụt bí mật là
  // ghi sổ ngay như mọi cổng anh em.
  const chan = await congBiMat(req, client, "escalation-feed", 401, "bridge secret sai");
  if (chan) return chan;

  // FR-152 nhịp tim: bridge gõ cửa đây mỗi phút, nên đây là chỗ RẺ NHẤT để
  // biết nó còn sống — khỏi thêm một dòng nào vào máy chạy bridge. Quá 15
  // phút không thấy nhịp trong giờ làm thì bot_health_tick() ghi sổ + báo.
  // (Lưu ý thật: tin báo đi ĐƯỜNG BRIDGE, nên bridge chết là tin nằm chờ tới
  //  lúc nó sống lại. Muốn biết ngay thì mở /admin — trang đó đọc bot_health.)
  await client.rpc("beat", { p_who: "bridge-zca" });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "pull");

  // FR-152: bridge chạy trên máy chủ dự án, console.error của nó hiện ở terminal
  // rồi mất theo cửa sổ. Cho nó một đường đẩy lỗi lên sổ chung — cùng cổng
  // x-bridge-secret đã có, khỏi mở thêm cửa nào.
  if (action === "log") {
    await client.rpc("log_loi", {
      p_source: `bridge ${String(body.source ?? "").slice(0, 30)}`.trim(),
      p_detail: String(body.detail ?? ""),
      p_code: null,
    });
    return jsonResponse({ ok: true });
  }

  // FR-203: bridge báo trạng thái đăng nhập acc clone (+ ảnh QR khi chờ quét).
  // Ảnh QR nhạy — quét bằng acc nào thì acc đó thành acc bot — nên chỉ nhận
  // đúng một data URL PNG, và mọi trạng thái khác `cho_quet` đều XOÁ ảnh.
  if (action === "qr") {
    const TT = ["dang_nhap", "cho_quet", "da_quet", "het_han", "tu_choi"];
    const tt = String(body.trang_thai ?? "");
    if (!TT.includes(tt)) return jsonResponse({ error: "trang_thai sai" }, 400);
    const anh = typeof body.qr_png === "string" ? body.qr_png : "";
    const qr = tt === "cho_quet" && anh.length <= 200_000 &&
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(anh)
      ? anh
      : null;
    // XẾP THEO GIỜ SỰ KIỆN ở bridge (`luc`), không theo giờ request tới đây. Hai
    // lệnh gửi sát nhau có thể tới ngược thứ tự: 11/09 09:27 lệnh "het_han" gửi
    // trước mà tới sau mã QR mới, và xoá mất ảnh — /admin trống QR 100 giây.
    // Lệnh cũ hơn trạng thái đang lưu thì bỏ qua. Bridge bản cũ không gửi `luc`
    // (hoặc đồng hồ lệch quá 5 phút) thì dùng giờ server như trước.
    const lucMs = Date.parse(String(body.luc ?? ""));
    const luc = Number.isFinite(lucMs) && Math.abs(lucMs - Date.now()) < 5 * 60_000
      ? new Date(lucMs).toISOString()
      : new Date().toISOString();
    const { error: qErr } = await client.from("bridge_dang_nhap").update({
      trang_thai: tt,
      qr_png: qr,
      // Bridge đã vào luồng QR hoặc đã đăng nhập xong = yêu cầu quét lại đã làm.
      ...(tt === "cho_quet" || tt === "dang_nhap" ? { yeu_cau_quet_lai: false } : {}),
      ghi_chu: body.ghi_chu ? String(body.ghi_chu).slice(0, 200) : null,
      cap_nhat: luc,
    }).eq("id", 1).lte("cap_nhat", luc);
    if (qErr) await ghiLoi(client, "escalation-feed qr", qErr.message);
    return jsonResponse({ ok: !qErr });
  }

  if (action === "ack") {
    const id = String(body.id ?? "");
    if (!id) return jsonResponse({ error: "id bắt buộc" }, 400);

    // TỰ HỌC Zalo ID: bridge chỉ có SĐT thì nó gọi findUser để ra uid. Ghi ngược
    // uid đó vào đúng người — lần sau chat-reply nhận ra vai NGƯỜI BÁN ngay từ
    // tin đầu, khỏi chờ ai điền tay. Chỉ ghi khi ô đang trống, không đè.
    const learned = body.zalo_user_id ? String(body.zalo_user_id).trim().slice(0, 128) : "";
    if (learned) {
      const { data: r } = await client.from("reminders")
        .select("seller_id, ctv_id, buyer_id").eq("id", id).maybeSingle();
      if (r?.seller_id) {
        await client.from("sellers").update({ zalo_user_id: learned })
          .eq("id", r.seller_id).is("zalo_user_id", null);
      } else if (r?.ctv_id) {
        await client.from("ctvs").update({ zalo_user_id: learned })
          .eq("id", r.ctv_id).is("zalo_user_id", null);
      } else if (!r?.buyer_id) {
        // (Lời nhắc NGƯỜI MUA — FR-202 — vốn có sẵn uid, không có gì để học, và
        //  cũng không phải việc của admin nên không rơi xuống nhánh này.)
        // SEC-03 — BỎ nhánh tự học Zalo ID của admin.
        // Bản trước: `client.from("admins").update({zalo_user_id: learned})
        //             .is("zalo_user_id", null)` — KHÔNG có mệnh đề khoá nào.
        // Nó ghi đè MỌI dòng `admins` đang trống, bằng giá trị do người gọi
        // truyền vào, và chạy bằng service_role nên RLS không cản. Ai qua được
        // cổng chỉ cần ack một reminder không gắn seller/ctv kèm uid của mình
        // là từ đó BÁO CÁO CTV 17H HẰNG NGÀY (đơn, lịch xem, tên khách) và mọi
        // escalation "khách cần người thật" đi thẳng về máy họ — còn admin thật
        // im lặng mất tin, vì ô đã hết NULL nên lần sau không ai ghi nữa.
        //
        // Hai nhánh trên an toàn vì có `.eq("id", …)` lấy từ chính reminder.
        // Nhánh admin thì reminder KHÔNG mang id admin nào, nên không có gì để
        // ràng — không ràng được thì không ghi. Admin điền tay ở Table Editor.
        // KHÔNG ghi vào `bot_errors`. Đây là đường ĐÚNG THEO THIẾT KẾ, không
        // phải sự cố — mà ghi vào sổ lỗi thì nó thành VÒNG TỰ NUÔI: mỗi giờ
        // `bot_health_tick` đếm "1 lỗi trong 1 giờ qua" → đẻ một reminder 🩺 →
        // bridge gửi vào Zalo admin → ack lại rơi đúng nhánh này → ghi thêm
        // một dòng lỗi → giờ sau lại đếm được. Sổ lỗi 07/09 có đúng một dòng
        // `escalation-feed admin uid` mỗi giờ có tin 🩺 được gửi, liên tục từ
        // 05:00 tới 10:00 UTC. (Bắt 08/09/2026.)
        console.log(
          `escalation-feed: reminder ${id} không gắn seller/ctv nên không học ` +
          "zalo_user_id cho admin (SEC-03) — đúng thiết kế. Điền tay ở /admin.",
        );
      }
    }

    // Dòng nudge soạn sẵn (`noi_dung_gui`, 20260911b) cũng ack ở đây. Ghi tin
    // vào hội thoại ĐÚNG LÚC NÀY — sau khi bridge báo đã gửi — chứ không phải
    // lúc nudge soạn: ghi lúc soạn là `so.hoi_thoai` hiện một câu bot "đã nói"
    // mà khách chưa từng nhận (đúng cái lỗi C1 đã sửa ở nhánh OA).
    const { data: rr } = await client.from("reminders")
      .select("kind, noi_dung_gui, buyer_id, seller_id").eq("id", id).maybeSingle();
    if (rr?.noi_dung_gui && !KINDS.includes(rr.kind)) {
      // Cùng cách chọn hội thoại với nudge (nhánh OA): cuộc mới nhất của đúng
      // người đó. Chủ nhà chưa từng có cuộc nào thì thôi — không đẻ cuộc rỗng.
      const cot = rr.buyer_id ? "buyer_id" : "seller_id";
      const ai = rr.buyer_id ?? rr.seller_id;
      const { data: cv } = ai
        ? await client.from("conversations").select("id").eq(cot, ai)
          .order("started_at", { ascending: false }).limit(1).maybeSingle()
        : { data: null };
      if (cv?.id) {
        const { error: mErr } = await client.from("messages")
          .insert({ conversation_id: cv.id, sender: "bot", body: rr.noi_dung_gui });
        if (mErr) await ghiLoi(client, "escalation-feed ghi tin nhac", mErr.message);
      }
    }

    await client.from("reminders")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", id)
      .or(`kind.in.(${KINDS.join(",")}),noi_dung_gui.not.is.null`);
    return jsonResponse({ ok: true, learned_zalo_id: !!learned });
  }

  // pull: việc pending tới hạn + đích liên lạc theo vai:
  // seller (FR-144 — chủ động hỏi chính chủ) → CTV được giao → admin.
  const { data: due } = await client
    .from("reminders")
    .select("id, kind, note, ctv_id, seller_id, ctvs(name, zalo_user_id, phone), sellers(name, zalo_user_id, phone)")
    .eq("status", "pending").in("kind", KINDS)
    .lte("due_at", new Date().toISOString())
    .limit(10);
  // Lời nhắc nudge đã SOẠN SẴN (lịch xem, lời hứa, báo lại câu trả lời…) mà
  // chưa có OA để gửi — chủ dự án 11/09: "dùng zalo clone gửi cho id zalo".
  // Người nhận là người mua HOẶC chủ nhà, nên phải tra cả `buyers`. KHÔNG bao
  // giờ trả SĐT người mua (NFR-07): chưa có Zalo ID thì nudge đã không cất tin.
  const { data: soanSan } = await client
    .from("reminders")
    .select("id, kind, note, noi_dung_gui, buyer_id, seller_id, buyers(name, zalo_user_id), sellers(name, zalo_user_id, phone)")
    .eq("status", "pending").not("noi_dung_gui", "is", null)
    .lte("due_at", new Date().toISOString())
    .limit(10);
  // Đích admin chỉ cần khi có việc — 99% lượt kéo là rỗng, đọc `admins` ở đó
  // là một truy vấn thừa mỗi phút (FR-171 c).
  const { data: adm } = due?.length
    ? await client.from("admins").select("zalo_user_id, zalo_phone").limit(1).maybeSingle()
    : { data: null };

  type Target = { name?: string | null; zalo_user_id?: string | null; phone?: string | null } | null;
  const items = (due ?? []).map((r) => {
    const ctv = r.ctvs as Target;
    const seller = r.sellers as Target;
    // Tin nội bộ (❓ 😟 🩺…) KHÔNG BAO GIỜ đi tới chủ nhà dù dòng việc gắn `seller_id` (`laTinNoiBo`, 01/10/2026).
    const chuNha = laTinNoiBo(r.note) ? null : seller;
    const uid = chuNha?.zalo_user_id ?? ctv?.zalo_user_id ?? adm?.zalo_user_id ?? null;
    const sdt = chuNha?.phone ?? ctv?.phone ?? adm?.zalo_phone ?? null;
    return {
      id: r.id,
      note: r.note,
      // Text soạn sẵn dùng chung với nudge (_shared/claude.ts) — hai đường đi
      // ra ngoài (OA và bridge) phải nói y hệt nhau.
      text: escalationText(r),
      name: chuNha?.name ?? ctv?.name ?? "admin",
      zalo_user_id: uid,
      // SEC-07 — CHỈ trả SĐT khi CHƯA biết uid Zalo.
      // Bridge cần số điện thoại đúng một việc: `findUser` để đổi ra uid lần
      // đầu. Biết uid rồi thì nó gửi thẳng, số kia thành thừa — mà thừa ở đây
      // nghĩa là mỗi lượt `pull` (mỗi phút, 10 dòng) lại đẩy SĐT THẬT của chủ
      // nhà và CTV ra khỏi DB cho bất kỳ ai qua được cổng. Gọi lặp là gom dần
      // được cả danh bạ. Đây đúng thứ NFR-07/BR-06 hứa không đụng tới.
      phone: uid ? null : sdt,
    };
  });
  for (const r of soanSan ?? []) {
    const mua = r.buyers as Target;
    const ban = r.sellers as Target;
    const uid = mua?.zalo_user_id ?? ban?.zalo_user_id ?? null;
    // Người mua: KHÔNG BAO GIỜ trả SĐT (NFR-07) — họ tới bằng Zalo nên luôn có
    // uid. Chủ nhà: như SEC-07 ở trên, chỉ trả SĐT khi chưa biết uid.
    const phone = mua ? null : uid ? null : ban?.phone ?? null;
    if (!uid && !phone) continue;
    items.push({
      id: r.id, note: r.note, text: String(r.noi_dung_gui),
      name: mua?.name ?? ban?.name ?? "khách", zalo_user_id: uid, phone,
    });
  }

  // FR-203: admin bấm "Đăng nhập lại" ở /admin → bridge bỏ phiên, vào luồng QR.
  const { data: dn } = await client.from("bridge_dang_nhap")
    .select("yeu_cau_quet_lai").eq("id", 1).maybeSingle();
  return jsonResponse({ items, quet_lai: !!dn?.yeu_cau_quet_lai });
});
