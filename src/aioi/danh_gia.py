"""Khách chấm sao cho AI sau khi xong việc (SRS-5.1zzzzzzz104, chủ dự án 21/10/2026 "chốt").

- Lúc hỏi: MỘT lần mỗi khách. Bên bán: sau khi tin đã lên web và đã nói xong chuyện phí. Bên mua: khi khách cho biết đã nhận
  đủ thông tin căn (lượt AI đọc theo nghĩa, code kiểm trích dẫn).
- Câu hỏi do code gửi, đúng câu chủ dự án duyệt — model không tự đặt câu.
- Đọc câu trả lời: lượt AI lập thao tác đọc số sao theo nghĩa ("5 sao", "⭐⭐⭐⭐", "tốt lắm"), code chỉ nhận khi cụm trích có
  trong tin vừa nhắn VÀ lời bot ngay trước là câu xin chấm sao (không cần đọc DB mới biết khách đang được hỏi).
- Lưu ở bảng `danh_gia_ai` (một dòng mỗi khách); ≤ 2 sao thì xếp tin nội bộ "⭐" cho admin (cùng đường escalation-feed)."""
from __future__ import annotations

# Dấu nhận ra câu xin chấm sao trong lời bot vừa gửi — đúng một chỗ sinh câu (cau_xin_sao), nên so chuỗi là tất định.
DAU_XIN_SAO = "chấm giúp"
NGUONG_BAO_ADMIN = 2


def cau_xin_sao(goi: str = "anh/chị", em_xung_minh: bool = False) -> str:
    """Câu chủ dự án duyệt 21/10: "Anh/chị chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ." Khách xưng "em"
    thì bot xưng "mình" (luật xưng hô, SRS-5.1zzzzzzz86)."""
    if em_xung_minh:
        return "Em chấm giúp mình 1–5 sao cho lần hỗ trợ này nha, để mình làm tốt hơn nhé."
    goi = (goi or "anh/chị").strip()
    return f"{goi[:1].upper()}{goi[1:]} {DAU_XIN_SAO} em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ."


def vua_xin_sao(loi_bot_truoc: str | None) -> bool:
    return bool(loi_bot_truoc) and DAU_XIN_SAO in loi_bot_truoc and "1–5 sao" in loi_bot_truoc


def doc_sao(gia_tri) -> int | None:
    try:
        n = int(gia_tri)
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 5 else None


def khoi_cam_on_sao(sao: int) -> str:
    """Lời dặn model ở lượt khách vừa chấm: cảm ơn ngắn; điểm thấp thì xin lỗi và nói đã báo người phụ trách."""
    if sao <= NGUONG_BAO_ADMIN:
        viec = ("xin lỗi chân thành vì lần hỗ trợ chưa tốt, nói em đã báo anh/chị phụ trách để liên hệ hỗ trợ thêm. KHÔNG hỏi "
                "lại, KHÔNG biện minh.")
    else:
        viec = "cảm ơn ngắn, ấm áp (1 câu). KHÔNG hỏi thêm."
    return f"\n\n=== KHÁCH VỪA CHẤM {sao} SAO CHO LẦN HỖ TRỢ (hệ thống đã ghi) ===\nLượt này {viec}\n"


KHOI_SAP_XIN_SAO = ("\n\n=== LƯỢT NÀY KHÔNG ĐẶT CÂU HỎI ===\nHệ thống tự gửi thêm MỘT câu xin khách chấm sao ngay sau lời em — "
                    "em trả lời / chốt ý khách vừa nói rồi dừng, KHÔNG hỏi gì thêm, KHÔNG tự xin đánh giá.\n")
