"""SRS-5.1zzzzzzz273 (bắn thử ban-thu-kiem H 29/10): khách MỚI nhắn số ký gửi "căn #SEED0040 trần cao bao nhiêu" — model lúc ra "buy" lúc
không; không ra thì lượt đi nhánh bán (bot hỏi "nhà phố hay chung cư"), câu hỏi không tới ai. Lưới đỡ bằng dữ liệu: mã tin khách gõ là một căn
ĐANG HIỆN (`can_theo_ma`) và khách chưa có việc bán → vai mua. Mã không có trên hệ thống / người đang bán → không đổi."""
from tests.test_engine import _engine


class _Kho:
    """Kho tối giản: chỉ có `can_theo_ma` (các đường kho khác đọc bằng getattr, không có thì bỏ qua)."""

    def __init__(self, co_can: bool):
        self.co_can = co_can

    def can_theo_ma(self, ma):
        return [{"code": m, "id": "x"} for m in ma] if self.co_can else []

    def __getattr__(self, ten):
        if ten in ("save", "load"):
            return lambda *a, **k: None
        raise AttributeError(ten)


def _gan_kho(e, co_can: bool):
    e._convstore = _Kho(co_can)


def test_khach_moi_go_ma_can_dang_hien_la_khach_mua():
    for cau in ("Chào em, căn #SEED0040 trần tầng trệt cao bao nhiêu mét vậy em?", "#seed0040 còn không em"):
        e = _engine()
        _gan_kho(e, True)
        e.handle("u-273", cau)
        assert e.conversation("u-273").role == "buyer", cau


def test_ma_khong_co_tren_he_thong_thi_khong_doi_vai():
    e = _engine()
    _gan_kho(e, False)
    e.handle("u-273b", "Chào em, căn #ZZZZ9999 trần cao bao nhiêu?")
    assert e.conversation("u-273b").role != "buyer"
