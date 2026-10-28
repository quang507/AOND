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


def test_tieu_de_khong_viet_hoa_ca_cum():
    """SRS-5.1zzzzzzz241 (chủ dự án 28/10: "tiêu đề tin rao không cần viết hoa để như này"): cụm ≥ 3 từ HOA toàn bộ là lệch luật cứng."""
    from aioi.engine import _viet_hoa_ca_cum
    from aioi.prompts import AD_FORMAT
    assert _viet_hoa_ca_cum("📋 Bản tin:\nCHỊ ƠI, NHÀ MẶT TIỀN CAO LỖ NGAY PARC MALL, giá 10 tỷ")
    assert _viet_hoa_ca_cum("Anh chị ơi, BÁN GẤP NHÀ hẻm xe hơi")             # cách nói chưa bắn
    assert not _viet_hoa_ca_cum("📋 Bản tin cập nhật: Chị ơi, nhà mặt tiền Cao Lỗ ngay Parc Mall, Phường 2 Quận 8, 3 lầu 4 phòng ngủ, giá 10 tỷ, đi là ưng!")
    assert not _viet_hoa_ca_cum("Nhà HXH MT 4m, 5 WC, giá 10 tỷ")            # viết tắt lẻ
    assert "viết hoa gây chú ý" not in AD_FORMAT and "KHÔNG viết HOA" in AD_FORMAT


def test_chinh_sach_ba_cau_nguoi_ban_hay_hoi():
    """OPEN-63 (chủ dự án 28/10: "không bớt phí, có kí hd, không độc quyền"): chính sách nằm ở BUSINESS_CONTEXT, vào prompt phía bán."""
    from aioi.prompts import BUSINESS_CONTEXT, build_chat_system
    from aioi.schema import Property
    for y in ("KHÔNG bớt / giảm phí", "CÓ ký hợp đồng môi giới", "KHÔNG độc quyền", "không có mức chia hoa hồng"):
        assert y in BUSINESS_CONTEXT
    assert "KHÔNG độc quyền" in build_chat_system("Lan·Anh", Property(), None, SellerRole.UNKNOWN, "")


def test_vua_ban_vua_cho_thue_mo_hai_tin_chung_can():
    """OPEN-59 a (SRS-5.1zzzzzzz241): khách nói căn này bán hay thuê đều được → mở thêm tin cho thuê chung căn, chép ô căn (không chép giá),
    hai tin trỏ nhau; căn đã có giá thì chuyển sang tin mới để hỏi giá thuê. Cụm trích không nằm trong lời khách → không mở."""
    plan = {"operations": [], "user_intent": "sell", "ca_ban_ca_thue": True, "ca_ban_ca_thue_trich_dan": "bán hay cho thuê đều được"}
    eng, spy = _eng(plan)
    c = eng.conversation("bt1")
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update({"dia_chi": "12 Cao Lỗ", "quan": "Quận 8", "gia": "10 tỷ", "so_phong_ngu": "4"})
    goc = c.active
    eng.handle("bt1", "nhà này bán hay cho thuê đều được em nha")
    assert len(c.listings) == 2 and c.active is not goc
    cap = c.active
    assert cap.prop.is_rental and not goc.prop.is_rental and cap.prop.fields["so_phong_ngu"] == "4" and "gia" not in cap.prop.fields
    assert cap.prop.fields["_cung_can"] == goc.listing_id and goc.prop.fields["_cung_can"] == cap.listing_id
    assert any("MỞ THÊM MỘT TIN CHO THUÊ" in s for s in spy.systems[-1:])
    eng.handle("bt1", "ai thuê cũng cho, mua cũng bán")                      # đã có tin cặp: không mở thêm
    assert len(c.listings) == 2
    eng2, _ = _eng(plan)
    c2 = eng2.conversation("bt2")
    c2.prop.fields.update({"dia_chi": "12 Cao Lỗ"})
    eng2.handle("bt2", "nhà 12 Cao Lỗ cần bán")                              # cụm trích không có trong lời khách
    assert len(c2.listings) == 1


def test_luu_tin_ghi_cung_can_id():
    import uuid as _u
    from types import SimpleNamespace
    from aioi.schema import Property
    from tests.test_supabase_store_luu_tin import StoreGia
    a, b = _u.uuid4().hex, _u.uuid4().hex
    st = StoreGia(co_san=False)
    li = SimpleNamespace(prop=Property(loai_hinh="nha_pho", is_rental=True, fields={"dia_chi": "12 Cao Lỗ", "_cung_can": a}),
                         listing_id=b, listing_proposed=False, media=[])
    st.save(SimpleNamespace(user_key="zalo-thu-cap", listings=[li]))
    [tao] = [d for m, e, d in st.goi if m == "POST" and e == "listings"]
    assert tao["cung_can_id"] == str(_u.UUID(a)) and tao["deal"] == "cho_thue"


def test_gop_trung_ma_can_khong_gop_tin_ban_voi_tin_thue():
    """OPEN-59: căn hộ có mã căn, một tin bán + một tin thuê — tự gộp trùng mã căn (lúc nạp lại) không được nhập hai tin làm một."""
    from aioi.engine import Listing
    from aioi.schema import Property
    eng, _ = _eng({"operations": []})
    c = eng.conversation("bt3")
    c.listings = [Listing(prop=Property(loai_hinh="can_ho", fields={"ma_so_can": "A-12.05", "gia": "5 tỷ"})),
                  Listing(prop=Property(loai_hinh="can_ho", is_rental=True, fields={"ma_so_can": "A-12.05", "gia": "15 triệu"}))]
    eng._dedup_basket(c)
    assert len(c.listings) == 2
