"""29/10/2026 (SRS-5.1zzzzzzz283). Chủ dự án: "thông tin dự án có các thứ chung các thứ riêng, xem bên github anh Luận có quy chế chung riêng chưa" →
"làm theo anh Luận đi". Khuôn anh Luận (`docs/data-model.md` "Kế thừa 3 tầng"): Project ⊕ UnitType ⊕ Unit, căn thắng; giá là của riêng người rao.
Phía bán đã kế thừa (`build_project_block`); phía MUA thì dòng căn không mang gì của dự án — khách hỏi "căn này có hồ bơi không" bot không biết dù
kho dự án có. Mỗi ca đỏ khi gỡ bản sửa."""
from aioi.engine import Engine
from aioi.mua import COT_CAN, dong_can
from aioi.projects import InMemoryProjectStore, Project, UnitType, dong_ke_thua
from tests.test_viec_mua import CAN, KHACH_MUA, AiGia, KhoGia

PID = "22222222-2222-2222-2222-222222222222"


def _du_an() -> Project:
    p = Project(name="Sky Garden", amenities=["hồ bơi", "gym", "công viên nội khu"])
    p.id = PID
    p.attributes = {"chủ đầu tư": "Công ty A", "pháp lý": "sổ hồng từng căn", "bàn giao": "quý 4/2026",
                    "website": "https://ngoai.example/sky"}
    p.unit_types = [UnitType("2PN-A", {"diện tích": "68 m²", "số phòng ngủ": "2", "hướng ban công": "Đông Nam"})]
    return p


def test_dong_ke_thua_can_thang_khong_link_ngoai_khong_gia():
    d = dong_ke_thua(_du_an(), "2PN-A", {"legal_status": "hdmb", "area_m2": 70})
    assert d.startswith("thuộc dự án Sky Garden") and "chủ đầu tư Công ty A" in d and "hồ bơi" in d and "mẫu 2PN-A" in d
    assert "pháp lý" not in d and "68 m²" not in d         # căn đã có pháp lý / diện tích riêng → căn thắng, không lặp giá trị chung
    assert "hướng ban công Đông Nam" in d and "số phòng ngủ 2" in d
    assert "http" not in d and "giá" not in d               # bot chỉ dán link web mình; giá là của riêng người rao
    assert len(dong_ke_thua(Project(name="X", amenities=["a" * 300] * 9, attributes={f"k{i}": "v" * 90 for i in range(20)}))) <= 702


def test_cot_can_doc_project_id_va_mau_nha():
    assert "project_id" in COT_CAN and "unit_type:boc_tach->>unit_type" in COT_CAN


class _KhoDuAn(InMemoryProjectStore):
    def theo_id(self, project_id):
        return _du_an() if project_id == PID else None


class _KhoCanTrongDuAn(KhoGia):
    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "GET" and endpoint.startswith("listings?"):
            self.goi.append((method, endpoint, data))
            return [{**CAN, "project_id": PID, "unit_type": "2PN-A"}]
        return super()._request(method, endpoint, data, prefer)


def test_khach_mua_thay_phan_chung_cua_du_an_trong_dong_can():
    ai = AiGia({**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "quan_tam": True}})
    eng = Engine(ai, conversation_store=_KhoCanTrongDuAn(), project_store=_KhoDuAn())
    eng.handle("mua-283", "căn ABCD1234 có hồ bơi không em")
    s = ai.system[-1]
    assert "#ABCD1234" in s and "thuộc dự án Sky Garden" in s and "hồ bơi" in s and "mẫu 2PN-A" in s


def test_dong_can_khong_du_an_giu_nguyen():
    assert "thuộc dự án" not in dong_can(CAN)


def test_mau_nha_dang_phang_nhap_tay_van_doc_duoc():
    """`projects.unit_types` của Ny'ah nhập tay dạng phẳng `{ten, ket_cau, kich_thuoc, …}` (khác mogi `{name, specs}`) — trước đây lõi bỏ qua,
    web hiện "Loại 1…5" trống."""
    from aioi.projects import project_from_row
    p = project_from_row({"id": PID, "name": "Ny'ah", "unit_types": [
        {"ten": "Fusion Gen 5", "ket_cau": "trệt, lửng, 3 lầu", "phong_ngu": "4", "kich_thuoc": "4 m x 11 m"},
        {"name": "Cosmo", "specs": {"so_tang": "4"}}, {"ghi_chu": "không tên"}]})
    assert [u.name for u in p.unit_types] == ["Fusion Gen 5", "Cosmo"]
    assert p.unit_types[0].specs == {"kết cấu": "trệt, lửng, 3 lầu", "số phòng ngủ": "4", "kích thước": "4 m x 11 m"}
    assert "mẫu Fusion Gen 5 (kết cấu trệt, lửng, 3 lầu" in dong_ke_thua(p, "Fusion Gen 5", {})
    assert "số phòng ngủ" not in dong_ke_thua(p, "Fusion Gen 5", {"bedrooms": 3})   # căn thắng
