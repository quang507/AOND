"""01/11/2026 (SRS-5.1zzzzzzz319, Đợt 8 — chủ dự án Q1: công tắc "vĩnh viễn"). Gỡ đường cũ của sáu công tắc AIOI_PHIEU_LUOT, AIOI_SOAT_GON,
AIOI_FORM_MUA_GON, AIOI_FORM_BAN_GON, AIOI_AGENT_MUA, AIOI_AGENT_BAN: đường mới là đường duy nhất, prompt cũ `build_chat_system` đã xoá.

Lớp lỗi canh ở đây: luật chỉ sống ở prompt cũ thì xoá prompt cũ là luật rơi (AU-13). Ba luật chuyển sang phiếu lượt — tin hệ thống trong ngoặc
vuông (`TIN_HE_THONG`), từ điển tiếng lóng (`SLANG_NOTES`), câu hỏi lại khi diện tích chưa rõ đất hay nhà (`_dien_tich_mo_ho`) — đỏ khi gỡ khỏi
`build_phieu_luot`. Thêm bài canh: không file nào trong src/aioi còn đọc sáu biến, không còn hàm của đường cũ."""
import glob
import os
import re

from aioi import agent_ban, agent_mua, engine, prompts
from aioi.llm.base import RANH_GIOI_CACHE
from aioi.prompts import NHAN_VIEC_LUOT, SLANG_NOTES, TIN_HE_THONG, build_phieu_luot
from aioi.schema import Property
from tests.cau_hinh_vps import TEP_CAU_HINH, cong_tac_vps
from tests.test_form_ban_gon_303 import BAN
from tests.test_form_mua_gon_293 import AiGhiForm
from tests.test_viec_mua import KhoGia

GOC = os.path.join(os.path.dirname(__file__), "..")
SAU_TEN = ("PHIEU_LUOT", "SOAT_GON", "FORM_MUA_GON", "FORM_BAN_GON", "AGENT_MUA", "AGENT_BAN")
_DOC_BIEN = re.compile(r"""["']AIOI_(?:%s)["']""" % "|".join(SAU_TEN))


def test_khong_file_nao_trong_loi_doc_sau_cong_tac():
    lot = []
    for t in glob.glob(os.path.join(GOC, "src", "aioi", "**", "*.py"), recursive=True):
        for i, d in enumerate(open(t, encoding="utf-8"), 1):
            if _DOC_BIEN.search(d):
                lot.append(f"{os.path.relpath(t, GOC)}:{i}")
    assert not lot, lot


def test_khong_con_ham_duong_cu():
    assert not hasattr(prompts, "build_chat_system")
    for ten in ("build_chat_system", "_phieu_luot", "_soat_gon"):
        assert not hasattr(engine, ten), ten
    assert not hasattr(engine.Engine, "_ly_do_cung")
    assert not hasattr(agent_mua, "bat") and not hasattr(agent_ban, "bat")
    assert all(len(dong) == 3 for dong in engine.LUAT_SOAT)   # (ten, nhom, fn) — không còn cột chế độ cũ


def test_cau_hinh_khong_con_ghi_sau_cong_tac():
    env = cong_tac_vps()
    assert not {f"AIOI_{t}" for t in SAU_TEN} & set(env)
    chu = open(TEP_CAU_HINH, encoding="utf-8").read()
    for t in SAU_TEN:
        assert not re.search(rf'(?m)^\s*AIOI_{t}=', chu), t   # không còn dòng gán giá trị


def test_phieu_luot_mang_tin_he_thong_va_tieng_long_o_phan_co_dinh():
    s = build_phieu_luot("Lan", Property(loai_hinh="nha_pho"), "gia")
    co_dinh = s.split(RANH_GIOI_CACHE, 1)[0]
    assert TIN_HE_THONG in co_dinh and SLANG_NOTES in co_dinh
    assert "[Tin nhắn thoại của khách]" in TIN_HE_THONG and "sticker" in TIN_HE_THONG and "TỪ ĐIỂN TIẾNG LÓNG" in SLANG_NOTES


def test_luot_nguoi_ban_that_mang_tin_he_thong():
    """Đường thật qua Engine.handle (khách không phải ID thử): system lượt viết lời có khối tin hệ thống + tiếng lóng."""
    ai = AiGhiForm(BAN)
    eng = engine.Engine(ai, conversation_store=KhoGia())
    eng.handle("chu-319", "Anh cần bán nhà mặt tiền đường Hoàng Hoa Thám")
    viet = [s for s in ai.system if f"{NHAN_VIEC_LUOT}:" in s]
    assert viet and all(TIN_HE_THONG in s and SLANG_NOTES in s for s in viet)


def test_dien_tich_mo_ho_hoi_lai_dat_hay_nha():
    p = Property(loai_hinh="nha_pho", fields={"duong": "Lê Lai", "gia": "9 tỷ", "dien_tich": "80m2"})
    for o in ("dien_tich_dat", "dien_tich_nha"):
        viec = build_phieu_luot("Lan", p, o).rsplit(f"{NHAN_VIEC_LUOT}:", 1)[1]
        assert "chưa rõ là diện tích ĐẤT hay diện tích NHÀ" in viec and "80m2" in viec and "đúng MỘT câu" in viec
    # cách nói mới: số khách đã chốt là đất ("80 m²") thì hết mơ hồ — hỏi ô còn lại bình thường
    p.update({"dien_tich_dat": "80 m²"})
    viec = build_phieu_luot("Lan", p, "dien_tich_nha").rsplit(f"{NHAN_VIEC_LUOT}:", 1)[1]
    assert "chưa rõ là diện tích ĐẤT" not in viec and "hỏi đúng MỘT ý" in viec
    # ô khác (không phải diện tích) thì không chen câu hỏi đất / nhà
    assert "chưa rõ là diện tích ĐẤT" not in build_phieu_luot("Lan", Property(loai_hinh="nha_pho", fields={"dien_tich": "80m2"}), "gia")
