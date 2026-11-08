"""Module Tư Vấn & Bộ Lọc Tiêu Chí Nhà Ở Gia Đình (SRS-5.1zzzzzzz394, 06/11/2026).

Tinh hoa MOSO:
- Tiêu chuẩn sống gia đình 2-3 thế hệ (ông bà, vợ chồng, con nhỏ).
- 5 Trụ cột an cư: Tầng đẹp lý tưởng (tầng trung 8-18), Căn góc 2 mặt thoáng, Ban công Đông Nam mát mẻ,
  Môi trường an toàn cho trẻ em/người cao tuổi, Bán kính trường học - bệnh viện < 1.5km.
"""
from __future__ import annotations

from typing import Any

TIEU_CHUAN_GIA_DINH = {
    "tang_dep": {
        "ten": "Tầng trung lý tưởng (Tầng 8 - 18)",
        "ly_do": "Tránh khói bụi mịn và tiếng ồn giao thông ở các tầng thấp (< tầng 5), đồng thời tránh bức xạ nhiệt mái nhà và áp lực gió rít / thời gian chờ thang máy quá lâu ở tầng áp mái (> tầng 25)."
    },
    "can_goc": {
        "ten": "Căn góc 2 mặt thoáng",
        "ly_do": "Có tối thiểu 2 mặt tiếp xúc ánh sáng tự nhiên và gió đối lưu, tất cả các phòng ngủ đều có cửa sổ thông thoáng, không bị ẩm mốc, tăng cường sức khỏe hô hấp cho trẻ nhỏ và người lớn tuổi."
    },
    "huong_mat": {
        "ten": "Ban công hướng Đông Nam / Nam",
        "ly_do": "Đón trọn vẹn luồng gió mùa Đông Nam mát lành quanh năm, tránh nắng gắt thiêu đốt từ hướng Tây vào buổi chiều."
    },
    "an_toan_noi_khu": {
        "ten": "Tiện ích an toàn cho trẻ em & người cao tuổi",
        "ly_do": "Khuôn viên đi bộ nội khu khép kín không có xe máy lưu thông, công viên cây xanh râm mát tập dưỡng sinh, hồ bơi có cứu hộ, siêu thị mini và nhà thuốc ngay dưới chân tòa nhà."
    },
    "ban_kinh_giao_duc": {
        "ten": "Bán kính trường học & y tế dưới 1.5km",
        "ly_do": "Thuận tiện đưa đón con đi học hàng ngày trong 5-10 phút, gần bệnh viện hoặc trung tâm y tế để an tâm chăm sóc sức khỏe gia đình khi cần thiết."
    },
}


def tu_van_tieu_chi_gia_dinh(
    khu_vuc: str = "",
    ngan_sach: str = "",
    so_phong_ngu: str = "2",
    uu_tien: str = "",
) -> str:
    """Trả về hướng dẫn và tiêu chí chọn nhà chuẩn mực cho gia đình."""
    dong = [
        "🏡 BỘ TIÊU CHUẨN LỰA CHỌN NHÀ Ở CHO GIA ĐÌNH (AN CƯ ĐA THẾ HỆ)",
    ]
    if khu_vuc:
        dong.append(f"• Khu vực tìm kiếm: {khu_vuc}")
    if ngan_sach:
        dong.append(f"• Ngân sách dự kiến: {ngan_sach}")
    dong.append(f"• Thiết kế phòng ngủ: Tối thiểu {so_phong_ngu} phòng ngủ (phù hợp gia đình 3-4 thành viên)")

    dong.extend([
        "",
        "🌟 5 TIÊU CHÍ 'VÀNG' KHI CHỌN CĂN HỘ / NHÀ PHỐ GIA ĐÌNH:",
    ])

    for i, (k, tc) in enumerate(TIEU_CHUAN_GIA_DINH.items(), 1):
        dong.append(f"  {i}. {tc['ten']}:")
        dong.append(f"     -> {tc['ly_do']}")

    dong.extend([
        "",
        "⚠️ 3 VỊ TRÍ CẦN TRÁNH TRONG TÒA CHUNG CƯ:",
        "  • Tránh căn đối diện cửa phòng thu gom rác (nguy cơ mùi hôi khi mở cửa).",
        "  • Tránh căn sát vách buồng thang máy hoặc phòng kỹ thuật điện/máy bơm (dễ bị rung và ồn ban đêm).",
        "  • Tránh căn có ban công nhìn thẳng vào ban công nhà đối diện quá gần (thiếu sự riêng tư).",
        "",
        "💡 Gợi ý bố trí: Nếu có con nhỏ hoặc người lớn tuổi, ưu tiên căn 2PN + 2WC có ban công rộng và phòng giặt phơi riêng biệt (logia) để không gian sinh hoạt luôn gọn gàng, thoáng đãng.",
    ])

    return "\n".join(dong)
