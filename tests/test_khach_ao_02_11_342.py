"""Ca đỏ dựng từ năm câu bot dở nhất của lượt khách ảo 02/11/2026 (SRS-5.1zzzzzzz342) — phiên KIỂM ĐỘC LẬP, không sửa lõi.

Nguồn: `apply-migration.yml` ô `ban-thu-khach-ao` trên main, 5 persona do model đóng vai. Mỗi ca dưới đây trích NGUYÊN VĂN
câu bot đã nói với khách ảo rồi quy về chỗ sinh ra nó trong lõi, để lỗi không quay lại bằng cách nói khác.

CA CHỜ: `xfail(strict=True)`. Bản sửa gộp xong thì XOÁ dòng `xfail` (strict = XPASS cũng đỏ, đúng ý), KHÔNG xoá ca kiểm.
Số điện thoại / tên trong bài là hư cấu; persona khách ảo cũng là hư cấu.
"""
import pytest

from aioi.prompts import _TRE, build_listing_proposal_system, mo_dau_nhap
from aioi.schema import Property

# ---------------------------------------------------------------- ca 1: dòng mở bản nháp gọi khách lớn tuổi là "em"


def test_mo_dau_nhap_rieng_no_goi_dung_nguoi_lon_tuoi():
    """Lưới đỡ (đã xanh): gọi `mo_dau_nhap` với chính cách xưng của khách thì ra đúng chữ."""
    assert mo_dau_nhap("elder:cô", toi="cháu") == "📋 Cháu sẽ rao như vầy nhé cô:"
    assert mo_dau_nhap("elder:chú", toi="cháu") == "📋 Cháu sẽ rao như vầy nhé chú:"


def test_ca_1_ban_nhap_khong_goi_khach_lon_tuoi_la_em():
    """Khách ảo 1 (cô Sáu, 62 tuổi, xưng "cô", gọi bot "con"): cả cuộc chat bot gọi "cô" / xưng "cháu", nhưng dòng mở bản
    nháp ra NGUYÊN VĂN "📋 Cháu sẽ rao như vầy nhé em:" — xưng hô lẫn trong một câu, trái SRS-214.

    Chỗ sinh ra: `build_listing_proposal_system` ép `xh_tre = xung_ho if xung_ho in _TRE else "em"`; `_TRE` chỉ có
    ("em", "chau") nên "elder:cô" rơi xuống "em" và nhánh elder của `mo_dau_nhap` không bao giờ tới.
    """
    assert "elder:cô" not in _TRE                      # tiền đề của lỗi
    he = build_listing_proposal_system("Hoài", Property(), customer_is_em=True, xung_ho="elder:cô", toi="cháu")
    assert "nhé em:" not in he
    assert "nhé cô:" in he


def test_ca_1_cung_lop_cach_goi_khac_chu():
    """Cùng lớp, cách nói khác: khách xưng "chú" cũng phải được gọi "chú", không phải "em"."""
    he = build_listing_proposal_system("Hoài", Property(), customer_is_em=True, xung_ho="elder:chú", toi="cháu")
    assert "nhé em:" not in he
    assert "nhé chú:" in he


# ---------------------------------------------------------------- ca 2: bản tin bình luận giá không bị lõi soát

BAN_TIN_BINH_GIA = """📋 Em sẽ rao như vầy nhé anh chị:

🏡 Anh chị ơi, nhà 7 tầng hẻm 3m Nguyễn Chí Thanh quận 5, đất 65m², giá 22,5 tỷ

Giá chủ rao 22,5 tỷ mà còn thương lượng được nữa đó. Anh chị đến xem, nói chuyện thẳng thắn là có cửa
bớt lộc. Nhà phố 7 tầng giữa quận 5 mà giá còn mềm mỏng thế này, ai thấy hợp thì nên xem sớm kẻo lỡ nhịp.

Anh/chị muốn sửa chỗ nào, hay em đăng luôn ạ?"""

# Cách nói mới, chưa bắn ở đâu — cùng ý "giá dễ chịu" bằng chữ khác.
BAN_TIN_BINH_GIA_MOI = BAN_TIN_BINH_GIA.replace("giá còn mềm mỏng thế này", "tầm giá này là dễ chịu lắm rồi")


def test_luoi_binh_luan_gia_bat_duoc_cum_da_gap():
    """Lưới nhận dạng `_BINH_LUAN_GIA` BẮT ĐƯỢC cụm đã gặp ("giá còn mềm mỏng") — chỗ nhận dạng không phải là lỗi duy nhất."""
    from aioi.engine import _BINH_LUAN_GIA
    assert _BINH_LUAN_GIA.search(BAN_TIN_BINH_GIA)


class _AiSoatGia:
    """Model bóc tách giả cho lưới bình luận giá bản tin (SRS-5.1zzzzzzz336): trả `cum` cho sẵn, ghi lại đoạn được đưa đọc."""

    def __init__(self, cum):
        self.cum, self.doc = cum, []

    def extract(self, system, messages, json_schema):
        assert "cum" in json_schema["properties"]
        self.doc.append(messages[-1].content)
        return {"cum": list(self.cum)}


def _soat_gia(cum, ban_tin):
    from aioi.config import Settings
    from aioi.engine import Engine, _soat_binh_luan_gia
    from aioi.llm.mock import MockProvider
    eng = Engine(MockProvider(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")))
    ai = _AiSoatGia(cum)
    eng._provider = ai
    return _soat_binh_luan_gia(eng, eng.conversation("thu-soat-gia-342"), ban_tin, {}), ai


def test_ca_2b_cach_noi_moi_do_ai_doc_nghia_code_kiem_cum_trich():
    """Hai cách nói CÙNG Ý mà lưới từ khoá không thấy: "tầm giá này là dễ chịu lắm rồi", "có cửa bớt lộc".

    Lớp lỗi: lưới là danh sách từ khoá, nên đổi chữ là lọt — đúng điều CLAUDE.md §4.8 nói về lỗi "máy đoán ý bằng từ khoá".
    Bản ban đầu của ca này đòi `_BINH_LUAN_GIA` bắt hai cụm trên — chỉ đạt được bằng cách thêm từ vào regex, trái §4.8. Viết lại
    (SRS-5.1zzzzzzz336): AI đọc nghĩa bản tin, code chỉ kiểm cụm trích có NGUYÊN VĂN trong bản tin ("có cửa\nbớt lộc" xuống dòng vẫn nhận);
    cụm AI bịa (không có trong tin) bị bỏ.
    """
    ly_do, ai = _soat_gia(["tầm giá này là dễ chịu lắm rồi", "có cửa bớt lộc", "giá rẻ nhất khu"], BAN_TIN_BINH_GIA_MOI)
    assert ly_do and "tầm giá này là dễ chịu lắm rồi" in ly_do[0] and "có cửa bớt lộc" in ly_do[0]
    assert "giá rẻ nhất khu" not in ly_do[0]                      # cụm không có trong bản tin → không nhận
    assert "Nguyễn Chí Thanh" in ai.doc[0]                         # AI được đưa đúng bản tin để đọc
    assert _soat_gia(["giá rẻ nhất khu"], BAN_TIN_BINH_GIA_MOI)[0] == []   # chỉ có cụm bịa → không gọi lại model


def test_ca_2_ban_tin_binh_luan_gia_phai_bi_soat():
    """`nct_q5` lượt 3 (hai lượt chấm 02/11): bản tin nói "có cửa bớt lộc", "giá còn mềm mỏng thế này".

    Lớp lỗi: `engine._soat_binh_luan_gia` làm `None if _la_ban_tin(reply) else _binh_luan_gia(reply)` — bỏ qua MỌI lượt có
    bản tin, theo chú thích "bản tin có ý chung ('đắc địa') — chủ dự án: 'kệ'". Nhưng "giá còn mềm mỏng" là nhận xét về MỨC
    GIÁ, không phải ý chung về vị trí. Điều phối 02/11 chốt: bản tin cũng không được bình luận giá.

    Hệ quả phụ đã báo ở #261: vì lõi miễn trừ mà `cham.loi_pham` thì không, hai bên KHÔNG cùng một nguồn luật.
    Viết lại theo SRS-5.1zzzzzzz336: lượt bản tin đi qua lưới (AI đọc nghĩa), không còn miễn trừ.
    """
    for bt, cum in ((BAN_TIN_BINH_GIA, "giá còn mềm mỏng thế này"), (BAN_TIN_BINH_GIA_MOI, "tầm giá này là dễ chịu lắm rồi")):
        ly_do, ai = _soat_gia([cum], bt)
        assert ai.doc and ly_do and cum in ly_do[0]


def test_ca_2_ban_tin_khong_binh_gia_thi_khong_goi_lai():
    """Lưới đỡ: AI không thấy cụm nào → không lý do (bản tin chỉ nêu con số giá chủ đưa thì không bị gọi lại)."""
    assert _soat_gia([], BAN_TIN_BINH_GIA.split("\n\nGiá chủ rao")[0])[0] == []


# ---------------------------------------------------------------- ca 3: lộ từ vựng nội bộ "rổ" với khách

LOI_CO_RO = "Chúc mừng anh nha! Em chưa đổi gì trong rổ hết. Căn đã bán là căn mặt tiền Phạm Hùng hay căn hẻm Bùi Minh Trực vậy anh?"
LOI_CO_RO_MOI = "Dạ rổ hàng bên em đang có hai căn của anh, em giữ nguyên nha."   # cách nói mới, chưa bắn


def test_ca_3_khong_noi_chu_ro_voi_khach():
    """Lượt chấm `hai_can_da_ban` 02/11: "Em chưa đổi gì **trong rổ** hết." — prompt cấm hẳn chữ "rổ"
    (`mua.khoi_can_cho_khach`: "Không nói chữ \\"rổ\\""), nhưng không có lưới soát nào bắt, nên lời vẫn gửi khách.

    Ca này mong một lưới soát (như `goi_khach_la_minh`) chặn từ vựng nội bộ trước khi gửi: chữ "rổ" nói với khách.
    """
    from aioi.engine import _soat_hinh_thuc_tu_vung_noi_bo   # chưa có — ca chờ đúng nghĩa
    for loi in (LOI_CO_RO, LOI_CO_RO_MOI):
        assert _soat_hinh_thuc_tu_vung_noi_bo(loi)
