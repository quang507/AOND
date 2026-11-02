"""02/11/2026 (SRS-5.1zzzzzzz320, audit Đợt 3, chủ dự án: KHÔNG dùng từ khoá trên lời khách để quyết ý, kể cả làm lưới đỡ).

Lớp lỗi: lưới bản tin và cổng vai lấy bằng chứng bằng từ khoá trên lời khách — không hiểu phủ định ("không phải chính chủ", "chưa có sổ hồng",
"không phải mặt tiền", "xa chợ") và khớp nhầm chữ ("cho em hỏi" → "chợ", "thị trường" → "trường", "mời" → "mới"). Nay AI đọc theo NGHĨA ra
trạng thái + cụm trích (prompts.SU_THAT_CAN / TIEN_ICH_GAN, seller_role), lưới bản tin (`_khang_dinh_khong_co_du_lieu`) chỉ đối chiếu các ô đó + vai.
Mọi bài chạy qua `Engine.handle`; bài đỏ khi gỡ bản sửa (trả lưới cũ đọc lời khách / `_VAI_RE`)."""
from __future__ import annotations

from aioi.engine import Engine
from aioi.revenue import SellerRole
from tests.gia import KhongCongCu

TIN = ("📋 Em sẽ rao như vầy nhé anh chị:\n\nChính chủ bán nhà mặt tiền Lê Lai, sổ hồng riêng, gần chợ, nhà mới, giá 7 tỷ\n\n"
       "Nhà mặt tiền đường Lê Lai, sổ hồng riêng, gần chợ, gần trường học, nhà mới xây.\n\n- 7 tỷ\n\nAnh/chị muốn sửa chỗ nào, hay em đăng luôn ạ?")
SACH = "Dạ vâng, em ghi rồi. Nhà mình giá bao nhiêu vậy anh?"


class _AI(KhongCongCu):
    """AI giả: lượt lập thao tác trả `ke_hoach` (hoặc ném lỗi khi `hong`); lời trả lời lấy lần lượt từ hàng đợi. Ghi mọi system."""

    def __init__(self, ke_hoach: dict | None, loi: list[str], hong: bool = False):
        self.ke_hoach, self.loi, self.hong, self.systems = ke_hoach or {}, list(loi), hong, []

    def extract(self, system, messages, json_schema=None, **k):
        if self.hong:   # AI hỏng: trả rác (giá trị ngoài danh sách, thiếu cụm trích) — không được thành sự thật
            return {"user_intent": "sell", "operations": [], "seller_role": "chu_nha", "phap_ly_trang_thai": "co so roi",
                    "duong_vao": "MT", "tien_ich_gan": "cho", "tinh_trang_nha": None}
        return {"user_intent": "sell", "operations": [], **self.ke_hoach}

    def chat(self, system, messages, **k):
        self.systems.append(system)
        return self.loi.pop(0) if self.loi else SACH

    reply = chat


def _luot(cau: str, ke: dict | None = None, hong: bool = False, truoc: dict | None = None) -> tuple[Engine, _AI, str]:
    ai = _AI(ke, [TIN, SACH], hong=hong)
    eng = Engine(ai)
    if truoc:
        eng.conversation("kd-320").prop.fields.update(truoc)
    r = eng.handle("kd-320", cau)
    viet_lai = next((s for s in ai.systems if "VIẾT LẠI LƯỢT NÀY" in s), "")
    return eng, ai, viet_lai


def _bat(viet_lai: str) -> set[str]:
    ra = {x for x in ("chính chủ", "sổ hồng", "mặt tiền", "gần chợ", "nhà mới") if f"\"{x}\"" in viet_lai.lower()}
    return ra | ({"trường học"} if "\"gần trường\"" in viet_lai.lower() or "\"trường học\"" in viet_lai.lower() else set())


def test_khong_phai_chinh_chu_van_bi_bat():
    eng, _, vl = _luot("tôi không phải là chính chủ đâu em, nhà anh trai tôi",
                       {"seller_role": "nguoi_nha_nho_ban", "seller_role_trich_dan": "tôi không phải là chính chủ"})
    assert "chính chủ" in _bat(vl) and eng.conversation("kd-320").user_type is not SellerRole.CHU_NHA


def test_nguoi_nha_dang_gium_khong_chinh_chu_va_ha_vai_da_nhan():
    eng = Engine(_AI({"seller_role": "chu_nha", "seller_role_trich_dan": "nhà của chị"}, [SACH]))
    eng.handle("kd-nn", "nhà của chị ở Lê Lai")
    assert eng.conversation("kd-nn").user_type is SellerRole.CHU_NHA
    ai = _AI({"seller_role": "nguoi_nha_nho_ban", "seller_role_trich_dan": "nhà của chị gái em, em đăng giùm"}, [TIN, SACH])
    eng._provider = ai
    eng.handle("kd-nn", "à nhầm, nhà của chị gái em, em đăng giùm thôi")
    assert eng.conversation("kd-nn").user_type is SellerRole.UNKNOWN
    assert "chính chủ" in _bat(next(s for s in ai.systems if "VIẾT LẠI LƯỢT NÀY" in s))


def test_chua_co_so_dang_lam_giay_tay_thi_so_hong_bi_bat():
    for cau, tt in (("chưa có sổ hồng đâu em", "chua_co"), ("sổ đang làm em ơi", "dang_lam"), ("giấy tay thôi em", "giay_tay"),
                    ("sổ chưa ra em", "chua_co")):   # cách nói phủ định mới
        _, _, vl = _luot(cau, {"phap_ly_trang_thai": tt, "phap_ly_trang_thai_trich_dan": cau.split(" em")[0]})
        assert "sổ hồng" in _bat(vl), cau


def test_khong_phai_mat_tien_thi_mat_tien_bi_bat():
    for cau in ("không phải mặt tiền, hẻm 3m", "nhà không nằm mặt đường đâu, trong hẻm"):   # cách nói thứ hai chưa bắn
        _, _, vl = _luot(cau, {"duong_vao": "hem", "duong_vao_trich_dan": cau})
        assert "mặt tiền" in _bat(vl), cau


def test_khong_phai_hem_xe_hoi_thi_hxh_bi_bat():
    ai = _AI({"duong_vao": "hem", "duong_vao_trich_dan": "không phải hẻm xe hơi đâu"},
             [TIN.replace("mặt tiền", "hẻm xe hơi"), SACH])
    Engine(ai).handle("kd-hxh", "không phải hẻm xe hơi đâu, xe máy thôi")   # phủ định mới
    vl = next(s for s in ai.systems if "VIẾT LẠI LƯỢT NÀY" in s)
    assert "\"hẻm xe hơi\"" in vl.lower()


def test_chu_trung_tieng_khong_mo_cua_cho_tien_ich_tinh_trang():
    for cau, mong in (("cho em hỏi phí bao nhiêu", "gần chợ"), ("giá thị trường khu này sao em", "trường học"), ("mời anh qua xem nhà", "nhà mới")):
        _, _, vl = _luot(cau)
        assert mong in _bat(vl), cau


def test_xa_cho_thi_gan_cho_bi_bat():
    for cau in ("xa chợ chút nhưng yên tĩnh", "chợ thì cách cũng xa"):   # cách nói thứ hai chưa bắn
        _, _, vl = _luot(cau, {"tien_ich_gan": [], "tien_ich_gan_trich_dan": cau})
        assert "gần chợ" in _bat(vl), cau


def test_chu_nha_noi_du_thi_khong_bat_nham():
    cau = "tôi chủ nhà, sổ hồng riêng, mặt tiền, gần chợ Bến Thành, gần trường học, nhà mới xây"
    _, ai, vl = _luot(cau, {"seller_role": "chu_nha", "seller_role_trich_dan": "tôi chủ nhà",
                            "phap_ly_trang_thai": "co_so", "phap_ly_trang_thai_trich_dan": "sổ hồng riêng",
                            "duong_vao": "mat_tien", "duong_vao_trich_dan": "mặt tiền",
                            "tien_ich_gan": ["cho", "truong_hoc"], "tien_ich_gan_trich_dan": "gần chợ Bến Thành, gần trường học",
                            "tinh_trang_nha": "moi_xay", "tinh_trang_nha_trich_dan": "nhà mới xây"})
    assert _bat(vl) == set()   # (lưới khác — số không có trong dữ liệu — có thể kích; không phải lưới khẳng định)


def test_cum_trich_khong_co_trong_loi_khach_thi_khong_nhan():
    _, _, vl = _luot("nhà ở Lê Lai em", {"phap_ly_trang_thai": "co_so", "phap_ly_trang_thai_trich_dan": "sổ hồng riêng",
                                          "seller_role": "chu_nha", "seller_role_trich_dan": "chính chủ"})
    assert {"sổ hồng", "chính chủ"} <= _bat(vl)


def test_ai_hong_thi_ban_tin_khong_khang_dinh_gi():
    eng, _, vl = _luot("tôi chủ nhà, sổ hồng riêng, mặt tiền, gần chợ", hong=True)
    assert not any(k.startswith(("_phap_ly_trang_thai", "_duong_vao", "_tien_ich_gan", "_tinh_trang_nha")) for k in eng.conversation("kd-320").prop.fields)
    assert _bat(vl) == {"chính chủ", "sổ hồng", "mặt tiền", "gần chợ", "trường học", "nhà mới"}


def test_khoi_su_that_vao_luot_viet_ban_tin():
    from aioi.prompts import khoi_su_that_can
    k = khoi_su_that_can({"_phap_ly_trang_thai": "dang_lam"}, False)
    assert "KHÔNG ghi Chính chủ" in k and "sổ ĐANG LÀM" in k and "KHÔNG ghi mặt tiền / hẻm / HXH" in k
