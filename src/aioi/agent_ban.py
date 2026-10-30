"""Vòng agent phía BÁN — B2 bước 2 (SRS-5.1zzzzzzz307, chủ dự án 30/10/2026: "làm nốt b2 nhưng vẫn lưu các hàm để dễ gọi").

Lượt viết lời cho người rao không nhét sẵn các khối DỮ LIỆU vào prompt mọi lượt (rổ hàng, bộ nhớ dự án, giá khách đã gửi) — prompt chỉ còn MỘT
dòng báo có dữ liệu gì, model tự gọi công cụ tra khi cần. Thân công cụ là CHÍNH các hàm khối cũ của engine (`_basket_block`,
`_project_memory_block`, `_seller_price_block`) — không viết lại, công tắc tắt thì đường cũ chạy y nguyên. Dự án có bảng căn thì kèm luôn bộ
công cụ kho dự án cũ (`_inventory_tools` / `_exec_tool`). Bóc tách ô vẫn là Haiku + cổng bằng chứng như cũ (không đổi tiền mỗi lượt).

Có trần như phía mua: tối đa `MAX_VONG` lần gọi model, ngừng tra sau `HAN_GIAY` giây; hết trần mà chưa có lời thì viết lời thường kèm kết quả đã
tra. Công tắc `AIOI_AGENT_BAN` (một nguồn `bot/bridge-zca/cai-vps.sh` dòng AGENT_BAN): "bat" = mọi khách, "thu" = chỉ ID thử, khác = tắt."""
from __future__ import annotations

import logging
import os
import time
from typing import Any

log = logging.getLogger(__name__)

MAX_VONG = 3        # lần gọi model tối đa trong một lượt (2 lượt tra + lời cuối) — cùng trần phía mua
HAN_GIAY = 25.0     # trần lõi 40 s, bridge chờ 90 s
TRAN_KET_QUA = 6000

HUONG_DAN = (
    "\n\n=== CÔNG CỤ TRA DỮ LIỆU CỦA KHÁCH (chỉ ĐỌC) ===\n"
    "Dữ liệu dưới đây KHÔNG nằm sẵn trong lời nhắc — dòng \"DỮ LIỆU CÓ THỂ TRA\" ở cuối cho biết lượt này có gì. Tự quyết có cần tra không: "
    "lượt chỉ hỏi / khen một ô tin thì KHÔNG tra.\n"
    "- ro_hang: khách đang có nhiều căn và báo một việc lên 'một căn' (đã bán, đổi giá, có khách…) hoặc nói chưa rõ căn nào. Lời khách "
    "không chỉ ra được căn nào → HỎI LẠI căn nào (nêu địa chỉ các căn để khách chọn), KHÔNG tự nhận là căn nào, KHÔNG nói đã đổi trạng thái.\n"
    "- bo_nho_du_an: khách hỏi / nhắc về dự án, mẫu nhà, phân lô, bảng giá dự án.\n"
    "- gia_da_gui: khách hỏi lại giá căn của họ đã gửi (bảng giá, căn trong rổ).\n"
    "Chỉ nói điều kết quả tra ghi; tra không ra thì nói thật là chưa có, không đoán. Lời gửi khách viết ở lượt cuối, sau khi tra xong; không "
    "viết 'để em tra / em kiểm tra'.\n"
)

CONG_CU: list[dict[str, Any]] = [
    {"name": "ro_hang", "description": "Danh sách các căn trong rổ hàng của khách (căn nào đang nói tới).",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "bo_nho_du_an", "description": "Bộ nhớ dự án của căn đang nói: thông tin chung, mẫu nhà, tài liệu phân lô / bảng giá đã có.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "gia_da_gui", "description": "Giá các căn khách (người rao) đã gửi — từ bảng giá và các căn trong rổ.",
     "input_schema": {"type": "object", "properties": {}}},
]
_TEN = {c["name"] for c in CONG_CU}


def bat(user_key: str | None, la_id_thu: bool) -> bool:
    v = os.environ.get("AIOI_AGENT_BAN", "").strip().lower()
    return v == "bat" or (v == "thu" and la_id_thu)


def _khoi(engine: Any, conv: Any, project: Any, ten: str) -> str:
    """Thân công cụ = hàm khối cũ của engine (giữ nguyên để đường tắt công tắc và công cụ dùng chung một nguồn)."""
    if ten == "ro_hang":
        return engine._basket_block(conv)
    if ten == "bo_nho_du_an":
        return engine._project_memory_block(project, conv)
    if ten == "gia_da_gui":
        return engine._seller_price_block(conv)
    return ""


def goi_y(engine: Any, conv: Any, project: Any) -> str:
    """MỘT dòng cho model biết lượt này có dữ liệu gì để tra (không có gì thì rỗng — model khỏi gọi công cụ thừa)."""
    co = [ten for ten in ("ro_hang", "bo_nho_du_an", "gia_da_gui") if _khoi(engine, conv, project, ten).strip()]
    return ("\nDỮ LIỆU CÓ THỂ TRA lượt này: " + ", ".join(co) + " (gọi công cụ cùng tên khi cần).\n") if co else ""


def chay(engine: Any, conv: Any, project: Any, system: str, max_tokens: int) -> tuple[str, str]:
    """Một lượt trả lời có công cụ. Trả (lời gửi khách, khối kết quả đã tra để các lần soát / gọi lại của lượt dùng tiếp)."""
    from .engine import _AGENT_TOOL_GUIDE
    from .llm.base import RANH_GIOI_CACHE
    kho_du_an = project is not None and bool(getattr(project, "units", None))
    huong_dan = HUONG_DAN + (_AGENT_TOOL_GUIDE if kho_du_an else "")
    he = system.replace(RANH_GIOI_CACHE, huong_dan + RANH_GIOI_CACHE, 1) if RANH_GIOI_CACHE in system else system + huong_dan
    cong_cu = CONG_CU + (engine._inventory_tools() if kho_du_an else [])
    tin: list[dict] = [{"role": m.role, "content": m.content} for m in conv.messages()]
    ket: list[str] = []
    da_goi: list[str] = []
    loi = ""
    bat_dau = time.monotonic()
    for vong in range(MAX_VONG):
        turn = engine._provider.converse(he, tin, cong_cu, max_tokens=max_tokens)
        if not turn.tool_calls:
            loi = (turn.text or "").strip()   # lời cuối — chữ ở lượt có gọi công cụ KHÔNG gửi khách
            break
        if vong == MAX_VONG - 1 or time.monotonic() - bat_dau > HAN_GIAY:
            break
        tin.append({"role": "assistant", "content": turn.assistant_content})
        kq = []
        for c in turn.tool_calls:
            da_goi.append(c.name)
            try:
                r = (_khoi(engine, conv, project, c.name).strip() or "Không có dữ liệu này.") if c.name in _TEN else \
                    engine._exec_tool(conv, project, c) if kho_du_an else "Không rõ công cụ."
            except Exception as e:  # noqa: BLE001 — tra lỗi thì nói thật, lượt vẫn trả lời
                log.warning("Agent bán: công cụ %s lỗi: %s", c.name, type(e).__name__)
                r = "Tra lỗi — nói thật là em chưa tra được, không đoán."
            r = r[:TRAN_KET_QUA]
            ket.append(f"[{c.name}] {r}")
            kq.append({"type": "tool_result", "tool_use_id": c.id, "content": r})
        tin.append({"role": "user", "content": kq})
    them = ("\n\n=== KẾT QUẢ EM VỪA TRA (hệ thống tra, không phải khách nói) ===\n" + "\n".join(ket) + "\n") if ket else ""
    if not loi:
        loi = engine._provider.reply(system + them, conv.messages(), max_tokens=max_tokens).strip()
    # Một dòng mỗi lượt để đo vòng / độ trễ (không in lời khách, không in kết quả tra).
    log.warning("Agent bán: công_cụ=%s giây=%.1f", ",".join(da_goi) or "-", time.monotonic() - bat_dau)
    return loi, them
