"""21/10/2026 (SRS-5.1zzzzzzz92). Chat tester 20/10: loại BĐS lật phòng trọ ↔ nhà phố giữa các lượt (lượt 3 bot hỏi "đất hay sàn" —
câu chỉ nhà phố có; tin cuối là phòng trọ) → bộ ô hỏi đổi, bộ đếm "lờ 2 lần" đếm sai, câu gác lửng / WC hỏi 3 lần. Nay loại đã chốt
chỉ đổi khi cụm bằng chứng nằm trong tin khách vừa nhắn. Đỏ khi bỏ cổng."""
from aioi.engine import Engine, Turn


def _conv(loai="phong_tro"):
    eng = Engine.__new__(Engine)
    from aioi.assistants import assign_assistant
    from aioi.engine import Conversation
    conv = Conversation(user_key="lk", assistant=assign_assistant("lk"))
    conv.prop.loai_hinh = loai
    return eng, conv


def test_loai_da_chot_khong_doi_khi_khong_co_bang_chung_o_tin_vua_nhan():
    eng, conv = _conv()
    conv.history.append(Turn("user", "1 trệt 1 lầu 2pn, 3wc", 0.0))
    conv.loi_khach_luot = "1 trệt 1 lầu 2pn, 3wc"
    assert Engine._gia_tri_ghi(conv, "loai_hinh", "nha_pho", {}) is None
    assert Engine._gia_tri_ghi(conv, "loai_hinh", "nha_pho", {"loai_hinh": "cho thuê nguyên căn"}) is None   # cụm không có ở tin


def test_khach_noi_ro_loai_moi_thi_doi_va_lan_dau_ghi_thang():
    eng, conv = _conv()
    conv.history.append(Turn("user", "à không, chị cho thuê nguyên căn nha em", 0.0))
    assert Engine._gia_tri_ghi(conv, "loai_hinh", "nha_pho", {"loai_hinh": "cho thuê nguyên căn"}) == "nha_pho"
    eng2, conv2 = _conv(loai=None)
    assert Engine._gia_tri_ghi(conv2, "loai_hinh", "phong_tro", {}) == "phong_tro"
    assert Engine._gia_tri_ghi(conv, "loai_hinh", "phong_tro", {}) == "phong_tro"   # trùng loại cũ: không phải đổi
