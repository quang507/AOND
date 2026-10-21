"""21/10/2026 (SRS-5.1zzzzzzz108). Bắn thử 209 (sau SRS-5.1zzzzzzz107):
- KB1: khách làm rõ "nhà ở quận Đống Đa, Hà Nội" — AI lập thao tác trả "add" (căn MỚI), cờ ngoài vùng gắn căn mới, căn cũ cùng đường cùng
  giá vẫn mở (chờ thông tin). Nay căn chưa trình bản nháp trùng đúng tên đường + giá bị ẩn theo; luật "add" nói rõ làm rõ địa chỉ là update.
- Nhánh ngoài vùng: "Dạ, em rất tiếc…" lọt vì nhánh đó bỏ qua bước kiểm hình thức.
Đỏ trên code cũ (đã thử)."""
from aioi.engine import Engine
from aioi.prompts import OPERATIONS_SYSTEM
from tests.test_doc_y_khach import _Spy


class _SpyDa(_Spy):
    def __init__(self, plan, loi):
        super().__init__(plan)
        self.loi = list(loi)

    def chat(self, system, messages, **k):
        self.systems.append(system)
        return self.loi.pop(0) if self.loi else "Em rất tiếc ạ."


def _plan_ha_noi():
    return {"operations": [], "ngoai_vung": "Hà Nội", "ngoai_vung_trich_dan": "quận Đống Đa, Hà Nội"}


def test_can_trung_duong_gia_an_theo_khi_biet_ngoai_vung():
    spy = _SpyDa(_plan_ha_noi(), [])
    eng = Engine(spy)
    conv = eng.conversation("nv9")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update({"duong": "Nguyễn Chí Thanh", "gia": "22,5 tỷ"})
    cu = conv.active
    moi = conv.new_listing()
    moi.prop.loai_hinh = "nha_pho"
    moi.prop.fields.update({"duong": "Nguyễn Chí Thanh", "gia": "22,5 tỷ", "quan": "Đống Đa"})
    khac = conv.new_listing()
    khac.prop.fields.update({"duong": "Trần Bình Trọng", "gia": "9 tỷ"})
    conv.active_listing_id = moi.listing_id
    eng.handle("nv9", "nhà ở quận Đống Đa, Hà Nội em")
    assert moi.prop.fields["_ngoai_vung"] == "Hà Nội" and cu.prop.fields.get("_ngoai_vung") == "Hà Nội"
    assert "_ngoai_vung" not in khac.prop.fields


def test_nhanh_ngoai_vung_khong_mo_dau_da():
    spy = _SpyDa(_plan_ha_noi(), ["Dạ, em rất tiếc là bên em chưa nhận Hà Nội ạ.", "Em rất tiếc, bên em chưa nhận Hà Nội ạ."])
    eng = Engine(spy)
    r = eng.handle("nv10", "nhà ở quận Đống Đa, Hà Nội em")
    assert not r.reply.startswith("Dạ") and "VIẾT LẠI LƯỢT NÀY" in spy.systems[-1]


def test_lam_ro_dia_chi_la_update_khong_add():
    assert "LÀM RÕ địa chỉ" in OPERATIONS_SYSTEM and "KHÔNG \"add\"" in OPERATIONS_SYSTEM
