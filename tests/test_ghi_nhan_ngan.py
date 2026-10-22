"""21/10/2026 (SRS-5.1zzzzzzz102). Đếm 280 câu bot 3 ngày (bảng `cau_chuan`): 59 câu có "ghi nhận", 32 câu MỞ ĐẦU "Em ghi nhận…" và
gần hết tua lại cả tin ("Em ghi nhận nhà hẻm …, 65m2, 7 tầng, ngang 4,5m, giá … rồi"). Luật 5 cấm nhại lời khách, nhưng luật 6 và
mô tả ô gửi khách (model đọc ở MỌI lượt) dạy ngược: "chữ đầu là điều khách vừa nói", ví dụ "Phường Chợ Quán, em ghi rồi chị." — model
dung hoà hai luật bằng cách tua lại. Nay ba chỗ cùng nói một luật: ghi nhận một vế ngắn lễ phép, không kể lại chi tiết. Đỏ khi còn
chỗ nào dạy mở câu bằng lời khách hoặc khi luật ghi nhận ngắn mà lịch sự vắng khỏi prompt lượt trả lời."""
from aioi.assistants import assign_assistant
from aioi.llm.claude import _GUI_KHACH
from aioi.prompts import build_chat_system
from aioi.schema import Property


def _he():
    return build_chat_system(assign_assistant("x").name, Property(loai_hinh="nha_pho"), "phuong")


def test_khong_con_cho_nao_day_mo_cau_bang_loi_khach():
    he = _he()
    for chuoi in ("điều khách vừa nói", "Phường Chợ Quán, em ghi rồi"):
        assert chuoi not in he
        assert chuoi not in str(_GUI_KHACH)


def test_luat_ghi_nhan_ngan_ma_lich_su_co_trong_prompt_va_o_gui_khach():
    he = _he()
    assert "GHI NHẬN VỪA NGẮN VỪA LỊCH SỰ" in he and "láo" in he
    mo_ta = _GUI_KHACH["input_schema"]["properties"]
    assert "KHÔNG kể lại" in mo_ta["tu_soat"]["description"]
    assert "không tua lại lời" in mo_ta["loi_gui_khach"]["description"]


def test_luot_sau_ban_nhap_cung_mot_luat_ghi_nhan():
    """SRS-5.1zzzzzzz105 (bắn thử 205, KB3): lượt khách bổ sung sau bản nháp vẫn "Em ghi nhận, căn đã có sổ hồng và full nội thất
    rồi…" — luật ghi nhận chỉ nằm ở prompt lượt hỏi (CONVERSATION_POLICY), không ở prompt sau bản nháp. Nay một nguồn LUAT_GHI_NHAN."""
    from aioi import cau_mau
    from aioi.prompts import CONVERSATION_POLICY, LUAT_GHI_NHAN, build_fee_followup_system
    assert LUAT_GHI_NHAN in CONVERSATION_POLICY
    luat = LUAT_GHI_NHAN.replace("<<VI_DU_GHI_NHAN>>", cau_mau.vi_du_ghi_nhan())     # ví dụ lấy ở cau_mau (SRS-5.1zzzzzzz120)
    assert luat in build_fee_followup_system("x", Property(loai_hinh="nha_pho"), web={"len_web": False, "cho_duyet": True})
