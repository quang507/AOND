"""SRS-5.1zzzzzzz197 (chủ dự án 26/10/2026): thêm ô `thu_nhap_thue` cho tin BÁN có hợp đồng thuê (HĐT) và gọn ô hiện trạng.
Ca gốc chat Bình Hưng 26/10: "nhà anh đang ở" bị AI ghi vào `hien_trang_su_dung` trong khi bộ câu hỏi nhà phố chờ `tinh_trang_ban_giao` —
cùng một ý ở hai ô, ô kia vẫn "thiếu" nên bot hỏi lại. Đỏ khi bỏ gom ô ở `Property.update` / bí danh `_has`, hoặc khi bỏ cổng `co_hdt`."""
from aioi.config import Settings
from aioi.engine import Engine
from aioi.llm.mock import MockProvider
from aioi.prompts import extraction_schema
from aioi.schema import CUM_SAU_DANG, Property

S = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")


def _nha(**f) -> Property:
    p = Property(loai_hinh="nha_pho")
    p.fields.update(f)
    return p


def test_hien_trang_su_dung_cua_nha_pho_gom_ve_mot_o():
    p = _nha()
    p.update({"hien_trang_su_dung": "nhà anh đang ở"})
    assert p.fields.get("tinh_trang_ban_giao") == "nhà anh đang ở"
    assert "hien_trang_su_dung" not in p.fields
    assert "tinh_trang_ban_giao" not in p.missing_fields()


def test_hien_trang_su_dung_cua_can_ho_giu_nguyen():
    p = Property(loai_hinh="chung_cu")
    p.update({"hien_trang_su_dung": "đang cho thuê"})
    assert p.fields.get("hien_trang_su_dung") == "đang cho thuê" and "tinh_trang_ban_giao" not in p.fields


def test_tin_cu_con_hien_trang_su_dung_van_tinh_la_da_co():
    p = _nha(hien_trang_su_dung="để trống")   # dòng nạp từ DB cũ
    assert p._has("tinh_trang_ban_giao") and "tinh_trang_ban_giao" not in p.missing_fields()


def test_thu_nhap_thue_va_co_hdt_nam_trong_schema_trich():
    props = extraction_schema()["properties"]
    assert "thu_nhap_thue" in props and "co_hdt" in props


def _cum(p: Property):
    return p.cum_sau_dang(frozenset())


def test_chi_hoi_tien_thue_khi_ai_doc_ra_co_hop_dong_thue():
    ma = [m for m, _ in CUM_SAU_DANG]
    assert "hdt" in ma
    # chưa có cờ / cờ "khong" → không bao giờ tới cụm hdt
    for f in ({}, {"co_hdt": "khong"}):
        r = _cum(_nha(**f))
        assert r is None or r[0] != "hdt", f
    # AI đọc ra nhà đang cho thuê, chưa có số tiền → cụm kế là hdt (đứng ngay sau pháp lý)
    p = _nha(co_hdt="co", dung_ten_so="chính chủ", the_chap="không", quy_hoach="không")
    assert _cum(p) == ("hdt", ["thu_nhap_thue"])
    # đã có tiền thuê thì bỏ
    p.fields["thu_nhap_thue"] = "35 triệu/tháng"
    r = _cum(p)
    assert r is None or r[0] != "hdt"


class AiGia(MockProvider):
    def __init__(self, ke_hoach):
        super().__init__(S)
        self.ke_hoach = ke_hoach

    def extract(self, system, messages, json_schema):
        if "operations" in (json_schema.get("properties") or {}):
            return dict(self.ke_hoach)
        return super().extract(system, messages, json_schema)


def test_thu_nhap_thue_ghi_khi_khach_noi_va_co_hdt_la_phan_loai():
    eng = Engine(AiGia({"operations": [{"op": "update",
                                        "fields": {"co_hdt": "co", "thu_nhap_thue": "35 triệu/tháng"},
                                        "bang_chung": {"thu_nhap_thue": "35 triệu một tháng"}}], "user_intent": "sell"}))
    eng.handle("hdt-1", "nhà đang có hợp đồng thuê, thu 35 triệu một tháng")
    f = eng.conversation("hdt-1").active.prop.fields
    assert f.get("co_hdt") == "co"                         # ô phân loại: không cần cụm trích, AI đọc theo nghĩa
    assert f.get("thu_nhap_thue") == "35 triệu/tháng"


def test_thu_nhap_thue_khong_co_trong_loi_khach_thi_bo():
    eng = Engine(AiGia({"operations": [{"op": "update", "fields": {"thu_nhap_thue": "50 triệu/tháng"},
                                        "bang_chung": {"thu_nhap_thue": "50 triệu/tháng"}}], "user_intent": "sell"}))
    eng.handle("hdt-2", "nhà đang cho thuê")                # khách không nói số tiền → AI không được tự điền
    assert "thu_nhap_thue" not in eng.conversation("hdt-2").active.prop.fields
