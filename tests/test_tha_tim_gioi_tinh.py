"""SRS-5.1zzzzzzz163 (chủ dự án 23/10/2026: "thả tim ở câu chào, câu xác nhận tin đăng, câu ok, câu nhắn thông tin địa chỉ; biết hồ sơ rồi thì sau
em chào anh hoặc em chào chị luôn"). Hai việc:
(1) lõi trả `tha_tim` cho bridge thả tim lên tin khách: lời chào / lời đáp ngắn đồng ý do AI đọc theo nghĩa (cụm trích phải có trong tin khách),
    khách duyệt bản nháp, hoặc lượt vừa ghi ô địa chỉ — KHÔNG dò từ khoá ở code;
(2) giới tính trên hồ sơ Zalo (bridge gửi `gioi_tinh`) → gợi ý gọi khách anh / chị từ câu chào đầu, chỉ khi khách chưa tự xưng.
Đỏ khi bỏ cờ `tha_tim`, bỏ kiểm cụm trích, hoặc để gợi ý Zalo đè cách khách tự xưng."""
from aioi import engine as eng_mod
from aioi import server
from aioi.engine import Conversation, _detect_customer_pronoun, khoi_xung_ho
from aioi.mua import giong_sdt_sai
from tests.test_viec_mua import KhoGia, _engine

KHACH_MUA_TRON = {"operations": [], "user_intent": "buy", "buyer_lead": {"loai_giao_dich": "mua"}}


def _luot(plan, text, khach="th-1"):
    eng, ai = _engine(KhoGia(), {**KHACH_MUA_TRON, **plan})
    return eng.handle(khach, text)


def test_loi_chao_va_loi_dong_y_do_ai_doc_thi_tha_tim():
    assert _luot({"loi_xa_giao": "chao", "loi_xa_giao_trich_dan": "chào em"}, "chào em").tha_tim is True
    assert _luot({"loi_xa_giao": "dong_y", "loi_xa_giao_trich_dan": "ok ok"}, "ok ok").tha_tim is True


def test_cum_trich_khong_co_trong_tin_khach_thi_khong_tha_tim():
    # AI nói "đồng ý" nhưng cụm trích không nằm trong lời khách (bịa) → không thả tim
    assert _luot({"loi_xa_giao": "dong_y", "loi_xa_giao_trich_dan": "vâng ạ"}, "căn đó giá bao nhiêu").tha_tim is False
    assert _luot({"loi_xa_giao": "chao", "loi_xa_giao_trich_dan": "hello"}, "nhà em ở quận 5").tha_tim is False


def test_tin_binh_thuong_khong_tha_tim():
    assert _luot({}, "em tìm nhà quận 5 tầm 5 tỷ").tha_tim is False
    assert _luot({"loi_xa_giao": "khac", "loi_xa_giao_trich_dan": "tìm nhà"}, "em tìm nhà quận 5").tha_tim is False   # giá trị lạ → bỏ


def test_khach_duyet_ban_nhap_thi_tha_tim():
    conv = Conversation(user_key="x", assistant=eng_mod.assign_assistant("x"))
    conv.y_luot = {"tha_tim": "duyet"}
    eng = _engine(KhoGia(), {})[0]
    kq = eng._build_result(conv, "Em xin phép đăng tin ạ!", captured=[], now=None)
    assert kq.tha_tim is True
    conv.y_luot = {}
    assert eng._build_result(conv, "ok", captured=[], now=None).tha_tim is False
    assert eng._build_result(conv, "ok", captured=["duong"], now=None).tha_tim is True        # vừa ghi ô đường → thả tim
    assert eng._build_result(conv, "ok", captured=["dien_tich"], now=None).tha_tim is False


def test_goi_y_xung_ho_tu_gioi_tinh_zalo():
    conv = Conversation(user_key="x", assistant=eng_mod.assign_assistant("x"))
    assert _detect_customer_pronoun(conv) == "unknown"
    conv.xung_ho_goi_y = "chi"
    assert _detect_customer_pronoun(conv) == "chi"
    conv.xung_ho_goi_y = "anh"
    assert _detect_customer_pronoun(conv) == "anh"
    conv.xung_ho = "em"                                           # khách tự xưng "em" → lời khách thắng gợi ý Zalo
    assert _detect_customer_pronoun(conv) == "em"
    conv.xung_ho = "chi"
    conv.xung_ho_goi_y = "anh"
    assert _detect_customer_pronoun(conv) == "chi"


def test_khoi_xung_ho_chi_anh_cam_chu_anh_chi_ke_ca_cau_mau():
    assert "KHÔNG có chữ 'anh/chị'" in khoi_xung_ho("chi") and "Em chào chị" in khoi_xung_ho("chi")
    assert "KHÔNG có chữ 'anh/chị'" in khoi_xung_ho("anh") and "Em chào anh" in khoi_xung_ho("anh")


def test_server_dat_goi_y_tu_gioi_tinh_va_co_the_tat(monkeypatch):
    uk = "zalo-gt-1"
    monkeypatch.delenv("XUNG_HO_THEO_ZALO", raising=False)
    server._dat_goi_y_xung_ho(uk, "nu")
    assert server._engine.conversation(uk).xung_ho_goi_y == "chi"
    server._dat_goi_y_xung_ho(uk, "nam")
    assert server._engine.conversation(uk).xung_ho_goi_y == "anh"
    server._dat_goi_y_xung_ho(uk, None)                           # không biết giới tính → xoá gợi ý
    assert server._engine.conversation(uk).xung_ho_goi_y is None
    monkeypatch.setenv("XUNG_HO_THEO_ZALO", "tat")
    server._dat_goi_y_xung_ho(uk, "nu")
    assert server._engine.conversation(uk).xung_ho_goi_y is None
    server._engine.reset(uk)


def test_loi_chao_dau_goi_dung_anh_chi_theo_goi_y():
    """Câu mẫu chào lần đầu điền {goi} theo cách gọi suy ra (không còn luôn "anh/chị")."""
    kho = KhoGia()
    eng, ai = _engine(kho, {"operations": [], "loi_xa_giao": "chao", "loi_xa_giao_trich_dan": "chào em"})
    eng.conversation("zalo-gt-2").xung_ho_goi_y = "chi"
    eng.handle("zalo-gt-2", "chào em")
    he_thong = ai.system[-1]
    assert "Chào chị ạ!" in he_thong and "Chào anh/chị ạ!" not in he_thong


def test_so_dien_thoai_sai_van_nhac_cau_truc():
    assert giong_sdt_sai("070772473") is True
