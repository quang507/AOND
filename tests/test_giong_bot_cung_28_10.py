"""SRS-5.1zzzzzzz248 (chủ dự án 28/10/2026: "cảm giác vẫn cứng quá, chưa có wow tuyệt vời các kiểu"). Đo 61 lời bot lượt thử 28/10: 25 lời (41%) câu đầu
theo khuôn "<điều khách nói> thì <lợi ích>", 1 lời có "Wow", 0 "Tuyệt vời", 6 có chấm than. Gốc: GIONG_VUI (SRS-228) bắt khen = nói lợi ích, cấm khen
bằng tính từ, kèm cặp ví dụ "hẻm xe hơi → đậu xe tận cửa · sổ hồng riêng → sang tên nhanh" mà model chép gần nguyên. Bản anh Luận (207a145): "khen vài
từ rồi hỏi đúng 1 thông tin", ~30 từ. Đỏ khi khối giọng quay lại cặp ví dụ / bỏ cảm thán / bỏ trần cho khuôn "thì"."""
from aioi.prompts import GIONG_VUI


def test_khong_con_cap_vi_du_loi_ich_bi_chep():
    assert "→" not in GIONG_VUI and "sang tên nhanh" not in GIONG_VUI and "đậu xe tận cửa" not in GIONG_VUI
    assert "KHEN HAY là nói được VÌ SAO" not in GIONG_VUI


def test_duoc_cam_than_va_doi_kieu_khen():
    assert "Wow" in GIONG_VUI and "Tuyệt vời" in GIONG_VUI
    assert "Đổi KIỂU khen" in GIONG_VUI and "nhiều nhất một lần mỗi ba lượt" in GIONG_VUI


def test_ngan_nhu_anh_luan():
    assert "khoảng 30 từ" in GIONG_VUI and "khen vài chữ" in GIONG_VUI
