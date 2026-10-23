"""SRS-5.1zzzzzzz153 (23/10/2026) — chủ dự án: "người ta vừa có nhu cầu mua, vừa bán vài căn thì sao… chốt lịch xem nhà rồi thì báo admin làm được chưa".
Ca gốc: chị N. (tester) từng thử vai bán, rồi nhận tin báo căn mới và chốt "thứ 7 / sáng / 9h" xem nhà. Bot nói "em chuyển lịch cho chủ nhà rồi,
lịch em đã giữ sẵn" nhưng DB không có lịch hẹn nào, số điện thoại không được lưu, không ai được báo; cuối cùng chị nhận nhầm tin nhắc xin ảnh của NGƯỜI BÁN.
Nguyên nhân: (1) vai dính phía bán mãi khi có dấu vết bán — việc của người mua chỉ chạy ở vai mua; (2) giờ hẹn khách nhắn rời từng tin, cụm AI ghép
không nằm nguyên trong tin cuối; (3) khách đáp lại căn bot VỪA báo mà không gõ mã; (4) lượt không ghi gì thì bot không bị dặn, tự hứa. Đỏ khi bỏ bất kỳ
phần nào của bản sửa."""
import threading
import time
from types import SimpleNamespace

from aioi.engine import Turn, _chu_co_trong_loi_khach
from aioi.mua import khoi_viec_vua_ghi
from tests.test_viec_mua import CAN, KHACH_MUA, KhoGia, _engine

TIN_BAO = (f"Chị ơi, em vừa có căn mới hợp nhu cầu của chị: nhà phố Trần Bình Trọng, Quận 5, 60m², giá 5 tỷ.\n"
           f"Xem hình và chi tiết ở đây ạ: https://aioinhadat.vercel.app/nha-dat/{CAN['code']}\nChị có muốn em sắp lịch xem thử không ạ?")


def _khach_tung_ban(eng, khach):
    """Khách có dấu vết bán trong phiên (địa chỉ căn từng rao) và vừa nhận tin báo căn mới."""
    conv = eng.conversation(khach)
    conv.prop.fields["dia_chi"] = "12 Lê Văn Sỹ"
    conv.role = "seller"
    conv.history.append(Turn("assistant", TIN_BAO, time.time()))
    return conv


def _hen_xem_roi_tung_tin(eng, khach):
    eng._provider.ke_hoach = {"operations": [], "user_intent": "buy", "mua": {"quan_tam": True, "trich_dan": "xem thu 7"}}
    eng.handle(khach, "mình xem thu 7 đc k?")
    eng.handle(khach, "sáng nhé")
    eng._provider.ke_hoach = {"operations": [], "user_intent": "buy",
                              "mua": {"hen_xem": "9h sáng thứ 7", "trich_dan": "9h sáng thứ 7"}}
    eng.handle(khach, "9h")


def test_khach_tung_ban_hen_xem_nha_roi_tung_tin_van_ghi_lich_va_dung_can_bot_vua_bao():
    kho = KhoGia()
    eng, ai = _engine(kho, KHACH_MUA)
    _khach_tung_ban(eng, "vm-1")
    _hen_xem_roi_tung_tin(eng, "vm-1")
    assert eng.conversation("vm-1").role == "buyer"                                        # vai theo ý định lượt này, không dính phía bán
    vw = kho.ghi("POST", "viewings")
    assert vw and vw[0]["listing_id"] == CAN["id"] and vw[0]["time_text"] == "9h sáng thứ 7"   # căn lấy từ link bot vừa báo, giờ ghép từ 3 tin
    assert "hẹn xem #ABCD1234" in ai.system[-1] and "9h sáng thứ 7" in ai.system[-1]
    assert eng.conversation("vm-1").prop.fields["dia_chi"] == "12 Lê Văn Sỹ"               # rổ / tin bán KHÔNG mất


def test_gio_hen_co_chu_khach_chua_noi_thi_khong_ghi():
    kho = KhoGia()
    eng, _ = _engine(kho, KHACH_MUA)
    _khach_tung_ban(eng, "vm-2")
    eng._provider.ke_hoach = {"operations": [], "user_intent": "buy", "mua": {"hen_xem": "9h sáng thứ 7 tại nhà", "trich_dan": "9h"}}
    eng.handle("vm-2", "9h")                                                               # "tại nhà" khách chưa hề nói → AI bịa, không ghi
    assert not kho.ghi("POST", "viewings")


def test_luot_mo_ho_o_lai_vai_mua_nhung_dang_cho_duyet_ban_nhap_thi_van_la_viec_ban():
    kho = KhoGia()
    eng, _ = _engine(kho, KHACH_MUA)
    conv = _khach_tung_ban(eng, "vm-3")
    eng._provider.ke_hoach = {"operations": [], "user_intent": "unknown"}
    eng.handle("vm-3", "ok")
    assert conv.role == "seller"                                                           # người bán + lượt mơ hồ: như cũ
    conv.listing_proposed = True                                                           # đang chờ khách duyệt bản nháp: câu nói thuộc việc bán
    eng._provider.ke_hoach = {"operations": [], "user_intent": "buy"}
    eng.handle("vm-3", "được rồi em")
    assert conv.role == "seller"
    conv.listing_proposed = False
    eng._provider.ke_hoach = {"operations": [], "user_intent": "buy"}
    eng.handle("vm-3", "mình cũng đang tìm mua một căn")
    assert conv.role == "buyer"
    eng._provider.ke_hoach = {"operations": [], "user_intent": "unknown"}
    eng.handle("vm-3", "ok")
    assert conv.role == "buyer"                                                            # lượt mơ hồ của người đang nói chuyện mua ở lại vai mua
    eng._provider.ke_hoach = {"operations": [], "user_intent": "sell"}
    eng.handle("vm-3", "mình còn căn nữa muốn bán")
    assert conv.role == "seller"                                                           # và sang bán khi khách nói chuyện bán — vừa mua vừa bán đều chạy


def test_luot_khong_ghi_gi_thi_model_duoc_dan_khong_hua_da_chuyen_da_giu_lich():
    kho = KhoGia()
    eng, ai = _engine(kho, KHACH_MUA)
    eng.handle("vm-4", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    assert "LƯỢT NÀY EM CHƯA GHI VIỆC GÌ" in ai.system[-1] and "KHÔNG nói đã chuyển" in ai.system[-1]
    assert khoi_viec_vua_ghi(["ghi khách quan tâm căn #X"]).startswith("\nEM VỪA GHI LƯỢT NÀY") and "CHƯA GHI" not in khoi_viec_vua_ghi(["x"])


def test_chu_co_trong_loi_khach():
    khach = ["mình xem thu 7 đc k?", "sáng nhé", "9h"]
    assert _chu_co_trong_loi_khach("9h sáng thứ 7", khach)
    assert not _chu_co_trong_loi_khach("9h sáng thứ 7 tại nhà", khach)                     # có chữ khách chưa nói
    assert not _chu_co_trong_loi_khach("", khach) and not _chu_co_trong_loi_khach("9h", [])


def test_tin_nhac_cua_nguoi_ban_khong_gui_cho_khach_dang_o_vai_mua(monkeypatch):
    import aioi.followup as F
    from aioi.assistants import assign_assistant
    from aioi.engine import Conversation
    guoi = []
    monkeypatch.setattr(F.urllib.request, "urlopen", lambda *a, **k: guoi.append(a) or SimpleNamespace(__enter__=lambda s: s, __exit__=lambda *x: None,
                                                                                                      status=200))

    def chay(role):
        conv = Conversation(user_key="vm-5", assistant=assign_assistant("vm-5"))
        conv.prop.loai_hinh = "nha_pho"
        conv.xung_ho = "chi"
        conv.role = role
        conv.history.append(Turn("user", "chị bán nhà", 0.0))
        eng = SimpleNamespace(conversation=lambda uk: conv, khoa_luot=lambda uk: threading.RLock(), _convstore=None)
        F.FollowUpManager()._execute_followup("vm-5", eng, None, "seller", hen=None)
        return conv
    assert chay("buyer").history[-1].role == "user" and not guoi                           # vai mua: không nhắc, không gọi bridge
    assert chay("seller").history[-1].role == "assistant" and guoi                         # đối chứng: người bán vẫn được nhắc như cũ
