"""SRS-5.1zzzzzzz359 — chủ dự án 02/11: "tên phường mới, tên phường cũ được tự động chuyển thành phường mới bằng cách gắn lên bản đồ để biết
chứ không hỏi khách". Ca thật 01–02/11 (ẩn danh): (a) khách duyệt "Ok" → bot "Chỉ cần thêm phường là em đưa tin lên web ngay. Phường 6 cũ giờ
chia về Phường Bình Lợi Trung hoặc Phường Gia Định, nhà anh thuộc phường nào ạ?"; (b) "ừ đăng đi em" → bot "… em tra ra khu này là Xã Nhà
Bè, nhà anh thuộc xã này đúng không?". Đúng: tra ra MỘT → ghi luôn; không ra → không hỏi, báo người phụ trách. Số / tên / địa chỉ là giả."""
from aioi.dia_danh import TraDiaDanh
from aioi.prompts import khoi_trang_thai_web
from aioi.schema import Property
from tests.test_doc_y_khach import _eng

BINH_LONG = ["Phường Bình Hưng Hòa", "Phường Bình Trị Đông", "Phường Tân Sơn Nhì"]


def _tra(nomi=None, diem=None, duong=None, rpc_loi=False):
    duong = duong or {"bình long": BINH_LONG}

    def rpc(ten, p):
        if ten == "tra_nominatim":
            return nomi or []
        if ten == "phuong_tai_diem":
            assert set(p) == {"p_lat", "p_lng"}, p   # chữ ký RPC thật (bot/supabase/migrations/20261103b_ranh_gioi_phuong.sql)
            if rpc_loi:
                raise RuntimeError("PGRST202: function phuong_tai_diem not found")   # RPC chưa áp (SRS-360)
            return diem
        if ten == "tim_duong":
            k = p["p_ten"].lower()
            return [{"ten": p["p_ten"], "khoang_cach": 0, "phuong": duong[k]}] if k in duong else []
        if ten == "tim_dia_danh" and p["p_ten"].startswith(("Phường ", "Xã ")):
            return [{"loai": "phuong_moi", "ten": p["p_ten"], "phuong": p["p_ten"], "khoang_cach": 0}]
        return []
    return TraDiaDanh(rpc, lambda bang, ts: [])


def test_phuong_khong_bao_gio_la_cau_hoi_cho_khach():
    for loai, f in (("nha_pho", {"dia_chi": "45 Bình Long", "duong": "Bình Long", "gia": "5 tỷ"}),
                    ("dat_nen", {"dia_chi": "đường Lê Văn Lương", "duong": "Lê Văn Lương", "gia": "3 tỷ"}),
                    ("chung_cu", {"du_an": "Era Town", "gia": "2 tỷ"})):
        p = Property(loai_hinh=loai, fields=f)
        assert "phuong" not in p.missing_fields() and "phuong" not in p.blocking_fields(), loai


def test_toa_do_qua_rpc_phuong_tai_diem():
    nomi = [{"address": {"road": "Bình Long"}, "lat": "10.79", "lon": "106.61"}]   # chỉ mức đường — bước số nhà không nhận
    t = _tra(nomi, diem="Phường Bình Trị Đông")
    assert t.phuong_theo_so_nha("125 Bình Long", "Bình Long", "Quận Bình Tân") is None
    assert t.phuong_theo_toa_do("125 Bình Long", "Bình Long", "Quận Bình Tân") == "Phường Bình Trị Đông"
    assert _tra(nomi, diem="Phường Phú Thọ Hòa").phuong_theo_toa_do("125 Bình Long", "Bình Long") is None   # ngoài kho đường → bỏ
    assert _tra(nomi, rpc_loi=True).phuong_theo_toa_do("125 Bình Long", "Bình Long") is None              # RPC chưa có → bỏ qua


def test_engine_tra_theo_toa_do_roi_kho_duong_khong_hoi():
    eng, spy = _eng({"operations": []})
    nomi = [{"address": {"road": "Bình Long"}, "lat": "10.79", "lon": "106.61"}]
    eng._dia_danh = _tra(nomi, diem="Phường Bình Trị Đông")
    c = eng.conversation("thu-359a")
    c.prop.fields.update({"dia_chi": "125 Bình Long", "duong": "Bình Long", "quan": "Quận Bình Tân"})
    assert eng._phuong_tu_dia_chi(c, ["dia_chi"]) == ["phuong"] and c.prop.fields["phuong"] == "Phường Bình Trị Đông"
    assert c.prop.fields["_phuong_he_thong"] == "toa_do"
    # cách nói địa chỉ mới: chỉ tên đường, không số nhà — kho đường chỉ đi qua MỘT xã → ghi luôn, không hỏi xác nhận (ca thật b)
    eng._dia_danh = _tra(duong={"lê văn lương": ["Xã Nhà Bè"]}, rpc_loi=True)
    c2 = eng.conversation("thu-359b")
    c2.prop.fields.update({"dia_chi": "mặt tiền đường Lê Văn Lương", "duong": "Lê Văn Lương", "quan": "Huyện Nhà Bè"})
    assert eng._phuong_tu_dia_chi(c2, ["dia_chi"]) == ["phuong"] and c2.prop.fields["phuong"] == "Xã Nhà Bè"


def test_cong_web_mot_ung_vien_thi_ghi_luon_khong_ra_thi_bao_admin():
    eng, _ = _eng({"operations": []})
    eng._convstore = type("K", (), {"trang_thai_tin": lambda self, conv: {"len_web": False, "thieu": ["phuong"]}, "save": lambda self, c: None, "load": lambda self, k: None})()
    eng._dia_danh = _tra(duong={"lê văn lương": ["Xã Nhà Bè"]})
    c = eng.conversation("thu-359c")
    c.prop.fields.update({"duong": "Lê Văn Lương", "quan": "Huyện Nhà Bè"})
    c.y_luot = {}
    web = eng._trang_thai_web(c)                                            # ca thật (b): tra ra MỘT → ghi, không hỏi xác nhận
    assert c.prop.fields["phuong"] == "Xã Nhà Bè" and "phuong" not in web["thieu"] and "can_nguoi_that" not in c.y_luot
    eng._dia_danh = _tra(duong={"bình long": BINH_LONG})
    c2 = eng.conversation("thu-359d")
    c2.prop.fields.update({"duong": "Bình Long", "quan": "Quận Bình Tân"})
    c2.y_luot = {}
    web = eng._trang_thai_web(c2)                                           # ba phường ứng viên → không chọn bừa, báo người phụ trách
    assert "phuong" not in c2.prop.fields and web["phuong_bao_admin"] and "nhờ admin tra" in c2.y_luot["can_nguoi_that"]
    duyet = khoi_trang_thai_web(web)[0]                                     # ca thật (a): lượt duyệt không hỏi phường
    assert "thuộc phường nào" not in duyet and "thêm phường" not in duyet.lower() and "hỏi phường" not in duyet.lower()  # SRS-367: dòng cấm rải rác đã gỡ — bất biến chặn ở đầu ra (_soat_hoi_dung_o)
