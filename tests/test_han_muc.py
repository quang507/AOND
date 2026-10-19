"""SRS-5.1zzzzzzz53: lõi Python phải chặn trần lượt mỗi người + cả ngày trước khi gọi model (bản TS cũ có, lõi mới mất)."""
from fastapi.testclient import TestClient

import aioi.server as srv
from aioi.han_muc import TRAN_NGAY_MAC_DINH, HanMuc


def _rpc(nguoi=True, ngay=True, goi=None):
    def rpc(ten, body):
        if goi is not None:
            goi.append((ten, body))
        if ten == "bump_user_quota":
            return nguoi
        if ten == "bump_model_quota":
            return ngay
        raise AssertionError(ten)
    return rpc


def test_trong_tran_thi_cho_qua_va_cong_ca_hai_so():
    goi = []
    assert HanMuc(_rpc(goi=goi), tran_ngay=500).cho_phep("u1")
    assert goi == [("bump_user_quota", {"p_uid": "u1"}), ("bump_model_quota", {"p_limit": 500})]


def test_vuot_tran_nguoi_thi_im_va_khong_cong_so_ngay():
    goi = []
    assert not HanMuc(_rpc(nguoi=False, goi=goi)).cho_phep("u1")
    assert [t for t, _ in goi] == ["bump_user_quota"]


def test_cham_tran_ngay_thi_im():
    assert not HanMuc(_rpc(ngay=False)).cho_phep("u1")


def test_db_hong_thi_cho_qua_khong_cam_bot():
    def hong(ten, body):
        raise OSError("mạng đứt")
    assert HanMuc(hong).cho_phep("u1")


def test_khong_co_supabase_thi_khong_chan():
    h = HanMuc.tu_cau_hinh(None, None)
    assert h.cho_phep("u1") and h.tran_ngay == TRAN_NGAY_MAC_DINH


def test_chat_reply_vuot_tran_khong_goi_engine(monkeypatch):
    monkeypatch.setattr(srv, "_han_muc", HanMuc(_rpc(nguoi=False)))
    goi_engine = []
    monkeypatch.setattr(srv._engine, "handle", lambda *a, **k: goi_engine.append(a))
    r = TestClient(srv.app).post("/chat-reply", json={"external_user_id": "z9", "text": "bán nhà Q5 giá 8 tỷ"})
    assert r.status_code == 200 and r.json()["replies"] == [] and r.json()["reply"] == ""
    assert goi_engine == []                                     # không lượt model nào
    r2 = TestClient(srv.app).post("/message", json={"user_key": "z9", "text": "bán nhà"})
    assert r2.json()["reply"] == "" and goi_engine == []
