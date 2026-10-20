"""20/10/2026 (SRS-5.1zzzzzzz88). Chủ dự án: "bắn lên chỗ câu chuẩn cách bot đã ghi để tôi sửa tay từ từ, và chấm điểm nữa phải có trong
ngữ cảnh". Bảng `cau_chuan` (CRM sửa / chấm) → lõi đưa vào prompt lượt trả lời làm ví dụ KÈM ngữ cảnh. Đỏ khi lõi không đọc bảng (vết
cũ: `mau_cau` có trang sửa mà lõi Python không đọc, gỡ 18/10), khi ví dụ mất ngữ cảnh / điểm, hay khi SĐT của khách khác lọt vào prompt."""
from aioi.engine import Engine
from aioi.prompts import khoi_cau_chuan
from tests.test_tieu_de_co_gia import _SpyLan

DONG = {"ngu_canh": [{"ai": "bot", "noi_dung": "Anh/chị xác nhận giúp em bản tin đã ổn?"},
                     {"ai": "seller", "noi_dung": "ok, gọi anh 0903 123 456 nhé"}],
        "cau_bot": "Anh/chị xác nhận giúp em một lần nữa nhé.", "cau_chuan": "Em đăng tin lên web rồi ạ.", "diem": 1,
        "ghi_chu": "khách đã ok thì đăng luôn, đừng hỏi lại"}


def test_khoi_co_ngu_canh_diem_cau_chuan_va_che_sdt():
    k = khoi_cau_chuan([DONG, {"ngu_canh": [], "cau_bot": "Giá 6,95 tỷ đã gồm sổ.", "cau_chuan": None, "diem": 5}])
    assert "Khách: ok, gọi anh 0xxxxxxxxx nhé" in k and "0903" not in k
    assert "Điểm câu bot cũ: 1/5" in k and "CÂU CHUẨN (nên nói thế này): Em đăng tin lên web rồi ạ." in k
    assert "đừng hỏi lại" in k and "KHÁCH KHÁC" in k
    assert "giữ cách nói này" in k   # 5/5 không sửa = câu đã chuẩn
    assert khoi_cau_chuan([]) == "" and khoi_cau_chuan(None) == ""


class _Kho:
    def load(self, k): return None
    def reset(self, k): pass
    def save(self, conv): pass
    def cau_chuan_mau(self): return [DONG]


def test_loi_tra_loi_nhanh_ban_doc_cau_chuan():
    spy = _SpyLan({"operations": []}, ["Em ghi nhận ạ.", "Em ghi nhận ạ."])
    eng = Engine(spy)
    eng._convstore = _Kho()
    conv = eng.conversation("cc1")
    conv.prop.loai_hinh = "nha_pho"
    eng.handle("cc1", "nhà hẻm 3m quận 5")
    assert "CÂU CHUẨN NGƯỜI CHẤM" in spy.systems[-1] and "Em đăng tin lên web rồi ạ." in spy.systems[-1]


def test_kho_loi_thi_khong_vi_du():
    class _Hong(_Kho):
        def cau_chuan_mau(self): raise RuntimeError("mạng")
    eng = Engine(_SpyLan({"operations": []}, ["Em ghi nhận ạ."]))
    eng._convstore = _Hong()
    assert eng._khoi_cau_chuan() == ""
