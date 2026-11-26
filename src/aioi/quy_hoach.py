"""Hướng dẫn tra quy hoạch & lộ giới (SRS-5.1zzzzzzz394, 06/11/2026; sửa 08/11/2026).

Công cụ KHÔNG tra bản đồ quy hoạch — hệ thống chưa nối nguồn quy hoạch nào. Nên nó trả kiến thức chung + cách tự tra, và nói rõ là chưa
tra địa chỉ này. Bản 06/11 đặt tiêu đề "THẨM ĐỊNH QUY HOẠCH: <địa chỉ>" như đã tra thật, đoán hẻm / mặt tiền bằng regex, và nêu khoảng
lùi cụ thể (2–3 m, 3–5 m) chưa đối chiếu văn bản.
"""
from __future__ import annotations

from .chu import bo_dau


def _vi_tri(dia_chi: str) -> str:
    """'hem' nếu địa chỉ có dấu "/" (số nhà kiểu 12/4) hoặc chữ hẻm / kiệt / ngõ; 'mat_tien' nếu nói mặt tiền; còn lại 'khong_ro'."""
    s = f" {bo_dau(dia_chi.lower())} "
    if "/" in s or any(f" {k} " in s for k in ("hem", "kiet", "ngo")):
        return "hem"
    if "mat tien" in s:
        return "mat_tien"
    return "khong_ro"


CONG_QUY_HOACH = "https://thongtinquyhoach.hochiminhcity.gov.vn"   # cổng của Sở Quy hoạch – Kiến trúc TP.HCM (mở kiểm 16/11/2026: tra theo
# toạ độ VN2000, số thửa + số tờ theo phường, tên đường). Không có API công khai — bot chỉ đưa link, không tự tra.


def nho_admin_tra(conv, dia_chi: str, quan_huyen: str = "") -> bool:
    """SRS-5.1zzzzzzz503 (chủ dự án 16/11: "bot đưa link cổng thành phố và chuyển admin khi chủ nhờ"): khách NHỜ tra giúp → xếp tin báo admin
    cùng lượt (đường `can_nguoi_that` + `bao_admin_he_thong` như lúc hệ thống nhờ admin điền phường). Lượt đã có việc báo admin khác thì thôi
    (một lượt một tin báo). Trả True khi đã xếp."""
    y = getattr(conv, "y_luot", None)
    if not isinstance(y, dict) or y.get("can_nguoi_that"):
        return False
    noi = ", ".join(x for x in (dia_chi.strip(), quan_huyen.strip()) if x)
    y["bao_admin_he_thong"] = True
    y["can_nguoi_that"] = ("Khách nhờ tra QUY HOẠCH giúp — admin tra trên " + CONG_QUY_HOACH + " (cần số tờ, số thửa trên sổ) rồi nhắn khách: " + noi)
    return True


def tra_cuu_quy_hoach_lo_gioi(dia_chi: str, quan_huyen: str = "", da_bao_admin: bool = False) -> str:
    """Kết quả công cụ `tham_dinh_quy_hoach`: kiến thức chung + cách tra, không kết luận về địa chỉ cụ thể."""
    vt = _vi_tri(dia_chi or "")
    noi = ", ".join(x for x in (dia_chi.strip(), quan_huyen.strip()) if x) or "chưa rõ địa chỉ"
    dong = [
        f"=== THẨM ĐỊNH QUY HOẠCH: HƯỚNG DẪN CHUNG — CHƯA tra bản đồ cho {noi} ===",
        "- Nói rõ với khách: em chưa tra được quy hoạch của chính căn này; dưới đây là cách kiểm và các trường hợp thường gặp.",
    ]
    if vt == "hem":
        dong.append("- Lộ giới quy hoạch hẻm do UBND quận / huyện công bố (TP.HCM theo QĐ 56/2021/QĐ-UBND). Hẻm hiện hữu hẹp hơn lộ giới thì "
                    "thường mở đều hai bên từ tim hẻm; phần đất nằm trong lộ giới khi xin phép xây mới bị hạn chế (xây tạm / lùi vào).")
    elif vt == "mat_tien":
        dong.append("- Nhà mặt tiền: lộ giới đường theo quy hoạch được duyệt; khoảng lùi xây dựng phụ thuộc lộ giới và chiều cao công trình "
                    "(quy chuẩn QCVN 01:2021/BXD và quy định của thành phố) — số cụ thể tra theo căn, không nói chung một con số.")
    dong += [
        "- Ba trường hợp chức năng đất hay gặp (quy hoạch phân khu 1/2000): đất ở hiện hữu (xin phép, hoàn công, sang tên bình thường) · "
        "đất ở xây mới / hỗn hợp (có thể chỉ được cấp phép có thời hạn) · đất công viên, giao thông dự phóng (quy hoạch treo, rủi ro cao).",
        f"- Cách tự tra: cổng 'Thông tin quy hoạch TP.HCM' của Sở Quy hoạch – Kiến trúc: {CONG_QUY_HOACH} — chọn tra theo số thửa (phường, số "
        "tờ, số thửa ghi trên sổ) hoặc tên đường; có cả ứng dụng điện thoại cùng tên. Gửi khách NGUYÊN link này; kết quả tra online chỉ để tham khảo.",
        ("- HỆ THỐNG ĐÃ CHUYỂN người phụ trách tra giúp căn này: nói em đã nhờ người phụ trách tra và có kết quả sẽ nhắn qua Zalo này (không hẹn "
         "giờ); xin thêm số tờ, số thửa trên sổ nếu khách chưa đưa." if da_bao_admin else
         "- Khách muốn bên em tra giúp thì gọi lại công cụ này với nho_tra_giup = true (hệ thống chuyển người phụ trách); chưa gọi thì KHÔNG nói đã chuyển."),
        "- Trước khi cọc lớn: xin 'văn bản cung cấp thông tin quy hoạch' tại UBND quận / huyện (bộ phận một cửa) bằng bản sao sổ.",
    ]
    return "\n".join(dong) + "\n"
