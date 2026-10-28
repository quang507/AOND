"""SRS-5.1zzzzzzz168 (chủ dự án Lê Quang 24/10/2026: hỏi "căn này có ảnh không em", bot đáp "Có ảnh anh ạ, ảnh em gửi ngay sau tin này" mà 130 căn mẫu chưa có
ảnh nào, không ảnh nào tới). Gốc: khối căn dạy model "ảnh căn tự gửi kèm ngay sau" cho MỌI căn, model không biết căn nào có ảnh. Nay mỗi dòng căn ghi số ảnh
thật (đếm ở `listing_photos_v`, cùng nguồn ảnh gửi kèm) và lời dặn nói thật khi chưa có. Đỏ khi bỏ số ảnh khỏi dòng căn, khi lời dặn lại hứa ảnh vô điều kiện,
hoặc khi không đọc được ảnh mà vẫn khẳng định "chưa có ảnh"."""
from aioi.mua import dong_can, khoi_can_cho_khach
from tests.test_tim_nha import KhoGia


def test_dong_can_ghi_so_anh_that():
    co = dong_can({"code": "A1", "property_type": "nha_pho", "_so_anh": 4})
    chua = dong_can({"code": "A2", "property_type": "nha_pho", "_so_anh": 0})
    khong_biet = dong_can({"code": "A3", "property_type": "nha_pho"})
    assert "có 4 ảnh" in co and "CHƯA" not in co
    assert "CHƯA có ảnh nào" in chua
    assert "ảnh" not in khong_biet.replace("link", "")   # không đọc được ảnh → không khẳng định gì


def test_loi_dan_khong_hua_anh_vo_dieu_kien():
    khoi = khoi_can_cho_khach([{"code": "A2", "property_type": "nha_pho", "_so_anh": 0}])
    assert "tự gửi kèm ngay sau, không cần nhắc)" not in khoi          # câu cũ hứa ảnh cho mọi căn
    assert "CHƯA có ảnh" in khoi and "KHÔNG hứa xin chủ" in khoi           # SRS-5.1zzzzzzz253: không hứa việc không ghi
    assert "KHÔNG hứa gửi ảnh" in khoi                                   # dòng căn không ghi gì về ảnh


class KhoCoAnh(KhoGia):
    def __init__(self, anh, **kw):
        super().__init__(**kw)
        self._anh = anh

    def _get(self, endpoint):
        self.goi.append((endpoint, None))
        if endpoint.startswith("listing_photos_v"):
            if self._anh is None:
                raise RuntimeError("PGRST500")
            return [{"code": c} for c in self._anh]
        return []


def _lead():
    from aioi.schema import BuyerLead
    return BuyerLead(loai_giao_dich="mua", loai_bds="nha_pho", khu_vuc="Quận 5", ngan_sach="5 tỷ")


def test_tim_nha_gan_so_anh_theo_view_anh():
    tra = [{"can": {"code": "A1", "property_type": "nha_pho"}, "diem": 5, "ly_do": ""},
           {"can": {"code": "B2", "property_type": "nha_pho"}, "diem": 3, "ly_do": ""}]
    kho = KhoCoAnh(["A1", "A1", "A1"], tra=tra)
    can = {c["code"]: c for c in kho.can_phu_hop(_lead())}
    assert can["A1"]["_so_anh"] == 3 and can["B2"]["_so_anh"] == 0
    assert sum(1 for e, _ in kho.goi if e.startswith("listing_photos_v")) == 1   # MỘT lượt đọc ảnh cho cả danh sách


def test_khong_doc_duoc_anh_thi_khong_khang_dinh():
    kho = KhoCoAnh(None)
    can = kho.can_phu_hop(_lead())
    assert can and "_so_anh" not in can[0]
    assert "CHƯA có ảnh nào" not in dong_can(can[0])
