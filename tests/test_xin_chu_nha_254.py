"""SRS-5.1zzzzzzz254 — chủ dự án 28/10/2026: "“báo lại sau”, “nhắn khi tin hiển thị”, “em xin chủ nhà ảnh” cái này cấu hình hệ thống để làm đi,
em xin chủ nhà ảnh, em xin chủ nhà về các chi tiết, các trường đang thiếu, cái này cần thiết". Đỏ khi: khách xin ảnh mà căn hết / chưa có ảnh
không nhờ chủ nhà; chủ nhà gửi ảnh mà câu "xin thêm ảnh" không thành đã trả lời; nhắc `len_web` gửi khi tin chưa hiển thị hoặc không gửi khi đã
hiển thị; bot hứa "tin hiển thị em nhắn" mà không có nhắc."""
import re
import urllib.parse
from datetime import timedelta

from aioi import gui_nhac
from aioi.mua import XIN_THEM_ANH
from aioi.prompts import build_fee_followup_system
from aioi.schema import Property
from tests.test_noi_loi_hua_27_10 import TRUA, _Kho, _nhac


class _KhoTin(_Kho):
    def __init__(self, nhac, trang_thai="dang_ban", **k):
        super().__init__(nhac, **k)
        self.trang_thai = trang_thai

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "GET" and endpoint.startswith("listings"):
            return [{"code": "AB12CD34", "status": self.trang_thai}]
        return super()._request(method, endpoint, data, prefer)


def _len_web(**k):
    return _nhac("len_web", buyer_id=None, seller_id="s1", created_at=(TRUA - timedelta(hours=1)).isoformat(), **k)


def test_len_web_chua_hien_thi_thi_cho_khong_gui():
    kho = _KhoTin([_len_web()], trang_thai="cho_thong_tin")
    gui = []
    gui_nhac.chay_mot_luot(kho, lambda z, t: gui.append(t) or True, bay_gio=TRUA)
    assert gui == [] and kho.nhac[0]["status"] == "pending" and kho.nhac[0].get("next_retry_at")   # hẹn xét lại, không đếm hụt
    assert int(kho.nhac[0].get("attempts") or 0) == 0


def test_len_web_da_hien_thi_thi_nhan_chu_nha_kem_link():
    kho = _KhoTin([_len_web()])
    gui = []
    gui_nhac.chay_mot_luot(kho, lambda z, t: gui.append((z, t)) or True, lambda z: ("chi", "M•ai"), bay_gio=TRUA)
    assert gui and gui[0][0] == "zl-luan" and "/nha-dat/AB12CD34" in gui[0][1] and "hiển thị" in gui[0][1]
    assert kho.nhac[0]["status"] == "sent"


def test_len_web_cho_qua_7_ngay_thi_dead():
    kho = _KhoTin([_nhac("len_web", buyer_id=None, seller_id="s1", created_at=(TRUA - timedelta(days=8)).isoformat())],
                  trang_thai="cho_thong_tin")
    gui_nhac.chay_mot_luot(kho, lambda z, t: True, bay_gio=TRUA)
    assert kho.nhac[0]["status"] == "dead"


def test_chu_nha_gui_them_anh_thi_bao_khach_kem_link():
    kho = _KhoTin([_nhac("followup")], ir=[{"question": XIN_THEM_ANH, "answer": "chủ nhà đã gửi thêm 3 ảnh"}])
    gui = []
    gui_nhac.chay_mot_luot(kho, lambda z, t: gui.append(t) or True, lambda z: ("anh", "M•ai"), bay_gio=TRUA)
    assert gui and "gửi thêm ảnh" in gui[0] and "/nha-dat/AB12CD34" in gui[0] and XIN_THEM_ANH not in gui[0]


class _KhoChuNha(_Kho):
    """Chủ nhà zl-luan có tin AB12CD34; một câu "xin thêm ảnh" đang chờ."""
    def __init__(self, cho=True):
        super().__init__([])
        self.cho = cho
        self.ghi = []

    def _request(self, method, endpoint, data=None, prefer=None):
        bang = endpoint.split("?")[0]
        q = urllib.parse.unquote(endpoint.split("?", 1)[1]) if "?" in endpoint else ""
        if method == "GET" and bang == "sellers":
            return [{"id": "s1"}] if "zl-luan" in q else []
        if method == "GET" and bang == "listings":
            return [{"id": "l1"}] if "code=eq.AB12CD34" in q else []
        if method == "GET" and bang == "info_requests":
            return [{"id": "ir1"}] if self.cho and f"question=eq.{XIN_THEM_ANH}" in q else []
        if method == "GET" and bang == "reminders":
            return []
        if method in ("PATCH", "POST"):
            self.ghi.append((method, bang, q, data))
            return None
        raise AssertionError(f"không ngờ: {method} {endpoint}")


def test_chu_nha_gui_anh_thi_cau_xin_anh_thanh_da_tra_loi():
    kho = _KhoChuNha()
    assert kho.tra_loi_xin_anh("zl-luan", "AB12CD34", 3) == 1
    m, bang, q, data = kho.ghi[0]
    assert (m, bang) == ("PATCH", "info_requests") and "id=eq.ir1" in q and data["status"] == "answered" and "3 ảnh" in data["answer"]
    assert _KhoChuNha(cho=False).tra_loi_xin_anh("zl-luan", "AB12CD34", 3) == 0      # không ai xin → không đụng gì
    assert kho.tra_loi_xin_anh("zl-luan", "AB12CD34", 0) == 0                        # gửi 0 ảnh → không trả lời


def test_hen_bao_len_web_ghi_mot_nhac():
    from aioi.engine import Conversation, Listing
    from aioi.assistants import assign_assistant
    li = Listing()
    li.listing_id = "ab12cd34-0000-0000-0000-000000000000"
    conv = Conversation(user_key="zl-luan", assistant=assign_assistant("zl-luan"), listings=[li], active_listing_id=li.listing_id)
    kho = _KhoChuNha()
    assert kho.hen_bao_len_web(conv) is True
    post = [g for g in kho.ghi if g[0] == "POST"]
    assert post and post[0][1] == "reminders" and post[0][3]["kind"] == "len_web" and post[0][3]["listing_id"] == "l1"


def test_bot_chi_hua_nhan_khi_co_hen():
    p = Property()
    co = build_fee_followup_system("T•ai", p, web={"len_web": False, "hen_bao_len_web": True}, duyet="dong_y")
    khong = build_fee_followup_system("T•ai", p, web={"len_web": False}, duyet="dong_y")
    assert "tin hiển thị em nhắn ngay" in co and "tin hiển thị em nhắn" not in khong


def test_anh_chu_nha_vao_dung_can_theo_ngu_canh():
    """SRS-5.1zzzzzzz258 (chủ dự án 28/10: "chủ nhà có nhiều căn mà gửi ảnh lúc bot đang nói về căn khác … xét trong cả ngữ cảnh mấy câu
    đó"): ảnh vào căn khách mua vừa xin ảnh; chủ nhà vừa gọi tên căn khác thì theo lời chủ nhà; không có gì chỉ tới thì giữ căn đang nói."""
    import time
    from types import SimpleNamespace
    from aioi.assistants import assign_assistant
    from aioi.engine import Conversation, Engine, Listing, Turn
    from aioi.schema import Property
    from tests.test_viec_mua import AiGia
    a = Listing(listing_id="aaaaaaaa" + "0" * 24, prop=Property(loai_hinh="nha_pho", fields={"dia_chi": "12 Trần Bình Trọng"}))
    b = Listing(listing_id="bbbbbbbb" + "0" * 24, prop=Property(loai_hinh="nha_pho", fields={"dia_chi": "5 An Dương Vương"}))

    def conv_moi(loi=None):
        c = Conversation(user_key="zl-chu", assistant=assign_assistant("zl-chu"), listings=[a, b], active_listing_id=a.listing_id)
        if loi:
            c.history.append(Turn("user", loi, time.time()))
        return c
    e = Engine(AiGia({"operations": []}))
    e._convstore = SimpleNamespace(can_cho_anh=lambda uk: ["BBBBBBBB"])
    c = conv_moi()
    e._chon_can_nhan_anh(c)
    assert c.active_listing_id == b.listing_id                          # căn khách vừa xin ảnh
    c = conv_moi("ảnh căn 12 Trần Bình Trọng nè em")
    e._chon_can_nhan_anh(c)
    assert c.active_listing_id == a.listing_id                          # chủ nhà gọi tên căn → theo lời chủ nhà
    e._convstore = SimpleNamespace(can_cho_anh=lambda uk: [])
    c = conv_moi()
    e._chon_can_nhan_anh(c)
    assert c.active_listing_id == a.listing_id                          # không gì chỉ tới → giữ căn đang nói
