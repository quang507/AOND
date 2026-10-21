"""21/10/2026 (SRS-5.1zzzzzzz92). Khâu ghi kho trung bình 2,8 s / lượt nằm TRƯỚC lời gửi khách. Nay: lần lưu cuối chạy nền theo hàng đợi
của từng khách (đúng thứ tự), lần lưu thường chờ hàng đợi xong; hàm tra cố định của DB nhớ kết quả. Đỏ khi lưu nền đè bản mới bằng
bản cũ, hay khi tra lại cùng chữ vẫn gọi mạng."""
import threading
import time

from aioi.engine import Engine
from aioi.supabase_store import SupabaseConversationStore
from tests.test_tieu_de_co_gia import _SpyLan


class _Kho(SupabaseConversationStore):
    def __init__(self):
        super().__init__(url="https://x.invalid", key="k")
        self.ghi: list[str] = []
        self.goi = 0

    def _save(self, conv):
        time.sleep(0.05)
        self.ghi.append(conv.prop.fields.get("gia", ""))

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi += 1
        return [{"phuong": "Phường Chợ Quán", "quan_cu": "Quận 5"}]


def test_luu_nen_dung_thu_tu_va_luu_thuong_cho_hang_doi():
    kho = _Kho()
    eng = Engine(_SpyLan({"operations": []}, []))
    conv = eng.conversation("ln1")
    for g in ("1 tỷ", "2 tỷ", "3 tỷ"):
        conv.prop.fields["gia"] = g
        kho.luu_nen(conv)
    conv.prop.fields["gia"] = "4 tỷ"
    kho.save(conv)                       # lượt sau lưu ngay: phải ghi SAU mọi bản nền
    assert kho.ghi == ["1 tỷ", "2 tỷ", "3 tỷ", "4 tỷ"]


def test_luot_tra_loi_khong_cho_lan_luu_cuoi():
    kho = _Kho()
    cham = threading.Event()
    kho._save = lambda conv: cham.wait(2)     # Supabase chậm
    spy = _SpyLan({"operations": []}, ["Em ghi nhận ạ."])
    eng = Engine(spy)
    eng._convstore = kho
    t0 = time.perf_counter()
    eng.handle("ln2", "nhà hẻm quận 5")
    assert time.perf_counter() - t0 < 1.5
    cham.set()


def test_tra_co_dinh_nho_ket_qua():
    kho = _Kho()
    assert kho._chuan_dia_ban("Phường 1, Quận 5") == ("Phường Chợ Quán", "Quận 5")
    kho._chuan_dia_ban("Phường 1, Quận 5")
    assert kho.goi == 1
