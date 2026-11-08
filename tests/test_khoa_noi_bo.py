"""SRS-5.1zzzzzzz400 (audit N3 + C5, 08/11/2026): chặng bridge ↔ lõi cần khoá chung `x-noi-bo-key`.

Lõi chỉ nghe 127.0.0.1 nhưng máy 146 dùng chung — tiến trình khác gọi được /chat-reply (đọc rổ hàng, giả lệnh admin), /reset/{id} (xoá khách
trên Supabase thật). Bài này đỏ khi một đường của lõi chạy được mà không có khoá, hoặc lõi gửi bridge /send không kèm khoá.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from aioi import khoa_noi_bo
from aioi import server

GOC = Path(__file__).resolve().parents[1]


@pytest.fixture
def khong_khoa():
    c = TestClient(server.app)
    del c.headers["x-noi-bo-key"]
    return c


@pytest.mark.parametrize("duong", ["/chat-reply", "/message", "/reset/thu-khoa-noi-bo", "/reset-all", "/trigger-followup/thu-khoa-noi-bo"])
def test_moi_duong_ghi_doc_deu_doi_khoa(khong_khoa, duong):
    r = khong_khoa.post(duong, json={"external_user_id": "thu-khoa-noi-bo", "user_key": "thu-khoa-noi-bo", "text": "/state"})
    assert r.status_code == 401, (duong, r.status_code, r.text)


def test_sai_khoa_bi_chan(khong_khoa):
    r = khong_khoa.post("/reset-all", headers={"x-noi-bo-key": "doan-bua"})
    assert r.status_code == 401


def test_health_khong_can_khoa(khong_khoa):
    assert khong_khoa.get("/health").status_code == 200


def test_docs_openapi_da_tat(khong_khoa):
    for duong in ("/docs", "/redoc", "/openapi.json"):
        assert khong_khoa.get(duong, headers={"x-noi-bo-key": khoa_noi_bo.khoa()}).status_code == 404, duong


def test_thieu_khoa_tren_may_thi_tu_choi_chu_khong_mo(khong_khoa, monkeypatch):
    monkeypatch.delenv("AIOI_NOI_BO_KEY")
    r = khong_khoa.post("/reset-all", headers={"x-noi-bo-key": ""})
    assert r.status_code == 503
    assert khoa_noi_bo.dau_gui() == {}


def test_dung_khoa_thi_qua():
    r = TestClient(server.app).post("/reset/thu-khoa-noi-bo")
    assert r.status_code == 200


def test_loi_gui_bridge_kem_khoa(monkeypatch):
    bat = {}

    class _Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"ok": true}'

    def _urlopen(req, timeout=None):
        bat["headers"] = {k.lower(): v for k, v in req.header_items()}
        bat["body"] = json.loads(req.data)
        return _Resp()

    monkeypatch.setattr("urllib.request.urlopen", _urlopen)
    server._gui_bridge("1234567890", "chào")
    assert bat["headers"].get("x-noi-bo-key") == khoa_noi_bo.khoa()


def test_bridge_send_doi_khoa_va_gioi_han_body():
    """Bridge là Node — kiểm mã nguồn: /send so khoá hằng thời gian, chỉ nhận JSON, trần body; khoá không gửi lên escalation-feed (Supabase)."""
    s = (GOC / "bot/bridge-zca/index.mjs").read_text(encoding="utf-8")
    assert "AIOI_NOI_BO_KEY" in s
    assert "timingSafeEqual" in s
    assert "application/json" in s and "413" in s and "415" in s
    # C5: x-bridge-secret không còn đi tới lõi; khoá nội bộ không đi tới escalation-feed.
    assert "const feedHeaders = brainHeaders" not in s
