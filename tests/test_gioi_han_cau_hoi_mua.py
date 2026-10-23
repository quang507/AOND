"""SRS-5.1zzzzzzz154 (chủ dự án 23/10/2026, xem chat thử: "hỏi nhiều quá, 1 hoặc 2 câu hỏi thôi"): khách mua đã nêu khu vực hoặc ngân sách thì bot
chỉ được hỏi thêm tối đa MAX_CAU_HOI_MUA câu về nhu cầu, sau đó chỉ gợi ý căn và hẹn xem. Chưa có khu vực / ngân sách thì vẫn hỏi (chưa có gì để gợi ý).
Nguyên nhân: cây hỏi người mua có 12+ ô nối nhau (khu vực → ngân sách → loại → mục đích → 7 câu tư vấn → tiến độ), mỗi lượt hỏi một ô cho tới hết.
Đỏ khi bỏ phần chặn ở `BuyerLead.next_question_field` hoặc bỏ bộ đếm ở engine."""
from aioi.schema import MAX_CAU_HOI_MUA, BuyerLead
from tests.test_viec_mua import KhoGia, _engine


def test_du_tieu_chi_va_da_hoi_du_thi_het_cau_hoi():
    lead = BuyerLead(user_key="gh-1")
    lead.khu_vuc = "Quận 5"
    lead.fields["_so_cau_hoi"] = str(MAX_CAU_HOI_MUA - 1)
    assert lead.next_question_field() == "ngan_sach"
    lead.fields["_so_cau_hoi"] = str(MAX_CAU_HOI_MUA)
    assert lead.next_question_field() is None


def test_chua_co_khu_vuc_hay_ngan_sach_thi_van_hoi_du_da_hoi_nhieu():
    lead = BuyerLead(user_key="gh-2")
    lead.fields["_so_cau_hoi"] = "9"
    assert lead.next_question_field() == "khu_vuc"          # không có gì để gợi ý nên còn phải hỏi
    lead.fields["_so_cau_hoi"] = "abc"                      # rác trong hồ sơ không làm hỏng cây hỏi
    assert lead.next_question_field() == "khu_vuc"


def test_engine_chi_hoi_toi_da_hai_cau_roi_goi_y_va_hen_xem():
    kho = KhoGia()
    eng, ai = _engine(kho, {"operations": [], "user_intent": "buy", "buyer_lead": {"loai_giao_dich": "mua", "khu_vuc": "gần chợ Hạnh Thông Tây"}})
    eng.handle("gh-3", "chị tìm mua nhà gần chợ Hạnh Thông Tây")
    assert "ngan_sach" in ai.system[-1] or "Ngân sách" in ai.system[-1] or "ngân sách" in ai.system[-1]   # câu hỏi thứ 1
    eng._provider.ke_hoach = {"operations": [], "user_intent": "buy", "buyer_lead": {"ngan_sach": "6 tỷ"}}
    eng.handle("gh-3", "tầm 6 tỷ")                                                                      # câu hỏi thứ 2 (loại BĐS)
    assert "KHÔNG hỏi thêm câu nào về nhu cầu" not in ai.system[-1]
    eng._provider.ke_hoach = {"operations": [], "user_intent": "buy", "buyer_lead": {"loai_bds": "nha_pho"}}
    eng.handle("gh-3", "nhà phố")
    assert "KHÔNG hỏi thêm câu nào về nhu cầu" in ai.system[-1]                                          # đã hỏi đủ 2 câu: thôi hỏi
    assert eng.conversation("gh-3").buyer_lead.fields["_so_cau_hoi"] == str(MAX_CAU_HOI_MUA)
