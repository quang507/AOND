"""20/10/2026 (SRS-5.1zzzzzzz86). Bắn thử KB1: nhà phân lô Nguyễn Chí Thanh, Đống Đa, Hà Nội — bot hỏi phường ba lượt, soạn tin, tin
nằm trên DB không bao giờ lên web. Chủ dự án: chỉ nhận TP.HCM, Long An, Tây Ninh, Bình Dương, Đồng Nai, Vũng Tàu. AI đọc tỉnh / thành
(code kiểm cụm địa danh có trong lời khách) → bot nói khéo chưa nhận, không hỏi tiếp, không soạn tin, kho ẩn / không tạo tin, tin nhắc
bỏ qua. Cùng bản: khoá nội bộ "_" (cờ hệ thống, `_cap_nhat` của DB) không lọt vào phần ĐÃ BIẾT của model / bộ đọc thông số."""
from types import SimpleNamespace

from aioi import prompts
from aioi.prompts import VUNG_NHAN_TIN, describe_captured
from aioi.schema import Property
from tests.test_doc_y_khach import _eng
from tests.test_supabase_store_luu_tin import StoreGia, _ghi_tin


def _plan_ha_noi():
    return {"operations": [], "ngoai_vung": "Hà Nội", "ngoai_vung_trich_dan": "quận Đống Đa, Hà Nội"}


def test_khach_noi_ro_tinh_ngoai_vung_thi_noi_kheo_khong_hoi_tiep():
    eng, spy = _eng(_plan_ha_noi())
    eng.handle("nv1", "nhà ở quận Đống Đa, Hà Nội em")
    he = spy.systems[-1]
    assert "NGOÀI KHU VỰC NHẬN TIN (Hà Nội)" in he and VUNG_NHAN_TIN in he
    assert "Thông tin cần hỏi tiếp theo" not in he                     # không hỏi ô thiếu
    conv = eng.conversation("nv1")
    assert conv.prop.fields["_ngoai_vung"] == "Hà Nội"
    spy.plan = {"operations": []}                                       # lượt sau AI không nhắc lại → cờ vẫn theo căn
    eng.handle("nv1", "ok em đăng đi")
    assert "NGOÀI KHU VỰC NHẬN TIN" in spy.systems[-1]


def test_trich_dan_khong_co_trong_loi_khach_thi_khong_gan_ngoai_vung():
    eng, spy = _eng(_plan_ha_noi())
    eng.handle("nv2", "bán nhà đường Nguyễn Chí Thanh 65m2")          # không có chữ Hà Nội / Đống Đa
    assert "_ngoai_vung" not in eng.conversation("nv2").prop.fields
    assert "NGOÀI KHU VỰC" not in spy.systems[-1]


def test_kho_an_tin_da_co_va_khong_tao_tin_moi_ngoai_vung():
    f = {"gia": "22,5 tỷ", "duong": "Nguyễn Chí Thanh", "_ngoai_vung": "Hà Nội"}
    li = SimpleNamespace(prop=Property(loai_hinh="nha_pho", fields=f), listing_id="abcdef123456", listing_proposed=False)
    st = StoreGia(co_san=True)
    st.save(SimpleNamespace(user_key="zalo-thu-1", listings=[li]))
    [(m, _, d)] = _ghi_tin(st)
    assert m == "PATCH" and d["status"] == "an"
    st = StoreGia(co_san=False)
    st.save(SimpleNamespace(user_key="zalo-thu-1", listings=[li]))
    assert _ghi_tin(st) == []


def test_tin_nhac_bo_qua_can_ngoai_vung():
    import threading
    from aioi.assistants import assign_assistant
    from aioi.engine import Conversation
    from aioi.followup import FollowUpManager
    conv = Conversation(user_key="nv3", assistant=assign_assistant("nv3"))
    conv.prop.fields.update({"duong": "Nguyễn Chí Thanh", "_ngoai_vung": "Hà Nội"})
    eng = SimpleNamespace(conversation=lambda uk: conv, khoa_luot=lambda uk: threading.RLock(), _convstore=None)
    FollowUpManager()._execute_followup("nv3", eng, None, "seller", hen=None)
    assert conv.history == []


def test_vung_nhan_tin_mot_nguon():
    assert VUNG_NHAN_TIN in prompts.OPERATIONS_SYSTEM
    assert "Bình Phước cũ" in prompts.OPERATIONS_SYSTEM


def test_khoa_noi_bo_khong_vao_phan_da_biet_va_bo_doc_thong_so():
    p = Property(loai_hinh="nha_pho", fields={"gia": "5 tỷ", "_cap_nhat": "x", "_ngoai_vung": "Hà Nội"})
    assert "_cap_nhat" not in describe_captured(p) and "_ngoai_vung" not in describe_captured(p)
    assert p.fields_khach() == {"gia": "5 tỷ"}
    st = StoreGia(co_san=False)
    st._thong_so({"kich_thuoc": "4x15", "_ngoai_vung": "Hà Nội"}, "nha_pho")
    chu = [d for m, e, d in st.goi if e == "rpc/boc_thong_so"][0]["p_text"]
    assert "Hà Nội" not in chu and "4x15" in chu
