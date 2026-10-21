"""21/10/2026 (SRS-5.1zzzzzzz118). Lê Quang gửi ảnh chat: ba lượt liền bot đều mở "Em đã ghi nhận…", "Em ghi nhận…", "Em ghi nhận…" —
"sao nó ghi nhận lắm thế". Luật giọng bắt ghi nhận mỗi lượt khách cho tin (SRS-5.1zzzzzzz102) mà không cấm lặp; model yếu (Gemini dự
phòng) theo đúng chữ. Đỏ khi hai lượt liền nhau cùng mở bằng câu ghi nhận mà không gọi lại model."""
from aioi.engine import Engine, _mo_dau_ghi_nhan
from tests.test_phuong_theo_hem import _Model


def test_nhan_dien_mo_dau_ghi_nhan():
    assert _mo_dau_ghi_nhan("Em đã ghi nhận đầy đủ thông tin nhà mình rồi anh.")
    assert _mo_dau_ghi_nhan("Em ghi rồi chị.") and _mo_dau_ghi_nhan("  em ghi nhận sổ hồng riêng của anh nhé")
    assert not _mo_dau_ghi_nhan("Cho em hỏi thêm nhà mình mấy lầu?")
    assert not _mo_dau_ghi_nhan("Em sửa giá còn 24 tỷ cho chị rồi.")          # sửa theo lời khách: nói con số mới là đúng luật


def _lam(monkeypatch, loi):
    monkeypatch.setattr(Engine, "_ap_dung_ke_hoach", lambda self, conv, plan: (conv.prop.update({"loai_hinh": "nha_pho"}), []))
    m = _Model(loi)
    return Engine(m), m


def test_hai_luot_lien_ghi_nhan_thi_goi_lai(monkeypatch):
    e, m = _lam(monkeypatch, ["Em ghi nhận rồi anh. Nhà mình ở đường nào vậy anh?",
                              "Em ghi nhận Phường An Phú Đông rồi anh nha. Nhà có sổ hồng riêng chưa anh?",
                              "Vậy nhà mình đã có sổ hồng riêng chưa anh?"])
    e.handle("gn1", "anh bán nhà phố")
    r = e.handle("gn1", "đúng rồi")
    assert "VIẾT LẠI LƯỢT NÀY" in m.systems[-1] and "câu ghi nhận" in m.systems[-1]
    assert not _mo_dau_ghi_nhan(r.reply)


def test_mot_luot_ghi_nhan_thi_khong_goi_lai(monkeypatch):
    e, m = _lam(monkeypatch, ["Nhà mình ở đường nào vậy anh?", "Em ghi nhận rồi anh. Nhà có sổ hồng riêng chưa anh?"])
    e.handle("gn2", "anh bán nhà phố")
    e.handle("gn2", "đường số 59")
    assert len(m.systems) == 2
