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
