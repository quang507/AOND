"""Số liệu tài chính THAM KHẢO & Công cụ tính toán vay mua nhà cho khách mua (SRS-5.1zzzzzzz148, SRS-5.1zzzzzzz388).

Chủ dự án: "số liệu tài chính cứ để số tượng trưng đã, sau tôi sẽ sửa". Các số dưới đây KHÔNG phải số liệu thị trường đã kiểm — chép từ
ví dụ chủ dự án đưa (sinh lời căn hộ 6–8 %/năm, lãi suất vay 7–9 %/năm, gói ưu đãi 7,5 % năm đầu, vay tối đa 70%, vốn tự có 30%) để bot
có chữ trả lời khi khách hỏi. Sửa số ở MỘT chỗ này; bot luôn nói đây là số tham khảo, không cam kết, không bình luận "đáng mua / nên vay".
"""
from __future__ import annotations

# [TƯỢNG TRƯNG — chủ dự án sẽ thay bằng số thật]
SINH_LOI_THAM_KHAO = "khoảng 6–8 % một năm"
LAI_SUAT_VAY_THAM_KHAO = "khoảng 7–9 % một năm"
LAI_SUAT_UU_DAI_THAM_KHAO = "khoảng 7,5 % trong năm đầu"
TY_LE_VAY_TOI_DA_THAM_KHAO = "tối đa khoảng 70% giá trị căn nhà / BĐS"
VON_TU_CO_TOI_THIEU_THAM_KHAO = "tối thiểu khoảng 30% giá trị căn nhà (tiền cọc + vốn ban đầu)"


def _kep(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def tinh_vay_tra_gop(
    gia_vnd: int,
    ty_le_vay: float = 0.7,
    so_nam: int = 20,
    lai_suat_nam: float = 7.5,
) -> dict[str, int | float]:
    """Khoản vay mua nhà, dư nợ giảm dần (SRS-5.1zzzzzzz388; sửa 08/11). Model có thể truyền tỷ lệ vay dạng 70 thay vì 0,7 → quy về
    phần; tỷ lệ kẹp 0–0,9, thời hạn 1–35 năm, lãi 0–30 %/năm (bản 06/11 nhận 70 thành vay 7000 %)."""
    ty_le_vay = _kep(ty_le_vay / 100 if ty_le_vay > 1 else ty_le_vay, 0.0, 0.9)
    so_nam = int(_kep(so_nam, 1, 35))
    lai_suat_nam = _kep(lai_suat_nam, 0.0, 30.0)
    so_thang = so_nam * 12
    so_tien_vay = round(max(gia_vnd, 0) * ty_le_vay)
    goc = round(so_tien_vay / so_thang)
    lai_dau = round(so_tien_vay * lai_suat_nam / 100 / 12)
    return {
        "gia_vnd": max(gia_vnd, 0),
        "ty_le_vay": ty_le_vay,
        "von_tu_co": max(gia_vnd, 0) - so_tien_vay,
        "so_tien_vay": so_tien_vay,
        "so_nam": so_nam,
        "so_thang": so_thang,
        "lai_suat_nam": lai_suat_nam,
        "goc_hang_thang": goc,
        "lai_thang_dau": lai_dau,
        "tong_thang_dau": goc + lai_dau,
    }


def dinh_dang_vay_chat(
    gia_vnd: int,
    ty_le_vay: float = 0.7,
    so_nam: int = 20,
    lai_suat_nam: float = 7.5,
) -> str:
    """Kết quả công cụ `tinh_vay_tra_gop` — số liệu để model viết lời, không phải câu gửi khách viết sẵn."""
    from .phap_ly import tien as t
    kq = tinh_vay_tra_gop(gia_vnd, ty_le_vay=ty_le_vay, so_nam=so_nam, lai_suat_nam=lai_suat_nam)
    pt = round(float(kq["ty_le_vay"]) * 100)
    return (
        f"=== VAY TRẢ GÓP (tham khảo, dư nợ giảm dần) — giá {t(gia_vnd)} ===\n"
        f"- Vốn tự có ({100 - pt}%): {t(kq['von_tu_co'])} · vay ({pt}%): {t(kq['so_tien_vay'])} · {kq['so_nam']} năm ({kq['so_thang']} tháng)\n"
        f"- Lãi giả định {kq['lai_suat_nam']:g}%/năm (số tượng trưng, chưa phải lãi ngân hàng thật)\n"
        f"- Gốc mỗi tháng {t(kq['goc_hang_thang'])}; lãi tháng đầu {t(kq['lai_thang_dau'])}; tháng đầu tổng {t(kq['tong_thang_dau'])}, các tháng sau giảm dần "
        "theo dư nợ (nếu lãi thả nổi tăng sau ưu đãi thì có thể cao hơn)\n"
        "- Số chính thức do ngân hàng xét theo hồ sơ.\n"
    )


def khoi_tai_chinh() -> str:
    """Khối đưa vào system prompt phía mua: số được phép nói và cách nói."""
    return ("\n\nSỐ LIỆU TÀI CHÍNH THAM KHẢO (số tượng trưng, chủ dự án sẽ cập nhật) — CHỈ dùng khi khách TỰ hỏi về sinh lời / lãi suất / vay:\n"
            f"- Sinh lời cho thuê căn hộ: {SINH_LOI_THAM_KHAO}.\n"
            f"- Lãi suất vay mua nhà: {LAI_SUAT_VAY_THAM_KHAO}; gói ưu đãi {LAI_SUAT_UU_DAI_THAM_KHAO}.\n"
            f"- Hỗ trợ vay ngân hàng: {TY_LE_VAY_TOI_DA_THAM_KHAO}, tuỳ hồ sơ tài chính và ngân hàng xét duyệt.\n"
            f"- Vốn tự có cần chuẩn bị: {VON_TU_CO_TOI_THIEU_THAM_KHAO}.\n"
            "- Ví dụ giải thích tỷ lệ vay (khi khách hỏi số tiền tối thiểu hay tỷ lệ vay): căn 10 tỷ thì vốn tự có tối thiểu khoảng 3 tỷ, phần còn lại ngân hàng hỗ trợ vay tối đa khoảng 7 tỷ; vay 20 năm thì gốc khoảng 29,2 triệu/tháng, lãi tháng đầu khoảng 43,7 triệu (với lãi ưu đãi 7,5%), tổng tháng đầu khoảng 72,9 triệu rồi giảm dần.\n"
            "Luôn nói rõ đây là số tham khảo, tuỳ ngân hàng / thời điểm và điều kiện xét duyệt hồ sơ, không phải cam kết. Có thể gợi ý khách cho biết tầm giá hoặc căn cụ thể để ước tính khoản vay / số tiền trả góp hàng tháng. Không "
            "bình luận căn nào 'đáng mua' hay 'nên vay bao nhiêu', không tự nêu số khi khách chưa hỏi. Khách cần số trả góp chính xác thì nói em tính ước tính tham khảo, số chính thức theo hồ sơ do ngân hàng thông báo — KHÔNG hứa nhờ ai báo lại (hệ thống không có việc đó).\n")
