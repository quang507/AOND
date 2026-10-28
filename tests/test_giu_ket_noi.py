"""28/10/2026 (SRS-5.1zzzzzzz238). Chủ dự án: "làm lại tin chống xoá kết nối" — FR-63 mất từ khi gỡ `nudge` 18/10. Đỏ khi lõi không gửi
tin giữ kết nối, gửi ngoài 8–20 giờ, gửi sai câu theo vai, hay đánh dấu đã gửi khi bridge không nhận."""
from datetime import datetime, timezone

from aioi import giu_ket_noi

TRONG_GIO = datetime(2026, 10, 28, 3, 0, tzinfo=timezone.utc)    # 10:00 Việt Nam
NGOAI_GIO = datetime(2026, 10, 28, 15, 0, tzinfo=timezone.utc)   # 22:00 Việt Nam


class _Kho:
    is_configured = True

    def __init__(self, khach, loi_rpc=False):
        self.khach, self.loi_rpc = khach, loi_rpc
        self.da_post, self.da_patch = [], []

    def _request(self, method, endpoint, data=None, prefer=None):
        assert endpoint == "rpc/khach_can_giu_ket_noi"
        if self.loi_rpc:
            raise RuntimeError("404 rpc chưa có")
        return self.khach

    def _post(self, endpoint, data, prefer="return=representation"):
        self.da_post.append((endpoint, data))
        return [{"id": f"r{len(self.da_post)}"}]

    def _patch(self, endpoint, data):
        self.da_patch.append((endpoint, data))


def _hai_khach():
    return [{"zalo_user_id": "z-mua", "vai": "buyer", "buyer_id": "b1", "seller_id": None, "ten": "Lan"},
            {"zalo_user_id": "z-ban", "vai": "seller", "buyer_id": None, "seller_id": "s1", "ten": "Hùng"}]


def test_gui_dung_cau_theo_vai_va_danh_dau_da_gui():
    kho, gui, lich_su = _Kho(_hai_khach()), [], []
    ra = giu_ket_noi.chay_mot_luot(kho, lambda z, c: gui.append((z, c)) or True,
                                   lambda z: "unknown", lambda z, c, v, t, s: lich_su.append((z, v, s)), bay_gio=TRONG_GIO)
    assert [r["zalo"] for r in ra] == ["z-mua", "z-ban"]
    assert "tìm căn hợp ý" in gui[0][1] and "nhắn lại" in gui[0][1]
    assert "giữ tin căn" in gui[1][1] and "nhắn lại" in gui[1][1]
    # giữ chỗ đúng người, đúng loại; rồi đánh `sent`
    assert kho.da_post[0][1]["kind"] == "reengage" and kho.da_post[0][1]["buyer_id"] == "b1" and kho.da_post[0][1]["seller_id"] is None
    assert kho.da_post[1][1]["seller_id"] == "s1" and kho.da_post[1][1]["buyer_id"] is None
    assert kho.da_post[0][1]["note"].startswith("giu_ket_noi")
    assert all(p[1]["status"] == "sent" for p in kho.da_patch)
    assert lich_su == [("z-mua", "buyer", "bot"), ("z-ban", "seller", "bot")]


def test_ngoai_khung_gio_khong_gui():
    kho, gui = _Kho(_hai_khach()), []
    assert giu_ket_noi.chay_mot_luot(kho, lambda z, c: gui.append(z) or True, bay_gio=NGOAI_GIO) == []
    assert gui == [] and kho.da_post == []


def test_bridge_hut_thi_huy_cho_giu_khong_ghi_lich_su():
    kho, lich_su = _Kho(_hai_khach()[:1]), []
    ra = giu_ket_noi.chay_mot_luot(kho, lambda z, c: False, ghi_lich_su=lambda *a: lich_su.append(a), bay_gio=TRONG_GIO)
    assert ra == [] and lich_su == []
    assert kho.da_patch[0][1]["status"] == "cancelled"


def test_rpc_chua_co_thi_khong_lam_gi():
    kho = _Kho(_hai_khach(), loi_rpc=True)
    assert giu_ket_noi.chay_mot_luot(kho, lambda z, c: True, bay_gio=TRONG_GIO) == []
    assert kho.da_post == []


def test_xung_ho_theo_khach():
    kho, gui = _Kho(_hai_khach()[1:]), []
    giu_ket_noi.chay_mot_luot(kho, lambda z, c: gui.append(c) or True, lambda z: "elder:chú", bay_gio=TRONG_GIO)
    assert gui[0].startswith("Chú ơi, cháu")
