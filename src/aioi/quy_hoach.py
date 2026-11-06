"""Module Tra Cứu Quy Hoạch & Lộ Giới Xây Dựng (SRS-5.1zzzzzzz394, 06/11/2026).

Tinh hoa MOSO:
- Thẩm định pháp lý quy hoạch: Phân loại Đất nhóm nhà ở hiện hữu (an tâm hoàn công) vs
  Đất xây dựng mới / hỗn hợp (GPXD có thời hạn) vs Đất công viên / giao thông dự phóng (dính quy hoạch treo).
- Tra cứu lộ giới đường / hẻm, chỉ giới đường đỏ, chỉ giới xây dựng & quy chuẩn khoảng lùi
  theo Quyết định 56/2021/QĐ-UBND TP.HCM và QCVN 04:2021/BXD.
- Hướng dẫn quy trình nộp hồ sơ xin cấp Chứng chỉ quy hoạch tại Phòng QLĐT / Chi nhánh VP Đăng ký đất đai.
"""
from __future__ import annotations

import re
from typing import Any

# Từ điển quy chuẩn lộ giới hẻm phổ biến tại các quận TP.HCM theo Quyết định 88/2007/QĐ-UBND & Quyết định 56/2021/QĐ-UBND
# Hẻm chính: thường lộ giới 6m - 8m; Hẻm nhánh/hẻm cụt: thường 3.5m - 4.5m
LOI_GIOI_HEM_CHUAN: dict[str, str] = {
    "hem_chinh": "Lộ giới quy hoạch thường từ 6m đến 8m (đảm bảo 2 làn xe và xe cứu hỏa tiếp cận).",
    "hem_nhanh": "Lộ giới quy hoạch chuẩn từ 3.5m đến 4.5m.",
    "hem_cut": "Lộ giới quy hoạch tối thiểu 3.5m đối với hẻm dài dưới 50m.",
}


def tra_cuu_quy_hoach_lo_gioi(
    dia_chi: str,
    quan_huyen: str = "",
    loai_quy_hoach: str = "tat_ca",
) -> str:
    """Tư vấn và thẩm định quy hoạch chi tiết, lộ giới mở đường cho BĐS."""
    dia_chi_s = dia_chi.strip()
    quan_s = quan_huyen.strip() or "TP.HCM"

    # Nhận diện đặc điểm từ địa chỉ
    co_hem = bool(re.search(r"\b(hẻm|hem|\d+/\d+)\b", dia_chi_s, re.IGNORECASE))
    co_mat_tien = bool(re.search(r"\b(mặt tiền|mat tien|đường|duong)\b", dia_chi_s, re.IGNORECASE)) and not co_hem

    dong = [
        f"🏛️ THẨM ĐỊNH QUY HOẠCH & LỘ GIỚI: {dia_chi_s.upper()}",
        f"• Địa bàn: {quan_s}",
        "",
        "1️⃣ THẨM ĐỊNH LỘ GIỚI & CHỈ GIỚI ĐƯỜNG ĐỎ (QĐ 56/2021/QĐ-UBND TP.HCM):",
    ]

    if co_hem:
        dong.extend([
            "  • Hiện trạng hẻm: Có kết cấu hẻm dân cư hiện hữu.",
            f"  • Lộ giới quy hoạch hẻm: {LOI_GIOI_HEM_CHUAN['hem_nhanh']}",
            "  • Lưu ý phần đất dính lộ giới: Nếu hẻm hiện hữu 3m mà lộ giới 4.5m thì tim hẻm mở đều ra 2 bên (mỗi bên mở rộng ~0.75m).",
            "    - Phần đất nằm ngoài lộ giới: Công nhận 100%, xây dựng đủ tầng theo quy chuẩn.",
            "    - Phần đất nằm trong lộ giới: Được công nhận trong sổ nhưng khi xin phép xây dựng mới chỉ được xây tạm (hoặc lùi vào chỉ giới xây dựng).",
        ])
    elif co_mat_tien:
        dong.extend([
            "  • Hiện trạng: Nhà/Đất vị trí Mặt tiền đường.",
            "  • Lộ giới quy hoạch đường chính: Các trục đường TP.HCM thường có lộ giới quy hoạch từ 12m, 20m, 30m đến 40m.",
            "  • Quy chuẩn khoảng lùi (QCVN 04:2021/BXD):",
            "    - Lộ giới < 12m: Xây dựng sát chỉ giới đường đỏ (khoảng lùi = 0m).",
            "    - Lộ giới 12m - 19m: Thường lùi 2m - 3m nếu công trình cao trên 19m.",
            "    - Lộ giới >= 20m: Thường lùi 3m - 5m tùy chiều cao tầng.",
        ])
    else:
        dong.extend([
            "  • Lộ giới chung: Áp dụng theo đồ án quy hoạch phân khu 1/2000 được UBND quận/huyện phê duyệt.",
            "  • Nguyên tắc tim đường: Khi mở rộng hẻm/đường, chỉ giới mở rộng tính từ tim đường hiện hữu sang 2 bên trừ khi có quy hoạch tim đường lệch.",
        ])

    dong.extend([
        "",
        "2️⃣ PHÂN LOẠI CHỨC NĂNG SỬ DỤNG ĐẤT (QUY HOẠCH 1/2000):",
        "  • Đất Nhóm Nhà Ở Hiện Hữu: An toàn nhất! Đất ở ổn định lâu dài, được phép cấp GPXD chính thức, hoàn công và chuyển nhượng bình thường.",
        "  • Đất Nhóm Nhà Ở Xây Dựng Mới / Hỗn Hợp: Được cấp GPXD có thời hạn (tối đa 3-5 tầng) theo Nghị định 15/2021/NĐ-CP và Quyết định 56 TP.HCM; khi Nhà nước thực hiện quy hoạch sẽ bồi thường theo luật định.",
        "  • Đất Công Viên Cây Xanh / Giao Thông Dự Phóng: Quy hoạch treo, chỉ được sửa chữa nguyên trạng hoặc cấp phép xây tạm, rủi ro cao nếu mua đầu tư lướt sóng.",
        "",
        "3️⃣ HƯỚNG DẪN KIỂM TRA PHÁP LÝ TRƯỚC KHI ĐẶT CỌC:",
        "  1. Tra cứu trực tuyến: Cài App 'Thông tin Quy hoạch TP.HCM' (Sở Quy hoạch - Kiến trúc TP.HCM) -> Nhập Số Tờ, Số Thửa trên Sổ hồng để định vị tọa độ và xem bản đồ phân khu màu sắc.",
        "  2. Trích lục văn bản: Trước khi xuống tiền cọc lớn, mang bản photo Sổ hồng đến Bộ phận một cửa / Phòng Quản lý Đô thị UBND quận/huyện xin 'Văn bản cung cấp thông tin quy hoạch' (thời gian trả kết quả 7-10 ngày).",
    ])

    return "\n".join(dong)
