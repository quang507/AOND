"""02/11/2026 (SRS-5.1zzzzzzz325, audit Đợt 4 — một quyết định một nơi; chủ dự án chốt Q4, Q5 cùng ngày).

Lớp lỗi: nhiều nơi cùng quyết một đầu ra, không có thứ tự — ≥ 7 khối tự nhận "câu hỏi DUY NHẤT" cùng bật (AU-09), duyệt bản nháp ghi đè ở bốn
chỗ (AU-10), hai lệnh ngược nhau phía mua (AU-04), lượt bản nháp gọi lại tới 3 lần (AU-14), cổng cụm nguyên văn chặn việc bot tự giao (Q5).
Mọi bài chạy qua `Engine.handle` (trừ bài đọc prompt); mỗi bài đỏ khi gỡ bản sửa tương ứng."""
from __future__ import annotations

from aioi.engine import Engine
from tests.gia import KhongCongCu

LOI = "Dạ vâng, em ghi rồi. Nhà mình giá bao nhiêu vậy anh?"


class _AI(KhongCongCu):
    """AI giả: lượt lập thao tác trả `ke` (đổi được giữa các lượt); lời trả lời cố định. Ghi mọi system và số lần gọi viết lời."""

    def __init__(self, ke: dict, loi: str = LOI):
        self.ke, self.loi, self.systems = ke, loi, []

    def extract(self, system, messages, json_schema=None, **k):
        return {"user_intent": "sell", "operations": [], **self.ke}

    def chat(self, system, messages, **k):
        self.systems.append(system)
        return self.loi

    reply = chat


class _Kho:
    """Kho tối thiểu có tra dự án gợi ý theo đường (SRS-181)."""

    def __init__(self, du_an: str | None = None):
        self.du_an = du_an

    def load(self, k): return None
    def reset(self, k): pass
    def save(self, conv): pass
    def du_an_goi_y(self, f): return {"name": self.du_an} if self.du_an else None


MT = {"operations": [{"op": "update", "fields": {"mat_tien": "5m"}, "bang_chung": {"mat_tien": "mặt tiền 5m"}}]}
CO_SAN = {"loai": "nha_pho", "dia_chi": "146 Lê Lai", "duong": "Lê Lai", "quan": "Quận 1", "gia": "10 tỷ"}


def _eng(ke: dict, kho: _Kho | None = None, truoc: dict | None = None) -> tuple[Engine, _AI]:
    ai = _AI(ke)
    eng = Engine(ai)
    if kho is not None:
        eng._convstore = kho
    conv = eng.conversation("d4")
    truoc = CO_SAN if truoc is None else truoc
    if truoc.get("loai"):
        conv.prop.loai_hinh = truoc["loai"]
    conv.prop.fields.update({k: v for k, v in truoc.items() if k != "loai"})
    return eng, ai


# --- AU-09: hai khối hỏi cùng kích → system chỉ còn một ------------------------------------------------------------------------------------
def test_hai_khoi_hoi_cung_kich_chi_con_mot():
    eng, ai = _eng(MT)
    eng.handle("d4", "nhà mặt tiền 5m em nha")
    s = ai.systems[-1]
    assert "BỀ NGANG HAY ĐƯỜNG" in s                                   # việc thắng: xác nhận mặt tiền (Q4 a)
    viec = s.split("VIỆC LƯỢT NÀY:")[-1]
    assert "hỏi đúng MỘT ý" not in s and '"BỀ NGANG HAY ĐƯỜNG"' in viec   # câu hỏi ô kế bị gỡ; dòng việc GỌI TÊN khối thắng
    assert "không nhắc điểm tin" in viec                               # cham Đợt 4 lần 1: câu chung → model đọc "Tin đang 73/100"
    y = eng.conversation("d4").y_luot
    assert y["_viec"]["ten"] == "xac_nhan_mat_tien" and "hoi_o" not in y["_khoi"]


def test_ba_khoi_hoi_du_an_thang_mat_tien_doi_luot_sau():
    eng, ai = _eng(MT, _Kho("Saigon Royal"))
    eng.handle("d4", "nhà mặt tiền 5m em nha")
    s = ai.systems[-1]
    assert "DỰ ÁN GỢI Ý" in s and "BỀ NGANG HAY ĐƯỜNG" not in s and "hỏi đúng MỘT ý" not in s
    # Q4: mỗi câu xác nhận tối đa MỘT lần mỗi căn — câu bị gỡ được hỏi ở lượt sau, rồi thôi
    eng.handle("d4", "mặt tiền 5m đó em")
    assert "BỀ NGANG HAY ĐƯỜNG" in ai.systems[-1] and "DỰ ÁN GỢI Ý" not in ai.systems[-1]
    eng.handle("d4", "ừ mặt tiền 5m")
    assert "BỀ NGANG HAY ĐƯỜNG" not in ai.systems[-1] and "DỰ ÁN GỢI Ý" not in ai.systems[-1]


def test_khoi_uu_tien_thang_thi_cau_xac_nhan_mat_tien_doi_luot_sau():
    eng, ai = _eng({**MT, "can_nguoi_that": "khách muốn nói chuyện với người thật"})
    eng.handle("d4", "mặt tiền 5m, mà cho anh gặp nhân viên được không")
    assert "BỀ NGANG HAY ĐƯỜNG" not in ai.systems[-1] and not eng.conversation("d4").prop.fields.get("_mt_da_hoi")
    eng._provider.ke = MT
    eng.handle("d4", "mặt tiền 5m nha em")
    assert "BỀ NGANG HAY ĐƯỜNG" in ai.systems[-1]


def test_dien_tich_dat_hay_nha_hoi_mot_lan():
    """Q4 (d): con số diện tích chưa rõ đất hay nhà — hỏi lại một lần; khách lờ đi thì lượt sau hỏi ô bình thường, không hỏi lại đất hay nhà."""
    truoc = {**CO_SAN, "dien_tich": "60m2", "phuong": "Bến Thành", "phap_ly_hoan_cong": "đã hoàn công", "tinh_trang_ban_giao": "đang ở"}
    truoc.pop("gia")
    eng, ai = _eng({}, truoc=truoc)
    eng.conversation("d4").prop.hoan.add("gia")                         # giá để sau → ô kế là diện tích đất, chưa đủ để soạn bản nháp
    eng.handle("d4", "nhà 60m2 em")
    assert "đất hay nhà" in ai.systems[-1]
    eng.handle("d4", "ok em")
    assert "đất hay nhà" not in ai.systems[-1]


def test_so_lech_kho_du_an_chi_hoi_mot_lan_trong_huong_dan_agent():
    """Q4 (c): lệch kho dự án (SRS-105) là lời dặn trong vòng agent dự án — hỏi lại MỘT lần, khách giữ số thì theo khách."""
    from aioi.engine import _AGENT_TOOL_GUIDE
    assert "được hỏi lại MỘT lần cho chắc" in _AGENT_TOOL_GUIDE and "THEO LỜI KHÁCH" in _AGENT_TOOL_GUIDE


# --- AU-10: duyệt bản nháp một nơi -----------------------------------------------------------------------------------------------------------
NHAP = ("📋 Em sẽ rao như vầy nhé anh:\n\nBán nhà Lê Lai, 10 tỷ\n\nNhà đẹp.\n\n- 10 tỷ\n\n📲 Nhắn Zalo cho em.\n\nAnh muốn sửa chỗ nào, hay em đăng luôn ạ?")


def _nhap(ke: dict) -> tuple[Engine, _AI]:
    from aioi.engine import Turn
    eng, ai = _eng(ke)
    conv = eng.conversation("d4")
    conv.listing_proposed = True
    conv.history.append(Turn("assistant", NHAP, 1.0))
    return eng, ai


def test_khong_dong_y_kem_xin_dang_khong_thanh_dong_y():
    for cau in ("chưa ưng đâu em, sửa lại rồi hẵng đăng", "khoan, viết lại đi rồi đăng sau"):   # AI tóm ý từ chối, cụm không nằm nguyên văn
        eng, _ = _nhap({"duyet_ban_nhap": "khong_dong_y", "duyet_trich_dan": "khách chưa đồng ý bản nháp", "xin_dang": "đăng"})
        eng.handle("d4", cau)
        assert eng.conversation("d4").duyet_luot != "dong_y", cau


def test_xin_dang_lan_hai_khong_duyet_lai_ban_da_duyet():
    eng, _ = _nhap({"xin_dang": "đăng đi"})
    eng.handle("d4", "ok đăng đi em")
    conv = eng.conversation("d4")
    assert conv.duyet_luot == "dong_y" and conv.prop.fields.get("_duyet_ban")
    eng.handle("d4", "đăng đi em ơi")                                  # bản nháp đó đã duyệt — lời bảo đăng lần hai không duyệt lại
    assert conv.duyet_luot is None


# --- AU-04: phía mua không còn hai lệnh ngược nhau -----------------------------------------------------------------------------------------
def test_prompt_mua_khong_con_hai_lenh_nguoc():
    from aioi.agent_mua import HUONG_DAN
    from aioi.mua import khoi_can_cho_khach, khoi_viec_vua_ghi
    can = [{"code": "ABCD1234", "loai": "nha_pho", "dia_chi": "Lê Lai", "gia": "5 tỷ"}]
    p = khoi_can_cho_khach(can) + khoi_viec_vua_ghi([]) + HUONG_DAN
    assert not ("hỏi khách có muốn em hỏi chủ" in p and "KHÔNG hỏi lại khách" in p)
    trong = khoi_can_cho_khach([]) + khoi_viec_vua_ghi([])
    assert "nói sẽ báo khi có căn" not in trong and "em nhắn liền" in trong and "dữ kiện tự nhắn khi có căn mới" in trong


# --- AU-14: lượt bản nháp tối đa MỘT lần gọi lại -------------------------------------------------------------------------------------------
def test_luot_ban_nhap_toi_da_mot_lan_goi_lai():
    eng, ai = _eng({})
    ai.loi = "Nhà đẹp quá anh ơi. Anh muốn bán nhanh không? Nhà mấy phòng ngủ vậy anh?"   # không phải bản tin + hai câu hỏi → hai lưới cùng kích
    conv = eng.conversation("d4")
    conv.prop.fields.update({"dien_tich_dat": "60m2", "dien_tich_nha": "120m2", "ket_cau": "1 trệt 2 lầu", "phuong": "Bến Thành",
                             "phap_ly": "sổ hồng", "tinh_trang_ban_giao": "đang ở"})
    eng.handle("d4", "em soạn tin giúp anh")
    assert len(ai.systems) <= 2                                       # một lần viết + tối đa MỘT lần gọi lại
    assert conv.listing_proposed is False                              # bản tin không ra → lượt sau trình lại


# --- Q5: năm việc bot tự giao nhận theo ý AI đọc, không đòi nguyên văn -------------------------------------------------------------------
def test_viec_tu_giao_nhan_theo_y_ai_doc():
    ca = {
        "xin_xem_ban_ve": ("khách xin mặt bằng căn", ("có cái hình bố trí phòng ốc không em", "cho anh coi sơ đồ bên trong với")),
        "cau_hoi_du_an": ("hỏi tiện ích dự án", ("khu đó có hồ bơi chung không em", "bên đó bàn giao thô hay full vậy")),
        "mo_ta_du_an": ("tả dự án", ("khu này toàn nhà 1 trệt 2 lầu, có công viên giữa", "dự án này chủ đầu tư làm đường 12m hết")),
        "xong_viec_mua": ("khách đã đủ thông tin", ("thôi được rồi em, anh nắm rồi", "vậy là rõ rồi, để anh tính")),
    }
    for khoa, (y, cau_noi) in ca.items():
        for cau in cau_noi:
            eng, _ = _eng({khoa: y})
            eng.handle("d4", cau)
            assert eng.conversation("d4").y_luot.get(khoa) is True, (khoa, cau)
    for cau in ("nhà em mấy bữa nay cúp điện hoài, báo ai vậy", "cho chị hỏi phí rác tháng này đóng ở đâu"):
        eng, _ = _eng({"hoi_ngoai_viec": "hỏi việc điện / rác của khu", "user_intent": "unknown"}, truoc={})
        eng.handle("d4", cau)
        assert eng.conversation("d4").so_luot_ngoai_viec == 1, cau
