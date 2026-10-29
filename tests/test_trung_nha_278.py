"""29/10/2026 (SRS-5.1zzzzzzz278). Chủ dự án: "còn sửa gì ở phía mua dc nữa ko". Soát chat mua 28/10:
(a) 146 Trần Bình Trọng có hai tin (hai người rao, mã EBCB3EEA và B6B04A44) — bot giới thiệu tin thứ nhất trong chat, tin báo căn mới gửi tin
    thứ hai như "căn mới";
(b) tin báo căn mới chen vào giữa lúc khách đang chat (khách nhắn 17:10:41, tin báo 17:11:03).
Mỗi ca đỏ khi gỡ bản sửa."""
from datetime import timedelta
from urllib.parse import unquote

from aioi.mua import bo_can_trung_nha, khoa_nha
from tests.test_bao_can_moi import TRUA, KhoGia, chay, tin


def test_khoa_nha_so_nha_duong_phuong():
    a = khoa_nha("Trần Bình Trọng", "Phường Chợ Quán", "146 Trần Bình Trọng, Phường Chợ Quán, Quận 5")
    b = khoa_nha("Trần Bình Trọng", "Phường Chợ Quán", "146 Trần Bình Trọng, phường Chợ Quán, quận 5")
    assert a and a == b
    assert khoa_nha("Trần Bình Trọng", "Phường Chợ Quán", "148 Trần Bình Trọng") != a     # khác số nhà
    assert khoa_nha("Trần Phú", "Phường 4", None) is None                                   # thiếu số nhà: không gộp
    assert khoa_nha("Trần Phú", "Phường 4", "hẻm 12 Trần Phú") is None
    assert khoa_nha("Đường Số 5A", "Phường Bình Hưng Hòa A", "12/3A đường số 5A") == "12/3a|so 5a|binh hung hoa a"


def test_bo_can_trung_nha_trong_danh_sach_va_voi_can_da_nghe():
    can = [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    khoa = {"a": "146|tran binh trong|cho quan", "b": "146|tran binh trong|cho quan", "c": None}
    assert [c["id"] for c in bo_can_trung_nha(can, khoa)] == ["a", "c"]
    assert [c["id"] for c in bo_can_trung_nha(can, khoa, {"146|tran binh trong|cho quan"})] == ["c"]


class _KhoDiaChi(KhoGia):
    """Kho giả có ô `dia_chi` (boc_tach) và sổ báo cũ — để `khoa_nha_theo_id` đọc được."""
    def __init__(self, tins, dia_chi, bao_cu=()):
        super().__init__(tins)
        self.dia_chi = dia_chi
        self.reminders += [{"id": f"cu{i}", "kind": "match", "buyer_id": "b1", "listing_id": l,
                            "created_at": (TRUA - timedelta(days=2)).isoformat()} for i, l in enumerate(bao_cu)]
        self.loc_hoi = []

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "GET" and endpoint.startswith("conversations?"):
            self.loc_hoi.append(unquote(endpoint))
        rows = super()._request(method, endpoint, data, prefer)
        if method == "GET" and endpoint.startswith("listings?") and "dia_chi" in endpoint:
            ids = [t["id"] for t in self.tins if t["id"] in endpoint] + [l for l in self.dia_chi if l in endpoint]
            return [{"id": i, "street": "Trần Phú", "ward": "Phường 4", "dia_chi": self.dia_chi.get(i)} for i in dict.fromkeys(ids)]
        return rows


def test_khong_bao_tin_trung_nha_voi_can_da_bao():
    # l0 đã báo hai ngày trước; l1 là tin của người rao khác, CÙNG số nhà + đường + phường → không báo như căn mới.
    kho = _KhoDiaChi([tin("l1", "B6B04A44", 6.8e9)], {"l0": "146 Trần Phú", "l1": "146 Trần Phú, Phường 4"}, bao_cu=["l0"])
    ra, gui = chay(kho)
    assert ra == [] and gui == []
    # khác số nhà thì vẫn báo
    kho2 = _KhoDiaChi([tin("l1", "B6B04A44", 6.8e9)], {"l0": "146 Trần Phú", "l1": "150 Trần Phú"}, bao_cu=["l0"])
    ra2, _ = chay(kho2)
    assert [r["code"] for r in ra2] == ["B6B04A44"]


def test_khach_dang_chat_khong_bi_chen_tin_bao():
    kho = _KhoDiaChi([tin("l1", "SEED0001", 6.8e9)], {})
    chay(kho)
    moc = (TRUA - timedelta(minutes=30)).isoformat()
    assert any(f"last_message_at=lt.{moc}" in q for q in kho.loc_hoi), kho.loc_hoi
