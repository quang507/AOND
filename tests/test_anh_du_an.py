"""18/10/2026 (SRS-5.1zzzzzzz36): khách hỏi mua nhắc tên dự án → bridge nhận `photos` (≤ 5 ảnh) để gửi kèm.
Đỏ khi bỏ `anh_gui_kem` khỏi /chat-reply, khi gửi cho người bán, khi gửi lại cùng bộ ảnh trong 24 giờ, hay khi lỗi DB làm
hỏng lượt trả lời."""
from fastapi.testclient import TestClient

from aioi import anh_du_an, server
from aioi.anh_du_an import BoNhoAnhDaGui, anh_gui_kem, tim_anh_du_an

ANH = [f"https://cloud.mogi.vn/project/a/{i}.jpg" for i in range(7)]


def test_khop_ten_co_anh_lay_toi_da_5_bo_trung_bo_link_la():
    goi = lambda cau: [{"name": "Bcons Miền Đông", "images": [ANH[0], ANH[0], "http://x/khong-https.jpg", 3, *ANH[1:]]}]
    kq = tim_anh_du_an("cho xem bcons mien dong", goi=goi)
    assert kq is not None and kq.ten == "Bcons Miền Đông"
    assert kq.anh == ANH[:5]


def test_hai_du_an_khop_chi_gui_du_an_tron_ten_trong_cau():
    hai = [{"name": "The Beverly - Vinhomes Grand Park", "images": [ANH[1]]},
           {"name": "The Origami - Vinhomes Grand Park", "images": [ANH[2]]}]
    assert tim_anh_du_an("dự án vinhomes grand park còn căn không", goi=lambda cau: hai) is None
    assert tim_anh_du_an("cho xem The Origami - Vinhomes Grand Park", goi=lambda cau: hai).anh == [ANH[2]]
    # Dòng trọn tên không có ảnh thì không lấy ảnh của dòng kia.
    mot_khong_anh = [{"name": "Sunrise City", "images": []}, {"name": "Sunrise City View", "images": [ANH[3]]}]
    assert tim_anh_du_an("căn hộ sunrise city", goi=lambda cau: mot_khong_anh) is None


def test_khong_khop_hoac_loi_db_thi_khong_gui():
    assert tim_anh_du_an("chào em", goi=lambda cau: []) is None
    def hong(cau):
        raise OSError("mạng đứt")
    assert tim_anh_du_an("dự án Bcons", goi=hong) is None
    assert tim_anh_du_an("", goi=lambda cau: [{"name": "A", "images": ANH}]) is None


def test_nguoi_ban_khong_nhan_anh_va_khong_gui_lai_trong_24h():
    tim = lambda cau: anh_du_an.AnhDuAn(ten="Bcons Miền Đông", anh=ANH[:5])
    bo_nho = BoNhoAnhDaGui()
    assert anh_gui_kem("u1", "seller", "căn hộ bcons của tôi", tim=tim, bo_nho=bo_nho) == []
    assert anh_gui_kem("u1", "buyer", "bcons mien dong", tim=tim, bo_nho=bo_nho) == ANH[:5]
    assert anh_gui_kem("u1", "buyer", "bcons mien dong giá sao", tim=tim, bo_nho=bo_nho) == []
    assert anh_gui_kem("u2", "unknown", "bcons mien dong", tim=tim, bo_nho=bo_nho) == ANH[:5]
    assert bo_nho.nen_gui("u1", "Bcons Miền Đông", bay_gio=10**12) is True


def test_chat_reply_tra_photos(monkeypatch):
    client = TestClient(server.app)
    monkeypatch.setattr(server, "anh_gui_kem", lambda khach, vai, cau: ANH[:3])
    data = client.post("/chat-reply", json={"external_user_id": "zalo_anh_1", "text": "cho xem dự án Bcons"}).json()
    assert data["photos"] == ANH[:3]
    monkeypatch.setattr(server, "anh_gui_kem", lambda khach, vai, cau: [])
    data = client.post("/chat-reply", json={"external_user_id": "zalo_anh_2", "text": "chào em"}).json()
    assert data["photos"] == []
