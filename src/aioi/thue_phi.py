"""Công cụ tính toán Thuế & Phí chuyển nhượng nhà đất (SRS-5.1zzzzzzz388, 06/11/2026).

Căn cứ pháp lý:
  - Thuế TNCN: 2% (Điều 14 Luật Thuế TNCN số 109/2025/QH15; Nghị định 253/2026/NĐ-CP).
  - Lệ phí trước bạ: 0,5% (Nghị định 10/2022/NĐ-CP sửa đổi bởi Nghị định 175/2025/NĐ-CP).
  - Phí công chứng hợp đồng mua bán: Thông tư 257/2016/TT-BTC (Điều 4) sửa đổi bởi Thông tư 111/2017/TT-BTC.
  - Phí thẩm định hồ sơ & cấp đổi đăng bộ: theo quy định địa phương (ước tính 1.500.000 - 2.500.000 đ).
Logic tính toán thuần Python, không tốn dung lượng database (0 byte DB footprint).
"""
from __future__ import annotations

# Lệ phí thẩm định hồ sơ đăng bộ sang tên ước tính
LE_PHI_DANG_BO_THAM_KHAO = 2_000_000


def tinh_phi_cong_chung(gia_vnd: int) -> int:
    """Tính phí công chứng hợp đồng chuyển nhượng quyền sử dụng đất, mua bán tài sản theo Thông tư 257/2016/TT-BTC."""
    if gia_vnd <= 0:
        return 0
    if gia_vnd <= 50_000_000:
        return 50_000
    if gia_vnd <= 100_000_000:
        return 100_000
    if gia_vnd <= 1_000_000_000:
        return max(100_000, round(gia_vnd * 0.001))
    if gia_vnd <= 3_000_000_000:
        return 1_000_000 + round((gia_vnd - 1_000_000_000) * 0.0006)
    if gia_vnd <= 5_000_000_000:
        return 2_200_000 + round((gia_vnd - 3_000_000_000) * 0.0005)
    if gia_vnd <= 10_000_000_000:
        return 3_200_000 + round((gia_vnd - 5_000_000_000) * 0.0004)
    if gia_vnd <= 100_000_000_000:
        return 5_200_000 + round((gia_vnd - 10_000_000_000) * 0.0002)

    # Trên 100 tỷ: 23,2 triệu + 0,01% phần vượt 100 tỷ, tối đa không quá 70 triệu
    phi = 23_200_000 + round((gia_vnd - 100_000_000_000) * 0.0001)
    return min(70_000_000, phi)


def tinh_thue_phi_chuyen_nhuong(gia_vnd: int, can_duy_nhat: bool = False) -> dict[str, int]:
    """Tính toàn bộ thuế, lệ phí và phí công chứng khi chuyển nhượng nhà đất."""
    if gia_vnd <= 0:
        return {
            "gia_vnd": 0,
            "thue_tncn": 0,
            "le_phi_truoc_ba": 0,
            "phi_cong_chung": 0,
            "phi_dang_bo": 0,
            "tong_ben_ban": 0,
            "tong_ben_mua": 0,
            "tong_chi_phi": 0,
        }

    thue_tncn = 0 if can_duy_nhat else round(gia_vnd * 0.02)
    le_phi_truoc_ba = round(gia_vnd * 0.005)
    phi_cong_chung = tinh_phi_cong_chung(gia_vnd)
    phi_dang_bo = LE_PHI_DANG_BO_THAM_KHAO

    tong_ben_ban = thue_tncn
    tong_ben_mua = le_phi_truoc_ba + phi_cong_chung + phi_dang_bo
    tong_chi_phi = tong_ben_ban + tong_ben_mua

    return {
        "gia_vnd": gia_vnd,
        "thue_tncn": thue_tncn,
        "le_phi_truoc_ba": le_phi_truoc_ba,
        "phi_cong_chung": phi_cong_chung,
        "phi_dang_bo": phi_dang_bo,
        "tong_ben_ban": tong_ben_ban,
        "tong_ben_mua": tong_ben_mua,
        "tong_chi_phi": tong_chi_phi,
    }


def _dinh_dang_tien(so_tien: int) -> str:
    """Định dạng tiền VNĐ có dấu chấm phân cách hàng nghìn."""
    return f"{so_tien:,.0f}".replace(",", ".") + " đ"


def _dinh_dang_gia_ty(gia_vnd: int) -> str:
    """Hiển thị giá trị BĐS gọn gàng theo tỷ / triệu."""
    if gia_vnd >= 1_000_000_000:
        ty = gia_vnd / 1_000_000_000
        return f"{ty:.2f}".rstrip("0").rstrip(".") + " tỷ"
    trieu = gia_vnd / 1_000_000
    return f"{trieu:.0f} triệu"


def dinh_dang_thue_phi_chat(gia_vnd: int, can_duy_nhat: bool = False) -> str:
    """Tạo câu trả lời chi tiết, chuyên nghiệp cho Zalo bot khi khách hỏi thuế phí."""
    kq = tinh_thue_phi_chuyen_nhuong(gia_vnd, can_duy_nhat=can_duy_nhat)
    gia_chu = _dinh_dang_gia_ty(gia_vnd)

    dong_tncn = "0 đ (được miễn do là căn nhà duy nhất)" if can_duy_nhat else _dinh_dang_tien(kq["thue_tncn"])

    return (
        f"Dạ với giao dịch nhà đất giá trị **{gia_chu}** ({_dinh_dang_tien(gia_vnd)}), các khoản thuế phí ước tính gồm:\n\n"
        f"🔴 **Bên bán chuẩn bị ({_dinh_dang_tien(kq['tong_ben_ban'])}):**\n"
        f"- Thuế TNCN (2%): {dong_tncn}\n\n"
        f"🔵 **Bên mua chuẩn bị ({_dinh_dang_tien(kq['tong_ben_mua'])}):**\n"
        f"- Lệ phí trước bạ (0.5%): {_dinh_dang_tien(kq['le_phi_truoc_ba'])}\n"
        f"- Phí công chứng (theo TT 257/2016): {_dinh_dang_tien(kq['phi_cong_chung'])}\n"
        f"- Lệ phí thẩm định & đăng bộ sang tên: khoảng {_dinh_dang_tien(kq['phi_dang_bo'])}\n\n"
        f"👉 **Tổng chi phí giao dịch ước tính:** khoảng **{_dinh_dang_tien(kq['tong_chi_phi'])}**.\n"
        "*(Lưu ý: Mức phân chia trên theo thông lệ thị trường, hai bên có thể thoả thuận lại trong hợp đồng đặt cọc ạ)*"
    )
