"""Vòng agent GỘP phía NGƯỜI BÁN — SRS-5.1zzzzzzz371 (chủ dự án 03/11/2026: "AI đọc lời của khách làm 2 việc cùng lúc, bóc tách ra lưu db
và trả lời lại khách. quá trình thu thập diễn ra song song với việc trả lời chăm sóc khách hàng" + "gộp đi").

Mỗi lượt người bán là MỘT cuộc hội thoại công cụ với model chat (Sonnet), theo khung "Suy nghĩ → Chọn công cụ → Thực thi → Đánh giá":

- Bước 1 (`mo`, trong `Engine._lap_ke_hoach`): system = phần cố định của phiếu lượt (định danh + giọng + luật cố định, NGUYÊN VẸN — một nguồn
  `prompts.phieu_co_dinh`) + luật ghi chung + dữ liệu của lượt. Model gọi công cụ GHI (`ghi_o`, `them_can`, `doi_trang_thai`, `bo_can`,
  `ghi_y_khach` — thân là `agent_boc._chay_cong_cu`, cổng trích + cổng rổ nhiều căn), công cụ ĐỌC (rổ hàng / bộ nhớ dự án / giá đã gửi — thân
  là hàm khối của engine qua `agent_ban._khoi`) và công cụ TRA CỨU luật `tra_luat_o(o)` (RAG: luật ghi từng ô cắt NGUYÊN từ
  `OPERATIONS_SYSTEM_BAN` + mô tả schema, không nhồi cả 45.000 chữ vào mọi lượt).
- Engine áp kế hoạch NGAY sau vòng ghi, qua đúng các cổng hiện có (`_ap_dung_ke_hoach` → `_apply_operation` / `_loc_o_tin`, chuẩn địa danh, tra
  phường…) rồi dựng phiếu lượt mới như mọi lượt.
- Bước 2 (`viet`, ở chỗ viết lời người bán): CÙNG cuộc hội thoại, kết quả công cụ ghi = báo cáo thật sau khi áp (đã ghi gì / bỏ ô nào vì sao /
  ô còn thiếu / VIỆC LƯỢT NÀY); system = phiếu lượt engine vừa dựng (nguyên vẹn) + dặn đánh giá. Model đọc kết quả rồi viết lời — chỉ nói "đã
  ghi" điều báo cáo ghi.

Công tắc `AIOI_AGENT_GOP` (một nguồn `bot/bridge-zca/cai-vps.sh` dòng AGENT_GOP): "bat" = mọi người bán, "thu" = chỉ ID thử, khác = đường cũ
(form Haiku + agent_ban). Bước 1 lỗi / dự phòng không gọi được công cụ → trả None, engine đọc bằng form JSON (Haiku) như cũ; bước 2 dự phòng
→ viết lại như agent_ban với đủ khối dữ liệu."""
from __future__ import annotations

import copy
import json
import logging
import os
import time
from typing import Any

from . import agent_ban, agent_boc

log = logging.getLogger(__name__)

MAX_VONG_GHI = 3    # bước 1: ghi / tra → sửa theo kết quả → xong
MAX_VONG_LOI = 3    # bước 2: tra thêm (nếu cần) → lời
HAN_GIAY = 30.0     # cả hai bước; trần lõi 40 s, bridge chờ 90 s — không nới
TRAN_KET_QUA = 6000
SUA = agent_boc.SUA
DAU_BUOC_2 = "=== BƯỚC 2 — ĐÁNH GIÁ KẾT QUẢ RỒI VIẾT LỜI GỬI KHÁCH ==="   # bộ chấm nhận lần gọi viết lời bằng dấu này

GHI = ("ghi_o", "them_can", "doi_trang_thai", "bo_can", "ghi_y_khach")
DOC = tuple(c["name"] for c in agent_ban.CONG_CU)


def bat(user_key: str | None, la_id_thu: bool) -> bool:
    v = os.environ.get("AIOI_AGENT_GOP", "").strip().lower()
    return v == "bat" or (v == "thu" and la_id_thu)


# ---------------------------------------------------------------------------------------------------------------------------------------------
# Luật ghi: cắt OPERATIONS_SYSTEM_BAN thành khối, mỗi khối về ĐÚNG MỘT chỗ — system (luật chung mọi lượt), mô tả một công cụ ghi, hay
# tra_luat_o(khoá). Không khối nào bị bỏ ngoài dòng "Trả về JSON đúng schema." (đường công cụ không trả JSON) và từ điển tiếng lóng (đã có
# NGUYÊN trong phần cố định của phiếu lượt). `tests/test_agent_gop_371.py` kiểm: mọi khối có chỗ, mọi dấu trong bảng còn khớp form.
# ---------------------------------------------------------------------------------------------------------------------------------------------

HE = "he"           # system bước 1
BO = "bo"           # không cần ở đường công cụ (kèm lý do ở BANG_LUAT)

# (đầu khối, nơi đến). Nơi đến: HE · BO · "cc:<công cụ>" · "tra:<khoá>,<khoá>…". Khối không khớp dấu nào → HE (an toàn: không mất luật).
BANG_LUAT: list[tuple[str, str]] = [
    ("Bạn là bộ ĐIỀU PHỐI THAO TÁC", HE),
    ('Các loại "op":', HE),
    ('- "update":', "cc:ghi_o"),
    ('- "add":', "cc:them_can"),
    ('- "set_status":', "cc:doi_trang_thai"),
    ('- "remove":', "cc:bo_can"),
    ('- "keep_only":', "cc:bo_can"),
    ('- "clear":', "cc:bo_can"),
    ("⚠️ QUAN TRỌNG — AOND KHÔNG BAO GIỜ XÓA DỮ LIỆU", "cc:bo_can"),
    ("BÓC TÁCH KHÔNG THIẾU", HE),
    ('Ngoài "operations", nếu khách TỰ NÓI RA vai', "tra:seller_role,seller_role_trich_dan"),
    ("SỰ THẬT CỦA CĂN", "tra:phap_ly_trang_thai,duong_vao,tien_ich_gan,tinh_trang_nha"),
    ('- "phap_ly_trang_thai":', "tra:phap_ly_trang_thai"),
    ('- "duong_vao":', "tra:duong_vao"),
    ('- "tien_ich_gan":', "tra:tien_ich_gan"),
    ('- "tinh_trang_nha":', "tra:tinh_trang_nha"),
    ("PHÂN BIỆT Ý ĐỊNH KHÁCH", HE),
    ('- "sell":', HE),
    ('- "buy":', HE),
    ('- "unknown":', HE),
    ('- "hoi_ngoai_viec":', HE),
    ('TRẢ LỜI CÂU KHÁCH HỎI ("tra_loi_khach_hoi"', "tra:tra_loi_khach_hoi"),
    ('CĂN CÒN BÁN ("con_ban")', HE),
    ("QUY TẮC:", HE),
    ("- Người rao chỉ khai thông tin bình thường", HE),
    ("- DUYỆT BẢN TIN / ĐỒNG Ý ĐĂNG TIN", HE),
    ("- CÂU HỎI hoặc YÊU CẦU XEM", HE),
    ("- remove / keep_only / clear CHỈ khi", "cc:bo_can"),
    ("- Diện tích: nhà phố/biệt thự", "tra:dien_tich,dien_tich_dat,dien_tich_nha"),
    ("ĐỌC DẤU HIỆU NHƯ MÔI GIỚI LÂU NĂM", "tra:loai_hinh,dien_tich,dien_tich_dat,dien_tich_nha,mat_tien,lo_gioi_duong"),
    ("- Loại hình (loai_hinh)", "tra:loai_hinh"),
    ("- Diện tích nhà phố:", "tra:dien_tich,dien_tich_dat,dien_tich_nha,mat_tien,lo_gioi_duong,kich_thuoc"),
    ("- Đừng nhầm mã số căn", HE),
    ("- DUYỆT BẢN NHÁP (theo trạng thái)", "tra:duyet_ban_nhap,duyet_trich_dan"),
    ("- LỜI XÃ GIAO", "tra:loi_xa_giao,loi_xa_giao_trich_dan"),
    ("- KHÁCH HỎI VỀ GÌ", "tra:hoi_ve"),
    ("- HỎI PHÁP LÝ / THỦ TỤC / THUẾ PHÍ", "tra:hoi_phap_ly,phap_ly_trich_dan,phap_ly_nhay_cam"),
    ("- KHÁCH TỰ XƯNG", "tra:xung_ho,xung_ho_trich_dan"),
    ("- BOT VỪA HỎI GÌ", "tra:bot_vua_hoi"),
    ("- XIN XEM BẢN VẼ", "tra:xin_xem_ban_ve,ban_do_du_an"),
    ("- HỎI THÔNG TIN DỰ ÁN", "tra:cau_hoi_du_an"),
    ("- TẢ DỰ ÁN", "tra:mo_ta_du_an"),
    ("- XIN GẶP NGƯỜI THẬT", "tra:can_nguoi_that"),
    ("- NGOÀI VÙNG NHẬN TIN", "tra:ngoai_vung,ngoai_vung_trich_dan"),
    ("- KHÁCH BẢO ĐĂNG", "tra:xin_dang"),
    ("- KHÁCH DẶN CÁCH VIẾT BẢN TIN", "tra:yeu_cau_viet"),
    ("- GIÁ TRỊ Ô LÀ CỤM DỮ LIỆU", HE),
    ("- XÁC NHẬN XOÁ", "tra:xac_nhan_xoa,xac_nhan_trich_dan"),
    ("- ĐỊA CHỈ ĐẦY ĐỦ", HE),
    ("- TIN HỆ THỐNG trong ngoặc vuông", HE),
    ("Trả về JSON đúng schema.", BO),       # đường công cụ không trả JSON (agent_boc cũng bỏ dòng này)
]

# Luật nạp SẴN theo TRẠNG THÁI hội thoại (code quyết, không đoán chữ khách) — đỡ một lần gọi tra cho việc chắc chắn đụng tới lượt này.
NAP_THEO_TRANG_THAI = {
    "listing_proposed": ("duyet_ban_nhap",),
    "pending_destructive": ("xac_nhan_xoa",),
    "cau_hoi_cho": ("tra_loi_khach_hoi",),
}


def _khoi(form: str) -> list[str]:
    """Cắt form thành khối: đoạn cách nhau bằng dòng trống; trong đoạn, dòng cột 0 bắt đầu "- " hay dòng tiêu đề cột 0 kết bằng ":" mở khối
    mới (dòng nối tiếp thụt lề đi theo khối trước)."""
    ra: list[str] = []
    for doan in form.split("\n\n"):
        cur: list[str] = []
        for dong in doan.split("\n"):
            if cur and (dong.startswith("- ") or (dong[:1] not in ("", " ") and dong.rstrip().endswith(":"))):
                ra.append("\n".join(cur))
                cur = []
            cur.append(dong)
        if cur:
            ra.append("\n".join(cur))
    return ra


def _noi_den(khoi: str) -> str:
    dau = khoi.lstrip("\n")
    for tien_to, noi in BANG_LUAT:
        if dau.startswith(tien_to):
            return noi
    return HE


def chia_luat(form: str | None = None) -> dict[str, Any]:
    """{"he": [khối], "cc": {công cụ: [khối]}, "tra": {khoá: [khối]}, "bo": [khối]} — bảng "luật → nằm ở đâu" (một nguồn cho prompt và test)."""
    from .prompts import OPERATIONS_SYSTEM_BAN, SLANG_NOTES
    form = OPERATIONS_SYSTEM_BAN if form is None else form
    ra: dict[str, Any] = {"he": [], "cc": {}, "tra": {}, "bo": []}
    if SLANG_NOTES in form:   # từ điển tiếng lóng: NGUYÊN văn đã có trong phần cố định của phiếu lượt — không lặp
        form = form.replace(SLANG_NOTES, "")
        ra["bo"].append(SLANG_NOTES)
    for k in _khoi(form):
        if not k.strip():
            continue
        noi = _noi_den(k)
        if noi in (HE, BO):
            ra[noi].append(k)
        elif noi.startswith("cc:"):
            ra["cc"].setdefault(noi[3:], []).append(k)
        else:
            for khoa in noi[4:].split(","):
                ra["tra"].setdefault(khoa, []).append(k)
    return ra


def _mo_ta_schema(schema: dict[str, Any]) -> dict[str, str]:
    """Mô tả NGUYÊN của từng khoá trong schema form bán gọn: ô tin (fields) và khoá cấp kế hoạch."""
    p = schema["properties"]
    ra = {k: str(v.get("description") or "") for k, v in p.items() if k != "operations"}
    for k, v in (p["operations"]["items"]["properties"]["fields"].get("properties") or {}).items():
        ra[k] = str(v.get("description") or "")
    return ra


def tra_luat(o: str, schema: dict[str, Any], chia: dict[str, Any]) -> str:
    o = str(o or "").strip()
    mo_ta = _mo_ta_schema(schema)
    khoi = chia["tra"].get(o, [])
    if not khoi and o not in mo_ta:
        return "Không có khoá này. Khoá có luật riêng: " + ", ".join(sorted(chia["tra"])) + "; còn lại xem mô tả trong công cụ."
    ra = [f"Khoá {o}: {mo_ta[o]}"] if mo_ta.get(o) else []
    return "\n".join(ra + [k.strip("\n") for k in khoi]) or f"Khoá {o}: không có luật riêng ngoài mô tả trong công cụ."


def _cau_dau(mo_ta: str, tran: int = 160) -> str:
    cau = mo_ta.split(". ", 1)[0]
    return (cau if len(cau) <= tran else cau[:tran].rsplit(" ", 1)[0] + "…") + " (luật đủ: tra_luat_o)"


def _tra_cong_cu(chia: dict[str, Any]) -> dict[str, Any]:
    return {"name": "tra_luat_o",
            "description": "TRA CỨU luật ghi của MỘT ô tin / khoá (nguyên văn luật hệ thống). Gọi trước khi ghi ô / khoá mà luật chưa có "
                           "trong lời nhắc. Khoá có luật riêng: " + ", ".join(sorted(chia["tra"])) + ".",
            "input_schema": {"type": "object", "properties": {"o": {"type": "string", "description": "tên khoá, vd dien_tich_dat, duyet_ban_nhap"}},
                             "required": ["o"]}}


def cong_cu(schema: dict[str, Any], chia: dict[str, Any]) -> list[dict[str, Any]]:
    """Công cụ bước 1 (ghi + đọc + tra cứu). Ghi: cắt từ schema form; ô tin là MỘT danh sách khoá kèm mô tả nguyên (chỉ ở ghi_o); khoá ý
    khách có luật riêng chỉ giữ câu đầu của mô tả — mô tả NGUYÊN + luật đủ trả qua tra_luat_o, không viết hai lần mỗi lượt."""
    tools = copy.deepcopy(agent_boc.cong_cu(schema))
    o_tin = schema["properties"]["operations"]["items"]["properties"]["fields"].get("properties") or {}
    ds_o = "; ".join(f"{k}: {v.get('description') or k}" for k, v in o_tin.items())   # mô tả ô NGUYÊN (một bản — luật dài của form qua tra_luat_o)
    for t in tools:
        props = t["input_schema"]["properties"]
        if "fields" in props:
            props["fields"] = {"type": "object", "description": (
                "Ô tin → giá trị (chuỗi; riêng uu_the là mảng cụm nguyên văn). Chỉ dùng các khoá — " + ds_o
                + ". Luật chi tiết của một ô: gọi tra_luat_o.") if t["name"] == "ghi_o" else "Ô tin → giá trị, cùng bộ khoá như ghi_o."}
        if t["name"] == "ghi_y_khach":
            for k, v in props.items():
                if k in chia["tra"] and v.get("description"):
                    v["description"] = _cau_dau(str(v["description"]))
        cc = chia["cc"].get(t["name"])
        if cc:
            t["description"] += "\n" + "\n".join(k.strip("\n") for k in cc)
    return tools + [_tra_cong_cu(chia)] + copy.deepcopy(agent_ban.CONG_CU)


def cong_cu_viet(chia: dict[str, Any]) -> list[dict[str, Any]]:
    """Công cụ bước 2: chỉ đọc + tra cứu — bước ghi đã đóng (không còn công cụ ghi để gọi)."""
    return [_tra_cong_cu(chia)] + copy.deepcopy(agent_ban.CONG_CU)


HUONG_DAN_GHI = (
    "\n\n=== BƯỚC 1 — ĐỌC Ý KHÁCH VÀ GHI VÀO HỆ THỐNG (gọi công cụ; CHƯA viết lời gửi khách) ===\n"
    "Lượt này em làm HAI việc cùng lúc: ghi điều khách nói vào hệ thống và trả lời khách. Bước 1: đọc tin khách mới nhất (các tin trước chỉ là "
    "ngữ cảnh), GỌI CÔNG CỤ cho từng việc ghi — gọi hết trong MỘT lượt; luôn gọi ghi_y_khach (ít nhất user_intent). Ghi một ô / khoá mà "
    "luật chi tiết chưa có trong lời nhắc này (khối LUẬT Ô NẠP SẴN) thì gọi tra_luat_o trước. Cần dữ liệu khách đã gửi / dự án thì gọi công cụ "
    "đọc. Hệ thống áp từng lần ghi qua cổng kiểm rồi trả kết quả: đã ghi gì, bỏ ô nào vì sao, ô còn thiếu và VIỆC LƯỢT NÀY — bước 2 em mới "
    "viết lời gửi khách. Ở bước 1 KHÔNG viết lời gửi khách.\n"
    "Kết quả có dòng \"Sẽ BỎ\" (cụm trích không nằm nguyên trong lời khách) thì sửa cụm trích đúng nguyên văn rồi gọi lại, hoặc thôi.\n\n"
    "LUẬT GHI CHUNG (mọi lượt):\n"
)

HUONG_DAN_VIET = (
    "\n\n" + DAU_BUOC_2 + "\n"
    "Em vừa đọc ý khách và gọi công cụ ghi (bước 1). Kết quả công cụ cuối là KẾT QUẢ GHI LƯỢT NÀY — hệ thống đã áp qua cổng kiểm. Đánh giá kết "
    "quả đó rồi viết lời gửi khách theo đúng các luật ở trên và việc lượt này. Chỉ nói đã ghi / đã cập nhật / đã đổi với điều kết quả báo ĐÃ "
    "GHI; ô bị bỏ hay chưa đổi thì không nói là đã ghi. Không kể cho khách tên công cụ, tên ô, cổng kiểm hay kết quả hệ thống. Bước ghi lượt "
    "này đã đóng (bước 2 chỉ còn công cụ đọc).\n"
)


def _he_ghi(engine: Any, conv: Any, du_lieu: str, chia: dict[str, Any]) -> str:
    from .llm.base import RANH_GIOI_CACHE
    from .prompts import describe_captured, phieu_co_dinh
    nap = luat_nap_san(conv, chia)
    nap_txt = ("\n=== LUẬT Ô NẠP SẴN (trạng thái hội thoại) ===\n" + "\n\n".join(nap) + "\n") if nap else ""
    return (phieu_co_dinh(conv.assistant.name) + HUONG_DAN_GHI + "\n\n".join(k.strip("\n") for k in chia["he"]) + "\n"
            + RANH_GIOI_CACHE + du_lieu + nap_txt + "\nDỮ LIỆU CĂN ĐÃ GHI (hệ thống, từ lời khách):\n" + describe_captured(conv.prop) + "\n")


def luat_nap_san(conv: Any, chia: dict[str, Any]) -> list[str]:
    """Luật nạp SẴN theo TRẠNG THÁI hội thoại (code quyết từ dữ liệu, không đọc chữ khách): khoá theo `NAP_THEO_TRANG_THAI`, các ô bot vừa
    hỏi (`o_vua_hoi` / `cum_vua_hoi` — khách thường đáp đúng ô đó) và loại hình khi căn chưa có. Khối trùng chỉ một lần."""
    khoas: list[str] = []
    for thuoc_tinh, ks in NAP_THEO_TRANG_THAI.items():
        if getattr(conv, thuoc_tinh, None):
            khoas += list(ks)
    khoas += [o for o in [getattr(conv, "o_vua_hoi", None), *(getattr(conv, "cum_vua_hoi", None) or [])] if o]
    if not conv.prop.fields.get("loai_hinh") and not getattr(conv.prop, "loai_hinh", None):
        khoas.append("loai_hinh")
    ra: list[str] = []
    for k in dict.fromkeys(khoas):
        for khoi in chia["tra"].get(k, []):
            if khoi.strip("\n") not in ra:
                ra.append(khoi.strip("\n"))
    return ra


def _schema() -> dict[str, Any]:
    from .prompts import operations_schema_ban
    return operations_schema_ban()


def _ghi(engine: Any, conv: Any, ten: str, vao: dict[str, Any], plan: dict[str, Any], o_hop_le: set[str]) -> str:
    """Thân công cụ ghi: lọc khoá ô lạ (ô tin là danh sách khoá, không còn schema chặn) rồi qua đúng cổng của agent_boc."""
    la: list[str] = []
    if isinstance(vao.get("fields"), dict):
        la = [k for k in vao["fields"] if k not in o_hop_le]
        vao["fields"] = {k: (v if isinstance(v, (str, list)) else str(v)) for k, v in vao["fields"].items() if k in o_hop_le}
    r = agent_boc._chay_cong_cu(engine, conv, ten, vao, plan)
    return r + (f" Khoá ô không có trong hệ thống, bỏ: {', '.join(la)}." if la else "")


def mo(engine: Any, conv: Any, du_lieu: str) -> dict[str, Any] | None:
    """Bước 1. Trả kế hoạch cùng dạng form cũ (engine áp như mọi lượt) và cất cuộc hội thoại công cụ vào `conv.vong_gop` cho bước 2. None khi
    model không gọi được công cụ / lỗi (engine đọc bằng form JSON)."""
    schema, chia = _schema(), chia_luat()
    o_hop_le = set(schema["properties"]["operations"]["items"]["properties"]["fields"].get("properties") or {})
    he = _he_ghi(engine, conv, du_lieu, chia)
    tools = cong_cu(schema, chia)
    tin: list[dict] = [{"role": m.role, "content": m.content} for m in conv.messages()]
    plan: dict[str, Any] = {"operations": []}
    da_goi: list[str] = []
    nguon: dict[tuple[str, str], tuple[int, int]] = {}
    kq: list[dict] = []
    bat_dau = time.monotonic()
    project = engine.project_for(conv.prop, conv)
    try:
        for vong in range(MAX_VONG_GHI):
            turn = engine._provider.converse(he, tin, tools, max_tokens=2048)
            if turn.stop_reason == "du_phong":
                log.warning("Agent gộp: dự phòng không gọi công cụ — đọc bằng form")
                return None
            if not turn.tool_calls:
                if vong and tin and tin[-1]["role"] == "user" and isinstance(tin[-1]["content"], list):
                    kq = tin.pop()["content"]   # kết quả vòng trước: bước 2 gửi lại kèm báo cáo (tin còn kết thúc bằng lượt gọi công cụ)
                break
            tin.append({"role": "assistant", "content": turn.assistant_content})
            kq, mo_them = [], False
            for c in turn.tool_calls:
                da_goi.append(c.name)
                vao = dict(c.input or {})
                if c.name in GHI:
                    truoc = len(plan["operations"])
                    r = _ghi(engine, conv, c.name, vao, plan, o_hop_le)
                    khoa = (c.name, str(vao.get("target") or ""))
                    if c.name in ("ghi_o", "them_can") and len(plan["operations"]) > truoc:
                        cu = nguon.get(khoa)   # gọi lại sau khi sửa cụm trích → bản mới THAY bản vòng trước (như agent_boc)
                        if cu is not None and cu[0] < vong:
                            plan["operations"][cu[1]] = plan["operations"].pop()
                        else:
                            nguon[khoa] = (vong, len(plan["operations"]) - 1)
                    mo_them = mo_them or SUA in r
                elif c.name == "tra_luat_o":
                    r, mo_them = tra_luat(vao.get("o"), schema, chia), True
                elif c.name in DOC:
                    try:
                        r = agent_ban._khoi(engine, conv, project, c.name).strip() or "Không có dữ liệu này."
                    except Exception as e:  # noqa: BLE001 — tra lỗi thì nói thật
                        log.warning("Agent gộp: công cụ %s lỗi: %s", c.name, type(e).__name__)
                        r = "Tra lỗi — nói thật là em chưa tra được, không đoán."
                    mo_them = True
                else:
                    r = "Không rõ công cụ."
                kq.append({"type": "tool_result", "tool_use_id": c.id, "content": r[:TRAN_KET_QUA]})
            if not mo_them or vong == MAX_VONG_GHI - 1 or time.monotonic() - bat_dau > HAN_GIAY / 2:
                break
            tin.append({"role": "user", "content": kq})
            kq = []
    except Exception as e:  # noqa: BLE001 — vòng hỏng thì đọc bằng form, lượt vẫn chạy
        log.warning("Agent gộp lỗi (%s) — đọc bằng form", type(e).__name__)
        return None
    if not da_goi:
        log.warning("Agent gộp: model không gọi công cụ nào — đọc bằng form")
        return None
    log.warning("Agent gộp bước 1: công_cụ=%s giây=%.1f", ",".join(da_goi), time.monotonic() - bat_dau)
    plan.setdefault("user_intent", "sell")
    conv.vong_gop = {"tin": tin, "kq": kq, "bat_dau": bat_dau, "schema": schema, "chia": chia}
    return plan


def _nhan(o: str, prop: Any) -> str:
    from .prompts import nhan_o
    try:
        return nhan_o(o, prop)
    except Exception:  # noqa: BLE001
        return o


def bao_cao(engine: Any, conv: Any, system: str, captured: list[str]) -> str:
    """Kết quả thật sau khi engine áp kế hoạch — trả cho model ở kết quả công cụ ghi (bước "Đánh giá")."""
    from .prompts import NHAN_VIEC_LUOT
    f = conv.prop.fields
    dong = ["KẾT QUẢ GHI LƯỢT NÀY (hệ thống đã áp qua cổng kiểm):"]
    da = [f'{_nhan(k, conv.prop)} = "{f.get(k)}"' for k in captured if isinstance(f.get(k), str) and f.get(k) and not k.startswith("_")]
    dong.append("- ĐÃ GHI: " + ("; ".join(da) if da else "không ô nào"))
    bo = [f'{_nhan(k, conv.prop)} = "{v}" — {ly}' for (k, v, _bc, ly) in (conv.bo_luot or []) if v not in (None, "", [], {})]
    if bo:
        dong.append("- KHÔNG GHI (bị bỏ): " + "; ".join(bo))
    for r in conv.last_receipts or []:
        if r and r[0] == "set_status":
            dong.append(f"- ĐÃ ĐỔI trạng thái: {', '.join(li.label() for li in r[2])} → {r[1]}")
        elif r and r[0] == "add":
            dong.append("- ĐÃ MỞ thêm căn: " + (", ".join(map(str, r[1])) if r[1] else "căn mới"))
        elif r and r[0] == "confirm_destructive":
            dong.append(f"- CHƯA ẩn gì — chờ khách xác nhận: {r[1]}")
    if conv.y_luot.get("chua_ro_can"):
        dong.append("- CHƯA ĐỔI trạng thái căn nào (lời khách chưa chỉ ra căn nào)")
    thieu = [_nhan(o, conv.prop) for o in conv.prop.missing_fields()]
    if thieu:
        dong.append("- Ô CÒN THIẾU: " + "; ".join(thieu))
    dau = NHAN_VIEC_LUOT + ":"
    if dau in system:
        dong.append(f"- {dau} " + system.rsplit(dau, 1)[1].strip().split("\n\n", 1)[0])
    else:
        dong.append(f"- {NHAN_VIEC_LUOT}: theo các khối ưu tiên / dữ kiện hệ thống trong lời nhắc.")
    return "\n".join(dong)


def viet(engine: Any, conv: Any, project: Any, system: str, captured: list[str], max_tokens: int) -> tuple[str, str]:
    """Bước 2: cùng cuộc hội thoại công cụ — đưa báo cáo sau khi áp làm kết quả công cụ ghi, model đánh giá rồi viết lời. Trả (lời, khối kết
    quả để lần soát / gọi lại của lượt dùng tiếp — như agent_ban)."""
    from .engine import _AGENT_TOOL_GUIDE
    from .llm.base import RANH_GIOI_CACHE
    st, conv.vong_gop = conv.vong_gop, None
    bao = bao_cao(engine, conv, system, captured)
    kho_du_an = project is not None and bool(getattr(project, "units", None))
    huong_dan = HUONG_DAN_VIET + agent_ban.HUONG_DAN + (_AGENT_TOOL_GUIDE if kho_du_an else "")
    he = system.replace(RANH_GIOI_CACHE, huong_dan + RANH_GIOI_CACHE, 1) if RANH_GIOI_CACHE in system else system + huong_dan
    tools = cong_cu_viet(st["chia"]) + (engine._inventory_tools() if kho_du_an else [])
    tin = list(st["tin"])
    kq = [dict(b) for b in st["kq"]]
    if kq:
        kq[0]["content"] = bao + "\n\n(Kết quả riêng của lần gọi này: " + str(kq[0]["content"]) + ")"
        tin.append({"role": "user", "content": kq})
    else:
        tin.append({"role": "user", "content": bao})
    ket: list[str] = []
    da_goi: list[str] = []
    loi = ""
    for vong in range(MAX_VONG_LOI):
        turn = engine._provider.converse(he, tin, tools, max_tokens=max_tokens)
        if turn.stop_reason == "du_phong":
            them = "".join(agent_ban._khoi(engine, conv, project, t) for t in DOC)
            log.warning("Agent gộp: dự phòng không gọi công cụ — viết lại với đủ khối dữ liệu")
            khoi_bao = "\n\n=== " + bao + "\n"
            return engine._provider.reply(system + khoi_bao + them, conv.messages(), max_tokens=max_tokens).strip(), khoi_bao + them
        if not turn.tool_calls:
            loi = (turn.text or "").strip()
            break
        if vong == MAX_VONG_LOI - 1 or time.monotonic() - st["bat_dau"] > HAN_GIAY:
            break
        tin.append({"role": "assistant", "content": turn.assistant_content})
        kq2 = []
        for c in turn.tool_calls:
            da_goi.append(c.name)
            vao = dict(c.input or {})
            try:
                if c.name == "tra_luat_o":
                    r = tra_luat(vao.get("o"), st["schema"], st["chia"])
                elif c.name in DOC:
                    r = agent_ban._khoi(engine, conv, project, c.name).strip() or "Không có dữ liệu này."
                elif kho_du_an:
                    r = engine._exec_tool(conv, project, c)
                else:
                    r = "Không rõ công cụ."
            except Exception as e:  # noqa: BLE001
                log.warning("Agent gộp: công cụ %s lỗi: %s", c.name, type(e).__name__)
                r = "Tra lỗi — nói thật là em chưa tra được, không đoán."
            r = str(r)[:TRAN_KET_QUA]
            if c.name != "tra_luat_o":
                ket.append(f"[{c.name}] {r}")
            kq2.append({"type": "tool_result", "tool_use_id": c.id, "content": r})
        tin.append({"role": "user", "content": kq2})
    them = ("\n\n=== " + bao + "\n") + (("\n=== KẾT QUẢ EM VỪA TRA (hệ thống tra, không phải khách nói) ===\n" + "\n".join(ket) + "\n")
                                         if ket else "")
    if not loi:
        loi = engine._provider.reply(system + them, conv.messages(), max_tokens=max_tokens).strip()
    log.warning("Agent gộp bước 2: công_cụ=%s giây=%.1f", ",".join(da_goi) or "-", time.monotonic() - st["bat_dau"])
    return loi, them


def bang_luat_md() -> str:
    """Bảng "luật → nằm ở đâu" (markdown) cho mô tả PR / docs — sinh từ chính BANG_LUAT, không viết tay."""
    dong = ["| Khối luật (đầu khối trong OPERATIONS_SYSTEM_BAN) | Nằm ở đâu |", "|---|---|"]
    from .prompts import OPERATIONS_SYSTEM_BAN, SLANG_NOTES
    dong.append("| TỪ ĐIỂN TIẾNG LÓNG BĐS (`SLANG_NOTES`, nguyên khối) | system cả hai bước — phần cố định của phiếu lượt (`phieu_co_dinh`) |")
    for k in _khoi(OPERATIONS_SYSTEM_BAN.replace(SLANG_NOTES, "")):
        if not k.strip():
            continue
        noi = _noi_den(k)
        dau = k.strip("\n").split("\n", 1)[0][:70].replace("|", "/")
        noi_txt = {"he": "system bước 1 (luật ghi chung)", "bo": "bỏ — đường công cụ không trả JSON"}.get(noi) or (
            f"mô tả công cụ `{noi[3:]}`" if noi.startswith("cc:") else "`tra_luat_o`: " + ", ".join(f"`{x}`" for x in noi[4:].split(",")))
        dong.append(f"| {dau} | {noi_txt} |")
    dong.append("| Mô tả từng ô / khoá trong schema | ô tin: nhãn ngắn trong `ghi_o` + mô tả NGUYÊN qua `tra_luat_o`; khoá ý khách: NGUYÊN trong `ghi_y_khach` |")
    return "\n".join(dong)


if __name__ == "__main__":   # python -m aioi.agent_gop → in bảng luật (mô tả PR)
    print(bang_luat_md())
    print(json.dumps({k: len(v) for k, v in chia_luat()["tra"].items()}, ensure_ascii=False))
