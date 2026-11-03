"""SRS-5.1zzzzzzz367 — chủ dự án 02/11: "phải sửa từ gốc chứ". Chấm trên main 48f9912: bot còn hỏi phường 3/201 lượt sau SRS-359. Gốc: hệ thống
chọn ô cần hỏi (`viec_luot`) nhưng lời model gửi khách không bị soát xem nó thật sự hỏi ô nào — `O_HE_THONG_TRA` chỉ lọc vòng chọn câu hỏi.

MỘT bất biến, MỘT chỗ chặn (`engine._soat_hoi_dung_o` trong `LUAT_SOAT`): lời bot chỉ hỏi ô hệ thống chọn cho lượt (hoặc điều khách vừa hỏi
lại); không bao giờ hỏi ô trong `O_HE_THONG_TRA` hay ô đã có giá trị. AI khai ô + cụm nguyên văn, code kiểm cụm và so tập được phép; lệch
thì gọi lại một lần; vẫn lệch thì gọt câu hỏi đó. Ca: ba câu thật (cao_lo l1, xa_phuoc_ly l1, aeon_tan_phu l5), câu xác nhận tên đường, và
một ô khác chưa từng bị bắt (tự hỏi "nhà mấy tầng" khi hệ thống chọn hỏi giá). Đỏ khi gỡ dòng `hoi_dung_o` khỏi `LUAT_SOAT`."""
import pytest

from aioi import engine as eng_mod
from aioi.engine import LUAT_SOAT, Engine
from aioi.prompts import NATURAL_QUESTIONS, SOAT_O_HOI_SYSTEM
from aioi.schema import O_HE_THONG_TRA

# lời bot → khai báo AI (ô + cụm nguyên văn) — giả lập lượt đọc nghĩa
KHAI = {
    "Căn nằm ở đường nào, phường nào, thuộc tỉnh hay thành phố nào vậy?":
        [{"o": "dia_chi", "trich": "đường nào"}, {"o": "phuong", "trich": "phường nào"}],
    "Lô này nằm ở đường nào, thuộc phường hay xã nào, tỉnh nào vậy anh?":
        [{"o": "dia_chi", "trich": "nằm ở đường nào"}, {"o": "phuong", "trich": "thuộc phường hay xã nào"}],
    "Căn nằm trên đường nào, thuộc phường nào của Tân Phú vậy anh?":
        [{"o": "dia_chi", "trich": "nằm trên đường nào"}, {"o": "phuong", "trich": "thuộc phường nào của Tân Phú"}],
    "Nhà mình ở đường Trần Bình Trọng đúng không anh?": [{"o": "duong", "trich": "đường Trần Bình Trọng đúng không"}],
    "Em ghi rồi. Nhà mình xây mấy tầng vậy anh?": [{"o": "ket_cau", "trich": "xây mấy tầng"}],
    "Căn nằm ở đường nào vậy anh?": [{"o": "dia_chi", "trich": "đường nào"}],
    "Anh muốn bán giá bao nhiêu ạ?": [{"o": "gia", "trich": "bán giá bao nhiêu"}],
    "Em ghi rồi. Giá anh muốn bán bao nhiêu ạ?": [{"o": "gia", "trich": "Giá anh muốn bán bao nhiêu"}],
    "Căn này giá 5 tỷ anh nhỉ? Hẻm trước nhà rộng mấy mét anh?": [{"o": "gia", "trich": "giá 5 tỷ anh nhỉ"}],
    "Trích bịa không có trong lời?": [{"o": "phuong", "trich": "phường nào vậy"}],
}


class _Gia:
    """Provider giả: `reply` trả lần lượt các bản viết lại; `extract` (SOAT_O_HOI_SYSTEM) trả khai báo theo lời bot trong tin."""

    def __init__(self, viet_lai=()):
        self.viet_lai, self.goi_lai, self.doc = list(viet_lai), [], 0

    def reply(self, system, messages, **k):
        self.goi_lai.append(system)
        return self.viet_lai.pop(0) if self.viet_lai else ""

    chat = reply

    def extract(self, system, messages, schema):
        assert system == SOAT_O_HOI_SYSTEM
        self.doc += 1
        loi = messages[0].content.split("LỜI TRỢ LÝ SẮP GỬI:\n", 1)[1]
        return {"cau_hoi": KHAI.get(loi, [])}


def _conv(e, viec_o="dia_chi", fields=None, khach=""):
    c = e.conversation("k-367")
    c.role = "seller"
    c.prop.fields.update(fields or {"loai_hinh": "nha_pho"})
    c.cum_vua_hoi = [viec_o] if viec_o else []
    c.y_luot = {"_viec": {"ten": "hoi_o" if viec_o else "trinh_nhap", "o": viec_o, "bo": []}, "_khoi": []}
    c.loi_khach_luot = khach
    return c


@pytest.mark.parametrize("cau", list(KHAI)[:3])
def test_ba_cau_that_hoi_phuong_bi_goi_lai_ban_viet_lai_dung_thi_nhan(cau):
    p = _Gia(["Căn nằm ở đường nào vậy anh?"])
    e = Engine(p)
    ra = e._soat_hinh_thuc(_conv(e), "SYS", cau)
    assert ra == "Căn nằm ở đường nào vậy anh?"
    assert len(p.goi_lai) == 1 and "phường / xã" in p.goi_lai[0] and "hệ thống tự xác định" in p.goi_lai[0]


def test_xac_nhan_ten_duong_bi_chan():
    p = _Gia(["Anh muốn bán giá bao nhiêu ạ?"])
    e = Engine(p)
    c = _conv(e, "gia", {"loai_hinh": "nha_pho", "duong": "Trần Bình Trọng"})
    assert e._soat_hinh_thuc(c, "SYS", "Nhà mình ở đường Trần Bình Trọng đúng không anh?") == "Anh muốn bán giá bao nhiêu ạ?"
    assert "tên đường" in p.goi_lai[0]


def test_o_khac_chua_tung_bi_bat_tu_hoi_so_tang_khi_he_thong_chon_gia():
    p = _Gia(["Em ghi rồi. Giá anh muốn bán bao nhiêu ạ?"])
    e = Engine(p)
    ra = e._soat_hinh_thuc(_conv(e, "gia"), "SYS", "Em ghi rồi. Nhà mình xây mấy tầng vậy anh?")
    assert ra == "Em ghi rồi. Giá anh muốn bán bao nhiêu ạ?" and "hệ thống chọn hỏi" in p.goi_lai[0]


def test_hoi_lai_o_da_co_gia_tri_bi_chan_khi_khong_phai_o_duoc_chon():
    p = _Gia([])
    e = Engine(p)
    c = _conv(e, "lo_gioi_hem", {"loai_hinh": "nha_pho", "gia": "5 tỷ"})
    ra = e._soat_hinh_thuc(c, "SYS", "Căn này giá 5 tỷ anh nhỉ? Hẻm trước nhà rộng mấy mét anh?")
    assert "khách đã cho" in p.goi_lai[0]
    assert ra == "Hẻm trước nhà rộng mấy mét anh?"   # viết lại rỗng → gọt đúng câu hỏi sai, giữ câu hỏi ô được chọn


@pytest.mark.parametrize("cau,ra_dung", [
    ("Căn nằm ở đường nào, phường nào, thuộc tỉnh hay thành phố nào vậy?", "Căn nằm ở đường nào, thuộc tỉnh hay thành phố nào vậy?"),
    ("Lô này nằm ở đường nào, thuộc phường hay xã nào, tỉnh nào vậy anh?", "Lô này nằm ở đường nào, tỉnh nào vậy anh?"),
    ("Căn nằm trên đường nào, thuộc phường nào của Tân Phú vậy anh?", "Căn nằm trên đường nào?"),
])
def test_viet_lai_van_sai_thi_got_ve_hoi_sai(cau, ra_dung):
    p = _Gia([cau])   # bản viết lại vẫn hỏi phường
    e = Engine(p)
    assert e._soat_hinh_thuc(_conv(e), "SYS", cau) == ra_dung and len(p.goi_lai) == 1


def test_khong_bat_oan():
    p = _Gia([])
    e = Engine(p)
    for cau, o in (("Căn nằm ở đường nào vậy anh?", "dia_chi"), ("Anh muốn bán giá bao nhiêu ạ?", "gia"),
                   ("Trích bịa không có trong lời?", "dia_chi")):   # cụm AI trích không có trong lời → không tính
        assert e._soat_hinh_thuc(_conv(e, o), "SYS", cau) == cau
    assert not p.goi_lai
    # khối xác nhận mặt tiền còn lại sau viec_luot → hỏi lại ô mat_tien đã có giá trị là ĐÚNG việc
    c = _conv(e, None, {"loai_hinh": "nha_pho", "mat_tien": "5m"})
    c.y_luot["_khoi"] = ["mat_tien"]
    KHAI["5m là bề ngang căn hay đường trước nhà vậy anh?"] = [{"o": "mat_tien", "trich": "5m là bề ngang căn"}]
    assert e._soat_hinh_thuc(c, "SYS", "5m là bề ngang căn hay đường trước nhà vậy anh?").startswith("5m")
    # khách vừa hỏi lại về phường → trả lời / làm rõ được
    KHAI["Nhà anh thuộc Phường Chợ Quán, anh muốn em ghi tên mới phải không ạ?"] = [
        {"o": "phuong", "trich": "anh muốn em ghi tên mới phải không", "khach_vua_hoi": True, "trich_khach": "ghi phường mới hay cũ"}]
    c = _conv(e, "gia", khach="em ghi phường mới hay cũ vậy")
    cau = "Nhà anh thuộc Phường Chợ Quán, anh muốn em ghi tên mới phải không ạ?"
    assert e._soat_hinh_thuc(c, "SYS", cau) == cau
    assert not p.goi_lai
    # phía mua: không xét lưới này
    c.role = "buyer"
    assert not eng_mod._soat_hoi_dung_o(e, c, list(KHAI)[0], {})


def test_ai_loi_thi_luot_van_di():
    class _Hong(_Gia):
        def extract(self, *a, **k):
            raise RuntimeError("429")
    e = Engine(_Hong())
    assert e._soat_hinh_thuc(_conv(e), "SYS", list(KHAI)[0]) == list(KHAI)[0]


def test_mot_bat_bien_mot_cho_chan():
    assert any(t == "hoi_dung_o" and n == "ly_do" for t, n, _ in LUAT_SOAT)
    assert O_HE_THONG_TRA == frozenset({"phuong", "duong"})
    assert "phường" not in NATURAL_QUESTIONS["dia_chi"]   # lời dặn hỏi địa chỉ không còn bảo model hỏi phường
    assert not hasattr(eng_mod, "_soat_hoi_o_he_thong")   # lưới từ khoá bản vá đầu đã gỡ


def test_o_cung_nhom_voi_o_duoc_chon_khong_bi_bat():
    """SRS-5.1zzzzzzz368 (chấm 02/11: 34 lượt gọi lại oan): hệ thống chọn `phap_ly_hoan_cong`, model hỏi "sổ đỏ riêng" — AI khai
    `phap_ly_so_do`; chọn `dien_tich_dat`, model hỏi "ngang x dài" — AI khai `kich_thuoc`. Cùng nhóm `schema.FACETS` = cùng ý hỏi."""
    p = _Gia([])
    e = Engine(p)
    KHAI["Nhà mình có sổ đỏ riêng chính chủ chưa anh?"] = [{"o": "phap_ly_so_do", "trich": "sổ đỏ riêng chính chủ"}]
    KHAI["Lô đất ngang x dài bao nhiêu vậy anh?"] = [{"o": "kich_thuoc", "trich": "ngang x dài bao nhiêu"}]
    for cau, o in (("Nhà mình có sổ đỏ riêng chính chủ chưa anh?", "phap_ly_hoan_cong"),
                   ("Lô đất ngang x dài bao nhiêu vậy anh?", "dien_tich_dat")):
        assert e._soat_hinh_thuc(_conv(e, o), "SYS", cau) == cau
    assert not p.goi_lai
    # khác nhóm vẫn bắt: chọn hỏi giá mà hỏi sổ
    p2 = _Gia(["Anh muốn bán giá bao nhiêu ạ?"])
    e2 = Engine(p2)
    assert e2._soat_hinh_thuc(_conv(e2, "gia"), "SYS", "Nhà mình có sổ đỏ riêng chính chủ chưa anh?") == "Anh muốn bán giá bao nhiêu ạ?"
