"""SRS-5.1zzzzzzz353 — lời CHAT nhận xét giá / thị trường: AI đọc nghĩa, code kiểm cụm trích (cùng cách bản tin SRS-336); lưới từ khoá
`_BINH_LUAN_GIA` chỉ còn đỡ khi AI không chạy. Lớp lỗi: lưới từ khoá trên lời bot, đổi chữ là lọt (CLAUDE.md §4.8). Lọc thô (câu khẳng định có
số tiền / giá / thị trường) quyết có cần gọi AI — lượt không nhắc giá không tốn lần gọi nào. Số / tên trong bài là giả."""
from aioi.config import Settings
from aioi.engine import Engine, _BINH_LUAN_GIA, _soat_binh_luan_gia
from aioi.llm.mock import MockProvider


class _Ai:
    def __init__(self, cum=None, hong=False):
        self.cum, self.hong, self.doc = cum, hong, []

    def extract(self, system, messages, json_schema):
        assert "cum" in json_schema["properties"]
        self.doc.append((system, messages[-1].content))
        if self.hong:
            raise TimeoutError("giả lập AI hỏng")
        return {"cum": list(self.cum or [])}


def _soat(ai, loi):
    eng = Engine(MockProvider(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")))
    eng._provider = ai
    return _soat_binh_luan_gia(eng, eng.conversation("thu-353"), loi, {})


def test_cach_noi_moi_luoi_cu_bo_lot_ai_bat():
    for loi, cum in (("Tầm 9 tỷ cho căn này là dễ chịu lắm rồi anh, em ghi vào tin nha.", "là dễ chịu lắm rồi"),
                     ("Khu Gò Vấp này nhà cỡ đó đi nhanh lắm anh, giá vầy chắc vài tuần là có người chốt.", "đi nhanh lắm")):   # cách nói mới
        assert not _BINH_LUAN_GIA.search(loi), loi                      # tiền đề: lưới từ khoá cũ bỏ lọt
        ai = _Ai([cum, "cụm không có trong lời"])
        ly_do = _soat(ai, loi)
        assert ai.doc and "tin nhắn trợ lý" in ai.doc[0][0], loi       # lời chat dùng prompt chat (có cả thị trường)
        assert ly_do and cum in ly_do[0] and "cụm không có trong lời" not in ly_do[0], loi


def test_ai_noi_khong_co_thi_tin_ai_khong_tin_tu_khoa():
    loi = "Em đã ghi giá 9 tỷ vào tin, mức giá anh đưa hợp lý để em rao luôn nha."   # lưới cũ bắt "giá … hợp lý"
    assert _BINH_LUAN_GIA.search(loi)
    assert _soat(_Ai([]), loi) == []                                    # AI chạy và đọc là không nhận xét → không gọi lại


def test_ai_khong_chay_thi_luoi_tu_khoa_do():
    loi = "Giá 16 tỷ vậy là vừa tầm rồi anh."
    assert _soat(_Ai(hong=True), loi)                                   # AI hỏng → lưới cũ vẫn chặn


def test_loi_khong_nhac_gia_hoac_chi_hoi_gia_thi_khong_goi_ai():
    for loi in ("Đất trên sổ ngang dài bao nhiêu mét vậy anh?", "Anh muốn bán giá bao nhiêu ạ?", "Nhà hẻm 4m thì xe ba gác vào thoải mái anh."):
        ai = _Ai(["bất kỳ"])
        assert _soat(ai, loi) == [] and ai.doc == [], loi
