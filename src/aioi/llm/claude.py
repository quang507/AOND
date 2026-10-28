"""Claude (Anthropic) implementation of the LLM abstraction.

Defaults: Haiku 4.5 for fast 30-word chat, Opus 4.8 for vision/OCR-grade extraction.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import unicodedata
from typing import Any

from ..config import Settings
from ..imaging import downscale_image
from ..so_token import SoToken
from .base import MODEL_CHAT_LUOT, LLMProvider, Message, ToolCall, ToolTurn, tach_on_dinh

log = logging.getLogger(__name__)


def _doc_mang_chiu_loi(s: str) -> list[Any]:
    """Đọc mảng JSON mà Haiku đóng ngoặc lệch: thừa `}` trước `]` (log khung bắn thử: `…}}}]`, lỗi ở 2 ký tự cuối, gọi lại ra y
    hệt). Đọc lần lượt từng phần tử, bỏ qua dấu `}` / `,` / khoảng trắng lạc giữa các phần tử; hỏng chỗ khác thì ném ValueError."""
    dec = json.JSONDecoder(strict=False)
    i = s.index("[") + 1
    ra: list[Any] = []
    while True:
        while i < len(s) and s[i] in " \t\r\n,}":
            i += 1
        if i >= len(s) or s[i] == "]":
            return ra
        x, i = dec.raw_decode(s, i)
        ra.append(x)


def chuan_theo_schema(v: Any, schema: dict[str, Any]) -> Any:
    """Đưa đầu ra công cụ về đúng dạng schema đã khai. 19/10/2026 (SRS-5.1zzzzzzz78): Haiku có lượt trả cả danh sách `operations`
    thành MỘT CHUỖI JSON (log bắn thử: 300 phần tử 'str') — code lọc `isinstance(op, dict)` bỏ sạch, mọi ô của lượt đó mất ("diện
    tích sàn tầm 170m vuông" không được ghi). Ô schema là object / array mà model trả chuỗi JSON thì giải; giải không được thì để
    nguyên cho chỗ dùng tự lọc. Chỉ đọc theo schema, không đoán nội dung."""
    t = (schema or {}).get("type")
    if t in ("object", "array") and isinstance(v, str):
        # Bắn thử sau bản đầu: chuỗi vẫn còn — không phải JSON chặt (ký tự xuống dòng trần trong chuỗi, chữ thừa sau dấu đóng).
        # Nhận ký tự điều khiển (strict=False) và đọc giá trị JSON đầu tiên từ dấu mở ngoặc, bỏ đuôi thừa.
        mo = min((i for i in (v.find("["), v.find("{")) if i >= 0), default=-1)
        try:
            try:
                v = json.JSONDecoder(strict=False).raw_decode(v[mo:] if mo >= 0 else v)[0]
            except ValueError:
                if t != "array":
                    raise
                v = _doc_mang_chiu_loi(v)
        except ValueError as e:
            # Khung của chuỗi (chữ / số → x, gộp lặp) + vị trí lỗi: thấy hỏng kiểu gì mà không lộ dữ liệu khách.
            khung = re.sub(r"x+", "x", re.sub(r"[^\[\]{}\":,'\\\n]", "x", v))[:240]
            log.warning("Đầu ra công cụ: ô %s là chuỗi không giải được (%s tại %s, dài %d) khung=%r", t, type(e).__name__,
                        getattr(e, "pos", "?"), len(v), khung)
            return v
    if t == "object" and isinstance(v, dict):
        props = schema.get("properties") or {}
        them = schema.get("additionalProperties")
        return {k: chuan_theo_schema(x, props.get(k) or (them if isinstance(them, dict) else {})) for k, x in v.items()}
    if t == "array" and isinstance(v, list):
        return [chuan_theo_schema(x, schema.get("items") or {}) for x in v]
    return v


def _bo_dau(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").replace("đ", "d")


_GUI_KHACH: dict[str, Any] = {
    "name": "gui_khach",
    "description": "Gửi lời trả lời cho khách qua Zalo. Mọi lượt trả lời khách đều đi qua công cụ này.",
    "input_schema": {
        "type": "object",
        "properties": {
            "tu_soat": {
                "type": "string",
                "description": "Ghi chú NỘI BỘ, KHÔNG gửi khách: soát nhanh lời sắp gửi theo luật (đúng một ý hỏi, không khen bịa, "
                               "xưng hô đúng, không hỏi lại điều khách đã nói; chữ ĐẦU TIÊN của lời là việc em vừa làm, không phải từ đệm; "
                               "mở bằng MỘT lời khen ngắn gắn với điều khách vừa nói — KHÔNG câu ghi nhận, KHÔNG kể lại con số / chi tiết khách vừa nói). Sai thì sửa ngay trong "
                               "loi_gui_khach. Ngắn.",
            },
            "loi_gui_khach": {
                "type": "string",
                "description": "NGUYÊN VĂN lời gửi khách, bản cuối đã theo mọi luật. Chỉ lời nói với khách — không ghi chú, không nói "
                               "về luật hay về việc sửa lời. Câu đầu mở bằng nội dung — việc em vừa làm, gọn, lễ phép, không tua lại lời "
                               "khách (vd \"Em sửa giá còn 24 tỷ cho chị rồi.\" hoặc một lời khen ngắn về điều khách vừa nói — KHÔNG \"Em ghi nhận / Em lưu rồi\"); không mở đầu giống hệt lượt trước.",
            },
        },
        "required": ["tu_soat", "loi_gui_khach"],
    },
}


def ep_cong_cu_gui_khach() -> bool:
    """SRS-5.1zzzzzzz246 (chủ dự án 28/10/2026: "bạn thử tắt công cụ cố định xem"): env `AIOI_CONG_CU_GUI_KHACH=tat` → lượt trả lời khách là
    chữ thường như bản anh Luận, không qua công cụ hai ô `gui_khach` (SRS-76). Một nguồn ở `bot/bridge-zca/cai-vps.sh` dòng CONG_CU_GUI_KHACH."""
    return os.environ.get("AIOI_CONG_CU_GUI_KHACH", "").strip().lower() != "tat"


class ClaudeProvider(LLMProvider):
    def __init__(self, settings: Settings):
        import anthropic  # imported lazily so offline/mock runs need no SDK

        # Bounded timeout + one retry so a blocked/slow network fails fast in dev instead of
        # hanging on the SSL read (default SDK timeout is 10 minutes). 120s gives long vision
        # jobs (full multi-page document transcription, up to several thousand tokens) room.
        self._client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=120.0,
            max_retries=1,
        )
        self._chat_model = settings.chat_model
        self._extract_model = settings.extract_model  # cheap model for structured extraction/ops
        self._vision_model = settings.vision_model  # Opus 4.8 for vision/OCR-grade reads
        # Mỗi lượt gọi ghi token + model thật vào sổ Supabase (cong_token) để /admin quy ra đô (SRS-5.1zzzzzzz49).
        self._so = SoToken.tu_cau_hinh(settings.supabase_url, settings.supabase_service_role_key)
        # SRS-5.1zzzzzzz244: model API từ chối tool_choice ép một công cụ ("tool_choice: type tool and any are not supported" — bắn thử
        # Sonnet 5.5 28/10, mọi lượt chat 400) → nhớ model đó, các lượt sau gửi tool_choice auto.
        self._khong_ep_tool: set[str] = set()

    def _tao(self, nhan: str, **kw: Any) -> Any:
        """messages.create + báo sổ lỗi khi API từ chối (hết số dư, quá tải…) rồi ném lên như cũ (SRS-5.1zzzzzzz56).
        Model không nhận tool_choice ép công cụ (SRS-5.1zzzzzzz244) → gửi lại một lần với tool_choice auto, nhớ model cho các lượt sau."""
        ep = isinstance(kw.get("tool_choice"), dict) and kw["tool_choice"].get("type") in ("tool", "any")
        if ep and kw.get("model") in self._khong_ep_tool:
            kw = {**kw, "tool_choice": {"type": "auto"}}
            ep = False
        try:
            return self._client.messages.create(**kw)
        except Exception as e:
            if ep and "tool_choice" in str(e) and "not supported" in str(e):
                self._khong_ep_tool.add(str(kw.get("model")))
                log.warning("Model %s không nhận tool_choice ép công cụ — chuyển sang auto", kw.get("model"))
                return self._tao(nhan, **kw)
            self._so.bao_loi(nhan, e)
            raise

    @staticmethod
    def _sys(system: str) -> list[dict[str, Any]]:
        """Wrap the system prompt as cacheable block(s). The system (persona + the big project
        MEMORY block) is re-sent on every extract call and every agent-loop step; prompt caching
        makes those repeats ~10% of the input cost, with NO change to the output. Ephemeral cache
        lives ~5 min — long enough for a loop turn and back-to-back messages in one conversation.

        SRS-5.1zzzzzzz166: chỗ dựng prompt đặt `RANH_GIOI_CACHE` sau đoạn chữ cố định thì cắt hai khối — điểm cache thứ nhất ở cuối
        khối ổn định (lượt sau, khách khác dùng lại được dù đuôi đổi), điểm thứ hai ở cuối cả chuỗi (gọi lại trong CÙNG lượt vẫn trúng
        như trước). Không có dấu thì một khối như cũ. Khối rỗng bị API từ chối nên bỏ."""
        on_dinh, dong = tach_on_dinh(system)
        # SRS-5.1zzzzzzz213 (26/10, nhật ký 5 khách: mỗi lượt chat cache_w 600–4.000 token cho ĐUÔI đổi mỗi lượt, chưa kể lượt gọi lại
        # nối thêm "=== VIẾT LẠI ===" nên đuôi không bao giờ được đọc lại): đuôi KHÔNG đặt điểm cache — ghi cache đắt 1,25 lần token
        # thường, đọc lại mới rẻ; thứ không ai đọc lại thì đừng ghi. Chỉ khối ổn định trước dấu có điểm cache. Không có dấu → một khối
        # có cache như cũ (lượt lập thao tác / prompt chưa đặt dấu).
        if not dong.strip():
            return [{"type": "text", "text": on_dinh if on_dinh.strip() else (system or " "), "cache_control": {"type": "ephemeral"}}]
        khoi: list[dict[str, Any]] = []
        if on_dinh.strip():
            khoi.append({"type": "text", "text": on_dinh, "cache_control": {"type": "ephemeral"}})
        khoi.append({"type": "text", "text": dong})
        return khoi

    def chat(self, system: str, messages: list[Message], max_tokens: int = 256) -> str:
        resp = self._tao("chat",
            model=MODEL_CHAT_LUOT.get() or self._chat_model,
            max_tokens=max_tokens,
            system=self._sys(system),
            messages=[{"role": m.role, "content": m.content} for m in messages],
        )
        self._so.ghi("chat", MODEL_CHAT_LUOT.get() or self._chat_model, resp)
        return "".join(b.text for b in resp.content if b.type == "text").strip()

    def reply(self, system: str, messages: list[Message], max_tokens: int = 256) -> str:
        # 19/10/2026 (SRS-5.1zzzzzzz76): lời trả lời là chữ tự do thì model không có chỗ tự soát luật — khách từng nhận "Wait, the
        # system prohibits…" và "Lưu ý: vi phạm quy tắc một câu hỏi. Sửa lại: …". Nay model PHẢI gọi công cụ hai ô: ghi chú tự soát
        # (không gửi) rồi lời gửi khách; chỉ ô sau tới khách. Không lọc chữ ở đầu ra.
        # Bắn thử 19/10: một lượt ra rỗng → khách nhận câu dự phòng "kết nối mạng vừa gián đoạn". Ô lời gửi khách trống thì gọi lại một
        # lần và ghi sổ lỗi (chỉ lý do + tên ô, không nội dung).
        cong_cu = ({"tools": [_GUI_KHACH], "tool_choice": {"type": "tool", "name": _GUI_KHACH["name"]}}
                   if ep_cong_cu_gui_khach() else {})   # SRS-5.1zzzzzzz246: tắt thì gọi chữ thường
        for lan in range(2):
            resp = self._tao("chat",
                model=MODEL_CHAT_LUOT.get() or self._chat_model,
                max_tokens=max_tokens + 300,
                system=self._sys(system),
                messages=[{"role": m.role, "content": m.content} for m in messages],
                **cong_cu,
            )
            self._so.ghi("chat", MODEL_CHAT_LUOT.get() or self._chat_model, resp)
            o = next((dict(b.input or {}) for b in resp.content if b.type == "tool_use"), {})
            # Bắn thử 20/10: Haiku gõ tên ô có dấu ("loi_gui_khách") → lời rỗng, tốn một lượt gọi lại. Nhận tên ô theo chữ bỏ dấu.
            loi = str(next((v for k, v in o.items() if _bo_dau(k) == "loi_gui_khach"), "") or "").strip()
            if not loi and not o:   # SRS-5.1zzzzzzz244: tool_choice auto, model trả chữ thường không gọi công cụ → lấy chữ đó
                loi = "".join(b.text for b in resp.content if b.type == "text").strip()
                if cong_cu:
                    log.warning("Lời gửi khách: chữ thường, model không gọi gui_khach")   # SRS-5.1zzzzzzz245: đếm đường nào được dùng (không in lời)
            if loi:
                return loi
            self._so.ghi_loi("claude chat", f"lời gửi khách rỗng (lần {lan + 1}): stop={getattr(resp, 'stop_reason', '?')}, "
                                            f"ô={sorted(o)}")
        return ""

    def extract(
        self, system: str, messages: list[Message], json_schema: dict[str, Any]
    ) -> dict[str, Any]:
        # Tool-based extraction: force a single tool call whose input IS the
        # structured result. More robust and faster than output_config here.
        # 19/10/2026 (SRS-5.1zzzzzzz76): trần 1024 → 4096. Lượt lập thao tác kê lại MỌI ô kèm cụm trích bằng chứng (SRS-5.1zzzzzzz73)
        # trên cả hội thoại; bắn thử: tới lượt 9 ô vừa nói ("diện tích sàn tầm 170m vuông") không vào kế hoạch, không dòng "Bỏ ô" nào.
        resp = self._tao("extract",
            model=self._extract_model,
            max_tokens=4096,
            system=self._sys(system),
            messages=[{"role": m.role, "content": m.content} for m in messages],
            tools=[
                {
                    "name": "save_property_data",
                    "description": "Lưu các trường thông tin BĐS trích xuất được từ hội thoại.",
                    "input_schema": json_schema,
                }
            ],
            tool_choice={"type": "tool", "name": "save_property_data"},
        )
        self._so.ghi("extract", self._extract_model, resp)
        if getattr(resp, "stop_reason", None) == "max_tokens":
            self._so.ghi_loi("claude extract", "kết quả bóc tách bị cắt vì chạm trần token — ô cuối có thể mất")
        for block in resp.content:
            if block.type == "tool_use":
                return chuan_theo_schema(dict(block.input), json_schema)
        return {}

    def converse(
        self, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]],
        max_tokens: int = 1024,
    ) -> ToolTurn:
        # One turn of native tool use. The engine appends the returned assistant_content and the
        # tool_results, then calls again — a manual agentic loop (fine-grained control so the
        # engine gates/verifies every tool). tools are plain Claude tool defs.
        resp = self._tao("agent",
            model=MODEL_CHAT_LUOT.get() or self._chat_model,
            max_tokens=max_tokens,
            system=self._sys(system),
            messages=messages,
            tools=tools,
        )
        self._so.ghi("agent", MODEL_CHAT_LUOT.get() or self._chat_model, resp)
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        calls = [ToolCall(id=b.id, name=b.name, input=dict(b.input))
                 for b in resp.content if b.type == "tool_use"]  # CUSTOM tools only (server tools
        # like web_search run server-side and land in resp.content already — nothing to execute).
        return ToolTurn(text=text, tool_calls=calls, assistant_content=resp.content,
                        stop_reason=resp.stop_reason or "end_turn")

    def describe_media(self, items: list[tuple[bytes, str]], instruction: str,
                       max_tokens: int = 1024) -> str:
        # Vision/OCR read on the Opus 4.8 model. Images are downscaled first (the API
        # has its own per-image size limits); a PDF goes as a document block. Multiple
        # files are read in ONE call so a batch costs a single request. `max_tokens` is
        # raised for full-document transcription (a multi-page phân lô needs headroom).
        content: list[dict[str, Any]] = []
        for data, media_type in items:
            if media_type == "application/pdf":
                b64 = base64.standard_b64encode(data).decode("ascii")
                content.append({
                    "type": "document",
                    "source": {"type": "base64", "media_type": media_type, "data": b64},
                })
            else:
                small, small_type = downscale_image(data, media_type)
                b64 = base64.standard_b64encode(small).decode("ascii")
                content.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": small_type, "data": b64},
                })
        content.append({"type": "text", "text": instruction})
        resp = self._tao("vision",
            model=self._vision_model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": content}],
        )
        self._so.ghi("vision", self._vision_model, resp)
        return "".join(b.text for b in resp.content if b.type == "text").strip()

    def group_media(
        self,
        items: list[tuple[bytes, str]],
        labels: list[str],
        instruction: str,
        json_schema: dict[str, Any],
    ) -> dict[str, Any]:
        # A text label right before each image/doc lets the model refer back to it by
        # filename in its grouping — the API has no other way to tag an image block.
        content: list[dict[str, Any]] = []
        for (data, media_type), label in zip(items, labels):
            content.append({"type": "text", "text": f"--- Tệp: {label} ---"})
            if media_type == "application/pdf":
                b64 = base64.standard_b64encode(data).decode("ascii")
                content.append({
                    "type": "document",
                    "source": {"type": "base64", "media_type": media_type, "data": b64},
                })
            else:
                small, small_type = downscale_image(data, media_type)
                b64 = base64.standard_b64encode(small).decode("ascii")
                content.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": small_type, "data": b64},
                })
        content.append({"type": "text", "text": instruction})
        resp = self._tao("group",
            model=self._vision_model,
            max_tokens=1536,
            messages=[{"role": "user", "content": content}],
            tools=[
                {
                    "name": "nhom_tep_theo_can",
                    "description": "Nhóm các tệp ảnh/tài liệu theo từng căn hoặc theo thông tin chung dự án.",
                    "input_schema": json_schema,
                }
            ],
            tool_choice={"type": "tool", "name": "nhom_tep_theo_can"},
        )
        self._so.ghi("group", self._vision_model, resp)
        for block in resp.content:
            if block.type == "tool_use":
                return chuan_theo_schema(dict(block.input), json_schema)
        return {"nhom": []}

    def extract_media(
        self, items: list[tuple[bytes, str]], instruction: str, json_schema: dict[str, Any]
    ) -> dict[str, Any]:
        content: list[dict[str, Any]] = []
        for data, media_type in items:
            if media_type == "application/pdf":
                b64 = base64.standard_b64encode(data).decode("ascii")
                content.append({
                    "type": "document",
                    "source": {"type": "base64", "media_type": media_type, "data": b64},
                })
            else:
                small, small_type = downscale_image(data, media_type)
                b64 = base64.standard_b64encode(small).decode("ascii")
                content.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": small_type, "data": b64},
                })
        content.append({"type": "text", "text": instruction})
        resp = self._tao("read-doc",
            model=self._vision_model,
            max_tokens=4096,  # a price list can have many rows
            messages=[{"role": "user", "content": content}],
            tools=[{"name": "luu_du_lieu", "description": "Lưu dữ liệu trích xuất từ tài liệu.",
                    "input_schema": json_schema}],
            tool_choice={"type": "tool", "name": "luu_du_lieu"},
        )
        self._so.ghi("read-doc", self._vision_model, resp)
        for block in resp.content:
            if block.type == "tool_use":
                return chuan_theo_schema(dict(block.input), json_schema)
        return {}
