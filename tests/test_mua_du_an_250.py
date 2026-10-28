"""SRS-5.1zzzzzzz250 (chủ dự án 28/10/2026): phía mua dùng kho dự án chung — (3) "quận X có dự án gì" ("có địa chỉ hết rồi mà"), (4) tìm căn
theo dự án, (7) "gửi bảng căn còn bán"; câu về dự án mà không chỉ căn → "hỏi chủ nhà có căn … đang rao bán gắn với địa chỉ này trước, nếu ko
có nữa thì hỏi admin". Đỏ khi bỏ phần nối trong `Engine._viec_mua` hoặc hai hàm tra kho."""
from aioi import du_an_mua
from tests.test_du_an_mua import NYAH, KhoDuAn
from tests.test_viec_mua import CAN, KHACH_MUA, _engine

CAN_NYAH = {**CAN, "id": "22222222-2222-2222-2222-222222222222", "code": "NYAH0001", "unit_code": "A05", "price_raw": "9 tỷ", "area_m2": 70}


class KhoKhu(KhoDuAn):
    def __init__(self, can_da=(), **kw):
        super().__init__([NYAH], **kw)
        self.can_da = list(can_da)

    def _get(self, endpoint):
        if endpoint.startswith("projects?or=(district.imatch."):
            self.goi.append(("GET", endpoint, None))
            return [{"id": "p1", "name": "Ny'ah Phú Định", "district": "Quận 8", "ward": "Phường Phú Định"},
                    {"id": "p9", "name": "Chung cư Bông Sao", "district": "Quận 8", "ward": None}]
        if endpoint.startswith("listings?project_id=in."):
            return [{"project_id": "p1"}, {"project_id": "p1"}]
        if endpoint.startswith("listings?project_id=eq."):
            self.goi.append(("GET", endpoint, None))
            return list(self.can_da)
        return super()._get(endpoint)


def test_quan_x_co_du_an_gi_ke_ten_trong_kho_va_so_can():
    kho = KhoKhu()
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"du_an_khu_vuc": "quận 8", "du_an_khu_vuc_chuan": "Quận 8", "trich_dan": "quận 8 có dự án gì"}})
    eng.handle("mua-khu-1", "Cho anh hỏi quận 8 có dự án gì")
    khoi = [s for s in ai.system if 'KHU "Quận 8"' in s]
    assert khoi and "Ny'ah Phú Định — đang có 2 căn rao" in khoi[-1] and "Chung cư Bông Sao" in khoi[-1]
    q = next(e for m, e, d in kho.goi if e.startswith("projects?or=(district.imatch."))
    assert "%5B%5E0-9%5D" in q                    # chặn số dính liền: "Quận 1" không ra Quận 10 / 11 / 12


def test_khu_ai_tu_suy_khong_co_trong_tin_thi_khong_tra():
    kho = KhoKhu()
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"du_an_khu_vuc": "Quận 7", "trich_dan": "có dự án gì"}})
    eng.handle("mua-khu-2", "bên đó có dự án gì em")
    assert not any(e.startswith("projects?or=(district.imatch.") for m, e, d in kho.goi)


def test_tim_can_trong_du_an_ra_bang_can_con_ban():
    kho = KhoKhu(can_da=[CAN_NYAH])
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"tim_du_an": "Ny'ah Phú Định", "trich_dan": "Ny'ah Phú Định còn căn nào"}})
    eng.handle("mua-da-tim", "Ny'ah Phú Định còn căn nào không em, gửi anh bảng căn còn bán")
    khoi = [s for s in ai.system if "CĂN ĐANG RAO TRONG DỰ ÁN" in s]
    assert khoi and "#NYAH0001" in khoi[-1] and "mã căn A05" in khoi[-1] and "9 tỷ" in khoi[-1]
    assert any(e.startswith("listings?project_id=eq.p1") and "deal=eq.ban" in e for m, e, d in kho.goi)
    assert eng.conversation("mua-da-tim").buyer_lead.fields["_du_an_id"] == "p1"


def test_du_an_chua_co_can_noi_that_khong_bia():
    kho = KhoKhu(can_da=[])
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"tim_du_an": "Ny'ah Phú Định", "trich_dan": "Ny'ah Phú Định"}})
    eng.handle("mua-da-rong", "tìm căn ở Ny'ah Phú Định")
    assert any("CHƯA có căn nào đang rao" in s for s in ai.system)


def test_hoi_ve_du_an_khong_chi_can_thi_hoi_chu_nha_trong_du_an_roi_moi_toi_admin():
    kho = KhoKhu(can_da=[CAN_NYAH])
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"tim_du_an": "Ny'ah Phú Định", "hoi_chu_nha": "còn căn tầng cao không",
                                                 "trich_dan": "Ny'ah Phú Định còn căn tầng cao không"}})
    r = eng.handle("mua-da-hoi", "Ny'ah Phú Định còn căn tầng cao không em")
    ghi = kho.ghi("POST", "info_requests")
    assert ghi and ghi[0]["listing_id"] == CAN_NYAH["id"] and ghi[0]["question"] == "còn căn tầng cao không"
    assert r.can_nguoi_that is None

    kho2 = KhoKhu(can_da=[])
    eng2, _ = _engine(kho2, {**KHACH_MUA, "mua": {"tim_du_an": "Ny'ah Phú Định", "hoi_chu_nha": "còn căn tầng cao không",
                                                  "trich_dan": "Ny'ah Phú Định còn căn tầng cao không"}})
    r2 = eng2.handle("mua-da-hoi2", "Ny'ah Phú Định còn căn tầng cao không em")
    assert not kho2.ghi("POST", "info_requests") and "còn căn tầng cao không" in (r2.can_nguoi_that or "")
    r3 = eng2.handle("mua-da-hoi2", "Ny'ah Phú Định còn căn tầng cao không em")
    assert r3.can_nguoi_that is None                       # báo admin MỘT lần cho cùng câu


def test_khoi_rong_khi_khong_co_ket_qua():
    assert du_an_mua.khoi_du_an_khu(None) == "" and du_an_mua.khoi_can_du_an({}) == ""
    assert "CHƯA có dự án nào" in du_an_mua.khoi_du_an_khu({"khu": "Quận 99", "ds": []})
