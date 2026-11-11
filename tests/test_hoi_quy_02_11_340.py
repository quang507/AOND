"""Hai ca hồi quy từ lỗi production 02/11/2026 (SRS-5.1zzzzzzz340) — do phiên KIỂM ĐỘC LẬP dựng, không sửa lõi.

CA 1 nay XANH: bản sửa SRS-331 (PR #257) đã gộp vào main, nên hai ca của lỗi 1 bỏ `xfail` và thành ca hồi quy thường — ĐỎ lại nếu ai gỡ
nhánh `so_vai`. CA 2 nay cũng XANH: bản sửa SRS-335 (PR #260) gộp cùng nên `xfail` đã gỡ — ca hồi quy thường, KHÔNG xoá ca kiểm.

Lớp lỗi 1 — vai khách nhớ theo người, không theo SỐ Zalo khách đang nhắn: khách hỏi mua ở số tư vấn rồi nhắn số ký gửi thì
`conv.role` vẫn là "buyer", lượt ở số ký gửi vẫn chạy prompt tư vấn người mua. Chỗ khác cùng lớp: `so_nhan` chỉ được đọc ở lượt ĐẦU
(`engine` nhánh `khoi_chao_tu_van` kiểm `not any(t.role == "assistant")`) nên mọi lượt sau không soát lại số — ca 1 phủ chỗ đó.

Lớp lỗi 2 — cây hỏi nhu cầu người mua chạy trước rổ hàng: đã đủ khu vực + ngân sách + loại và rổ có 3 căn khớp mà
`BuyerLead.next_question_field()` vẫn trả `yeu_cau_xe_hoi`, nên prompt vẫn dặn hỏi "đường trước nhà cần rộng cỡ nào" (ca production:
"anh đang cần tìm mua nhà quận 8 dưới 7 tỉ yên tĩnh" → bot hỏi hẻm rộng cỡ nào để xe hơi vào).

Số điện thoại / ID trong bài là giả; khoá hội thoại dùng tiền tố ID thử (`thu-`).
"""
import pytest

from aioi.config import Settings
from aioi.engine import SO_TU_VAN, Engine
from aioi.llm.mock import MockProvider
from aioi.supabase_store import SupabaseConversationStore
from tests.test_doc_y_khach import _eng

# ---------------------------------------------------------------- ca 1: vai theo số Zalo khách nhắn

def _hai_so(khach_mua: str, khach_ky_gui: str, khoa: str = "thu-hai-so"):
    """Một khách: lượt đầu ở số TƯ VẤN (hỏi mua), lượt sau là lời chào ở số KÝ GỬI. Trả (engine, spy).

    Lượt chào là lượt MƠ HỒ: lượt lập thao tác không đọc ra ý mua hay bán, nên `user_intent` trống — đúng như production.
    (Bản đầu của bài này để `user_intent = "buy"` cho cả hai lượt; như vậy lượt chào không còn mơ hồ và bài đỏ vì chính nó,
    không vì lõi. Giữ ghi chú này để phiên sau không lặp lại.)"""
    eng, spy = _eng({"operations": [], "user_intent": "buy"})
    eng.conversation(khoa).so_nhan = SO_TU_VAN
    eng.handle(khoa, khach_mua)
    spy.plan = {"operations": []}                      # lượt mơ hồ: AI không đọc ra ý mua / bán
    eng.conversation(khoa).so_nhan = ""                # bridge ký gửi không gửi so_nhan
    eng.handle(khoa, khach_ky_gui)
    return eng, spy


def test_ca_1_vai_mua_khong_theo_khach_sang_so_ky_gui_khi_moi_chao():
    """Lượt ở số ký gửi chỉ là lời chào → phải quay về luồng ký gửi, không chạy prompt tư vấn người mua."""
    eng, spy = _hai_so("anh đang tìm mua nhà quận 8 tầm 7 tỷ", "chào em")
    he = spy.systems[-1]
    assert eng.conversation("thu-hai-so").role != "buyer"
    assert "trợ lý tư vấn tìm mua/thuê" not in he
    assert "người gửi bán / cho thuê" in he


def test_ca_1_cach_noi_moi_khong_hoi_khu_vuc_tim_mua_o_so_ky_gui():
    """Cách nói mới (lời chào khác, không có chữ "chào"): vẫn không được hỏi tiếp chuyện tìm mua ở số ký gửi."""
    eng, spy = _hai_so("chị cần mua căn hộ Quận 7 tầm 3 tỷ", "alo em ơi", khoa="thu-hai-so-b")
    he = spy.systems[-1]
    assert eng.conversation("thu-hai-so").role != "buyer"
    assert "Khu vực / Quận mong muốn" not in he        # cây hỏi nhu cầu người mua


def test_ca_1_khach_noi_ban_o_so_ky_gui_thi_vao_vai_ban():
    """Không phải lời chào mà nói luôn chuyện gửi bán: vai phải đổi sang bán (lưới đỡ, hiện tại đã xanh)."""
    eng, spy = _eng({"operations": [], "user_intent": "buy"})
    eng.conversation("thu-hai-so-2").so_nhan = SO_TU_VAN
    eng.handle("thu-hai-so-2", "anh tìm mua nhà quận 8 tầm 7 tỷ")
    eng._provider.plan = {"operations": [], "user_intent": "sell"}
    eng.conversation("thu-hai-so-2").so_nhan = ""
    eng.handle("thu-hai-so-2", "giờ anh muốn gửi bán căn nhà của anh")
    assert eng.conversation("thu-hai-so-2").role == "seller"


# ---------------------------------------------------------------- ca 2: đủ tiêu chí + có rổ hàng thì đưa căn, không hỏi hẻm

Q8 = [
    {"id": "a1", "code": "Q8AA0001", "property_type": "nha_pho", "deal": "ban", "street": "Phạm Thế Hiển",
     "ward": "Phường Chánh Hưng", "district": "Quận 8", "area_m2": 60, "price_raw": "6,3 tỷ", "price_vnd": 6_300_000_000,
     "status": "dang_ban"},
    {"id": "a2", "code": "Q8AA0002", "property_type": "nha_pho", "deal": "ban", "street": "Dạ Nam",
     "ward": "Phường Bình Đông", "district": "Quận 8", "area_m2": 52, "price_raw": "5,5 tỷ", "price_vnd": 5_500_000_000,
     "status": "dang_ban"},
    {"id": "a3", "code": "Q8AA0003", "property_type": "nha_pho", "deal": "ban", "street": "Hưng Phú",
     "ward": "Phường Rạch Ông", "district": "Quận 8", "area_m2": 48, "price_raw": "4,8 tỷ", "price_vnd": 4_800_000_000,
     "status": "dang_ban"},
]


class _KhoQ8(SupabaseConversationStore):
    """PostgREST giả: `tim_nha` trả đúng 3 căn nhà phố Quận 8 dưới 7 tỷ (rổ hàng của ca production)."""

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


class _AiGia(MockProvider):
    def __init__(self, ke_hoach):
        super().__init__(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
        self.ke_hoach, self.system = ke_hoach, []

    def extract(self, system, messages, json_schema):
        if "user_intent" in (json_schema.get("properties") or {}):
            return dict(self.ke_hoach)
        return super().extract(system, messages, json_schema)

    def chat(self, system, messages, max_tokens=256):
        self.system.append(system)
        return "Em gửi anh căn ở Quận 8 ạ."

    def reply(self, system, messages, **k):
        return self.chat(system, messages)


def _cau_hoi_luot(he: str) -> str:
    """Chỉ phần DẶN HỎI của lượt này (`build_buyer_chat_system` ask_line) — không tính cây hỏi tĩnh in sẵn trong prompt."""
    i = he.find("Thông tin cần khai thác tiếp theo:")
    return "" if i < 0 else he[i:i + 400]


def _q8(cau="anh đang cần tìm mua nhà quận 8 dưới 7 tỉ yên tĩnh", khoa="thu-q8"):
    ai = _AiGia({"operations": [], "user_intent": "buy",
                 "buyer_lead": {"loai_giao_dich": "mua", "loai_bds": "nha_pho", "khu_vuc": "quận 8",
                                "ngan_sach": "dưới 7 tỉ", "moi_truong_song": "yên tĩnh"}})
    eng = Engine(ai, conversation_store=_KhoQ8())
    eng.conversation(khoa).so_nhan = SO_TU_VAN
    eng.handle(khoa, cau)
    return eng, ai, khoa


def test_ca_2_ro_hang_ba_can_vao_prompt_viet_loi():
    """Lưới đỡ (hiện tại đã xanh): cả 3 căn phải tới model — bot có căn thật để kể, không phải bịa."""
    _eng_, ai, _ = _q8()
    he = ai.system[-1]
    assert "CĂN ĐANG RAO" in he
    assert all(c["street"] in he for c in Q8)


def test_ca_2_du_tieu_chi_va_co_ro_hang_thi_khong_hoi_duong_truoc_nha():
    """Đủ khu vực + ngân sách + loại và rổ có căn → không được dặn hỏi "đường trước nhà rộng cỡ nào / hẻm xe hơi".

    Khách KHÔNG nhắc gì tới xe hơi / ô tô trong lời của mình, nên ô này không phải điều khách cần."""
    eng, ai, khoa = _q8()
    assert "xe" not in "anh đang cần tìm mua nhà quận 8 dưới 7 tỉ yên tĩnh"   # tiền đề của ca: khách chưa nhắc xe
    assert eng.conversation(khoa).buyer_lead.next_question_field() != "yeu_cau_xe_hoi"
    assert "yêu cầu hẻm xe hơi" not in _cau_hoi_luot(ai.system[-1])


def test_ca_2_ro_hang_tu_hai_can_tro_len_thi_duoc_dua_nhieu_can():
    """Quyết định 02/11 (chủ dự án chê bản một căn "chat chán quá"): rổ có ≥ 2 căn hợp thì lượt đó đưa 2–3 căn.

    Phép chấm ở mức PROMPT, vì bộ này chạy model giả: lời dặn "mỗi lượt giới thiệu MỘT căn tốt nhất" của
    `mua.khoi_can_cho_khach` phải mất đi — còn nó thì model không thể đưa 2–3 căn dù rổ có 3 căn. Phần "mở bằng tầm giá"
    và số căn thật bot kể cần bộ chấm có rổ hàng (kịch bản `cham`), ghi ở PR kế."""
    _eng_, ai, _ = _q8()
    he = ai.system[-1]
    assert "MỘT căn tốt nhất" not in he
    assert "khách đòi thêm mới đưa căn kế" not in he


def test_ca_2_cach_noi_moi_khong_hoi_duong_truoc_nha():
    """Cách nói mới, cùng ý: "nhà cấp 4 Q8 ngân sách 6 tỷ, chỗ nào ít ồn" — cũng không được hỏi đường trước nhà."""
    ai = _AiGia({"operations": [], "user_intent": "buy",
                 "buyer_lead": {"loai_giao_dich": "mua", "loai_bds": "nha_cap_4", "khu_vuc": "Q8",
                                "ngan_sach": "6 tỷ", "moi_truong_song": "ít ồn"}})
    eng = Engine(ai, conversation_store=_KhoQ8())
    eng.conversation("thu-q8b").so_nhan = SO_TU_VAN
    eng.handle("thu-q8b", "nhà cấp 4 Q8 ngân sách 6 tỷ, tìm chỗ nào ít ồn")
    assert "yêu cầu hẻm xe hơi" not in _cau_hoi_luot(ai.system[-1])


def test_417_luot_doc_y_biet_so_dang_nhan_va_viec_cua_so_kia():
    """SRS-5.1zzzzzzz417: lượt đọc ý phải thấy số Zalo khách đang nhắn — đổi số thì kèm việc của số kia, để AI tự đọc lời chào là "unknown"."""
    from aioi.prompts import khoi_so_dang_nhan
    eng, spy = _hai_so("anh đang tìm mua nhà quận 8 tầm 7 tỷ", "chào em", khoa="thu-hai-so-417")
    assert any("SỐ ZALO KHÁCH ĐANG NHẮN: số KÝ GỬI" in s and "Chuyện tìm mua / thuê" in s for s in spy.systems)
    assert "Chuyện" not in khoi_so_dang_nhan(True, None) and "số TƯ VẤN" in khoi_so_dang_nhan(True, None)


def test_417_doi_so_thi_khong_giao_luot_cho_form_cua_vai_cu():
    from aioi.engine import Conversation, _form_mua_gon
    from aioi import agent_mua
    from aioi.assistants import assign_assistant
    c = Conversation(user_key="thu-417", assistant=assign_assistant("thu-417"))
    c.role, c.so_vai, c.so_nhan = "buyer", SO_TU_VAN, ""
    assert not _form_mua_gon(c)
    c.so_nhan = SO_TU_VAN
    assert _form_mua_gon(c)
    assert "Chưa có lịch xem nào" in agent_mua.ket_qua_luu_sdt([])
    assert "#AB12" in agent_mua.ket_qua_luu_sdt([{"listing_code": "AB12", "time_text": "9h thứ 7"}])
