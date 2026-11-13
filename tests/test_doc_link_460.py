"""SRS-5.1zzzzzzz460 — đọc link trang web khách gửi: link hệ thống bỏ qua, mở hụt thì nói thật, mở được thì gắn bản tóm."""
from aioi import engine as eng_mod
from aioi.fetch import FetchError


class _Prov:
    def chat(self, system, msgs, max_tokens=None):
        return "LOẠI: tin_rao\n- Nhà phố hẻm 5m, Gò Vấp\n- Giá 6,2 tỷ, 60 m²"


def _eng():
    e = eng_mod.Engine.__new__(eng_mod.Engine)
    e._provider = _Prov()
    return e


class _Conv:
    user_key = "thu"

    class prop:
        fields = {}


def test_link_he_thong_bo_qua():
    assert _eng()._doc_link_web(_Conv(), "https://aond.vercel.app/nha-dat/56F988C9") == ""


def test_mo_hut_thi_noi_that(monkeypatch):
    def hong(*a, **k):
        raise FetchError("403")
    monkeypatch.setattr(eng_mod, "fetch_raw", hong)
    assert "chưa mở được trang" in _eng()._doc_link_web(_Conv(), "https://batdongsan.com.vn/ban-nha-rieng/x")


def test_mo_duoc_thi_gan_tom_tat(monkeypatch):
    html = ("<html><body>" + "Bán nhà hẻm 5m Gò Vấp giá 6,2 tỷ diện tích 60 m2. " * 10 + "</body></html>").encode()
    monkeypatch.setattr(eng_mod, "fetch_raw", lambda *a, **k: (html, "text/html"))
    kq = _eng()._doc_link_web(_Conv(), "https://example.vn/tin/1")
    assert "nội dung trang hệ thống đã đọc" in kq and "6,2 tỷ" in kq
