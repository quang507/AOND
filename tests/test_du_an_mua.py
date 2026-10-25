"""SRS-5.1zzzzzzz184 (chủ dự án 25/10/2026: "cho bot phía mua tra kho dự án đi"). Trước bản này kho `projects` (2.362 dự án) chỉ phía BÁN dùng;
khách MUA hỏi "dự án X có gì / của ai / pháp lý" thì model nói từ trí nhớ. Nay AI đọc `mua.hoi_du_an` (tên nằm nguyên trong tin khách), lõi tra
`tra_du_an` và đưa khối "DỰ ÁN TRONG KHO" cho model. Đỏ khi: bỏ nối `_viec_mua`, khối không có luật nói thật khi thiếu, số trong lời bot lệch khối
không bị soát, hoặc khối lộ link nguồn mogi."""
from aioi import du_an_mua
from tests.test_viec_mua import CAN, KHACH_MUA, KhoGia, _engine

NYAH = {"id": "p1", "name": "Ny'ah Phú Định", "developer": "Chủ đầu tư Ny'ah", "province": "Hồ Chí Minh", "district": "Quận 8", "ward": "Phường Phú Định",
        "location_raw": "58A Trương Đình Hội, Phường Phú Định", "legal_status": "Sổ hồng riêng", "handover_date": None, "handover": None,
        "status_text": "Đang mở bán", "price_min": 6_500_000_000, "price_max": 9_000_000_000,
        "amenities": ["Công viên nội khu", "Hồ bơi"], "unit_types": [{"name": "Cosmo"}, {"name": "Opus"}],
        "specs": {"tong_dien_tich": "8000 m2", "dien_tich_tu_m2": 60, "dien_tich_den_m2": 100, "nam_khoi_cong": None, "nam_hoan_thanh": None},
        "source_url": "https://mogi.vn/nyah-prj1"}
KT = "# Ny'ah Phú Định — kiến thức dự án\n- Cổng 1: 58A Trương Đình Hội.\n- ⚠ Tiến độ bàn giao chưa có."


class KhoDuAn(KhoGia):
    def __init__(self, ds=(), kien_thuc=KT, mot_phan=(), theo_id=()):
        super().__init__()
        self.ds, self.kien_thuc, self.mot_phan, self.theo_id = list(ds), kien_thuc, list(mot_phan), list(theo_id)

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "POST" and endpoint.startswith("rpc/match_projects"):
            self.goi.append((method, endpoint, data))
            return list(self.ds)
        return super()._request(method, endpoint, data, prefer)

    def _get(self, endpoint):
        if endpoint.startswith("projects?name=ilike."):   # khớp một phần tên (khi match_projects không ra dòng nào)
            self.goi.append(("GET", endpoint, None))
            return list(self.mot_phan)
        if endpoint.startswith("projects?id=in."):        # tra theo nghĩa: lấy dòng theo id vector trả
            self.goi.append(("GET", endpoint, None))
            ids = endpoint.split("in.(")[1].split(")")[0].split(",")
            return [x for x in self.theo_id if str(x["id"]) in ids]
        if endpoint.startswith("du_an_kien_thuc?ten=eq."):
            self.goi.append(("GET", endpoint, None))
            return [{"du_lieu": {"docs": [{"markdown": self.kien_thuc}]}}] if self.kien_thuc else []
        return super()._get(endpoint)


def test_khoi_dong_du_an_chi_ghi_o_co_du_lieu_va_khong_lo_link_nguon():
    dong = "\n".join(du_an_mua.dong_du_an(NYAH))
    assert "Chủ đầu tư: Chủ đầu tư Ny'ah" in dong and "Pháp lý: Sổ hồng riêng" in dong and "từ 6,5 tỷ đến 9 tỷ" in dong
    assert "Diện tích sản phẩm: 60–100 m²" in dong and "Loại căn: Cosmo; Opus" in dong and "Tiện ích: Công viên nội khu; Hồ bơi" in dong
    assert "mogi" not in dong and "Bàn giao" not in dong                       # ô trống không bịa; không đưa link nguồn
    assert du_an_mua._tien(578_000_000) == "578 triệu" and du_an_mua._tien(None) is None


def test_khoi_bon_che_do_va_luat_noi_that():
    ro = du_an_mua.khoi_du_an({"ten_khach": "Ny'ah Phú Định", "khop": "ro", "du_an": NYAH, "kien_thuc": KT})
    assert du_an_mua.TIEU_DE in ro and "⚠" in ro and "KHÔNG đoán, KHÔNG lấy từ trí nhớ" in ro and "THAM KHẢO" in ro
    gan = du_an_mua.khoi_du_an({"ten_khach": "nyah", "khop": "gan", "du_an": NYAH})
    assert 'nhắc TÊN ĐẦY ĐỦ "Ny\'ah Phú Định"' in gan
    nhieu = du_an_mua.khoi_du_an({"ten_khach": "vinhomes", "khop": "nhieu", "ung_vien": ["Vinhomes A", "Vinhomes B"]})
    assert "Vinhomes A; Vinhomes B" in nhieu and "CHƯA kể" in nhieu
    khong = du_an_mua.khoi_du_an({"ten_khach": "Zzz City", "khop": "khong"})
    assert "CHƯA có dự án tên này" in khong and "KHÔNG kể gì về dự án từ trí nhớ" in khong
    assert du_an_mua.khoi_du_an(None) == "" and du_an_mua.khoi_du_an({}) == ""


def test_tra_du_an_ro_gan_nhieu_khong_va_loi():
    assert KhoDuAn([NYAH]).tra_du_an("Nyah Phú Định")["khop"] == "ro"
    kq = KhoDuAn([NYAH]).tra_du_an("Phú Định")
    assert kq["khop"] == "gan" and kq["du_an"]["name"] == "Ny'ah Phú Định" and "⚠ Tiến độ" in kq["kien_thuc"]
    kq2 = KhoDuAn([NYAH, {**NYAH, "id": "p2", "name": "Phú Định Garden"}]).tra_du_an("Phú Định")
    assert kq2["khop"] == "nhieu" and kq2["ung_vien"] == ["Ny'ah Phú Định", "Phú Định Garden"] and "du_an" not in kq2
    assert KhoDuAn([]).tra_du_an("Zzz City")["khop"] == "khong" and KhoDuAn([]).tra_du_an("ab")["khop"] == "khong"
    # Gõ nửa tên ("Masteri"): match_projects không ra dòng nào → khớp một phần tên
    mot = KhoDuAn([], mot_phan=[{**NYAH, "id": "m1", "name": "Masteri Thảo Điền"}]).tra_du_an("Masteri")
    assert mot["khop"] == "gan" and mot["du_an"]["name"] == "Masteri Thảo Điền"
    nhieu = KhoDuAn([], mot_phan=[{**NYAH, "id": "m1", "name": "Masteri Thảo Điền"}, {**NYAH, "id": "m2", "name": "Masteri An Phú"}]).tra_du_an("Masteri")
    assert nhieu["khop"] == "nhieu" and nhieu["ung_vien"] == ["Masteri Thảo Điền", "Masteri An Phú"]

    class Hong(KhoDuAn):
        def _request(self, method, endpoint, data=None, prefer=None):
            if endpoint.startswith("rpc/match_projects"):
                raise RuntimeError("mạng")
            return super()._request(method, endpoint, data, prefer)
    assert Hong().tra_du_an("Ny'ah")["khop"] == "loi"


def test_khach_mua_hoi_du_an_thi_model_nhan_khoi_du_lieu(monkeypatch):
    kho = KhoDuAn([NYAH])
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"hoi_du_an": "Ny'ah Phú Định", "trich_dan": "Ny'ah Phú Định có gì"}})
    eng.handle("mua-da-1", "Cho anh hỏi dự án Ny'ah Phú Định có gì")
    khoi = [s for s in ai.system if du_an_mua.TIEU_DE in s]
    assert khoi and "Chủ đầu tư: Chủ đầu tư Ny'ah" in khoi[-1] and "⚠ Tiến độ bàn giao chưa có" in khoi[-1] and "mogi" not in khoi[-1]
    assert kho.ghi("POST", "rpc/match_projects")


def test_ten_du_an_ai_tu_suy_khong_co_trong_tin_khach_thi_khong_tra(monkeypatch):
    kho = KhoDuAn([NYAH])
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"hoi_du_an": "Vinhomes Grand Park", "trich_dan": "dự án này có gì"}})
    eng.handle("mua-da-2", "Dự án này có gì em")
    assert not kho.ghi("POST", "rpc/match_projects") and not any(du_an_mua.TIEU_DE in s for s in ai.system)


def test_khach_khong_hoi_du_an_thi_khong_co_khoi(monkeypatch):
    kho = KhoDuAn([NYAH])
    eng, ai = _engine(kho, KHACH_MUA)
    eng.handle("mua-da-3", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    assert not any(du_an_mua.TIEU_DE in s for s in ai.system) and not kho.ghi("POST", "rpc/match_projects")


def test_so_trong_loi_bot_lech_khoi_du_an_bi_soat_con_so_trong_khoi_thi_qua():
    from aioi.engine import _so_khong_co_trong_can
    from aioi.engine import Conversation
    khoi = du_an_mua.khoi_du_an({"ten_khach": "Ny'ah Phú Định", "khop": "ro", "du_an": NYAH, "kien_thuc": KT})
    conv = Conversation(user_key="x", assistant=None)
    assert _so_khong_co_trong_can("Giá từ 6,5 tỷ, diện tích 60–100 m².", [], conv, khoi) == []
    assert "2" not in "".join(ch for ch in khoi.split("CÁCH NÓI")[1] if ch.isdigit())          # lời dặn không chứa chữ số làm "số hợp lệ" giả
    la = _so_khong_co_trong_can("Giá từ 3 tỷ nha anh.", [], conv, khoi)
    assert la and "3 tỷ" in la[0]
    assert _so_khong_co_trong_can("Giá từ 3 tỷ nha anh.", [], conv, "") == []   # không có khối dự án và không có căn thì không soát


def test_chu_khong_ra_thi_tra_theo_nghia_va_khong_bao_gio_la_ro():
    """SRS-5.1zzzzzzz185: "khu căn hộ ven sông Thủ Thiêm" không có tên dự án nào trong chữ → hỏi vector `projects.nhung`; kết quả vector chỉ là
    "gan" / "nhieu" để khách xác nhận, kể cả khi tên trả về trùng hẳn tên khách gõ."""
    masteri = {**NYAH, "id": "m1", "name": "Masteri Thảo Điền"}
    an_phu = {**NYAH, "id": "m2", "name": "Masteri An Phú"}
    kho = KhoDuAn([], theo_id=[masteri, an_phu])
    mot = kho.tra_du_an("căn hộ ven sông Thảo Điền", theo_nghia=lambda t: [{"khoa": "m1", "ten": "Masteri Thảo Điền", "do_gan": 0.8}])
    assert mot["khop"] == "gan" and mot["du_an"]["name"] == "Masteri Thảo Điền"
    nhieu = KhoDuAn([], theo_id=[masteri, an_phu]).tra_du_an(
        "căn hộ gần Thảo Điền", theo_nghia=lambda t: [{"khoa": "m2", "ten": "Masteri An Phú", "do_gan": 0.79}, {"khoa": "m1", "ten": "Masteri Thảo Điền", "do_gan": 0.78}])
    assert nhieu["khop"] == "nhieu" and nhieu["ung_vien"] == ["Masteri An Phú", "Masteri Thảo Điền"]      # giữ thứ tự gần nhất trước
    tron = KhoDuAn([], theo_id=[masteri]).tra_du_an("Masteri Thảo Điền", theo_nghia=lambda t: [{"khoa": "m1", "ten": "Masteri Thảo Điền", "do_gan": 0.95}])
    assert tron["khop"] == "gan"                                                                       # vector không bao giờ là "ro"


def test_theo_nghia_khong_chay_khi_chu_da_ra_hoac_vector_hong_hoac_rong():
    goi = []
    kho = KhoDuAn([NYAH])
    assert kho.tra_du_an("Nyah Phú Định", theo_nghia=lambda t: goi.append(t) or [])["khop"] == "ro" and not goi    # chữ ra rồi: khỏi tốn Gemini

    def hong(t):
        raise RuntimeError("Gemini 429")
    assert KhoDuAn([]).tra_du_an("khu nhà phố ven sông", theo_nghia=hong)["khop"] == "khong"
    assert KhoDuAn([]).tra_du_an("khu nhà phố ven sông", theo_nghia=lambda t: [])["khop"] == "khong"


def test_du_an_theo_nghia_chi_giu_dong_dat_nguong_va_sat_dong_dau():
    from tests.test_dia_danh import _tra
    nghia = [{"loai": "du_an", "khoa": "a", "ten": "A", "do_gan": 0.80}, {"loai": "du_an", "khoa": "b", "ten": "B", "do_gan": 0.78},
             {"loai": "du_an", "khoa": "c", "ten": "C", "do_gan": 0.60}, {"loai": "duong", "khoa": "d", "ten": "D", "do_gan": 0.9}]
    t, goi = _tra(nghia=nghia)
    assert [d["ten"] for d in t.du_an_theo_nghia("khu ven sông")] == ["A", "B"] and "nhung" in goi     # C xa dòng đầu; loại khác bị bỏ
    t2, _ = _tra(nghia=[{"loai": "du_an", "khoa": "a", "ten": "A", "do_gan": 0.3}])
    assert t2.du_an_theo_nghia("khu ven sông") == [] and t2.du_an_theo_nghia("  ") == []
    t3, _ = _tra(nghia=nghia, nhung_loi=True)
    assert t3.du_an_theo_nghia("khu ven sông") == []


def test_engine_chuyen_ham_tra_theo_nghia_cua_dia_danh_vao_tra_du_an():
    """Đỏ khi `_viec_mua` không nối `TraDiaDanh.du_an_theo_nghia` vào `tra_du_an` (vector có sẵn mà không ai gọi — chủ dự án 25/10: "tưởng có sẵn rồi")."""
    from aioi.engine import Engine

    class DiaDanhGia:
        def du_an_theo_nghia(self, ten):
            return [{"khoa": "p1", "ten": "Ny'ah Phú Định", "do_gan": 0.8}]
    kho = KhoDuAn([], theo_id=[NYAH])
    base, ai = _engine(kho, {**KHACH_MUA, "mua": {"hoi_du_an": "khu nhà phố quận 8", "trich_dan": "khu nhà phố quận 8"}})
    eng = Engine(ai, conversation_store=kho, dia_danh=DiaDanhGia())
    eng.handle("mua-da-4", "Có khu nhà phố quận 8 nào không em")
    khoi = [s for s in ai.system if du_an_mua.TIEU_DE in s]
    assert khoi and 'nhắc TÊN ĐẦY ĐỦ "Ny\'ah Phú Định"' in khoi[-1]
