"""SRS-5.1zzzzzzz228 — chủ dự án 27/10: "làm sao để nó khen hay và đỡ lặp" → "làm cả a b c đi". Bằng chứng: ban-thu-srd run 40482808043
(12 lượt phía bán): 6/7 lượt đầu cùng khuôn "<điều khách nói> + … quá anh ơi!" (lượt 2 chép gần nguyên ví dụ minh hoạ trong GIONG_VUI),
"có phải Phường Chợ Quán không" lặp 5 lượt, bản gọi lại vẫn mở "Dạ". Đỏ khi tắt từng bản sửa."""
from aioi.engine import Engine, Turn
from aioi.prompts import GIONG_VUI


class _Spy:
    def __init__(self, loi=None):
        self.loi, self.systems = list(loi or []), []

    def reply(self, system, messages, **k):
        self.systems.append(system)
        return self.loi.pop(0) if self.loi else "Căn này đủ chỗ cho nhà đông người. Pháp lý căn này sao anh?"

    chat = reply


def _conv(eng, key):
    c = eng.conversation(key)
    c.prop.loai_hinh = "nha_pho"
    return c


# ---------- A: ví dụ trong khối giọng không còn là câu để chép ----------

def test_giong_khong_con_cau_vi_du_bi_chep():
    assert "trung tâm quá anh ơi" not in GIONG_VUI and "Nét quá anh ơi" not in GIONG_VUI and "Tuyệt quá anh" not in GIONG_VUI
    assert '"anh ơi"' not in GIONG_VUI          # không còn gợi ý dùng "anh ơi" như từ đệm
    # SRS-5.1zzzzzzz248: cặp "điều khách nói → lợi ích" bị chép thành khuôn "X thì Y" (41% lời bot 28/10) — bỏ cặp ví dụ, lợi ích chỉ là một kiểu khen.
    assert "→" not in GIONG_VUI and "lợi ích" in GIONG_VUI


# ---------- B1: "anh ơi" hai lượt liền → gọi lại ----------

def test_luot_truoc_la_ban_tin_thi_chi_xet_phan_chat():
    # "Anh chị cô bác ơi" trong THÂN bản tin rao không phải tiếng gọi khách của lượt trước
    spy = _Spy()
    eng = Engine(spy)
    c = _conv(eng, "k-228b")
    c.history.append(Turn("assistant", "📋 Em sẽ rao như vầy nhé anh:\n\nNhà 10 tỷ\n\nAnh chị cô bác ơi, nhà đẹp.\n\n- 10 tỷ\n\n"
                                       "Nhắn Zalo cho em nha!\n\nAnh xem được chưa?", 0.0))
    c.history.append(Turn("user", "ok", 0.0))
    loi = "Có khách hỏi là tốt rồi anh ơi. Hẻm trước nhà rộng tầm mấy mét vậy anh?"   # SRS-367: câu mẫu cũ hỏi phường — nay bị lưới hoi_o_he_thong bắt
    assert eng._soat_hinh_thuc(c, "SYS", loi) == loi and not spy.systems


# ---------- B2: phường hỏi tối đa 2 lần — lượt báo admin cũng thôi hỏi ----------

def test_luot_bao_admin_thoi_hoi_phuong_ngay():
    """SRS-5.1zzzzzzz359 (chủ dự án 02/11: không hỏi khách phường) thay SRS-213 / 214 / 228 (hỏi tới 2 lần rồi mới báo admin): tin chờ phường
    mà hệ thống không tra ra → báo người phụ trách NGAY lượt đầu, MỘT lần (cờ ở ô tin), không đếm lờ, khối prompt không hỏi phường."""
    eng = Engine(_Spy())
    c = _conv(eng, "k-228c")
    c.prop.fields.update({"duong": "Trần Bình Trọng", "quan": "Quận 5"})
    eng._convstore = type("K", (), {"trang_thai_tin": lambda self, conv: {"len_web": False, "thieu": ["phuong"]}, "save": lambda self, conv: None})()
    c.y_luot = {}
    web = eng._trang_thai_web(c)
    assert web["phuong_bao_admin"] and "nhờ admin tra" in c.y_luot["can_nguoi_that"] and "phuong" not in c.lo
    assert c.prop.fields.get("_phuong_bao_admin") == "1"
    for _ in range(2):
        c.y_luot = {}
        web = eng._trang_thai_web(c)
        assert "can_nguoi_that" not in c.y_luot and web["phuong_bao_admin"]
    from aioi.prompts import khoi_trang_thai_web
    k = khoi_trang_thai_web({"len_web": False, "thieu": ["phuong"], "phuong_bao_admin": True})
    assert "hỏi phường" not in k[0].lower() and "người phụ trách đã được báo" in k[0]  # SRS-367: dòng cấm rải rác đã gỡ — bất biến chặn ở đầu ra (_soat_hoi_dung_o)


# ---------- Mục 3: câu ghi nhận ở giữa lời cũng nhận ra; mục 4: "em gửi ảnh" ngược vai ----------

def test_bot_noi_em_gui_anh_cho_chu_nha_bi_goi_lai():
    from aioi.engine import _bot_hua_gui_anh
    assert _bot_hua_gui_anh("Anh có muốn em gửi thêm ảnh thực tế để tin nổi bật hơn không ạ?")
    assert _bot_hua_gui_anh("Em sẽ gửi vài tấm hình cho anh xem nha.")
    assert not _bot_hua_gui_anh("Anh chụp gửi em vài tấm ảnh thực tế nhé.") and not _bot_hua_gui_anh("Em gửi anh bản nháp tin đăng nhé.")
    spy = _Spy()
    eng = Engine(spy)
    c = _conv(eng, "k-228f")
    eng._soat_hinh_thuc(c, "SYS", "Anh có muốn em gửi thêm ảnh thực tế để tin nổi bật hơn không ạ?")
    assert len(spy.systems) == 1 and "ngược vai" in spy.systems[0]
