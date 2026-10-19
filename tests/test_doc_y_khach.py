"""SRS-5.1zzzzzzz54: hỏi phí / uy tín / link và xưng hô do lượt AI lập thao tác đọc theo NGHĨA, code kiểm trích dẫn.

Lớp lỗi: máy đoán ý khách bằng từ khoá trên chữ khách gõ — "chi phí" nào cũng thành hỏi phí (kể cả "chi phí quản lý chung cư"),
chữ "em" khách dùng để GỌI bot ("đăng đi em") bị coi là khách tự xưng em.
"""
from aioi.engine import Engine, STICKER_TRUNG_TINH, _detect_customer_pronoun


class _Spy:
    def __init__(self, plan):
        self.plan, self.systems = plan, []

    def extract(self, *a, **k):
        return dict(self.plan)

    def reply(self, system, messages, **k):   # lời gửi khách (SRS-5.1zzzzzzz76)
        return self.chat(system, messages, **k)

    def chat(self, system, messages, **k):
        self.systems.append(system)
        return "Vâng, anh cho em hỏi thêm nhé."


def _eng(plan):
    spy = _Spy(plan)
    return Engine(spy), spy


def test_chi_phi_sua_nha_khong_bi_coi_la_hoi_phi():
    # Bản regex: có chữ "chi phí" → chèn khối hỏi phí môi giới. AI đọc theo nghĩa: đây là tiền sửa nhà → bỏ trống.
    eng, spy = _eng({"operations": []})
    eng.handle("p1", "nhà mới sửa lại, chi phí sửa hết 200 triệu đó em")
    assert "KHÁCH HỎI VỀ PHÍ" not in spy.systems[-1]


def test_hoi_phi_cach_noi_moi_va_phi_thue():
    cau = "vậy tụi em ăn bao nhiêu trên căn này"          # không có chữ "phí" / "hoa hồng"
    eng, spy = _eng({"operations": [], "hoi_ve": "phi", "hoi_ve_trich_dan": "ăn bao nhiêu"})
    eng.handle("p2", cau)
    he = spy.systems[-1]
    assert "KHÁCH HỎI VỀ PHÍ" in he and "3/4 của MỘT tháng" in he   # cho thuê có số đúng, không chỉ 1% / 0.5%


def test_trich_dan_bia_thi_khong_chen_khoi():
    eng, spy = _eng({"operations": [], "hoi_ve": "uy_tin", "hoi_ve_trich_dan": "có lừa đảo không"})
    eng.handle("p3", "nhà anh hẻm 4m nha")
    assert "UY TÍN" not in spy.systems[-1]


def test_xung_ho_do_ai_doc_va_giu_qua_cac_luot():
    eng, spy = _eng({"operations": [], "xung_ho": "em", "xung_ho_trich_dan": "nhà em"})
    eng.handle("x1", "nhà em ở Q8 nha")
    conv = eng.conversation("x1")
    assert _detect_customer_pronoun(conv) == "em" and "KHÁCH TỰ XƯNG LÀ 'EM'" in spy.systems[-1]
    spy.plan = {"operations": []}                           # lượt sau AI không nhắc lại → vẫn giữ
    eng.handle("x1", "giá 5 tỷ")
    assert "KHÁCH TỰ XƯNG LÀ 'EM'" in spy.systems[-1]


def test_em_de_goi_bot_khong_phai_tu_xung():
    # "đăng đi em" — regex cũ `em` → khách xưng em → bot cấm "Dạ", gọi khách là em. AI không điền xung_ho → không đổi.
    eng, spy = _eng({"operations": []})
    eng.handle("x2", "ok đăng đi em")
    assert _detect_customer_pronoun(eng.conversation("x2")) == "unknown"
    assert "KHÁCH TỰ XƯNG LÀ 'EM'" not in spy.systems[-1]


def test_sticker_trung_tinh_khong_bao_gio_la_dong_y():
    eng, spy = _eng({"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": STICKER_TRUNG_TINH})
    conv = eng.conversation("s1")
    conv.listing_proposed = True
    eng.handle("s1", STICKER_TRUNG_TINH)
    assert conv.duyet_luot is None
    # Tim thả lên tin bot thì vẫn là đồng ý (có trích dẫn).
    spy.plan = {"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": "❤️"}
    eng.handle("s1", "[khách thả cảm xúc ❤️]")
    assert conv.duyet_luot == "dong_y"
