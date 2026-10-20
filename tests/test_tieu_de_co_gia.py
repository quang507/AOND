"""20/10/2026 (SRS-5.1zzzzzzz86). Bắn thử lần 2: bản tin CẬP NHẬT của căn hộ Masteri (khách bổ sung sổ hồng, nội thất) có tiêu đề
"Bán căn hộ Masteri Thảo Điền 68m² 2PN full nội thất view sông" — mất giá dù AD_FORMAT bắt buộc. Code kiểm con số giá của căn có
trong dòng tiêu đề; thiếu thì gọi lại model một lần kèm lý do (không tự sửa chữ)."""
from aioi.engine import Engine, _tieu_de_thieu
from aioi.schema import Property
from tests.test_doc_y_khach import _Spy

THIEU = "Em cập nhật rồi ạ.\n\n📋 Bản tin cập nhật:\n\nBán căn hộ Masteri Thảo Điền 68m² 2PN full nội thất view sông\n\nMô tả."
DU = "Em cập nhật rồi ạ.\n\n📋 Bản tin cập nhật:\n\nBán căn hộ Masteri Thảo Điền 68m², 2PN, 6,8 tỷ\n\nMô tả."


class _SpyLan(_Spy):
    def __init__(self, plan, loi):
        super().__init__(plan)
        self.loi = list(loi)

    def chat(self, system, messages, **k):
        self.systems.append(system)
        return self.loi.pop(0) if self.loi else "Vâng."


def test_tieu_de_thieu_gia_thi_goi_lai_mot_lan():
    spy = _SpyLan({"operations": []}, [THIEU, DU])
    eng = Engine(spy)
    conv = eng.conversation("td1")
    conv.prop.loai_hinh = "chung_cu"
    conv.prop.fields.update({"du_an": "Masteri Thảo Điền", "gia": "6,8 tỷ", "dien_tich": "68m2", "so_phong_ngu": "2PN"})
    conv.listing_proposed = True
    kq = eng.handle("td1", "sổ hồng rồi em, full nội thất")
    assert len(spy.systems) == 2 and "VIẾT LẠI LƯỢT NÀY" in spy.systems[-1]
    assert conv.history[-1].content == DU


def test_kiem_so_khong_quan_tay():
    p = Property(loai_hinh="chung_cu", fields={"gia": "6,8 tỷ"})
    assert _tieu_de_thieu(DU, p) == [] and _tieu_de_thieu(THIEU, p)
    assert _tieu_de_thieu("Không có bản tin", p) == []
    assert _tieu_de_thieu(THIEU, Property(loai_hinh="chung_cu")) == []
