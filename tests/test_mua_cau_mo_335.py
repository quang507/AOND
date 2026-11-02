"""02/11/2026 (SRS-5.1zzzzzzz335, ca thật chủ dự án ở số tư vấn): "anh đang cần tìm mua nhà quận 8 dưới 7 tỉ yên tĩnh" — rổ có 3 nhà phố Q8
hợp mà bot đưa MỘT căn theo khuôn bốn đoạn rồi hỏi "hẻm trước nhà rộng cỡ nào để xe hơi ra vào"; chủ dự án: "chat chán quá".

Lớp lỗi: lời phía mua do khuôn cố định quyết — cây hỏi nhu cầu cố định (`next_question_field` trả `yeu_cau_xe_hoi` ngay sau ba ô cốt lõi)
và khuôn "mỗi lượt MỘT căn, BỐN ĐOẠN" trong `khoi_can_cho_khach`; dòng căn thiếu đường vào nên model không nối được ý "yên tĩnh" với
"trong hẻm". Sửa: câu hỏi MỞ, tuỳ chọn, AI chọn trong danh sách ý còn thiếu (`BuyerLead.y_con_thieu`); 2–3 căn mỗi lượt; `dong_can` có
đường vào + tiện ích có thật. Mọi bài đỏ khi trả lại cây / khuôn cũ. Số / ID trong bài là giả (tiền tố `thu-`)."""
from __future__ import annotations

from aioi.config import Settings
from aioi.engine import SO_TU_VAN, Engine
from aioi.llm.mock import MockProvider
from aioi.mua import dong_can, khoi_can_cho_khach
from aioi.schema import CAU_MO_MUA
from aioi.supabase_store import SupabaseConversationStore

Q8 = [
    {"id": "a1", "code": "Q8AA0001", "property_type": "nha_pho", "deal": "ban", "street": "Phạm Thế Hiển", "ward": "Phường Phú Định",
     "district": "Quận 8", "area_m2": 43, "price_raw": "2,8 tỷ", "price_vnd": 2_800_000_000, "status": "dang_ban", "access_type": "hem_xe_hoi",
     "alley_width_m": "3.6", "tien_ich_gan": [{"m": 0, "ten": "Chợ Phạm Thế Hiển", "loai": "cho"}]},
    {"id": "a2", "code": "Q8AA0002", "property_type": "nha_pho", "deal": "ban", "street": "Dương Bá Trạc", "ward": "Phường Bình Đông",
     "district": "Quận 8", "area_m2": 61, "price_raw": "4,9 tỷ", "price_vnd": 4_900_000_000, "status": "dang_ban", "access_type": "hem_xe_hoi"},
    {"id": "a3", "code": "Q8AA0003", "property_type": "nha_pho", "deal": "ban", "street": "Phạm Thế Hiển", "ward": "Phường Bình Đông",
     "district": "Quận 8", "area_m2": 62, "price_raw": "5,3 tỷ", "price_vnd": 5_300_000_000, "status": "dang_ban", "access_type": "mat_tien"},
]


class _Kho(SupabaseConversationStore):
    """PostgREST giả: `tim_nha` trả 3 nhà phố Q8 dưới 7 tỷ (rổ hàng của ca production)."""

    def __init__(self):
        super().__init__(url="https://x.invalid", key="khoa-gia")

    def _request(self, method, endpoint, data=None, prefer=None):
        if endpoint.startswith("rpc/parse_vnd"):
            return 7_000_000_000
        if endpoint.startswith("rpc/tim_nha"):
            return [{"can": c, "diem": 5, "ly_do": "đúng khu vực, trong ngân sách"} for c in Q8]
        if endpoint.startswith("rpc/"):
            return 1
        return []

    def load(self, user_key):
        return None

    def save(self, conv):
        return None


class _Ai(MockProvider):
    def __init__(self, ke_hoach):
        super().__init__(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
        self.ke_hoach, self.system = ke_hoach, []

    def extract(self, system, messages, json_schema):
        if "user_intent" in (json_schema.get("properties") or {}):
            return dict(self.ke_hoach)
        return super().extract(system, messages, json_schema)

    def chat(self, system, messages, max_tokens=256):
        self.system.append(system)
        return "Em có mấy căn hợp nè anh."

    def reply(self, system, messages, **k):
        return self.chat(system, messages)


def _mua(cau: str, lead: dict, khoa: str = "thu-mua-335") -> tuple[Engine, _Ai]:
    ai = _Ai({"operations": [], "user_intent": "buy", "buyer_lead": {"loai_giao_dich": "mua", **lead}})
    eng = Engine(ai, conversation_store=_Kho())
    eng.conversation(khoa).so_nhan = SO_TU_VAN
    eng.handle(khoa, cau)
    return eng, ai


def _dan_hoi(he: str) -> str:
    """Danh sách ý code đưa cho câu hỏi mở của lượt (giữa "nêu trước:" và "Ý khách đã nói")."""
    i = he.find("Cuối tin (sau phần căn nếu có), hỏi MỘT câu mở")
    if i < 0:
        return ""
    j = he.find("nêu trước: ", i) + len("nêu trước: ")
    return he[j:he.find(". Ý khách đã nói", j)]


def test_q8_yen_tinh_dua_ca_ba_can_va_khong_hoi_xe_hoi():
    for cau, lead in (
        ("anh đang cần tìm mua nhà quận 8 dưới 7 tỉ yên tĩnh",
         {"loai_bds": "nha_pho", "khu_vuc": "quận 8", "ngan_sach": "dưới 7 tỉ", "moi_truong_song": "yên tĩnh"}),
        ("nhà cấp 4 Q8 ngân sách 6 tỷ, tìm chỗ nào ít ồn",                      # cách nói mới
         {"loai_bds": "nha_cap_4", "khu_vuc": "Q8", "ngan_sach": "6 tỷ", "moi_truong_song": "ít ồn"}),
        ("kiếm căn nhà phố q8 tầm 7 tỏi, khu êm êm chút em",                     # cách nói mới
         {"loai_bds": "nha_pho", "khu_vuc": "q8", "ngan_sach": "7 tỏi", "moi_truong_song": "êm êm"}),
    ):
        eng, ai = _mua(cau, lead, khoa="thu-q8-" + cau[:6])
        he = ai.system[-1]
        assert eng.conversation("thu-q8-" + cau[:6]).buyer_lead.next_question_field() == CAU_MO_MUA, cau
        assert all(c["code"] in he for c in Q8), cau                                    # đủ 3 căn tới model
        assert "MỘT căn tốt nhất" not in he and "2–3 căn" in he and "tầm giá" in he, cau   # đưa 2–3 căn, mở bằng tầm giá
        hoi = _dan_hoi(he)
        assert hoi and "khu yên tĩnh" not in hoi, cau                                   # ý khách đã nói không gợi lại
        assert "yêu cầu hẻm xe hơi" not in he and "đường trước nhà cần rộng" not in he, cau
        assert "chỉ nêu khi khách đã nhắc xe" in he and "KHÔNG câu nào ngầm cho rằng khách có xe hơi" in he, cau


def test_chung_cu_vo_chong_con_nho_khong_hoi_lai_thanh_vien():
    _, ai = _mua("mua chung cư q7 3 tỷ cho vợ chồng có con nhỏ",
                 {"loai_bds": "chung_cu", "khu_vuc": "q7", "ngan_sach": "3 tỷ", "thanh_vien": "vợ chồng, con nhỏ"}, khoa="thu-cc-q7")
    hoi = _dan_hoi(ai.system[-1])
    assert hoi and "nhà mấy người ở" not in hoi and "chỗ đậu xe" not in hoi and "số phòng ngủ" in hoi


def test_khach_noi_co_xe_hoi_thi_y_dau_xe_co_trong_danh_sach():
    _, ai = _mua("anh tìm nhà phố Gò Vấp 8 tỷ, nhà có xe hơi",
                 {"loai_bds": "nha_pho", "khu_vuc": "Gò Vấp", "ngan_sach": "8 tỷ"}, khoa="thu-xe")
    assert "chỗ đậu xe" in _dan_hoi(ai.system[-1])                                   # AI được chọn hỏi chỗ đậu xe khi khách nhắc xe


def test_dong_can_co_duong_vao_va_tien_ich_that():
    d = dong_can(Q8[0])
    assert "trong hẻm xe hơi (hẻm rộng 3.6 m)" in d and "gần Chợ Phạm Thế Hiển ~0 m" in d     # 0 m (sát bên) vẫn là số
    assert "mặt tiền đường" in dong_can(Q8[2]) and "gần " not in dong_can(Q8[1])            # không có dữ liệu tiện ích → không có "gần"
    k = khoi_can_cho_khach(Q8)
    assert "thường yên tĩnh hơn mặt tiền" in k and "không lấy tên trường / chợ nào khác" in k
    assert "BỐN ĐOẠN" not in k and "kể lại ĐÚNG" not in k


def test_q8_khach_noi_mua_nha_chung_chung_khong_hoi_trong_loai_hinh():
    """Điều phối 02/11 (bản "sau" của PR này): khách nói "mua nhà" chung chung (bóc tách để trống loại), bot đưa 3 nhà phố rồi hỏi "anh đang muốn
    tìm loại hình bất động sản nào ạ?" — vô lý. Loại không còn là ô chặn: đủ khu vực + ngân sách thì câu hỏi mở, loại còn trống là một ý
    trong danh sách (AI gộp tự nhiên, vd "chỉ tìm nhà phố hay xem cả căn hộ")."""
    for cau, lead in (("anh đang cần tìm mua nhà quận 8 dưới 7 tỉ yên tĩnh", {"khu_vuc": "quận 8", "ngan_sach": "dưới 7 tỉ", "moi_truong_song": "yên tĩnh"}),
                      ("tìm giúp chị chỗ ở q8 tầm 6 tỷ", {"khu_vuc": "q8", "ngan_sach": "6 tỷ"})):   # cách nói mới, không chữ "nhà"
        eng, ai = _mua(cau, lead, khoa="thu-loai-" + cau[:5])
        he = ai.system[-1]
        assert "Thông tin cần khai thác tiếp theo" not in he, cau                          # không còn câu hỏi trống ô cốt lõi
        assert all(c["code"] in he for c in Q8), cau
        assert "chỉ tìm nhà phố hay xem cả căn hộ / đất" in _dan_hoi(he), cau
