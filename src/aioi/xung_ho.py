"""Bot tự xưng gì theo cách khách xưng VÀ tên trợ lý — một nguồn (SRS-5.1zzzzzzz214, chủ dự án 27/10/2026: "người ta xưng em thì mình
xưng anh hoặc chị tùy tên, xưng cháu thì cô hoặc chú"). Trước đó khách xưng "em" → bot xưng "mình" (SRS-5.1zzzzzzz86), khách ảo 26/10 ra câu
rối "Em ơi, em…"; khách tự xưng "cháu" chưa có nhánh.

Khối luật xưng hô cho model (`engine.khoi_xung_ho`), câu mẫu `{goi}` / `{toi}` (`cau_mau`), tin nhắc (`followup`), tin báo căn (`bao_can_moi`),
câu xin sao (`danh_gia`), lịch hẹn (`mua`) đều lấy ở đây — đừng viết lại bảng anh / chị ở chỗ khác."""
from __future__ import annotations

import re

from .assistants import ASSISTANT_NAMES

# Giới tính theo tên trợ lý — [giả định BA] theo cách tên thường được đặt; chủ dự án đổi thì sửa hai tập này (test đòi mọi tên trong
# `ASSISTANT_NAMES` phải nằm ở đúng một tập).
TEN_NU: frozenset[str] = frozenset({"M•ai", "Đ•ài", "Nh•ài", "L•ài", "Ho•ài"})
TEN_NAM: frozenset[str] = frozenset({"Th•ái", "H•ải", "L•ai", "Kh•ải", "T•ài", "Đ•ại", "Gi•ai", "Ph•ái"})

# Khách xưng "em" / "cháu" (khách nhỏ hơn bot) — câu mẫu dùng biến thể `_em` với {goi} / {toi}.
TRE: frozenset[str] = frozenset({"em", "chau"})


def gioi_tinh(ten: str | None) -> str:
    """"nu" / "nam" theo tên trợ lý; tên lạ (không có trong kho) coi là nam — không đoán theo chữ."""
    return "nu" if (ten or "").strip() in TEN_NU else "nam"


def goi_toi(pronoun: str | None, ten: str | None = None) -> tuple[str, str]:
    """(cách gọi khách, bot tự xưng) theo cách khách tự xưng (`engine._detect_customer_pronoun`) và tên trợ lý:
    em → gọi "em", xưng anh / chị; chau → gọi "cháu", xưng chú / cô; anh / chi → xưng "em"; chưa rõ → "anh/chị" + "em".
    Khách lớn tuổi (elder) giữ như cũ ở câu mẫu ("anh/chị" + "em") — khối luật cho model mới nói cháu / cô chú."""
    p = pronoun or ""
    if p.startswith("elder:") and p.partition(":")[2]:   # SRS-5.1zzzzzzz233: khách tự xưng "chú" → gọi "chú", bot xưng "cháu"
        return p.partition(":")[2], "cháu"
    nu = gioi_tinh(ten) == "nu"
    if p == "em":
        return "em", ("chị" if nu else "anh")
    if p == "chau":
        return "cháu", ("cô" if nu else "chú")
    return {"anh": "anh", "chi": "chị"}.get(p, "anh/chị"), "em"


def tre(pronoun: str | None) -> bool:
    return (pronoun or "") in TRE


__all__ = ["ASSISTANT_NAMES", "TEN_NAM", "TEN_NU", "TRE", "gioi_tinh", "goi_toi", "tre"]


# "mình" đứng sau các danh từ này là "căn của mình" (gọi căn của khách) — được phép; còn lại là đại từ gọi khách.
MINH_SAU_DANH_TU = re.compile(r"(?i)\b(?:nhà|căn|đất|lô|phố|phòng|tin|bên|dự\s+án|hàng|cư|khu|của|kho)\s+mình\b")
# "mình" nghĩa CHÚNG TA — bên em và khách cùng làm (chủ dự án 27/10/2026: "mình nghĩa chúng ta thì được", SRS-5.1zzzzzzz230): "chúng mình /
# tụi mình", "mình cùng …", "hay / để mình đăng luôn", "mình chốt / rao / đẩy tin…" (việc của bên em với tin của khách). Không tính khi "mình"
# làm chủ ngữ việc của KHÁCH ("mình cần biết thêm", "mình đến xem", "Mình đang cần gửi…").
MINH_CHUNG_TA = re.compile(r"(?i)(?<![\wà-ỹđ])(?:(?:chúng|tụi|bọn)\s+mình|(?:hay|để)\s+mình\s+[\wà-ỹđ]+|mình\s+(?:cùng|đăng|chốt|rao|đẩy|"
                           r"lên\s+tin|làm\s+tin|sửa\s+tin|chỉnh\s+tin|hoàn\s+thiện))(?![\wà-ỹđ])")


def goi_khach_la_minh(loi: str) -> bool:
    """Lời gửi khách gọi khách là "mình" như đại từ ("em xin lỗi mình nhé", "Mình cần biết thêm…") — SRS-5.1zzzzzzz171 / 214: bot KHÔNG
    xưng "mình" với ai. "nhà mình / căn mình…" không tính. MỘT nguồn cho cả lưới lời model (`engine._soat_hinh_thuc`) và câu mẫu cố định
    (`cau_mau.cau`) — SRS-5.1zzzzzzz226: câu mẫu từng nằm ngoài luật này nên ba câu gọi khách "mình" mà không ai thấy."""
    return re.search(r"(?i)(?<![\wà-ỹđ])mình(?![\wà-ỹđ])", MINH_CHUNG_TA.sub(" ", MINH_SAU_DANH_TU.sub(" ", loi or ""))) is not None

