"""03/11/2026 (SRS-5.1zzzzzzz371, chủ dự án: "AI đọc lời của khách làm 2 việc cùng lúc, bóc tách ra lưu db và trả lời lại khách" + "gộp đi").
Lượt người bán là MỘT vòng agent: bước 1 gọi công cụ ghi (qua cổng code), engine áp, bước 2 cùng cuộc hội thoại đọc KẾT QUẢ GHI rồi viết lời.
Ca gốc: hai model hai prompt (Haiku bóc tách / Sonnet viết lời) — lời không biết ô nào bị cổng bỏ. Bài `test_buoc_2_doc_ket_qua_ghi_that`
đỏ khi gỡ báo cáo sau khi áp (`agent_gop.bao_cao`) hay gỡ chỗ gọi bước 2 trong engine."""
import json

from aioi import agent_gop
from aioi.config import Settings
from aioi.engine import Engine
from aioi.llm.base import RANH_GIOI_CACHE, ToolCall, ToolTurn
from aioi.llm.mock import MockProvider
from aioi.prompts import GIONG_VUI, OPERATIONS_SYSTEM_BAN, SLANG_NOTES, build_phieu_luot, operations_schema_ban, phieu_co_dinh
from aioi.schema import Property

TIN1 = "anh bán nhà hẻm đường Bùi Minh Trực quận 8 giá 5 tỷ"
TIN2 = "nhà sổ hồng riêng nha em"


class _AiGop(MockProvider):
    """Lượt đầu (vai chưa rõ) đọc bằng form; lượt sau bước 1 trả lần lượt các vòng `vong`, bước 2 ghi lại system / tin rồi trả `loi`."""

    def __init__(self, vong, loi="Sổ hồng riêng thì yên tâm rồi anh."):
        super().__init__(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
        self.vong, self.loi, self.form, self.buoc1, self.buoc2 = list(vong), loi, 0, [], []

    def extract(self, system, messages, json_schema):
        if "operations" in json_schema.get("properties", {}):
            self.form += 1
            bc = {k: TIN1 for k in ("loai_hinh", "duong", "gia")}
            return {"operations": [{"op": "update", "fields": {"loai_hinh": "nha_pho", "duong": "Bùi Minh Trực", "gia": "5 tỷ"},
                                    "bang_chung": bc}], "user_intent": "sell"}
        return super().extract(system, messages, json_schema)

    def converse(self, system, messages, tools, max_tokens=1024):
        ten = {t["name"] for t in tools}
        if "ghi_o" in ten:
            self.buoc1.append((system, list(messages), tools))
            if not self.vong:
                return ToolTurn(text="xong", tool_calls=[])
            calls = [ToolCall(id=f"g{len(self.buoc1)}_{i}", name=n, input=v) for i, (n, v) in enumerate(self.vong.pop(0))]
            return ToolTurn(text="", tool_calls=calls, assistant_content=[{"type": "tool_use", "id": c.id, "name": c.name, "input": c.input}
                                                                         for c in calls], stop_reason="tool_use")
        self.buoc2.append((system, list(messages), tools))
        return ToolTurn(text=self.loi, tool_calls=[])

    def chat(self, system, messages, max_tokens=256):
        return self.loi


def _hai_luot(monkeypatch, key, vong, cong_tac="bat"):
    monkeypatch.setenv("AIOI_AGENT_GOP", cong_tac)
    ai = _AiGop(vong)
    eng = Engine(ai)
    eng.handle(key, TIN1)
    ai.form = 0
    r = eng.handle(key, TIN2)
    return eng, eng.conversation(key), ai, r


VONG_SO_HONG = [
    [("ghi_o", {"fields": {"phap_ly_hoan_cong": "sổ hồng riêng", "noi_that": "đầy đủ"},
                "bang_chung": {"phap_ly_hoan_cong": "sổ hồng riêng", "noi_that": "nội thất cao cấp"}}),
     ("ghi_y_khach", {"user_intent": "sell"})],
    [("ghi_y_khach", {"user_intent": "sell"})],   # model không sửa cụm trích sai → để cổng engine bỏ
]


def test_buoc_2_doc_ket_qua_ghi_that(monkeypatch):
    eng, conv, ai, r = _hai_luot(monkeypatch, "thu-371a", VONG_SO_HONG)
    assert ai.form == 0, "lượt người bán không còn gọi form JSON"
    assert len(ai.buoc1) == 2 and len(ai.buoc2) == 1, "một vòng: hai lần gọi bước ghi (sửa theo kết quả) + một lần viết lời"
    assert conv.prop.fields.get("phap_ly_hoan_cong") == "sổ hồng riêng" and not conv.prop.fields.get("noi_that")
    he, tin, tools = ai.buoc2[0]
    bao = tin[-1]["content"][0]["content"]
    assert tin[-1]["content"][0]["type"] == "tool_result" and tin[-2]["role"] == "assistant"
    assert "ĐÃ GHI" in bao and "sổ hồng riêng" in bao.split("ĐÃ GHI", 1)[1].split("\n", 1)[0]
    assert "KHÔNG GHI" in bao and "đầy đủ" in bao.split("KHÔNG GHI", 1)[1].split("\n", 1)[0]
    assert "VIỆC LƯỢT NÀY:" in bao
    assert agent_gop.DAU_BUOC_2 in he and GIONG_VUI in he and SLANG_NOTES in he, "system bước 2 = phiếu lượt nguyên vẹn + dặn đánh giá"
    assert "ghi_o" not in {t["name"] for t in tools}, "bước 2 chỉ còn công cụ đọc / tra cứu"
    assert r.reply.startswith("Sổ hồng riêng")


def test_buoc_1_dung_phieu_co_dinh_va_cong_cu_ghi(monkeypatch):
    eng, conv, ai, r = _hai_luot(monkeypatch, "thu-371b", VONG_SO_HONG)
    he, tin, tools = ai.buoc1[0]
    assert he.startswith(phieu_co_dinh(conv.assistant.name)) and RANH_GIOI_CACHE in he
    assert {"ghi_o", "them_can", "doi_trang_thai", "bo_can", "ghi_y_khach", "tra_luat_o", "ro_hang"} <= {t["name"] for t in tools}
    assert agent_gop.SUA in ai.buoc1[1][1][-1]["content"][0]["content"], "cụm trích sai báo về model ngay trong vòng"
    assert tin[-1] == {"role": "user", "content": TIN2}


def test_model_khong_goi_cong_cu_thi_form_du_phong(monkeypatch):
    eng, conv, ai, r = _hai_luot(monkeypatch, "thu-371c", [])
    assert ai.form == 1 and not ai.buoc2 and conv.vong_gop is None


def test_cong_tac_tat_giu_duong_cu(monkeypatch):
    eng, conv, ai, r = _hai_luot(monkeypatch, "thu-371d", VONG_SO_HONG, cong_tac="tat")
    assert ai.form == 1 and not ai.buoc1


def test_khong_mat_luat_nao_cua_form():
    """Mọi dòng của OPERATIONS_SYSTEM_BAN có mặt ở system bước 1 / mô tả công cụ / tra_luat_o / phần cố định phiếu lượt (trừ dòng JSON)."""
    schema, chia = operations_schema_ban(), agent_gop.chia_luat()
    tools = agent_gop.cong_cu(schema, chia)
    noi = ("\n".join(k for k in chia["he"]) + json.dumps([t["description"] for t in tools], ensure_ascii=False)
           + "\n".join(agent_gop.tra_luat(k, schema, chia) for k in chia["tra"]) + phieu_co_dinh("A"))
    mo_ta = "\n".join(t["description"] for t in tools)
    thieu = [d for d in OPERATIONS_SYSTEM_BAN.splitlines() if d.strip() and d.strip() != "Trả về JSON đúng schema."
             and d not in noi and d not in mo_ta]
    assert not thieu, thieu[:3]


def test_bang_luat_khong_co_dau_chet():
    """Mỗi dấu trong BANG_LUAT còn khớp một khối của form — form đổi chữ đầu khối thì test báo, không để luật trôi về chỗ mặc định."""
    dau_khoi = [k.lstrip("\n") for k in agent_gop._khoi(OPERATIONS_SYSTEM_BAN.replace(SLANG_NOTES, ""))]
    chet = [d for d, _ in agent_gop.BANG_LUAT if not any(k.startswith(d) for k in dau_khoi)]
    assert not chet, chet


def test_tra_luat_tra_nguyen_mo_ta_schema():
    schema, chia = operations_schema_ban(), agent_gop.chia_luat()
    mo_ta = agent_gop._mo_ta_schema(schema)
    for k in ("dien_tich_dat", "lo_gioi_hem", "duyet_ban_nhap", "hoi_phap_ly", "seller_role"):
        assert mo_ta[k] in agent_gop.tra_luat(k, schema, chia)
    assert "DUYỆT BẢN NHÁP" in agent_gop.tra_luat("duyet_ban_nhap", schema, chia)
    assert "thue_tncn" in agent_gop.tra_luat("hoi_phap_ly", schema, chia)


def test_phieu_luot_khong_doi_chu():
    p = Property()
    he = build_phieu_luot("Lan·Anh", p, "gia")
    assert he.startswith(phieu_co_dinh("Lan·Anh") + RANH_GIOI_CACHE) and GIONG_VUI in he and SLANG_NOTES in he


def test_buoc_1_it_chu_hon_form_cu():
    """Cỡ phần cố định gửi model ở bước ghi (system tĩnh + công cụ) nhỏ hơn form + schema cũ (45.390 chữ, SRS-5.1zzzzzzz371)."""
    schema, chia = operations_schema_ban(), agent_gop.chia_luat()
    tinh = len(phieu_co_dinh("A") + agent_gop.HUONG_DAN_GHI + "\n\n".join(chia["he"]))
    cc = len(json.dumps(agent_gop.cong_cu(schema, chia), ensure_ascii=False))
    assert tinh + cc < len(OPERATIONS_SYSTEM_BAN) + len(json.dumps(schema, ensure_ascii=False))
