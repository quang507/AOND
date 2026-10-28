"""28/10/2026 (SRS-5.1zzzzzzz240): quyết định chủ dự án sau soát OPEN — vai chủ đầu tư báo admin (OPEN-21 a). Mỗi ca đỏ khi gỡ bản sửa."""
from aioi.engine import SellerRole, khoi_can_nguoi
from tests.test_doc_y_khach import _eng


def test_chu_dau_tu_bao_admin_mot_lan_va_khong_bao_so_phi():
    eng, spy = _eng({"operations": [], "user_intent": "sell", "seller_role": "chu_dau_tu", "seller_role_trich_dan": "bên anh là chủ đầu tư"})
    eng.handle("cdt1", "bên anh là chủ đầu tư dự án này, muốn gửi bán 20 căn")
    c = eng.conversation("cdt1")
    assert c.user_type is SellerRole.CHU_DAU_TU
    assert c.y_luot.get("cdt_bao_admin") and "CHỦ ĐẦU TƯ" in c.y_luot["can_nguoi_that"]
    khoi = khoi_can_nguoi(c)
    assert "CHỦ ĐẦU TƯ" in khoi and "KHÔNG nêu con số" in khoi
    assert any("bộ phận hợp tác dự án" in s for s in spy.systems[-1:])
    # lượt sau vẫn là CĐT (cách nói khác, chưa bắn): không báo lại
    eng.handle("cdt1", "cđt bên anh vẫn muốn đăng nhé")
    assert not c.y_luot.get("cdt_bao_admin") and "can_nguoi_that" not in c.y_luot


def test_vai_khac_khong_bao_admin():
    eng, _ = _eng({"operations": [], "user_intent": "sell", "seller_role": "moi_gioi", "seller_role_trich_dan": "a là MG"})
    eng.handle("cdt2", "a là MG, gửi căn 2PN 85m2")
    assert not eng.conversation("cdt2").y_luot.get("cdt_bao_admin")


def _rao(c, n_ban, n_thue=0):
    from aioi.engine import Listing
    c.listings = []
    for i in range(n_ban + n_thue):
        li = Listing()
        li.prop.fields.update({"dia_chi": f"{i + 1} Lê Lợi", "gia": "5 tỷ"})
        li.prop.is_rental = i >= n_ban
        c.listings.append(li)
    c.active_listing_id = c.listings[-1].listing_id


def test_phi_troi_theo_so_tin_ban_khong_dem_tin_thue():
    """OPEN-28 b: chính chủ từ tin bán thứ 3 tính phí môi giới 0,5 %; tin cho thuê không đếm; vai khách gọi tên giữ nguyên."""
    from aioi.prompts import muc_phi
    eng, _ = _eng({"operations": []})
    c = eng.conversation("phi3")
    c.user_type = SellerRole.CHU_NHA
    _rao(c, 2, n_thue=3)                       # 2 bán + 3 thuê: vẫn chính chủ
    assert c.vai_phi is SellerRole.CHU_NHA and muc_phi(c.vai_phi, False) == "1% giá chốt"
    _rao(c, 3)
    assert c.vai_phi is SellerRole.MOI_GIOI and muc_phi(c.vai_phi, False) == "0.5% giá chốt"
    assert c.user_type is SellerRole.CHU_NHA
    c.user_type = SellerRole.UNKNOWN           # chưa rõ vai mà đã 3 tin bán: cũng 0,5 %
    assert c.vai_phi is SellerRole.MOI_GIOI
    c.user_type = SellerRole.CHU_DAU_TU        # chủ đầu tư không trôi
    assert c.vai_phi is SellerRole.CHU_DAU_TU
