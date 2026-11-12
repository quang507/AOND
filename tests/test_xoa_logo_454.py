"""SRS-5.1zzzzzzz454 — xoá logo / watermark in đè, đóng dấu AOND, gốc giữ ở bucket riêng."""
import io

from PIL import Image, ImageDraw

from aioi import xoa_logo as x


def _anh(w=800, h=600, dinh_dang="JPEG") -> bytes:
    im = Image.new("RGB", (w, h), (90, 140, 200))
    ImageDraw.Draw(im).text((300, 280), "0909 123 456", fill=(255, 255, 255))
    b = io.BytesIO()
    im.save(b, dinh_dang)
    return b.getvalue()


class _Model:
    def __init__(self, kq=None, loi=False):
        self.kq, self.loi = kq, loi

    def extract_media(self, items, instruction, schema):
        if self.loi:
            raise RuntimeError("hỏng")
        return self.kq


class _Engine:
    def __init__(self, model):
        self._provider = model


def test_chuan_vung_bo_khung_hong_va_khung_phu_ca_anh():
    v = x.chuan_vung([{"x0": 0.4, "y0": 0.5, "x1": 0.6, "y1": 0.45, "loai": "so_dien_thoai"},
                      {"x0": "hong"}, {"x0": 0, "y0": 0, "x1": 1, "y1": 1, "loai": "watermark"}, "rác"])
    assert v == [(0.4, 0.45, 0.6, 0.5)]


def test_model_hong_coi_nhu_khong_vung():
    assert x.tim_vung(_Engine(_Model(loi=True)), _anh(), "image/jpeg") == (False, [])
    assert x.tim_vung(_Engine(_Model(kq="không phải JSON")), _anh(), "image/jpeg") == (False, [])


def test_giay_to_nhan_ra():
    giay, _ = x.tim_vung(_Engine(_Model(kq={"la_giay_to": True, "vung": []})), _anh(), "image/jpeg")
    assert giay is True


def test_xu_ly_giu_dinh_dang_va_kich_thuoc_co_dau():
    goc = _anh()
    moi = x.xu_ly(goc, [(0.35, 0.45, 0.65, 0.52)], "u/1.jpg")
    im = Image.open(io.BytesIO(moi))
    assert im.format == "JPEG" and im.size == (800, 600)
    # góc dưới phải đã có logo (khác nền xanh đồng màu)
    assert im.convert("RGB").crop((650, 500, 790, 590)).getcolors(100000).__len__() > 5
    png = Image.open(io.BytesIO(x.xu_ly(_anh(dinh_dang="PNG"), [], "u/2.png")))
    assert png.format == "PNG"


def test_anh_hong_tra_none():
    assert x.xu_ly(b"khong phai anh", [], "u/1.jpg") is None


def test_thieu_logo_van_tra_anh():
    im = Image.new("RGB", (100, 80))
    assert x.dong_dau(im, "khong-co.png").size == (100, 80)


def test_tai_nguyen_logo_co_trong_goi():
    with Image.open(x.LOGO) as lg:
        assert lg.mode == "RGBA"
