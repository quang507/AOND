"""SRS-5.1zzzzzzz51: người rao nhiều căn không được mất căn — làm theo bản anh Luận, không đoán ý bằng từ khoá.

Lớp lỗi: code đọc lại lời khách bằng regex để "sửa" quyết định "add" của lượt AI ("ok" = duyệt tin, chỉ "căn nữa" mới là căn
mới), và dọn "căn trống" bỏ luôn căn khách đang khai.
"""
from aioi.config import Settings
from aioi.engine import Conversation, Engine, Listing, Turn
from aioi.assistants import assign_assistant
from aioi.llm.mock import MockProvider


def _engine() -> Engine:
    return Engine(MockProvider(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")))


def _conv_co_can_q5() -> Conversation:
    conv = Conversation(user_key="nc", assistant=assign_assistant("nc"))
    conv.active.prop.update({"loai_hinh": "nha_pho", "dia_chi": "12 Trần Hưng Đạo, Quận 5", "gia": "8 tỷ"})
    conv.history.append(Turn("user", "nhà 12 Trần Hưng Đạo quận 5 giá 8 tỷ", 0.0))
    return conv


def _add(eng: Engine, conv: Conversation, loi: str, fields: dict, trich: str | None = None) -> None:
    conv.history.append(Turn("user", loi, 1.0))
    eng._apply_operation(conv, {"op": "add", "fields": fields, "can_khac_trich": trich}, set(), [])


def test_add_mo_can_moi_du_loi_khach_co_chu_ok():
    # Bản 16/10: "ok" khớp regex duyệt tin, "nhà … nữa" không khớp "căn nữa" → nhà Q3 ĐÈ lên căn Q5.
    eng, conv = _engine(), _conv_co_can_q5()
    _add(eng, conv, "ok, còn nhà ở Lê Văn Sỹ quận 3 nữa", {"dia_chi": "Lê Văn Sỹ, Quận 3"}, "còn nhà ở Lê Văn Sỹ quận 3 nữa")
    assert len(conv.listings) == 2
    assert conv.listings[0].prop.fields["dia_chi"] == "12 Trần Hưng Đạo, Quận 5"   # căn cũ nguyên vẹn
    assert conv.active is conv.listings[1]


def test_add_cach_noi_moi_chua_tung_ban():
    # Cách nói mới, không có chữ "căn": "chuẩn rồi, à anh có thêm miếng đất Củ Chi" — regex cũ coi là duyệt tin.
    eng, conv = _engine(), _conv_co_can_q5()
    _add(eng, conv, "chuẩn rồi, à anh có thêm miếng đất Củ Chi", {"loai_hinh": "dat", "dia_chi": "Củ Chi"}, "anh có thêm miếng đất Củ Chi")
    assert len(conv.listings) == 2
    assert conv.listings[0].prop.fields["dia_chi"] == "12 Trần Hưng Đạo, Quận 5"


def test_khong_bo_can_dang_khai_chua_co_dia_chi_va_gia():
    # Bản 16/10 bỏ mọi căn chưa có mã căn / địa chỉ / giá — kể cả căn khách VỪA mở và đang khai loại hình + diện tích.
    eng, conv = _engine(), _conv_co_can_q5()
    moi = conv.new_listing()
    moi.prop.update({"loai_hinh": "dat", "dien_tich": "100m2"})
    eng._drop_stub_listings(conv)
    assert len(conv.listings) == 2 and conv.active is moi


def test_van_don_can_trong_khoi_dau_khi_da_co_can_that():
    eng = _engine()
    conv = Conversation(user_key="nc2", assistant=assign_assistant("nc2"))
    trong = conv.active                                   # căn khởi đầu rỗng, không phải căn đang khai
    that = Listing()
    that.prop.update({"dia_chi": "12 Trần Hưng Đạo, Quận 5", "gia": "8 tỷ"})
    conv.listings.append(that)
    conv.active_listing_id = that.listing_id
    eng._drop_stub_listings(conv)
    assert conv.listings == [that] and trong not in conv.listings
