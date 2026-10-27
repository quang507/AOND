"""22/10/2026 (SRS-5.1zzzzzzz138). Chủ dự án: "làm công cụ tìm nhà cho bot… tìm tốn ít quota nhất, ít hơn càng tốt". Đỏ khi: nhúng Gemini dù khách chưa tả nhu cầu,
nhúng lại cùng một câu, một lượt tìm gọi DB nhiều hơn một lần, hàm DB lỗi mà bot mất rổ hàng, bỏ vì-sao-hợp, hoặc ký tự đại diện trong chữ khách lọt vào ILIKE."""
from aioi.mua import KhoNguoiMua, dong_can, khoi_can_cho_khach
from aioi.schema import BuyerLead


class KhoGia(KhoNguoiMua):
    is_configured = True

    def __init__(self, tra=None, loi=False):
        self.goi = []
        self._tra = tra if tra is not None else [{"can": {"code": "A1", "property_type": "nha_pho", "street": "Trần Hưng Đạo", "ward": "P.5"}, "diem": 5, "ly_do": "đúng khu vực khách chọn"}]
        self._loi = loi

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((endpoint, data))
        if endpoint == "rpc/parse_vnd":
            return 5_000_000_000
        if endpoint == "rpc/tim_nha":
            if self._loi:
                raise RuntimeError("PGRST202 chưa có hàm")
            return self._tra
        return []

    def _get(self, endpoint):
        self.goi.append((endpoint, None))
        return [{"code": "CU1", "property_type": "nha_pho"}]


def _lead(**f):
    return BuyerLead(loai_giao_dich="mua", loai_bds="nha_pho", khu_vuc="Quận 5", ngan_sach="5 tỷ", so_phong_ngu="3PN", **f)


def _tim(kho):
    return [g for g in kho.goi if g[0] == "rpc/tim_nha"]


def test_khong_ta_nhu_cau_thi_khong_nhung():
    kho, dem = KhoGia(), []
    kho.__dict__["_nhung_nhu_cau"] = lambda t: dem.append(t) or [0.1] * 768
    can = kho.can_phu_hop(_lead())
    assert dem == [] and _tim(kho)[0][1]["p_vec"] is None             # không lời tả → không tốn lượt Gemini
    assert can[0]["code"] == "A1" and can[0]["_ly_do"] == "đúng khu vực khách chọn"


def test_ta_nhu_cau_nhung_mot_lan_va_nho():
    kho, dem = KhoGia(), []
    kho.__dict__["_nhung_nhu_cau"] = lambda t: dem.append(t) or [0.1] * 768
    lead = _lead(fields={"moi_truong_song": "yên tĩnh", "thanh_vien": "ông bà"})
    kho.can_phu_hop(lead)
    kho.can_phu_hop(lead)
    assert dem == ["yên tĩnh. ông bà"]                                # một lần nhúng, lượt sau dùng lại
    assert len(_tim(kho)) == 1                                        # cùng nhu cầu trong 60 giây: không gọi DB lần nữa
    p = _tim(kho)[0][1]
    assert p["p_deal"] == "ban" and p["p_loai"] == "nha_pho" and p["p_khu"] == "Quận 5" and p["p_pn_min"] == 3
    assert p["p_gia_max"] == 6_000_000_000 and len(p["p_vec"]) == 768  # ngân sách 5 tỷ nới 20 %


def test_nhung_loi_van_tim_khong_vector():
    kho = KhoGia()

    def hong(_t):
        raise TimeoutError("hết hạn")
    kho.__dict__["_nhung_nhu_cau"] = hong
    can = kho.can_phu_hop(_lead(fields={"moi_truong_song": "yên tĩnh"}))
    assert can and _tim(kho)[0][1]["p_vec"] is None


def test_ham_db_loi_thi_ve_loc_cung_khong_mat_ro_hang():
    kho = KhoGia(loi=True)
    can = kho.can_phu_hop(_lead())
    assert [c["code"] for c in can] == ["CU1"]                         # đường lọc cứng cũ vẫn trả căn


def test_ly_do_vao_dong_can_va_khoi_cho_bot():
    kho = KhoGia()
    can = kho.can_phu_hop(_lead())
    d = dong_can(can[0])
    assert "vì sao hợp: đúng khu vực khách chọn" in d
    assert "#A1" in khoi_can_cho_khach(can)


def test_ky_tu_dai_dien_khong_lot_vao_ilike():
    kho = KhoGia()
    lead = BuyerLead(loai_giao_dich="thue", khu_vuc="Quận 5 %_ , (x)", ngan_sach="chưa rõ")   # SRS-214: cần cả ngân sách mới tìm; chữ không ra số → không trần giá
    kho.can_phu_hop(lead)
    p = _tim(kho)[0][1]
    assert p["p_deal"] == "cho_thue" and p["p_khu"] == "Quận 5"
