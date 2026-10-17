// tin-nhac.mjs — chữ gửi ra Zalo cho việc trong hàng đợi `reminders`.
// Chạy: bun bot/tests/tin-nhac.mjs
// Sinh ra 08/09/2026 từ ảnh Zalo admin của chủ dự án: tin báo sức khoẻ đọc ra
// "🔔 nhadat.cc: 🩺 nhadat.cc: 4 lỗi trong 1 giờ qua. Xem trang /admin.. Anh/chị
// check giúp rồi trả lời khách sớm nha." — lặp tên, thừa dấu chấm, và bảo admin
// trả lời một khách không tồn tại.
import { escalationText, laTinNoiBo } from "../supabase/functions/_shared/tin_nhac.ts";

let hong = 0, tong = 0;
const ok = (ten, dat, thay = "") => {
  tong++;
  if (dat) console.log(`✓ ${ten}`);
  else { hong++; console.log(`✗ ${ten}\n     → ${thay}`); }
};

// ── Tin NỘI BỘ đã tự mang dấu hiệu: gửi nguyên ──────────────────────────────
for (const [ten, note] of [
  ["sức khoẻ", "🩺 nhadat.cc: 4 lỗi trong 1 giờ qua. Xem trang /admin."],
  ["hồ sơ mới", "🆕 Hồ sơ người bán MỞ TỪ CHAT — nhãn CHÍNH CHỦ (phí 1%)."],
  ["khách hỏi", "❓ Khách hỏi căn #BDS-Q5-0001: \"phap_ly\"."],
  ["xin đổi nhãn", "✏️ Zalo …8895 đang nhãn CHÍNH CHỦ nhưng tự xưng MÔI GIỚI."],
]) {
  const t = escalationText({ kind: "escalation", note, seller_id: null });
  ok(`${ten}: không dán thêm "🔔 AI Ơi Nhà Đất:"`, !/🔔 AI Ơi Nhà Đất:/.test(t), t);
  ok(`${ten}: không có hai dấu chấm cuối`, !/\.\.\s*$/.test(t), t);
  ok(`${ten}: không bảo trả lời khách`, !/trả lời khách sớm/.test(t), t);
}

// ── CTV / admin, ghi chú chữ thường: vẫn gắn tên + đuôi như cũ ──────────────
{
  const t = escalationText({
    kind: "escalation",
    note: "khách hỏi #BDS-Q5-0001 · cần: pháp lý (sổ hồng, hoàn công) · giao ctv.",
    seller_id: null,
  });
  ok("CTV: có tiền tố AI Ơi Nhà Đất", /^🔔 AI Ơi Nhà Đất: khách hỏi/.test(t), t);
  ok("CTV: có đuôi nhắc trả lời khách", /trả lời khách sớm nha\.$/.test(t), t);
  ok("CTV: không hai dấu chấm", !/\.\.\s/.test(t), t);
}

// ── Chính chủ: giọng CSKH, cắt dấu chấm thừa ────────────────────────────────
{
  const t = escalationText({
    kind: "escalation",
    note: "khách đang quan tâm căn #BDS-Q5-0001 của mình, cần bổ sung: diện tích đất.",
    seller_id: "s-1",
  });
  ok("chính chủ: mở bằng lời chào", /^Chào anh\/chị, em bên AI Ơi Nhà Đất ạ\./.test(t), t);
  ok("chính chủ: không hai dấu chấm", !/\.\.\s/.test(t), t);
  ok("chính chủ: đọc nhãn tiếng người, không đọc tên cột", /diện tích đất/.test(t) && !/dien_tich_dat/.test(t), t);
}

// ── 💬 câu hỏi bù của ask-seller (FR-177 f): nguyên văn, không bọc ───────────
{
  const t = escalationText({ kind: "escalation", note: "💬 Dạ anh ơi, nhà mình sổ hồng riêng chưa ạ?", seller_id: "s-1" });
  ok("💬: gửi nguyên câu bot soạn", t === "Dạ anh ơi, nhà mình sổ hồng riêng chưa ạ?", t);
  ok("💬: không có lời chào AI Ơi Nhà Đất", !/em bên AI Ơi Nhà Đất/.test(t), t);
}

// ── report (báo cáo CTV 17h): gửi NGUYÊN VĂN, không thêm gì ─────────────────
{
  const bao = "Báo cáo CTV 2026-09-07 (17h)\n\n【CTV 1】\n- Đang chăm: 1 đơn";
  ok("report: nguyên văn", escalationText({ kind: "report", note: bao, seller_id: null }) === bao);
}

// ── Ghi chú rỗng thì không nổ ───────────────────────────────────────────────
ok("note rỗng: không nổ", typeof escalationText({ kind: "escalation", note: null }) === "string");

// ── 01/10/2026: tin NỘI BỘ (❓ 😟 🩺…) lỡ gắn seller_id KHÔNG bao giờ bọc lời chào chủ nhà; đường gửi (escalation-feed, nudge)
//    hỏi `laTinNoiBo` để không chọn chủ nhà làm người nhận. "💬" là câu soạn CHO chủ nhà — không phải nội bộ.
{
  const cx = '😟 Zalo …x-01 có vẻ bực: "phiền quá" — anh chị phụ trách xem lại cuộc chat, nhắn khách giúp.';
  const t = escalationText({ kind: "escalation", note: cx, seller_id: "s-1" });
  ok("NB-01 😟 có seller_id → KHÔNG bọc 'Chào anh/chị … bổ sung giúp em'", !/Chào anh\/chị|bổ sung giúp em/.test(t), t);
  ok("NB-02 laTinNoiBo: ❓ / 😟 / 🩺 là nội bộ", laTinNoiBo("❓ Zalo …1234 hỏi: \"phí sao\"") && laTinNoiBo(cx) && laTinNoiBo("🩺 3 lỗi"));
  ok("NB-03 laTinNoiBo: 💬 câu soạn cho chủ nhà, câu chữ thường → KHÔNG nội bộ",
    !laTinNoiBo("💬 Anh ơi, có khách hỏi căn …") && !laTinNoiBo("Căn 12 Trần Hưng Đạo của mình còn bán không ạ?") && !laTinNoiBo(null));
}

console.log(hong ? `\nTIN-NHAC: ${hong}/${tong} CA HỎNG` : `\nTIN-NHAC: ${tong}/${tong} CA ĐẠT`);
process.exit(hong ? 1 : 0);
