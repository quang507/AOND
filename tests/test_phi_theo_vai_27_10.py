"""SRS-5.1zzzzzzz227 — ban-thu-srd 27/10: vai người rao CHƯA rõ, khách hỏi "Phí môi giới bên em thu sao?", prompt đưa nguyên văn câu mẫu
"1% giá chốt nếu là chủ nhà, 0.5% nếu là môi giới" mà model viết "Phí bên em với chủ nhà là 1% giá chốt" — đoán một vai. Lưới code: con số
phí % trong lời bot phía bán phải khớp `muc_phi` theo vai, lệch thì gọi lại model. Đỏ khi tắt bản sửa."""
from aioi.engine import Engine, _phi_lech_vai
from aioi.revenue import SellerRole

LECH = "Phí bên em với chủ nhà là 1% giá chốt khi bán, chỉ thu khi giao dịch thành công anh nhé."
DU = "Em xin phép báo phí bên em: phí môi giới bên em là 1% giá chốt nếu là chủ nhà, 0.5% nếu là môi giới. Chỉ thu khi giao dịch thành công."


def test_vai_chua_ro_mot_muc_la_lech():
    assert _phi_lech_vai(LECH, SellerRole.UNKNOWN, False) == "1% giá chốt nếu là chủ nhà, 0.5% nếu là môi giới"
    assert _phi_lech_vai("Phí bên em chỉ 0,5% thôi anh.", SellerRole.UNKNOWN, False)   # cách nói mới, dấu phẩy thập phân


def test_vai_chua_ro_du_hai_muc_hoac_hoi_vai_la_dung():
    assert _phi_lech_vai(DU, SellerRole.UNKNOWN, False) is None
    assert _phi_lech_vai("Anh là chủ nhà hay môi giới để em báo phí cho đúng ạ?", SellerRole.UNKNOWN, False) is None


def test_vai_da_ro():
    assert _phi_lech_vai(LECH, SellerRole.CHU_NHA, False) is None
    assert _phi_lech_vai(DU, SellerRole.CHU_NHA, False)                    # chính chủ mà còn nêu 0.5%
    assert _phi_lech_vai("Phí môi giới bên em là 1% giá chốt.", SellerRole.MOI_GIOI, False) == "0.5% giá chốt"
    assert _phi_lech_vai("Phí bên em 1% anh nhé.", SellerRole.CHU_DAU_TU, False)


def test_khong_dung_loi_khac():
    assert _phi_lech_vai("Căn này lợi suất cho thuê tầm 1% mỗi tháng.", SellerRole.UNKNOWN, False) is None   # không nói phí
    assert _phi_lech_vai("Phí giảm 10% cho khách.", SellerRole.UNKNOWN, False) is None                    # 10% không phải mức phí
    assert _phi_lech_vai(LECH, SellerRole.UNKNOWN, True) is None                                            # tin thuê


def test_soat_hinh_thuc_goi_lai_khi_lech():
    class _Spy:
        systems: list = []

        def reply(self, system, messages, **k):
            self.systems.append(system)
            return DU

        chat = reply

    eng = Engine(_Spy())
    c = eng.conversation("k-227")
    c.prop.loai_hinh = "nha_pho"
    ra = eng._soat_hinh_thuc(c, "SYS", LECH)
    assert ra == DU and _Spy.systems and "1% giá chốt nếu là chủ nhà, 0.5% nếu là môi giới" in _Spy.systems[-1]
