"""SRS-5.1zzzzzzz220 — chat chủ nhà Cao Lỗ 27/10 (tin AD21244D): "sao lại chị ạ liên tục, nó lấy dc phường không, sao không thấy trên tin ko thấy
trên biểu đồ". Bốn gốc: (1) bot mời vào `aioinhadat.com` (chưa trỏ về web) dù tin đang bán trên `aioinhadat.vercel.app` và có trên bản đồ; (2) câu
mẫu duyệt tin nói lại mỗi lần khách "ok"; (3) "… chị ạ" cuối câu bốn lượt liền; (4) cột `ward` tra đúng Phường Chánh Hưng nhưng model chỉ thấy ô
"Phường 2" nên bản tin in tên cũ. Mỗi bài đỏ khi tắt bản sửa tương ứng."""
from aioi import cau_mau
from aioi.dia_danh import TraDiaDanh, khoi_dia_danh
from aioi.engine import Engine, Turn, _goi_a
from aioi.prompts import build_fee_followup_system, khoi_trang_thai_web
from aioi.schema import Property
from aioi.web import SITE_HOST, SITE_URL, link_tin


class _Spy:
    def __init__(self, loi=()):
        self.loi, self.systems = list(loi), []

    def extract(self, *a, **k):
        return {"operations": []}

    def reply(self, system, messages, **k):
        self.systems.append(system)
        return self.loi.pop(0) if self.loi else "Vâng."

    chat = reply


# ---------- (1) link web một nguồn ----------

def test_khong_con_ten_mien_viet_tay_trong_loi_bot():
    import pathlib
    for f in ("prompts.py", "engine.py", "cau_mau.py"):
        dong = [d for d in (pathlib.Path(__file__).parents[1] / "src/aioi" / f).read_text().splitlines() if not d.lstrip().startswith("#")]
        assert not [d for d in dong if "aioinhadat.com" in d and "#" not in d.split("aioinhadat.com")[0]], f   # chú thích lịch sử được
    assert SITE_HOST in cau_mau.cau("hoi_phi") and "aioinhadat.com" not in cau_mau.cau("hoi_phi")


def test_khach_duyet_thi_gui_link_trang_tin_cua_khach():
    duyet, hoi_link = khoi_trang_thai_web({"len_web": True, "ma": "AD21244D"})
    assert f"{SITE_URL}/nha-dat/AD21244D" in hoi_link
    s = build_fee_followup_system("M•ai", Property(loai_hinh="nha_pho"), web={"len_web": True, "ma": "AD21244D"})
    assert link_tin("AD21244D") in s and "aioinhadat.com" not in s


# ---------- (2) báo đăng tin MỘT lần ----------

def test_da_bao_dang_thi_khong_noi_lai_cau_duyet():
    lan_dau, _ = khoi_trang_thai_web({"len_web": True, "ma": "X"})
    assert cau_mau.cau("duyet_tin") in lan_dau
    lan_sau, _ = khoi_trang_thai_web({"len_web": True, "ma": "X", "da_bao_dang": True})
    assert cau_mau.cau("duyet_tin") not in lan_sau and "KHÔNG nói lại câu xin phép đăng tin" in lan_sau


def test_engine_nho_da_bao_dang_va_ban_tin_moi_thi_bao_lai():
    class Kho:
        def trang_thai_tin(self, conv):
            return {"len_web": True, "thieu": [], "ma": "AD21244D", "cho_duyet": False}

        def save(self, conv):
            pass

    eng = Engine(_Spy(loi=["Cảm ơn chị!", "Dạ vâng."]))
    c = eng.conversation("k-220")
    eng._convstore = Kho()
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update({"duong": "Cao Lỗ", "gia": "10 tỷ", "dien_tich_dat": "64m2"})
    c.listing_proposed = True
    c.duyet_luot = "dong_y"
    c.prop.fields["_da_bao_dang"] = "1"
    w = eng._trang_thai_web(c)
    assert w and w["ma"] == "AD21244D"
    # dấu bị gỡ khi có bản tin mới (lượt duyệt sau được báo lại)
    c.prop.fields.pop("_da_bao_dang", None)
    assert "_da_bao_dang" not in c.prop.fields


# ---------- (3) "chị ạ" lặp ----------

def test_tieng_goi_a_hai_luot_lien_thi_goi_lai():
    assert _goi_a("Nhà 4x16m ngay Parc Mall, ngang rộng dễ xoay xe, chị ạ!") and _goi_a("rộng rãi quá anh ạ.")
    assert not _goi_a("Dạ được ạ.") and not _goi_a("Nhà chị ở đâu?")
    spy = _Spy(loi=["Diện tích sử dụng 120m² là rộng rãi lắm, hợp gia đình đông người. Nhà mấy lầu, mấy phòng ngủ?"])
    eng = Engine(spy)
    c = eng.conversation("k-220b")
    c.prop.loai_hinh = "nha_pho"
    c.history.append(Turn("assistant", "Nhà 64m² ngay Parc Mall rất thuận lợi cho chị ạ! Giá mong muốn bao nhiêu?", 0.0))
    c.history.append(Turn("user", "dtsd 120m", 0.0))
    eng._soat_hinh_thuc(c, "SYS", "Diện tích sử dụng 120m² nhà mình rộng rãi quá chị ạ, rất hợp gia đình đông người.")
    assert len(spy.systems) == 1 and "tiếng gọi" in spy.systems[0]


def test_mot_luot_co_chi_a_khong_bi_goi_lai():   # cách nói mới: lượt trước không có
    spy = _Spy()
    eng = Engine(spy)
    c = eng.conversation("k-220c")
    c.prop.loai_hinh = "nha_pho"
    c.history.append(Turn("assistant", "Ngon rồi, 4x16 vuông vức. Nhà mình xây mấy lầu?", 0.0))
    c.history.append(Turn("user", "3 lầu", 0.0))
    loi = "3 lầu là đủ chỗ cho cả nhà đó chị ạ. Mấy phòng ngủ vậy?"
    assert eng._soat_hinh_thuc(c, "SYS", loi) == loi and not spy.systems


# ---------- (4) phường cũ → phường mới ----------

PHUONG_CU = [{"ten": "Phường 2", "quan_cu": "Quận 8", "phuong_moi": "Chánh Hưng"},
             {"ten": "Phường 6", "quan_cu": "Quận 8", "phuong_moi": "Bình Đông"},
             {"ten": "Phường 6", "quan_cu": "Quận 8", "phuong_moi": "Chánh Hưng"}]
WARDS = [{"ten": "Chánh Hưng", "ten_day_du": "Phường Chánh Hưng"}, {"ten": "Bình Đông", "ten_day_du": "Phường Bình Đông"}]


def _doc(bang, ts):
    if bang == "phuong_cu":
        return [d for d in PHUONG_CU if d["ten"] == ts["ten"].removeprefix("eq.")]
    if bang == "wards":
        ten = {t.strip('"') for t in ts["ten"].removeprefix("in.(").removesuffix(")").split(",")}
        return [w for w in WARDS if w["ten"] in ten]
    raise AssertionError(bang)


def _tra():
    return TraDiaDanh(rpc=lambda *a: [], doc=_doc)


def test_phuong_cu_mot_phuong_moi():
    t = _tra()
    assert t.phuong_cu_moi("phường 2", "quận 8") == "Phường Chánh Hưng"
    assert t.phuong_cu_moi("Phường 6", "Quận 8") is None            # bị chia → khối "chia" lo, không đoán
    assert t.phuong_cu_chia("Phường 6", "Quận 8") == ["Phường Bình Đông", "Phường Chánh Hưng"]
    k = khoi_dia_danh(t, {"phuong": "Phường 2", "quan": "Quận 8"}, None)
    assert "Phường Chánh Hưng" in k and "tên TRƯỚC sáp nhập" in k and "MỘT lần" in k


def test_ban_tin_in_phuong_cu_khi_da_biet_phuong_moi_thi_goi_lai():
    spy = _Spy(loi=["📋 Bản tin cập nhật:\n\nNhà mặt tiền Cao Lỗ, Phường Chánh Hưng (Phường 2 cũ), 10 tỷ\n\nMô tả\n\nNhắn Zalo nha!"])
    eng = Engine(spy)
    eng._dia_danh = _tra()
    c = eng.conversation("k-220d")
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update({"duong": "Cao Lỗ", "phuong": "Phường 2", "quan": "Quận 8", "gia": "10 tỷ", "mat_tien": "4m"})
    c.history.append(Turn("user", "phường 2 quận 8 nha", 0.0))
    eng._soat_hinh_thuc(c, "SYS", "📋 Bản tin cập nhật:\n\nNhà mặt tiền Cao Lỗ, Phường 2 Quận 8, 10 tỷ\n\nMô tả\n\nNhắn Zalo nha!")
    assert len(spy.systems) == 1 and "Phường Chánh Hưng" in spy.systems[0]
