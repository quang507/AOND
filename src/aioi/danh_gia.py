"""Khách chấm sao cho AI sau khi xong việc (SRS-5.1zzzzzzz104, chủ dự án 21/10/2026 "chốt").

- Lúc hỏi: MỘT lần mỗi khách. Bên bán: sau khi tin đã lên web và đã nói xong chuyện phí. Bên mua: khi khách cho biết đã nhận
  đủ thông tin căn (lượt AI đọc theo nghĩa, code kiểm trích dẫn).
- Câu hỏi do code gửi, đúng câu chủ dự án duyệt — model không tự đặt câu.
- Đọc câu trả lời: lượt AI lập thao tác đọc số sao theo nghĩa ("5 sao", "⭐⭐⭐⭐", "tốt lắm"), code chỉ nhận khi cụm trích có
  trong tin vừa nhắn VÀ lời bot ngay trước là câu xin chấm sao (không cần đọc DB mới biết khách đang được hỏi).
- Lưu ở bảng `danh_gia_ai` (một dòng mỗi khách); ≤ 2 sao thì xếp tin nội bộ "⭐" cho admin (cùng đường escalation-feed)."""
from __future__ import annotations

from . import cau_mau

# Dấu nhận ra câu xin chấm sao trong lời bot vừa gửi — đúng một chỗ sinh câu (cau_xin_sao), nên so chuỗi là tất định.
DAU_XIN_SAO = "chấm giúp"
NGUONG_BAO_ADMIN = 2


def cau_xin_sao(goi: str = "anh/chị", tre: bool = False, toi: str = "em") -> str:
    """Câu chủ dự án duyệt 21/10: "Anh/chị chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ." Khách xưng "em" / "cháu"
    (`tre`) thì bot xưng `toi` = anh / chị / cô / chú theo tên trợ lý (SRS-5.1zzzzzzz214). Sửa câu ở CRM (`cau_mau`, SRS-5.1zzzzzzz106)."""
    return cau_mau.cau("xin_cham_sao_em", goi, toi=toi) if tre else cau_mau.cau("xin_cham_sao", goi)


def vua_xin_sao(loi_bot_truoc: str | None) -> bool:
    """Lời bot vừa gửi có câu xin chấm sao — câu đang dùng hay câu mặc định (vừa sửa ở CRM giữa hai lượt vẫn nhận)."""
    if not loi_bot_truoc:
        return False
    if any(c in loi_bot_truoc for c in cau_mau.moi_cach_goi("xin_cham_sao")
           + [c for t in ("anh", "chị", "cô", "chú", "mình") for c in cau_mau.moi_cach_goi("xin_cham_sao_em", ("em", "cháu"), toi=t)]):
        return True
    return DAU_XIN_SAO in loi_bot_truoc and "1–5 sao" in loi_bot_truoc


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
