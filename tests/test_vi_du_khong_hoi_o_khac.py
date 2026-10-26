"""SRS-5.1zzzzzzz196 (chat Bình Hưng 26/10: tin đã có "9,25 tỷ", khách trả lời "nhà anh đang ở" mà bot hỏi lại "mức giá bao nhiêu").

Gốc: ví dụ trong quy tắc 5 của `build_chat_system` ghi cả câu hỏi mẫu ("nhà mình đang ở" -> "…Căn này mình mong muốn thu về giá bao nhiêu
vậy anh/chị?"). Model chép theo ví dụ thay vì hỏi ô ở "Thông tin cần hỏi tiếp theo". Code không hề đòi hỏi giá: `gia` đã có nên không nằm
trong `missing_fields()`. Ví dụ trong prompt chỉ được minh hoạ lời ĐÁP, không kèm câu hỏi của một ô cụ thể.
"""
import re

from aioi.prompts import build_chat_system
from aioi.schema import Property


def _prop_da_co_gia() -> Property:
    p = Property(loai_hinh="nha_pho")
    p.fields.update({"dia_chi": "Khu dân cư Bình Hưng, xã Bình Hưng", "duong": "đường số", "phuong": "Xã Bình Hưng",
                     "dien_tich_nha": "150m²", "gia": "9,25 tỷ", "hien_trang_su_dung": "nhà anh đang ở"})
    return p


def test_gia_da_co_thi_khong_nam_trong_o_can_hoi():
    p = _prop_da_co_gia()
    assert "gia" not in p.missing_fields()


def test_prompt_khong_con_vi_du_cau_dap_kem_cau_hoi():
    # SRS-207: quy tắc 5 (ví dụ "Khách: … -> …") bỏ theo prompt bản anh Luận — không còn ví dụ nào để model chép câu hỏi của một ô.
    system = build_chat_system("T•ai", _prop_da_co_gia(), "dien_tich_dat")
    assert not [d for d in system.splitlines() if d.strip().startswith("- Khách:")]


def test_khong_cau_hoi_mau_nao_ve_gia_ngoai_o_cau_hoi_ke():
    """Cách nói MỚI: dựng prompt cho ô khác (hẻm) trên tin đã có giá — không chỗ nào trong prompt được kèm câu hỏi giá mẫu ngoài khối
    "Thông tin cần hỏi tiếp theo" (khối đó chỉ có khi ô kế chính là giá)."""
    p = _prop_da_co_gia()
    system = build_chat_system("T•ai", p, "lo_gioi_hem")
    ngoai_khoi_hoi = system.rsplit("Thông tin cần hỏi tiếp theo", 1)[0]
    assert not re.search(r"mong muốn (?:thu về )?giá|giá (?:bao nhiêu|khoảng bao nhiêu) vậy", ngoai_khoi_hoi, re.I)
    assert not re.search(r"bán tầm bao nhiêu ạ\?", ngoai_khoi_hoi)
