"""Câu mẫu cố định bot nói nguyên văn — một nguồn, chủ dự án sửa ở CRM (SRS-5.1zzzzzzz106, 21/10/2026: "đưa thêm 1 bảng nhỏ ở 1 bên là
các câu đã sửa thành mẫu từ lúc lấy lại các yêu cầu của anh Luận đến bây giờ… có gì vào sửa tiếp").

Câu trong code (`MAC_DINH`) là MẶC ĐỊNH; dòng ở bảng `cau_mau` (trang /admin/cau-chuan, khung "Câu mẫu cố định") đè lên, đọc lại sau
60 giây. Chỗ giữ chữ: `{goi}` = cách gọi khách (anh / chị / anh/chị), `{Goi}` = như trên, viết hoa chữ đầu. Câu sửa hỏng (ngoặc
nhọn lạ, rỗng) thì dùng mặc định — bot không bao giờ gửi câu lỗi vì một lần sửa tay."""
from __future__ import annotations

import logging
import time
from typing import Callable

log = logging.getLogger(__name__)

# khoá → (câu mặc định, dùng ở đâu, nguồn quyết định). Thứ tự = thứ tự hiện trên CRM.
MAC_DINH: dict[str, tuple[str, str, str]] = {
    "duyet_tin": ("Em xin phép đăng tin ạ!",
                  "Khách duyệt bản nháp — đoạn đầu lời đáp (tin đã lên web)", "SRS-5.1zzzzzzz103 · tester, chủ dự án 21/10"),
    "hoi_phi": ("{Goi} có thể vào aioinhadat.com để theo dõi tin rao ạ. {Goi} biết phí môi giới bên em chưa ạ?",
                "Ngay sau câu duyệt tin — tin nhắn thứ hai, câu hỏi phí (bot nói theo tinh thần câu này)",
                "SRS-5.1zzzzzzz81 / 98 · bản anh Luận + câu tester 21/10"),
    "nhac_ban_nhap": ("Em gửi {goi} bản nháp tin đăng, mình cần chỉnh sửa thêm nhắn em hỗ trợ ạ!",
                      "Tin nhắc sau 5 phút khách chưa trả lời bản nháp", "SRS-5.1zzzzzzz99 / 101 · câu tester 21/10"),
    "nhac_ban_nhap_em": ("Mình gửi em bản nháp tin đăng, em cần chỉnh sửa thêm nhắn mình hỗ trợ nhé!",
                         "Như trên, khi khách xưng \"em\" (bot xưng \"mình\")", "SRS-5.1zzzzzzz101"),
    "xin_cham_sao": ("{Goi} chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ.",
                     "Xin khách chấm sao — một lần, sau khi tin lên web và nói xong phí / khách mua đủ thông tin căn",
                     "SRS-5.1zzzzzzz104 · chủ dự án chốt 21/10"),
    "xin_cham_sao_em": ("Em chấm giúp mình 1–5 sao cho lần hỗ trợ này nha, để mình làm tốt hơn nhé.",
                        "Như trên, khi khách xưng \"em\"", "SRS-5.1zzzzzzz104"),
    "giu_cho": ("Em đang xem kỹ thông tin anh/chị gửi, anh/chị chờ em một chút nhé, em trả lời ngay ạ.",
                "Lượt trả lời bị lỗi — giữ chỗ, bot tự làm lại sau 20 giây", "SRS-5.1zzzzzzz82 · đánh giá UX 20/10"),
    "thu_lai_hong": ("Em xin lỗi anh/chị, hệ thống bên em đang chậm. Em đã báo anh/chị phụ trách xem tin của mình, anh/chị ấy sẽ "
                     "nhắn lại sớm ạ.", "Làm lại vẫn lỗi — xin lỗi và báo người phụ trách", "SRS-5.1zzzzzzz82"),
}

NHO_GIAY = 60
_doc: Callable[[], dict[str, str]] | None = None
_nho: tuple[float, dict[str, str]] | None = None


def dang_ky(doc: Callable[[], dict[str, str]] | None) -> None:
    """Server gắn hàm đọc bảng `cau_mau` (khoá → câu). Không gắn (chạy thử / test) thì luôn dùng mặc định."""
    global _doc, _nho
    _doc, _nho = doc, None


def _da_sua() -> dict[str, str]:
    global _nho
    if _doc is None:
        return {}
    if _nho is not None and time.time() - _nho[0] < NHO_GIAY:
        return _nho[1]
    try:
        bang = {k: str(v) for k, v in (_doc() or {}).items() if k in MAC_DINH and str(v or "").strip()}
    except Exception as e:  # noqa: BLE001 — đọc bảng lỗi thì dùng mặc định, không làm hỏng lượt
        log.warning("Đọc cau_mau lỗi: %s", e)
        bang = _nho[1] if _nho else {}
    _nho = (time.time(), bang)
    return bang


def _dien(mau: str, goi: str) -> str:
    goi = (goi or "anh/chị").strip()
    return mau.format(goi=goi, Goi=goi[:1].upper() + goi[1:]).strip()


def cau(khoa: str, goi: str = "anh/chị") -> str:
    """Câu mẫu đang dùng (đã sửa ở CRM nếu có), điền cách gọi khách. Câu sửa hỏng → mặc định."""
    mac_dinh = MAC_DINH[khoa][0]
    sua = _da_sua().get(khoa)
    if sua:
        try:
            ra = _dien(sua, goi)
            if ra:
                return ra
        except (KeyError, IndexError, ValueError) as e:
            log.warning("Câu mẫu %s sửa tay lỗi chỗ giữ chữ (%s) — dùng mặc định", khoa, e)
    return _dien(mac_dinh, goi)


def moi_cach_goi(khoa: str) -> list[str]:
    """Câu mẫu với mọi cách gọi — cả bản đang dùng lẫn bản mặc định (để nhận ra câu bot vừa gửi dù vừa sửa ở CRM)."""
    ra = []
    for goi in ("anh/chị", "anh", "chị"):
        ra += [cau(khoa, goi), _dien(MAC_DINH[khoa][0], goi)]
    return list(dict.fromkeys(ra))
