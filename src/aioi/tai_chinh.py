"""Số liệu tài chính THAM KHẢO cho khách mua (SRS-5.1zzzzzzz148, 23/10/2026).

Chủ dự án: "số liệu tài chính cứ để số tượng trưng đã, sau tôi sẽ sửa". Các số dưới đây KHÔNG phải số liệu thị trường đã kiểm — chép từ
ví dụ chủ dự án đưa (sinh lời căn hộ 6–8 %/năm, lãi suất vay 7–9 %/năm, gói ưu đãi 7,5 % năm đầu) để bot có chữ trả lời khi khách hỏi.
Sửa số ở MỘT chỗ này; bot luôn nói đây là số tham khảo, không cam kết, không bình luận "đáng mua / nên vay".
"""
from __future__ import annotations

# [TƯỢNG TRƯNG — chủ dự án sẽ thay bằng số thật]
SINH_LOI_THAM_KHAO = "khoảng 6–8 % một năm"
LAI_SUAT_VAY_THAM_KHAO = "khoảng 7–9 % một năm"
LAI_SUAT_UU_DAI_THAM_KHAO = "khoảng 7,5 % trong năm đầu"


def khoi_tai_chinh() -> str:
    """Khối đưa vào system prompt phía mua: số được phép nói và cách nói."""
    return ("\n\nSỐ LIỆU TÀI CHÍNH THAM KHẢO (số tượng trưng, chủ dự án sẽ cập nhật) — CHỈ dùng khi khách TỰ hỏi về sinh lời / lãi suất / vay:\n"
            f"- Sinh lời cho thuê căn hộ: {SINH_LOI_THAM_KHAO}.\n"
            f"- Lãi suất vay mua nhà: {LAI_SUAT_VAY_THAM_KHAO}; gói ưu đãi {LAI_SUAT_UU_DAI_THAM_KHAO}.\n"
            "Luôn nói rõ đây là số tham khảo, tuỳ ngân hàng / thời điểm, không phải cam kết. Không đưa số nào khác ngoài các số trên, không "
            "bình luận căn nào 'đáng mua' hay 'nên vay bao nhiêu', không tự nêu số khi khách chưa hỏi. Khách cần số chính xác thì nói em nhờ người "
            "phụ trách báo lại.\n")
