"""Module Tra cứu Phong Thủy Bát Trạch & Hướng Nhà Hợp Mệnh (SRS-5.1zzzzzzz394, 06/11/2026).

Tinh hoa MOSO:
- Tính Can Chi và Cung Phi (Quái Số) theo năm sinh âm lịch và giới tính chuẩn Bát Trạch học.
- Phân nhóm Đông Tứ Mệnh vs Tây Tứ Mệnh và 4 hướng tốt (Sinh Khí, Diên Niên, Thiên Y, Phục Vị) vs 4 hướng xấu.
- Đánh giá hướng nhà/ban công thực tế kèm lời khuyên đón gió, tránh nắng và phương án hóa giải phong thủy thực tế.
"""
from __future__ import annotations

from typing import Any

CAN = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"]
CHI = ["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"]

# Quái số Bát Trạch: 1 Khảm, 2 Khôn, 3 Chấn, 4 Tốn, 6 Càn, 7 Đoài, 8 Cấn, 9 Ly (5 Nam hóa Khôn, Nữ hóa Cấn)
CUNG_TEN = {
    1: "Khảm (Thủy)",
    2: "Khôn (Thổ)",
    3: "Chấn (Mộc)",
    4: "Tốn (Mộc)",
    6: "Càn (Kim)",
    7: "Đoài (Kim)",
    8: "Cấn (Thổ)",
    9: "Ly (Hỏa)",
}

# 1, 3, 4, 9 là Đông Tứ Mệnh; 2, 6, 7, 8 là Tây Tứ Mệnh
DONG_TU_MENH = {1, 3, 4, 9}
TAY_TU_MENH = {2, 6, 7, 8}

# Bát Cung kết hợp 8 hướng tạo thành 8 sao (Bát Trạch Cát Hung)
# 4 Hướng tốt: Sinh Khí (Tài lộc, thăng tiến), Thiên Y (Sức khỏe, may mắn), Diên Niên (Gia đạo, hòa thuận), Phục Vị (Bình an, học vấn)
# 4 Hướng xấu: Tuyệt Mệnh, Ngũ Quỷ, Lục Sát, Họa Hại
BAT_TRACH_HUONG: dict[int, dict[str, tuple[str, str, bool]]] = {
    # 1: Khảm (Đông Tứ Mệnh)
    1: {
        "dong_nam": ("Sinh Khí", "Thu hút tài lộc, công danh phát đạt (Rất tốt)", True),
        "dong": ("Thiên Y", "Sức khỏe dồi dào, quý nhân phù trợ (Rất tốt)", True),
        "nam": ("Diên Niên", "Gia đạo êm ấm, tình cảm gắn kết (Tốt)", True),
        "bac": ("Phục Vị", "Tinh thần an yên, củng cố nội lực (Tốt)", True),
        "tay_nam": ("Tuyệt Mệnh", "Tổn hao sinh khí, tài vận trắc trở (Xấu)", False),
        "dong_bac": ("Ngũ Quỷ", "Dễ gặp thị phi, hao tài (Xấu)", False),
        "tay_bac": ("Lục Sát", "Xáo trộn quan hệ, trục trặc kiện tụng (Xấu)", False),
        "tay": ("Họa Hại", "Khó khăn vụn vặt, bất hòa nhỏ (Xấu)", False),
    },
    # 2: Khôn (Tây Tứ Mệnh)
    2: {
        "dong_bac": ("Sinh Khí", "Phát tài phát lộc, sự nghiệp hưng vượng (Rất tốt)", True),
        "tay": ("Thiên Y", "Tránh bệnh tật, gia đạo bình an (Rất tốt)", True),
        "tay_bac": ("Diên Niên", "Hòa khí sinh tài, con cháu thảo hiền (Tốt)", True),
        "tay_nam": ("Phục Vị", "Vững vàng gia thất, tâm an lộc tự đến (Tốt)", True),
        "bac": ("Tuyệt Mệnh", "Hao tổn năng lượng, trắc trở làm ăn (Xấu)", False),
        "dong_nam": ("Ngũ Quỷ", "Bất an, dễ gặp tranh chấp (Xấu)", False),
        "nam": ("Lục Sát", "Thị phi tình cảm, hao tài (Xấu)", False),
        "dong": ("Họa Hại", "Thất thoát nhỏ, công việc chậm trễ (Xấu)", False),
    },
    # 3: Chấn (Đông Tứ Mệnh)
    3: {
        "nam": ("Sinh Khí", "Vượng khí tài lộc, sự nghiệp thăng tiến vùn vụt (Rất tốt)", True),
        "bac": ("Thiên Y", "Trường thọ, gặp may mắn trong cuộc sống (Rất tốt)", True),
        "dong_nam": ("Diên Niên", "Gia đình sum vầy, các mối quan hệ hòa thuận (Tốt)", True),
        "dong": ("Phục Vị", "Tâm trí sáng suốt, thi cử đỗ đạt (Tốt)", True),
        "tay": ("Tuyệt Mệnh", "Bất lợi sức khỏe và tài sản (Xấu)", False),
        "tay_bac": ("Ngũ Quỷ", "Thị phi, tiểu nhân quấy phá (Xấu)", False),
        "dong_bac": ("Lục Sát", "Gia đạo lục đục, trở ngại pháp lý (Xấu)", False),
        "tay_nam": ("Họa Hại", "Xui rủi vặt, hao tổn chi tiêu (Xấu)", False),
    },
    # 4: Tốn (Đông Tứ Mệnh)
    4: {
        "bac": ("Sinh Khí", "Đại cát đại lợi, phúc lộc vẹn toàn (Rất tốt)", True),
        "nam": ("Thiên Y", "Khỏe mạnh, gặp quý nhân trợ lực (Rất tốt)", True),
        "dong": ("Diên Niên", "Tình duyên gắn kết, gia đạo hưng thịnh (Tốt)", True),
        "dong_nam": ("Phục Vị", "Bình an, tài vận ổn định (Tốt)", True),
        "dong_bac": ("Tuyệt Mệnh", "Trở ngại lớn, hao tổn tài vận (Xấu)", False),
        "tay_nam": ("Ngũ Quỷ", "Dễ thất bại trong làm ăn (Xấu)", False),
        "tay": ("Lục Sát", "Quan hệ xáo trộn, tranh chấp gia đạo (Xấu)", False),
        "tay_bac": ("Họa Hại", "Hao tài tốn của, công việc trắc trở (Xấu)", False),
    },
    # 6: Càn (Tây Tứ Mệnh)
    6: {
        "tay": ("Sinh Khí", "Lộc tài thịnh vượng, địa vị danh vọng cao (Rất tốt)", True),
        "dong_bac": ("Thiên Y", "Khỏe mạnh, tai qua nạn khỏi (Rất tốt)", True),
        "tay_nam": ("Diên Niên", "Gia đình bền chặt, con cháu thành đạt (Tốt)", True),
        "tay_bac": ("Phục Vị", "Nâng cao năng lực, tâm thế vững vàng (Tốt)", True),
        "nam": ("Tuyệt Mệnh", "Nguy hại sức khỏe, tài chính lao dốc (Xấu)", False),
        "dong": ("Ngũ Quỷ", "Bất hòa đối tác, hỏa hoạn, thị phi (Xấu)", False),
        "bac": ("Lục Sát", "Kiện tụng, thất thoát tiền tài (Xấu)", False),
        "dong_nam": ("Họa Hại", "Dễ gặp chuyện không may, hao mòn tài chính (Xấu)", False),
    },
    # 7: Đoài (Tây Tứ Mệnh)
    7: {
        "tay_bac": ("Sinh Khí", "Vận may liên tiếp, tiền bạc hanh thông (Rất tốt)", True),
        "tay_nam": ("Thiên Y", "Thân tâm an lạc, tài vận bình ổn (Rất tốt)", True),
        "dong_bac": ("Diên Niên", "Gia đạo hài hòa, nhân duyên tốt đẹp (Tốt)", True),
        "tay": ("Phục Vị", "Tài năng phát huy, tự tin vững vàng (Tốt)", True),
        "dong": ("Tuyệt Mệnh", "Tổn hại danh tiếng và sức khỏe (Xấu)", False),
        "nam": ("Ngũ Quỷ", "Mất mát của cải, bất an trong nhà (Xấu)", False),
        "dong_nam": ("Lục Sát", "Thị phi tình ái, tiền tài thất tán (Xấu)", False),
        "bac": ("Họa Hại", "Khó khăn trong làm ăn, việc dở dang (Xấu)", False),
    },
    # 8: Cấn (Tây Tứ Mệnh)
    8: {
        "tay_nam": ("Sinh Khí", "Tài lộc dồi dào, thăng tiến thuận lợi (Rất tốt)", True),
        "tay_bac": ("Thiên Y", "Gia đình an khang, trường thọ (Rất tốt)", True),
        "tay": ("Diên Niên", "Các mối quan hệ bền vững, quý nhân tương trợ (Tốt)", True),
        "dong_bac": ("Phục Vị", "Phúc đức tụ hội, tâm an trí sáng (Tốt)", True),
        "dong_nam": ("Tuyệt Mệnh", "Rủi ro bất ngờ, hao tổn lớn (Xấu)", False),
        "bac": ("Ngũ Quỷ", "Lục đục nội bộ, tài sản hao hụt (Xấu)", False),
        "dong": ("Lục Sát", "Trục trặc tình cảm, điều tiếng thị phi (Xấu)", False),
        "nam": ("Họa Hại", "Việc khó thành, tốn kém chi phí (Xấu)", False),
    },
    # 9: Ly (Đông Tứ Mệnh)
    9: {
        "dong": ("Sinh Khí", "Trí tuệ phát tiết, công danh xán lạn (Rất tốt)", True),
        "dong_nam": ("Thiên Y", "Sức khỏe dồi dào, lộc trời ban (Rất tốt)", True),
        "bac": ("Diên Niên", "Gia đạo hưng thịnh, mọi việc thuận hòa (Tốt)", True),
        "nam": ("Phục Vị", "Danh tiếng rạng rỡ, nội tâm bình an (Tốt)", True),
        "tay_bac": ("Tuyệt Mệnh", "Đại bại tài chính, sức khỏe suy kiệt (Xấu)", False),
        "tay": ("Ngũ Quỷ", "Mất việc, tai bay vạ gió, thị phi (Xấu)", False),
        "tay_nam": ("Lục Sát", "Quan hệ gia đình rạn nứt, hao tán (Xấu)", False),
        "dong_bac": ("Họa Hại", "Bất lợi mưu sự, tiểu nhân quấy quả (Xấu)", False),
    },
}

HUONG_CHUAN: dict[str, str] = {
    "dong": "dong", "đông": "dong", "e": "dong",
    "tay": "tay", "tây": "tay", "w": "tay",
    "nam": "nam", "s": "nam",
    "bac": "bac", "bắc": "bac", "n": "bac",
    "dong nam": "dong_nam", "đông nam": "dong_nam", "se": "dong_nam",
    "tay nam": "tay_nam", "tây nam": "tay_nam", "sw": "tay_nam",
    "dong bac": "dong_bac", "đông bắc": "dong_bac", "ne": "dong_bac",
    "tay bac": "tay_bac", "tây bắc": "tay_bac", "nw": "tay_bac",
}

TEN_HUONG_DEP = {
    "dong": "Chính Đông",
    "tay": "Chính Tây",
    "nam": "Chính Nam",
    "bac": "Chính Bắc",
    "dong_nam": "Đông Nam",
    "tay_nam": "Tây Nam",
    "dong_bac": "Đông Bắc",
    "tay_bac": "Tây Bắc",
}


def tinh_can_chi(nam: int) -> str:
    """Tính Can Chi theo năm dương lịch."""
    can = CAN[(nam + 6) % 10]
    chi = CHI[(nam + 8) % 12]
    return f"{can} {chi}"


def tinh_quai_so(nam: int, gioi_tinh: str = "nam") -> int:
    """Tính Quái số (Cung Phi) chuẩn phong thủy Bát Trạch.
    Thuật toán: cộng HAI SỐ CUỐI của năm sinh, rút gọn tới khi còn 1 chữ số (L). Sửa 08/11: bản 06/11 cộng cả bốn chữ số năm →
    sai cung (1988 ra Khôn 2 thay vì Chấn 3).
    - Trước năm 2000: Nam = (10 - L) % 9; Nữ = (L + 5) % 9
    - Từ năm 2000:    Nam = (9 - L) % 9;  Nữ = (L + 6) % 9
    (Kết quả 0 là 9. Nam ra 5 hóa Khôn 2; Nữ ra 5 hóa Cấn 8.)
    """
    s = (nam % 100) // 10 + nam % 10
    while s > 9:
        s = s // 10 + s % 10

    gt = gioi_tinh.strip().lower()
    la_nu = gt in ("nu", "nữ", "female", "gái", "chị", "bà", "em gái")

    if nam < 2000:
        q = (s + 5) % 9 if la_nu else (10 - s) % 9
    else:
        q = (s + 6) % 9 if la_nu else (9 - s) % 9

    if q == 0:
        q = 9
    if q == 5:
        q = 8 if la_nu else 2
    return q


def tra_cuu_phong_thuy_chi_tiet(
    nam_sinh: int, gioi_tinh: str = "nam", huong_nha: str | None = None
) -> dict[str, Any]:
    """Phân tích toàn diện phong thủy nhà ở theo Bát Trạch."""
    can_chi = tinh_can_chi(nam_sinh)
    quai = tinh_quai_so(nam_sinh, gioi_tinh)
    cung = CUNG_TEN[quai]
    nhom = "Đông Tứ Mệnh" if quai in DONG_TU_MENH else "Tây Tứ Mệnh"
    bang_huong = BAT_TRACH_HUONG[quai]

    huong_tot = [
        {"ma": k, "ten": TEN_HUONG_DEP[k], "sao": v[0], "y_nghia": v[1]}
        for k, v in bang_huong.items()
        if v[2]
    ]
    huong_xau = [
        {"ma": k, "ten": TEN_HUONG_DEP[k], "sao": v[0], "y_nghia": v[1]}
        for k, v in bang_huong.items()
        if not v[2]
    ]

    ket_qua: dict[str, Any] = {
        "nam_sinh": nam_sinh,
        "gioi_tinh": "Nữ" if gioi_tinh.lower() in ("nu", "nữ", "female") else "Nam",
        "can_chi": can_chi,
        "quai_so": quai,
        "cung_phi": cung,
        "nhom_menh": nhom,
        "huong_tot": huong_tot,
        "huong_xau": huong_xau,
    }

    if huong_nha:
        k_huong = " ".join(huong_nha.lower().replace("_", " ").replace("-", " ").split())
        k_chuan = HUONG_CHUAN.get(k_huong)
        if not k_chuan:
            for raw, c in HUONG_CHUAN.items():
                if raw in k_huong:
                    k_chuan = c
                    break

        if k_chuan and k_chuan in bang_huong:
            sao, y_nghia, hop = bang_huong[k_chuan]
            ket_qua["danh_gia_huong"] = {
                "huong": TEN_HUONG_DEP[k_chuan],
                "hop_menh": hop,
                "sao": sao,
                "y_nghia": y_nghia,
            }
        else:
            ket_qua["danh_gia_huong"] = {
                "huong": huong_nha,
                "hop_menh": None,
                "sao": "Chưa xác định",
                "y_nghia": "Không nhận diện được hướng nhà này.",
            }

    return ket_qua


def dinh_dang_phong_thuy_chat(
    nam_sinh: int, gioi_tinh: str = "nam", huong_nha: str | None = None
) -> str:
    """Trả về câu tư vấn phong thủy thiết thực, chuyên nghiệp chuẩn bị gửi khách."""
    pt = tra_cuu_phong_thuy_chi_tiet(nam_sinh, gioi_tinh, huong_nha)
    dong = [
        f"🧭 TRA CỨU PHONG THỦY BÁT TRẠCH — TUỔI {pt['can_chi'].upper()} ({pt['nam_sinh']})",
        f"• Gia chủ: {pt['gioi_tinh']} | Cung phi: {pt['cung_phi']} | Thuộc nhóm: {pt['nhom_menh']}",
        "",
        "✅ 4 HƯỚNG TỐT ĐÓN TÀI LỘC & VƯỢNG KHÍ:",
    ]
    for h in pt["huong_tot"]:
        dong.append(f"  + Hướng {h['ten']}: Cung {h['sao']} — {h['y_nghia']}")

    dong.append("\n⚠️ 4 HƯỚNG NÊN TRÁNH (HOẶC CẦN HÓA GIẢI):")
    for h in pt["huong_xau"]:
        dong.append(f"  - Hướng {h['ten']}: Cung {h['sao']} — {h['y_nghia']}")

    if "danh_gia_huong" in pt:
        dg = pt["danh_gia_huong"]
        dong.append("\n🔍 ĐÁNH GIÁ HƯỚNG NHÀ ĐANG XEM:")
        if dg["hop_menh"] is True:
            dong.append(
                f"  -> Hướng {dg['huong']} là hướng RẤT HỢP với gia chủ ({dg['sao']}). "
                f"Mang lại {dg['y_nghia'].lower()}."
            )
        elif dg["hop_menh"] is False:
            dong.append(
                f"  -> Hướng {dg['huong']} rơi vào cung {dg['sao']} ({dg['y_nghia']}). "
                "Tuy nhiên theo phong thủy hiện đại 'Đa cát thắng tiểu hung', gia chủ hoàn toàn hóa giải "
                "bằng cách: (1) Đặt hướng bếp tọa hung hướng cát; (2) Bố trí ban công / cây xanh cản khí xấu; "
                "(3) Chọn hướng bàn thờ và giường ngủ quay về hướng sinh khí."
            )

    # Thêm insight khí hậu thực tế tại Việt Nam
    dong.append(
        "\n💡 Lời khuyên khí hậu thực tế: Bên cạnh cung mệnh, hướng Nam và Đông Nam luôn đón gió tự nhiên mát mẻ "
        "quanh năm. Các căn hướng Tây/Tây Bắc đón nắng chiều nên ưu tiên rèm cách nhiệt hoặc logia cây xanh."
    )
    return "\n".join(dong)
