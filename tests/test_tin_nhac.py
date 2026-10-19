"""19/10/2026 (SRS-5.1zzzzzzz73): tin nhắc khi khách im hỏi lại ĐÚNG câu bot vừa hỏi. Ca gốc (chat thử chủ dự án): bot hỏi
"tổng diện tích sàn của cả 4 tầng là bao nhiêu m²", 5 phút sau tin nhắc lại xin "vài tấm ảnh thực tế hoặc sổ hồng" — chủ nhà vừa
gửi 6 ảnh. Câu mẫu cố định theo ô thiếu; ô diện tích sàn không có câu mẫu nên rơi vào câu xin ảnh. Đỏ khi dùng lại bảng câu mẫu."""
from aioi.engine import Conversation, Listing, Turn
from aioi.assistants import assign_assistant
from aioi.followup import cau_hoi_cuoi_cua_bot, cau_nhac


def _conv(*turns, media=None):
    li = Listing(media=media or [])
    c = Conversation(user_key="k", assistant=assign_assistant("k"), listings=[li], active_listing_id=li.listing_id)
    c.history = [Turn(r, t, 0) for r, t in turns]
    return c


def test_nhac_lai_cau_hoi_dang_cho():
    c = _conv(("user", "[Khách gửi 6 tệp]"), ("assistant", "Em đã nhận 6 ảnh rồi. Anh ơi, tổng diện tích sàn sử dụng của cả 4 tầng là bao nhiêu m² ạ? 😊"),
              media=[{"filename": f"{i}.jpg"} for i in range(6)])
    m = cau_nhac(c, c.active, "unknown")
    assert "diện tích sàn" in m and "ảnh" not in m.replace("6 ảnh", "")


def test_khach_da_tra_loi_thi_khong_con_cau_cho():
    c = _conv(("assistant", "Nhà mình mấy tầng vậy ạ?"), ("user", "1 trệt 3 lầu"))
    assert cau_hoi_cuoi_cua_bot(c) == ""


def test_khong_cau_cho_co_anh_roi_thi_khong_nhac_chua_co_anh_thi_xin_anh():
    co_anh = _conv(("assistant", "Em ghi nhận rồi nha."), media=[{"filename": "a.jpg"}])
    assert cau_nhac(co_anh, co_anh.active, "chi") == ""
    chua = _conv(("assistant", "Em ghi nhận rồi nha."))
    assert "ảnh" in cau_nhac(chua, chua.active, "chi") and cau_nhac(chua, chua.active, "chi").startswith("Khi nào tiện chị")


def test_xung_ho_theo_khach():
    c = _conv(("assistant", "Nhà em ở đường nào vậy?"))
    assert cau_nhac(c, c.active, "em").startswith("Em ơi, mình hỏi lại")
    assert cau_nhac(c, c.active, "unknown").startswith("Anh/chị ơi, em hỏi lại")
