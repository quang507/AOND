"""SRS-5.1zzzzzzz226 — câu mẫu cố định theo cùng luật lời gửi khách. Viết e2e kịch bản SRD anh Luận (SRS-225) lộ ra: câu mẫu `bao_phi` kết
"Mình cần biết thêm thông tin…", `nhac_ban_nhap` "mình cần chỉnh sửa thêm…", `xac_nhan_lich` "… mình đến xem căn…" — gọi KHÁCH là "mình"
trái SRS-171 / 214, trong khi lưới `_goi_khach_la_minh` gọi lại model khi lời có chữ đó (câu hệ thống dặn nói nguyên văn và lưới kéo hai
hướng). Gốc: luật chỉ áp lên lời MODEL, câu mẫu (code / CRM) đi đường riêng không ai soát. Nay luật một nguồn `xung_ho.goi_khach_la_minh`,
mọi câu mẫu mặc định phải qua nó (bài dưới), và câu sửa tay ở CRM vi phạm thì `cau()` dùng câu mặc định. Đỏ khi tắt bản sửa."""
import re

from aioi import cau_mau
from aioi.engine import _goi_khach_la_minh
from aioi.xung_ho import goi_khach_la_minh


def _dien_mau(khoa: str, goi: str) -> str:
    """Câu mặc định với mọi chỗ giữ điền giá trị mẫu (không phụ thuộc DB)."""
    mau = cau_mau.MAC_DINH[khoa][0]
    bien = {k: f"<{k}>" for k in re.findall(r"\{(\w+)\}", mau) if k not in ("goi", "Goi", "Toi")}
    bien.setdefault("toi", "em")
    return cau_mau._dien(mau, goi, **bien)


def test_moi_cau_mau_mac_dinh_khong_goi_khach_la_minh():
    vi_pham = [k for k in cau_mau.MAC_DINH for goi in ("anh/chị", "anh", "em") if goi_khach_la_minh(_dien_mau(k, goi))]
    assert not vi_pham, vi_pham


def test_moi_cau_mau_khong_mo_dau_da():
    assert not [k for k in cau_mau.MAC_DINH if re.match(r"(?i)\s*dạ(?![a-zà-ỹđ])", _dien_mau(k, "anh"))]


def test_ba_cau_cu_goi_theo_cach_xung():
    assert cau_mau.cau("bao_phi", "anh", phi="1% giá chốt").endswith("Anh cần biết thêm thông tin, nhắn em hỗ trợ ạ.")
    assert cau_mau.cau("nhac_ban_nhap", "chị") == "Em gửi chị bản nháp tin đăng, chị cần chỉnh sửa thêm nhắn em hỗ trợ ạ!"
    assert "9h sáng mai anh đến xem căn" in cau_mau.cau("xac_nhan_lich", "anh", toi="em", gio="9h sáng mai", can="Trần Bình Trọng")


def test_luoi_loi_model_va_cau_mau_cung_mot_luat():
    for loi in ("Mình cần biết thêm thông tin, nhắn em hỗ trợ ạ.", "Em gửi bản nháp, nhà mình đẹp lắm.", "9h mình đến xem căn nhé"):
        assert _goi_khach_la_minh(loi, "anh") == goi_khach_la_minh(loi)


def test_cau_sua_tay_goi_minh_thi_dung_mac_dinh():
    try:
        cau_mau.dang_ky(lambda: {"nhac_ban_nhap": "Em gửi {goi} bản nháp nha, mình xem giúp em ạ!",
                                 "duyet_tin": "Em xin phép đăng tin liền nha!"})
        assert cau_mau.cau("nhac_ban_nhap", "anh") == "Em gửi anh bản nháp tin đăng, anh cần chỉnh sửa thêm nhắn em hỗ trợ ạ!"
        assert cau_mau.cau("duyet_tin", "anh") == "Em xin phép đăng tin liền nha!"   # câu sửa tay hợp luật vẫn dùng
    finally:
        cau_mau.dang_ky(None)


def test_goi_y_cau_hoi_cho_model_khong_goi_khach_la_minh():
    # Gợi ý câu hỏi đưa model ("Hỏi anh/chị muốn mình sống…", "Hỏi mình đi làm…") — model chép theo rồi bị lưới gọi lại: cùng lớp lỗi.
    from aioi.prompts import NATURAL_QUESTIONS
    assert not [k for k, v in NATURAL_QUESTIONS.items() if goi_khach_la_minh(v if isinstance(v, str) else " ".join(v))]
