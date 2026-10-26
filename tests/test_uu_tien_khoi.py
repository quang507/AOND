"""SRS-5.1zzzzzzz178 (soát luật giọng 25/10/2026, chủ dự án "chốt"): bốn mâu thuẫn trong prompt và lượt không câu hỏi.
G1 "hỏi gộp cụm" (SRS-79, đã bỏ 22/10) còn ba chỗ ↔ "hỏi MỘT ý"; G2 "25–40 từ" ↔ "mỗi đoạn ≤ 20 từ"; G3 "3 lượt đầu 100% khen" ↔ "không khen
gượng"; G4 các khối ƯU TIÊN LƯỢT NÀY xếp chồng không thứ tự. Đỏ khi: chữ cũ quay lại prompt, hai khối ưu tiên cùng xuất hiện, khối khen theo lượt
vẫn đi kèm khối ưu tiên, hỏi sau đăng hỏi hai ô một lượt."""
from aioi import prompts
from aioi.engine import KHOI_MOT_UU_TIEN
from aioi.schema import BuyerLead, Property
from tests.test_viec_mua import KhoGia, _engine

CHU_NHA = {"operations": [{"op": "update", "target": "", "fields": {"dia_chi": "12 Lê Lai, Quận 1"}, "bang_chung": {"dia_chi": "12 Lê Lai, Quận 1"}}],
           "user_intent": "sell"}


def test_prompt_khong_con_chu_mau_thuan():
    s = prompts.build_chat_system("Hằng", Property(loai_hinh="nha_pho"), "gia")
    assert "gộp các ý trong CỤM" not in s and "gộp được các ý" not in s and "25 - 40" not in s and "100% lượt khách cho thông tin" not in s
    assert "khoảng 30 từ" in s and "TỐI ĐA 1 thông tin" in s           # SRS-207: giọng bản anh Luận
    assert not hasattr(prompts, "khoi_khen_theo_luot")
    b = prompts.build_buyer_chat_system("Hằng", BuyerLead(), "khu_vuc")
    assert "am hiểu thị trường" not in b and "KHÔNG thêm chi tiết khách chưa nói" in b


def test_hoi_ve_phi_la_khoi_uu_tien_duy_nhat_khong_ep_khen():
    kho = KhoGia()
    eng, ai = _engine(kho, {**CHU_NHA, "hoi_ve": "phi", "hoi_ve_trich_dan": "phí bao nhiêu"})
    eng.handle("ut-1", "Nhà 12 Lê Lai, Quận 1, mà phí bao nhiêu vậy em?")
    s = ai.system[-1]
    assert "KHÁCH HỎI VỀ PHÍ" in s and KHOI_MOT_UU_TIEN in s
    assert "=== LƯỢT THÔNG TIN THỨ 1" not in s                            # có khối ưu tiên thì không ép khen theo lượt
    assert s.count("=== ƯU TIÊN LƯỢT NÀY") == 1


def test_luot_thuong_khong_con_khoi_khen_theo_luot():
    # SRS-207: khối "LƯỢT THÔNG TIN THỨ N" bỏ — khen theo bản anh Luận nằm sẵn trong prompt ("Khen ngợi điểm mạnh của BĐS trước").
    kho = KhoGia()
    eng, ai = _engine(kho, CHU_NHA)
    eng.handle("ut-2", "Nhà 12 Lê Lai, Quận 1")
    s = ai.system[-1]
    assert "LƯỢT THÔNG TIN THỨ" not in s and "Khen ngợi điểm mạnh của BĐS trước" in s
    assert KHOI_MOT_UU_TIEN not in s and "=== ƯU TIÊN LƯỢT NÀY" not in s


def test_phap_ly_thang_hoi_ve_khi_cung_luot():
    kho = KhoGia()
    eng, ai = _engine(kho, {**CHU_NHA, "hoi_ve": "phi", "hoi_ve_trich_dan": "phí bao nhiêu", "hoi_phap_ly": "thue_tncn",
                            "phap_ly_trich_dan": "thuế bán nhà bao nhiêu"})
    eng.handle("ut-3", "Nhà 12 Lê Lai, Quận 1. Phí bao nhiêu, thuế bán nhà bao nhiêu em?")
    s = ai.system[-1]
    assert "KHÁCH HỎI PHÁP LÝ / THỦ TỤC" in s and "KHÁCH HỎI VỀ PHÍ" not in s and s.count("=== ƯU TIÊN LƯỢT NÀY") == 1


def test_khach_mua_khoi_uu_tien_cung_mot():
    from tests.test_viec_mua import KHACH_MUA
    kho = KhoGia()
    eng, ai = _engine(kho, {**KHACH_MUA, "hoi_phap_ly": "dat_coc", "phap_ly_trich_dan": "đặt cọc bao nhiêu"})
    eng.handle("ut-4", "Em tìm nhà phố quận 5 tầm 5 tỷ, mà đặt cọc bao nhiêu là đủ?")
    s = ai.system[-1]
    assert "Đặt cọc bao nhiêu" in s and KHOI_MOT_UU_TIEN in s


def test_cum_sau_dang_moi_luot_mot_o():
    p = Property(loai_hinh="nha_pho")
    ma, con = p.cum_sau_dang(set())
    assert ma == "phap_ly" and con[0] == "dung_ten_so"
    ma2, con2 = p.cum_sau_dang({"sau:dung_ten_so"})
    assert ma2 == "phap_ly" and con2[0] == "the_chap"                      # cùng cụm, ô kế — không nhảy cụm
    assert "MỘT ý" in prompts.khoi_hoi_sau_dang(["the_chap"], p) and "GỘP" not in prompts.khoi_hoi_sau_dang(["the_chap"], p)
