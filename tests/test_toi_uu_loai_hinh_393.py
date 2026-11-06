"""06/11/2026 (SRS-5.1zzzzzzz393). Kiểm tra bộ câu hỏi rẽ nhánh theo loại hình BĐS:
- Ưu tiên câu hỏi trực quan dễ thấy (xe tải/cont, điện 3 pha cho kho xưởng; ngang, thổ cư, lộ giới cho đất).
- Đưa câu hỏi kỹ thuật sâu (tải trọng sàn tấn/m2, kVA trạm biến áp, chỉ tiêu xây dựng) xuống cuối, không dồn ép khách.
- Cụm hỏi gộp ("tieu_chuan_container", "tram_bien_ap") cho kho xưởng.
"""
from aioi.schema import Property, PropertyGroup, CORE_FIELDS, CUM_HOI
from aioi.prompts import NATURAL_QUESTIONS


def test_industrial_fields_order_and_cluster():
    fields = CORE_FIELDS[PropertyGroup.INDUSTRIAL]
    assert "tieu_chuan_container" in fields
    assert "tram_bien_ap" in fields
    assert "tai_trong_san" in fields
    # tieu_chuan_container và tram_bien_ap phải đứng trước tai_trong_san
    assert fields.index("tieu_chuan_container") < fields.index("tai_trong_san")
    assert fields.index("tram_bien_ap") < fields.index("tai_trong_san")
    assert ("tieu_chuan_container", "tram_bien_ap") in CUM_HOI


def test_land_fields_order():
    fields = CORE_FIELDS[PropertyGroup.LAND]
    assert fields.index("kich_thuoc") < fields.index("chi_tieu_xay_dung")
    assert fields.index("tho_cu") < fields.index("chi_tieu_xay_dung")
    assert fields.index("lo_gioi_duong") < fields.index("chi_tieu_xay_dung")


def test_prompt_guidance_no_intimidating_kva():
    guide = NATURAL_QUESTIONS.get("tram_bien_ap", "")
    assert "kva" not in guide.lower()
    assert "3 pha" in guide
