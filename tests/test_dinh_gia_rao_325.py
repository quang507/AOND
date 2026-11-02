"""SRS-5.1zzzzzzz325 (chủ dự án 02/11/2026: chủ căn hộ hỏi "giá tôi đưa cao không" thì "nêu giá rao bán thị trường X–Y triệu/m²"; thay một
phần SRS-5.1zzzzzzz116). Trước bản này khối dự án phía bán mang "giá rao bán thị trường" (SRS-5.1zzzzzzz324) trong khi `KHOI_DINH_GIA` dặn
"CHƯA có dữ liệu định giá" — model nhận hai lời ngược nhau. Đỏ khi: dự án có giá rao mà khối vẫn là lời cũ; khối không mang số tin / ngày;
nhà phố / dự án thiếu số liệu lại có con số; lưới nhận xét giá bị nới."""
import pytest

from aioi.engine import _binh_luan_gia
from aioi.projects import Project
from tests.test_danh_gia_ai import _eng
from tests.test_hoi_tinh_hinh_ban import _KhoSo

GIA = "45,2–62,5 triệu/m², giữa 56,5 triệu/m² (18 tin, lấy 02/11/2026)"


def _can_ho(monkeypatch, gia=GIA):
    eng, seen, ke, conv = _eng(monkeypatch, _KhoSo())
    conv.prop.loai_hinh = "can_ho"
    conv.prop.fields["du_an"] = "La Pura"
    p = Project(name="La Pura")
    if gia:
        p.goc["giá rao bán thị trường"] = gia
    monkeypatch.setattr(eng, "project_for", lambda *a, **k: p)
    return eng, seen, ke


@pytest.mark.parametrize("cau,trich", [
    ("giá tôi đưa cao không em", "giá tôi đưa cao không"),
    ("anh rao vậy có bị hớ so với mặt bằng không", "có bị hớ so với mặt bằng"),     # cách nói mới
    ("căn bên đó giờ người ta rao bao nhiêu một mét em", "người ta rao bao nhiêu"),  # cách nói mới
])
def test_can_ho_co_gia_rao_thi_neu_khoang(monkeypatch, cau, trich):
    eng, seen, ke = _can_ho(monkeypatch)
    ke["plan"] = {"operations": [], "hoi_ve": "dinh_gia", "hoi_ve_trich_dan": trich}
    eng.handle("u-sao", cau)
    khoi = seen[-1]
    assert "giá rao bán thị trường của dự án này: 45,2–62,5 triệu/m²" in khoi and "18 tin" in khoi and "02/11/2026" in khoi
    assert "KHÔNG nhận xét giá chủ đưa cao / thấp / hợp lý" in khoi
    assert "CHƯA có dữ liệu định giá" not in khoi


def test_nha_pho_khong_co_so(monkeypatch):
    eng, seen, ke, conv = _eng(monkeypatch, _KhoSo())       # nhà phố, không dự án
    ke["plan"] = {"operations": [], "hoi_ve": "dinh_gia", "hoi_ve_trich_dan": "giá tôi đưa cao không"}
    eng.handle("u-sao", "giá tôi đưa cao không em")
    k = seen[-1].index("CHỦ NHÀ HỎI GIÁ THỊ TRƯỜNG")
    assert "CHƯA có dữ liệu định giá" in seen[-1][k:k + 700] and "triệu/m²" not in seen[-1][k:k + 700]


def test_du_an_thieu_gia_rao_giu_loi_cu(monkeypatch):
    eng, seen, ke = _can_ho(monkeypatch, gia=None)
    ke["plan"] = {"operations": [], "hoi_ve": "dinh_gia", "hoi_ve_trich_dan": "giá tôi đưa cao không"}
    eng.handle("u-sao", "giá tôi đưa cao không em")
    assert "CHƯA có dữ liệu định giá" in seen[-1]


def test_luoi_nhan_xet_gia_van_bat():
    assert _binh_luan_gia("Giá anh đưa như vậy là khá hợp lý so với thị trường ạ")
    assert _binh_luan_gia("Các tin đang rao ở dự án này khoảng 45–62 triệu/m² (18 tin, 02/11/2026), anh tham khảo ạ") is None
