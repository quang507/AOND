"""26/10/2026 (SRS-5.1zzzzzzz210, chủ dự án: "1 số điện thoại nhận đầu vào kí gửi 1 số điện thoại nhận đầu ra tư vấn người mua"; "số hiện tại
làm số ký gửi, nhắn nhầm vẫn trả lời, tin nội bộ và nhắc người bán vẫn đi từ số hiện tại"). Bridge thứ hai gửi `so_nhan = "tu_van"`: lượt mơ hồ
ở số đó vào vai mua và chào theo câu mẫu `chao_tu_van`; khách nói bán vẫn được trả lời ở vai bán; tin chủ động đi đúng số khách đang nhắn.
Đỏ khi bỏ nhánh `so_nhan` ở `Engine` / `_gui_bridge`."""
import json

from fastapi.testclient import TestClient

import aioi.server as srv
from aioi.engine import SO_TU_VAN, SqliteConversationStore
from tests.test_doc_y_khach import _eng


def _so(eng, uk, so):
    eng.conversation(uk).so_nhan = so
    return eng


def test_so_tu_van_loi_chao_vao_vai_mua_va_chao_theo_cau_mau_tu_van():
    eng, spy = _eng({"operations": []})
    _so(eng, "tv1", SO_TU_VAN).handle("tv1", "alo em")
    assert eng.conversation("tv1").role == "buyer"
    assert "số tư vấn người mua" in spy.systems[-1] and "tìm mua hay thuê" in spy.systems[-1]


def test_so_ky_gui_loi_chao_giu_nhu_cu():
    eng, spy = _eng({"operations": []})
    eng.handle("kg1", "alo em")
    assert eng.conversation("kg1").role != "buyer"
    assert "số tư vấn người mua" not in spy.systems[-1]


def test_nhan_nham_so_tu_van_ma_muon_ban_van_vao_vai_ban():
    eng, spy = _eng({"operations": [], "user_intent": "sell"})
    _so(eng, "tv2", SO_TU_VAN).handle("tv2", "chị cần bán căn nhà ở Quận 8")   # cách nói chưa bắn ở đâu khác
    assert eng.conversation("tv2").role == "seller"
    assert "số tư vấn người mua" not in spy.systems[-1]


def test_so_nhan_giu_qua_khoi_dong_lai(tmp_path):
    kho = SqliteConversationStore(str(tmp_path / "a.db"))
    eng, _ = _eng({"operations": []})
    c = eng.conversation("tv3")
    c.so_nhan = SO_TU_VAN
    kho.save(c)
    assert kho.load("tv3").so_nhan == SO_TU_VAN


def test_tin_chu_dong_di_dung_so_khach_dang_nhan(monkeypatch):
    den = []

    class _Tl:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"ok": true}'

    def mo(req, timeout=0):
        den.append((req.full_url, json.loads(req.data)["threadId"]))
        return _Tl()

    monkeypatch.setattr("urllib.request.urlopen", mo)
    srv._engine.conversation("8800001").so_nhan = SO_TU_VAN
    srv._engine.conversation("8800002").so_nhan = ""
    srv._gui_bridge("8800001", "có căn mới")
    srv._gui_bridge("8800002", "có căn mới")
    assert den == [("http://127.0.0.1:5006/send", "8800001"), ("http://127.0.0.1:5005/send", "8800002")]


def test_bridge_gui_so_nhan_thi_loi_ghi_vao_phien(monkeypatch):
    from tests.test_chuyen_nguoi import _Kho, _tr
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **k: None)
    monkeypatch.setattr(srv._engine, "_convstore", _Kho())
    monkeypatch.setattr(srv._engine, "handle", lambda uk, text: _tr(reply="Chào anh ạ."))
    TestClient(srv.app).post(
        "/chat-reply", json={"external_user_id": "8800003", "text": "alo", "so_nhan": "tu_van"})
    assert srv._engine.conversation("8800003").so_nhan == SO_TU_VAN
    TestClient(srv.app).post("/chat-reply", json={"external_user_id": "8800003", "text": "alo"})
    assert srv._engine.conversation("8800003").so_nhan == SO_TU_VAN   # bridge bản cũ không gửi so_nhan → giữ nguyên
