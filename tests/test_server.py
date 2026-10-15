from fastapi.testclient import TestClient
from aioi.server import app

client = TestClient(app)


def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "provider" in data


def test_native_message_endpoint():
    resp = client.post("/message", json={"user_key": "test_user_1", "text": "Tôi cần bán nhà 123 Lê Lợi Quận 1"})
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data
    assert "assistant_name" in data
    assert "captured" in data


def test_zalo_bridge_chat_reply_endpoint():
    payload = {
        "external_user_id": "zalo_123456",
        "text": "Bán gấp nhà 50m2 mặt tiền Trần Hưng Đạo giá 10 tỷ",
        "channel": "zalo_personal_test",
    }
    resp = client.post("/chat-reply", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    # Must provide the exact contract required by bridge-zca
    assert "reply" in data
    assert "replies" in data
    assert isinstance(data["replies"], list)
    assert len(data["replies"]) >= 1

    assert "nhip_go" in data
    assert isinstance(data["nhip_go"], list)
    assert len(data["nhip_go"]) == len(data["replies"])
    for delay in data["nhip_go"]:
        assert isinstance(delay, int)
        assert delay >= 0

    assert "assistant_name" in data
    assert "completeness" in data

    # Verify that thong_tin.json was exported
    from pathlib import Path
    json_files = list(Path("sharepoint_store").glob("**/thong_tin.json"))
    assert len(json_files) >= 1
    contents = [f.read_text(encoding="utf-8") for f in json_files]
    assert any("dien_tich" in c and "10 tỷ" in c for c in contents)


def test_zalo_bridge_chat_reply_with_image_urls(monkeypatch):
    from aioi import server
    from aioi.fetch import FetchError

    def fake_fetcher(url):
        raise FetchError("simulated offline")

    monkeypatch.setattr(server._engine, "_fetcher", fake_fetcher)

    payload = {
        "external_user_id": "zalo_test_burst",
        "text": "Gửi thêm 2 tấm ảnh nhà",
        "image_urls": ["https://example.com/photo1.jpg", "https://example.com/photo2.jpg"],
        "channel": "zalo_personal_test",
    }
    resp = client.post("/chat-reply", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data
    assert len(data["replies"]) >= 1
