"""26/10/2026 (SRS-5.1zzzzzzz213): lỗi khách ảo có cảm xúc (run 40377269267) — lặp câu / lặp mở đầu, phí báo theo vai đoán, hỏi phường 6 lượt sau
bản nháp, tin rao tả khu / sự kiện không có, pháp lý đổi "cháu" thành "em". Mỗi ca đỏ khi gỡ bản sửa; cách nói chưa bắn ở mỗi ca."""
from aioi.engine import (Conversation, SellerRole, Turn, _CHI_TIET_BIA_RE, _cau_lap_luot_truoc, _cung_mo_dau, _vai_co_bang_chung, khoi_phap_ly)
from aioi.prompts import build_buyer_chat_system, build_chat_system, operations_schema
from aioi.schema import BuyerLead, Property
from tests.test_doc_y_khach import _eng


def test_lap_mo_dau_va_lap_cau_luot_truoc():
    truoc = "Em xin lỗi anh, em hiểu anh đang gấp.\nHiện tin chưa lên web vì thiếu phường nên em chưa có link gửi anh."
    assert _cung_mo_dau("Em xin lỗi anh vì làm anh mất thời gian.", truoc)
    assert not _cung_mo_dau("Tin chưa lên web vì còn thiếu phường ạ.", truoc)
    # lặp gần nguyên văn (khác dấu câu / hoa thường) một câu ≥ 6 chữ của lượt trước
    assert _cau_lap_luot_truoc("Anh cho em xin phường nhé. hiện tin chưa lên web vì thiếu phường nên em chưa có link gửi anh!", truoc)
    assert _cau_lap_luot_truoc("Em cứ thong thả bàn với bạn nha.", "Cảm ơn em nha, em cứ thong thả bàn với bạn.") is None   # 6 chữ nhưng khác câu
    assert _cau_lap_luot_truoc("Em sẽ nhắn ngay khi có căn ở Gò Vấp hay Phú Nhuận ạ.", "Khi có căn ở Gò Vấp hay Phú Nhuận, em sẽ nhắn ngay.") is None
    assert _cau_lap_luot_truoc("📋 Bản tin cập nhật: Bán nhà hẻm 4m Phạm Thế Hiển giá 5 tỷ 8", "📋 Bản tin cập nhật: Bán nhà hẻm 4m Phạm Thế Hiển giá 5 tỷ 8") is None


def test_lap_cau_luot_truoc_goi_lai_model():
    eng, spy = _eng({"operations": [], "user_intent": "sell"})
    c = eng.conversation("lap1")
    c.role = "seller"
    c.history.append(Turn("assistant", "Hiện bên em chưa có căn nào ở Gò Vấp hay Phú Nhuận nên em chưa dám hứa thời gian.", 0.0))
    spy.loi = ["Em hiểu cảm giác lo của chị ạ.\nHiện bên em chưa có căn nào ở Gò Vấp hay Phú Nhuận nên em chưa dám hứa thời gian.", "Lượt này em nói khác."]
    spy.chat = lambda system, messages, **k: spy.systems.append(system) or spy.loi.pop(0)
    eng.handle("lap1", "chị vẫn thấy hơi lo")
    assert any("lặp gần nguyên văn" in s for s in spy.systems[-1:]) and c.history[-1].content == "Lượt này em nói khác."


def test_vai_chi_nhan_khi_khach_goi_ten_vai():
    loi = ["a cần đăng tin nhanh. căn 2PN 85m2 ở Era Town Q7", "a làm 8 năm rồi"]
    assert not _vai_co_bang_chung("a cần đăng tin nhanh", loi)          # cách nói việc, không phải vai (bản cũ: model đoán chủ nhà → phí 1 %)
    assert not _vai_co_bang_chung("a là môi giới", loi)                  # cụm không có trong lời khách
    assert _vai_co_bang_chung("a là môi giới", loi + ["1% hay 0.5% a ko quan tâm, a là môi giới, a biết phí"])
    assert _vai_co_bang_chung("bên sàn em gửi", ["bên sàn em gửi căn này nhé"])   # cách nói chưa bắn
    eng, _ = _eng({"operations": [], "user_intent": "sell", "seller_role": "chu_nha"})
    eng.handle("vai1", "a cần đăng tin nhanh, căn 2PN 85m2")
    assert eng.conversation("vai1").user_type is SellerRole.UNKNOWN
    eng, _ = _eng({"operations": [], "user_intent": "sell", "seller_role": "moi_gioi", "seller_role_trich_dan": "a là MG"})
    eng.handle("vai2", "a là MG, gửi căn 2PN 85m2")
    assert eng.conversation("vai2").user_type is SellerRole.MOI_GIOI
    assert "seller_role_trich_dan" in operations_schema()["properties"]


def test_cong_web_dem_lo_phuong_va_bao_nguoi_phu_trach_lan_3():
    eng, _ = _eng({"operations": []})
    c = eng.conversation("ph1")
    c.prop.fields.update({"du_an": "Era Town Đức Khải", "quan": "Quận 7"})
    eng._convstore = type("K", (), {"trang_thai_tin": lambda self, conv: {"len_web": False, "thieu": ["phuong"]}, "save": lambda self, conv: None})()
    for lan in range(2):
        c.y_luot = {}
        web = eng._trang_thai_web(c)
    eng._trang_thai_web(c)   # hai lần trong cùng lượt chỉ đếm một
    assert web["phuong_da_hoi"] and c.lo["phuong"] == 2 and "can_nguoi_that" not in c.y_luot
    c.y_luot = {}
    eng._trang_thai_web(c)
    assert c.lo["phuong"] == 3 and "nhờ admin tra" in c.y_luot["can_nguoi_that"] and "Era Town Đức Khải" in c.y_luot["can_nguoi_that"]
    # SRS-5.1zzzzzzz214 mục 7 (chat anh Luận 27/10: 15 tin 🙋 trong 10 phút, sổ lờ lên 16): lượt 4, 5… KHÔNG báo admin lại — cờ nhớ ở ô tin,
    # không ở y_luot — và không đếm lờ / không hỏi phường nữa.
    assert c.prop.fields.get("_phuong_bao_admin") == "1"
    for lan in range(2):
        c.y_luot = {}
        web = eng._trang_thai_web(c)
    assert "can_nguoi_that" not in c.y_luot and web["phuong_bao_admin"] and c.lo["phuong"] == 3
    from aioi.prompts import khoi_trang_thai_web
    k = khoi_trang_thai_web({"len_web": False, "thieu": ["phuong"], "phuong_bao_admin": True})
    assert "KHÔNG hỏi khách về phường" in k[1] and "admin ĐÃ được báo" in k[0]


def test_tin_rao_ta_khu_va_su_kien_khong_co():
    assert _CHI_TIET_BIA_RE.search("nằm ngay khu dân cư sầm uất phía Nam Sài Gòn")
    assert _CHI_TIET_BIA_RE.search("căn này được nhiều người hỏi thăm lắm")
    assert _CHI_TIET_BIA_RE.search("khu này đông dân cư, buôn bán tấp nập")   # cách nói chưa bắn
    assert not _CHI_TIET_BIA_RE.search("sổ hồng riêng, đang trống giao ngay")


def test_phap_ly_xung_ho_theo_luot_va_prompt_khong_lap():
    eng, _ = _eng({"operations": []})
    c = eng.conversation("pl1")
    c.y_luot["hoi_phap_ly"] = "giay_to_cong_chung"
    k = khoi_phap_ly(c)
    assert not k or 'đang xưng "cháu" thì "cháu"' in k
    assert "Không lặp lại câu / ý đã nói ở lượt trước" in build_chat_system("Lan", Property(), "gia")
    assert "Không lặp lại câu / ý đã nói ở lượt trước" in build_buyer_chat_system("Lan", BuyerLead(), "ngan_sach")
