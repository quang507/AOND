"""26/10/2026 (SRS-5.1zzzzzzz212): lỗi bắn thử 5 khách tính cách khác nhau (run 40325520586), chủ dự án: "kiểm tra gốc vì sao lại có lỗi
trước khi fix … sửa hết đi". Mỗi ca đỏ khi tắt bản sửa của nó; ca nào cũng có ít nhất một cách nói chưa từng bắn."""
from aioi import cau_mau
from aioi.engine import SO_TU_VAN, _detect_customer_pronoun
from aioi.mua import khoi_can_cho_khach
from aioi.prompts import build_fee_followup_system, khoi_trang_thai_web
from aioi.schema import Property
from tests.test_doc_y_khach import _eng
from tests.test_viec_mua import CAN, KHACH_MUA, KhoGia, _engine


def test_da_bao_phi_thi_luot_duyet_khong_hoi_lai_biet_phi_chua():
    # Anh H. (môi giới) hỏi phí, bot báo 0.5%; lượt "ok đăng đi" bản cũ vẫn hỏi "biết phí môi giới bên em chưa ạ?".
    hoi = cau_mau.cau("hoi_phi")
    p = Property()
    assert hoi in build_fee_followup_system("Mai", p, web={"len_web": True})
    he = build_fee_followup_system("Mai", p, web={"len_web": True}, phi_da_bao=True)
    assert hoi not in he and "KHÔNG hỏi lại khách biết phí chưa" in he
    eng, _ = _eng({"operations": [], "hoi_ve": "phi", "hoi_ve_trich_dan": "tính phí sao"})
    eng.handle("p5k", "bên em tính phí sao vậy")                       # cách nói chưa bắn
    assert eng.conversation("p5k").prop.fields.get("_phi_da_bao") == "1"


def test_khach_mua_lo_bi_lua_co_khoi_uy_tin():
    # Chị L. "mua qua bên em có bị lừa không" → bản cũ: nhánh mua không có khối nào, bot "em chưa có thông tin đánh giá về uy tín của bên em".
    eng, spy = _eng({"operations": [], "user_intent": "buy", "hoi_ve": "uy_tin", "hoi_ve_trich_dan": "có sợ mất tiền oan không"})
    eng.conversation("m5k").so_nhan = SO_TU_VAN
    eng.handle("m5k", "giao dịch qua bên em có sợ mất tiền oan không em")
    he = spy.systems[-1]
    assert "LO BỊ LỪA" in he and "không trả phí môi giới" in he and "KHÔNG nói em không có thông tin" in he


def test_khach_mua_hoi_phi_biet_minh_khong_tra_phi():
    eng, spy = _eng({"operations": [], "user_intent": "buy", "hoi_ve": "phi", "hoi_ve_trich_dan": "mất đồng nào"})
    eng.conversation("m5k2").so_nhan = SO_TU_VAN
    eng.handle("m5k2", "chị mua thì có mất đồng nào cho bên em không")
    assert "KHÔNG trả phí môi giới" in spy.systems[-1]


def test_xung_ho_go_tat_va_goi_bot_la_con():
    eng, _ = _eng({"operations": [], "xung_ho": "em", "xung_ho_trich_dan": "e tìm thuê"})
    eng.handle("x5k1", "e tìm thuê căn hộ 1pn á")
    assert _detect_customer_pronoun(eng.conversation("x5k1")) == "em"
    eng, _ = _eng({"operations": [], "xung_ho": "chu_co_bac", "xung_ho_trich_dan": "nói lại đi cháu"})   # cách nói chưa bắn
    eng.handle("x5k2", "nói lại đi cháu, cô nghe không rõ")
    assert _detect_customer_pronoun(eng.conversation("x5k2")) == "elder"


def test_chu_tat_khong_bi_dau_a_lam_gia():
    # "ạ" bỏ dấu thành "a" — không được thành bằng chứng khách tự xưng "anh".
    eng, _ = _eng({"operations": [], "xung_ho": "anh", "xung_ho_trich_dan": "dạ gửi ạ"})
    eng.handle("x5k3", "dạ gửi ạ")
    assert _detect_customer_pronoun(eng.conversation("x5k3")) == "unknown"


def test_o_bot_that_su_hoi_cung_tinh_lo():
    # Cô T.: hệ thống chọn hỏi giá, model hỏi phường; sổ "lờ" chỉ ghi giá nên phường bị hỏi lại như lần đầu (3 lần cả cuộc chat).
    eng, _ = _eng({"operations": [], "user_intent": "sell", "bot_vua_hoi": ["phuong", "khong_co_o_nay"]})
    c = eng.conversation("ph5k")
    c.role = "seller"
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update({"duong": "Trần Hưng Đạo", "quan": "Quận 5"})
    c.o_vua_hoi, c.cum_vua_hoi = "gia", ["gia"]
    eng.handle("ph5k", "sao hỏi nhiều vậy con")
    assert c.lo.get("phuong") == 1 and "khong_co_o_nay" not in c.lo


def test_tin_cho_phuong_hoi_khac_va_khong_bia_ten_phuong():
    # Lượt duyệt: bản cũ chỉ bảo "hỏi phường mới" không kèm danh sách → bot tự kể "Nguyễn Cư Trinh, Phường 11 hay Phường 4".
    co = khoi_trang_thai_web({"len_web": False, "thieu": ["phuong"], "goi_y_phuong": ["Phường An Đông", "Phường Chợ Quán"]})[0]
    assert "Phường An Đông, Phường Chợ Quán" in co and "KHÔNG kể phường nào khác" in co
    da_hoi = khoi_trang_thai_web({"len_web": False, "thieu": ["phuong"], "phuong_da_hoi": True})[0]
    assert "số nhà / số hẻm" in da_hoi and "KHÔNG tự kể tên phường" in da_hoi
    chua = khoi_trang_thai_web({"len_web": False, "thieu": ["phuong"]})[0]
    assert "KHÔNG tự kể tên phường" in chua


def test_khong_hua_hoi_chu_nha_khi_chua_ghi_viec():
    # Anh M. "căn nào đang có HĐ thuê thì gửi" → "em sẽ hỏi chủ nhà rồi báo lại" mà không việc nào được ghi: khối căn bản cũ dặn LUÔN hứa.
    k = khoi_can_cho_khach([CAN])
    assert "nói sẽ hỏi chủ nhà" not in k and "KHÔNG hứa sẽ báo lại" in k and "EM VỪA GHI LƯỢT NÀY" in k


def test_khach_gat_hoi_giup_thi_chuyen_cau_hoi_luot_truoc_cho_chu_nha():
    kho = KhoGia()
    eng, _ = _engine(kho, KHACH_MUA)
    eng.handle("mua-5k", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    eng._provider.ke_hoach = {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "trich_dan": "căn ABCD1234"}}
    eng.handle("mua-5k", "căn ABCD1234 hiện có ai đang thuê không em")   # AI chưa chuyển câu — bot hỏi có muốn hỏi chủ không
    eng._provider.ke_hoach = {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "hoi_chu_nha": "hiện có ai đang thuê không",
                                                   "trich_dan": "hỏi giúp"}}
    eng.handle("mua-5k", "ừ hỏi giúp anh")
    ir = kho.ghi("POST", "info_requests")
    assert ir and ir[0]["question"] == "hiện có ai đang thuê không"


def test_cau_hoi_ban_nhap_va_loi_chao_khong_dan_dat():
    assert "hấp dẫn" not in cau_mau.cau("hoi_ban_nhap") and "hấp dẫn" not in cau_mau.cau("hoi_ban_nhap_em")
    tv = cau_mau.cau("chao_tu_van", ten="Lai")
    assert "như thế nào" in tv and "chung cư" not in tv and "khu vực" not in tv
    assert "chung cư" not in cau_mau.cau("chao_lan_dau", ten="Lai")


def test_vi_du_mo_loi_khong_ep_goi_khach_la_chi():
    # Khách ảo 26/10 (SRS-5.1zzzzzzz213): anh D. 45 tuổi bị bot mở lời "Chị ơi, em đang có căn…" — model chép xưng hô của ví dụ trong khối căn
    # (cùng lớp SRS-196: ví dụ trong prompt bị chép nguyên).
    k = khoi_can_cho_khach([CAN])
    assert 'KHÔNG chép chữ "chị"' in k and 'chưa rõ thì "Anh/chị ơi' in k
