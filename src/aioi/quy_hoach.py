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


def tra_cuu_quy_hoach_lo_gioi(dia_chi: str, quan_huyen: str = "", loai_quy_hoach: str = "tat_ca") -> str:
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
        "- Cách tự tra: cổng / ứng dụng 'Thông tin quy hoạch TP.HCM' của Sở Quy hoạch – Kiến trúc, nhập số tờ, số thửa trên sổ.",
        "- Trước khi cọc lớn: xin 'văn bản cung cấp thông tin quy hoạch' tại UBND quận / huyện (bộ phận một cửa) bằng bản sao sổ.",
    ]
    return "\n".join(dong) + "\n"
