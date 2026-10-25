"""SRS-5.1zzzzzzz179 (đối chiếu MOSO AI 25/10/2026, chủ dự án: "Làm 1 2 3 4 5 luôn đi, xong merg"). Mục 1 (rổ mẫu bị dọn) ở
tests/test_ro_mau_khong_bi_don.py. Ở đây: (2) tiện ích quanh căn vào `tim_nha` + "CHƯA RÕ" khi không có dữ liệu; (3) thuế phí nhân ra số theo
giá căn đang nói; (4) giá/m² + "chính chủ rao" trong dòng căn; (5) con số trong lời bot phải có trong dữ liệu căn / lời khách — lệch thì gọi lại
model một lần. Đỏ khi: `p_tien_ich` không gửi, căn không dữ liệu tiện ích mà không ghi "CHƯA RÕ", dòng căn mất giá/m², khối pháp lý không có số
theo căn, hoặc lời bot "36 m²" cho căn 60 m² mà lọt."""
import pathlib
import time

from aioi import phap_ly
from aioi.engine import Turn, _so_khong_co_trong_can
from aioi.mua import SITE_URL, danh_dau_lech, dong_can, gia_moi_m2, loai_tien_ich
from aioi.schema import BuyerLead
from tests.test_tim_nha import KhoGia as KhoTim, _lead, _tim
from tests.test_viec_mua import CAN, KHACH_MUA, AiGia, KhoGia, _engine

GOC = pathlib.Path(__file__).parents[1]


# ── (2) tiện ích ──────────────────────────────────────────────────────────────────────────────────────────────────────
def test_loai_tien_ich_tu_o_khach_noi():
    assert loai_tien_ich(BuyerLead(fields={"tien_ich_mong_muon": "gần trường học với bệnh viện"})) == ["truong_hoc", "benh_vien"]
    assert loai_tien_ich(BuyerLead(fields={"moi_truong_song": "yên tĩnh, gần chợ"})) == ["cho"]
    assert loai_tien_ich(BuyerLead(fields={"moi_truong_song": "yên tĩnh"})) == [] and loai_tien_ich(BuyerLead()) == []


def test_tim_nha_gui_p_tien_ich():
    kho = KhoTim()
    kho.can_phu_hop(_lead(fields={"tien_ich_mong_muon": "gần trường học"}))
    assert _tim(kho)[0][1]["p_tien_ich"] == ["truong_hoc"]
    kho2 = KhoTim()
    kho2.can_phu_hop(_lead())
    assert _tim(kho2)[0][1]["p_tien_ich"] is None


def test_can_khong_du_lieu_tien_ich_ghi_chua_ro():
    lead = BuyerLead(fields={"tien_ich_mong_muon": "gần trường"})
    chua = danh_dau_lech([dict(CAN)], lead)[0]
    assert chua["_chua_ro_tien_ich"] == ["trường học"] and "CHƯA RÕ có gần trường học" in dong_can(chua)
    co = danh_dau_lech([{**CAN, "tien_ich_gan": [{"loai": "truong_hoc", "ten": "THCS Hồng Bàng", "m": 400}]}], lead)[0]
    assert "_chua_ro_tien_ich" not in co
    xa = danh_dau_lech([{**CAN, "tien_ich_gan": [{"loai": "truong_hoc", "ten": "THCS Hồng Bàng", "m": 2500}]}], lead)[0]
    assert xa["_chua_ro_tien_ich"] == ["trường học"]                      # có dữ liệu nhưng > 1 km: vẫn không được nói "gần"


def test_migration_tim_nha_doi_chu_ky_va_cong_tien_ich():
    tep = sorted((GOC / "bot/supabase/migrations").glob("*_tim_nha_tien_ich*.sql"))
    sql = tep[-1].read_text(encoding="utf-8")
    assert "drop function if exists public.tim_nha(text, text, bigint, text, numeric, integer, boolean, double precision[], integer);" in sql
    assert "p_tien_ich text[] default null" in sql and "'tien_ich_gan', c.tien_ich_gan" in sql and "'chinh_chu'" in sql
    assert "<= 1000" in sql and "'gần ' || (t->>'ten')" in sql


# ── (4) giá/m² + chính chủ ────────────────────────────────────────────────────────────────────────────────────────────
def test_dong_can_gia_moi_m2_va_chinh_chu():
    assert gia_moi_m2(CAN) == "≈ 83,3 triệu/m²"
    assert gia_moi_m2({**CAN, "deal": "cho_thue"}) is None and gia_moi_m2({**CAN, "area_m2": None}) is None
    d = dong_can({**CAN, "chinh_chu": True})
    assert "≈ 83,3 triệu/m²" in d and "chính chủ rao" in d
    assert "chính chủ" not in dong_can({**CAN, "chinh_chu": False}) and "chính chủ" not in dong_can(CAN)


# ── (3) thuế phí theo căn ─────────────────────────────────────────────────────────────────────────────────────────────
def test_tinh_phi_theo_gia():
    assert phap_ly.tinh_phi(5_000_000_000) == {"tncn": 100_000_000, "truoc_ba": 25_000_000, "cong_chung": 3_200_000}
    assert phap_ly.phi_cong_chung(800_000_000) == 800_000 and phap_ly.phi_cong_chung(2_000_000_000) == 1_600_000
    assert phap_ly.tien(4_200_000) == "4,2 triệu" and phap_ly.tien(2_500_000_000) == "2,5 tỷ"
    assert phap_ly.khoi_phi_theo_can("dat_coc", 5_000_000_000) == "" and phap_ly.khoi_phi_theo_can("thue_tncn", None) == ""
    k = phap_ly.khoi_luot("thue_phi_sang_ten", gia_can=5_000_000_000, ma_can="ABCD1234")
    assert "SỐ TÍNH THEO CĂN (giá 5 tỷ của căn ABCD1234" in k and "100 triệu" in k and "25 triệu" in k and "tham khảo" in k
    assert "SỐ TÍNH THEO CĂN" not in phap_ly.khoi_luot("thue_phi_sang_ten")   # không biết giá → giữ câu tỷ lệ


def test_engine_phap_ly_nhan_so_theo_can_bot_vua_nhac():
    kho = KhoGia()
    eng, ai = _engine(kho, {**KHACH_MUA, "hoi_phap_ly": "thue_phi_sang_ten", "phap_ly_trich_dan": "thuế phí bao nhiêu"})
    conv = eng.conversation("mo-3")
    conv.history.append(Turn("assistant", f"Anh xem căn này nha {SITE_URL}/nha-dat/ABCD1234", time.time()))
    eng.handle("mo-3", "căn này mua thì thuế phí bao nhiêu em?")
    s = ai.system[-1]
    assert "SỐ TÍNH THEO CĂN (giá 5 tỷ của căn ABCD1234" in s and "100 triệu" in s


# ── (5) số trong lời bot ──────────────────────────────────────────────────────────────────────────────────────────────
def _conv(eng, key, *loi_khach):
    conv = eng.conversation(key)
    for l in loi_khach:
        conv.history.append(Turn("user", l, time.time()))
    return conv


def test_so_la_trong_loi_bot():
    eng, _ = _engine(KhoGia(), KHACH_MUA)
    conv = _conv(eng, "mo-5", "tìm nhà quận 5 tầm 7 tỷ")
    assert _so_khong_co_trong_can("Căn này 36 m² giá 5 tỷ anh nhé.", [CAN], conv) == ["36 m²"]
    assert _so_khong_co_trong_can("Căn 60 m², giá 5 tỷ, tầm 83 triệu/m², trong tầm 7 tỷ anh nói.", [CAN], conv) == []
    assert _so_khong_co_trong_can("Căn 60m2 có 3 phòng ngủ.", [CAN], conv) == ["3 phòng ngủ"]
    assert _so_khong_co_trong_can("Trước bạ 25 triệu ạ.", [CAN], conv, "… SỐ TÍNH THEO CĂN … ≈ 25 triệu …") == []
    assert _so_khong_co_trong_can("Xem lúc 3h chiều, mã ABCD1234 nhé.", [CAN], conv) == []       # không đơn vị → không soi
    assert _so_khong_co_trong_can("Căn này 36 m².", [], conv) == []


class AiSoSai(AiGia):
    def __init__(self, ke_hoach):
        super().__init__(ke_hoach)
        self.loi = ["Căn này 36 m² giá 5 tỷ anh nhé.", "Căn này 60 m² giá 5 tỷ anh nhé."]

    def chat(self, system, messages, max_tokens=256):
        self.system.append(system)
        return self.loi.pop(0) if self.loi else "Anh xem thêm nhé."


def test_engine_goi_lai_model_khi_so_khong_co_trong_can():
    from aioi.engine import Engine
    ai = AiSoSai(KHACH_MUA)
    eng = Engine(ai, conversation_store=KhoGia())
    kq = eng.handle("mo-6", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    assert "VIẾT LẠI LƯỢT NÀY" in ai.system[-1] and '"36 m²"' in ai.system[-1] and "60 m²" in kq.reply
