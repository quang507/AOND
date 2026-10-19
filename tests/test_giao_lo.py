"""18/10/2026 (SRS-5.1zzzzzzz43): khách tả vị trí bằng ngã tư → phường tra từ bảng giao_lo, khỏi hỏi lại. Đỏ khi bỏ bước tra
trong engine hay khi ngã tư nhiều phường vẫn bị điền (đoán)."""
from aioi.giao_lo import dia_ban_tu_nga_tu


def _tra(dong):
    return lambda a, b: dong


def test_mot_phuong_thi_dien():
    dong = [{"phuong": "Phường Nhiêu Lộc", "quan_cu": "Quận 3"}, {"phuong": "Phường Nhiêu Lộc", "quan_cu": "Quận 3"}]
    assert dia_ban_tu_nga_tu("Lê Văn Sỹ | Trần Huy Liệu", tra=_tra(dong)) == {"phuong": "Phường Nhiêu Lộc", "quan": "Quận 3"}


def test_nhieu_phuong_hoac_khong_co_thi_khong_doan():
    hai = [{"phuong": "Phường Nhiêu Lộc", "quan_cu": "Quận 3"}, {"phuong": "Phường Tân Sơn Hòa", "quan_cu": "Quận Tân Bình"}]
    assert dia_ban_tu_nga_tu("Lê Văn Sỹ | Trần Huy Liệu", tra=_tra(hai)) is None
    assert dia_ban_tu_nga_tu("Lê Văn Sỹ | Nguyễn Trãi", tra=_tra([])) is None


def test_o_ai_sai_khuon_thi_khong_tra():
    goi = []
    tra = lambda a, b: goi.append((a, b)) or []
    for x in ("", None, "Lê Văn Sỹ", "A | B | C", " | Trần Huy Liệu"):
        assert dia_ban_tu_nga_tu(x, tra=tra) is None
    assert goi == []


def test_engine_dien_phuong_tu_nga_tu(monkeypatch):
    from aioi.engine import Engine
    from tests.test_engine import _engine  # cùng cách dựng engine với bộ test chính

    e = _engine()
    e._nga_tu = lambda v: {"phuong": "Phường Nhiêu Lộc", "quan": "Quận 3"} if v == "Lê Văn Sỹ | Trần Huy Liệu" else None
    # 19/10 (SRS-5.1zzzzzzz55): handle đọc kế hoạch một lần rồi áp ở bước 1 — giả bước áp.
    monkeypatch.setattr(Engine, "_ap_dung_ke_hoach", lambda self, conv, plan: (conv.prop.update(
        {"loai_hinh": "nha_pho", "dia_chi": "Lê Văn Sỹ", "duong": "Lê Văn Sỹ", "gan_nga_tu": "Lê Văn Sỹ | Trần Huy Liệu"}), []))
    r = e.handle("u-nga-tu", "nhà trên Lê Văn Sỹ gần ngã tư Trần Huy Liệu")
    p = e.conversation("u-nga-tu").prop
    assert p.fields.get("phuong") == "Phường Nhiêu Lộc" and p.fields.get("quan") == "Quận 3"
    assert "phuong" in r.captured
