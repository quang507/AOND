"""27/10/2026 (SRS-5.1zzzzzzz214, chủ dự án: "người ta xưng em thì mình xưng anh hoặc chị tùy tên, xưng cháu thì cô hoặc chú"; "3 ừ" = gợi căn
chỉ khi đủ khu vực + ngân sách; ảnh chat 08:16: "Em đã ghi giá 6,2 tỷ cho anh rồi ạ" lọt lưới ghi nhận, muốn "6,2 tỷ hợp lý cho khu vực gần TTTM").
Mỗi ca đỏ khi gỡ bản sửa; cách nói chưa bắn ở mỗi ca."""
from aioi import cau_mau
from aioi.assistants import ASSISTANT_NAMES
from aioi.bao_can_moi import viet_tin
from aioi.engine import _detect_customer_pronoun, _goi_khach_la_minh, _mo_dau_ghi_nhan, khoi_xung_ho
from aioi.prompts import build_chat_system, cat_truoc_mo_dau, operations_schema
from aioi.schema import Property
from aioi.xung_ho import TEN_NAM, TEN_NU, goi_toi
from tests.test_doc_y_khach import _eng


def test_moi_ten_tro_ly_co_dung_mot_gioi_tinh():
    for ten in ASSISTANT_NAMES:
        assert (ten in TEN_NU) != (ten in TEN_NAM), ten
    assert goi_toi("em", "M•ai") == ("em", "chị") and goi_toi("em", "Th•ái") == ("em", "anh")
    assert goi_toi("chau", "Nh•ài") == ("cháu", "cô") and goi_toi("chau", "Kh•ải") == ("cháu", "chú")
    assert goi_toi("em", None) == ("em", "anh") and goi_toi("chi") == ("chị", "em") and goi_toi(None) == ("anh/chị", "em")


def test_khoi_xung_ho_em_va_chau_theo_ten_khong_minh():
    k = khoi_xung_ho("em", "M•ai")
    assert "xưng là 'chị'" in k and "KHÔNG xưng 'mình'" in k and "gọi khách là 'em'" in k and 'KHÔNG gọi khách là "mình"' in k
    assert "xưng là 'anh'" in khoi_xung_ho("em", "Gi•ai")
    k = khoi_xung_ho("chau", "Th•ái")
    assert "XƯNG LÀ 'CHÁU'" in k and "xưng 'chú'" in k and "Gọi khách là 'cháu'" in k
    assert "xưng 'cô'" in khoi_xung_ho("chau", "Ho•ài")


def test_khach_tu_xung_chau_duoc_doc_khi_co_cum_trich():
    eng, _ = _eng({"operations": [], "xung_ho": "chau", "xung_ho_trich_dan": "cháu muốn bán"})
    eng.handle("ch1", "cháu muốn bán căn nhà ở Gò Vấp ạ")          # cách nói chưa bắn
    assert _detect_customer_pronoun(eng.conversation("ch1")) == "chau"
    eng, _ = _eng({"operations": [], "xung_ho": "chau", "xung_ho_trich_dan": "con có căn"})
    eng.handle("ch2", "con có căn chung cư muốn cho thuê")
    assert _detect_customer_pronoun(eng.conversation("ch2")) == "chau"
    eng, _ = _eng({"operations": [], "xung_ho": "chau", "xung_ho_trich_dan": "nhà em"})   # cụm không có chữ cháu / con → không nhận
    eng.handle("ch3", "nhà em ở quận 5")
    assert _detect_customer_pronoun(eng.conversation("ch3")) == "unknown"
    assert "chau" in operations_schema()["properties"]["xung_ho"]["enum"]


def test_cau_mau_bien_the_em_dien_goi_va_toi():
    assert cau_mau.cau("hoi_ban_nhap_em", "em", toi="chị") == "Em muốn sửa chỗ nào, hay chị đăng luôn nhé?"
    assert cau_mau.cau("nhac_ban_nhap_em", "cháu", toi="chú") == "Chú gửi cháu bản nháp tin đăng, cháu cần chỉnh sửa thêm nhắn chú hỗ trợ nhé!"
    assert cau_mau.cau("mo_dau_nhap_em", "em", toi="anh") == "📋 Anh sẽ rao như vầy nhé em:"
    assert cau_mau.cau("nhac_xin_anh_em", "em", toi="cô").startswith("Khi nào tiện em chụp gửi cô")
    for k in ("hoi_ban_nhap_em", "nhac_ban_nhap_em", "mo_dau_nhap_em", "xin_cham_sao_em", "nhac_xin_anh_em"):
        assert "mình" not in cau_mau.MAC_DINH[k][0] and "{toi}" in cau_mau.MAC_DINH[k][0].lower()
    assert "em" in cau_mau.cau("hoi_ban_nhap_em", "em")   # quên {toi} → "em", không vỡ câu


def test_cat_truoc_mo_dau_nhan_dong_mo_xung_anh_chi():
    assert cat_truoc_mo_dau("Chị sẽ rao như vầy nhé em:\nBán đất", "em", "chị") == "📋 Chị sẽ rao như vầy nhé em:\nBán đất"
    assert cat_truoc_mo_dau("Em ghi nhận rồi. Cô sẽ rao như vầy nhé cháu:\nBán nhà", "chau", "cô") == "📋 Cô sẽ rao như vầy nhé cháu:\nBán nhà"


def test_tin_bao_can_moi_xung_theo_ten():
    c = {"id": "x", "code": "A1", "property_type": "nha_pho", "street": "Trần Phú", "ward": "Phường 4", "district": "Quận 5", "price_vnd": 6.8e9}
    t = viet_tin(c, "em", None, 0, ten="M•ai")
    assert t.startswith("Em ơi, chị đang có căn") and "mình" not in t.split("\n")[0]
    assert viet_tin(c, "chau", None, 0, ten="T•ài").startswith("Cháu ơi, chú đang có căn")


def test_mo_dau_ghi_nhan_bat_ghi_o_va_chu_ngu_moi():
    for c in ("Em đã ghi giá 6,2 tỷ cho anh rồi ạ, vị trí gần Aeon Mall Tân Phú rất thuận lợi.",   # ảnh chat 27/10
              "Chị đã ghi địa chỉ 12 Lê Lai cho em rồi nha.",                                   # bot xưng chị (SRS-214), cách nói chưa bắn
              "Anh ghi diện tích 60m2 vào tin rồi em nhé.",
              "Em đã lưu số nhà 110 vào tin ạ."):
        assert _mo_dau_ghi_nhan(c), c
    for c in ("Em sửa giá còn 24 tỷ cho chị rồi ạ.", "6,2 tỷ cho vị trí gần Aeon Mall là mức hợp lý, dễ có khách anh ạ.", "Em biết đường Âu Cơ ạ."):
        assert not _mo_dau_ghi_nhan(c), c


def test_goi_khach_la_minh_bat_ca_khi_khach_xung_em():
    assert _goi_khach_la_minh("Em ơi, mình hỏi chút nha, nhà em ở đâu?", "em") and not _goi_khach_la_minh("Nhà em ở phường nào vậy em?", "em")


def test_prompt_cho_khen_gia_dinh_tinh_khong_so_lieu():
    he = build_chat_system("Mai", Property(), "dia_chi")
    assert "ĐƯỢC khen MỘT câu định tính" in he and "không con số thị trường" in he and 'thay vì "em đã ghi giá…"' in he
