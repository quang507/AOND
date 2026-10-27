"""SRS-5.1zzzzzzz191 (chat anh Luận 26/10/2026): "phường 6" của Bình Thạnh bị chia về Bình Lợi Trung + Gia Định. Bản trước không báo cho model biết phường
mơ hồ (bot hỏi việc khác rồi tới lúc duyệt tin mới hỏi trống "phường mới nào"), và khách có chọn "Gia Định" thì địa chỉ cũ còn "phường 6" nên DB vẫn
trả mơ hồ — tin không bao giờ có phường. Đỏ khi bỏ khối trong `khoi_dia_danh` hay bỏ bước chọn trong `SupabaseConversationStore._dia_ban`."""
from aioi.dia_danh import TraDiaDanh, chon_phuong_da_goi_ten, khoi_dia_danh, phuong_cu_chia, so_phuong_cu
from aioi.supabase_store import SupabaseConversationStore

PHUONG_CU = [
    {"ten": "Phường 6", "quan_cu": "Quận Bình Thạnh", "phuong_moi": "Bình Lợi Trung"},
    {"ten": "Phường 6", "quan_cu": "Quận Bình Thạnh", "phuong_moi": "Gia Định"},
    {"ten": "Phường 6", "quan_cu": "Quận 5", "phuong_moi": "Chợ Quán"},          # cùng số, quận khác, chỉ về một phường
    {"ten": "Phường 6", "quan_cu": "Quận 8", "phuong_moi": "Bình Đông"},
    {"ten": "Phường 6", "quan_cu": "Quận 8", "phuong_moi": "Chánh Hưng"},
]
WARDS = [{"ten": "Bình Lợi Trung", "ten_day_du": "Phường Bình Lợi Trung"}, {"ten": "Gia Định", "ten_day_du": "Phường Gia Định"},
         {"ten": "Chợ Quán", "ten_day_du": "Phường Chợ Quán"}, {"ten": "Bình Đông", "ten_day_du": "Phường Bình Đông"},
         {"ten": "Chánh Hưng", "ten_day_du": "Phường Chánh Hưng"}]


def _doc(bang, ts):
    if bang == "phuong_cu":
        so = ts["ten"].removeprefix("eq.")
        return [d for d in PHUONG_CU if d["ten"] == so]
    if bang == "wards":
        ten = {t.strip('"') for t in ts["ten"].removeprefix("in.(").removesuffix(")").split(",")}
        return [w for w in WARDS if w["ten"] in ten]
    raise AssertionError(bang)


def test_so_phuong_cu_doc_hinh_thuc_chu():
    assert so_phuong_cu("phường 6") == so_phuong_cu("P.6") == so_phuong_cu("Phuong 6") == so_phuong_cu("p6") == so_phuong_cu("6") == 6
    assert so_phuong_cu("Hoàng Hoa Thám, phường 12, Bình Thạnh") == 12
    assert so_phuong_cu("Phường Gia Định") is None and so_phuong_cu("") is None and so_phuong_cu(None) is None
    assert so_phuong_cu("Q.5") is None                        # "Q.5" là quận, không phải phường


def test_phuong_cu_chia_can_quan_va_tu_hai_phuong_tro_len():
    assert phuong_cu_chia(_doc, 6, "Bình Thạnh") == ["Phường Bình Lợi Trung", "Phường Gia Định"]
    assert phuong_cu_chia(_doc, 6, "Quận Bình Thạnh") == ["Phường Bình Lợi Trung", "Phường Gia Định"]
    assert phuong_cu_chia(_doc, 6, "Quận 8") == ["Phường Bình Đông", "Phường Chánh Hưng"]
    assert phuong_cu_chia(_doc, 6, "Quận 5") == []             # chỉ về một phường mới → hệ thống tự ghi được, không hỏi
    assert phuong_cu_chia(_doc, 6, None) == []                 # thiếu quận: cùng "phường 6" có ở nhiều quận, không đoán
    assert phuong_cu_chia(None, 6, "Bình Thạnh") == [] and phuong_cu_chia(_doc, None, "Bình Thạnh") == []

    def hong(bang, ts):
        raise RuntimeError("mạng")
    assert phuong_cu_chia(hong, 6, "Bình Thạnh") == []         # lỗi mạng không làm hỏng lượt


def test_chon_phuong_da_goi_ten():
    uv = ["Phường Bình Lợi Trung", "Phường Gia Định"]
    assert chon_phuong_da_goi_ten(uv, "Gia Định") == chon_phuong_da_goi_ten(uv, "phường gia dinh") == "Phường Gia Định"
    assert chon_phuong_da_goi_ten(uv, "phường 6") is None                       # chưa chọn
    assert chon_phuong_da_goi_ten(uv, "Bình Lợi Trung hay Gia Định") is None    # nêu cả hai → không đoán


def _tra():
    return TraDiaDanh(lambda ten, payload: [], _doc, None)


def test_khoi_dia_danh_bao_phuong_cu_bi_chia_ngay_khi_khach_noi_phuong_so():
    k = khoi_dia_danh(_tra(), {"phuong": "phường 6", "quan": "Bình Thạnh", "duong": "Hoàng Hoa Thám"}, None)
    assert "Phường Bình Lợi Trung" in k and "Phường Gia Định" in k and "KHÔNG hỏi trống" in k
    assert "CHƯA biết nhà thuộc phường nào" in k
    # khách đã chọn phường mới / chưa nói quận / phường cũ chỉ về một phường mới → không có khối
    assert "phường CŨ đánh số" not in khoi_dia_danh(_tra(), {"phuong": "Gia Định", "quan": "Bình Thạnh"}, None)
    assert "phường CŨ đánh số" not in khoi_dia_danh(_tra(), {"phuong": "phường 6"}, None)
    assert "phường CŨ đánh số" not in khoi_dia_danh(_tra(), {"phuong": "phường 6", "quan": "Quận 5"}, None)
    # không có đường vẫn có khối (trước đó nhánh "không đường" chỉ trả dòng xã)
    assert "Phường Gia Định" in khoi_dia_danh(_tra(), {"phuong": "phường 6", "quan": "Bình Thạnh"}, None)


def _kho(chuan):
    kho = SupabaseConversationStore.__new__(SupabaseConversationStore)
    kho._chuan_dia_ban = lambda chu: chuan
    kho._du_an = lambda f: None
    kho._get = lambda ep: _doc(ep.split("?", 1)[0], dict(p.split("=", 1) for p in __import__("urllib.parse", fromlist=["x"]).unquote_plus(ep.split("?", 1)[1]).split("&")))
    return kho


def test_dia_ban_ghi_phuong_khi_khach_goi_ten_mot_phuong_moi_du_dia_chi_con_phuong_6():
    f = {"dia_chi": "Hoàng Hoa Thám, phường 6, Bình Thạnh", "phuong": "Gia Định", "quan": "Bình Thạnh"}
    phuong, quan, nguon = _kho((None, "Quận Bình Thạnh"))._dia_ban(f)      # DB trả mơ hồ vì địa chỉ còn "phường 6"
    assert (phuong, quan, nguon) == ("Phường Gia Định", "Quận Bình Thạnh", "chu_xac_nhan")
    # khách mới nói "phường 6": chưa chọn → không ghi
    f2 = {"dia_chi": "Hoàng Hoa Thám, phường 6, Bình Thạnh", "phuong": "phường 6", "quan": "Bình Thạnh"}
    assert _kho((None, "Quận Bình Thạnh"))._dia_ban(f2)[0] is None
    # DB đã tra ra phường thì giữ nguyên, không đụng
    assert _kho(("Phường Chợ Quán", "Quận 5"))._dia_ban({"phuong": "P.6", "quan": "Quận 5"})[0] == "Phường Chợ Quán"


# --- SRS-5.1zzzzzzz214 mục 8 (chủ dự án 27/10/2026: "khách không chọn thì lưu cả 2 luôn") — hỏi một lần, khách không chọn thì hệ thống ghi tạm
# cả các phường ứng viên, tin lên web, không báo admin; cột `ward` lấy phường đầu tra được (nguồn suy đoán).
def test_cong_web_khach_khong_chon_thi_ghi_tam_ca_hai_phuong():
    from tests.test_doc_y_khach import _eng
    eng, _ = _eng({"operations": []})
    eng._dia_danh = _tra()
    c = eng.conversation("ph2")
    c.prop.fields.update({"duong": "Hoàng Hoa Thám", "phuong": "phường 6", "quan": "Bình Thạnh", "dia_chi": "Hoàng Hoa Thám, phường 6, Bình Thạnh"})
    eng._convstore = type("K", (), {"trang_thai_tin": lambda self, conv: {"len_web": False, "thieu": ["phuong"]}, "save": lambda self, conv: None,
                                    "load": lambda self, k: None})()
    c.y_luot = {}
    web = eng._trang_thai_web(c)          # lượt 1: hỏi (kể hai phường)
    assert "phuong" in web["thieu"] and c.prop.fields["phuong"] == "phường 6" and c.lo["phuong"] == 1
    c.y_luot = {}
    web = eng._trang_thai_web(c)          # lượt 2: khách vẫn không chọn → ghi tạm cả hai
    assert c.prop.fields["phuong"] == "Phường Bình Lợi Trung / Phường Gia Định" and c.prop.fields["_phuong_he_thong"] == "1"
    assert "phuong" not in web["thieu"] and web["phuong_he_thong"] == ["Phường Bình Lợi Trung", "Phường Gia Định"]
    assert "can_nguoi_that" not in c.y_luot and "_phuong_bao_admin" not in c.prop.fields
    from aioi.prompts import khoi_trang_thai_web
    k = khoi_trang_thai_web({"len_web": False, "thieu": [], "phuong_he_thong": web["phuong_he_thong"]})
    assert "ghi tạm CẢ các phường Phường Bình Lợi Trung / Phường Gia Định" in k[0] and "KHÔNG hỏi phường nữa" in k[1]
    # kho đường / phường cũ không tra ra ứng viên → vẫn đường cũ: hỏi tới lần 3 rồi báo admin một lần
    eng._dia_danh = None
    c2 = eng.conversation("ph3")
    c2.prop.fields.update({"du_an": "Era Town Đức Khải", "quan": "Quận 7"})
    for _ in range(3):
        c2.y_luot = {}
        eng._trang_thai_web(c2)
    assert "nhờ admin tra" in c2.y_luot["can_nguoi_that"] and "phuong" not in c2.prop.fields


def test_dia_ban_cot_ward_lay_phuong_dau_tra_duoc_khi_o_ghi_ca_hai():
    f = {"dia_chi": "Hoàng Hoa Thám, phường 6, Bình Thạnh", "phuong": "Phường Bình Lợi Trung / Phường Gia Định", "quan": "Bình Thạnh"}
    kho = _kho((None, "Quận Bình Thạnh"))
    kho._chuan_dia_ban = lambda chu: (("Phường Gia Định", "Quận Bình Thạnh") if chu.startswith("Phường Gia Định") else (None, "Quận Bình Thạnh"))
    assert kho._dia_ban(f) == ("Phường Gia Định", "Quận Bình Thạnh", "suy_doan")   # phường đầu tra được; nguồn suy đoán
    kho._chuan_dia_ban = lambda chu: (("Phường Bình Lợi Trung", "Quận Bình Thạnh") if chu.startswith("Phường Bình Lợi Trung") else (None, "Quận Bình Thạnh"))
    assert kho._dia_ban(f)[0] == "Phường Bình Lợi Trung"
    # cách ghi mới chưa bắn: ba phường ứng viên, quận chưa có trong ô
    f3 = {"phuong": "Phường An Đông / Phường Chợ Quán / Phường An Đông"}
    kho._chuan_dia_ban = lambda chu: (("Phường Chợ Quán", "Quận 5") if chu.startswith("Phường Chợ Quán") else (None, None))
    assert kho._dia_ban(f3) == ("Phường Chợ Quán", "Quận 5", "suy_doan")
