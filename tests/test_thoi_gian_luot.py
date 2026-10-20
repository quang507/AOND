"""20/10/2026 (SRS-5.1zzzzzzz86). Bắn thử: trung bình 14–17 s / lượt, không biết chậm ở khâu nào. `/chat-reply` trả kèm ms từng khâu
(lập thao tác, trả lời, ghi kho, còn lại, tổng) — chỉ con số, không dữ liệu khách — để đo trước rồi mới sửa."""
from fastapi.testclient import TestClient

from aioi import server


def test_chat_reply_tra_thoi_gian_tung_khau():
    data = TestClient(server.app).post("/chat-reply", json={"external_user_id": "zalo_tg_1", "text": "bán nhà quận 5 giá 5 tỷ"}).json()
    tg = data["thoi_gian_ms"]
    assert {"lap_thao_tac", "tra_loi", "tong", "con_lai"} <= set(tg)
    assert all(isinstance(v, int) and v >= 0 for v in tg.values())
    assert tg["tong"] >= tg["lap_thao_tac"] + tg["tra_loi"]
