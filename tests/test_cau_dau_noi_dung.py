"""20/10/2026 (SRS-5.1zzzzzzz84). Bắn thử 20/10 lần 2: vẫn 2 bong bóng mở đầu "Dạ không" (lượt sửa giá sau bản nháp, lượt xin gặp
người) sau bản vá luật 6 + tu_soat. Chính luật 6 TRÍCH NGUYÊN chuỗi mẫu xấu ("Dạ không, em ghi nhận…") làm ví dụ cấm — model bắt
chước chuỗi được trích. Nay luật nói điều NÊN làm kèm ví dụ đúng cho từng loại lượt, và luật câu đầu nằm ở mô tả ô loi_gui_khach
(một chỗ, mọi lượt reply). Không lọc chữ ở đầu ra. Đỏ khi prompt còn trích chuỗi mẫu xấu hoặc ô gửi khách thiếu luật câu đầu."""
from aioi.assistants import assign_assistant
from aioi.llm.claude import _GUI_KHACH
from aioi.prompts import build_chat_system
from aioi.schema import Property


def test_prompt_khong_trich_chuoi_mau_xau():
    he = build_chat_system(assign_assistant("x").name, Property(loai_hinh="nha_pho"), "phuong")
    assert "Dạ không" not in he
    assert "Dạ không" not in str(_GUI_KHACH)


def test_o_gui_khach_mang_luat_cau_dau_kem_vi_du_dung():
    mo_ta = _GUI_KHACH["input_schema"]["properties"]["loi_gui_khach"]["description"]
    assert "Câu đầu mở bằng nội dung" in mo_ta and "Em sửa giá còn 24 tỷ" in mo_ta
