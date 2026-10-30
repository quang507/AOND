"""Agent bóc tách phía BÁN — kế hoạch bước 3 (SRS-5.1zzzzzzz310, chủ dự án 30/10/2026: "các công cụ đơn giản thì viết trước sau đó … chỉ chọn
để chạy", "chuyển sang sonnet 5.5 luôn").

Lượt đọc ý người bán không trả MỘT khối JSON lớn (form `OPERATIONS_SYSTEM_BAN` + schema) nữa mà gọi công cụ do code viết sẵn: `ghi_o`
(update), `them_can` (add), `doi_trang_thai` (set_status), `bo_can` (remove / keep_only / clear), `ghi_y_khach` (các khoá cấp kế hoạch: vai,
duyệt bản nháp, xin đăng, hỏi về, cần người thật…). Đầu vào mỗi công cụ CẮT từ chính schema form (một nguồn định nghĩa ô), luật đọc ý vẫn là văn
form bán gọn. Code kiểm từng lần gọi và trả kết quả để model sửa ngay trong lượt: cụm trích không nằm trong lời khách → báo bỏ ô; đổi trạng
thái khi rổ ≥ 2 căn mà lời khách chưa chỉ ra căn nào → KHÔNG đổi, lời trả lời hỏi lại căn nào. Kết quả gom lại thành đúng dạng kế hoạch cũ —
áp dụng vẫn qua `Engine._ap_dung_ke_hoach` / `_loc_o_tin` (cổng bằng chứng không đổi).

Công tắc `AIOI_AGENT_BOC` (một nguồn `bot/bridge-zca/cai-vps.sh` dòng AGENT_BOC): "bat" = mọi khách, "thu" = chỉ ID thử, khác = form cũ. Model
lỗi / dự phòng không gọi được công cụ → trả None, engine đọc bằng form cũ."""
from __future__ import annotations

import copy
import logging
import os
import time
from typing import Any

log = logging.getLogger(__name__)

SUA = "Sẽ BỎ"      # dấu trong kết quả công cụ: model cần sửa cụm trích (mở thêm một vòng)
MAX_VONG = 3        # lần gọi model tối đa (gọi công cụ → sửa theo kết quả → xong)
HAN_GIAY = 25.0

HUONG_DAN = (
    "\n\n=== CÁCH GHI (gọi công cụ, KHÔNG trả JSON) ===\n"
    "Đọc tin khách theo luật trên rồi GỌI CÔNG CỤ cho từng việc — gọi hết các công cụ cần trong MỘT lượt:\n"
    "- ghi_o = thao tác update (target / fields / bang_chung như trên); them_can = add; doi_trang_thai = set_status; bo_can = remove / "
    "keep_only / clear; ghi_y_khach = mọi khoá còn lại (seller_role, user_intent, duyet_ban_nhap, xin_dang, hoi_ve, can_nguoi_that, "
    "bot_vua_hoi…) — gọi MỘT lần, chỉ điền khoá có giá trị.\n"
    "- doi_trang_thai khi rổ có từ 2 căn: điền trich_dan_can = NGUYÊN VĂN cụm khách dùng để chỉ căn (địa chỉ, tên đường, mã căn). Khách "
    "chỉ nói 'căn đó', 'căn kia' mà không rõ căn nào thì KHÔNG gọi — để lời trả lời hỏi lại.\n"
    "- Tin khách không có gì để ghi thì chỉ gọi ghi_y_khach (ít nhất user_intent).\n"
    "Hệ thống trả kết quả từng lần gọi; ô bị bỏ vì cụm trích sai thì sửa cụm trích đúng nguyên văn lời khách rồi gọi lại, hoặc thôi. "
    "Xong thì trả một chữ: xong.\n"
)


def bat(user_key: str | None, la_id_thu: bool) -> bool:
    v = os.environ.get("AIOI_AGENT_BOC", "").strip().lower()
    return v == "bat" or (v == "thu" and la_id_thu)


def cong_cu(schema: dict[str, Any]) -> list[dict[str, Any]]:
    """Năm công cụ, đầu vào cắt từ schema form bán gọn (không viết lại định nghĩa ô)."""
    p = schema["properties"]
    op = p["operations"]["items"]["properties"]
    lay = lambda *ks: {k: copy.deepcopy(op[k]) for k in ks if k in op}
    trich_can = {"type": "string", "description": "NGUYÊN VĂN cụm khách dùng để chỉ căn bị đổi (địa chỉ, tên đường, mã căn) — bắt buộc khi rổ "
                                                  "có từ 2 căn."}
    bo = {"op": {"type": "string", "enum": ["remove", "keep_only", "clear"], "description": op["op"]["description"]}, **lay("targets")}
    y = {k: copy.deepcopy(v) for k, v in p.items() if k != "operations"}
    return [
        {"name": "ghi_o", "description": "Ghi / sửa ô tin của MỘT căn (căn đang khai nếu target trống).",
         "input_schema": {"type": "object", "properties": lay("target", "fields", "bang_chung"), "required": ["fields", "bang_chung"]}},
        {"name": "them_can", "description": "Mở căn MỚI khác căn đang khai (cần can_khac_trich), kèm ô của căn đó.",
         "input_schema": {"type": "object", "properties": lay("targets", "fields", "bang_chung", "can_khac_trich"),
                          "required": ["can_khac_trich"]}},
        {"name": "doi_trang_thai", "description": "Đổi trạng thái giao dịch của một căn (đã bán, đã cọc, ngưng rao, rao lại…).",
         "input_schema": {"type": "object", "properties": {**lay("target", "status"), "trich_dan_can": trich_can},
                          "required": ["status"]}},
        {"name": "bo_can", "description": "Ngưng rao (ẩn, giữ dữ liệu) vài căn / chỉ giữ vài căn / cả rổ — hệ thống hỏi khách xác nhận trước.",
         "input_schema": {"type": "object", "properties": bo, "required": ["op"]}},
        {"name": "ghi_y_khach", "description": "Ý khách lượt này ngoài ô tin: vai, ý định, duyệt bản nháp, xin đăng, hỏi về, cần người thật…",
         "input_schema": {"type": "object", "properties": y}},
    ]


def _goi_can(li: Any) -> str:
    return li.label() if hasattr(li, "label") else str(li)


def _chay_cong_cu(engine: Any, conv: Any, ten: str, vao: dict[str, Any], plan: dict[str, Any]) -> str:
    """Thân công cụ: kiểm rồi gom vào kế hoạch (chưa áp dụng). Trả lời ngắn cho model."""
    from .engine import _trich_dan_khop
    loi_khach = conv.loi_khach_luot
    if ten == "ghi_y_khach":
        for k, v in vao.items():
            if v not in (None, "", [], {}):
                plan[k] = v
        return "Đã ghi."
    if ten in ("ghi_o", "them_can"):
        fields = vao.get("fields") if isinstance(vao.get("fields"), dict) else {}
        bc = vao.get("bang_chung") if isinstance(vao.get("bang_chung"), dict) else {}
        if ten == "them_can" and not _trich_dan_khop(vao.get("can_khac_trich"), loi_khach):
            return f"{SUA}: KHÔNG mở căn mới — can_khac_trich không nằm nguyên trong lời khách. Ô của căn đang khai thì dùng ghi_o."
        sai = [k for k, v in fields.items() if isinstance(v, str) and v.strip() and k != "uu_the"
               and not _trich_dan_khop(bc.get(k), loi_khach)]
        op = {"op": "update" if ten == "ghi_o" else "add", **{k: v for k, v in vao.items() if k in ("target", "targets", "can_khac_trich")},
              "fields": fields, "bang_chung": bc}
        plan["operations"].append(op)
        nhan = [k for k in fields if k not in sai]
        return ("Ghi: " + (", ".join(nhan) or "-")) + (
            f". {SUA} vì cụm trích không nằm nguyên trong lời khách: {', '.join(sai)} — sửa cụm trích đúng nguyên văn rồi gọi lại, hoặc thôi."
            if sai else ".")
    if ten == "doi_trang_thai":
        that = [li for li in conv.listings if not engine._is_stub_listing(li)]
        target = str(vao.get("target") or "").strip()
        if len(that) >= 2:
            trich = str(vao.get("trich_dan_can") or "").strip()
            li = engine._match_listing(conv, trich) if trich and _trich_dan_khop(trich, loi_khach) else None
            li_t = engine._match_listing(conv, target) if target else li
            if li is None or (li_t is not None and li_t is not li):
                plan["_chua_ro_can"] = [_goi_can(x) for x in that]
                return ("KHÔNG đổi: lời khách chưa chỉ ra căn nào trong rổ (" + "; ".join(plan["_chua_ro_can"])
                        + "). Đừng gọi lại — lời trả lời sẽ hỏi khách căn nào.")
            target = target or trich
        plan["operations"].append({"op": "set_status", "status": vao.get("status"), **({"target": target} if target else {})})
        return f"Đổi trạng thái: {vao.get('status')}."
    if ten == "bo_can":
        plan["operations"].append({"op": vao.get("op"), **({"targets": vao["targets"]} if vao.get("targets") else {})})
        return "Ghi nhận — hệ thống sẽ hỏi khách xác nhận trước khi ẩn."
    return "Không rõ công cụ."


def lap(engine: Any, conv: Any, system: str, src: list[Any], schema: dict[str, Any]) -> dict[str, Any] | None:
    """Một lượt đọc ý bằng công cụ. Trả kế hoạch cùng dạng form cũ; None khi model không gọi được công cụ (engine đọc bằng form). Model của
    vòng: `AIOI_AGENT_BOC_MODEL` (một nguồn `cai-vps.sh` dòng MODEL_AGENT_BOC), trống = model chat."""
    from .llm.base import MODEL_CHAT_LUOT
    m = os.environ.get("AIOI_AGENT_BOC_MODEL", "").strip()
    dau = MODEL_CHAT_LUOT.set(m) if m else None
    try:
        return _lap(engine, conv, system, src, schema)
    finally:
        if dau is not None:
            MODEL_CHAT_LUOT.reset(dau)


def _lap(engine: Any, conv: Any, system: str, src: list[Any], schema: dict[str, Any]) -> dict[str, Any] | None:
    from .llm.base import RANH_GIOI_CACHE
    he = system.replace("Trả về JSON đúng schema.", "", 1)
    he = he.replace(RANH_GIOI_CACHE, HUONG_DAN + RANH_GIOI_CACHE, 1) if RANH_GIOI_CACHE in he else he + HUONG_DAN
    tools = cong_cu(schema)
    tin: list[dict] = [{"role": m.role, "content": m.content} for m in src]
    plan: dict[str, Any] = {"operations": []}
    da_goi: list[str] = []
    nguon: dict[tuple[str, str], tuple[int, int]] = {}
    bat_dau = time.monotonic()
    try:
        for vong in range(MAX_VONG):
            turn = engine._provider.converse(he, tin, tools, max_tokens=2048)
            if turn.stop_reason == "du_phong":
                log.warning("Agent bóc: dự phòng không gọi công cụ — đọc bằng form")
                return None
            if not turn.tool_calls:
                break
            kq = []
            for c in turn.tool_calls:
                da_goi.append(c.name)
                truoc = len(plan["operations"])
                vao = dict(c.input or {})
                r = _chay_cong_cu(engine, conv, c.name, vao, plan)
                khoa = (c.name, str(vao.get("target") or ""))
                if c.name in ("ghi_o", "them_can") and len(plan["operations"]) > truoc:
                    # Gọi lại sau khi sửa cụm trích (vòng sau) → bản mới THAY bản vòng trước của cùng công cụ, cùng căn; trong một vòng thì
                    # là các căn / lần ghi khác nhau, giữ cả.
                    cu = nguon.get(khoa)
                    if cu is not None and cu[0] < vong:
                        plan["operations"][cu[1]] = plan["operations"].pop()
                    else:
                        nguon[khoa] = (vong, len(plan["operations"]) - 1)
                kq.append({"type": "tool_result", "tool_use_id": c.id, "content": r})
            # Mọi lần gọi đều sạch → xong, khỏi tốn một lần gọi model chỉ để nghe "xong". Có ô bị bỏ vì cụm trích → cho model sửa một vòng.
            if not any(SUA in k["content"] for k in kq) or vong == MAX_VONG - 1 or time.monotonic() - bat_dau > HAN_GIAY:
                break
            tin.append({"role": "assistant", "content": turn.assistant_content})
            tin.append({"role": "user", "content": kq})
    except Exception as e:  # noqa: BLE001 — agent hỏng thì đọc bằng form, lượt vẫn chạy
        log.warning("Agent bóc lỗi (%s) — đọc bằng form", type(e).__name__)
        return None
    if not da_goi:
        log.warning("Agent bóc: model không gọi công cụ nào — đọc bằng form")
        return None
    log.warning("Agent bóc: công_cụ=%s giây=%.1f", ",".join(da_goi), time.monotonic() - bat_dau)
    plan.setdefault("user_intent", "sell")
    return plan

