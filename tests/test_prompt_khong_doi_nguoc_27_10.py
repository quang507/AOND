"""27/10/2026 (SRS-5.1zzzzzzz215, chủ dự án: "xem prompt bot có cái gì bất hợp lý nữa ko, có gì chồng nhau hay đối ngược nhau làm bot confuse hông…
con của mình cứ em ghi nhận hoài"; "thả lỏng ra, ai ghi câu mẫu ghi nhận đâu"). Soát chuỗi system thật: (1) ví dụ CÂU CHUẨN từ CRM mở bằng "Em ghi
rồi…" trong khi luật cấm ghi nhận; (2) dòng "Thông tin cần hỏi tiếp theo: X — CHỈ hỏi ý này" đi cùng khối địa danh "hỏi phường thay cho câu hỏi kế";
(3) dòng cứng 'Xưng "em", gọi khách "anh/chị"' ngược khối xưng hô theo tên (SRS-214); (4) lời dặn ảnh "ghi nhận ngắn gọn ảnh"; (5) mồi phủ định có ví dụ.
Mỗi ca đỏ khi gỡ bản sửa."""
from aioi.engine import _mo_dau_ghi_nhan
from aioi.prompts import MO_DAU_GHI_NHAN_RE, build_buyer_chat_system, build_media_read_instruction, build_phieu_luot, khoi_cau_chuan, mau_cau_chuan_hop_le
from aioi.schema import BuyerLead, Property
from tests.test_doc_y_khach import _eng
from tests.test_phuong_cu_chia import _tra
import pytest


def test_vi_du_cau_chuan_tu_pham_luat_thi_khong_dua_cho_model():
    rows = [
        {"ngu_canh": [{"ai": "khach", "noi_dung": "nhà 60m2"}], "cau_bot": "Em ghi rồi anh/chị. Căn mình mấy tầng?", "cau_chuan": "Em nhận thông tin anh/chị. Căn mình mấy tầng?"},
        {"cau_bot": "Dạ, em hỏi thêm chút ạ.", "cau_chuan": None, "diem": 5},
        {"cau_bot": "Tin đã hiển thị trên https://aioinhadat.com rồi ạ.", "cau_chuan": "Tin đã được đăng rồi ạ."},
        {"cau_bot": "Em lưu phường 9 rồi. Nhà mình mấy lầu?", "cau_chuan": "Nhà mình mấy lầu vậy anh?"},             # câu chuẩn hợp lệ dù câu cũ ghi nhận
        {"cau_bot": "Cô ghi rồi nha, nhà cháu mấy lầu?", "cau_chuan": None, "diem": 2},                               # có điểm thấp → giữ, in câu cũ làm cách cần tránh
    ]
    k = khoi_cau_chuan(rows)
    assert "Em nhận thông tin" not in k and "Dạ, em hỏi" not in k and "đã hiển thị" not in k and "đã được đăng" not in k
    assert "CÂU CHUẨN (nên nói thế này): Nhà mình mấy lầu vậy anh?" in k and "Em lưu phường 9" not in k   # câu cũ không điểm → không in
    assert "Điểm câu bot cũ: 2/5" in k and "Cô ghi rồi nha" in k
    assert khoi_cau_chuan(rows[:3]) == ""
    assert not mau_cau_chuan_hop_le("Chị đã ghi giá 6,2 tỷ cho em rồi nha.") and mau_cau_chuan_hop_le("6,2 tỷ cho vị trí này là mức hợp lý anh ạ.")
    assert MO_DAU_GHI_NHAN_RE.match("Em đã ghi giá 6,2 tỷ") and _mo_dau_ghi_nhan("Em đã ghi giá 6,2 tỷ")   # một nguồn


def test_phuong_cu_bi_chia_thi_o_hoi_luot_do_la_phuong_mot_lan():
    # SRS-215 (ép lượt đó hỏi phường) → SRS-5.1zzzzzzz359: phường cũ đã chia KHÔNG thành câu hỏi; dữ kiện chia vẫn vào prompt, dặn không hỏi.
    eng, spy = _eng({"operations": [{"op": "update", "fields": {"duong": "Hoàng Hoa Thám", "phuong": "phường 6", "quan": "Bình Thạnh"},
                                      "bang_chung": {"duong": "Hoàng Hoa Thám", "phuong": "phường 6", "quan": "Bình Thạnh"}}], "user_intent": "sell"})
    eng._dia_danh = _tra()
    eng.handle("pc1", "nhà ở Hoàng Hoa Thám phường 6 Bình Thạnh")
    he = spy.systems[-1]
    assert 'hỏi về "phường' not in he and "chia về nhiều phường mới (Phường Bình Lợi Trung, Phường Gia Định)" in he
    assert "hỏi phường" not in he.lower() and "_phuong_chia_da_hoi" not in eng.conversation("pc1").prop.fields


def test_prompt_khong_con_dong_doi_nguoc_va_moi_phu_dinh():
    he = build_phieu_luot("Mai", Property(), "gia")   # Đợt 8 (SRS-5.1zzzzzzz319): phiếu lượt là đường duy nhất
    assert 'Xưng "em", gọi khách "anh/chị".' not in he
    assert '("Em ghi nhận…"' not in he and '"Wow"' in he   # chủ dự án 27/10: "lời dặn thuận hoặc câu khen, wow các kiểu"
    assert 'VIỆC LƯỢT NÀY: hỏi về "giá' in he
    mua = build_buyer_chat_system("Mai", BuyerLead(), "ngan_sach")
    assert 'không câu ghi nhận "em ghi nhận"' not in mua and "không báo đã ghi / đã lưu" in mua
    anh = build_media_read_instruction("Mai", None, Property(), "gia")
    assert "ghi nhận" not in anh
