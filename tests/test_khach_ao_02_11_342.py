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


@pytest.mark.xfail(strict=True, reason="ca chờ — khách ảo 02/11 (SRS-342 ca 1): khách xưng \"cô\" mà dòng mở bản nháp gọi "
                                       "khách là \"em\". Sửa xong thì XOÁ dòng này")
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


@pytest.mark.xfail(strict=True, reason="ca chờ — cùng lớp lỗi ca 1, cách gọi khác (\"chú\"). Sửa xong thì XOÁ dòng này")
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


@pytest.mark.xfail(strict=True, reason="ca chờ — lưới từ khoá `_BINH_LUAN_GIA` bỏ lọt cách nói mới (SRS-342). Sửa xong thì XOÁ dòng này")
def test_ca_2b_luoi_binh_luan_gia_bo_lot_cach_noi_moi():
    """Hai cách nói CÙNG Ý mà lưới từ khoá không thấy: "tầm giá này là dễ chịu lắm rồi", "có cửa bớt lộc".

    Lớp lỗi: lưới là danh sách từ khoá, nên đổi chữ là lọt — đúng điều CLAUDE.md §4.8 nói về lỗi "máy đoán ý bằng từ khoá".
    Bản sửa nên để AI đọc nghĩa quyết (như `hoi_ve`), từ khoá chỉ làm lưới đỡ.
    """
    from aioi.engine import _BINH_LUAN_GIA
    assert _BINH_LUAN_GIA.search("tầm giá này là dễ chịu lắm rồi")
    assert _BINH_LUAN_GIA.search("có cửa bớt lộc")


@pytest.mark.xfail(strict=True, reason="ca chờ — quyết định điều phối 02/11 (SRS-342): bản tin KHÔNG được bình luận giá. Lõi "
                                       "đang miễn trừ mọi lượt có bản tin (`_la_ban_tin`). Sửa xong thì XOÁ dòng này")
def test_ca_2_ban_tin_binh_luan_gia_phai_bi_soat():
    """`nct_q5` lượt 3 (hai lượt chấm 02/11): bản tin nói "có cửa bớt lộc", "giá còn mềm mỏng thế này".

    Lớp lỗi: `engine._soat_binh_luan_gia` làm `None if _la_ban_tin(reply) else _binh_luan_gia(reply)` — bỏ qua MỌI lượt có
    bản tin, theo chú thích "bản tin có ý chung ('đắc địa') — chủ dự án: 'kệ'". Nhưng "giá còn mềm mỏng" là nhận xét về MỨC
    GIÁ, không phải ý chung về vị trí. Điều phối 02/11 chốt: bản tin cũng không được bình luận giá.

    Hệ quả phụ đã báo ở #261: vì lõi miễn trừ mà `cham.loi_pham` thì không, hai bên KHÔNG cùng một nguồn luật.
    """
    from aioi.engine import _binh_luan_gia, _la_ban_tin
    for bt in (BAN_TIN_BINH_GIA, BAN_TIN_BINH_GIA_MOI):
        assert (None if _la_ban_tin(bt) else _binh_luan_gia(bt)) is not None


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
