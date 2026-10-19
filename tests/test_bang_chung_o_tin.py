"""19/10/2026 (SRS-5.1zzzzzzz73): ô tin chỉ ghi điều KHÁCH nói. Ca gốc (chat thử chủ dự án): bot hỏi "có muốn để giá thương lượng
nhẹ không", chủ nhà trả lời chuyện hoàn công, ô `thuong_luong` vẫn thành "thương lượng nhẹ" và lên tin; 6 ảnh chụp nhà → lời AI tả
ảnh "nhà mới xây" thành ô `tinh_trang_ban_giao`. Đỏ khi bỏ cổng bằng chứng (`_co_bang_chung`) hoặc dấu lời-tả-ảnh."""
from aioi.config import Settings
from aioi.engine import DAU_TA_ANH_CHUP, Engine
from aioi.fetch import FetchedMedia
from aioi.llm.mock import MockProvider

S = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")


class AiGia(MockProvider):
    """Lượt lập thao tác trả đúng kế hoạch đặt sẵn; còn lại như đồ giả."""

    def __init__(self, ke_hoach):
        super().__init__(S)
        self.ke_hoach = ke_hoach

    def extract(self, system, messages, json_schema):
        if "operations" in (json_schema.get("properties") or {}):
            return dict(self.ke_hoach)
        return super().extract(system, messages, json_schema)


def test_o_khong_co_bang_chung_trong_loi_khach_thi_bo():
    eng = Engine(AiGia({"operations": [{"op": "update", "fields": {"gia": "8,5 tỷ", "thuong_luong": "thương lượng nhẹ"},
                                        "bang_chung": {"gia": "giá 8,5 tỷ"}}], "user_intent": "sell"}))
    eng.handle("chu-1", "giá 8,5 tỷ")
    f = eng.conversation("chu-1").active.prop.fields
    assert f.get("gia") == "8,5 tỷ"
    assert "thuong_luong" not in f


def test_bang_chung_chi_co_trong_cau_bot_hoi_thi_bo():
    eng = Engine(AiGia({"operations": [], "user_intent": "sell"}))
    conv = eng.conversation("chu-2")
    from aioi.engine import Turn
    conv.history.append(Turn("assistant", "Anh có muốn để giá thương lượng nhẹ không, và nhà đã hoàn công chưa ạ?", 0))
    eng._provider.ke_hoach = {"operations": [{"op": "update",
                                              "fields": {"thuong_luong": "thương lượng nhẹ", "phap_ly_hoan_cong": "đã hoàn công đủ"},
                                              "bang_chung": {"thuong_luong": "thương lượng nhẹ", "phap_ly_hoan_cong": "đã hoàn công đủ"}}],
                              "user_intent": "sell"}
    eng.handle("chu-2", "đã hoàn công đủ")
    f = eng.conversation("chu-2").active.prop.fields
    assert f.get("phap_ly_hoan_cong") == "đã hoàn công đủ"
    assert "thuong_luong" not in f                       # cụm chỉ có trong câu bot hỏi


def test_gia_tri_da_co_san_thi_giu_khong_can_bang_chung_lai():
    eng = Engine(AiGia({"operations": [{"op": "update", "fields": {"gia": "8,5 tỷ"}, "bang_chung": {"gia": "giá 8,5 tỷ"}}],
                        "user_intent": "sell"}))
    eng.handle("chu-3", "giá 8,5 tỷ")
    eng._provider.ke_hoach = {"operations": [{"op": "update", "fields": {"gia": "8,5 tỷ", "so_tang": "4"},
                                              "bang_chung": {"so_tang": "1 trệt 3 lầu"}}], "user_intent": "sell"}
    eng.handle("chu-3", "nhà 1 trệt 3 lầu")
    f = eng.conversation("chu-3").active.prop.fields
    assert f.get("gia") == "8,5 tỷ" and f.get("so_tang") == "4"


class AiAnh(AiGia):
    """Một nhóm ảnh chụp thật (giay_to=False); AI tả ảnh "nhà mới xây"; lượt lập thao tác trích đúng cụm đó làm bằng chứng."""

    def group_media(self, items, labels, instruction, json_schema):
        return {"nhom": [{"pham_vi": "can_moi", "tep": labels, "mo_ta": "ảnh nhà", "giay_to": False}]}

    def describe_media(self, items, instruction, max_tokens=1024):
        return "Ảnh thực tế nhà mới xây, nội thất sáng sủa."


def test_loi_ta_anh_chup_khong_thanh_o_tin():
    eng = Engine(AiAnh({"operations": [{"op": "update", "fields": {"tinh_trang_ban_giao": "nhà mới xây"},
                                        "bang_chung": {"tinh_trang_ban_giao": "nhà mới xây"}}], "user_intent": "sell"}),
                 fetcher=lambda u: FetchedMedia(u.encode(), "image/jpeg", u, filename="anh.jpg"))
    eng.handle_media_batch("chu-4", ["https://x/1.jpg", "https://x/2.jpg"])
    conv = eng.conversation("chu-4")
    assert "tinh_trang_ban_giao" not in conv.active.prop.fields
    assert any(t.content.startswith(DAU_TA_ANH_CHUP) for t in conv.history)   # lời tả ảnh vẫn ở lịch sử cho bot đọc


def test_o_co_so_nhan_cum_trich_viet_lai_don_vi():
    # Model hay đổi đơn vị trong cụm trích ("170m²" khi khách gõ "170m vuông") — số khớp thì nhận; số không có thì bỏ.
    eng = Engine(AiGia({"operations": [{"op": "update", "fields": {"dien_tich_nha": "170m2", "gia": "9 tỷ"},
                                        "bang_chung": {"dien_tich_nha": "170m²", "gia": "9 tỷ"}}], "user_intent": "sell"}))
    eng.handle("chu-5", "diện tích sàn tầm 170m vuông")
    f = eng.conversation("chu-5").active.prop.fields
    assert f.get("dien_tich_nha") == "170m2"
    assert "gia" not in f                                # "9" không có trong lời khách


def test_loai_hinh_da_co_thi_gui_lai_khong_can_bang_chung():
    eng = Engine(AiGia({"operations": [{"op": "update", "fields": {"loai_hinh": "nha_pho"}, "bang_chung": {"loai_hinh": "nhà phố"}}],
                        "user_intent": "sell"}))
    eng.handle("chu-6", "Mình cần bán nhà phố")
    eng._provider.ke_hoach = {"operations": [{"op": "update", "fields": {"loai_hinh": "nha_pho"}}], "user_intent": "sell"}
    eng.handle("chu-6", "Nhà mặt tiền")
    assert eng.conversation("chu-6").active.prop.loai_hinh == "nha_pho"


def test_thieu_cum_trich_thi_kiem_chinh_gia_tri_trong_loi_khach():
    # Bắn thử 19/10: model không trích cho ô diện tích sàn → ô bị bỏ. Giá trị nằm trong lời khách thì nhận; giá trị chỉ có trong
    # câu bot hỏi thì vẫn bỏ.
    eng = Engine(AiGia({"operations": [], "user_intent": "sell"}))
    from aioi.engine import Turn
    eng.conversation("chu-7").history.append(Turn("assistant", "Anh/chị có muốn bán thương lượng nhẹ không ạ?", 0))
    eng._provider.ke_hoach = {"operations": [{"op": "update", "fields": {"dien_tich_nha": "170m2", "phap_ly_hoan_cong": "đã hoàn công đủ",
                                                                          "thuong_luong": "thương lượng nhẹ"}}], "user_intent": "sell"}
    eng.handle("chu-7", "đã hoàn công đủ, diện tích sàn tầm 170m vuông")
    f = eng.conversation("chu-7").active.prop.fields
    assert f.get("dien_tich_nha") == "170m2" and f.get("phap_ly_hoan_cong") == "đã hoàn công đủ"
    assert "thuong_luong" not in f


def test_dien_tich_tinh_tu_kich_thuoc_khach_go():
    eng = Engine(AiGia({"operations": [{"op": "update", "fields": {"dien_tich_dat": "49,5m2", "kich_thuoc": "4,5x11"}}], "user_intent": "sell"}))
    eng.handle("chu-8", "dt 4,5x11")
    assert eng.conversation("chu-8").active.prop.fields.get("dien_tich_dat") == "49,5m2"
