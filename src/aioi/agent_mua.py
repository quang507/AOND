"""Vòng agent phía MUA (SRS-5.1zzzzzzz290 / 292, chủ dự án 29/10/2026: "Ok thử … sang kiểu Suy nghĩ -> Chọn công cụ -> Thực thi -> Đánh giá thôi
còn bóc tách vẫn dùng haiku … tại mấy cái code từ khóa bạn làm chạy không ổn định").

Lượt viết lời cho khách mua (Sonnet) được bộ công cụ: model tự quyết có cần tra kho không (khách đổi tiêu chí, hỏi chi tiết một căn, hỏi dự án /
khu) thay vì code dựng sẵn một lần tra cố định; và (SRS-292) ghi hẹn xem / câu hỏi chủ nhà khi bóc tách Haiku bỏ sót — cùng hàm ghi, cùng chống
trùng của đường cũ. Bóc tách ô (Haiku) và các việc ghi khác giữ nguyên đường cũ có cổng kiểm. Có trần: tối đa `MAX_VONG` lần gọi model, ngừng tra sau `HAN_GIAY` giây; hết trần mà
chưa có lời thì viết lời thường kèm kết quả đã tra. Công tắc `AIOI_AGENT_MUA` (một nguồn ở `bot/bridge-zca/cai-vps.sh` dòng AGENT_MUA):
"bat" = mọi khách, "thu" = chỉ ID thử, khác = tắt."""
from __future__ import annotations

import copy
import logging
import os
import time
from typing import Any

from . import du_an_mua
from .mua import co_tieu_chi, dong_can

log = logging.getLogger(__name__)

MAX_VONG = 3        # lần gọi model tối đa trong một lượt (2 lượt tra + lời cuối)
HAN_GIAY = 25.0     # quá chừng này giây thì không tra thêm (trần lõi 40 s, bridge chờ 90 s)
TRAN_KET_QUA = 3000

HUONG_DAN = (
    "\n\n=== CÔNG CỤ TRA KHO (chỉ ĐỌC) ===\n"
    "Em có công cụ tra kho thật của hệ thống. Tự quyết có cần tra không: điều đã có ở các khối dưới thì trả lời luôn, KHÔNG tra lại.\n"
    "- tim_can: khách đổi / thêm tiêu chí (khu, giá, loại, phòng ngủ, diện tích) mà khối CĂN ĐANG RAO chưa theo kịp, hoặc khách muốn xem lựa "
    "chọn khác.\n"
    "- xem_can: khách hỏi chi tiết một căn (theo mã trong link đã gửi) mà dòng căn ở dưới chưa có.\n"
    "- tra_du_an / du_an_trong_khu: khách hỏi về một dự án, hoặc khu nào có dự án gì, mà khối dự án ở dưới chưa có.\n"
    "Tra tối đa 2 lần. Chỉ nói điều kết quả tra ghi; tra không ra thì nói thật là chưa có. Vẫn giới thiệu MỘT căn mỗi lượt như luật ở trên.\n"
    "- hen_xem / hoi_chu_nha (GHI thật) khi khối EM VỪA GHI LƯỢT NÀY CHƯA có việc đó: khách đề nghị giờ / ngày đi xem một căn đã rõ → hen_xem "
    "NGAY; khách hỏi điều về căn mà dòng của căn KHÔNG có câu trả lời (sổ, nội thất, bớt giá, vào ở khi nào…) → hoi_chu_nha NGAY với câu viết "
    "rõ theo ý khách — khách hỏi tức là muốn biết, KHÔNG hỏi lại khách \"có muốn em hỏi chủ nhà không\". Căn chưa rõ là căn nào hoặc khách chưa "
    "nói giờ thì KHÔNG gọi — hỏi lại khách.\n"
    "Chỉ nói đã ghi / đã chuyển chủ nhà khi khối EM VỪA GHI LƯỢT NÀY có việc đó HOẶC kết quả hen_xem / hoi_chu_nha báo ĐÃ GHI (kết quả công cụ "
    "thắng câu 'lượt này em chưa ghi việc gì'). Lời gửi khách viết ở lượt cuối, sau khi tra / ghi xong; không viết 'để em tra / em kiểm tra'.\n"
)

CONG_CU: list[dict[str, Any]] = [
    {
        "name": "tim_can",
        "description": "Tìm căn ĐANG RAO hợp tiêu chí (bỏ căn khách đã chê, mỗi nhà một tin). Ô nào không đưa thì dùng nhu cầu đã ghi của khách. "
                       "Cần có khu vực và ngân sách.",
        "input_schema": {
            "type": "object",
            "properties": {
                "khu_vuc": {"type": "string", "description": "Quận / phường / đường / dự án"},
                "loai_bds": {"type": "string", "description": "nha_pho, chung_cu, dat_tho_cu, biet_thu…"},
                "ngan_sach": {"type": "string", "description": "Ngân sách theo lời khách (vd \"dưới 6 tỷ\")"},
                "ngan_sach_tu": {"type": "string", "description": "Mức thấp nhất, một số kèm đơn vị (\"8 tỷ\")"},
                "ngan_sach_den": {"type": "string", "description": "Mức cao nhất, một số kèm đơn vị (\"6 tỷ\")"},
                "so_phong_ngu": {"type": "string"},
                "dien_tich_tu": {"type": "string", "description": "Chỉ con số m²"},
                "dien_tich_den": {"type": "string", "description": "Chỉ con số m²"},
                "loai_giao_dich": {"type": "string", "enum": ["mua", "thue"]},
            },
        },
    },
    {
        "name": "xem_can",
        "description": "Dòng thông tin đầy đủ của căn đang hiện theo mã (giá, diện tích, pháp lý, kết cấu, phần chung dự án / mẫu nhà).",
        "input_schema": {
            "type": "object",
            "properties": {"ma": {"type": "array", "items": {"type": "string"}, "maxItems": 3, "description": "Mã căn, vd ABCD1234"}},
            "required": ["ma"],
        },
    },
    {
        "name": "hen_xem",
        "description": "GHI lịch hẹn khách đi xem MỘT căn đang hiện (chờ chủ nhà xác nhận rồi báo khách). Chỉ khi khách đã nói muốn xem và giờ / ngày.",
        "input_schema": {
            "type": "object",
            "properties": {"ma": {"type": "string", "description": "Mã căn, vd ABCD1234"},
                           "gio": {"type": "string", "description": "Giờ / ngày khách hẹn, viết rõ (vd \"3h chiều thứ 7\")"}},
            "required": ["ma", "gio"],
        },
    },
    {
        "name": "hoi_chu_nha",
        "description": "GHI câu khách mua muốn hỏi chủ nhà về MỘT căn đang hiện (chủ nhà trả lời thì hệ thống báo lại khách).",
        "input_schema": {
            "type": "object",
            "properties": {"ma": {"type": "string", "description": "Mã căn, vd ABCD1234"},
                           "cau_hoi": {"type": "string", "description": "Câu hỏi gửi chủ nhà, viết rõ theo ý khách"}},
            "required": ["ma", "cau_hoi"],
        },
    },
    {
        "name": "tra_du_an",
        "description": "Thông tin một dự án trong kho (chủ đầu tư, pháp lý, tiện ích, mẫu nhà) và các căn đang rao trong dự án đó.",
        "input_schema": {"type": "object", "properties": {"ten": {"type": "string"}}, "required": ["ten"]},
    },
    {
        "name": "du_an_trong_khu",
        "description": "Các dự án trong kho ở một quận / phường, kèm số căn đang rao.",
        "input_schema": {"type": "object", "properties": {"khu": {"type": "string"}}, "required": ["khu"]},
    },
]


def bat(user_key: str, la_id_thu: bool) -> bool:
    v = os.environ.get("AIOI_AGENT_MUA", "").strip().lower()
    return v == "bat" or (v == "thu" and la_id_thu)


def _chu(x: Any, n: int = 80) -> str:
    return str(x or "").strip()[:n]


def _dong(engine: Any, can: list[dict]) -> str:
    engine._gan_ke_thua(can)
    return "\n".join("- " + dong_can(c) for c in can)


def chay_cong_cu(engine: Any, conv: Any, ten: str, inp: dict, gom: list[dict]) -> str:
    """Chạy MỘT công cụ chỉ đọc; căn tra được gom vào `gom` (để các lưới soát số / ảnh của lượt biết căn đó). Lỗi → câu nói thật, không ném."""
    kho = engine._convstore
    try:
        if ten == "tim_can":
            if conv.buyer_lead is None or getattr(kho, "can_phu_hop", None) is None:
                return "Không tra được căn lúc này."
            lead = copy.deepcopy(conv.buyer_lead)
            if _chu(inp.get("ngan_sach")) and not (_chu(inp.get("ngan_sach_tu")) or _chu(inp.get("ngan_sach_den"))):
                lead.fields.pop("ngan_sach_tu", None)   # ngân sách mới nói bằng một câu → sàn / trần cũ không còn đúng
                lead.fields.pop("ngan_sach_den", None)
            lead.update({k: _chu(v) for k, v in inp.items() if k in CONG_CU[0]["input_schema"]["properties"] and _chu(v)})
            if not co_tieu_chi(lead):
                return "Chưa đủ khu vực và ngân sách để tìm — hỏi khách phần còn thiếu, chưa giới thiệu căn."
            lay = getattr(kho, "can_khong_hop", None)
            can = kho.can_phu_hop(lead, loai_tru=lay(conv.user_key) if lay is not None else None)
            gom.extend(can)
            return ("CĂN ĐANG RAO hợp tiêu chí vừa tra:\n" + _dong(engine, can)) if can else "Không có căn đang rao nào hợp tiêu chí này."
        if ten == "xem_can":
            ma = [_chu(m, 20).lstrip("#") for m in (inp.get("ma") or []) if _chu(m)][:3]
            can = kho.can_theo_ma(ma) if ma and getattr(kho, "can_theo_ma", None) is not None else []
            gom.extend(can)
            return _dong(engine, can) if can else "Không có căn nào đang hiện với mã đó (có thể đã bán / ẩn)."
        if ten in ("hen_xem", "hoi_chu_nha"):
            return _ghi_viec(engine, conv, ten, inp, gom)
        if ten == "tra_du_an":
            t = _chu(inp.get("ten"))
            if not t or getattr(kho, "tra_du_an", None) is None:
                return "Thiếu tên dự án."
            nghia = getattr(engine._dia_danh, "du_an_theo_nghia", None)
            kq = kho.tra_du_an(t, theo_nghia=nghia) if nghia else kho.tra_du_an(t)
            ra = du_an_mua.khoi_du_an(kq)
            if kq.get("khop") in ("ro", "gan") and isinstance(kq.get("du_an"), dict) and getattr(kho, "can_trong_du_an", None) is not None:
                thue = getattr(conv.buyer_lead, "loai_giao_dich", "mua") == "thue"
                can = kho.can_trong_du_an(str(kq["du_an"].get("id") or ""), thue=thue)
                gom.extend(can)
                engine._gan_ke_thua(can)
                ra += du_an_mua.khoi_can_du_an({**kq, "can": can})
            return ra.strip() or "Kho chưa có dự án tên này."
        if ten == "du_an_trong_khu":
            khu = _chu(inp.get("khu"))
            if not khu or getattr(kho, "du_an_theo_khu", None) is None:
                return "Thiếu tên khu."
            return du_an_mua.khoi_du_an_khu({"khu": khu, "ds": kho.du_an_theo_khu(khu)}).strip() or "Kho chưa có dự án ở khu này."
    except Exception as e:  # noqa: BLE001 — tra lỗi thì nói thật, lượt vẫn trả lời
        log.warning("Agent mua: công cụ %s lỗi: %s", ten, type(e).__name__)
        return "Tra kho lỗi — nói thật là em chưa tra được, không đoán."
    return "Không rõ công cụ."


def _ghi_viec(engine: Any, conv: Any, ten: str, inp: dict, gom: list[dict]) -> str:
    """Việc GHI của vòng agent (SRS-5.1zzzzzzz292): bóc tách Haiku bỏ sót hẹn xem / câu hỏi chủ nhà thì Sonnet ghi được — CÙNG hàm ghi của đường
    cũ (`ghi_hen_xem` gộp giờ, `ghi_hoi_chu_nha` không tạo câu trùng đang chờ), chỉ căn đang hiện, căn lượt này đã ghi thì không ghi lại."""
    kho = engine._convstore
    hen = ten == "hen_xem"
    ma = _chu(inp.get("ma"), 20).lstrip("#").upper()
    noi = _chu(inp.get("gio") if hen else inp.get("cau_hoi"), 300)
    if not ma or not noi:
        return "Chưa ghi: thiếu mã căn hoặc " + ("giờ hẹn" if hen else "câu hỏi") + " — hỏi lại khách, KHÔNG nói đã ghi."
    can = kho.can_theo_ma([ma]) if getattr(kho, "can_theo_ma", None) is not None else []
    if not can:
        return "Chưa ghi: không có căn đang hiện với mã đó — KHÔNG nói đã ghi."
    c = can[0]
    gom.append(c)
    da = conv.y_luot.setdefault(f"_da_ghi_{ten}", set())
    if c.get("id") in da:
        return "Việc này đã ghi ở lượt này rồi (xem khối EM VỪA GHI) — không ghi lại."
    bid = kho.khach_mua(conv.user_key) if getattr(kho, "khach_mua", None) is not None else None
    ok = bool(bid) and (kho.ghi_hen_xem(bid, c, noi) if hen else kho.ghi_hoi_chu_nha(bid, c, noi))
    if not ok:
        return "Chưa ghi được (lỗi kho) — nói thật là em chưa ghi được, KHÔNG nói đã ghi."
    da.add(c.get("id"))
    kho.ghi_quan_tam(bid, [str(c.get("code"))])
    log.warning("Agent mua: ghi %s qua công cụ (bóc tách không đọc ra)", ten)
    if not hen:
        return f"ĐÃ GHI: chuyển câu \"{noi}\" về căn #{c.get('code')} cho chủ nhà — có trả lời em báo lại khách ngay."
    ra = f"ĐÃ GHI: lịch hẹn xem căn #{c.get('code')} ({noi}) — chờ xác nhận với chủ nhà rồi báo lại khách."
    lead = conv.buyer_lead
    if lead is not None and not lead.fields.get("_da_xin_sdt"):   # xin số MỘT lần khi chốt lịch (SRS-148), cùng cờ với đường cũ
        lead.fields["_da_xin_sdt"] = "1"
        ra += (" Xin khách MỘT số điện thoại để người phụ trách gọi xác nhận lịch (câu hỏi DUY NHẤT của lượt; khách không muốn thì thôi).")
    return ra


def chay(engine: Any, conv: Any, system: str, max_tokens: int) -> tuple[str, list[dict]]:
    """Một lượt trả lời có công cụ. Trả (lời gửi khách, các căn công cụ đã tra). Hết trần mà model chưa viết lời → `reply` thường kèm kết quả tra."""
    from .llm.base import RANH_GIOI_CACHE
    he = system.replace(RANH_GIOI_CACHE, HUONG_DAN + RANH_GIOI_CACHE, 1) if RANH_GIOI_CACHE in system else system + HUONG_DAN
    tin: list[dict] = [{"role": m.role, "content": m.content} for m in conv.messages()]
    gom: list[dict] = []
    ket: list[str] = []
    da_goi: list[str] = []
    loi = ""
    bat_dau = time.monotonic()
    for vong in range(MAX_VONG):
        turn = engine._provider.converse(he, tin, CONG_CU, max_tokens=max_tokens)
        if not turn.tool_calls:
            loi = (turn.text or "").strip()   # lời cuối — chữ ở lượt có gọi công cụ ("để em xem") KHÔNG gửi khách
            break
        if vong == MAX_VONG - 1 or time.monotonic() - bat_dau > HAN_GIAY:
            break
        tin.append({"role": "assistant", "content": turn.assistant_content})
        kq = []
        for c in turn.tool_calls:
            da_goi.append(c.name)
            r = chay_cong_cu(engine, conv, c.name, dict(c.input or {}), gom)[:TRAN_KET_QUA]
            ket.append(f"[{c.name}] {r}")
            kq.append({"type": "tool_result", "tool_use_id": c.id, "content": r})
        tin.append({"role": "user", "content": kq})
    if not loi:
        them = ("\n\n=== KẾT QUẢ EM VỪA TRA KHO (hệ thống tra, không phải khách nói) ===\n" + "\n".join(ket) + "\n") if ket else ""
        loi = engine._provider.reply(system + them, conv.messages(), max_tokens=max_tokens).strip()
    # Một dòng mỗi lượt để đo vòng / độ trễ (không in lời khách, không in kết quả tra).
    log.warning("Agent mua: công_cụ=%s căn_tra=%d giây=%.1f", ",".join(da_goi) or "-", len(gom), time.monotonic() - bat_dau)
    return loi, gom
