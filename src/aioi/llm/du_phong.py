"""Đường dự phòng khi Claude hỏng (SRS-5.1zzzzzzz117). 21/10/2026 tài khoản Anthropic hết số dư lúc 10:14 UTC — từ đó mọi lượt trả lời là
câu giữ chỗ, bot câm với cả khách thật. Lê Quang: "cho key anthropic hết thì qua gemini, hết lun thì qua groq".

Claude vẫn là đường CHÍNH (chủ dự án: "Vẫn haiku"); chỉ khi lượt gọi Claude hỏng vì lỗi mà đổi model chữa được (hết số dư, quá nhịp,
quá tải, quá hạn, 5xx) mới đi tiếp Gemini rồi Groq — cùng prompt, cùng mọi bước kiểm của engine sau lượt model (bằng chứng trong lời
khách, hình thức, không bịa), engine không biết lượt đó đi đường nào. Lỗi khác (sai prompt, sai schema) ném lên như cũ: đổi model
không chữa được, nuốt đi là giấu chỗ hỏng.

Gemini và Groq cùng nói giọng OpenAI (`/chat/completions`) — một đường gọi, hai nguồn. Bài học bot TypeScript cũ (gỡ 18/10, b2f2d44):
Gemini tính phần NGHĨ vào trần chữ → `reasoning_effort: "low"` + trần rộng; Groq (qwen) trả kèm `<think>` → `reasoning_format: "hidden"`
và vẫn cắt lại; model Groq không nhìn được ảnh; PDF chỉ Claude đọc. Groq / Gemini không có bộ nhớ tạm prompt → sổ ghi cache = 0.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from .base import CHI_GEMINI, NGUON_LUOT, LLMProvider, Message, ToolTurn, bo_ranh_gioi
from .claude import chuan_theo_schema

log = logging.getLogger(__name__)

URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
URL_GROQ = "https://api.groq.com/openai/v1/chat/completions"
# Claude báo hết số dư → bỏ qua Claude trong khoảng này (khỏi tốn một lượt gọi hỏng mỗi tin khách); hết khoảng thì thử lại.
NGHI_CLAUDE_GIAY = 300
# SRS-5.1zzzzzzz133 (22/10/2026, Lê Quang: "rút ngắn đi"): theo dõi thật 13:36 — Claude hết số dư, một lượt khách mất hơn 4 phút vì
# vòng dự phòng thử từng khoá × từng model, mỗi lần chờ tới 30 s; bridge chỉ chờ 90 s nên lời bot không bao giờ tới Zalo. Nay: mỗi lần
# gọi tối đa HAN_MOT_LAN_GIAY, cả vòng dự phòng của MỘT lượt gọi model không quá NGAN_SACH_GIAY, và model nào quá hạn thì bỏ luôn các
# khoá còn lại của model đó (chậm là tại model / tải, không tại khoá).
HAN_MOT_LAN_GIAY = 15.0
NGAN_SACH_GIAY = 40.0
# Bản 2 (theo dõi tiếp 13:52): Gemini trả lời quá hạn ở CẢ HAI model → 2 × 20 s chạm ngân sách, Groq chưa bao giờ được thử; lượt thử lại
# nền cũng vậy → khách nhận câu xin lỗi. Nay model quá hạn NGHỈ một lúc (lượt sau đi thẳng model / nguồn kế), và hạn mỗi lần 15 s để hai
# lần quá hạn (30 s) vẫn còn chỗ cho Groq trong 40 s.
NGHI_MODEL_GIAY = 600.0


@dataclass
class Nguon:
    ten: str            # "Gemini" | "Groq"
    url: str
    khoa: list[str]     # nhiều khoá: khoá trước quá nhịp / hết hạn mức thì thử khoá sau
    models: list[str]   # nhiều model: model trước quá nhịp thì thử model sau
    nhin_anh: bool      # Groq: không


class LoiNguon(Exception):
    def __init__(self, msg: str, ma: int = 0):
        super().__init__(msg)
        self.ma = ma


def nen_doi_sang(e: BaseException) -> bool:
    """Lỗi đổi model chữa được: hết số dư / hạn mức, quá nhịp, quá tải, quá hạn, máy chủ lỗi. Cùng danh sách bot TS cũ (`nenDoiSang`)."""
    ma = int(getattr(e, "status_code", 0) or getattr(e, "ma", 0) or getattr(e, "code", 0) or 0)
    s = f"{type(e).__name__} {e}"
    return (ma in (401, 402, 403, 429, 500, 502, 503, 504, 529)
            or bool(re.search(r"credit balance is too low|insufficient|quota|rate.?limit|overloaded|billing|timed? ?out|timeout"
                              r"|APIConnectionError|APITimeoutError|RateLimitError|InternalServerError", s, re.I)))


def _het_so_du(e: BaseException) -> bool:
    return bool(re.search(r"credit balance is too low|billing", str(e), re.I))


def _qua_han(e: BaseException) -> bool:
    """Lượt gọi nguồn dự phòng quá hạn chờ (urllib: URLError bọc socket.timeout, hoặc TimeoutError thẳng từ lúc đọc)."""
    ly_do = getattr(e, "reason", None)
    return isinstance(e, TimeoutError) or isinstance(ly_do, TimeoutError) or bool(re.search(r"timed? ?out", f"{e} {ly_do or ''}", re.I))


def _bo_nghi(chu: str) -> str:
    """Model suy luận có lượt trả kèm đoạn nghĩ (bắt tại trận 10/09 ở bot cũ: "<think> Here's a thinking process…" tới tận chủ nhà)."""
    chu = re.sub(r"<think>.*?</think>", "", chu or "", flags=re.S | re.I)
    return re.sub(r"^.*?</think>", "", chu, flags=re.S | re.I).strip()


def _json_dau(chu: str) -> Any:
    """Giá trị JSON đầu tiên trong chữ model trả (bỏ ```json``` và chữ thừa)."""
    chu = _bo_nghi(chu)
    mo = min((i for i in (chu.find("{"), chu.find("[")) if i >= 0), default=-1)
    if mo < 0:
        raise ValueError("không có JSON")
    return json.JSONDecoder(strict=False).raw_decode(chu[mo:])[0]


class DuPhongProvider(LLMProvider):
    """Claude trước; lỗi đổi model chữa được thì Gemini rồi Groq. `goi` (thử nghiệm) thay đường HTTP."""

    def __init__(self, chinh: LLMProvider, nguon: list[Nguon], so: Any = None, goi: Any = None):
        self._chinh = chinh
        self._nguon = [n for n in nguon if n.khoa and n.models]
        self._so = so
        self._goi_http = goi or self._http
        self._nghi_den = 0.0
        self._loi_nghi: BaseException | None = None
        self._bao_luc = 0.0
        self._nghi_model: dict[tuple[str, str], float] = {}   # (nguồn, model) quá hạn → bỏ qua tới mốc này

    # --- chọn đường -----------------------------------------------------------------------------

    def _thu(self, viec: str, goi_chinh, goi_phu, can_anh: bool = False):
        chi_gemini = NGUON_LUOT.get() == CHI_GEMINI   # SRS-5.1zzzzzzz239: lượt bắn thử — không gọi Claude, chỉ Gemini
        loi_chinh: BaseException | None = self._loi_nghi if time.time() < self._nghi_den else None
        if chi_gemini:
            loi_chinh = None
        elif time.time() >= self._nghi_den:
            try:
                return goi_chinh()
            except Exception as e:  # noqa: BLE001 — chỉ đổi đường với lỗi đổi model chữa được; còn lại ném lên
                if not (self._nguon and nen_doi_sang(e)):
                    raise
                loi_chinh = e
                if _het_so_du(e):
                    self._nghi_den, self._loi_nghi = time.time() + NGHI_CLAUDE_GIAY, e
        loi = loi_chinh
        bat_dau = time.time()
        for n in self._nguon:
            if (can_anh and not n.nhin_anh) or (chi_gemini and n.ten != "Gemini"):
                continue
            for model in n.models:
                if time.time() < self._nghi_model.get((n.ten, model), 0.0):
                    continue   # model này vừa quá hạn — nghỉ, khỏi tốn thêm một lần chờ
                for khoa in n.khoa:
                    if time.time() - bat_dau > NGAN_SACH_GIAY:
                        log.warning("Dự phòng (%s): quá ngân sách %.0f s — dừng, không thử tiếp", viec, NGAN_SACH_GIAY)
                        raise loi or RuntimeError("dự phòng quá ngân sách thời gian")
                    try:
                        kq = goi_phu(n, model, khoa)
                        self._bao(viec, n, model, loi_chinh, ghi_so=not chi_gemini)
                        return kq
                    except Exception as e:  # noqa: BLE001
                        loi = e
                        log.warning("Dự phòng %s/%s (%s) hỏng: %s", n.ten, model, viec, type(e).__name__)
                        if not nen_doi_sang(e) and not isinstance(e, (ValueError, LoiNguon, urllib.error.URLError, OSError)):
                            raise
                        if _qua_han(e):
                            self._nghi_model[(n.ten, model)] = time.time() + NGHI_MODEL_GIAY
                            break   # model này chậm → khoá khác cũng chậm như vậy; sang model / nguồn kế
        raise loi_chinh or loi or RuntimeError("không còn đường gọi model")

    def _bao(self, viec: str, n: Nguon, model: str, loi_chinh: BaseException | None, ghi_so: bool = True) -> None:
        """Mỗi lượt chạy dự phòng một dòng log (chỉ tên); sổ lỗi tối đa 10 phút một dòng — còi sức khoẻ biết đang chạy dự phòng.
        Lượt bắn thử chỉ-Gemini (SRS-5.1zzzzzzz239) không ghi sổ: Claude không hỏng, ghi là báo động giả (SRS-5.1zzzzzzz241)."""
        log.warning("Dự phòng: %s → %s/%s", viec, n.ten, model)
        if ghi_so and self._so is not None and time.time() - self._bao_luc > 600:
            self._bao_luc = time.time()
            ly_do = ("hết số dư" if _het_so_du(loi_chinh) else type(loi_chinh).__name__) if loi_chinh else "?"
            self._so.ghi_loi("du phong", f"Claude hỏng ({ly_do}) — đang trả lời bằng {n.ten}/{model}")

    # --- HTTP giọng OpenAI ----------------------------------------------------------------------

    def _http(self, n: Nguon, khoa: str, than: dict[str, Any], han: float) -> dict[str, Any]:
        req = urllib.request.Request(n.url, data=json.dumps(than).encode("utf-8"),
                                     headers={"Authorization": f"Bearer {khoa}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=han) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise LoiNguon(f"{n.ten} HTTP {e.code}", e.code) from None

    def _hoi(self, n: Nguon, model: str, khoa: str, system: str, tin: list[dict[str, Any]], max_tokens: int,
             schema: dict[str, Any] | None = None) -> str:
        system = bo_ranh_gioi(system)   # dấu cắt cache chỉ dành cho Claude (SRS-5.1zzzzzzz166)
        than: dict[str, Any] = {"model": model, "messages": [{"role": "system", "content": system}, *tin],
                                "max_completion_tokens": max(max_tokens, 900), "temperature": 0.6}
        if n.ten == "Groq":
            than["reasoning_format"] = "hidden"
        else:
            than["reasoning_effort"] = "low"
            than["max_completion_tokens"] = max(max_tokens, 1500)
        if schema is not None:
            than["response_format"] = {"type": "json_schema", "json_schema": {"name": "ket_qua", "schema": schema, "strict": False}}
        han = min(HAN_MOT_LAN_GIAY, max(10.0, 8.0 + than["max_completion_tokens"] * 0.008))
        try:
            j = self._goi_http(n, khoa, than, han)
        except LoiNguon as e:
            if schema is None or e.ma != 400:
                raise
            # Schema của mình không theo khuôn strict của nguồn (ô tuỳ chọn, additionalProperties) → xin JSON bằng lời.
            than.pop("response_format", None)
            than["messages"][0] = {"role": "system", "content": system + "\n\nTRẢ VỀ DUY NHẤT MỘT JSON đúng schema sau, không chữ "
                                   "nào khác:\n" + json.dumps(schema, ensure_ascii=False)}
            j = self._goi_http(n, khoa, than, han)
        chu = str(((j.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
        u = j.get("usage") or {}
        if self._so is not None and hasattr(self._so, "ghi_du_phong"):
            self._so.ghi_du_phong(f"{n.ten}:{model}", int(u.get("prompt_tokens") or 0), int(u.get("completion_tokens") or 0))
        return chu

    @staticmethod
    def _tin(messages: list[Message]) -> list[dict[str, Any]]:
        return [{"role": m.role, "content": m.content} for m in messages]

    # --- bề mặt LLMProvider ---------------------------------------------------------------------

    def chat(self, system: str, messages: list[Message], max_tokens: int = 256) -> str:
        return self._thu("chat", lambda: self._chinh.chat(system, messages, max_tokens),
                         lambda n, m, k: self._chu(n, m, k, system, messages, max_tokens))

    def reply(self, system: str, messages: list[Message], max_tokens: int = 256) -> str:
        return self._thu("reply", lambda: self._chinh.reply(system, messages, max_tokens),
                         lambda n, m, k: self._chu(n, m, k, system, messages, max_tokens))

    def _chu(self, n: Nguon, model: str, khoa: str, system: str, messages: list[Message], max_tokens: int) -> str:
        chu = _bo_nghi(self._hoi(n, model, khoa, system, self._tin(messages), max_tokens))
        if not chu:
            raise ValueError(f"{n.ten} trả lời rỗng")
        return chu

    def extract(self, system: str, messages: list[Message], json_schema: dict[str, Any]) -> dict[str, Any]:
        def phu(n: Nguon, model: str, khoa: str) -> dict[str, Any]:
            v = _json_dau(self._hoi(n, model, khoa, system, self._tin(messages), 4096, json_schema))
            if not isinstance(v, dict):
                raise ValueError(f"{n.ten} trả JSON không phải object")
            return chuan_theo_schema(v, json_schema)
        return self._thu("extract", lambda: self._chinh.extract(system, messages, json_schema), phu)

    def converse(self, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]],
                 max_tokens: int = 1024) -> ToolTurn:
        # Vòng công cụ chỉ Claude chạy; dự phòng trả lời chữ không gọi công cụ (vòng lặp của engine vẫn dừng đúng).
        msgs = [Message(m["role"], m["content"]) for m in messages if isinstance(m.get("content"), str)]
        return self._thu("converse", lambda: self._chinh.converse(system, messages, tools, max_tokens),
                         lambda n, m, k: ToolTurn(text=self._chu(n, m, k, system, msgs, max_tokens), tool_calls=[]))

    @staticmethod
    def _anh(items: list[tuple[bytes, str]]) -> list[dict[str, Any]]:
        if any(not str(mime).startswith("image/") for _, mime in items):
            raise ValueError("dự phòng chỉ đọc ảnh, không đọc PDF / tệp khác")
        return [{"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(b).decode('ascii')}"}}
                for b, mime in items]

    def describe_media(self, items: list[tuple[bytes, str]], instruction: str, max_tokens: int = 1024) -> str:
        def phu(n: Nguon, model: str, khoa: str) -> str:
            tin = [{"role": "user", "content": [*self._anh(items), {"type": "text", "text": instruction}]}]
            chu = _bo_nghi(self._hoi(n, model, khoa, "Đọc ảnh BĐS khách gửi, trả lời tiếng Việt, chỉ điều nhìn thấy.", tin, max_tokens))
            if not chu:
                raise ValueError(f"{n.ten} đọc ảnh rỗng")
            return chu
        return self._thu("describe_media", lambda: self._chinh.describe_media(items, instruction, max_tokens), phu, can_anh=True)

    def group_media(self, items: list[tuple[bytes, str]], labels: list[str], instruction: str,
                    json_schema: dict[str, Any]) -> dict[str, Any]:
        def phu(n: Nguon, model: str, khoa: str) -> dict[str, Any]:
            noi = [x for (b, mime), nhan in zip(items, labels) for x in ({"type": "text", "text": f"Tệp: {nhan}"},
                                                                         *self._anh([(b, mime)]))]
            tin = [{"role": "user", "content": [*noi, {"type": "text", "text": instruction}]}]
            v = _json_dau(self._hoi(n, model, khoa, instruction, tin, 4096, json_schema))
            return chuan_theo_schema(v, json_schema) if isinstance(v, dict) else {}
        return self._thu("group_media", lambda: self._chinh.group_media(items, labels, instruction, json_schema), phu, can_anh=True)

    def _phu_doc_anh(self, items: list[tuple[bytes, str]], instruction: str, json_schema: dict[str, Any]):
        def phu(n: Nguon, model: str, khoa: str) -> dict[str, Any]:
            tin = [{"role": "user", "content": [*self._anh(items), {"type": "text", "text": instruction}]}]
            v = _json_dau(self._hoi(n, model, khoa, instruction, tin, 4096, json_schema))
            return chuan_theo_schema(v, json_schema) if isinstance(v, dict) else {}
        return phu

    def extract_media(self, items: list[tuple[bytes, str]], instruction: str, json_schema: dict[str, Any]) -> dict[str, Any]:
        return self._thu("extract_media", lambda: self._chinh.extract_media(items, instruction, json_schema),
                         self._phu_doc_anh(items, instruction, json_schema), can_anh=True)

    def extract_media_re(self, items: list[tuple[bytes, str]], instruction: str, json_schema: dict[str, Any]) -> dict[str, Any]:
        """Đọc ảnh RẺ (sticker, SRS-5.1zzzzzzz122): nguồn dự phòng miễn phí nhìn được ảnh (Gemini) TRƯỚC, Claude sau cùng khi tất cả hỏng."""
        phu = self._phu_doc_anh(items, instruction, json_schema)
        for n in self._nguon:
            if not n.nhin_anh:
                continue
            for model in n.models:
                for khoa in n.khoa:
                    try:
                        return phu(n, model, khoa)
                    except Exception as e:  # noqa: BLE001
                        log.warning("đọc ảnh rẻ: %s lỗi (%s) — thử tiếp", n.ten, type(e).__name__)
        return self._chinh.extract_media(items, instruction, json_schema)

    def __getattr__(self, ten: str) -> Any:   # thuộc tính riêng của Claude (vd _so, _chat_model) — chuyển xuống đường chính
        if ten == "_chinh":
            raise AttributeError(ten)
        return getattr(self._chinh, ten)
