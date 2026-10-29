"""29/10/2026 (SRS-5.1zzzzzzz281). Chủ dự án: "còn các kiểu tự giao việc khác nữa có đổi lại cho tối ưu dc ko" — sau SRS-280 (câu hỏi chủ nhà
AI viết lại thì nhận luôn), soát các việc bot TỰ GIAO khác: hẹn xem, xin ảnh, chê căn + lý do, thôi báo căn, tra dự án, căn cụ thể, xin gặp người,
hỏi phí / uy tín / link, hỏi pháp lý, chuyển câu trả lời của chủ nhà cho khách — đều bỏ im lặng khi cụm AI ghi không nằm NGUYÊN VĂN trong lời khách
(AI sửa chính tả, tóm ý, chuẩn tên dự án, ghép giờ hẹn). Nay AI đọc ra là làm; riêng câu trả lời chuyển tới khách mua không nằm nguyên trong tin
người rao thì chuyển nguyên lời người rao (không bỏ, không chuyển câu AI tự diễn). Mỗi ca đỏ khi gỡ bản sửa."""
from tests.test_viec_mua import CAN, KHACH_MUA, KhoGia, _engine


def test_khach_mua_noi_khac_chu_moi_viec_deu_lam():
    kho = KhoGia()
    eng, _ = _engine(kho, KHACH_MUA)
    eng.handle("mua-281", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    eng._provider.ke_hoach = {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "quan_tam": True, "hen_xem": "chiều thứ 7, khoảng 3h",
                                                    "hoi_chu_nha": "Chủ có bớt giá không?"}}
    eng.handle("mua-281", "căn đó ok á, cuối tuần xế chiều anh qua coi, chủ bớt chút đỉnh hông em")
    v = kho.ghi("POST", "viewings")
    ir = kho.ghi("POST", "info_requests")
    assert v and v[0]["time_text"] == "chiều thứ 7, khoảng 3h" and v[0]["listing_id"] == CAN["id"]
    assert ir and ir[0]["question"] == "Chủ có bớt giá không?"
    assert [e for m, e, d in kho.goi if e.startswith("rpc/mark_listing_interest")]


def test_chu_nha_tra_loi_ai_dien_lai_thi_chuyen_nguyen_loi_chu_nha():
    kho = KhoGia(cau_cho=[{"id": "ir-1", "listing_id": CAN["id"], "question": "Nhà vào ở ngay được không?"}])
    eng, _ = _engine(kho, {"operations": [], "user_intent": "sell",
                           "tra_loi_khach_hoi": {"id": "ir-1", "tra_loi": "Nhà vào ở ngay được, bàn giao trong tuần"}})
    eng.handle("chu-1", "dọn vô liền đc e, a giao nhà trong tuần")
    patch = [d for m, e, d in kho.goi if m == "PATCH" and e.startswith("info_requests?id=eq.ir-1")]
    assert patch and patch[0]["status"] == "answered" and patch[0]["answer"] == "dọn vô liền đc e, a giao nhà trong tuần"


def test_chu_nha_tra_loi_ai_trich_dung_thi_chuyen_cum_trich():
    kho = KhoGia(cau_cho=[{"id": "ir-1", "listing_id": CAN["id"], "question": "sổ riêng không"}])
    eng, _ = _engine(kho, {"operations": [], "user_intent": "sell", "tra_loi_khach_hoi": {"id": "ir-1", "tra_loi": "sổ hồng riêng"}})
    eng.handle("chu-1", "dạ sổ hồng riêng em nha")
    patch = [d for m, e, d in kho.goi if m == "PATCH" and e.startswith("info_requests?id=eq.ir-1")]
    assert patch and patch[0]["answer"] == "sổ hồng riêng"


def test_id_cau_hoi_la_thi_khong_chuyen():
    kho = KhoGia(cau_cho=[{"id": "ir-1", "listing_id": CAN["id"], "question": "sổ riêng không"}])
    eng, _ = _engine(kho, {"operations": [], "user_intent": "sell", "tra_loi_khach_hoi": {"id": "ir-9", "tra_loi": "sổ hồng riêng"}})
    eng.handle("chu-1", "dạ sổ hồng riêng em nha")
    assert not [e for m, e, d in kho.goi if m == "PATCH" and e.startswith("info_requests")]


def test_prompt_khong_con_o_trich_cua_viec_mua():
    from aioi import prompts
    goc = open(prompts.__file__, encoding="utf-8").read()
    assert "xin_anh_trich" not in goc and "hoi_ve_trich_dan" not in goc
    assert "được hệ thống LÀM NGAY khi em ghi" in goc
