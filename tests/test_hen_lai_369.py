"""SRS-5.1zzzzzzz369 — khách hẹn nói sau ("tối a gửi", "đang chạy xe tí nhắn") thì KHÔNG gửi tin nhắc 5 phút.

Lớp lỗi: việc bot làm theo ý khách chỉ có khi code dò chữ; không có ô AI cho ý "hẹn lúc khác" nên bộ nhắc cứ chạy. Nay lượt AI đọc
điền `hen_lai` (cụm trích, code kiểm nằm trong lời khách) → server bỏ lịch nhắc. Đỏ khi engine bỏ đọc ô hay server bỏ điều kiện."""
from fastapi.testclient import TestClient

import aioi.server as srv
from tests.test_chuyen_nguoi import _Kho, _tr
from tests.test_doc_y_khach import _eng


def test_ai_doc_hen_lai_co_trich_thi_bat_co():
    # cách nói mới: không có chữ "bận" / "lát" / "sau"
    eng, _ = _eng({"operations": [], "hen_lai": "đang đón con tối về a gửi"})
    r = eng.handle("h1", "đang đón con tối về a gửi đủ nha")
    assert r.hen_lai is True


def test_trich_khong_nam_trong_loi_khach_thi_khong_bat():
    eng, _ = _eng({"operations": [], "hen_lai": "để mai nói tiếp"})
    assert eng.handle("h2", "nhà 4x15 giá 5 tỷ nha").hen_lai is False
    eng2, _ = _eng({"operations": []})
    assert eng2.handle("h3", "đang chạy xe tí nhắn").hen_lai is False   # AI không điền → code không tự dò chữ


def _goi(monkeypatch, **k):
    hen = []
    monkeypatch.setattr(srv._engine, "_convstore", _Kho())
    monkeypatch.setattr(srv._engine, "handle", lambda *a, **kw: _tr(**k))
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **kw: None)
    monkeypatch.setattr(srv.followup_manager, "schedule_followup", lambda **kw: hen.append(kw["user_key"]))
    assert TestClient(srv.app).post("/chat-reply", json={"external_user_id": "h4", "text": "tối a gửi"}).status_code == 200
    return hen


def test_server_khong_hen_nhac_khi_khach_hen_lai(monkeypatch):
    assert _goi(monkeypatch, role="seller", hen_lai=True) == []
    assert _goi(monkeypatch, role="seller", hen_lai=False) == ["h4"]


# --- Lưới bản tin bắt oan (SRS-5.1zzzzzzz369) -------------------------------------------------------------------------------------
from aioi.engine import Conversation, Engine, Turn, _khang_dinh_khong_co_du_lieu, _soat_khang_dinh   # noqa: E402
from aioi.prompts import SOAT_KHANG_DINH_SYSTEM   # noqa: E402


def _c(*loi: str) -> Conversation:
    c = Engine(None).conversation("k-369")
    for x in loi:
        c.history.append(Turn("user", x, 0.0))
    return c


class _AiDoc:
    def __init__(self, khang_dinh: bool):
        self.kd, self.goi = khang_dinh, 0

    def extract(self, system, messages, schema):
        assert system == SOAT_KHANG_DINH_SYSTEM
        self.goi += 1
        cum = [d[2:] for d in messages[0].content.split("CỤM:\n", 1)[1].splitlines()]
        return {"cum": [{"cum": x, "khang_dinh": self.kd} for x in cum]}


def test_cum_ta_khu_chu_nha_tu_noi_thi_khong_bat():
    tin = "📋 Em sẽ rao như vầy nhé:\n\nNhà Lê Văn Sỹ, khu đông dân cư, giá 4 tỷ\n\n- 4 tỷ"
    assert _khang_dinh_khong_co_du_lieu(tin, _c("chỗ nhà a đông dân cư lắm, giá 4 tỷ")) == []
    assert _khang_dinh_khong_co_du_lieu(tin, _c("nhà Lê Văn Sỹ giá 4 tỷ")) == ["đông dân cư"]


def test_so_dang_lam_ban_tin_chep_dung_thi_ai_bo_cum():
    tin = "📋 Em sẽ rao như vầy nhé:\n\nNhà phố Gò Vấp 4x12m, sổ hồng đang chờ ra trong tháng 12, giá 5 tỷ\n\n- 5 tỷ"
    c = _c("sổ đang làm tháng 12 có")
    c.prop.fields["_phap_ly_trang_thai"] = "dang_lam"
    eng = type("E", (), {"_provider": _AiDoc(False)})()
    assert _soat_khang_dinh(eng, c, tin, None) == [] and eng._provider.goi == 1
    eng2 = type("E", (), {"_provider": _AiDoc(True)})()
    assert _soat_khang_dinh(eng2, c, tin, None)                               # AI đọc là khẳng định đã có sổ → vẫn bắt
    c.prop.fields.pop("_phap_ly_trang_thai")                                 # chủ chưa nói giấy tờ → không hỏi AI, bắt luôn
    eng3 = type("E", (), {"_provider": _AiDoc(False)})()
    assert _soat_khang_dinh(eng3, c, tin, None) and eng3._provider.goi == 0
