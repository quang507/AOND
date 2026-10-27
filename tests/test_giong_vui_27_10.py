"""SRS-5.1zzzzzzz219 — chủ dự án 27/10/2026: "sửa cho nó thành vui vẻ, tự nhiên, nhanh nhạy, thêm cảm thán, chưa có nét riêng; đọc như một
nhân viên lễ phép hơn là một môi giới đang hào hứng". Ba chỗ máy móc ở chat anh Luận (run 40449155997): câu hỏi chốt sau bản tin lặp 6
lượt, câu dẫn "Em sửa rồi ạ" kiểu báo cáo, cụm lặp y nguyên qua 7 bản. Gốc: lưới chống lặp bỏ qua MỌI lời có 📋; prompt sửa tin dặn
"tiếp thu, khen tinh thần đóng góp" và "chỗ khách không nhắc giữ nguyên" (SRS-218) → model chép lại. Không phải do câu mẫu."""
from aioi import prompts
from aioi.engine import Engine, Turn, _phan_chat_quanh_ban_tin
from aioi.llm.base import RANH_GIOI_CACHE
from aioi.prompts import GIONG_VUI, build_chat_system, build_fee_followup_system
from aioi.schema import Property


class _Spy:
    def __init__(self, loi=()):
        self.loi, self.systems = list(loi), []

    def extract(self, *a, **k):
        return {"operations": []}

    def reply(self, system, messages, **k):
        self.systems.append(system)
        return self.loi.pop(0) if self.loi else "Vâng ạ."

    chat = reply


BAN = ("📋 Bản tin cập nhật:\n\n🏠 Anh chị ơi, mặt tiền 5m Hoàng Hoa Thám Bình Thạnh, 3 tầng kiên cố, chỉ 12,5 tỷ!\n\nAnh chị cô bác ơi, nhà "
       "mặt tiền đường Hoàng Hoa Thám, đất 34,5m², ngang 5m dài 8m, 3 tầng kiên cố, sổ hồng hoàn công. Giá 12,5 tỷ còn thương lượng nhẹ.\n\n"
       "- 34,5m² đất · ngang 5m x dài 8m\n- 3 tầng kiên cố\n- 12,5 tỷ (thương lượng nhẹ)\n\nNhắn Zalo cho em ngay nha!")
CHOT = "Anh xem bản tin này đã ưng chưa ạ, còn chỗ nào cần chỉnh thêm thì anh cứ nhắn em nhé!"


def _prop() -> Property:
    p = Property(loai_hinh="nha_pho")
    p.fields.update({"duong": "Hoàng Hoa Thám", "quan": "Bình Thạnh", "gia": "12,5 tỷ", "dien_tich_dat": "34,5m2", "kich_thuoc": "5x8",
                     "so_tang": "3", "mat_tien": "5m", "phap_ly_hoan_cong": "sổ hồng hoàn công", "thuong_luong": "thương lượng nhẹ"})
    return p


def test_khoi_giong_mot_nguon_o_ca_hai_prompt_truoc_dau_cache():
    s = build_chat_system("Th•ái", _prop(), "ket_cau")
    assert GIONG_VUI in s and s.index(GIONG_VUI) < s.index(RANH_GIOI_CACHE)
    s2 = build_fee_followup_system("Th•ái", _prop())
    assert GIONG_VUI in s2 and s2.index(GIONG_VUI) < s2.index(RANH_GIOI_CACHE)
    assert "cảm thán" in GIONG_VUI and "nét riêng" in GIONG_VUI and "CHỈ minh hoạ" in GIONG_VUI


def test_vi_du_giong_khong_kem_cau_hoi_o_nao():
    # SRS-196: ví dụ trong prompt chỉ minh hoạ lời ĐÁP — không có dấu hỏi trong các câu minh hoạ.
    dong = next(d for d in GIONG_VUI.splitlines() if "Minh hoạ giọng" in d)
    assert "?" not in dong


def test_prompt_sua_tin_doi_cau_dan_va_cau_chot():
    s = build_fee_followup_system("Th•ái", _prop(), duyet="khong_dong_y")
    assert "khen tinh thần đóng góp" not in s
    assert "TRƯỚC dấu 📋" in s and "SAU bản tin" in s and "không lặp lại nguyên câu chốt" in s
    assert "câu chữ được làm tươi" in s and "KHÔNG chép lại y nguyên" in s


def test_phan_chat_quanh_ban_tin():
    loi = "Em sửa rồi ạ.\n\n" + BAN + "\n\n" + CHOT
    assert _phan_chat_quanh_ban_tin(loi) == "Em sửa rồi ạ.\n" + CHOT
    assert _phan_chat_quanh_ban_tin(BAN) == ""   # không câu dẫn, không câu chốt
    assert _phan_chat_quanh_ban_tin("Vâng ạ, em hỏi thêm nhé.") == "Vâng ạ, em hỏi thêm nhé."


def _conv(eng, truoc: str):
    c = eng.conversation("k-219")
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update(_prop().fields)
    c.listing_proposed = True
    c.history.append(Turn("user", "bớt chữ kiên cố đi", 0.0))
    c.history.append(Turn("assistant", truoc, 0.0))
    c.history.append(Turn("user", "thêm icon đi em", 0.0))
    return c


def test_cau_chot_lap_nguyen_van_sau_ban_tin_thi_goi_lai():
    spy = _Spy(loi=["Ồ thêm icon là nổi liền anh!\n\n" + BAN + "\n\nAnh ưng bản này chưa, em đăng luôn nhé?"])
    eng = Engine(spy)
    c = _conv(eng, "Em sửa rồi ạ.\n\n" + BAN + "\n\n" + CHOT)
    ra = eng._soat_hinh_thuc(c, "SYS", "Em sửa rồi ạ.\n\n" + BAN.replace("chỉ 12,5 tỷ", "giá 12,5 tỷ") + "\n\n" + CHOT)
    assert len(spy.systems) == 1 and "quanh bản tin lặp gần nguyên văn" in spy.systems[0] and "cùng mấy chữ" in spy.systems[0]
    assert ra.startswith("Ồ thêm icon")


def test_cau_dan_va_cau_chot_khac_luot_truoc_thi_khong_goi_lai():   # cách nói mới chưa bắn
    spy = _Spy()
    eng = Engine(spy)
    c = _conv(eng, "Em sửa rồi ạ.\n\n" + BAN + "\n\n" + CHOT)
    loi = "Ngon rồi, thêm icon là tin nổi hẳn anh ơi!\n\n" + BAN + "\n\nAnh ưng bản này chưa, em đăng luôn nhé?"
    assert eng._soat_hinh_thuc(c, "SYS", loi) == loi and not spy.systems


def test_luot_chat_thuong_van_bi_lu_oi_lap_nhu_cu():
    spy = _Spy(loi=["Nhà 3 tầng là điểm cộng lớn đó anh."])
    eng = Engine(spy)
    c = eng.conversation("k-219b")
    c.prop.loai_hinh = "nha_pho"
    c.history.append(Turn("assistant", "Em xin lỗi anh, em hiểu nhầm rồi ạ.", 0.0))
    c.history.append(Turn("user", "nhà 3 tầng", 0.0))
    eng._soat_hinh_thuc(c, "SYS", "Em xin lỗi anh, để em xem lại ạ.")
    assert len(spy.systems) == 1 and "cùng mấy chữ" in spy.systems[0]
