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


def tinh_vay_tra_gop(
    gia_vnd: int,
    ty_le_vay: float = 0.7,
    so_nam: int = 20,
    lai_suat_nam: float = 7.5,
) -> dict[str, int | float]:
    """Tính toán chi tiết khoản vay mua nhà theo phương thức dư nợ giảm dần (SRS-5.1zzzzzzz388)."""
    if gia_vnd <= 0:
        return {
            "gia_vnd": 0, "von_tu_co": 0, "so_tien_vay": 0, "so_nam": so_nam,
            "so_thang": max(1, so_nam * 12), "lai_suat_nam": lai_suat_nam,
            "goc_hang_thang": 0, "lai_thang_dau": 0, "tong_thang_dau": 0,
        }

    von_tu_co = round(gia_vnd * (1.0 - ty_le_vay))
    so_tien_vay = round(gia_vnd * ty_le_vay)
    so_thang = max(1, so_nam * 12)
    goc_hang_thang = round(so_tien_vay / so_thang)
    lai_thang_dau = round(so_tien_vay * (lai_suat_nam / 100.0) / 12)
    tong_thang_dau = goc_hang_thang + lai_thang_dau

    return {
        "gia_vnd": gia_vnd,
        "von_tu_co": von_tu_co,
        "so_tien_vay": so_tien_vay,
        "so_nam": so_nam,
        "so_thang": so_thang,
        "lai_suat_nam": lai_suat_nam,
        "goc_hang_thang": goc_hang_thang,
        "lai_thang_dau": lai_thang_dau,
        "tong_thang_dau": tong_thang_dau,
    }


def _dinh_dang_tien(so_tien: int | float) -> str:
    """Định dạng tiền VNĐ có dấu chấm phân cách hàng nghìn."""
    return f"{so_tien:,.0f}".replace(",", ".") + " đ"


def _dinh_dang_gia_ty(gia_vnd: int) -> str:
    """Hiển thị giá trị BĐS gọn gàng theo tỷ / triệu."""
    if gia_vnd >= 1_000_000_000:
        ty = gia_vnd / 1_000_000_000
        return f"{ty:.2f}".rstrip("0").rstrip(".") + " tỷ"
    trieu = gia_vnd / 1_000_000
    return f"{trieu:.0f} triệu"


def dinh_dang_vay_chat(
    gia_vnd: int,
    ty_le_vay: float = 0.7,
    so_nam: int = 20,
    lai_suat_nam: float = 7.5,
) -> str:
    """Định dạng kế hoạch trả góp ngân hàng thành câu trả lời Zalo chuyên nghiệp."""
    kq = tinh_vay_tra_gop(gia_vnd, ty_le_vay=ty_le_vay, so_nam=so_nam, lai_suat_nam=lai_suat_nam)
    gia_chu = _dinh_dang_gia_ty(gia_vnd)
    pt_vay = int(ty_le_vay * 100)
    pt_von = int((1.0 - ty_le_vay) * 100)

    return (
        f"Dạ với căn nhà giá trị **{gia_chu}** ({_dinh_dang_tien(gia_vnd)}), phương án tài chính vay mua nhà tham khảo như sau ạ:\n\n"
        f"- **Vốn tự có cần chuẩn bị ({pt_von}%):** {_dinh_dang_tien(kq['von_tu_co'])}\n"
        f"- **Ngân hàng hỗ trợ vay ({pt_vay}%):** {_dinh_dang_tien(kq['so_tien_vay'])}\n"
        f"- **Thời hạn vay:** {so_nam} năm ({kq['so_thang']} tháng)\n\n"
        f"📊 **Kế hoạch trả góp hàng tháng (dư nợ giảm dần, lãi ưu đãi ~{lai_suat_nam}%/năm):**\n"
        f"- **Tiền gốc:** cố định {_dinh_dang_tien(kq['goc_hang_thang'])} / tháng\n"
        f"- **Tiền lãi tháng đầu:** khoảng {_dinh_dang_tien(kq['lai_thang_dau'])}\n"
        f"👉 **Tổng tiền trả tháng đầu (cao nhất):** khoảng **{_dinh_dang_tien(kq['tong_thang_dau'])}**, sau đó sẽ giảm dần theo số dư nợ gốc thực tế.\n\n"
        "*(Số liệu mang tính tham khảo để anh/chị cân đối dòng tiền, con số chính xác sẽ do ngân hàng xét duyệt theo hồ sơ cụ thể ạ)*"
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
