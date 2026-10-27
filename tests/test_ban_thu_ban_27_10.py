"""SRS-5.1zzzzzzz230 — ban-thu-ban 27/10 (run 40489208756) + chủ dự án "sửa 1 với 2 đi, mình nghĩa chúng ta thì được".
(2) Khách "Xin lỗi em…" → model viết lại HAI lần vẫn mở «Dạ không sao anh…»: code bỏ chữ Dạ khi bỏ không đổi nghĩa.
(3) "mình" nghĩa chúng ta ("hay mình đăng luôn anh?") không còn bị lưới gọi lại — lưới kích gần như mọi lượt, ăn mất lượt viết lại.
Lỗi (1) (cờ cần người không bật vì hai luồng cùng tạo dòng `buyers`) ở tests/test_seller_dua_tao.py."""
from aioi.engine import Engine, _bo_da_dau
from aioi.xung_ho import goi_khach_la_minh


def test_minh_nghia_chung_ta_khong_bi_bat():
    for c in ("Anh coi vậy đã ổn chưa, hay mình đăng luôn anh?", "Để mình chốt bản này luôn nha anh.",
              "Chúng mình cùng làm cho tin đẹp hơn nha.", "Anh ưng rồi thì mình rao luôn nhé."):    # cách nói mới: "mình rao luôn"
        assert not goi_khach_la_minh(c), c


def test_minh_goi_khach_van_bi_bat():
    for c in ("Mình cần biết thêm thông tin thì nhắn em nhé.", "Mình đang cần gửi bán hay cho thuê?", "em xin lỗi mình nhé",
              "Chiều mai mình đến xem căn này đúng không ạ?"):
        assert goi_khach_la_minh(c), c


def test_bo_da_dau_khi_khong_doi_nghia():
    assert _bo_da_dau("Dạ không sao anh, em sửa lại ngang 5m nha.") == "Không sao anh, em sửa lại ngang 5m nha."
    assert _bo_da_dau("Dạ, em hiểu rồi anh.") == "Em hiểu rồi anh."
    assert _bo_da_dau("Dạ vâng, em đăng luôn nha.") == "Vâng, em đăng luôn nha."
    assert _bo_da_dau("Dạ không, em chưa đăng tin này.") == "Dạ không, em chưa đăng tin này."   # bỏ là đổi nghĩa → giữ
    assert _bo_da_dau("Dạo này nhà mình có ai hỏi chưa anh?") == "Dạo này nhà mình có ai hỏi chưa anh?"


class _Spy:
    def __init__(self, loi):
        self.loi, self.systems = list(loi), []

    def reply(self, system, messages, **k):
        self.systems.append(system)
        return self.loi.pop(0) if self.loi else "Dạ không sao anh."

    chat = reply


def test_hai_lan_viet_lai_van_da_thi_code_bo():
    spy = _Spy(["Dạ không sao anh, em sửa ngay.", "Dạ không sao anh, em sửa ngay nha."])
    eng = Engine(spy)
    c = eng.conversation("k-230")
    c.prop.loai_hinh = "nha_pho"
    ra = eng._soat_hinh_thuc(c, "SYS", "Dạ không sao anh, em sửa lại nha.")
    assert len(spy.systems) == 2 and ra == "Không sao anh, em sửa ngay nha."


def test_luot_dau_dung_da_van_goi_lai_truoc():   # chưa viết lại lần nào thì không cắt chữ — model được sửa trước
    spy = _Spy(["Không sao anh, em sửa ngay."])
    eng = Engine(spy)
    c = eng.conversation("k-230b")
    c.prop.loai_hinh = "nha_pho"
    assert eng._soat_hinh_thuc(c, "SYS", "Dạ không sao anh.") == "Không sao anh, em sửa ngay." and len(spy.systems) == 1
